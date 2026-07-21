/**
 * resolveVoucherDiscountWorkflow — Day 2/3 integration flow (SPEC §11.1
 * `applyVoucherWorkflow`, scoped down; Phase-3 item 11).
 *
 * Connects `loadCartContextStep`, real voucher lookup, V1-V8 validation,
 * eligibility resolution, and discount calculation into one real workflow —
 * everything Day 2/3 owns. Deliberately EXCLUDES the Day 4/5 concerns
 * documented in SPEC §11.1: rate-limiting (`checkRateLimitStep`), attaching the
 * voucher as a real cart Promotion (`applyVoucherPromotionStep`), the
 * replace-existing-voucher flow, and usage recording. Those steps need this
 * workflow's output (`discount`) as their input once built.
 *
 * `verifyCartTotalsStep` (task 3.3.14/3.8.4) is included but conditional: it
 * only runs when the caller already knows the voucher's adjustment ids
 * (`adjustment_ids`), i.e. after some other flow has written them to the cart
 * (Decision-4 carrier rewrite — `lib/create-voucher-adjustments.ts`). This
 * lets the same workflow serve as both a pre-write "preview" (Day 2/3 scope,
 * no adjustments yet) and, later, the post-write leg of the real
 * `applyVoucherWorkflow` — without duplicating any calculation.
 */

import {
  WorkflowResponse,
  createWorkflow,
  transform,
  when,
} from "@medusajs/framework/workflows-sdk";
import { resolveAndCalculateVoucherDiscount } from "./lib/resolve-and-calculate-discount";
import { loadCartContextStep } from "./steps/load-cart-context";
import { loadCustomerSegmentStep } from "./steps/load-customer-segment";
import { lookupVoucherStep } from "./steps/lookup-voucher";
import { validateVoucherStep } from "./steps/validate-voucher";
import { verifyCartTotalsStep } from "./steps/verify-cart-totals";

export const resolveVoucherDiscountWorkflowId = "resolve-voucher-discount";

export interface ResolveVoucherDiscountInput {
  cart_id: string;
  code: string;
  customer_id: string;
  /** When set, the voucher's adjustments are already written — run `verifyCartTotalsStep` against them. */
  adjustment_ids?: string[];
}

export const resolveVoucherDiscountWorkflow = createWorkflow(
  resolveVoucherDiscountWorkflowId,
  (input: ResolveVoucherDiscountInput) => {
    const cart = loadCartContextStep({ cart_id: input.cart_id });

    const lookup = lookupVoucherStep({
      code: input.code,
      customer_id: input.customer_id,
    });

    const customerSegment = loadCustomerSegmentStep({
      customer_id: input.customer_id,
    });

    validateVoucherStep({
      voucher: lookup.voucher,
      cart,
      user_usage_count: lookup.user_usage_count,
      customer_segment: customerSegment,
    });

    const { discount } = resolveAndCalculateVoucherDiscount({ lookup, cart });

    const verification = when(
      { input, discount },
      ({ input }) => !!input.adjustment_ids?.length,
    ).then(() =>
      verifyCartTotalsStep({
        cart_id: input.cart_id,
        adjustment_ids: input.adjustment_ids!,
        final_voucher_discount: discount.final_voucher_discount,
        expected_final_cart_total: discount.expected_final_cart_total,
      }),
    );

    return new WorkflowResponse(
      transform({ cart, discount, verification }, (data) => ({
        cart_id: data.cart.cart_id,
        discount: data.discount,
        verification: data.verification ?? null,
      })),
    );
  },
);

export default resolveVoucherDiscountWorkflow;
