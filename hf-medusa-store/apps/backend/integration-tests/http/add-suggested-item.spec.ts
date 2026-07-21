/**
 * POST /store/carts/:id/suggested-items — REAL HTTP integration (SUGG-003,
 * API Contract §1.1; SRS §8 EC-07, EC-09).
 *
 * Previously this route/workflow had ZERO automated test coverage (verified by
 * repo-wide search before writing this file) — this suite adds it. Exercises
 * the actual route (not just the workflow directly), with a real product +
 * variant + stock location + inventory level, so addToCartWorkflow's
 * authoritative inventory-confirm step runs for real (SUGG-003's "stock is
 * re-checked at execution time, not from cache").
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  createSalesChannelsWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows";
import { SUGGESTIVE_SELLING_MODULE } from "../../src/modules/suggestive-selling";

jest.setTimeout(60_000);
// Known infra flake (not an assertion failure) — see
// .claude/lessons/voucher-engine/2026-07-14-redis-bullmq-teardown-race.md.
jest.retryTimes(2);

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("POST /store/carts/:id/suggested-items (real HTTP, SRS §8 EC-07)", () => {
      function container() {
        return getContainer();
      }

      let publishableKeyHeaders: { headers: Record<string, string> };
      let salesChannelId: string;
      let stockLocationId: string;

      // `beforeEach`, not `beforeAll`: medusaIntegrationTestRunner resets the
      // DB between tests in the same file (see apply-remove-voucher.spec.ts).
      beforeEach(async () => {
        const {
          result: [salesChannel],
        } = await createSalesChannelsWorkflow(container()).run({
          input: { salesChannelsData: [{ name: "Suggestion Test Channel" }] },
        });
        salesChannelId = salesChannel.id;

        const {
          result: [apiKey],
        } = await createApiKeysWorkflow(container()).run({
          input: {
            api_keys: [
              {
                title: "Suggestion Test Key",
                type: "publishable",
                created_by: "",
              },
            ],
          },
        });
        await linkSalesChannelsToApiKeyWorkflow(container()).run({
          input: { id: apiKey.id, add: [salesChannelId] },
        });
        publishableKeyHeaders = {
          headers: { "x-publishable-api-key": apiKey.token },
        };

        const {
          result: [stockLocation],
        } = await createStockLocationsWorkflow(container()).run({
          input: {
            locations: [
              {
                name: "Test Warehouse",
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

      async function createStockedProduct(
        stockedQuantity: number,
      ): Promise<{ productId: string; variantId: string }> {
        const {
          result: [product],
        } = await createProductsWorkflow(container()).run({
          input: {
            products: [
              {
                title: `Suggested Product (${stockedQuantity} in stock)`,
                status: "published" as const,
                options: [{ title: "Size", values: ["One Size"] }],
                variants: [
                  {
                    title: "One Size",
                    manage_inventory: true,
                    options: { Size: "One Size" },
                    prices: [{ amount: 100_000, currency_code: "vnd" }],
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
                stocked_quantity: stockedQuantity,
              },
            ],
          },
        });

        return { productId: product.id, variantId };
      }

      async function createCart(): Promise<{ id: string }> {
        const cartModuleService = container().resolve(Modules.CART);
        const cart = await cartModuleService.createCarts({
          currency_code: "vnd",
          sales_channel_id: salesChannelId,
        } as never);
        return (Array.isArray(cart) ? cart[0] : cart) as { id: string };
      }

      it("adds the suggested item when it is in stock (baseline — previously untested)", async () => {
        const { productId } = await createStockedProduct(10);
        const cart = await createCart();

        const { status, data } = await api.post(
          `/store/carts/${cart.id}/suggested-items`,
          {
            product_id: productId,
            attribution: { source_context: "product_view" },
          },
          publishableKeyHeaders,
        );

        expect(status).toBe(200);
        expect(data.line_item).not.toBeNull();
        expect(data.line_item.quantity).toBe(1);
        expect(data.is_idempotent_replay).toBe(false);
      });

      it("returns 409 SUGGESTION_STOCK_CONFLICT when the suggested product is out of stock at add time (SRS §8 EC-07)", async () => {
        const { productId } = await createStockedProduct(0);
        const cart = await createCart();

        await expect(
          api.post(
            `/store/carts/${cart.id}/suggested-items`,
            {
              product_id: productId,
              attribution: { source_context: "product_view" },
            },
            publishableKeyHeaders,
          ),
        ).rejects.toMatchObject({
          response: {
            status: 409,
            data: { code: "SUGGESTION_STOCK_CONFLICT" },
          },
        });
      });

      it("still adds the product when its attributed suggestion rule was deactivated after being shown — drops attribution, no error (SRS §8 EC-09)", async () => {
        const { productId } = await createStockedProduct(10);
        const cart = await createCart();

        const suggestiveService: {
          createSuggestionRules: (
            data: Record<string, unknown>,
          ) => Promise<{ id: string }>;
        } = container().resolve(SUGGESTIVE_SELLING_MODULE);
        const rule = await suggestiveService.createSuggestionRules({
          name: "EC-09 rule (deactivated before add)",
          type: "product",
          tier: "manual",
          is_active: false, // admin already deactivated it
        });

        const { status, data } = await api.post(
          `/store/carts/${cart.id}/suggested-items`,
          {
            product_id: productId,
            attribution: { source_context: "product_view", rule_id: rule.id },
          },
          publishableKeyHeaders,
        );

        // The product still exists -> add succeeds, no customer-facing error.
        expect(status).toBe(200);
        expect(data.line_item).not.toBeNull();
        // The now-invalid attribution is dropped, not surfaced as a failure.
        expect(data.line_item.metadata.suggestion_rule_id).toBeNull();
      });
    });
  },
});
