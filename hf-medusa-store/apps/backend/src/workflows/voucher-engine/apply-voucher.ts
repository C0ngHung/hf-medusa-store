/**
 * applyVoucherWorkflow — SPEC §11.1 (tasks 3.4.1, 3.4.4–3.4.10, 3.4.14).
 *
 * Applies (or replaces) a voucher on a cart. Reuses every Day 2/3 step
 * (`loadCartContextStep`, `lookupVoucherStep`, `validateVoucherStep`,
 * `resolveEligibleItemsStep`, `calculateVoucherDiscountStep`,
 * `verifyCartTotalsStep`) and adds: the one-active-voucher / replace-confirmation
 * gate, the concurrency lock (§14.2-C), and the Option-B carrier — a
 * `cart.credit_lines` entry that carries the capped amount into the
 * authoritative Cart/Order totals WITHOUT participating in the Promotion
 * engine's `computeActions` (so a coexisting percentage item-promotion cannot
 * be re-compounded/reduced — the CONFLICT-8/PD-15 Rule-11 fix).
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
  deleteCartCreditLinesWorkflow,
  releaseLockStep,
} from "@medusajs/core-flows";
import { createVoucherCreditLine } from "./lib/create-voucher-credit-line";
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
    // must run BEFORE the old carrier is touched (never remove a valid existing
    // voucher before the replacement is validated). Only reached once the
    // submitted code is confirmed to exist.
    const activeCheck = checkActiveVoucherStep({
      cart_id: input.cart_id,
      replace: input.replace,
    });

    const hasPrevious = transform(
      { activeCheck },
      ({ activeCheck }) => !!activeCheck.previous,
    );

    // Load the authoritative cart. Credit lines never appear in
    // `items.adjustments`, so `item_promotion_discount` is already voucher-free
    // — no old-carrier exclusion needed (unlike the former ephemeral-promotion
    // carrier). Rule-11 baseline is clean for both first-apply and replace.
    const cart = loadCartContextStep({ cart_id: input.cart_id });

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

    // Replace: delete the OLD voucher credit line. Reversible before
    // verification — `deleteCartCreditLinesWorkflow` soft-deletes and its
    // compensation restores it, so if the NEW voucher fails verification the
    // customer's previous discount is put back exactly. The new voucher already
    // passed V1–V8 above (validateVoucherStep), so we never drop a valid voucher
    // for an unvalidated one (tasks 3.4.7/3.4.8).
    when({ hasPrevious }, ({ hasPrevious }) => hasPrevious).then(() => {
      const oldCreditLineId = transform(
        { activeCheck },
        ({ activeCheck }) => activeCheck.previous!.credit_line_id,
      );
      deleteCartCreditLinesWorkflow.runAsStep({
        input: transform({ oldCreditLineId }, ({ oldCreditLineId }) => ({
          id: [oldCreditLineId],
        })),
      });
    });

    // Option-B carrier — carry the capped amount via a cart credit line
    // (never a Promotion, so it never re-compounds with item promotions).
    const creditLine = createVoucherCreditLine({
      cart_id: input.cart_id,
      voucher_id: transform({ lookup }, ({ lookup }) => lookup.voucher!.id),
      code: transform({ lookup }, ({ lookup }) => lookup.voucher!.code),
      discount,
    });

    const voucherSnapshot = transform(
      { lookup, discount, creditLine, activeCheck },
      ({ lookup, discount, creditLine, activeCheck }) => ({
        voucher_id: lookup.voucher!.id,
        code: lookup.voucher!.code,
        credit_line_id: creditLine.credit_line_id,
        discount_type: lookup.voucher!.discount_type,
        discount_value: lookup.voucher!.discount_value,
        uncapped_voucher_discount: discount.raw_voucher_discount,
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
      credit_line_id: creditLine.credit_line_id,
      final_voucher_discount: discount.final_voucher_discount,
      expected_final_cart_total: discount.expected_final_cart_total,
      // Rule-11 baseline: `discount.item_promotion_discount` is voucher-free by
      // construction (credit lines are not adjustments), for both first-apply
      // and replace. The verify step asserts item promotions did not shrink.
      pre_apply_item_promotion_discount: discount.item_promotion_discount,
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
