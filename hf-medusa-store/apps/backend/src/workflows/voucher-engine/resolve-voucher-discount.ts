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
 * only runs when the caller already knows the voucher's backing Promotion id
 * (`promotion_id`), i.e. after some other flow has attached it to the cart via
 * Medusa's core `updateCartPromotionsWorkflow` (API_CONTRACT §7.3 — Promotion
 * attach/recalculation is core Cart/Promotion capability, not a VoucherEngine
 * Day 4 feature). This lets the same workflow serve as both a pre-attach
 * "preview" (Day 2/3 scope, no promotion yet) and, later, the post-attach leg
 * of the real `applyVoucherWorkflow` — without duplicating any calculation.
 */

import {
  WorkflowResponse,
  createWorkflow,
  transform,
  when,
} from "@medusajs/framework/workflows-sdk";
import { toVoucherScope } from "./lib/mappers";
import { calculateVoucherDiscountStep } from "./steps/calculate-voucher-discount";
import { loadCartContextStep } from "./steps/load-cart-context";
import { lookupVoucherStep } from "./steps/lookup-voucher";
import { resolveEligibleItemsStep } from "./steps/resolve-eligible-items";
import { validateVoucherStep } from "./steps/validate-voucher";
import { verifyCartTotalsStep } from "./steps/verify-cart-totals";

export const resolveVoucherDiscountWorkflowId = "resolve-voucher-discount";

export interface ResolveVoucherDiscountInput {
  cart_id: string;
  code: string;
  customer_id: string;
  /** Rule 11 — VoucherEngine's own adjustment on the cart, excluded from item_promotion_discount. */
  voucher_promotion_id?: string;
  /** When set, the voucher's Promotion is already attached — run `verifyCartTotalsStep` against it. */
  promotion_id?: string;
}

export const resolveVoucherDiscountWorkflow = createWorkflow(
  resolveVoucherDiscountWorkflowId,
  (input: ResolveVoucherDiscountInput) => {
    const cart = loadCartContextStep({
      cart_id: input.cart_id,
      voucher_promotion_id: input.voucher_promotion_id,
    });

    const lookup = lookupVoucherStep({
      code: input.code,
      customer_id: input.customer_id,
    });

    validateVoucherStep({
      voucher: lookup.voucher,
      cart,
      user_usage_count: lookup.user_usage_count,
    });

    const scope = transform({ lookup }, ({ lookup }) =>
      toVoucherScope(
        lookup.voucher ?? {
          applicable_product_ids: null,
          applicable_category_ids: null,
        },
      ),
    );

    const resolved = resolveEligibleItemsStep({
      lines: cart.lines,
      scope,
    });

    const voucherTerms = transform({ lookup }, ({ lookup }) => ({
      discount_type: lookup.voucher!.discount_type,
      discount_value: lookup.voucher!.discount_value,
      max_discount_amount: lookup.voucher!.max_discount_amount,
    }));

    const discount = calculateVoucherDiscountStep({
      lines: resolved.lines,
      voucher: voucherTerms,
      global_cap_bps: lookup.global_cap_bps,
    });

    const verification = when(
      { input, discount },
      ({ input }) => !!input.promotion_id,
    ).then(() =>
      verifyCartTotalsStep({
        cart_id: input.cart_id,
        promotion_id: input.promotion_id!,
        final_voucher_discount: discount.final_voucher_discount,
        expected_final_cart_total: discount.expected_final_cart_total,
        // CONFLICT-8/PD-15: `loadCartContextStep` above ran before any
        // promotion was attached by this workflow, so this is the voucher-free
        // baseline.
        pre_apply_item_promotion_discount: discount.item_promotion_discount,
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
