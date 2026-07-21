/**
 * validateAttachVoucherConfigInput — pure cross-field validation (no I/O),
 * "Enable VoucherEngine on an existing Promotion" (Admin unified model).
 * Added 2026-07-21 (code-review finding): the Enable form's Zod schema
 * (`api/admin/promotions/[promotion_id]/voucher-config/validators.ts`)
 * cannot see the linked Promotion's `discount_type` — that's derived from
 * the Promotion, not part of this form's own body — so this cross-field rule
 * needs the Promotion object too, hence a separate function called from the
 * workflow (mirrors `check-promotion-voucher-eligibility.ts`'s pattern:
 * every rule that needs the Promotion object itself, not just the form
 * input, lives here and is unit-testable in isolation).
 *
 * Rules:
 *  - `max_discount_amount` only makes sense for a PERCENTAGE voucher — a
 *    fixed_amount voucher's discount IS a fixed number already (and is
 *    already floor-capped at the eligible subtotal in
 *    `calculate-discount.ts`), so a separate "max" on top of it is
 *    meaningless. Reject if set on a non-percentage Promotion.
 *
 * `max_discount_amount` vs `min_order_value` is NOT cross-validated
 * (bug-bash fix, 2026-07-21 — a prior pass added a
 * `max_discount_amount < min_order_value` rule that has no basis in SRS:
 * `max_discount_amount` is only a standalone cap on the voucher's OWN
 * discount, unrelated to whatever minimum order value is separately
 * configured — e.g. "40% off, capped at 500,000 VND, min order 300,000" is a
 * valid, deliberately aggressive configuration the merchant may want. Removed
 * entirely rather than special-cased, since no min-order-relative rule is
 * required at all.
 */

export interface PromotionForAttachInputValidation {
  application_method?: {
    type?: string;
  } | null;
}

export interface AttachVoucherConfigInputForValidation {
  min_order_value?: number | null;
  max_discount_amount?: number | null;
}

export type AttachVoucherConfigValidationResult =
  | { ok: true }
  | { ok: false; field: "max_discount_amount"; message: string };

export function validateAttachVoucherConfigInput(
  promotion: PromotionForAttachInputValidation,
  input: AttachVoucherConfigInputForValidation,
): AttachVoucherConfigValidationResult {
  if (input.max_discount_amount == null) {
    return { ok: true };
  }

  const isPercentage = promotion.application_method?.type === "percentage";
  if (!isPercentage) {
    return {
      ok: false,
      field: "max_discount_amount",
      message:
        "max_discount_amount only applies to a percentage-based Promotion — this Promotion's discount type is fixed, which is already an absolute VND amount.",
    };
  }

  return { ok: true };
}

export default validateAttachVoucherConfigInput;
