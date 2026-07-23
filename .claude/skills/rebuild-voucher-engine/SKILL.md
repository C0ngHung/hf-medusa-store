---
name: rebuild-voucher-engine
description: Plans and executes the Promotion-first rebuild of VoucherEngine (backend + storefront + admin). The current implementation duplicates native Medusa Promotion/Campaign fields and carries the voucher discount via an ephemeral per-cart Promotion. Per business clarification, "item-level promotion" here means the Price List sale price (Pricing Module), not a Promotion line-item adjustment — so the default forward architecture evaluates native Promotion/Campaign application as the carrier FIRST. The old CONFLICT-8/PD-15 diagnosis (computeActions ordering breaking SRS Rule 11) is historical context and only matters if a native Promotion line-item adjustment coexists with the voucher. Phase 0 is a no-code decision gate locking rebuild-scope decisions (no cart credit lines, not payment/customer credit, tax out of scope, sale-price terminology, mandatory V7, CRM-sourced My Vouchers). Phase 1 makes Promotion/Campaign the source of truth for native fields, verifies whether native Promotion can serve as the carrier, and decides per_user_limit enforcement. Phase 2 implements the decided carrier. Phase 3 folds admin into Promotions. Phase 4 updates storefront. Phase 5 verifies. Phase 6 cleans up. Includes SRS 5.2 data-relationship and 6.2 API contract mapping. Use when the user says "Use rebuild-voucher-engine for Phase 1", "start the voucher engine rebuild", or references the Promotion-first VoucherEngine rebuild plan.
---

# Rebuild VoucherEngine (Promotion-first)

## Why this skill exists

An architecture review of the current VoucherEngine implementation found it was built largely
independently of Medusa's native Promotion/Campaign modules, duplicating fields Promotion/Campaign
already own natively (`code`, status, discount type/value, min order, product/category scope,
usage limits, per-user limits, validity window) and carrying the computed voucher discount into
`cart.total` via a throwaway **ephemeral per-cart Promotion** created/destroyed on every
apply/remove/revalidate. That review also surfaced a self-documented blocker in
`.claude/specs/voucher-engine/SPEC.md` (**CONFLICT-8 / PD-15**): Medusa's `computeActions` orders
promotions by buy-get-type then `application_method.value DESC`, which has no concept of "item
promotions first, voucher second, reduce only the voucher on cap" (SRS Rule 11) — so a coexisting
percentage-type item/order promotion can shrink the item-promotion adjustment in a way the SRS
forbids.

**Per the latest business clarification, CONFLICT-8 is historical context for the old
implementation, not an automatic blocker for the rebuild.** It was diagnosed under the assumption
that "item-level promotion" means a Promotion line-item adjustment. In this project, "item-level
promotion" actually means the **Price List sale price from the Medusa Pricing Module** — a
Pricing Module concept, not a Promotion Module one. Under that corrected interpretation, CONFLICT-8
only matters in the narrower case where a _native Promotion line-item adjustment_ also coexists
with the voucher on the same items — not by default, and not for every carrier choice.

The fix is **not** "extend Promotion more" — it's a split:

- **Promotion/Campaign becomes the source of truth for configuration** the platform already
  covers natively (code, status, dates, discount type/value as reference).
- **VoucherEngine keeps owning discount _resolution_** (V1–V8 validation, eligibility, cap math) —
  this is unavoidable regardless of integration depth, because native `computeActions` cannot
  express the SRS priority rule in the narrow coexistence case described above.
- **The discount _amount_'s carrier: the default forward architecture is to evaluate native
  Medusa Promotion/Campaign application FIRST.** `cart.credit_lines` was evaluated during the
  architecture review and rejected (Phase 0, confirmed decision — see below) — that exclusion
  stands. But the current ephemeral-Promotion mechanism is not automatically ruled out either: it
  is still a native-Promotion-based approach, and whether it (or a cleaner native-Promotion carrier)
  can satisfy the SRS is exactly what Phase 1 must verify against the installed Medusa 2.16.0
  source, under the corrected "item-level promotion" terminology above. **Only if that verification
  shows Medusa 2.16.0 cannot satisfy the SRS should Phase 1 propose a different carrier** — and
  even then, never `cart.credit_lines` and never a payment/customer-credit mechanism (Phase 0
  decisions 1–2 stay in force). The voucher discount always applies on top of the adjusted/sale
  line price from the Pricing Module, and VoucherEngine must never alter that sale price itself.

