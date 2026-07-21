/**
 * checkPromotionVoucherEligibility — pure eligibility decision (no I/O),
 * "Enable VoucherEngine on an existing Promotion" (Admin unified model).
 *
 * Factored out of `admin/steps/assert-promotion-voucher-eligible.ts` so every
 * rule that depends ONLY on the Promotion object itself (not on a DB lookup
 * for an existing linked VoucherConfig) is unit-testable in isolation,
 * mirroring this repo's convention of pure `lib/` functions + thin steps
 * (e.g. `lib/calculate-discount.ts`, `lib/validators.ts`). The step still
 * separately checks for an existing linked VoucherConfig (requires the
 * container/DB) after this function passes.
 */
import { EPHEMERAL_CODE_PREFIX } from "../../lib/ephemeral-promotion";

export interface PromotionForEligibilityCheck {
  id: string;
  code?: string | null;
  is_automatic?: boolean;
  status?: string;
  application_method?: {
    target_type?: string;
  } | null;
  campaign?: {
    ends_at?: string | Date | null;
  } | null;
}

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: string };

export function checkPromotionVoucherEligibility(
  promotion: PromotionForEligibilityCheck,
  now: Date = new Date(),
): EligibilityResult {
  if (promotion.is_automatic) {
    return {
      eligible: false,
      reason: `Promotion '${promotion.id}' is automatic (is_automatic=true) and cannot enable VoucherEngine — Automatic Promotions apply before any Voucher and are a separate classification.`,
    };
  }

  const code = promotion.code?.trim();
  if (!code) {
    return {
      eligible: false,
      reason: `Promotion '${promotion.id}' has no code — VoucherEngine requires a code-based Promotion.`,
    };
  }

  if (code.toUpperCase().startsWith(`${EPHEMERAL_CODE_PREFIX}-`)) {
    return {
      eligible: false,
      reason: `Promotion '${promotion.id}' (code '${code}') is an internal ephemeral cart-transport Promotion, not a real merchandising Promotion, and cannot enable VoucherEngine.`,
    };
  }

  const targetType = promotion.application_method?.target_type;
  if (targetType && targetType !== "items" && targetType !== "order") {
    return {
      eligible: false,
      reason: `Promotion '${promotion.id}' has an unsupported application method target_type '${targetType}' — only 'items' or 'order' Promotions can enable VoucherEngine.`,
    };
  }

  if (promotion.status === "inactive") {
    return {
      eligible: false,
      reason: `Promotion '${promotion.id}' is inactive — activate it before enabling VoucherEngine.`,
    };
  }

  const endsAt = promotion.campaign?.ends_at;
  if (endsAt && new Date(endsAt).getTime() < now.getTime()) {
    return {
      eligible: false,
      reason: `Promotion '${promotion.id}'s linked Campaign already ended at ${new Date(endsAt).toISOString()} — cannot enable VoucherEngine on an expired Promotion.`,
    };
  }

  return { eligible: true };
}
