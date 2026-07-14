/**
 * Cart-change revalidation subset (SPEC §9.2, task 3.5.1/3.5.7/3.5.8) — re-runs
 * ONLY V1, V2, V5, V6, V8, deliberately SKIPPING V3/V4/V7:
 *
 *  - V3 (global usage) / V4 (per-user usage): usage is not consumed until
 *    order placement (Rule 12/13) — removing an already-applied cart voucher
 *    because the GLOBAL counter moved elsewhere would punish a customer
 *    mid-checkout (EC-06). Usage capacity is re-checked authoritatively only
 *    at redemption (§14.3).
 *  - V7 (segment): stub pass-through (PD-06); segment eligibility does not
 *    change from a cart mutation.
 *
 * A separate function (not a modification of the shared full V1–V8
 * `validateVoucher()` in `lib/validate-voucher.ts`, owned by the Day 3 V1–V8
 * chain) so the apply-time full pipeline and the cart-change subset can never
 * drift from each other by accident — each calls the same individual,
 * independently-tested validator functions (`lib/validators.ts`), just a
 * different subset/order.
 */

import {
  v1Exists,
  v2Window,
  v5MinOrder,
  v6Scope,
  v8Stacking,
} from "./validators";
import type { ValidationResult, VoucherValidationContext } from "./types";

export function revalidateVoucherOnCartChange(
  ctx: VoucherValidationContext,
): ValidationResult {
  const r1 = v1Exists(ctx.voucher);
  if (!r1.ok) return r1;
  const voucher = ctx.voucher!; // narrowed: v1Exists rejected null

  const r2 = v2Window(voucher, ctx.now);
  if (!r2.ok) return r2;

  const r5 = v5MinOrder(voucher, ctx.cart);
  if (!r5.ok) return r5;

  const r6 = v6Scope(voucher, ctx.cart);
  if (!r6.ok) return r6;

  const r8 = v8Stacking(voucher, ctx.cart);
  if (!r8.ok) return r8;

  return { ok: true };
}
