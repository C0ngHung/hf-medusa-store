/**
 * lookupVoucherStep <- hydrateVoucherFromPromotion — REAL end-to-end coverage
 * of the Task 2 / Decision I seam (`src/workflows/voucher-engine/steps/lookup-voucher.ts`).
 *
 * Review gap this closes: every existing regression test creates its voucher
 * via `VoucherEngineService.createVoucherConfigs(...)` directly, which never
 * sets `promotion_id`, so `lookupVoucherStep`'s `if (promotionId)` branch (the
 * `query.graph` read + `hydrateVoucherFromPromotion` overlay) is never
 * exercised end-to-end by any test.
 *
 * This spec instead provisions the voucher via the REAL admin
 * `createVoucherWorkflow`, which provisions a backing Medusa Promotion (+
 * Campaign) and stores its id on `voucher_config.promotion_id` (Decision C/H).
 * It then runs `resolveVoucherDiscountWorkflow` (which internally calls
 * `lookupVoucherStep`) to prove the computed discount reflects the
 * PROMOTION's percentage, not a value read only from the config row.
 *
 * The drift-proof assertion is the important one: after the first
 * resolve, the backing Promotion's `application_method.value` is changed
 * directly (20 -> 10) via `updatePromotionsWorkflow`, WITHOUT touching
 * `voucher_config` at all. A second resolve against the same voucher must
 * then reflect 10%, proving `lookupVoucherStep` reads the Promotion fresh via
 * `query.graph` on every call rather than trusting a stale/cached snapshot.
 * (The 30s `voucher:{code}:config` cache — `lib/voucher-cache.ts` — only ever
 * holds the cart-independent CONFIG row; the Promotion read that
 * `hydrateVoucherFromPromotion` overlays happens outside that cache on every
 * lookup, so this drift is visible even within the same 30s TTL window.)
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import { updatePromotionsWorkflow } from "@medusajs/core-flows";
import { createVoucherWorkflow } from "../../src/workflows/voucher-engine/admin/create-voucher";
import { resolveVoucherDiscountWorkflow } from "../../src/workflows/voucher-engine/resolve-voucher-discount";

jest.setTimeout(60_000);
// Known infra flake (not an assertion failure) — see
// .claude/lessons/voucher-engine/2026-07-14-redis-bullmq-teardown-race.md.
// Absorbs the Redis/BullMQ teardown race between heavy full-app tests; a
// genuinely broken assertion still fails identically on retry.
jest.retryTimes(2);

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("lookupVoucherStep hydrates FRESH from a REAL backing Promotion (Task 2 seam, Decision I)", () => {
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

      it("computes the voucher discount from the backing Promotion's LIVE percentage, and re-reads it fresh after the Promotion drifts (20% -> 10%) without any voucher_config change", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 1_000_000,
            quantity: 1,
            product_id: "prod_racket_hydrate",
          },
        ]);

        // createVoucherWorkflow (not service.createVoucherConfigs) — this is
        // the ONLY path that provisions a real backing Promotion and stores
        // its id on the voucher_config row, which is what makes
        // lookupVoucherStep's `if (promotionId)` hydrate branch fire.
        const { result: voucher, errors: createErrors } =
          await createVoucherWorkflow(container()).run({
            input: {
              code: "HYDRATEPROMO",
              discount_type: "percentage",
              discount_value: 2000, // 20.00% -> backing Promotion application_method.value = 20
              valid_from: FAR_PAST,
              valid_to: FAR_FUTURE,
              per_user_limit: 5,
            },
            throwOnError: false,
          });

        expect(createErrors).toEqual([]);
        const promotionId = (voucher as { promotion_id?: string | null })
          .promotion_id;
        // Sanity precondition: without a promotion_id the hydrate branch is
        // skipped entirely and this test would prove nothing.
        expect(promotionId).toBeTruthy();

        const first = await resolveVoucherDiscountWorkflow(container()).run({
          input: {
            cart_id: cart.id,
            code: "HYDRATEPROMO",
            customer_id: "cus_hydrate",
          },
          throwOnError: false,
        });

        expect(first.errors).toEqual([]);
        // 20% of the 1,000,000 subtotal, read from the Promotion's
        // application_method.value (20), not directly from discount_value.
        expect(first.result.discount.final_voucher_discount).toBe(200_000);
        expect(first.result.discount.expected_final_cart_total).toBe(800_000);

        // DRIFT PROOF: mutate the backing Promotion directly — the
        // voucher_config row (discount_value=2000) is left completely
        // untouched.
        const { errors: updateErrors } = await updatePromotionsWorkflow(
          container(),
        ).run({
          input: {
            promotionsData: [
              {
                id: promotionId as string,
                application_method: { value: 10 },
              },
            ],
          },
          throwOnError: false,
        });
        expect(updateErrors).toEqual([]);

        const second = await resolveVoucherDiscountWorkflow(container()).run({
          input: {
            cart_id: cart.id,
            code: "HYDRATEPROMO",
            customer_id: "cus_hydrate",
          },
          throwOnError: false,
        });

        expect(second.errors).toEqual([]);
        // If lookupVoucherStep read a stale/cached config snapshot instead of
        // the Promotion, this would still be 200,000. Reflecting 10% proves
        // the `query.graph` + `hydrateVoucherFromPromotion` overlay runs
        // fresh on every lookup.
        expect(second.result.discount.final_voucher_discount).toBe(100_000);
        expect(second.result.discount.expected_final_cart_total).toBe(900_000);
      });
    });
  },
});
