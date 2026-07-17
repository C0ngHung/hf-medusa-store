# Keep / Remove / Rebuild map

Every item below is grouped by disposition, with the rationale from the architecture review, the
file(s) it currently lives in (as of that review — verify current state before assuming these
paths are still accurate, code may have moved), and — for Rebuild items — what "done" looks like.

**Duplication-justification categories.** VoucherEngine must not duplicate a native
Promotion/Campaign field or mechanism unless the duplication is explicitly justified by one of
four categories: **SRS behavior** the native mechanism can't express, **atomicity** the native
mechanism can't guarantee, **CRM sourcing** the native mechanism doesn't cover, or the
**Vietnamese response contract** the native mechanism has no equivalent for. Every item in the
Keep table below is justified by at least one of these; every item in the "Remove or avoid
duplicating" table has no such justification (or the justification is explicitly still open, in
which case the table says so — see `per_user_limit` below).

## Keep unless proven wrong

These have **no native Promotion/Campaign equivalent**, or are demonstrably more correct than the
native equivalent. Do not remove or replace them as a side effect of another phase; only change
them if a specific test or verified framework fact proves them wrong, and record that proof.

| Item                                                                                                        | Why it's justified custom capability                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Current location                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| V1→V8 fail-fast validation order (**V7 segment validation is mandatory** — no longer a deferred no-op stub) | SRS-specific sequencing with a Vietnamese-first error contract; no native equivalent at all. V7's eligibility data comes from **CRM campaign/customer assignment logic** (Phase 0, confirmed decision), not necessarily native Medusa customer groups — whether/how it also intersects with native Promotion customer-group rules is an open Phase 1 question, not resolved here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `src/workflows/voucher-engine/steps/validate-voucher.ts`, `lib/validators.ts`                                                         |
| Pure integer discount calculation (item-promo-first, voucher-second, cap-reduces-only-voucher)              | Native `computeActions` cannot express this ordering — verified: it sorts by buy-get-type then `application_method.value DESC`, with no Rule-11 concept. **Note:** this diagnosis is historical context for the old implementation, where "item-level promotion" meant a Promotion line-item adjustment. Per Phase 0 (decision 4), "item-level promotion" here means the Price List sale price from the Pricing Module instead, unless a section explicitly states otherwise — under that meaning, `computeActions`'s ordering is irrelevant to the SRS's normal path (no Promotion adjustment involved) and only matters in the narrow case where a native Promotion line-item adjustment coexists with the voucher on the same items. Phase 1 verifies that narrow case; this calculation's own logic (cap math, priority) stays custom regardless of the outcome | `src/workflows/voucher-engine/steps/calculate-voucher-discount.ts`, `lib/calculate-discount.ts`                                       |
| `DiscountCapConfig` concept                                                                                 | No native "global cap across all discount sources" — Campaign spend-budget is scoped per-campaign, not store-wide                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `src/modules/voucher-engine/models/discount-cap-config.ts`                                                                            |
| `VoucherUsageLog` append-only audit, **created only after successful order placement**                      | No native per-redemption audit ledger with this level of point-in-time snapshot (raw/final discount, cap flag, currency, etc.). The order-placement-only creation timing is a Phase 0 confirmed decision — a locked constraint, not just an implementation detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `src/modules/voucher-engine/models/voucher-usage-log.ts`                                                                              |
| Atomic redemption (`redeemVoucherAtomic`)                                                                   | Native `registerUsage` is a read-modify-write inside a workflow step, not an atomic conditional update — VoucherEngine's own mechanism is more correct and satisfies INT-02; native `Promotion.used`/`CampaignBudget.used` should remain a secondary, non-authoritative mirror only, exactly as SPEC.md §5.0 already specifies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `src/modules/voucher-engine/service.ts` (`redeemVoucherAtomic`), `steps/atomic-redeem.ts`                                             |
| Rate limiting for failed voucher attempts                                                                   | No native concept of brute-force protection on discount-code entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `src/lib/voucher-rate-limit.ts`, `src/api/middlewares/voucher-rate-limit.ts`, `src/workflows/voucher-engine/lib/rate-limit-policy.ts` |
| "My Vouchers" store API concept, **sourced from CRM campaign/customer assignment logic**                    | No native customer-facing offer catalog with per-cart eligibility/savings preview. The CRM-sourcing is a Phase 0 confirmed decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `src/api/store/customers/me/vouchers/route.ts`                                                                                        |
| Auto-revalidation on cart change                                                                            | Business-specific UX (auto-remove-with-reason messaging); not a platform concept                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `src/workflows/voucher-engine/revalidate-voucher-on-cart-change.ts`, `src/subscribers/voucher-cart-updated.ts`                        |
| Vietnamese error/response contract (`code`/`customer_message`/`severity`/`display_hint`)                    | Promotion has no i18n message contract at all                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `src/workflows/voucher-engine/lib/errors.ts`, mirrored in `apps/storefront/src/modules/voucher/types.ts`                              |

