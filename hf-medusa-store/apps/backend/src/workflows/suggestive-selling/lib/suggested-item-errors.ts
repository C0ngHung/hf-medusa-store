/**
 * Error catalog for one-tap add (SUGG-003, API Contract §1.1
 * POST /store/carts/:id/suggested-items). Mirrors the voucher-engine error
 * pattern: a typed error carrying { code, http_status, customer_message (VI),
 * details? } that the thin route maps straight onto the HTTP response.
 *
 * Kept module-local (no shared BusinessError exists in the repo yet); the store
 * route catches SuggestedItemError and serialises it.
 */

export type SuggestedItemErrorCode =
  | "SUGGESTION_INVALID_ATTRIBUTION"
  | "SUGGESTION_VARIANT_SELECTION_REQUIRED"
  | "SUGGESTION_PRODUCT_INACTIVE"
  | "SUGGESTION_STOCK_CONFLICT";

type Def = { http_status: number; customer_message: string };

// customer_message = Vietnamese primary (i18n VI, per SRS §4.1 error i18n).
export const SUGGESTED_ITEM_ERRORS: Record<SuggestedItemErrorCode, Def> = {
  // SEC-01: forged attribution / rule missing or inactive → add nothing.
  SUGGESTION_INVALID_ATTRIBUTION: {
    http_status: 422,
    customer_message: "Gợi ý không hợp lệ.",
  },
  // Multiple variants and no default → client must pick (opens bottom sheet).
  SUGGESTION_VARIANT_SELECTION_REQUIRED: {
    http_status: 422,
    customer_message: "Vui lòng chọn phân loại sản phẩm.",
  },
  // Product/variant not published.
  SUGGESTION_PRODUCT_INACTIVE: {
    http_status: 422,
    customer_message: "Sản phẩm hiện không khả dụng.",
  },
  // Went out of stock at execution time (EC-07).
  SUGGESTION_STOCK_CONFLICT: {
    http_status: 409,
    customer_message: "Sản phẩm vừa hết hàng. Gợi ý đã được cập nhật.",
  },
};

export class SuggestedItemError extends Error {
  readonly code: SuggestedItemErrorCode;
  readonly http_status: number;
  readonly customer_message: string;
  readonly details?: Record<string, unknown>;

  constructor(code: SuggestedItemErrorCode, details?: Record<string, unknown>) {
    const def = SUGGESTED_ITEM_ERRORS[code];
    super(def.customer_message);
    this.name = "SuggestedItemError";
    this.code = code;
    this.http_status = def.http_status;
    this.customer_message = def.customer_message;
    this.details = details;
  }
}

/** Type guard so the route can branch on our typed errors vs unexpected ones. */
export function isSuggestedItemError(e: unknown): e is SuggestedItemError {
  return e instanceof SuggestedItemError;
}
