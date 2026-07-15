/**
 * Auto-remove notification builder — SPEC §11.3 step 3b / §8.4 (tasks 3.5.9,
 * 3.5.10). Pure data — NO Medusa imports, unit-testable.
 *
 * When `revalidateVoucherWorkflow` auto-removes a voucher after a cart change
 * (the V1/V2/V5/V6/V8 subset failed — §9.2), the customer must be told WHY.
 * The removal is asynchronous (it happens in a `cart.updated` subscriber, not
 * in the request the customer submitted), so per SPEC §8.4 the reason is NOT
 * returned synchronously — it is surfaced as a `VOUCHER_AUTO_REMOVED`
 * notification the storefront reads on its next cart refetch (PD-09: real-time
 * push is deferred, MVP = refetch/polling). The natural, already-approved
 * channel for that async message is `cart.metadata` (§14.2 — metadata is the
 * auxiliary messaging snapshot, never the authoritative amount); this builder
 * produces the object written under `cart.metadata.voucher_notice`.
 *
 * The FE keys behavior on `reason_code` (the specific V-rule that failed) and
 * displays `customer_message` verbatim — it never parses the message text
 * (mirrors the error-catalog convention in `errors.ts`).
 */

import { VOUCHER_ERRORS } from "./errors";
import type { VoucherErrorCode } from "./types";

/** Metadata key the async auto-removal notice is written under (§14.2 messaging snapshot). */
export const VOUCHER_NOTICE_METADATA_KEY = "voucher_notice" as const;

/**
 * The async notification object written to `cart.metadata.voucher_notice` when a
 * voucher is auto-removed on cart change. Read by the storefront on refetch.
 */
export interface VoucherAutoRemoveNotice {
  /** Always the umbrella code so the FE can branch on "a voucher was auto-removed". */
  code: "VOUCHER_AUTO_REMOVED";
  /** The specific V-rule that triggered removal (min order, no eligible items, …). */
  reason_code: VoucherErrorCode;
  /** The removed voucher's code (for the message + FE display). */
  voucher_code: string;
  /** Short Vietnamese reason phrase filled into the umbrella message. */
  reason_vi: string;
  /** Ready-to-display Vietnamese message (VOUCHER_AUTO_REMOVED template, placeholders filled). */
  customer_message: string;
}

/**
 * Short Vietnamese reason phrase per failing rule, filling `{reason}` in the
 * VOUCHER_AUTO_REMOVED template. Covers exactly the auto-removal triggers of the
 * §9.2 subset (V5 min order → 3.5.9; V6 no eligible items → 3.5.10; plus
 * V1/V2/V8, which can also fail on revalidation). Any other/unknown code falls
 * back to a generic phrase so the notice is always well-formed.
 */
const AUTO_REMOVE_REASON_VI: Partial<Record<VoucherErrorCode, string>> = {
  // 3.5.9 — cart no longer meets the minimum order value.
  VOUCHER_MIN_ORDER_NOT_MET: "giỏ hàng không còn đạt giá trị tối thiểu",
  // 3.5.10 — no cart item still matches the voucher's product/category scope.
  VOUCHER_NO_ELIGIBLE_ITEMS: "giỏ hàng không còn sản phẩm phù hợp",
  VOUCHER_EXPIRED: "mã đã hết hạn",
  VOUCHER_NOT_YET_VALID: "mã chưa tới ngày sử dụng",
  VOUCHER_INACTIVE: "mã không còn hiệu lực",
  VOUCHER_NOT_FOUND: "mã không còn hiệu lực",
  VOUCHER_STACKING_CONFLICT: "mã không dùng chung với ưu đãi hiện có",
};

const GENERIC_REASON_VI = "giỏ hàng không còn đáp ứng điều kiện của mã";

/**
 * Build the auto-removal notice from the removed voucher's code and the
 * specific failure code the revalidation subset returned. `failure_code` is
 * optional/defensive: revalidation always sets it on the auto-remove path, but
 * an unknown/missing code still yields a well-formed generic notice.
 */
export function buildAutoRemoveNotice(input: {
  voucher_code: string;
  failure_code?: VoucherErrorCode;
}): VoucherAutoRemoveNotice {
  const reason_code = input.failure_code ?? "VOUCHER_AUTO_REMOVED";
  const reason_vi = AUTO_REMOVE_REASON_VI[reason_code] ?? GENERIC_REASON_VI;

  // Fill the umbrella template ("Mã giảm giá {code} đã được tự động xóa vì {reason}.")
  // from the error catalog — single source for the wording (§8.4).
  const template = VOUCHER_ERRORS.VOUCHER_AUTO_REMOVED.customer_message;
  const customer_message = template
    .replace("{code}", input.voucher_code)
    .replace("{reason}", reason_vi);

  return {
    code: "VOUCHER_AUTO_REMOVED",
    reason_code,
    voucher_code: input.voucher_code,
    reason_vi,
    customer_message,
  };
}
