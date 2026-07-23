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
import { MIN_CODE_LENGTH } from "../../../../modules/voucher-engine/constants";

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
      reason: `Promotion '${promotion.id}' là khuyến mãi tự động (is_automatic=true) nên không thể bật VoucherEngine — khuyến mãi tự động luôn áp dụng trước mọi voucher và thuộc một nhóm riêng.`,
    };
  }

  const code = promotion.code?.trim();
  if (!code) {
    return {
      eligible: false,
      reason: `Promotion '${promotion.id}' chưa có mã code — VoucherEngine chỉ áp dụng cho Promotion có mã.`,
    };
  }

  if (code.toUpperCase().startsWith(`${EPHEMERAL_CODE_PREFIX}-`)) {
    return {
      eligible: false,
      reason: `Promotion '${promotion.id}' (mã '${code}') là Promotion nội bộ, tạm dùng để mang giỏ hàng (ephemeral cart-transport), không phải Promotion bán hàng thật, nên không thể bật VoucherEngine.`,
    };
  }

  // Bug-bash fix (2026-07-22): a code shorter than MIN_CODE_LENGTH fails the
  // store apply endpoint's own zod schema before ever reaching VoucherEngine's
  // lookup — the storefront's single-input routing rule (UX-FLOW.md §1a,
  // D11) then treats that as "not a voucher" and falls back to trying it as a
  // plain generic Promotion, which has no expiry/limit/segment checks of its
  // own. A Promotion this short could still be applied that way and silently
  // bypass every VoucherEngine business rule (V1-V8) attached to it. Rejecting
  // it here, at Enable time, is the actual fix — no VoucherConfig is ever
  // linked to a code that can never reach VoucherEngine's own validation.
  if (code.length < MIN_CODE_LENGTH) {
    return {
      eligible: false,
      reason: `Promotion '${promotion.id}' có mã '${code}' chỉ dài ${code.length} ký tự — VoucherEngine yêu cầu tối thiểu ${MIN_CODE_LENGTH} ký tự. Mã ngắn hơn sẽ không bao giờ tới được bước kiểm tra của VoucherEngine lúc thanh toán (hệ thống sẽ tự chuyển sang áp dụng như một Promotion thường), khiến các quy tắc hết hạn/giới hạn lượt dùng/phân khúc khách hàng của voucher này âm thầm không bao giờ có hiệu lực.`,
    };
  }

  const targetType = promotion.application_method?.target_type;
  if (targetType && targetType !== "items" && targetType !== "order") {
    return {
      eligible: false,
      reason: `Promotion '${promotion.id}' có target_type '${targetType}' không được hỗ trợ — chỉ Promotion áp dụng cho 'items' hoặc 'order' mới có thể bật VoucherEngine.`,
    };
  }

  if (promotion.status === "inactive") {
    return {
      eligible: false,
      reason: `Promotion '${promotion.id}' đang ở trạng thái 'inactive' — hãy kích hoạt (activate) Promotion trước khi bật VoucherEngine.`,
    };
  }

  const endsAt = promotion.campaign?.ends_at;
  if (endsAt && new Date(endsAt).getTime() < now.getTime()) {
    return {
      eligible: false,
      reason: `Campaign gắn với Promotion '${promotion.id}' đã kết thúc lúc ${new Date(endsAt).toISOString()} — không thể bật VoucherEngine cho một Promotion đã hết hạn.`,
    };
  }

  return { eligible: true };
}
