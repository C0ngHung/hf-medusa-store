# VoucherEngine rebuild — Phase 0 decision record

Append-only. One dated entry per decision. Governed by
`.claude/skills/rebuild-voucher-engine/SKILL.md`.

## 2026-07-17 — Ten confirmed rebuild-scope decisions

These were given as business clarification prior to this record being created, and are logged here
verbatim as the formal Phase 0 artifact the skill's Phase 1+ gates depend on.

1. **Do not use `cart.credit_lines` as the discount carrier.** Evaluated during the architecture
   review; rejected. Does not imply the current ephemeral-Promotion mechanism is fine as-is —
   Phase 1 verifies (not assumes) whether it, or another native-Promotion-based approach, satisfies
   the SRS.
2. **The voucher is not payment or customer credit.** VoucherEngine must not be modeled as, or
   implemented via, any store-credit/payment-credit mechanism, native or custom.
3. **Tax handling is out of scope for this rebuild.** No phase resolves tax-base/tax-treatment
   questions as a gate.
4. **"Item-level promotion" means the Price List sale price from the Medusa Pricing Module, not a
   Promotion line-item adjustment, unless a section explicitly states otherwise.**
   **SUPERSEDED 2026-07-20 — see the entry below.** This decision is reversed: item-level promotion
   (VOUCH-003) now means a native automatic Promotion Module adjustment (`is_automatic=true`)
   applied to cart items. Decisions 5-6 below are updated accordingly.
5. **The voucher applies on the adjusted/sale line price** (the Price-List-resolved line price,
   per decision 4).
6. **VoucherEngine must not alter the sale price.** It reads the Pricing Module's resolved price;
   never writes to Price List data.
7. **`VoucherUsageLog` is created only after successful order placement.** Locked constraint.
8. **V7 segment validation is mandatory.** No longer a deferred no-op stub; sourced from CRM
   campaign/customer assignment logic (decision 9).
9. **"My Vouchers" is sourced from CRM campaign/customer assignment logic**, not necessarily native
   Medusa customer groups.
10. **Reuse native Promotion/Campaign wherever possible; custom VoucherEngine code covers only
    SRS-specific gaps.**

**Sign-off:** Recorded per user's explicit business clarification (this conversation). No further
confirmation needed for decisions 1–10 — they are inputs to this rebuild, not open questions.

## 2026-07-17 — `target_rules` scope-spike timing — CONFIRMED

**Status:** Confirmed by the user. **Spike now, inside Phase 1.**

**Question resolved:** Whether the `target_rules` OR-across-attributes fidelity spike (verifying
whether native Promotion `target_rules` can express "product OR category" scope matching) happens
now, inside Phase 1, or is deferred. Answer: now.

## 2026-07-17 — `per_user_limit` enforcement mechanism — CONFIRMED

**Status:** Confirmed by the user (per Operating rule 9's requirement that this be explicitly
decided in Phase 1, not assumed). **Custom atomic enforcement via `VoucherUsageLog`/service**, not
native Campaign per-customer budget.

**Rationale carried forward from the Phase 1 plan:** native `CampaignBudget{type:"use_by_attribute"}`
requires provisioning one Campaign per voucher and inherits the same non-atomic `registerUsage`
increment as the already-settled global `usage_limit` case — no correctness win, only overhead.

## 2026-07-17 — Phase 1 approvals (batch)

**Status:** Confirmed by the user. The following are locked as Phase 1's implementation plan, not
pending recommendations:

- Add `defineLink` between `VoucherConfig` and `Promotion`.
- Promotion-first `createVoucherWorkflow` v2.
- Idempotent backfill script for existing `voucher_config` rows.
- Keep the Rule-11 shrink guard in `verify-cart-totals.ts` for now — do not simplify it in Phase 2
  yet (see the corrected carrier-verification finding below).

## 2026-07-17 — Correction: canonical Promotion vs. ephemeral per-cart Promotion are distinct

**This corrects an earlier conflation in this session's Phase 1 plan output — recorded here so the
distinction isn't lost.**

There are two different Promotion-related entities in play, not one:

- **Linked/canonical Promotion** — created once per voucher via the Promotion-first
  `createVoucherWorkflow`, linked to `VoucherConfig` via `defineLink`. Source of truth for
  code/rules/campaign/admin-facing configuration. Never mutated per cart-application.
- **Ephemeral per-cart Promotion** — created/destroyed on each apply/remove/revalidate, today's
  existing transport mechanism. Its `application_method.value` is set to the exact, already-computed
  `final_voucher_discount` for that specific cart (post V1–V8, post global cap).

