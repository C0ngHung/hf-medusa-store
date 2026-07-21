/**
 * EC-08 (SRS §8) — real-workflow integration: a cart item add (the same
 * `addToCartWorkflow` path a suggested-item one-tap-add uses, see
 * `add-suggested-item.spec.ts`) pushes the cart subtotal past a native
 * automatic Promotion's tier threshold. The new tier promotion must apply as
 * an item-level discount, then `revalidateVoucherOnCartChange` must
 * recompute the voucher on the NEW post-promotion subtotal and re-check the
 * global cap — not just re-check eligibility.
 *
 * Previously only demoed manually via `src/scripts/seed-tier-promo.ts` — no
 * automated test combined a real tier-crossing Promotion + an active voucher
 * + the global cap together (verified by search before writing this file).
 *
 * Mirrors the exact automatic-Promotion shape from `seed-tier-promo.ts`
 * (is_automatic, target_type "order", item_total >= threshold rule).
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import {
  addToCartWorkflow,
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  createSalesChannelsWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows";
import { VOUCHER_ENGINE_MODULE } from "../../src/modules/voucher-engine";
import type VoucherEngineService from "../../src/modules/voucher-engine/service";
import { applyVoucherWorkflow } from "../../src/workflows/voucher-engine/apply-voucher";
import { VOUCHER_METADATA_KEY } from "../../src/workflows/voucher-engine/lib/voucher-cart-metadata";

jest.setTimeout(60_000);
// Known infra flake (not an assertion failure) — see
// .claude/lessons/voucher-engine/2026-07-14-redis-bullmq-teardown-race.md.
jest.retryTimes(2);

const THRESHOLD_VND = 5_000_000;
const TIER_PERCENT_OFF = 5;

async function waitFor(
  fn: () => Promise<boolean>,
  { timeout = 8000, interval = 150 } = {},
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return fn();
}

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("EC-08 — suggested-item add crosses a Promotion tier, voucher recomputes on the new subtotal", () => {
      function container() {
        return getContainer();
      }

      let salesChannelId: string;
      let stockLocationId: string;

      beforeEach(async () => {
        const {
          result: [salesChannel],
        } = await createSalesChannelsWorkflow(container()).run({
          input: { salesChannelsData: [{ name: "EC-08 Test Channel" }] },
        });
        salesChannelId = salesChannel.id;

        const {
          result: [apiKey],
        } = await createApiKeysWorkflow(container()).run({
          input: {
            api_keys: [
              { title: "EC-08 Test Key", type: "publishable", created_by: "" },
            ],
          },
        });
        await linkSalesChannelsToApiKeyWorkflow(container()).run({
          input: { id: apiKey.id, add: [salesChannelId] },
        });

        const {
          result: [stockLocation],
        } = await createStockLocationsWorkflow(container()).run({
          input: {
            locations: [
              {
                name: "EC-08 Warehouse",
                address: {
                  city: "Ho Chi Minh City",
                  country_code: "VN",
                  address_1: "",
                },
              },
            ],
          },
        });
        stockLocationId = stockLocation.id;
        await linkSalesChannelsToStockLocationWorkflow(container()).run({
          input: { id: stockLocationId, add: [salesChannelId] },
        });
      });

      async function createStockedVariant(
        title: string,
        priceVnd: number,
      ): Promise<string> {
        const {
          result: [product],
        } = await createProductsWorkflow(container()).run({
          input: {
            products: [
              {
                title,
                status: "published" as const,
                options: [{ title: "Size", values: ["One Size"] }],
                variants: [
                  {
                    title: "One Size",
                    manage_inventory: true,
                    options: { Size: "One Size" },
                    prices: [{ amount: priceVnd, currency_code: "vnd" }],
                  },
                ],
                sales_channels: [{ id: salesChannelId }],
              },
            ],
          },
        });
        const variantId = (product.variants as { id: string }[])[0].id;

        const query = container().resolve("query") as {
          graph: (args: unknown) => Promise<{ data: { id: string }[] }>;
        };
        const { data: inventoryItems } = await query.graph({
          entity: "product_variant",
          filters: { id: variantId },
          fields: ["inventory_items.inventory_item_id"],
        });
        const inventoryItemId = (
          inventoryItems[0] as unknown as {
            inventory_items: { inventory_item_id: string }[];
          }
        ).inventory_items[0].inventory_item_id;

        await createInventoryLevelsWorkflow(container()).run({
          input: {
            inventory_levels: [
              {
                location_id: stockLocationId,
                inventory_item_id: inventoryItemId,
                stocked_quantity: 10,
              },
            ],
          },
        });

        return variantId;
      }

      it("applies the new tier promotion + recomputes the voucher on the new post-promo subtotal + re-checks the global cap (SRS §8 EC-08)", async () => {
        const racketVariantId = await createStockedVariant("Racket", 4_000_000);
        const stringVariantId = await createStockedVariant("String", 1_500_000);

        const cartModuleService = container().resolve(Modules.CART);
        // Racket is created directly on the cart (raw module call, no
        // `cart.updated` emitted) — it only needs to exist before the voucher
        // is applied; the real workflow path is exercised below for the item
        // that actually crosses the tier, which is what EC-08 is about.
        // (Using addToCartWorkflow here too would race the fire-and-forget
        // `cart.updated` subscriber's own revalidate call against the
        // `applyVoucherWorkflow` call right after, both fighting over the
        // same `voucher:cart:{id}` lock — a real but EC-04-shaped hazard,
        // not what this test is verifying.)
        const cart = (await cartModuleService.createCarts({
          currency_code: "vnd",
          sales_channel_id: salesChannelId,
          items: [
            {
              title: "Racket",
              unit_price: 4_000_000,
              quantity: 1,
              variant_id: racketVariantId,
            },
          ],
        } as never)) as unknown as { id: string };

        // 2. Apply an unscoped, uncapped 10% voucher. Below the tier, no item
        //    promotion exists yet, so the voucher discount is 10% of 4,000,000.
        const service = container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        await service.createVoucherConfigs({
          code: "TIER10",
          discount_type: "percentage",
          discount_value: 1000, // 10%
          valid_from: new Date("2020-01-01T00:00:00Z"),
          valid_to: new Date("2999-01-01T00:00:00Z"),
        } as never);
        await applyVoucherWorkflow(container()).run({
          input: { cart_id: cart.id, code: "TIER10", customer_id: null },
        });

        const afterFirstApply = await cartModuleService.retrieveCart(cart.id, {
          select: ["id", "total"],
          relations: ["credit_lines"],
        });
        expect(
          Number((afterFirstApply as never as { total: unknown }).total),
        ).toBe(
          3_600_000, // 4,000,000 - 400,000 (10%)
        );

        // 3. Seed the automatic "spend 5,000,000 -> 5% off order" tier
        //    Promotion (exact shape as src/scripts/seed-tier-promo.ts) — NOT
        //    yet crossed (cart is still 4,000,000).
        const promotionModule = container().resolve(Modules.PROMOTION);
        await promotionModule.createPromotions({
          code: "TIER5M5",
          type: "standard",
          status: "active",
          is_automatic: true,
          application_method: {
            type: "percentage",
            target_type: "order",
            value: TIER_PERCENT_OFF,
            currency_code: "vnd",
          },
          rules: [
            {
              attribute: "item_total",
              operator: "gte",
              values: [String(THRESHOLD_VND)],
            },
          ],
        } as never);

        // 4. Add the "String" (the suggested item) via the same real
        //    add-to-cart workflow -> new subtotal 5,500,000, crossing the
        //    5,000,000 tier -> the automatic Promotion must now auto-apply.
        await addToCartWorkflow(container()).run({
          input: {
            cart_id: cart.id,
            items: [{ variant_id: stringVariantId, quantity: 1 }],
          } as never,
        });

        // 5. Do NOT call revalidateVoucherWorkflow directly — wait for the
        //    REAL cart.updated -> subscriber -> revalidate path (the actual
        //    production mechanism EC-08 describes) to settle.
        async function readVoucherSnapshot() {
          const c = await cartModuleService.retrieveCart(cart.id, {
            select: ["id", "total", "metadata"],
            relations: ["items", "items.adjustments", "credit_lines"],
          });
          const metadata = (
            c as never as { metadata: Record<string, unknown> | null }
          ).metadata;
          const snapshot = metadata?.[VOUCHER_METADATA_KEY] as
            | { discount_amount: number; discount_capped: boolean }
            | undefined;
          return { cart: c, snapshot };
        }

        await waitFor(async () => {
          const { snapshot } = await readVoucherSnapshot();
          return snapshot?.discount_amount === 522_500;
        });

        const { cart: finalCart, snapshot: voucherSnapshot } =
          await readVoucherSnapshot();
        const items = (
          finalCart as never as {
            items: { adjustments?: { amount: unknown }[] }[];
          }
        ).items;
        const itemPromotionDiscount = items
          .flatMap((i) => i.adjustments ?? [])
          .reduce((sum, adj) => sum + Number(adj.amount), 0);

        // Tier promotion fired: 5% of the new 5,500,000 subtotal = 275,000.
        expect(itemPromotionDiscount).toBe(275_000);

        // Voucher recomputed on the NEW post-promo subtotal (5,500,000 -
        // 275,000 = 5,225,000), not the stale 3,600,000: 10% of 5,225,000 =
        // 522,500. Well under the 50% global cap (2,750,000), so uncapped.
        expect(voucherSnapshot?.discount_amount).toBe(522_500);
        expect(voucherSnapshot?.discount_capped).toBe(false);

        // Cart total nets both: 5,500,000 - 275,000 - 522,500 = 4,702,500.
        expect(Number((finalCart as never as { total: unknown }).total)).toBe(
          4_702_500,
        );
      });
    });
  },
});
