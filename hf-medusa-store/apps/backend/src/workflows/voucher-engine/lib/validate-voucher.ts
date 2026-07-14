/**
 * VoucherEngine fail-fast validation chain (task 3.2.12, SPEC §B.3 line 268).
 *
 * Runs V1→V8 sequentially, cheapest→most expensive, and returns the FIRST failure
 * (short-circuit) or { ok: true }. Ordering (cheap field checks before cart scans) is
 * what lets applyVoucher hit its p95 < 400ms target. Pure: no I/O, no clock — the
 * caller passes `now` and pre-fetched voucher/cart/usage in the context.
 */
import {
  v1Exists,
  v2Window,
  v3GlobalLimit,
  v4UserLimit,
  v5MinOrder,
  v6Scope,
  v7Segment,
  v8Stacking,
  validateCodeFormat,
} from "./validators";
import type { ValidationResult, VoucherValidationContext } from "./types";

export function validateVoucher(
  ctx: VoucherValidationContext,
): ValidationResult {
  // Format check first — malformed codes collapse into V1 NOT_FOUND (see validators.ts).
  const format = validateCodeFormat(ctx.voucher?.code);
  if (!format.ok) return format;

  // V1 — exists + active. On pass, voucher is guaranteed non-null.
  const r1 = v1Exists(ctx.voucher);
  if (!r1.ok) return r1;
  const voucher = ctx.voucher!; // narrowed: v1Exists rejected null

  // V2–V4 — cheap field/count checks.
  const r2 = v2Window(voucher, ctx.now);
  if (!r2.ok) return r2;

  const r3 = v3GlobalLimit(voucher);
  if (!r3.ok) return r3;

  const r4 = v4UserLimit(voucher, ctx.user_usage_count);
  if (!r4.ok) return r4;

  // V5–V8 — cart-dependent checks (more expensive).
  const r5 = v5MinOrder(voucher, ctx.cart);
  if (!r5.ok) return r5;

  const r6 = v6Scope(voucher, ctx.cart);
  if (!r6.ok) return r6;

  const r7 = v7Segment(voucher);
  if (!r7.ok) return r7;

  const r8 = v8Stacking(voucher, ctx.cart);
  if (!r8.ok) return r8;

  return { ok: true };
}