**Verified finding:** the canonical Promotion **cannot** carry the final capped per-cart amount.
`Promotion.code` has a hard unique DB constraint (`IDX_unique_promotion_code`, `where: "deleted_at
IS NULL"`, `@medusajs/promotion/dist/models/promotion.js:51-57`) — only one non-deleted Promotion
row can exist per code. Mutating the single canonical Promotion's `application_method.value` to
hold one cart's final discount would corrupt every other concurrent cart applying the same voucher
code. Therefore: **the ephemeral per-cart Promotion remains a necessary, temporary transport
mechanism through Phase 2** — it is not eliminated by Phase 1, and is not the same thing as "using
native Promotion as the carrier" in the sense of the canonical Promotion. The canonical Promotion
stays source-of-truth for configuration only.

## 2026-07-17 — Correction: `VoucherConfig` field removal deferred to Phase 6

**This corrects an earlier "drop immediately in Phase 1" recommendation.**

`code`/`is_active`/`valid_from`/`valid_to`/`discount_type`/`discount_value` stay on `VoucherConfig`
as **deprecated/denormalized cache columns** through Phases 1–5, kept in sync by the Promotion-first
workflow. New code (V1–V8 validation, My Vouchers, admin display) should **prefer reading from the
linked Promotion/Campaign**, but the old columns are not physically dropped until Phase 6 cleanup,
after tests confirm the linked-Promotion read path is correct. `usage_limit`/`usage_count` are
unaffected — already settled as authoritative on `VoucherConfig` regardless.

## 2026-07-17 — `min_order_value` mapping — stays custom VoucherConfig-owned for now (Phase 1 review fix)

**Status:** Explicitly decided (Phase 1 review finding), not silently omitted.

`min_order_value` is **not** mapped to a native Promotion numeric rule in Phase 1. It continues to
flow into `VoucherConfig` unchanged, exactly as before this rebuild, via
`buildPromotionInput`'s `additional_data.voucher_engine.voucher_config` payload
(`src/workflows/voucher-engine/admin/lib/build-promotion-input.ts`).

**Rationale:**

- The `keep-remove-map.md` Remove table lists `min_order_value` → "Promotion numeric rule
  (`item_subtotal gte ...`)" as the theoretical native equivalent, but that same row already notes
  "V5 must still be independently re-checked by VoucherEngine's own validation regardless of where
  the config value is sourced from" — moving the field would not remove any custom validation work,
  only add native-mapping risk for no correctness gain this phase.
