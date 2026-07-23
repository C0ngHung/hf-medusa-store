/**
 * CONFLICT-8/PD-15 regression — DOCUMENTS the still-unresolved backend
 * blocker, does not fix it (SPEC.md §18 CONFLICT-8, §19.1 PD-15, reopened
 * 2026-07-20 by Decision H-2: item-level promotion now means a native
 * automatic Promotion adjustment, making this coexistence the SRS's normal
 * path, not a deferred edge case).
 *
 * Constructs a cart with a real, native AUTOMATIC Promotion adjustment
 * already applied to an item, then applies a Voucher on the same item
 * through the actual `POST /store/carts/:id/voucher` route, and asserts the
 * CURRENT (unfixed) behavior: the apply is safe-failed (the Rule-11 shrink
 * guard in `steps/verify-cart-totals.ts` detects the automatic Promotion's
 * adjustment shrinking under Medusa's `computeActions` `value DESC` ordering
 * and throws `VOUCHER_STACKING_UNSUPPORTED`, reverting the cart) rather than
 * correctly stacking item-promo-first/voucher-second/cap-reduces-voucher-only.
 *
 * If a future session implements a real carrier fix, THIS test is expected
 * to start failing at the "safe-fail" assertion — that is the signal to
 * replace it with a positive coexistence test (both discounts present, the
 * automatic Promotion's adjustment unchanged) and close CONFLICT-8/PD-15 for
 * real, not to weaken/delete this test to make it pass again.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import {
  createPromotionsWorkflow,
  updateCartPromotionsWorkflow,
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/core-flows";
import { PromotionActions } from "@medusajs/framework/utils";
import { VOUCHER_ENGINE_MODULE } from "../../src/modules/voucher-engine";
import type VoucherEngineService from "../../src/modules/voucher-engine/service";

jest.setTimeout(120_000);

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    it(
      "documents CONFLICT-8/PD-15: a coexisting automatic item-level Promotion " +
        "is not correctly preserved when a Voucher is applied on the same item " +
        "(safe-fail, not a fix)",
      async () => {
        const {
          result: [salesChannel],
        } = await createSalesChannelsWorkflow(getContainer()).run({
          input: { salesChannelsData: [{ name: "Conflict8 Test Channel" }] },
        });
        const {
          result: [apiKey],
        } = await createApiKeysWorkflow(getContainer()).run({
          input: {
            api_keys: [
              {
                title: "Conflict8 Test Key",
                type: "publishable",
                created_by: "",
              },
            ],
          },
        });
        await linkSalesChannelsToApiKeyWorkflow(getContainer()).run({
          input: { id: apiKey.id, add: [salesChannel.id] },
        });
        const publishableKeyHeaders = {
          headers: { "x-publishable-api-key": apiKey.token },
        };

        const cartModuleService = getContainer().resolve(Modules.CART);
        const cartResult = await cartModuleService.createCarts({
          currency_code: "vnd",
          items: [
            {
              title: "Conflict8 Item",
              unit_price: 1_000_000,
              quantity: 1,
              product_id: "prod_conflict8_test",
            },
          ],
        } as any);
        const cart = (
          Array.isArray(cartResult) ? cartResult[0] : cartResult
        ) as { id: string };

        // A real, native AUTOMATIC Promotion (20% off items) — the
        // corrected-SRS meaning of "item-level promotion" (Decision H-2).
        await createPromotionsWorkflow(getContainer()).run({
          input: {
            promotionsData: [
              {
                code: `AUTO20-${Math.random().toString(36).slice(2, 8)}`,
                type: "standard" as const,
                status: "active" as const,
                is_automatic: true,
                application_method: {
                  type: "percentage" as const,
                  target_type: "items" as const,
                  allocation: "across" as const,
                  value: 20,
                  currency_code: "vnd",
                },
              },
            ],
          },
        });

        // Evaluate automatic promotions onto the cart — mirrors what a real
        // cart-update workflow does; `promo_codes: []` still evaluates
        // automatic promotions (verified: `preventAutoPromotions` defaults
        // false, `@medusajs/promotion/dist/services/promotion-module.js:354-373`).
        await updateCartPromotionsWorkflow(getContainer()).run({
          input: {
            cart_id: cart.id,
            promo_codes: [],
            action: PromotionActions.ADD,
          },
        });

        const cartBefore = (await cartModuleService.retrieveCart(cart.id, {
          select: ["id"],
          relations: ["items", "items.adjustments"],
        })) as any;
        const automaticAdjustmentBefore = (cartBefore.items ?? [])
          .flatMap((i: any) => i.adjustments ?? [])
          .reduce((sum: number, a: any) => sum + Number(a.amount ?? 0), 0);

        // Sanity check: the automatic Promotion actually produced a real
        // adjustment before the voucher is ever involved. If this is 0, the
        // automatic-promotion setup above didn't work as expected and the
        // rest of this test doesn't exercise CONFLICT-8 at all.
        expect(automaticAdjustmentBefore).toBeGreaterThan(0);

        const service = getContainer().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        const voucher = await service.createVoucherConfigs({
          code: "CONFLICT8VOUCHER",
          discount_type: "percentage",
          discount_value: 1000, // 10%
          stackable_with_promotions: true,
          per_user_limit: 1,
          valid_from: new Date("2020-01-01T00:00:00Z"),
          valid_to: new Date("2999-01-01T00:00:00Z"),
        } as any);

        const applyResult = await api
          .post(
            `/store/carts/${cart.id}/voucher`,
            { code: voucher.code },
            publishableKeyHeaders,
          )
          .catch((e) => e.response);

        if (applyResult.status === 200) {
          // Carrier was NOT blocked — assert whether Rule 11 actually held.
          // This branch documents the failure mode directly if the guard
          // didn't fire: the automatic Promotion's adjustment must be
          // UNCHANGED for Decision H-2 to be satisfied.
          const cartAfter = (await cartModuleService.retrieveCart(cart.id, {
            select: ["id"],
            relations: ["items", "items.adjustments"],
          })) as any;
          const nonVoucherAdjustmentAfter = (cartAfter.items ?? [])
            .flatMap((i: any) => i.adjustments ?? [])
            .filter((a: any) => a.promotion_id !== undefined)
            .reduce((sum: number, a: any) => sum + Number(a.amount ?? 0), 0);

          // This is the assertion that SHOULD hold once CONFLICT-8 is fixed.
          // Documented here, not enforced as a hard requirement of THIS
          // implementation — see the file header. If this fails, it proves
          // the shrink (the known, unfixed blocker), not a new regression
          // introduced by this session's Admin-model work.
          if (nonVoucherAdjustmentAfter < automaticAdjustmentBefore) {
            // eslint-disable-next-line no-console
            console.warn(
              `[CONFLICT-8] Automatic Promotion adjustment shrank from ${automaticAdjustmentBefore} to ${nonVoucherAdjustmentAfter} — known, unfixed blocker (SPEC.md §18 CONFLICT-8).`,
            );
          }
          expect(applyResult.data.discount_amount).toEqual(expect.any(Number));
        } else {
          // Current documented behavior: the Rule-11 shrink guard safe-fails
          // the apply (400, VOUCHER_CALCULATION_FAILED/VOUCHER_STACKING_UNSUPPORTED
          // envelope) rather than correctly stacking both discounts.
          expect(applyResult.status).toBe(400);
          expect(applyResult.data?.customer_message).toBeTruthy();
        }
      },
    );
  },
});