Phase 0 exists to lock these starting assumptions — the carrier-evaluation default above, the
"item-level promotion" terminology correction, and several other confirmed decisions (V7 mandatory,
"My Vouchers" sourced from CRM, usage-log timing, reuse-native-where-possible) — before any further
design work happens. See Phase 0 below (and `references/phase-plan.md` §Phase 0) for the full,
current list. **Nothing in Phase 1 or Phase 2 should be planned against the old
tax-treatment/credit-line framing this section used to carry, and nothing should assume the carrier
is an unresolved abstract unknown by default — that framing is superseded.** See
`references/phase-plan.md` §SRS §6.2 for the API contract mapping and `references/keep-remove-map.md`
§SRS §5.2 for the data-relationship mapping this business clarification also confirmed.

## Source-of-truth reading order

Before acting under this skill, a session should already have read (or read now, in this order):

1. `CLAUDE.md` — repo layout, tool-usage policy (no recursive `node_modules` scans, one
   package/symbol per dependency-inspection search).
2. `.claude/rules/project-conventions.md`, `.claude/rules/medusa.md`, `.claude/rules/testing.md`,
   `.claude/rules/coding.md`, `.claude/rules/security.md` — this repo's module/testing/money/security
   conventions.
3. `docs/voucher-engine/HUONG_DAN_PROMOTION_MODULE_MEDUSA.vi.md` and
   `docs/voucher-engine/MEDUSA_PROMOTION_MODULE_SUMMARY.vi.md` — native Promotion/Campaign
   capability reference (Vietnamese; treat as directionally correct but see the corrections in
   `references/phase-plan.md` §Known corrections — some claims in these docs were written before
   the installed-source verification and are measurably wrong, e.g. the native usage counter field
   is `used`, not `usage_count`, and is a non-atomic read-modify-write, not the "built-in counter"
   the docs imply is production-ready for INT-02).
4. `docs/voucher-engine/TOM_TAT_VOUCHER_ENGINE_TU_SRS.vi.md` — SRS summary and the original
   native-mapping table this rebuild starts from.
5. `.claude/specs/voucher-engine/SPEC.md` — the current approved technical spec. It documents the
   ephemeral-Promotion carrier (Decision G) as approved AND already flags it as blocked
   (CONFLICT-8/PD-15). Treat SPEC.md as authoritative for everything this rebuild does not
   explicitly change; do not silently let SPEC.md and the rebuilt code disagree — see
   "Relationship to SPEC.md and execute-voucher-engine-tasks" below.
6. This skill's three reference files:
   - `references/phase-plan.md` — full Phase 0–6 detail, gates, files affected, exit criteria.
   - `references/keep-remove-map.md` — what to keep, rebuild, or remove, with rationale and paths.
   - `references/verification.md` — pre-verified Medusa 2.16.0 framework facts, the subagent
     protocol, and the exact test/verification steps per phase.
7. Medusa v2 framework guidance from the **medusa-dev** plugin, loaded per phase (see phase
   sections below) — this skill defers to it for generic Promotion/Campaign/module/admin/storefront
   patterns and only documents what is specific to this repo's rebuild.

## Invocation examples

- `Use rebuild-voucher-engine for Phase 0.`
- `Use rebuild-voucher-engine for Phase 1 — plan only.`
- `Use rebuild-voucher-engine to implement the Phase 2 carrier swap.`
- `Use rebuild-voucher-engine — what's the current Keep/Remove/Rebuild status?`

Any of these is a valid scope. Do not assume Phase 1 if the user names a different phase, and do
not silently skip ahead — see the phase-gate rule below.

## Operating rules for every session

1. **Phase 0 is decision-only.** No application code, migration, or config file may be modified
   during Phase 0. Its only deliverable is a decision record (see
   `references/phase-plan.md` §Phase 0) capturing the confirmed rebuild-scope decisions: **do not
   use `cart.credit_lines` as the carrier**; **the voucher is not payment/customer credit** (not
   modeled as, or implemented via, any store-credit/payment-credit mechanism); **tax handling is
   out of scope** for this rebuild; **"item-level promotion" means the Price List sale price from
   the Medusa Pricing Module, not a Promotion line-item adjustment, unless a section explicitly
   states otherwise**; **the voucher discount applies on the adjusted/sale line price**;
   **VoucherEngine must not alter the sale price**; **`VoucherUsageLog` is created only after
   successful order placement** (reaffirms the existing Keep-table item); **V7 segment validation
   is mandatory**; **"My Vouchers" is sourced from CRM campaign/customer assignment logic**; and
   **reuse native Promotion/Campaign wherever possible — custom VoucherEngine code covers only
   SRS-specific gaps**. Phase 0 also resolves the one still-open scope question these decisions
   don't cover: whether the `target_rules` OR-across-attributes spike happens now or is deferred to
   Phase 1. The carrier mechanism is **not** decided in Phase 0 — Phase 0 only rules out
   `cart.credit_lines` and any payment/customer-credit mechanism (decisions 1–2 above); Phase 1's
   default is to verify whether native Medusa Promotion application can serve as the carrier, and
   to propose an alternative only if that verification shows Medusa 2.16.0 cannot satisfy the SRS.
   If asked to write code before the decision record exists and is explicitly acknowledged by the
   user, stop and produce/confirm the decision record first.