- No native `Promotion`-level rule attribute/mechanism for a cart- or order-subtotal threshold was
  verified against the installed 2.16.0 source this session (unlike `target_rules`, which the
  OR-across-attributes spike did verify and rule out for product/category scope — see
  `build-promotion-input.ts`'s docstring). Attempting the mapping without that verification would
  risk an unverified/incorrect native rule shape.
- This is a deferral, not a permanent rejection: a future phase may still map it once the native rule
  shape is verified, consistent with decision 10 (reuse native where possible).

**Consequence:** `min_order_value` is out of scope for this rebuild's "fields become
Promotion-linked" list until re-evaluated; V5 validation logic is unaffected either way.

## 2026-07-20 — Decision 4 reversed: item-level promotion = native automatic Promotion adjustment

**Status:** Explicit business correction, superseding decision 4 above (recorded 2026-07-17) and
SPEC.md Decision H (same date). This reverses a decision that had been re-confirmed as recently as
the 2026-07-20 SPEC-vs-code review ("Unchanged by this review... item-level promotion means Price
List sale price") — the reversal is deliberate, not an oversight, and is recorded here so a future
session sees the full history rather than assuming decision 4 is still settled.

**New definition:** item-level promotion (VOUCH-003) = a native automatic Promotion Module
adjustment applied to cart items (`is_automatic=true`), not the Price List sale price. Required
order: original subtotal -> automatic Promotions apply first, preserved -> Voucher on eligible
post-promotion subtotal -> `max_discount_amount` -> global cap -> only the Voucher reduces on cap;
the automatic Promotion discount must never shrink or reverse.

**Consequence for CONFLICT-8/PD-15:** REOPENED as an unresolved backend blocker (see SPEC.md §18/
§19.1 and the "Admin unified model" section) — the coexistence case is now the SRS's normal path,
not a deferred edge case, and the ephemeral carrier's interaction with `computeActions` still
structurally risks shrinking the automatic Promotion's own adjustment. **Not fixed by the
2026-07-20 Admin unified-model implementation** — that implementation is independent of the carrier
and does not touch `apply-voucher.ts`/`remove-voucher.ts`/`revalidate-voucher-on-cart-change.ts`/
`verify-cart-totals.ts`.

## 2026-07-20 — Admin unified model approved and implemented (Decision K-2)

**Status:** Approved and implemented same day. Voucher is not a separate long-term Admin domain —
creation starts from native Promotion; Promotion Detail gets a "VoucherEngine Settings"
Enable-Voucher flow for eligible, non-automatic, unlinked Promotions. Full detail recorded in
SPEC.md's "Admin unified model — implemented 2026-07-20 (Decision K-2)" section (new workflow/API,
eligibility rules, source-of-truth fix, widget states, transitional compatibility). Not duplicated
here — SPEC.md is the technical source of truth for this decision's implementation detail; this
entry exists so the decision-log's chronology stays complete.

## 2026-07-20 — CONFLICT-8/PD-15 RESOLVED: carrier rewritten to raw `LineItemAdjustment`s (Decision-4 carrier rewrite)

**Status:** Implemented same day, per explicit instruction to implement the SRS's required
automatic-Promotion + Voucher coexistence result rather than keep the fail-closed
`VOUCHER_STACKING_UNSUPPORTED` rejection. This closes the CONFLICT-8/PD-15 gap reopened by the
same-day Decision H-2 entry above — the ephemeral-Promotion carrier could not satisfy the SRS's
required order (item promotions apply first and are never reduced; the Voucher applies after, on
the post-promotion subtotal) because it was itself a Promotion, competing with any coexisting
automatic item-level Promotion in `PromotionModuleService.computeActions`'s shared,
`application_method.value`-DESC-ordered recompute.

**New carrier: raw `LineItemAdjustment` rows, `code: null` / `promotion_id: null`, split
proportionally across eligible lines by VoucherEngine itself** (`steps/create-voucher-adjustments.ts`,
`lib/create-voucher-adjustments.ts`, `modules/voucher-engine/lib/calculate-discount.ts`'s new
`splitAmountAcrossEligibleLines`, largest-remainder method — exact integer VND sum, no Medusa
allocation engine involved). Verified against installed 2.16.0 source (not assumed) that this closes
the gap, at the exact function level:

- `PromotionModuleService.computeActions` only tracks adjustments whose `code` is a string
  (`isString(adjustment.code)` gate building the REMOVE-and-recompute `codeAdjustmentMap`,
  `@medusajs/promotion/dist/services/promotion-module.js:329`) — a null-code adjustment is never
  removed, never seeds the shared `appliedPromotionsMap`, and is otherwise invisible to that pass.
- A cart line's `subtotal` (the base an automatic item-level Promotion's own percentage/fixed
  calculation is computed against) is ALWAYS the GROSS `unit_price * quantity` — adjustments reduce
  `total`, never `subtotal` (`@medusajs/utils/dist/totals/line-item/index.js:43-50,85-86`,
  `calculateAdjustmentTotal`, `dist/totals/adjustment/index.js`, sums ALL adjustments — no
  `code`/`promotion_id` filter — into `total`/`discount_total`). So an automatic Promotion's own
  adjustment can never be reduced by VoucherEngine's adjustment, in EITHER temporal order — this is
  what makes the SRS order actually hold, unconditionally, not just when ordering happens to favor
  it.
