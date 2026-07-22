/**
 * resolveAndCalculateVoucherDiscount — shared "scope → eligible items →
 * discount" composition, factored out of `apply-voucher.ts`,
 * `resolve-voucher-discount.ts`, and `revalidate-voucher-on-cart-change.ts`
 * (all three previously copy-pasted this exact sequence). A plain function
 * composing workflow-step calls, meant to be invoked directly inside another
 * workflow's composer body — not itself a step.
 */
import { transform, WorkflowData } from "@medusajs/framework/workflows-sdk";
import { toVoucherScope } from "./mappers";
import type { CartContext } from "../steps/load-cart-context";
import type { LookupVoucherOutput } from "../steps/lookup-voucher";
import { resolveEligibleItemsStep } from "../steps/resolve-eligible-items";
import { calculateVoucherDiscountStep } from "../steps/calculate-voucher-discount";

export function resolveAndCalculateVoucherDiscount({
  lookup,
  cart,
}: {
  lookup: WorkflowData<LookupVoucherOutput>;
  cart: WorkflowData<CartContext>;
}) {
  const scope = transform({ lookup }, ({ lookup }) =>
    toVoucherScope(
      lookup.voucher ?? {
        applicable_product_ids: null,
        applicable_category_ids: null,
      },
    ),
  );

  const resolved = resolveEligibleItemsStep({ lines: cart.lines, scope });

  const voucherTerms = transform({ lookup }, ({ lookup }) => ({
    discount_type: lookup.voucher!.discount_type,
    discount_value: lookup.voucher!.discount_value,
    max_discount_amount: lookup.voucher!.max_discount_amount,
  }));

  const discount = calculateVoucherDiscountStep({
    lines: resolved.lines,
    voucher: voucherTerms,
    global_cap_bps: lookup.global_cap_bps,
    shipping_total: cart.shipping_total,
  });

  // `resolved.lines` (per-line `is_eligible`/`item_promotion_discount`) is
  // returned alongside the aggregate `discount` so callers can split
  // `discount.final_voucher_discount` across eligible lines
  // (`lib/create-voucher-adjustments.ts`, Decision-4 carrier rewrite) without
  // re-running eligibility resolution.
  return { resolved, discount };
}