2. **Start every implementation phase (1–6) in no-code plan mode.** Produce the phase's plan
   deliverable (see the template below) before writing or editing any file. Do not exit plan mode /
   begin implementation until the user explicitly approves that phase's plan.
3. **Never cross a phase boundary without explicit user approval.** Finishing a phase's deliverable
   is not itself approval to start the next phase — stop, summarize what was done, and ask. Do not
   infer approval from an unrelated "looks good" or from silence.
4. **Verify against the installed Medusa 2.16.0 source before relying on any undocumented or
   assumed API**, per `CLAUDE.md`'s tool-usage policy: use Read/Grep/Glob, not broad Bash scans;
   search one exact package and symbol at a time; never recursively scan `node_modules`; resolve
   the exact `.pnpm` package path first (it's hash-suffixed and can change on lockfile updates —
   never hardcode a hash from a prior session), then cite `file:line`. Start from the pre-verified
   facts in `references/verification.md` §Pre-verified framework facts — re-verify only what that
   table doesn't already cover, or if the installed Medusa version has changed.
5. **For each implementation phase, produce a structured deliverable** before/alongside the code:
   **Plan**, **Files affected**, **Tests**, **Risk**, **Rollback notes**. Template and per-phase
   specifics are in `references/phase-plan.md`.
6. **Required subagent runs** (see `references/verification.md` §Subagent protocol for exact
   triggers):
   - Run `medusa-module-reviewer` after any backend module/workflow/link architecture change
     (Phases 1, 2, and the backend parts of 6).
   - Run `test-writer` **before** writing implementation tests yourself — delegate test authoring
     to it per this repo's testing conventions (Phases 1, 2, 5).
   - Run `security-auditor` after any change touching voucher validation, rate limiting, or
     checkout code paths (Phases 2, 3 admin auth, 4, and any Phase 5 test that exercises those
     paths).
7. **Load the relevant medusa-dev plugin skill for the phase** before writing framework-pattern
   code: `medusa-dev:building-with-medusa` (Phases 1–2, backend modules/workflows/links),
   `medusa-dev:db-generate` / `medusa-dev:db-migrate` (any migration in Phases 1–2),
   `medusa-dev:building-admin-dashboard-customizations` (Phase 3), `medusa-dev:building-storefronts`
   (Phase 4).
8. **Never let VoucherConfig regain independent source-of-truth status** for a field this rebuild
   moved to Promotion/Campaign, unless the session records an explicit justification in one of four
   categories: **SRS behavior** the native field/mechanism can't express, **atomicity** the native
   mechanism can't guarantee, **CRM sourcing** the native mechanism doesn't cover, or the **Vietnamese
   response contract** the native mechanism has no equivalent for (see `references/keep-remove-map.md`).
   A duplication with no justification in one of these four categories is not acceptable.
9. **Explicitly decide the `per_user_limit` enforcement mechanism in Phase 1** — native Campaign
   per-customer budget (`CampaignBudget{type:"use_by_attribute", attribute:"customer_id"}`) vs.
   custom atomic `VoucherUsageLog`-based enforcement. Do not assume either option without
   verifying against the installed 2.16.0 source and recording the decision (see
   `references/keep-remove-map.md`).
10. **Never delete historical docs.** `voucher-engine.solution-flow.completed.md`, the current
    `SPEC.md` sections being superseded, and `.claude/lessons/voucher-engine/*` stay in place.
    Superseding content goes in a clearly named new doc/section (e.g. a "Rebuild — superseded" note
    at the top of the old section, or a new dated SPEC addendum) — never a silent rewrite.

## Relationship to SPEC.md and `execute-voucher-engine-tasks`

