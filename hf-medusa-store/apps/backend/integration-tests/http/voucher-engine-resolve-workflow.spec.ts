/**
 * VoucherEngine Day 2/3 integration — `resolveVoucherDiscountWorkflow` against a
 * REAL Cart, a REAL persisted `VoucherConfig`, and the REAL Medusa container
 * (`medusaIntegrationTestRunner` boots the full app on a disposable Postgres DB).
 *
 * No `/store/carts/:id/voucher` route exists yet (Day 4 — out of scope), so this
 * exercises the workflow directly rather than over HTTP; it lives under
 * `integration-tests/http/` because that is the only test bucket in this repo's
 * jest config that boots the full app container (`TEST_TYPE=integration:http`),
 * which `loadCartContextStep`'s `query.graph` cross-module read requires.
 *
 * Covers Phase-3 items 3-13: persisted scope -> eligibility, no-eligible-items
 * business failure, item-level Promotion excluding VoucherEngine's own
 * adjustment (Rule 11), original subtotal from a real seeded cart, and the
 * resolved global cap flowing into the calculation.
 */
import {
  createPromotionsWorkflow,
  updateCartPromotionsWorkflow,
} from "@medusajs/core-flows";
import { Modules, PromotionActions } from "@medusajs/framework/utils";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { VOUCHER_ENGINE_MODULE } from "../../src/modules/voucher-engine";
import type VoucherEngineService from "../../src/modules/voucher-engine/service";
import { resolveVoucherDiscountWorkflow } from "../../src/workflows/voucher-engine/resolve-voucher-discount";

