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
import { MedusaError } from "@medusajs/framework/utils";
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
  // V6 — eligible items in scope. `details.applicable_categories` carries raw
  // category ids (v6Scope is a pure function — no I/O to resolve names here),
  // so the message can't interpolate a human-readable list; it stays generic.
  VOUCHER_NO_ELIGIBLE_ITEMS: {
    code: "VOUCHER_NO_ELIGIBLE_ITEMS",
    http_status: 422,
    message: "no cart item matches applicable products/categories",
    customer_message:
      "Mã này chỉ áp dụng cho một số sản phẩm/danh mục nhất định. Giỏ hàng chưa có sản phẩm phù hợp.",
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
  // Day 4 (Thức) additions — apply/remove/replace/redemption-time codes (SPEC §8.4).
  VOUCHER_REPLACE_REQUIRED: {
    code: "VOUCHER_REPLACE_REQUIRED",
    http_status: 409,
    message: "cart already has another active voucher, replace not confirmed",
    customer_message: "Bạn đang dùng mã {current_code}. Thay bằng mã mới chứ?",
  },
  VOUCHER_CALCULATION_FAILED: {
    code: "VOUCHER_CALCULATION_FAILED",
    http_status: 400,
    message: "verify-cart-totals mismatch — safe-fail, cart reverted",
    customer_message: "Không thể áp dụng mã lúc này, giỏ hàng được giữ nguyên.",
  },
  // CONFLICT-8/PD-15 (2026-07-15): distinct INTERNAL-only code for the Rule-11
  // shrink guard (verify-cart-totals step 4) — a coexisting percentage item/
  // order Promotion's own adjustment was reduced by attaching the ephemeral
  // voucher Promotion (Medusa `computeActions` processes promotions in
  // `application_method.value DESC` order, so the voucher's money value
  // ~always sorts before a percentage promo's rate). Diagnostic only: same
  // customer-facing envelope as VOUCHER_CALCULATION_FAILED (SPEC §23.4) —
  // do not invent a new customer-facing code without an approved contract
  // change; this exists so logs/metrics can tell a Rule-11 stacking break
  // apart from a generic total mismatch.
  VOUCHER_STACKING_UNSUPPORTED: {
    code: "VOUCHER_STACKING_UNSUPPORTED",
    http_status: 400,
    message:
      "verify-cart-totals: coexisting percentage item/order promotion shrank — safe-fail, cart reverted",
    customer_message: "Không thể áp dụng mã lúc này, giỏ hàng được giữ nguyên.",
  },
  VOUCHER_CART_CHANGED: {
    code: "VOUCHER_CART_CHANGED",
    http_status: 409,
    message: "concurrency conflict (EC-04)",
    customer_message: "Giỏ hàng đã thay đổi, cần tính lại. Bạn thử lại nhé!",
  },
  VOUCHER_AUTO_REMOVED: {
    code: "VOUCHER_AUTO_REMOVED",
    http_status: 200,
    message: "revalidation failed — voucher auto-removed (async notification)",
    customer_message: "Mã giảm giá {code} đã được tự động xóa vì {reason}.",
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

/**
 * Workflow-level error thrown when the V1-V8 chain returns a failure — bridges
 * `validateVoucher`'s pure `ValidationResult` to a real thrown error so
 * `validateVoucherStep` can abort the workflow (task: Phase-3 item 6, "no eligible
 * items produces the approved business failure"). Also thrown directly (not via
 * `validateVoucher`) for Day 4 apply/remove-time business errors — see
 * `throwVoucherError` below. Carries the catalog fields far enough for a workflow
 * caller/test, or the route-boundary mapper (`toErrorEnvelope`), to build the
 * full HTTP response without parsing message text.
 */
export class VoucherValidationError extends MedusaError {
  code: VoucherErrorCode;
  http_status: number;
  customer_message: string;
  details?: Record<string, unknown>;

  constructor(result: Extract<ValidationResult, { ok: false }>) {
    super(
      medusaErrorTypeForStatus(result.http_status),
      result.customer_message,
    );
    this.name = "VoucherValidationError";
    this.code = result.code;
    this.http_status = result.http_status;
    this.customer_message = result.customer_message;
    this.details = result.details;
  }
}

/** Maps a catalog HTTP status to the closest native `MedusaError.Types` member. */
function medusaErrorTypeForStatus(http_status: number): string {
  switch (http_status) {
    case 404:
      return MedusaError.Types.NOT_FOUND;
    case 409:
      return MedusaError.Types.CONFLICT;
    case 429:
      return MedusaError.Types.NOT_ALLOWED; // `[NEEDS_VERIFICATION #8]` — no native 429 type in 2.16.
    case 400:
      return MedusaError.Types.INVALID_DATA;
    default:
      return MedusaError.Types.NOT_ALLOWED;
  }
}

/** Throw a `VoucherValidationError` directly from a catalog code (Day 4 apply/remove flows). */
export function throwVoucherError(
  code: VoucherErrorCode,
  details?: Record<string, unknown>,
): never {
  throw new VoucherValidationError(
    fail(code, details) as Extract<ValidationResult, { ok: false }>,
  );
}

/**
 * API_CONTRACT §4 error envelope — the ONE shape every VoucherEngine store-route
 * error response uses (SPEC §8.3, Decision A). `type` is derived from
 * `http_status`; `message` (EN) is for logs only; `customer_message` (VI) is
 * what the customer sees; `details` is optional structured data for the FE.
 * `request_id` is threaded from the route's own request id (Day 4 §23.5) —
 * never generated here, since only the route knows the true request id.
 *
 * SOURCE OF TRUTH for the storefront's manually-mirrored `VoucherErrorEnvelope`
 * (`apps/storefront/src/modules/voucher/types.ts`) — no cross-app type-sharing
 * convention exists in this repo, so if you change one, check the other.
 */
export interface ErrorEnvelope {
  type:
    | "invalid_data"
    | "not_found"
    | "conflict"
    | "rate_limited"
    | "unauthorized"
    | "not_allowed"
    | "server_error";
  code: string;
  message: string;
  customer_message: string;
  details?: Record<string, unknown>;
  request_id?: string;
}

const STATUS_TO_TYPE: Record<number, ErrorEnvelope["type"]> = {
  400: "invalid_data",
  401: "unauthorized",
  403: "not_allowed",
  404: "not_found",
  409: "conflict",
  422: "invalid_data",
  429: "rate_limited",
};

/** Fills `{placeholder}` tokens in a customer message from `details` (e.g. `{current_code}` -> `FIRSTVOUCHER`). */
function fillPlaceholders(
  template: string,
  details?: Record<string, unknown>,
): string {
  if (!details) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in details ? String(details[key]) : match,
  );
}

/**
 * Duck-typed shape of a `VoucherValidationError` once it has crossed the
 * Medusa workflow-step boundary. Verified empirically this session: a step
 * that throws a `VoucherValidationError` is caught at the route as a PLAIN
 * OBJECT carrying all the same fields (`code`, `http_status`,
 * `customer_message`, `details`, `__isMedusaError: true`) but WITHOUT the
 * original prototype chain — `err instanceof VoucherValidationError` is
 * `false` even though every field survived. Duck-typing on field presence
 * (not `instanceof`) is therefore required at this boundary.
 */
function isVoucherErrorLike(err: unknown): err is {
  code: string;
  http_status: number;
  customer_message: string;
  message?: string;
  details?: Record<string, unknown>;
} {
  if (!err || typeof err !== "object") return false;
  const candidate = err as Record<string, unknown>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.http_status === "number" &&
    typeof candidate.customer_message === "string"
  );
}

/**
 * Route-boundary mapper: turns any thrown error into the §8.3 envelope + the
 * HTTP status to send. Never leaks raw exception text/stack traces to the
 * customer (§12.5) — an unrecognized error becomes a generic 500 `server_error`
 * with no internal detail in the response body (the real message is only ever
 * logged by the caller, not returned here).
 */
export function toErrorEnvelope(
  err: unknown,
  request_id?: string,
): { status: number; body: ErrorEnvelope } {
  if (err instanceof VoucherValidationError || isVoucherErrorLike(err)) {
    return {
      status: err.http_status,
      body: {
        type: STATUS_TO_TYPE[err.http_status] ?? "invalid_data",
        code: err.code,
        message: err.message ?? err.code,
        customer_message: fillPlaceholders(err.customer_message, err.details),
        ...(err.details ? { details: err.details } : {}),
        ...(request_id ? { request_id } : {}),
      },
    };
  }

  return {
    status: 500,
    body: {
      type: "server_error",
      code: "INTERNAL_ERROR",
      message: "internal error",
      customer_message: "Có lỗi xảy ra, bạn thử lại sau ít phút nhé!",
      ...(request_id ? { request_id } : {}),
    },
  };
}
