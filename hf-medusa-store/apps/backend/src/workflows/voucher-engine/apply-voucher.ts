/**
 * applyVoucherWorkflow — SPEC §11.1 (tasks 3.4.1, 3.4.4–3.4.10, 3.4.14).
 *
 * Applies (or replaces) a voucher on a cart. Reuses every Day 2/3 step
 * (`loadCartContextStep`, `lookupVoucherStep`, `validateVoucherStep`,
 * `resolveEligibleItemsStep`, `calculateVoucherDiscountStep`,
 * `verifyCartTotalsStep`) and adds the Day 4 pieces: the one-active-voucher /
 * replace-confirmation gate, the ephemeral cart-specific Promotion that
 * actually carries the capped amount (Decision G, §14.2-A), and the
 * concurrency lock (§14.2-C).
 *
 * Brute-force rate-limiting (§11.1 step 2, SEC-02/EC-10) is enforced at the
 * HTTP boundary — `voucherRateLimitMiddleware` on the store route plus
 * `recordFailedAttempt`/`resetFailedAttempts` in the route handler — not
 * inside this workflow.
 */

import {
  WorkflowResponse,
  createWorkflow,
  transform,
  when,
} from "@medusajs/framework/workflows-sdk";
import {
  acquireLockStep,
  createPromotionsWorkflow,
  deletePromotionsWorkflow,
  releaseLockStep,
  updateCartPromotionsWorkflow,
} from "@medusajs/core-flows";
import { PromotionActions } from "@medusajs/framework/utils";
import { generateEphemeralPromotionCode } from "./lib/ephemeral-promotion";
import { resolveAndCalculateVoucherDiscount } from "./lib/resolve-and-calculate-discount";
import { assertCartUnchangedStep } from "./steps/assert-cart-unchanged";
import { assertVoucherFoundStep } from "./steps/assert-voucher-found";
import { checkActiveVoucherStep } from "./steps/check-active-voucher";
import { loadCartContextStep } from "./steps/load-cart-context";
import { lookupVoucherStep } from "./steps/lookup-voucher";
import { validateVoucherStep } from "./steps/validate-voucher";
import { verifyCartTotalsStep } from "./steps/verify-cart-totals";
import { writeVoucherCartMetadataStep } from "./steps/write-voucher-cart-metadata";

export const applyVoucherWorkflowId = "apply-voucher";

export interface ApplyVoucherWorkflowInput {
  cart_id: string;
  code: string;
  /** Server-side auth context value — never client-supplied (§23.5). Null for guests. */
  customer_id: string | null;
  /** From the `?replace=true` query flag (Decision E) — the workflow itself is transport-agnostic. */
  replace?: boolean;
}

