/**
 * Pure comparison for the EC-04 optimistic-concurrency guard — kept separate
 * from `steps/assert-cart-unchanged.ts`'s I/O so the decision itself is
 * unit-testable without a workflow context (mirrors the lib/ vs steps/ split
 * used throughout VoucherEngine, e.g. lib/validate-voucher.ts vs
 * steps/validate-voucher.ts). No Medusa imports.
 */

/**
 * A cart is "unchanged" when its freshly-read `updated_at` still matches the
 * `concurrency_marker` captured earlier in the same workflow. `undefined`
 * (cart not found on re-read) is always a mismatch.
 *
 * Both sides are compared by TIMESTAMP, not by raw `===`: `query.graph`
 * returns `updated_at` as a real `Date` instance when read directly inside a
 * step, but the SAME field, once it has passed through the workflow engine's
 * step-to-step data marshalling (e.g. captured earlier as
 * `CartContext.concurrency_marker` and threaded into this step's input),
 * arrives as a JSON-serialized ISO string — `Date instance !== string` under
 * `===` even for the identical instant (verified empirically: both
 * serialized to the same ISO string, but `typeof` differed — `"object"` vs
 * `"string"`).
 */
export function isCartUnchanged(
  currentUpdatedAt: string | Date | undefined,
  expectedConcurrencyMarker: string | Date,
): boolean {
  if (currentUpdatedAt === undefined) return false;
  return (
    new Date(currentUpdatedAt).getTime() ===
    new Date(expectedConcurrencyMarker).getTime()
  );
}
