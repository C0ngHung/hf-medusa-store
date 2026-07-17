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
