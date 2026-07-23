# Scoped voucher + multi-item cart: the `fixed`/`across` ephemeral promotion (no `target_rules`) splits the discount into FRACTIONAL per-line adjustments, and `verify-cart-totals`' per-adjustment `toInt` throws

## Problem

Writing a Day-5 revalidation test that (a) applies a SCOPED voucher
(`applicable_product_ids: ["prod_racket"]`, 10%) to a cart holding TWO items
(racket 2,000,000 + shoes 1,500,000) then (b) removes the eligible item, the
`applyVoucherWorkflow` step (a) failed at `verifyCartTotalsStep` with:

```
MoneyError: [voucher-engine money] verify-cart-totals.adjustment.amount:
expected an integer monetary value, got 114285.71428571429
```

Apply never completed, so the intended "no eligible items → auto-remove" state
was never reached. The same voucher on a SINGLE-item cart applies fine.

## Incorrect assumption or failed approach

Assumed a scoped voucher whose computed `final_voucher_discount` is a clean
integer (200,000 = 10% of the eligible 2,000,000 racket) would land on the cart
as an integer adjustment, the way it does for a single-item cart. It does not
once the cart has more than one discountable line.

## Root cause

The apply/revalidate ephemeral promotion is created as
`application_method: { type: "fixed", target_type: "items", allocation:
"across", value: final_voucher_discount }` with **no `target_rules`** (see
`apply-voucher.ts` / `revalidate-voucher-on-cart-change.ts`). Medusa's `across`
allocation spreads the fixed `value` **proportionally across every discountable
line** (`getPromotionValueForFixed`), not only the voucher-eligible lines. With
two lines the per-line split is `200000 * 2000000/3500000 = 114285.714…` and
`200000 * 1500000/3500000 = 85714.285…` — the SUM is exactly 200,000 (integer,
as designed) but each individual `items.adjustments[].amount` is fractional.
`verifyCartTotalsStep` calls `toInt(adjustment.amount)` **per adjustment** before
summing, and `toInt` rejects any non-integer → throw. So the integer invariant
is asserted at the wrong granularity: only the TOTAL must be an integer, but the
check enforces it per line.

## Verified evidence

Reproduced empirically this session in
`integration-tests/http/revalidate-voucher-workflow.spec.ts`: a scoped 10%
voucher on a `[racket 2,000,000, shoes 1,500,000]` cart threw the MoneyError
above at `verify-cart-totals.adjustment.amount`; the identical voucher on a
single-item `[racket]` cart applied cleanly (across over one line = the whole
200,000, integer). The `across` sum-to-value behavior is the one documented and
source-verified in SPEC §14.2-A (`getPromotionValueForFixed`,
`@medusajs/utils/dist/totals/promotion/index.js`).

## Resolution

**Fixed 2026-07-16** on `fix/voucher-engine-code-review-findings` (commit `69ff1af`), implementing candidate
fix 1 below. `money.ts` gained an exported `sumRawToInt(values: unknown[], label: string): number` that sums
per-line adjustments at full raw precision (via the also-newly-exported `toRawNumber`, the prior
module-private `unwrapNumeric` renamed), rounds the aggregate with `Math.round`, and only then asserts the
result is within `1e-6` of that rounded integer and a safe integer — rejecting a genuinely fractional total
(a real bug) while tolerating the `across`-split floating-point noise. `verifyCartTotalsStep`
(`steps/verify-cart-totals.ts`) now maps the voucher's own adjustments to their raw (unconverted) `.amount`
and sums them with `sumRawToInt`, instead of `toInt`-ing each adjustment before `sumInts`. The separate
Rule-11-shrink-guard sum a few lines below (non-voucher item/order promotion adjustments) intentionally
still uses the strict per-line `toInt`/`sumInts` path — those are ordinary (non-`across`-split) adjustments,
so the per-line integer invariant still holds there. Candidate fix 2 (narrowing `target_rules`) was not
pursued — as this lesson already noted, it doesn't remove the need for fix 1 with ≥2 eligible lines, so
fix 1 alone is sufficient and was the minimal change. Test coverage: 8 new cases in
`apps/backend/src/modules/voucher-engine/lib/__tests__/money.unit.spec.ts` for `sumRawToInt`/`toRawNumber`,
including a direct reproduction of this lesson's exact numbers (114285.714285714... + 85714.285714286...
summing to exactly 200,000) — `pnpm test:unit` 231/231 passing, no regression.

