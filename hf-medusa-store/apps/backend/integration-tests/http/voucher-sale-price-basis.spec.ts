/**
 * Voucher calculation basis: Price List adjusted/sale line price (Rebuild
 * Phase 0 decisions 4-6, Phase 2 verification-only scope).
 *
 * Phase 0 confirmed: "item-level promotion" means the Price List sale price
 * from the Pricing Module, the voucher applies on that adjusted/sale line
 * price, and VoucherEngine must never alter the sale price itself.
 *
 * Verified against the installed 2.16.0 source (Phase 2 planning) that a
 * cart line item carries the sale/adjusted amount and the pre-sale reference
 * amount in two SEPARATE fields, populated once at add-to-cart time:
 *  - `unit_price` <- `variant.calculated_price.calculated_amount` (the actual
 *    charged/sale amount) — `@medusajs/core-flows/dist/cart/workflows/add-to-cart.js:181-182`.
 *  - `compare_at_unit_price` <- `variant.calculated_price.original_amount`,
 *    set only when `price_list_type === SALE` and the two amounts differ —
 *    `@medusajs/core-flows/dist/cart/utils/prepare-line-item-data.js:15-21,51-52`.
 *
 * This test does not re-exercise Medusa's own Price List -> calculated_price
 * resolution machinery (that's core Medusa's concern, not VoucherEngine's) —
 * it constructs a cart line with both fields already diverged, exactly as a
 * real sale-priced add-to-cart would produce them, and proves VoucherEngine's
 * OWN behavior against that framework guarantee:
 *   1. The voucher discount is computed against `unit_price` (sale), NOT
 *      `compare_at_unit_price` (list) — proves loadCartContextStep reads the
 *      correct field (Phase 2 planning finding: it already does).
 *   2. Applying the voucher never alters either price field on the line
 *      item — the discount is carried via a separate ephemeral Promotion
 *      adjustment, not by mutating the line's own price data (Phase 0
 *      decision 6).
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";
import { VOUCHER_ENGINE_MODULE } from "../../src/modules/voucher-engine";
import type VoucherEngineService from "../../src/modules/voucher-engine/service";

jest.setTimeout(60_000);
// Known infra flake (not an assertion failure) — see
// .claude/lessons/voucher-engine/2026-07-14-redis-bullmq-teardown-race.md.
jest.retryTimes(2);

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Voucher calculation basis: Price List adjusted/sale line price (Rebuild Phase 2)", () => {
      const FAR_PAST = new Date("2020-01-01T00:00:00Z");
      const FAR_FUTURE = new Date("2999-01-01T00:00:00Z");
      let publishableKeyHeaders: { headers: Record<string, string> };

      function container() {
        return getContainer();
      }

      beforeEach(async () => {
        const {
          result: [salesChannel],
        } = await createSalesChannelsWorkflow(container()).run({
          input: {
            salesChannelsData: [{ name: "Voucher Sale-Price Test Channel" }],
          },
        });
        const {
          result: [apiKey],
        } = await createApiKeysWorkflow(container()).run({
          input: {
            api_keys: [
              {
                title: "Voucher Sale-Price Test Key",
                type: "publishable",
                created_by: "",
              },
            ],
          },
        });
        await linkSalesChannelsToApiKeyWorkflow(container()).run({
          input: { id: apiKey.id, add: [salesChannel.id] },
        });
        publishableKeyHeaders = {
          headers: { "x-publishable-api-key": apiKey.token },
        };
      });

      async function createVoucher(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        overrides: Record<string, any>,
      ) {
        const service = container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        return service.createVoucherConfigs({
          valid_from: FAR_PAST,
          valid_to: FAR_FUTURE,
          ...overrides,
        } as any);
      }

      /**
       * Constructs a cart with a single line item shaped exactly like a real
       * Price-List sale-priced add-to-cart would produce: `unit_price` is the
       * sale amount, `compare_at_unit_price` is the diverged pre-sale
       * reference amount (see file header for the verified source mapping).
       */
      async function createCartWithSalePricedItem(params: {
        salePrice: number;
        listPrice: number;
        productId: string;
      }) {
        const cartModuleService = container().resolve(Modules.CART);
        const cart = await cartModuleService.createCarts({
          currency_code: "vnd",
          items: [
            {
              title: "Racket (on sale)",
              unit_price: params.salePrice,
              compare_at_unit_price: params.listPrice,
              quantity: 1,
              product_id: params.productId,
            },
          ],
        } as any);
        return (Array.isArray(cart) ? cart[0] : cart) as { id: string };
      }

      it("computes the voucher discount against the sale unit_price, not the pre-sale compare_at_unit_price", async () => {
        const cart = await createCartWithSalePricedItem({
          salePrice: 800_000,
          listPrice: 1_000_000,
          productId: "prod_racket_sale_basis",
        });
        await createVoucher({
          code: "SALEBASIS10",
          discount_type: "percentage",
          discount_value: 1000, // 10%
        });

        const { status, data } = await api.post(
          `/store/carts/${cart.id}/voucher`,
          { code: "SALEBASIS10" },
          publishableKeyHeaders,
        );

        expect(status).toBe(200);
        expect(data.success).toBe(true);
        // 10% of the SALE price (800,000), not the list price (1,000,000).
        // If loadCartContextStep ever regressed to reading compare_at_unit_price
        // (or summing both), this would instead compute 100,000 and fail here.
        expect(data.discount_amount).toBe(80_000);
        expect(data.discount_capped).toBe(false);
        expect(data.updated_cart_total).toBe(720_000);
      });

      it("never alters unit_price or compare_at_unit_price on the line item when applying a voucher (Phase 0 decision 6 — must not alter the sale price)", async () => {
        const cart = await createCartWithSalePricedItem({
          salePrice: 800_000,
          listPrice: 1_000_000,
          productId: "prod_racket_sale_basis_immutable",
        });
        await createVoucher({
          code: "SALEBASISIMMUTABLE",
          discount_type: "percentage",
          discount_value: 1000,
        });

        await api.post(
          `/store/carts/${cart.id}/voucher`,
          { code: "SALEBASISIMMUTABLE" },
          publishableKeyHeaders,
        );

        const cartModuleService = container().resolve(Modules.CART);
        const reloaded = await cartModuleService.retrieveCart(cart.id, {
          select: ["id"],
          relations: ["items"],
        });
        const line = (reloaded.items ?? [])[0] as unknown as {
          unit_price: unknown;
          compare_at_unit_price: unknown;
        };

        // The voucher's discount must be carried entirely via the ephemeral
        // Promotion's adjustment — the line's own price fields are untouched.
        expect(Number(line.unit_price)).toBe(800_000);
        expect(Number(line.compare_at_unit_price)).toBe(1_000_000);
      });
    });
  },
});