## Rebuild

These need to change shape, but the underlying business capability stays.

### SRS §5.2 — Data relationship mapping

The rebuild's data model must satisfy these four relationships exactly as specified:

- **`VoucherConfig` extends `Promotion`** = a Medusa **Module Link** between `Promotion` and
  `VoucherConfig` (`defineLink`, per `medusa.md`'s Link Module convention — no cross-module database
  foreign key). See the next subsection for the current vs. target state.
- **`VoucherConfig` has many `VoucherUsageLog`** — one voucher configuration can have many usage
  log entries over its lifetime (one per successful redemption).
- **`VoucherUsageLog` belongs to `VoucherConfig`, and references `Customer` and `Order`** — per
  this repo's Link Module convention (`medusa.md`), "references" here means plain `model.text()` id
  fields (`customer_id`, `order_id`) wired through the Link Module where a cross-module link is
  appropriate, not a database foreign key. `VoucherUsageLog`'s own model already carries
  `voucher_id`, `customer_id`, and `order_id` (see the Keep table's `VoucherUsageLog` row) — this
  relationship confirms that shape is correct, not a change.
- **`DiscountCapConfig` is a global singleton** — exactly one active row at a time, not scoped per
  voucher or per campaign. This is already the current shape (see `discount-cap-config.ts`) and the
  Keep table's `DiscountCapConfig` row — this mapping confirms it, not a change.

### `VoucherConfig` becomes a Promotion-linked extension, not an independent source of truth

**Current state:** `src/modules/voucher-engine/models/voucher-config.ts` independently owns `code`,
`is_active`, `discount_type`, `discount_value`, `min_order_value`, `max_discount_amount`,
`applicable_product_ids`, `applicable_category_ids`, `stackable_with_promotions`,
`per_user_limit`, `usage_limit`, `usage_count`, `user_segment_conditions`, `valid_from`,
`valid_to`. It has a `promotion_id` text field, but the review confirmed the actual apply path
never reads or writes it — it's a documented vestige of an earlier, unfinished "Decision C".

**Done looks like:** A real `defineLink` connects `VoucherConfig` to a genuine `Promotion` (+
`Campaign` for the date window). Fields the native side now owns are either dropped from
`VoucherConfig` or explicitly kept as a synced read-cache — Phase 1 must record which, per-field,
in its Plan deliverable; "left as duplicated with no stated reason" is not an acceptable end state
for any field in the Remove-or-avoid-duplicating list below. `usage_limit`/`usage_count` are the
one deliberate exception: they stay authoritative on `VoucherConfig` (see Keep table,
atomic-redemption row) with native fields as a secondary mirror only.

### `createVoucherWorkflow` creates/updates native Promotion/Campaign plus the voucher extension

**Current state:** `src/workflows/voucher-engine/admin/create-voucher.ts` +
`admin/steps/create-voucher.ts` create only a `voucher_config` row; a Promotion is never created
by this path today (the only Promotion Medusa APIs called anywhere in `voucher-engine` are the
ephemeral-carrier ones in the apply/remove/revalidate workflows — verified zero
`IPromotionModuleService`/`PromotionModule` references, zero `defineLink` involving Promotion,
in the whole backend app).

**Done looks like:** Creating a voucher creates a real Promotion (+ Campaign) first via
`createPromotionsWorkflow`, using the `promotionsCreated` hook to provision the linked
`VoucherConfig` extension row, per Phase 1.

### Admin UI lives under Promotions

**Current state:** A fully standalone sidebar item (`src/admin/routes/vouchers/page.tsx`,
`defineRouteConfig({label: "Vouchers", ...})`) with its own list/create/analytics screens, entirely
separate from Medusa's native Promotions admin section.

**Done looks like:** Voucher-specific fields are a tab/section/widget on the Promotion detail page
(or an equivalent in-Promotions-section integration), per `medusa.md`'s stated preference for
widgets/sections over a separate sidebar item, and per Phase 3.

### Storefront voucher UI stays checkout-facing but relies on corrected backend APIs

**Current state:** `apps/storefront/src/modules/checkout/components/discount-code/index.tsx`
already correctly stays checkout-facing and already correctly treats the voucher endpoint as
primary with a generic-promotion-code fallback — this part of the design is sound. What's wrong is
downstream of the backend carrier: it filters the ephemeral Promotion out of `cart.promotions` by
id, which is only necessary because of the carrier this rebuild is replacing.

**Done looks like:** Same UX, same dual-path design, but with the ephemeral-Promotion-filtering
logic removed once Phase 2 ships (per Phase 4) — the component gets simpler, not different in
behavior.

## Remove or avoid duplicating

### Independent source-of-truth fields covered by Promotion/Campaign (unless explicitly justified)

| Field                                                                       | Native equivalent                                  | Current location    | Note                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | -------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`                                                                      | `Promotion.code`                                   | `voucher-config.ts` | Currently duplicated three ways in the live system: `VoucherConfig.code`, the (unused) backing-Promotion sync target, and the ephemeral per-cart Promotion's own generated code — collapse to one real Promotion's code once linked |
| `is_active` / status                                                        | `Promotion` status                                 | `voucher-config.ts` |                                                                                                                                                                                                                                     |
| `discount_type` / `discount_value`                                          | `ApplicationMethod.type`/`.value`                  | `voucher-config.ts` | Calculation logic itself stays custom (see Keep table) — only the _reference/display_ copy of type/value moves to native                                                                                                            |
| `min_order_value`                                                           | Promotion numeric rule (`item_subtotal gte ...`)   | `voucher-config.ts` | V5 must still be independently re-checked by VoucherEngine's own validation regardless of where the config value is sourced from — moving the field doesn't remove the need for the check                                           |
| Product/category scope (`applicable_product_ids`/`applicable_category_ids`) | `ApplicationMethod.target_rules`                   | `voucher-config.ts` | Gated on the Phase 0/Phase 1 scope-spike decision — do not move this field to native until the OR-across-attributes fidelity spike (if done) confirms it's safe                                                                     |
| `usage_limit`                                                               | `Promotion.limit` / `CampaignBudget{type:"usage"}` | `voucher-config.ts` | **Exception — do not remove.** Native increment is non-atomic; `VoucherConfig.usage_limit`/`usage_count` stay authoritative per the Keep table. Native fields become a secondary mirror, not a replacement                          |
| `valid_from` / `valid_to`                                                   | `Campaign.starts_at`/`.ends_at`                    | `voucher-config.ts` | Currently owned by `VoucherConfig` only — a `Campaign` object is never actually created by any current workflow despite Campaign dates being the intended native mapping                                                            |

**Superseded row removed:** an earlier revision of this table listed "Customer group rules" here
as a hand-to-native candidate, reasoning that `user_segment_conditions` was never implemented even
as a stub. That's no longer the disposition — Phase 0 confirmed **V7 segment validation is
mandatory**, sourced from CRM campaign/customer assignment logic. See the Keep table's V1→V8 row
above; this capability is now Keep/custom, not Remove/native.

### `per_user_limit` — OPEN, not settled either way (Phase 1 must decide)

**This is not a Remove-or-avoid-duplicating candidate and not a Keep item — it is an explicitly
open decision that Phase 1 must resolve, not assume.** An earlier revision of this table listed
`per_user_limit` in the table above as "deliberately kept custom," reasoning that adopting
`CampaignBudget{type:"use_by_attribute", attribute:"customer_id"}` would require one Campaign per
voucher with no correctness win over the custom approach. That conclusion is **not** re-confirmed
here — per the latest business clarification, Phase 1 must explicitly decide between:

- **Native Campaign per-customer budget** (`CampaignBudget{type:"use_by_attribute",
attribute:"customer_id"}`, tracked via `CampaignBudgetUsageDTO`) — verified to exist in 2.16.0
  (`@since 2.11.0`), but requires provisioning a Campaign per voucher and inherits the same
  non-atomic `registerUsage` increment as the global `usage_limit` case (see `verification.md`).
- **Custom atomic enforcement via `VoucherUsageLog`** — count existing log rows for
  `(voucher_id, customer_id)`, consistent with how the global `usage_limit`/`usage_count` atomicity
  is already handled (see the Keep table's atomic-redemption row) — but this stays a distinct
  decision from that one; do not treat re-opening `per_user_limit` as re-opening the global
  `usage_limit` decision, which remains settled/authoritative on `VoucherConfig`.

Record whichever option Phase 1 picks, with its verification evidence, in the Phase 1 Plan
deliverable — see `phase-plan.md` §Phase 1.

### The ephemeral cart-specific Promotion carrier — CONFIRMED KEPT (Phase 2 shipped verification-only)

**This item is no longer conditional — it is resolved.** Phase 2 shipped as a **verification-only**
phase (approved scope: keep the ephemeral per-cart Promotion transport unchanged; add a
sale-price-basis test; no carrier changes). No better non-credit-line, non-payment carrier was
found or pursued. **These files are kept and updated in place, not removed** — this is not a
hypothetical branch anymore, it is what actually happened. Do not remove them in any later phase,
including Phase 6, unless a future session explicitly re-opens and re-decides the carrier
mechanism from scratch (a new decision, not a default assumption).

**Location:** `src/workflows/voucher-engine/lib/create-and-attach-ephemeral-promotion.ts`,
`lib/ephemeral-promotion.ts`, and the Promotion-creation/attach/detach/delete steps inside
`apply-voucher.ts`, `remove-voucher.ts`, `revalidate-voucher-on-cart-change.ts`. All confirmed
unchanged by Phase 2 (see `voucher-engine-rebuild-progress.md`'s Phase 2 entry).

**On the CONFLICT-8 regression test:** the narrow native-Promotion-line-item-adjustment-coexistence
case CONFLICT-8 identifies is historical/out-of-default-scope for this project's current SRS
interpretation (item-level promotion = Price List sale price, Phase 0 decision 4) — it is **not** a
Phase 5/6 blocker by default. Only add/require it if the business explicitly requests native
Promotion line-item adjustment coexistence support later (see `phase-plan.md` §Phase 5 for the
full corrected framing). The Rule-11 shrink guard in `verify-cart-totals.ts` stays regardless —
that guard's existence isn't conditioned on this test.

### The old admin sidebar route, once voucher management moves into Promotions

**Location:** `src/admin/routes/vouchers/page.tsx`.

**When to remove:** Only after a Promotion-integrated UI covers the same functionality — see
Phase 3's exit criteria. Removing it earlier leaves a functionality gap for admins. **Status as of
Phase 3B:** not ready. Phase 3B added the `DiscountCapConfig` section to this SAME standalone page
rather than to a Promotion-integrated location — the Promotion-detail widget was explicitly
deferred, not built. This page currently has no replacement with feature parity, so it stays.
Re-check its actual status (has a Promotion-integrated UI since been built, and does it cover
create/list/analytics/cap-config?) before removing it in whatever phase eventually attempts this —
do not assume readiness from this doc alone.

### Scripts/tests — most are NOT removal candidates (correction: the ephemeral design is not obsolete)

**Correction:** the heading this subsection previously used ("obsolete ephemeral-Promotion design")
assumed a carrier swap that did not happen — Phase 2 kept the ephemeral mechanism unchanged (see
above), so scripts/tests that exercise it are exercising the **current**, still-live design, not an
obsolete one. Do not remove any of the following on the theory that "the carrier changed" — it
didn't.

**Candidates to review on their own individual merits only** (verify each script's actual content
before deleting — most are likely still legitimate fixtures for the current design):
`src/scripts/seed-tier-promo.ts`, `src/scripts/seed-voucher-engine.ts`,
`src/scripts/seed-voucher-cap-demo.ts`, and `__tests__/ephemeral-promotion.unit.spec.ts`.

**When to remove:** Only in Phase 6, and only if a specific script/test is independently proven
dead, duplicated, or superseded on its own merits (e.g. superseded by a newer fixture that covers
the same ground, or genuinely never invoked by anything) — never as a batch "carrier cleanup," since
there is no carrier cleanup to do.
