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

Not fixed this session — it lives in the apply/verify path (Thức's 3.4.x /
§11.1 step 9–10), which is OUT OF SCOPE for the Day-5 (Hùng) revalidation tasks.
The Day-5 test was restructured to apply on a single eligible item first, then
add a non-eligible item and remove the eligible one, so the eligible-items-removed
state is reached without tripping the multi-item apply path. Flagged as a
dependency/handoff for the apply owner. Two candidate fixes (for that owner to
choose, both server-side, no client trust):

1. Sum the voucher's adjustments **raw** (full precision) and `toInt` only the
   SUM in `verifyCartTotalsStep` — the per-line fractions are a Medusa
   allocation artifact; only the aggregate is the money invariant. (Minimal,
   matches "cart total is the single truth".)
2. Pass `target_rules` narrowing the ephemeral promotion to the eligible line
   ids so `across` only spreads over eligible items — still can be fractional
   with ≥2 eligible items, so this alone does not remove the need for (1).

## Prevention rule

When asserting the integer-money invariant (INT-01) on Medusa Promotion
adjustments produced by a `fixed`/`across` application method, assert it on the
**summed** amount, never per individual `items.adjustments[].amount` — `across`
legitimately produces fractional per-line splits whose sum is the intended
integer. Any code that does `toInt(perLineAdjustment)` before summing will throw
on any multi-line cart. When writing a test that applies a SCOPED voucher, use a
single eligible line (or verify the split is integer) unless the test is
specifically exercising the multi-item allocation path.

## Applicability

Applies to: `verifyCartTotalsStep` and any future code summing VoucherEngine's
ephemeral-promotion adjustments; any apply/revalidate path creating a
`fixed`/`across` promotion; any integration test applying a scoped voucher to a
cart with more than one discountable line. Does not apply to single-line carts
or to `percentage`-type application methods (which Medusa rounds per line
itself).

## Related task IDs

Surfaced under 3.5.3/3.5.10 (Day-5 revalidation tests, Hùng). Root cause and fix
belong to 3.4.1/3.4.4–3.4.10 apply + §23.4 `verify-cart-totals` (Thức).

## Related SPEC sections

§14.2-A (ephemeral promotion, `fixed`/`across` sum-to-value), §23.4
(`verify-cart-totals`), §10 (discount calc / INT-01). No SPEC text changed — this
is an implementation-granularity bug (where the integer assertion is applied),
not a business-rule change.

## Relevant production and test files

- `apps/backend/src/workflows/voucher-engine/steps/verify-cart-totals.ts` (the
  per-adjustment `toInt` that throws — candidate fix location).
- `apps/backend/src/workflows/voucher-engine/apply-voucher.ts` (creates the
  `fixed`/`across` ephemeral promotion with no `target_rules`).
- `apps/backend/integration-tests/http/revalidate-voucher-workflow.spec.ts`
  (the no-eligible-items test, restructured to avoid the multi-item apply path).

## Revision history

- 2026-07-15: captured while implementing Hùng's VoucherEngine Day-5 revalidation
  tests, after a scoped-voucher multi-item cart reproduced the MoneyError at apply.