jest.setTimeout(60_000);
// Known infra flake (not an assertion failure): when several heavy full-app
// tests run sequentially in this file, ioredis/bullmq occasionally logs an
// "Unhandled error. (Error: Connection is closed.)" during Jest's
// `--forceExit` teardown between tests, which jest-circus surfaces as a test
// failure even though every assertion passed. Every test here passes in
// isolation. Retrying absorbs the teardown race without masking a real
// assertion failure (a genuinely broken assertion fails identically on retry).
jest.retryTimes(2);

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("resolveVoucherDiscountWorkflow (real Cart + real VoucherEngine, task 3.3.x/3.8.x)", () => {
      const FAR_PAST = new Date("2020-01-01T00:00:00Z");
      const FAR_FUTURE = new Date("2999-01-01T00:00:00Z");

      function container() {
        return getContainer();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async function createCart(items: any[]): Promise<{ id: string }> {
        const cartModuleService = container().resolve(Modules.CART);
        const cart = await cartModuleService.createCarts({
          currency_code: "vnd",
          items,
        } as any);
        return (Array.isArray(cart) ? cart[0] : cart) as { id: string };
      }

      async function createVoucher(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        overrides: Record<string, any>,
      ): Promise<{ id: string }> {
        const service = container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        return service.createVoucherConfigs({
          valid_from: FAR_PAST,
          valid_to: FAR_FUTURE,
          ...overrides,
        } as any) as unknown as Promise<{ id: string }>;
      }

      it("computes the original subtotal from a REAL seeded cart and an uncapped percentage discount (task 3.3.2/3.3.6)", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 4_500_000,
            quantity: 1,
            product_id: "prod_racket",
          },
          { title: "String", unit_price: 200_000, quantity: 1 },
        ]);
        await createVoucher({
          code: "SHUTTLE20AA",
          discount_type: "percentage",
          discount_value: 2000, // 20%
        });

        const { result, errors } = await resolveVoucherDiscountWorkflow(
          container(),
        ).run({
          input: {
            cart_id: cart.id,
            code: "SHUTTLE20AA",
            customer_id: "cus_1",
          },
          throwOnError: false,
        });

        expect(errors).toEqual([]);
        expect(result.discount.original_subtotal).toBe(4_700_000);
        expect(result.discount.item_promotion_discount).toBe(0);
        expect(result.discount.eligible_post_promotion_subtotal).toBe(
          4_700_000,
        );
        expect(result.discount.final_voucher_discount).toBe(940_000);
        expect(result.discount.expected_final_cart_total).toBe(3_760_000);
        expect(result.discount.discount_capped).toBe(false);
      });

      it("V6 no eligible items in a product-scoped voucher -> VOUCHER_NO_ELIGIBLE_ITEMS business failure (Phase-3 item 6)", async () => {
        const cart = await createCart([
          {
            title: "Grip",
            unit_price: 50_000,
            quantity: 1,
            product_id: "prod_grip",
          },
        ]);
        await createVoucher({
          code: "RACKETONLYBB",
          discount_type: "percentage",
          discount_value: 1000,
          applicable_product_ids: ["prod_racket_other"],
        });

        const { errors } = await resolveVoucherDiscountWorkflow(
          container(),
        ).run({
          input: {
            cart_id: cart.id,
            code: "RACKETONLYBB",
            customer_id: "cus_1",
          },
          throwOnError: false,
        });

        expect(errors).toHaveLength(1);
        expect(errors[0].error.code).toBe("VOUCHER_NO_ELIGIBLE_ITEMS");
        expect(errors[0].error.http_status).toBe(422);
      });

      it("a mixed product+category scope is eligible via either match (mixed scope, task 3.3.5)", async () => {
        const cart = await createCart([
          {
            title: "Shuttlecock tube",
            unit_price: 150_000,
            quantity: 2,
            product_id: "prod_shuttle",
          },
        ]);
        await createVoucher({
          code: "MIXEDSCOPECC",
          discount_type: "percentage",
          discount_value: 1000,
          // Neither array alone matches the cart's product_id — only the
          // (irrelevant) product entry does; category array is unrelated.
          applicable_product_ids: ["prod_shuttle", "prod_racket"],
          applicable_category_ids: ["cat_unrelated"],
        });

        const { result, errors } = await resolveVoucherDiscountWorkflow(
          container(),
        ).run({
          input: {
            cart_id: cart.id,
            code: "MIXEDSCOPECC",
            customer_id: "cus_1",
          },
          throwOnError: false,
        });

        expect(errors).toEqual([]);
        expect(result.discount.eligible_post_promotion_subtotal).toBe(300_000);
      });

      it("counts ALL cart promotion adjustments as item_promotion_discount — the voucher carrier is a credit line, not an adjustment (Rule 11, credit-line carrier)", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 1_000_000,
            quantity: 1,
            product_id: "prod_racket",
            adjustments: [
              {
                code: "ITEMPROMO",
                amount: 100_000,
                promotion_id: "promo_item",
              },
              {
                code: "ITEMPROMO2",
                amount: 50_000,
                promotion_id: "promo_item_2",
              },
            ],
          },
        ]);
        await createVoucher({
          code: "MIXEDPROMODD",
          discount_type: "percentage",
          discount_value: 1000,
        });

        const { result, errors } = await resolveVoucherDiscountWorkflow(
          container(),
        ).run({
          input: {
            cart_id: cart.id,
            code: "MIXEDPROMODD",
            customer_id: "cus_1",
          },
          throwOnError: false,
        });

        expect(errors).toEqual([]);
        // Under the Option-B carrier the voucher is a `cart.credit_lines` entry,
        // never an adjustment, so EVERY adjustment on the cart is an item-level
        // promotion — nothing is excluded (100,000 + 50,000).
        expect(result.discount.item_promotion_discount).toBe(150_000);
        expect(result.discount.post_promotion_subtotal).toBe(850_000);
      });

      it("resolves the active custom DiscountCapConfig into the calculation (task 3.3.10)", async () => {
        const service = container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        await service.createDiscountCapConfigs({
          max_discount_percentage: 1000, // 10% custom cap, not the 5000 default
          is_active: true,
        });

        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 1_000_000,
            quantity: 1,
            product_id: "prod_racket",
          },
        ]);
        await createVoucher({
          code: "BIGDISCOUNTEE",
          discount_type: "percentage",
          discount_value: 5000, // 50% -> raw 500,000, but 10% global cap = 100,000
        });

        const { result, errors } = await resolveVoucherDiscountWorkflow(
          container(),
        ).run({
          input: {
            cart_id: cart.id,
            code: "BIGDISCOUNTEE",
            customer_id: "cus_1",
          },
          throwOnError: false,
        });

        expect(errors).toEqual([]);
        expect(result.discount.maximum_combined_discount).toBe(100_000);
        expect(result.discount.final_voucher_discount).toBe(100_000);
        expect(result.discount.discount_capped).toBe(true);
        expect(result.discount.cap_explanation?.message_vi).toContain("10%");
      });

      it("reads a REAL attached percentage item Promotion as item_promotion_discount and stacks the voucher on top (credit-line carrier)", async () => {
        // A coexisting item-level percentage Promotion is a real cart
        // adjustment. Under the Option-B carrier the voucher rides a credit
        // line (not an adjustment), so this attached promotion is counted as
        // `item_promotion_discount` and the voucher applies to the eligible
        // POST-promotion subtotal on top of it (Rule 5/6/11). Full
        // credit-line reconciliation (verifyCartTotalsStep) is exercised
        // end-to-end by the apply/remove HTTP spec, which actually creates the
        // credit line.
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 1_000_000,
            quantity: 1,
            product_id: "prod_racket",
          },
        ]);
        await createVoucher({
          code: "VOUCHERONTOP",
          discount_type: "percentage",
          discount_value: 1000, // 10%, well under the 50% default cap
        });

        await createPromotionsWorkflow(container()).run({
          input: {
            promotionsData: [
              {
                code: "ITEMPROMO10",
                type: "standard",
                status: "active",
                application_method: {
                  type: "percentage",
                  target_type: "items",
                  allocation: "across",
                  value: 10,
                  currency_code: "vnd",
                },
              },
            ],
          },
        });

        await updateCartPromotionsWorkflow(container()).run({
          input: {
            cart_id: cart.id,
            promo_codes: ["ITEMPROMO10"],
            action: PromotionActions.ADD,
          },
        });

        const { result, errors } = await resolveVoucherDiscountWorkflow(
          container(),
        ).run({
          input: {
            cart_id: cart.id,
            code: "VOUCHERONTOP",
            customer_id: "cus_1",
          },
          throwOnError: false,
        });

        expect(errors).toEqual([]);
        // The attached 10% item promotion is a real 100,000 adjustment, counted
        // as item_promotion_discount (the voucher is not an adjustment).
        expect(result.discount.item_promotion_discount).toBe(100_000);
        // Voucher 10% of the eligible post-promotion subtotal (900,000) = 90,000.
        expect(result.discount.final_voucher_discount).toBe(90_000);
        expect(result.discount.expected_final_cart_total).toBe(810_000);
      });
    });
  },
});