Two candidate fixes were considered (fix 1 was chosen; kept here for context):

1. Sum the voucher's adjustments **raw** (full precision) and `toInt` only the
   SUM in `verifyCartTotalsStep` — the per-line fractions are a Medusa
   allocation artifact; only the aggregate is the money invariant. (Minimal,
   matches "cart total is the single truth".) **← this is the fix that shipped.**
2. Pass `target_rules` narrowing the ephemeral promotion to the eligible line
   ids so `across` only spreads over eligible items — still can be fractional
   with ≥2 eligible items, so this alone does not remove the need for (1). Not
   pursued, for that reason.

## Prevention rule

When asserting the integer-money invariant (INT-01) on Medusa Promotion
adjustments produced by a `fixed`/`across` application method, assert it on the
**summed** amount, never per individual `items.adjustments[].amount` — `across`
legitimately produces fractional per-line splits whose sum is the intended
integer. Use `money.ts`'s `sumRawToInt` for exactly this case (raw per-line
values in, integer-checked aggregate out); reach for plain `toInt`/`sumInts`
only when the individual line values are themselves guaranteed integer (e.g.
`percentage`-type adjustments, or non-`across` allocations). Any code that does
`toInt(perLineAdjustment)` before summing will throw on any multi-line cart.
When writing a test that applies a SCOPED voucher, use a single eligible line
(or verify the split is integer) unless the test is specifically exercising the
multi-item allocation path.

## Applicability

Applies to: `verifyCartTotalsStep`'s voucher-adjustment sum (now using
`sumRawToInt` — fixed) and any future code summing VoucherEngine's
ephemeral-promotion adjustments; any apply/revalidate path creating a
`fixed`/`across` promotion; any integration test applying a scoped voucher to a
cart with more than one discountable line. Does not apply to single-line carts,
to `percentage`-type application methods (which Medusa rounds per line
itself), or to `verifyCartTotalsStep`'s separate non-voucher
(Rule-11-shrink-guard) adjustment sum, which is not `across`-split and
correctly stays on the strict per-line `toInt`/`sumInts` path.

## Related task IDs

Surfaced under 3.5.3/3.5.10 (Day-5 revalidation tests, Hùng). Root cause and fix
belong to 3.4.1/3.4.4–3.4.10 apply + §23.4 `verify-cart-totals` (Thức).

## Related SPEC sections

§14.2-A (ephemeral promotion, `fixed`/`across` sum-to-value), §23.4
(`verify-cart-totals`), §10 (discount calc / INT-01). No SPEC text changed — this
is an implementation-granularity bug (where the integer assertion is applied),
not a business-rule change.

## Relevant production and test files

- `apps/backend/src/modules/voucher-engine/lib/money.ts` (the fix — exported
  `sumRawToInt`/`toRawNumber`).
- `apps/backend/src/modules/voucher-engine/lib/__tests__/money.unit.spec.ts`
  (test coverage for the fix, added 2026-07-16, including the exact
  lesson-repro numbers).
- `apps/backend/src/workflows/voucher-engine/steps/verify-cart-totals.ts` (now
  calls `sumRawToInt` for the voucher's own adjustment total — the
  per-adjustment `toInt` that used to throw here is gone; the separate
  non-voucher Rule-11-shrink-guard sum a few lines below is unaffected and
  still uses `toInt`/`sumInts`).
- `apps/backend/src/workflows/voucher-engine/apply-voucher.ts` (creates the
  `fixed`/`across` ephemeral promotion with no `target_rules` — unchanged;
  candidate fix 2 was not pursued).
- `apps/backend/integration-tests/http/revalidate-voucher-workflow.spec.ts`
  (the no-eligible-items test, restructured to avoid the multi-item apply
  path — still not un-restructured; a dedicated HTTP-level regression test for
  the now-fixed multi-item scoped-apply path is a follow-up, not yet added).

## Revision history

- 2026-07-15: captured while implementing Hùng's VoucherEngine Day-5 revalidation
  tests, after a scoped-voucher multi-item cart reproduced the MoneyError at apply.
- 2026-07-16: corrected "Resolution", "Prevention rule", "Applicability", and
  "Relevant production and test files" — the bug is fixed (candidate fix 1,
  `sumRawToInt`), on `fix/voucher-engine-code-review-findings` commit `69ff1af`,
  with unit test coverage. No longer an open handoff.