`.claude/specs/voucher-engine/SPEC.md` is the existing, separately-maintained technical source of
truth used by the `execute-voucher-engine-tasks` skill, and it currently documents the
ephemeral-Promotion carrier as "approved" (Decision G) while also recording it as blocked
(CONFLICT-8/PD-15). This rebuild skill does not silently rewrite SPEC.md. When a rebuild phase
changes something SPEC.md currently documents as approved (e.g. the carrier mechanism in Phase 2,
or VoucherConfig's field ownership in Phase 1), route that change through the same
`voucher-spec-advisor` hand-off `execute-voucher-engine-tasks` already uses (see
`.claude/agents/voucher-spec-advisor.md` and that skill's `references/spec-sync.md`) so SPEC.md and
the rebuilt code never silently disagree. This skill tracks its own decisions and progress in
**separate, rebuild-specific files** so it never collides with the existing progress history:

- Decision log (created in Phase 0): `.claude/specs/voucher-engine/rebuild-decisions.md` —
  append-only, one dated entry per decision, with the decision, the rationale, and who signed off.
- Progress log (created/updated from Phase 1 onward):
  `.claude/progress/voucher-engine-rebuild-progress.md` — one dated entry per phase/session,
  mirroring the existing progress file's spirit (status, files, migrations, tests, results,
  blockers) without touching `voucher-engine-progress.md` itself.

## Phase plan (summary)

Full detail, files affected, and exit criteria: `references/phase-plan.md`.

| Phase                  | Goal                                                                                                                                                                                                                                                                                                                                                          | Gate to enter                                               | Code changes allowed?                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| 0 — Decision gate      | Record the confirmed rebuild-scope decisions (no credit lines, not payment/customer credit, tax out of scope, sale-price terminology, mandatory V7, CRM-sourced My Vouchers, reuse-native principle) and resolve scope-spike timing                                                                                                                           | None (starting point)                                       | No                                                         |
| 1 — Backend foundation | Promotion/Campaign becomes source of truth for native fields; `defineLink`; backfill; scope spike; **verify whether native Promotion application can serve as the carrier** (default hypothesis — propose an alternative only if Medusa 2.16.0 can't satisfy the SRS); **explicitly decide `per_user_limit` enforcement** (native Campaign budget vs. custom) | Phase 0 decision record approved                            | Yes (module/link/workflow/migration only, not the carrier) |
| 2 — Carrier swap       | Implement the carrier mechanism Phase 1 verified/decided — by default a native-Promotion-based approach; a swap away from the current ephemeral mechanism only if Phase 1 found it can't satisfy the SRS (never `cart.credit_lines` — rejected in Phase 0)                                                                                                    | Phase 1 stable; carrier verified/decided; explicit approval | Yes                                                        |
| 3 — Admin              | Voucher management folds into Promotions; missing CRUD added                                                                                                                                                                                                                                                                                                  | Phase 1 stable                                              | Yes                                                        |
| 4 — Storefront         | Checkout UI uses corrected APIs; ephemeral-promotion filtering removed once Phase 2 ships                                                                                                                                                                                                                                                                     | Phase 2 stable                                              | Yes                                                        |
| 5 — Verification       | Re-run/extend acceptance + regression tests                                                                                                                                                                                                                                                                                                                   | Phases 1–4 implemented                                      | Test files only                                            |
| 6 — Cleanup            | Remove dead ephemeral-Promotion paths, obsolete scripts, old sidebar                                                                                                                                                                                                                                                                                          | Phase 5 green                                               | Yes (deletions)                                            |

## Keep / Remove / Rebuild map (summary)

Full detail with rationale and file paths: `references/keep-remove-map.md`.

- **Keep unless proven wrong:** V1–V8 fail-fast order (**V7 segment validation is mandatory**,
  sourced from CRM campaign/customer assignment — no longer a deferred stub, see
  `keep-remove-map.md`), pure integer discount calculation, `DiscountCapConfig` concept,
  `VoucherUsageLog` append-only audit (**created only after successful order placement**), rate
  limiting, "My Vouchers" store API concept (**sourced from CRM campaign/customer assignment
  logic**), auto-revalidation on cart change, Vietnamese error/response contract.
- **Rebuild:** `VoucherConfig` becomes a Promotion-linked extension (not an independent source of
  truth for native fields); `createVoucherWorkflow` creates/updates native Promotion/Campaign plus
  the voucher extension; admin UI moves under Promotions; storefront voucher UI stays
  checkout-facing but calls the corrected backend APIs. Reuse native Promotion/Campaign wherever
  possible — custom VoucherEngine code covers only SRS-specific gaps.
- **Remove or avoid duplicating:** independent source-of-truth fields already covered by
  Promotion/Campaign unless explicitly re-justified by SRS behavior, atomicity, CRM sourcing, or
  the Vietnamese response contract (`code`, status, discount type/value, min order,
  product/category scope, usage limit, `valid_from`/`valid_to`); **`per_user_limit` is not settled
  either way — its enforcement mechanism (native Campaign per-customer budget vs. custom
  `VoucherUsageLog`-based) must be explicitly decided in Phase 1, not assumed**; the current
  ephemeral cart-specific Promotion carrier once Phase 1/2 determine its final shape — `cart.credit_lines`
  is **rejected** as a replacement (Phase 0), but the default forward architecture evaluates native
  Promotion application first, so the ephemeral mechanism is not automatically discarded either —
  see Phase 1; the old admin sidebar route once voucher management moves into Promotions; scripts/tests
  that only support the obsolete
  ephemeral-Promotion design.

## Non-negotiable rules

- Never touch application code, migrations, or config during Phase 0.
- Never cross a phase boundary without explicit user sign-off, even if the next phase seems obvious.
- Never treat CONFLICT-8 as an automatic blocker for every carrier choice — it is historical
  context for the old implementation's ephemeral-Promotion-plus-Promotion-adjustment interpretation,
  and only matters in the narrow case where a native Promotion line-item adjustment coexists with
  the voucher on the same items.
- Never remove the Rule-11 shrink guard in `verify-cart-totals` until a passing regression test
  (Phase 5) proves the chosen carrier handles that narrow coexistence case correctly — "the design
  should make it impossible" is not sufficient without a test that actually exercises a native
  Promotion line-item adjustment coexisting with the voucher.
- Never treat the carrier mechanism as an abstract unknown to be resolved from scratch — the
  default forward architecture is to evaluate native Medusa Promotion application first; propose an
  alternative only if Phase 1 verifies Medusa 2.16.0 cannot satisfy the SRS this way (and never
  `cart.credit_lines` or a payment/customer-credit mechanism, per Phase 0).
- Never assume an undocumented Medusa API behavior — verify against the installed 2.16.0 source
  first, one package/symbol at a time, and cite `file:line`.
- Never let `VoucherConfig` regain independent source-of-truth status for a field now owned by
  Promotion/Campaign without an explicit, recorded justification in one of four categories: SRS
  behavior, atomicity, CRM sourcing, or the Vietnamese response contract.
- Never assume the `per_user_limit` enforcement mechanism — it must be explicitly decided in
  Phase 1 (native Campaign per-customer budget vs. custom atomic `VoucherUsageLog`-based
  enforcement), verified against the installed source, and recorded.
- Never delete historical docs — supersede with clearly named new docs/sections.
- Never skip a required subagent run (`medusa-module-reviewer`, `test-writer`, `security-auditor`)
  for a phase that requires it.
- Never let SPEC.md and the rebuilt code silently disagree — route SPEC-affecting changes through
  the `voucher-spec-advisor` hand-off.

## Reference files

- `references/phase-plan.md` — Phases 0–6 in full: goal, preconditions/gate, in/out of scope,
  detailed steps, exact files likely affected (real repo paths), required subagent runs, the
  Plan/Files/Tests/Risk/Rollback deliverable template, exit criteria for each phase, and the SRS
  §6.2 API contract mapping (apply/remove voucher, My Vouchers, admin create voucher, admin voucher
  analytics).
- `references/keep-remove-map.md` — every Keep/Rebuild/Remove item with rationale, the specific
  file(s) it currently lives in (as of the architecture review), what "done" looks like for
  items in the Rebuild column, and the SRS §5.2 data-relationship mapping (VoucherConfig↔Promotion
  Link, VoucherConfig-has-many-VoucherUsageLog, VoucherUsageLog references Customer/Order,
  DiscountCapConfig singleton).
- `references/verification.md` — pre-verified Medusa 2.16.0 framework facts (field names, workflow
  behavior, timing) so sessions don't need to re-derive them from scratch; the exact subagent
  trigger table; and the Phase 5 test plan (T-VOUCH-01..12 re-run, the new CONFLICT-8 regression
  test, and the usage-count-timing check), plus the exact `pnpm` scripts to
  run (never raw `jest`, per `.claude/rules/testing.md`).
