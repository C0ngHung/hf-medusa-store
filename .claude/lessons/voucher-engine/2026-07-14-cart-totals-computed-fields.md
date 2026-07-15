# Medusa Cart computed totals read as `0`/`undefined` through `query.graph` — must load via `CartModuleService.retrieveCart` with `select`

## Problem

`verifyCartTotalsStep` (the step that proves a computed voucher discount matches what Medusa's
Cart module actually recorded) needed to read authoritative `cart.total`/`cart.discount_total`
after a Promotion adjustment was attached to a cart. Reading them via `query.graph({ entity: "cart",
... })` — the same mechanism used elsewhere in this module for cart _line_ data — always returned
`total: 0` / `discount_total: 0`, even against a cart with a real, correctly-persisted adjustment.

## Incorrect assumption or failed approach

Two separate wrong beliefs compounded this, from two different sessions — record both, because
either one recurs independently:

1. **"`query.graph` on `"cart"` returns computed totals because the field list is documented as
   valid."** The SPEC's own verification notes (written before this was checked against a live
   cart) treated `original_item_subtotal`, `item_subtotal`, `discount_total`, `total`, etc. as
   "computed fields returned by `query.graph`" because those are real, requestable field names in
   `carts/query-config.js`. Being a valid field name is not the same as the value being non-zero —
   this was never actually run against a live cart with an attached Promotion before being written
   down as verified.
2. **"The zero-total result is because the test cart was created directly via
   `cartModuleService.createCarts()`, bypassing `addToCartWorkflow`/standard checkout workflows."**
   An earlier session hit the `total: 0` result, and — under time pressure — concluded the _cart's
   creation path_ was the cause, reasoning that only Medusa's standard cart-mutation workflows
   compute totals. This is also wrong, and was later disproven empirically: the same `total: 0`
   result occurs for a cart built through any path, read through `query.graph`/`remoteQuery`. The
   creation-path theory was a plausible-sounding but unverified guess that stood as documented fact
   for one full session before a later session re-tested it directly.

## Root cause

`total`, `discount_total`, `item_total`, etc. on the Cart model are declared
`model.bigNumber().computed()` — virtual fields with **no backing DB column**. They are populated
**only** by `decorateCartTotals()` (`@medusajs/utils/dist/totals/cart/index.js`), which is invoked
**only** inside `CartModuleService.retrieveCart` / `.listCarts` / `.listAndCountCarts`
(`@medusajs/cart/dist/services/cart-module.js`), and only when the caller's `config.select`
includes at least one total-like field name (gated by that service's own internal
`shouldIncludeTotals(config)` check). `query.graph`/`remoteQuery` (and the shipped `refetchCart`
helper that real `GET /store/carts/:id` uses for line data) go through the generic remote-query
data loader, which **never invokes `decorateCartTotals`** — so every computed total field reads
back as `0` through that path, regardless of how the cart was created.

## Verified evidence

Empirically confirmed by creating one cart, attaching one real 10%-of-1,000,000 Promotion via the
real `updateCartPromotionsWorkflow`, then reading it back three ways in the same test run:

- `cartModuleService.retrieveCart(id, { relations: ["items"] })` (no `select`) → `total`
  **undefined** (the field is absent entirely without the `select` gate — not even `0`).
- `container.resolve("query").graph({ entity: "cart", fields: [...with "total"...] })` → `total: 0`.
- `remoteQueryObjectFromString({ entryPoint: "cart", ... })` + raw `REMOTE_QUERY` (the literal
  mechanism the shipped `refetchCart` helper uses) → also `total: 0` — proving this is a property
  of the remote-query path itself, not of a specific container registration key.
- `cartModuleService.retrieveCart(id, { select: ["id","total","subtotal","item_total",
"discount_total"], relations: ["items","items.adjustments"] })` → **`total: 900000`,
  `discount_total: 100000`** — correct.

Source verified directly: `@medusajs/cart/dist/models/cart.js` (computed field declarations),
`@medusajs/utils/dist/totals/cart/index.js` (`decorateCartTotals`), `@medusajs/cart/dist/services/
cart-module.js` (`shouldIncludeTotals` gate on `retrieveCart`/`listCarts`/`listAndCountCarts`).

## Resolution

`verifyCartTotalsStep` now resolves `Modules.CART` and calls
`cartModuleService.retrieveCart(cart_id, { select: ["id","total","discount_total"], relations:
["items","items.adjustments"] })` instead of `query.graph`. `loadCartContextStep` did **not** need
this fix — it never reads the `.computed()` aggregate fields; it sums `items.unit_price` /
`items.quantity` / `items.adjustments[].amount` (real, non-computed columns) itself via the pure
calculator. The bug was scoped to exactly the one step that read an aggregate total.

## Prevention rule

Before trusting **any** Cart (or other module) field read through `query.graph`/`remoteQuery` as
non-zero/authoritative, check whether the model declares it `model.bigNumber().computed()` (or any
other `.computed()` field). If so, it must be read through that module's own module-service
retrieve/list method with the field explicitly named in `select` — never assume a field is
populated just because it's a valid, requestable field name in a `query-config.js` fields list.
When in doubt, verify empirically against a live record with the relevant relation attached (as
above) rather than trusting a framework-behavior claim that hasn't been run — including a claim
already written down as "verified" in this project's own SPEC, if it predates an actual live check.

## Applicability

Applies to: any VoucherEngine (or other module) step/service reading Cart, Order, or other
Medusa-core `.computed()` totals fields via `query.graph`/`remoteQuery`. Does **not** apply to
non-computed fields (e.g. `items.unit_price`, `items.quantity`, `items.adjustments[].amount`,
`items.product_id`) — those are real columns and read correctly through either path; do not
over-apply this rule to justify avoiding `query.graph` for line-level data, which remains the
correct mechanism there (see `loadCartContextStep`).

## Related task IDs

3.3.14 (Final Cart total recalculation from authoritative Cart data), 3.8.4 (Cart total is the
single pricing truth).

## Related SPEC sections

§10.7 (source of `item_promotion_discount`/original line totals — the field-list claim was
accurate for field _names_, not for non-zero values through `query.graph`), §14.2-A, §23.4
(`verify-cart-totals.ts` code-level blueprint). No SPEC text was changed as a result of this
finding — it was a correction to an implementation detail (which API to call), not to the SPEC's
business rules.

## Relevant production and test files

- `apps/backend/src/workflows/voucher-engine/steps/verify-cart-totals.ts` (the fix).
- `apps/backend/src/workflows/voucher-engine/steps/load-cart-context.ts` (confirmed correct as-is —
  never reads computed aggregates).
- `apps/backend/integration-tests/http/voucher-engine-resolve-workflow.spec.ts` (the test rewritten
  to assert real reconciliation — `result.verification.cart.total === 900_000` — instead of only
  asserting fail-safe behavior).

## Revision history

- 2026-07-14: initial lesson captured from the VoucherEngine progress file's 2026-07-14 (session 2)
  entry, which itself corrected a wrong diagnosis recorded in the 2026-07-13/2026-07-14 (session 1)
  entries. This lesson was written directly from the corrected (session 2) root cause; the
  superseded "cart-creation-path" theory is recorded above only as an example of a compounding wrong
  belief, not as guidance.
