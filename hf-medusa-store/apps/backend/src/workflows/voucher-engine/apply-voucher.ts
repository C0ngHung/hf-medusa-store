/**
 * applyVoucherWorkflow — SPEC §11.1 (tasks 3.4.1, 3.4.4–3.4.10, 3.4.14).
 *
 * Applies (or replaces) a voucher on a cart. Reuses every Day 2/3 step
 * (`loadCartContextStep`, `lookupVoucherStep`, `validateVoucherStep`,
 * `resolveEligibleItemsStep`, `calculateVoucherDiscountStep`,
 * `verifyCartTotalsStep`) and adds the Day 4 pieces: the one-active-voucher /
 * replace-confirmation gate, the raw `LineItemAdjustment`s that actually
 * carry the capped amount (Decision-4 carrier rewrite,
 * `lib/create-voucher-adjustments.ts`), and the concurrency lock (§14.2-C).
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
  releaseLockStep,
  removeLineItemAdjustmentsStep,
} from "@medusajs/core-flows";
import { createVoucherLineItemAdjustments } from "./lib/create-voucher-adjustments";
import { resolveAndCalculateVoucherDiscount } from "./lib/resolve-and-calculate-discount";
import { assertCartUnchangedStep } from "./steps/assert-cart-unchanged";
import { assertVoucherFoundStep } from "./steps/assert-voucher-found";
import { checkActiveVoucherStep } from "./steps/check-active-voucher";
import { loadCartContextStep } from "./steps/load-cart-context";
import { loadCustomerSegmentStep } from "./steps/load-customer-segment";
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

    // Replace: remove the OLD voucher's adjustments BEFORE verification —
    // `verifyCartTotalsStep` reads the Cart's own recomputed total, which
    // would otherwise still reflect BOTH the old and new discount stacked
    // together. Safe/reversible: `removeLineItemAdjustmentsStep` soft-deletes
    // and its compensation RESTORES on a later failure (Decision-4 carrier
    // rewrite — a single removal step now covers what previously needed a
    // detach-then-later-irreversible-delete pair, because there is no
    // separate Promotion entity to delete once the adjustment rows
    // themselves are gone; never remove a valid existing voucher before the
    // replacement is validated).
    when({ hasPrevious }, ({ hasPrevious }) => hasPrevious).then(() => {
      const oldAdjustmentIds = transform(
        { activeCheck },
        ({ activeCheck }) => activeCheck.previous!.adjustment_ids,
      );

      removeLineItemAdjustmentsStep({
        lineItemAdjustmentIdsToRemove: oldAdjustmentIds,
      }).config({ name: "remove-old-voucher-adjustments" });
    });

    // Code-review Task 7.3: checkActiveVoucherStep (above) and this step both
    // call query.graph on the same cart_id — evaluated merging them into one
    // read and deliberately did NOT, because they read the cart at two
    // sequentially-DEPENDENT points, not the same point twice:
    // checkActiveVoucherStep's metadata-only read runs BEFORE the conditional
    // "remove old voucher adjustments" branch above and its result
    // (`hasPrevious`) decides whether that removal even runs, while this
    // step's full read must run AFTER it — its `item_promotion_discount`
    // baseline (Rule 11) is only correct once the old adjustments (if any)
    // have actually been removed from the cart. Merging into a single
    // earlier read would corrupt that baseline for the replace case;
    // merging into a single later read would move the replace-confirmation
    // gate to run AFTER the removal it's supposed to gate, violating tasks
    // 3.4.6/3.4.7/3.4.8 (never remove a valid existing voucher before the
    // replacement is validated). Left as two separate reads.
    const cart = loadCartContextStep({ cart_id: input.cart_id });

    // V7 (SPEC Decision J) — resolve the customer's native Medusa Customer
    // Group membership. Guests (customer_id null) resolve to no groups.
    const customerSegment = loadCustomerSegmentStep({
      customer_id: input.customer_id,
    });

    validateVoucherStep({
      voucher: lookup.voucher,
      cart,
      user_usage_count: lookup.user_usage_count,
      customer_segment: customerSegment,
    });

    const { resolved, discount } = resolveAndCalculateVoucherDiscount({
      lookup,
      cart,
    });

    // EC-04: verify no concurrent mutation (e.g. an item removal) changed the
    // cart between loadCartContextStep's read and this point, right before we
    // commit the computed discount.
    assertCartUnchangedStep({
      cart_id: input.cart_id,
      expected_concurrency_marker: cart.concurrency_marker,
    });

    // Decision-4 carrier rewrite — carry the capped amount via raw
    // LineItemAdjustment rows, split across eligible lines (never the
    // shared/canonical VoucherConfig.promotion_id, and never a Promotion at
    // all — see lib/create-voucher-adjustments.ts).
    const newAdjustments = createVoucherLineItemAdjustments({
      lines: resolved.lines,
      discount,
    });

    const voucherSnapshot = transform(
      { lookup, discount, newAdjustments, activeCheck },
      ({ lookup, discount, newAdjustments, activeCheck }) => ({
        voucher_id: lookup.voucher!.id,
        code: lookup.voucher!.code,
        adjustment_ids: newAdjustments.adjustment_ids,
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
      adjustment_ids: newAdjustments.adjustment_ids,
      final_voucher_discount: discount.final_voucher_discount,
      expected_final_cart_total: discount.expected_final_cart_total,
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