- `LineItemAdjustment.code`/`promotion_id` are both `model.text().nullable()`
  (`@medusajs/cart/dist/models/line-item-adjustment.js`); `@medusajs/core-flows`'s own
  `createLineItemAdjustmentsStep` (not reused — its success `StepResponse` returns `void 0` as its
  OWN output, only the compensation payload carries the created rows) confirms `code` is optional at
  the runtime/DB level despite the exported `CreateLineItemAdjustmentDTO` TS type declaring it
  required (a known, documented type/runtime gap — see the new step's header).
- `complete-cart.js:344` copies `item.adjustments ?? []` onto the created order's line items
  verbatim, regardless of `code` — the discount and receipt record survive checkout unchanged.
  `registerUsageStep`/`PromotionModuleService.registerUsage` filter computed actions by
  `.filter(Boolean)` on `code` first (`promotion-module.js:128-130`) and `continue` when no matching
  promotion is found (`:141-145`) — a null-code entry is silently skipped, no bogus registration
  attempt, no error.

**Consequence — the Rule-11 shrink guard is gone, not just relaxed.** `steps/verify-cart-totals.ts`
no longer takes a `pre_apply_item_promotion_discount` baseline or does a non-voucher-adjustment
shrink check; `VOUCHER_STACKING_UNSUPPORTED` is no longer thrown anywhere (kept in `lib/errors.ts`'s
catalog and the `VoucherErrorCode` type only for schema/back-compat, marked DEAD). Verification now
only checks (1) VoucherEngine's own adjustment ids sum to exactly `final_voucher_discount`, and (2)
the Cart module's own recomputed `total` equals `expected_final_cart_total` — both now sufficient,
since there is no cross-promotion interference left to guard against.

**Simplifications this enabled (not just a swap):** no ephemeral Promotion `code` generation/
uniqueness nonce; apply/replace/revalidate collapse the old detach-then-later-irreversible-delete
pair into one `removeLineItemAdjustmentsStep` call (a `LineItemAdjustment` soft-delete is already
the right granularity — no separate "permanent delete" phase needed since there's no standalone
Promotion entity to delete); `record-voucher-usage.ts` drops its post-redemption cleanup step
entirely (`cleanup-ephemeral-promotion.ts` is now superseded — nothing to clean up, the adjustments
already live permanently on the order as the receipt record); `load-cart-context.ts` drops its
caller-supplied `voucher_promotion_id` exclusion param in favor of a simple `promotion_id != null`
filter (every genuine native-Promotion adjustment always carries a real id,
`prepare-adjustments-from-promotion-actions.js:54`; VoucherEngine's own never do).

**Explicitly superseded, not deleted** (file deletion denied by this environment's permission
system in every session so far — same caveat as Phase 6 planning above):
`lib/create-and-attach-ephemeral-promotion.ts`, `steps/cleanup-ephemeral-promotion.ts`. Left
functioning as-is, now unwired from the live flow: `lib/ephemeral-promotion.ts`'s
`EPHEMERAL_CODE_PREFIX`/`generateEphemeralPromotionCode` (legacy-data back-compat only —
`admin/lib/check-promotion-voucher-eligibility.ts` and `lib/reap-ephemeral-promotions.ts` still need
them for any pre-rewrite `VEPH-*` rows) and `VoucherCartMetadata` (rewritten: `adjustment_ids: string[]`
replaces `ephemeral_promotion_id`/`ephemeral_code`).

## 2026-07-20 — Decision 2 executed: `stackable_with_promotions` removed from ownership

Not configurable — the fixed SRS policy (also what the Decision-4 carrier rewrite's calculation
order above already assumes) is that automatic item-level Promotions always apply first and the
Voucher always applies afterward; there is no "reject for coexisting" case. Removed: the V8
validator (`lib/validators.ts`'s `v8Stacking`, deleted) and its call sites (`lib/validate-voucher.ts`,
`lib/revalidate-voucher.ts`); the field from `VoucherSnapshot`/`PersistedVoucherConfig`
(`lib/types.ts`, `lib/mappers.ts`); the Enable-form/atomic-create Zod schemas and their TS input
types (`api/admin/promotions/[promotion_id]/voucher-config/validators.ts`, `api/admin/vouchers/validators.ts`,
`workflows/voucher-engine/admin/attach-voucher-config.ts`, `admin/create-voucher.ts`, the
`upsertLinkedVoucherConfigStep`/`voucher-config-promotion-created.ts` hook's payload validation); the
admin widget's form field, checkbox, and read-only display row
(`admin/widgets/promotion-detail-voucher-config-widget.tsx`); the "My Vouchers" response shape
(`api/store/customers/me/vouchers/route.ts`); and the GET `/admin/vouchers` field-select list.
`VOUCHER_STACKING_CONFLICT` stays in the error catalog/type, marked dead, for the same
schema-back-compat reason as `VOUCHER_STACKING_UNSUPPORTED` above. **Legacy DB column kept**
(`voucher_config.stackable_with_promotions`, still `not null default true`) — explicitly documented
as non-authoritative in the model file, matching the existing `usage_limit`/`valid_from`/`valid_to`
deprecated-cache-column pattern; no migration to drop it was written (physical column removal stays
Phase 6 work, per that phase's already-established gate).

## 2026-07-20 — Decision 3 executed + a staleness gap fixed: usage-limit ownership

Confirmed the already-implemented split is correct and kept it: `usage_limit` is read live from the
linked Promotion's Campaign budget (`admin/lib/derive-voucher-config-cache-fields.ts`, `type:"usage"`
budget only) via `lookupVoucherStep`'s `resolveVoucherNativeFields` overlay on every apply-time V3
pre-check — never the raw `voucher_config.usage_limit` cache column at that point.
`voucher_config.usage_count`, incremented only via `redeemVoucherAtomic`'s atomic conditional
`UPDATE`, stays the sole authoritative enforcement counter: verified that native
`campaign.budget.used`/`registerUsage` can NEVER reflect a VoucherEngine redemption at all, because
the canonical Promotion is never attached to any cart/order (Decision C/G) and VoucherEngine's own
adjustment always carries `code: null` — `registerUsage`'s own `promotionCodes = ....filter(Boolean)`
(`promotion-module.js:128-130`) means a VoucherEngine order's redemption never even queries a
Promotion by code. There is no native counter to reuse for enforcement; keeping the custom atomic
counter is not "maintaining two counters for the same limit" — it is the only counter.

**Gap found and fixed:** `redeemVoucherAtomic`'s raw SQL previously enforced against
`voucher_config.usage_limit`'s OWN column value (not the live Campaign-derived one) — a value only
ever synced at Enable/re-Enable time (`upsertLinkedVoucherConfigStep`), so it could silently drift
from the live limit the V3 pre-check just used moments earlier, if a merchant edited the Campaign
budget without disabling/re-enabling VoucherEngine. This WAS effectively a second, drifting copy of
the limit enforcing the same thing — exactly what this decision forbids. Fixed: a new
`steps/resolve-voucher-usage-limit.ts` re-resolves the live limit immediately before redemption
(`record-voucher-usage.ts`), and `redeemVoucherAtomic`/`atomic-redeem.ts` now take it as an explicit
parameter instead of reading the column — the atomic `UPDATE`'s `WHERE` clause is still one
statement (no read-then-write race reintroduced), it just compares against a freshly-resolved bound
value rather than a potentially-stale column.

## 2026-07-21 — Decision 3 REVERSED: usage_limit reverts to VoucherConfig-owned (bug-bash finding)

User bug-bash review flagged that `usage_limit` being live-Promotion-derived at runtime
(Decision 3, 2026-07-20, immediately above) contradicts SPEC.md, which is explicit in three places
that `usage_limit` is VoucherConfig-owned configuration: §5.4's ownership table ("VoucherConfig …
source of truth for … global `usage_limit`"), §10's V3 row ("config (authoritative DB read)"), and
§11.4's atomic-increment pseudocode, which reads the column directly
(`UPDATE voucher_config SET usage_count = usage_count + 1 WHERE … usage_count < usage_limit`).
Decision 3 diverged from SPEC.md and never updated it — SPEC.md is this rebuild's designated
implementation source of truth, so it wins here, not the decision log.

Decision 3's own rationale (Campaign-budget-sharing, atomic-create silently nulling the budget) is
mooted by this reversal: those problems were artifacts of sourcing the limit from the Promotion/
Campaign at all — under a VoucherConfig-owned column there is no live Promotion value to drift from
or share.

**What changed:** `resolveVoucherNativeFields` (`admin/lib/resolve-voucher-native-fields.ts`) no
longer overlays `usage_limit` from the Promotion — only `code`/`discount_type`/`discount_value` are
still live-derived. `derivePromotionCacheFields` still computes `usage_limit` from `Promotion.limit`,
but only as a one-time SEED for the column at Enable/re-Enable time (UX convenience — avoids asking
an admin to enter the same number twice), never as a runtime authority. `resolve-voucher-usage-limit.ts`
and `atomic-redeem.ts` needed no logic changes — they already just consume whatever
`resolveVoucherNativeFields` returns, so they now transparently read the column instead of a live
Promotion value. Comments across `lookup-voucher.ts`, `derive-voucher-config-cache-fields.ts`, and
the `VoucherConfig` model's `usage_limit` column were updated to match.

## 2026-07-20 — Decision 1 re-confirmed: V6 scope stays custom (no code change)

Re-verified against installed 2.16.0 source this session (not assumed from memory):
`areRulesValidForContext`'s rule combination is `.every(...)` across rules
(`@medusajs/promotion/dist/utils/validations/promotion-rule.js:36`) — AND-only. Native
`target_rules` cannot express `applicable_product_ids` OR `applicable_category_ids` (two different
attributes, OR-combined) — this was already the settled Phase 1 finding and remains correct;
`VoucherConfig.applicable_product_ids`/`applicable_category_ids` are unchanged.
