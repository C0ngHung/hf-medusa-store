/**
 * VoucherEngine error catalog (task 3.2.13). Pure data — NO Medusa imports.
 *
 * Codes + HTTP status from API_CONTRACT §5.1; Vietnamese `customer_message` verbatim
 * from API_CONTRACT §6.1. `message` (EN) is for server logs only; the FE keys behavior
 * off `code` and displays `customer_message` (never parses the EN text).
 *
 * The boundary layer (apply-voucher workflow / errorHandler middleware, out of Day 3
 * scope) maps a failing ValidationResult → BusinessError using this catalog.
 */
import type { ValidationResult, VoucherErrorCode } from "./types";

export interface VoucherErrorDef {
  code: VoucherErrorCode;
  http_status: number;
  /** English message for logs only. */
  message: string;
  /** Vietnamese customer-facing message (API_CONTRACT §6.1). May carry {placeholders}. */
  customer_message: string;
}

/** Verbatim catalog — keyed by code. */
export const VOUCHER_ERRORS: Record<VoucherErrorCode, VoucherErrorDef> = {
  // V1 — exists + active. NOT_FOUND and INACTIVE share one customer message on purpose
  // (anti-enumeration: never reveal whether a code exists — SEC / API_CONTRACT §5.1).
  VOUCHER_NOT_FOUND: {
    code: "VOUCHER_NOT_FOUND",
    http_status: 404,
    message: "voucher not found",
    customer_message: "Mã giảm giá không đúng. Bạn kiểm tra lại giúp nhé!",
  },
  VOUCHER_INACTIVE: {
    code: "VOUCHER_INACTIVE",
    http_status: 422,
    message: "voucher is_active=false",
    customer_message: "Mã giảm giá không đúng. Bạn kiểm tra lại giúp nhé!",
  },
  // V2 — date window.
  VOUCHER_NOT_YET_VALID: {
    code: "VOUCHER_NOT_YET_VALID",
    http_status: 422,
    message: "now < valid_from",
    customer_message: "Mã này chưa tới ngày sử dụng. Bạn quay lại sau nhé!",
  },
  VOUCHER_EXPIRED: {
    code: "VOUCHER_EXPIRED",
    http_status: 422,
    message: "now > valid_to",
    customer_message:
      'Mã giảm giá đã hết hạn rồi. Bạn xem thêm mã trong "Ví voucher" nhé!',
  },
  // V3 — global usage limit.
  VOUCHER_USAGE_LIMIT_REACHED: {
    code: "VOUCHER_USAGE_LIMIT_REACHED",
    http_status: 422,
    message: "usage_count >= usage_limit",
    customer_message: "Mã này đã hết lượt sử dụng. Bạn thử mã khác nhé!",
  },
  // V4 — per-user limit.
  VOUCHER_PER_USER_LIMIT_REACHED: {
    code: "VOUCHER_PER_USER_LIMIT_REACHED",
    http_status: 422,
    message: "user_usage >= per_user_limit",
    customer_message: "Bạn đã dùng hết lượt cho mã này rồi.",
  },
  // V5 — minimum order value. {remaining} filled from details.
  VOUCHER_MIN_ORDER_NOT_MET: {
    code: "VOUCHER_MIN_ORDER_NOT_MET",
    http_status: 422,
    message: "original_subtotal < min_order_value",
    customer_message: "Mua thêm {remaining} nữa để dùng được mã này nhé!",
  },
  // V6 — eligible items in scope. {categories} filled from details.
  VOUCHER_NO_ELIGIBLE_ITEMS: {
    code: "VOUCHER_NO_ELIGIBLE_ITEMS",
    http_status: 422,
    message: "no cart item matches applicable products/categories",
    customer_message:
      "Mã này chỉ áp dụng cho {categories}. Giỏ hàng chưa có sản phẩm phù hợp.",
  },
  // V7 — segment (stubbed pass-through in Day 3; code kept for the boundary + future logic).
  VOUCHER_SEGMENT_NOT_ELIGIBLE: {
    code: "VOUCHER_SEGMENT_NOT_ELIGIBLE",
    http_status: 422,
    message: "segment mismatch",
    customer_message: "Mã này không áp dụng cho tài khoản của bạn.",
  },
  // V8 — stacking conflict.
  VOUCHER_STACKING_CONFLICT: {
    code: "VOUCHER_STACKING_CONFLICT",
    http_status: 422,
    message: "stackable_with_promotions=false & cart has item promo",
    customer_message:
      "Mã này không dùng chung với ưu đãi hiện có. Bạn gỡ ưu đãi kia trước nhé!",
  },
};

/**
 * Build a failing ValidationResult from a catalog code. `details` carries structured
 * values (e.g. { remaining, categories }) used to fill message placeholders / logs.
 */
export function fail(
  code: VoucherErrorCode,
  details?: Record<string, unknown>,
): ValidationResult {
  const def = VOUCHER_ERRORS[code];
  return {
    ok: false,
    code: def.code,
    http_status: def.http_status,
    customer_message: def.customer_message,
    ...(details ? { details } : {}),
  };
}

/** Shared success sentinel. */
export const PASS: ValidationResult = { ok: true };