export const applyVoucherWorkflow = createWorkflow(
  applyVoucherWorkflowId,
  (input: ApplyVoucherWorkflowInput) => {
    const lockKey = transform(
      { input },
      ({ input }) => `voucher:cart:${input.cart_id}`,
    );

    acquireLockStep({ key: lockKey, ttl: 10 });

    // Existence check FIRST (SPEC V1) — a nonexistent/mistyped code must 404
    // regardless of whether another voucher is already active on the cart;
    // otherwise checkActiveVoucherStep's replace-confirmation gate below
    // (which never sees `code`) would fire first and ask the customer to
    // "replace" a code that was never valid in the first place.
    const lookup = lookupVoucherStep({
      code: input.code,
      customer_id: transform({ input }, ({ input }) => input.customer_id ?? ""),
    });
    assertVoucherFoundStep({ voucher: lookup.voucher });

    // One-active-voucher / replace-confirmation gate (tasks 3.4.6/3.4.7/3.4.8) —
    // must run BEFORE any new Promotion is created (never remove a valid
    // existing voucher before the replacement is validated). Only reached
    // once the submitted code is confirmed to exist.
    const activeCheck = checkActiveVoucherStep({
      cart_id: input.cart_id,
      replace: input.replace,
    });

    const hasPrevious = transform(
      { activeCheck },
      ({ activeCheck }) => !!activeCheck.previous,
    );

    // Replace: DETACH (not delete) the OLD ephemeral promotion from the cart
    // BEFORE verification — `verifyCartTotalsStep` reads the Cart's own
    // recomputed total, which would otherwise still reflect BOTH the old and
    // new promotion stacked together. This is safe/reversible: the underlying
    // `removeLineItemAdjustmentsStep` (inside `updateCartPromotionsWorkflow`)
    // soft-deletes the adjustment and its compensation RESTORES it (verified:
    // `@medusajs/core-flows/dist/cart/steps/remove-line-item-adjustments.js`)
    // — so if verification fails below, Medusa's own rollback puts the old
    // voucher's discount back exactly as it was. Only the irreversible DELETE
    // of the old Promotion entity waits until after verification succeeds
    // (never remove a valid existing voucher before the replacement is
    // validated).
    when({ hasPrevious }, ({ hasPrevious }) => hasPrevious).then(() => {
      const oldCode = transform(
        { activeCheck },
        ({ activeCheck }) => activeCheck.previous!.ephemeral_code,
      );

      updateCartPromotionsWorkflow
        .runAsStep({
          input: transform({ input, oldCode }, ({ input, oldCode }) => ({
            cart_id: input.cart_id,
            promo_codes: [oldCode],
            action: PromotionActions.REMOVE,
          })),
        })
        .config({ name: "detach-old-ephemeral-promotion" });
    });

    // Exclude the PREVIOUS voucher's own ephemeral adjustment (if replacing)
    // from item_promotion_discount, mirroring Rule 11 under Decision G.
    const previousPromotionId = transform(
      { activeCheck },
      ({ activeCheck }) => activeCheck.previous?.ephemeral_promotion_id,
    );

    const cart = loadCartContextStep({
      cart_id: input.cart_id,
      voucher_promotion_id: previousPromotionId,
    });

    validateVoucherStep({
      voucher: lookup.voucher,
      cart,
      user_usage_count: lookup.user_usage_count,
    });

    const discount = resolveAndCalculateVoucherDiscount({ lookup, cart });

    // EC-04: verify no concurrent mutation (e.g. an item removal) changed the
    // cart between loadCartContextStep's read and this point, right before we
    // commit the computed discount.
    assertCartUnchangedStep({
      cart_id: input.cart_id,
      expected_concurrency_marker: cart.concurrency_marker,
    });

    // Decision G — carry the capped amount via a fresh, cart-specific,
    // fixed-amount Promotion (never the shared/canonical VoucherConfig.promotion_id).
    const ephemeralInput = transform(
      { input, cart, discount, lookup },
      ({ input, cart, discount, lookup }) => ({
        promotionsData: [
          {
            code: generateEphemeralPromotionCode(
              input.cart_id,
              lookup.voucher!.id,
            ),
            type: "standard" as const,
            status: "active" as const,
            is_automatic: false,
            application_method: {
              type: "fixed" as const,
              target_type: "items" as const,
              allocation: "across" as const,
              value: discount.final_voucher_discount,
              currency_code: cart.currency_code,
            },
          },
        ],
      }),
    );

    const createdPromotions = createPromotionsWorkflow.runAsStep({
      input: ephemeralInput,
    });

    const ephemeralPromotion = transform(
      { createdPromotions },
      ({ createdPromotions }) => ({
        id: createdPromotions[0].id,
        code: createdPromotions[0].code as string,
      }),
    );

    updateCartPromotionsWorkflow
      .runAsStep({
        input: transform(
          { input, ephemeralPromotion },
          ({ input, ephemeralPromotion }) => ({
            cart_id: input.cart_id,
            promo_codes: [ephemeralPromotion.code],
            action: PromotionActions.ADD,
          }),
        ),
      })
      .config({ name: "attach-new-ephemeral-promotion" });

    const voucherSnapshot = transform(
      { lookup, discount, ephemeralPromotion, activeCheck },
      ({ lookup, discount, ephemeralPromotion, activeCheck }) => ({
        voucher_id: lookup.voucher!.id,
        code: lookup.voucher!.code,
        ephemeral_promotion_id: ephemeralPromotion.id,
        ephemeral_code: ephemeralPromotion.code,
        discount_type: lookup.voucher!.discount_type,
        discount_value: lookup.voucher!.discount_value,
        raw_voucher_discount: discount.raw_voucher_discount,
        voucher_discount_after_voucher_cap:
          discount.voucher_discount_after_voucher_cap,
        discount_amount: discount.final_voucher_discount,
        discount_capped: discount.discount_capped,
        original_discount: discount.voucher_discount_after_voucher_cap,
        cap_percentage_bps: lookup.global_cap_bps,
        original_subtotal: discount.original_subtotal,
        item_promotion_discount: discount.item_promotion_discount,
        revalidation_marker: activeCheck.previous?.revalidation_marker ?? "",
      }),
    );

    writeVoucherCartMetadataStep({
      cart_id: input.cart_id,
      voucher: voucherSnapshot,
      previous_metadata: activeCheck.previous_metadata,
    });

    const verification = verifyCartTotalsStep({
      cart_id: input.cart_id,
      promotion_id: ephemeralPromotion.id,
      final_voucher_discount: discount.final_voucher_discount,
      expected_final_cart_total: discount.expected_final_cart_total,
      // CONFLICT-8/PD-15: voucher-free baseline. `loadCartContextStep` (above)
      // ran AFTER the old ephemeral promotion (if replacing) was already
      // detached and BEFORE the new one was created/attached, so
      // `discount.item_promotion_discount` is the correct voucher-free
      // Rule-11 baseline for both first-apply and replace.
      pre_apply_item_promotion_discount: discount.item_promotion_discount,
    });

    // Replace: only now (after the NEW voucher is verified) irreversibly
    // DELETE the OLD ephemeral Promotion entity — it was already detached
    // from the cart above, before verification (tasks 3.4.7/3.4.8 — never
    // remove a valid existing voucher before the replacement is validated).
    when({ hasPrevious }, ({ hasPrevious }) => hasPrevious).then(() => {
      const oldPromotionId = transform(
        { activeCheck },
        ({ activeCheck }) => activeCheck.previous!.ephemeral_promotion_id,
      );

      // No `.config({name})` here: `deletePromotionsWorkflow`'s declared
      // output type is `never` (it returns nothing), which makes `.config`
      // structurally unavailable on the `runAsStep()` result even though it
      // exists at runtime — and this is the only `deletePromotionsWorkflow`
      // invocation in this workflow (replace-only branch), so there is no
      // repeat to disambiguate.
      deletePromotionsWorkflow.runAsStep({
        input: transform({ oldPromotionId }, ({ oldPromotionId }) => ({
          ids: [oldPromotionId],
        })),
      });
    });

    releaseLockStep({ key: lockKey });

    const response = transform(
      { lookup, discount, verification },
      ({ lookup, discount, verification }) => ({
        success: true as const,
        discount_amount: discount.final_voucher_discount,
        discount_capped: discount.discount_capped,
        cap_explanation: discount.cap_explanation?.message_vi ?? null,
        updated_cart_total: verification.cart.total,
        voucher_details: {
          code: lookup.voucher!.code,
          type: lookup.voucher!.discount_type,
          value: lookup.voucher!.discount_value,
          expires_at: new Date(lookup.voucher!.valid_to).toISOString(),
        },
      }),
    );

    return new WorkflowResponse(response);
  },
);

export default applyVoucherWorkflow;
