# `CartModuleService.updateCarts`'s `metadata` patch is a MERGE, not a replace — omitting a key preserves it; only `""` deletes it

## Problem

Two Day-4 workflows (`removeVoucherWorkflow`, `revalidateVoucherWorkflow`'s auto-remove branch)
each had a step meant to clear `cart.metadata.voucher` once a voucher was removed/invalidated. Both
destructured the `voucher` key out of the existing metadata object (`const { voucher, ...rest } =
metadata`) and called `cartModuleService.updateCarts(cart_id, { metadata: rest })`. The write
appeared to succeed (no error), but a subsequent read of `cart.metadata.voucher` showed the OLD
snapshot completely unchanged — as if the update never ran.

## Incorrect assumption or failed approach

Assumed `updateCarts(id, { metadata })` REPLACES the `metadata` column with exactly the object
passed — the same mental model as a plain SQL `UPDATE ... SET metadata = $1`. Under that model,
passing an object that simply omits a key is a correct way to delete it. Spent real debugging time
suspecting the `when()` branch wasn't firing at all (added step-level `console.log`s to confirm
`shouldRemove` was `true` and the clear step _did_ execute with the expected `rest = {}` input)
before checking the persistence layer itself.

## Root cause

Every `MedusaService`-based module's generic entity-update path (including `CartModuleService`,
which extends the same base) runs new `metadata` through `mergeMetadata(existing, patch)`
(`@medusajs/utils/dist/common/merge-metadata.js`, invoked from `dist/modules-sdk/
medusa-internal-service.js:238`). Per that function's own logic: a key **present** in `existing` but
**absent** from `patch` is preserved unchanged; a key in `patch` whose value is the empty string
`""` is **deleted**; any other value in `patch` overwrites. Passing `{}` (or any object that simply
omits the key you want gone) therefore has ZERO effect on that key — it is a no-op, not a clear.

## Verified evidence

Confirmed via a real HTTP-level and workflow-level test both showing the exact same symptom
(metadata untouched after a "clear" call), then traced to `mergeMetadata`'s source and doc comment:
"If the key in the metadata to merge is an empty string, the key is removed from the merged
metadata object." After changing both `clearVoucherMetadataOnAutoRemoveStep`
(`revalidate-voucher-on-cart-change.ts`) and `clearVoucherCartMetadataStep` (`remove-voucher.ts`) to
call `updateCarts(cart_id, { metadata: { voucher: "" } })` instead of spreading a `rest` object, a
re-run of both the HTTP apply/remove suite (with a new assertion that `cart.metadata.voucher` is
`undefined` after DELETE) and the revalidate-workflow auto-remove test passed deterministically.

## Resolution

- `apps/backend/src/workflows/voucher-engine/remove-voucher.ts`:
  `clearVoucherCartMetadataStep` now takes only `{ cart_id }` and calls `updateCarts(cart_id,
{ metadata: { [VOUCHER_METADATA_KEY]: "" } })` — no more destructuring/spreading a `rest` object,
  no more `previous_metadata` input.
- `apps/backend/src/workflows/voucher-engine/revalidate-voucher-on-cart-change.ts`:
  `clearVoucherMetadataOnAutoRemoveStep` fixed identically.
- The RECOMPUTE path (`writeVoucherCartMetadataStep`, spreading `...previous_metadata, [KEY]:
newSnapshot`) was already correct by accident — it always sets the `voucher` key to a real value
  (never omits or deletes it), so the merge semantics were transparent there. Do not "simplify" that
  step to also use `""`-based logic; it never needs to delete a key, only set one.

## Prevention rule

Before writing ANY `<module>ModuleService.update<Entity>(id, { metadata: ... })` call meant to
**remove** a metadata key (not just add/overwrite one), check whether that module's update path
merges via `mergeMetadata` (true for anything extending the generic `MedusaService` base — which is
effectively every core and custom module, including Cart, Order, Customer, etc.) — if so, delete a
key by setting it to the **empty string `""`**, never by omitting it from the patch object. A patch
object that "looks like a correct partial update" by simply not mentioning a key is silently a
no-op for that key, not a clear — this is easy to get wrong because the write call succeeds without
error and looks correct at the call site.

## Applicability

Applies to: any metadata-clearing step/service call across this repo's custom modules
(VoucherEngine, SuggestiveSelling) or direct calls into Medusa core module services
(`Modules.CART`, `Modules.ORDER`, `Modules.CUSTOMER`, etc.) that use the generic `MedusaService`
update path. Does not apply to metadata **writes** that always set a real (non-`""`) value for the
key in question — those already work correctly under merge semantics without any special handling.

## Related task IDs

3.4.2, 3.4.10 (remove-voucher clears the metadata snapshot), 3.5.7, 3.5.8 (revalidate auto-remove
clears the metadata snapshot with reason `VOUCHER_AUTO_REMOVED`).

## Related SPEC sections

§11.2 (remove flow), §11.5/§13.3 (revalidate auto-remove), §14.2-B (the `cart.metadata.voucher`
snapshot's lifecycle, Decision G). No SPEC text changed — this is an implementation-detail
correction (how to call an existing, already-approved API), not a business-rule or contract change.

## Relevant production and test files

- `apps/backend/src/workflows/voucher-engine/remove-voucher.ts` (the fix + explanatory comment).
- `apps/backend/src/workflows/voucher-engine/revalidate-voucher-on-cart-change.ts` (the fix +
  explanatory comment).
- `apps/backend/integration-tests/http/apply-remove-voucher.spec.ts` ("removes an applied voucher"
  test — strengthened with an explicit `cart.metadata.voucher` `toBeUndefined()` assertion after
  this fix, since the prior version of the test only checked `updated_cart_total`/`usage_count` and
  would NOT have caught this bug).
- `apps/backend/integration-tests/http/revalidate-voucher-workflow.spec.ts` (new — the auto-remove
  test that originally surfaced this bug).

## Revision history

- 2026-07-14: initial lesson captured while implementing Thức's VoucherEngine Day 4 tasks
  (3.4.2/3.4.10/3.5.7/3.5.8), discovered via a real workflow-level integration test that asserted
  post-auto-remove metadata state (a test class that did not previously exist for this workflow).
