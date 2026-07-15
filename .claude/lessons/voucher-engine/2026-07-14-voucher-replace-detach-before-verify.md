# Replacing a voucher: detach the OLD ephemeral Promotion BEFORE verifying the cart total, not after — the underlying core step already has safe rollback

## Problem

`applyVoucherWorkflow`'s replace path (apply a second voucher with `?replace=true` while one is
already active) created the NEW ephemeral Promotion, attached it, wrote the new metadata snapshot,
then ran `verifyCartTotalsStep` (which reads the Cart module's own recomputed `total` and compares
it to VoucherEngine's internally-calculated expected total) — and only AFTER that detached +
deleted the OLD ephemeral Promotion. Every replace-flow HTTP integration test call failed with a
500 `VOUCHER_CALCULATION_FAILED` (thrown by `verifyCartTotalsStep`'s total-mismatch check).

## Incorrect assumption or failed approach

The ordering was deliberately chosen this way under the rule "never remove a valid existing voucher
before the replacement is validated" — the intent being: don't touch the old (working) voucher
until we know the new one is good. This reasoning is correct for the IRREVERSIBLE step (deleting the
old Promotion ENTITY), but was wrongly applied to the REVERSIBLE step too (detaching/removing the
old Promotion's adjustment FROM THE CART) — the two were conflated as a single "don't touch the old
one yet" unit.

## Root cause

`verifyCartTotalsStep` reads the Cart's own recomputed `total` (via `CartModuleService.retrieveCart`
with `select` including `total`) and compares it to VoucherEngine's internally-calculated
`expected_final_cart_total`, which is computed assuming ONLY the NEW voucher's discount applies. If
the OLD ephemeral Promotion is still attached to the cart at verification time, the Cart's real total
reflects BOTH discounts stacked (old + new), which will never match the single-discount expectation
— a guaranteed mismatch, not an intermittent one, whenever `activeCheck.previous` is set.

The fix requires separating "detach from cart" (reversible) from "delete the Promotion entity"
(irreversible): `updateCartPromotionsWorkflow`'s `REMOVE` action ultimately calls
`removeLineItemAdjustmentsStep` (`@medusajs/core-flows/dist/cart/steps/
remove-line-item-adjustments.js`), which **soft-deletes** the line item adjustment and has an actual
compensation function that calls `cartModuleService.restoreLineItemAdjustments(...)` — verified by
reading that step's source directly. So detaching the old Promotion from the cart BEFORE
verification is safe: if verification then fails, Medusa's own step-compensation rollback (which
runs automatically for every already-completed step when a LATER step in the same workflow throws)
restores the old adjustment exactly as it was. Only the FINAL, irreversible
`deletePromotionsWorkflow` call (which actually destroys the Promotion row) needs to wait until
AFTER verification succeeds.

## Verified evidence

Reproduced the failure deterministically (every replace-flow HTTP test run, not intermittent) with
the original after-verify ordering; the error log showed `verify-cart-totals.ts:162` (the
total-mismatch branch, not the per-adjustment-amount branch — confirming the NEW promotion's own
adjustment amount was correct, only the cart's overall total was polluted by the still-attached OLD
one). After moving the `updateCartPromotionsWorkflow` `REMOVE` call for the old Promotion's code to
run BEFORE `verifyCartTotalsStep` (keeping the `deletePromotionsWorkflow` call for the old
Promotion's id AFTER verification, unchanged), the replace-flow test passed, and a second full run
confirmed it wasn't a fluke.

## Resolution

`apps/backend/src/workflows/voucher-engine/apply-voucher.ts` now has TWO separate `when({
hasPrevious }, ...)` blocks (both flat/top-level, not nested — see the workflow-composer-when
lesson) around the SAME `hasPrevious` boolean:

1. Immediately after `checkActiveVoucherStep`, before anything else: `updateCartPromotionsWorkflow
.runAsStep({ ...REMOVE old code... }).config({ name: "detach-old-ephemeral-promotion" })`.
2. After `verifyCartTotalsStep` succeeds: `deletePromotionsWorkflow.runAsStep({ ids: [oldPromotionId]
})` (the entity delete — unchanged from before, still irreversible-by-design, still gated on the
   same `hasPrevious`).

## Prevention rule

When a workflow both (a) mutates a resource's ATTACHED/ACTIVE state and (b) later verifies the
resulting aggregate state (a total, a count, a computed field) before finalizing, order any
"detach/undo the old thing" step BEFORE the verification, not after — provided the detach step has
real compensation (check the underlying core step's source, don't assume). Reserve "wait until
verified" ONLY for the genuinely irreversible step (an actual delete/destroy), never for a
reversible attach/detach toggle that the verification step's own success/failure depends on seeing
the correct final state.

## Applicability

Applies to: any VoucherEngine (or future) workflow that replaces one applied discount/Promotion with
another and then verifies the Cart's resulting total — currently `applyVoucherWorkflow`'s replace
path. `revalidateVoucherWorkflow`'s recompute branch (attach new, write metadata, THEN detach+delete
old) does NOT have this bug because it has no `verifyCartTotalsStep`-style assertion in the middle —
its final state is correct either way, just with a brief mid-workflow window where both Promotions
are attached; that window was left as-is (not a defect, and no test target failed because of it) but
is worth revisiting if a future revalidation contract adds a total-verification check like `apply`'s.

## Related task IDs

3.4.7 (replace-confirmation), 3.4.8 (confirmed-replace swap), 3.4.14 (authoritative Cart total in
response).

## Related SPEC sections

§11.1 (apply/replace flow steps), §14.2-A (`verifyCartTotalsStep` contract), §14.2-C (concurrency
lock — unaffected). No SPEC text changed — this is a step-ordering fix within the already-approved
workflow design, not a business-rule or contract change.

## Relevant production and test files

- `apps/backend/src/workflows/voucher-engine/apply-voucher.ts` (the reordering + explanatory
  comment).
- `apps/backend/integration-tests/http/apply-remove-voucher.spec.ts` ("returns 409
  VOUCHER_REPLACE_REQUIRED... successful replace with `?replace=true`" test — the one that
  surfaced, then confirmed, this fix).

## Revision history

- 2026-07-14: initial lesson captured while implementing Thức's VoucherEngine Day 4 tasks, after the
  reordering fix was verified against a real, previously deterministically-failing HTTP integration
  test.
