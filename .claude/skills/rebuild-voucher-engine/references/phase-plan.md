# Phase plan — full detail

Each phase below lists: **Goal**, **Gate to enter**, **In scope / Out of scope**, **Steps**,
**Files likely affected** (real paths confirmed by the architecture review), **Required subagents**,
**Deliverable**, and **Exit criteria**. Every implementation phase (1–6) uses the same deliverable
template, given once here and referenced by name afterward.

## Deliverable template (Phases 1–6)

Produce this before/alongside implementing the phase, and again in the completion report:

- **Plan** — what will change and why, naming the specific architecture-review finding it addresses
  (e.g. "CONFLICT-8/PD-15", "duplicated `usage_limit` field", "separate admin sidebar").
- **Files affected** — exact paths, marked new / modified / deleted.
- **Tests** — which existing tests must still pass unmodified, which are updated, which are new,
  and under which `pnpm` script (see `verification.md` §Test commands). Never raw `jest`.
- **Risk** — what could break, cross-referencing the architecture review's risk table where
  applicable (stacking, cap correctness, usage timing, sale-price integrity — VoucherEngine must
  never alter the Price List sale price, per Phase 0 — the narrow native-Promotion-adjustment
  coexistence case CONFLICT-8 identifies, 2.16.0 compatibility, migration/rollback).
- **Rollback notes** — how to revert this phase's change independently of later phases (e.g. "Phase
  2's carrier swap can be reverted by re-enabling the ephemeral-Promotion steps without touching
  Phase 1's Link/backfill work").

## Known corrections to the two Vietnamese reference docs

Before using `HUONG_DAN_PROMOTION_MODULE_MEDUSA.vi.md` or `MEDUSA_PROMOTION_MODULE_SUMMARY.vi.md`
as a native-capability reference, apply these corrections (verified against installed 2.16.0
source — see `verification.md` for exact citations):

- The native usage counter field is **`used`**, not `usage_count`, on both `Promotion` and
  `CampaignBudget`.
- That counter is incremented via a plain read-then-`update()` inside a workflow step
  (`registerUsage`), **not** an atomic `INCR` — it does not satisfy this repo's INT-02 atomicity
  requirement on its own. VoucherEngine's own `redeemVoucherAtomic` is more correct and must remain
  authoritative regardless of what else this rebuild changes.
- `CampaignBudgetTypeValues` has **four** values (`spend`, `usage`, `use_by_attribute`,
  `spend_by_attribute`), not two — the attribute-based ones are `@since 2.11.0` and present in
  2.16.0.
- The `target_rules`/rule `attribute` whitelist shown in the docs (`items.product.id`, etc.) is
  enforced **only** by the admin dashboard's autocomplete endpoint, not by the module or the rule
  _write_ path — treat it as an admin-UX convention, not an API-level restriction, when deciding the
  Phase 1 scope spike.
- Neither doc mentions `cart.credit_lines` at all. It was evaluated as a carrier candidate during
  this rebuild's architecture review and has since been **rejected** (Phase 0, confirmed decision:
  do not use `cart.credit_lines`). Per the latest business clarification, the default forward
  architecture instead evaluates **native Promotion application** as the carrier first — see the
  next section. Do not assume either doc's Promotion-only framing settles the carrier's exact
  mechanism; Phase 1 must still verify it against the installed source.

---

## Default forward architecture: native Promotion as carrier

Per the latest business clarification, the default forward architecture for the discount carrier
is to evaluate **native Medusa Promotion/Campaign application first** — not to treat the carrier
as an abstract unknown to be invented from scratch in Phase 1.

**Why this changes the picture:** "item-level promotion," in this project, means the **Price List
sale price from the Medusa Pricing Module** (a Pricing Module concept), not a Promotion line-item
adjustment (a Promotion Module concept) — unless a specific section explicitly says otherwise
(Phase 0, decision 4). The CONFLICT-8/PD-15 diagnosis (`computeActions` ordering breaking SRS
Rule 11) was made under the _old_ assumption that item-level promotion always means a Promotion
adjustment running through the same `computeActions` pipeline as the voucher's carrier. Under the
corrected interpretation, **CONFLICT-8 is historical context for the old implementation, not an
automatic blocker for every carrier choice** — it only matters in the narrower case where a
**native Promotion line-item adjustment** also coexists with the voucher on the same items (which
is possible, just not the default case the SRS envisions).

**Phase 1's job:** verify, against the installed Medusa 2.16.0 source, whether native Promotion
application — which may mean the current ephemeral-per-cart mechanism, a cleaner native-Promotion
carrier, or some other native-Promotion-based approach; Phase 1 determines which — can satisfy the
SRS, including the narrow coexistence case above. **Only if that verification shows Medusa 2.16.0
cannot satisfy the SRS this way should Phase 1 propose a different carrier** — and even then, the
Phase 0 exclusions still apply: never `cart.credit_lines`, never a payment/customer-credit
mechanism.

This does **not** mean the current ephemeral-Promotion implementation is presumed correct — it
means the _category_ of solution (native Promotion application) is the default hypothesis to
verify, not an abstract unknown requiring a from-scratch invention. Phase 1's decision must be
recorded with its verification evidence (`file:line` citations against the installed source),
whichever way it lands. See Phase 1 below for the exact in-scope step.

---

## SRS §6.2 — API contract mapping

The rebuild must preserve SRS §6.2's behavior and response-field contract for these five endpoints.
Medusa-normalized paths are allowed (e.g. `/store/carts/:id/voucher` instead of a non-Medusa-shaped
route), but **behavior and response fields must follow the SRS**, not just whatever shape is
convenient for the native Promotion/Campaign objects underneath.

| SRS §6.2 endpoint       | Medusa-normalized path              | What must follow SRS regardless of path                                                             |
| ----------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Apply voucher           | `POST /store/carts/:id/voucher`     | Request/response contract, V1–V8 validation order, discount/cap fields, Vietnamese message contract |
| Remove voucher          | `DELETE /store/carts/:id/voucher`   | Response contract; no usage-count side effect (Phase 0, decision 7)                                 |
| My Vouchers             | `GET /store/customers/me/vouchers`  | Eligibility/savings preview fields; CRM-sourced list (Phase 0, decision 9)                          |
| Admin create voucher    | `POST /admin/vouchers`              | Request fields; Promotion-first creation behavior (Phase 1)                                         |
| Admin voucher analytics | `GET /admin/vouchers/:id/analytics` | Response fields (`total_uses`, `total_discount_given`, `capped_count`, etc.)                        |

Do not let a Medusa-idiomatic route shape become an excuse to drop or rename a required SRS
response field. This table maps exactly the five endpoints SRS §6.2 specifies — do not read it as
license to add further endpoints beyond these five. See `keep-remove-map.md` §SRS §5.2 for the
corresponding data-relationship mapping.

---

## Phase 0 — Decision gate

**Goal:** Record the confirmed rebuild-scope decisions, and resolve the one still-open scope
question they don't cover, before any further design or carrier work happens.

**Gate to enter:** None — this is the starting phase.

**Code changes allowed:** **No.** Only the decision record may be created/updated.

**In scope:**

- Record the ten confirmed decisions below into the decision log, each with its stated
  consequence for the rebuild.
- Resolve the one remaining open scope question they don't cover (`target_rules` spike timing).
- If needed, do read-only research (installed-source verification) to clarify a _consequence_ of a
  decision — never to relitigate or reverse a decision that's already confirmed.

**Out of scope:**

- Any workflow, model, migration, admin, or storefront code change.
- Choosing the actual carrier mechanism that replaces the ephemeral Promotion — that is explicitly
  deferred to Phase 1 planning now that `cart.credit_lines` is rejected (decision 1 below). Do not
  let Phase 0 quietly pick a replacement carrier.
- Reversing or re-deriving any of the ten confirmed decisions based on the session's own inference
  (e.g. do not conclude "since item-level promotion now means Price List sale price, CONFLICT-8 is
  moot" — that conclusion, even if it later turns out correct, belongs to Phase 1 planning with the
  user, not to a Phase 0 write-up).

**Confirmed decisions (record verbatim in the decision log):**

1. **Do not use `cart.credit_lines` as the discount carrier.** It was evaluated during the
   architecture review and is rejected. This does **not** automatically mean the current
   ephemeral-Promotion mechanism is fine as-is either — per the later business clarification (see
   §Default forward architecture above), the default forward architecture evaluates native
   Promotion application first, and Phase 1 must verify (not assume) whether the current mechanism
   or another native-Promotion-based approach satisfies the SRS, including the narrow
   native-Promotion-adjustment coexistence case CONFLICT-8/PD-15 identifies.
2. **The voucher is not payment or customer credit.** VoucherEngine must not be modeled as, or
   implemented via, any store-credit/payment-credit mechanism, native or custom — a scope boundary
   broader than just "don't use `credit_lines`."
3. **Tax handling is out of scope for this rebuild.** No phase needs to resolve tax-base or
   tax-treatment questions as a gate; do not reintroduce a tax-sign-off gate modeled on the old
   credit-line tax question.
4. **"Item-level promotion" means the Price List sale price from the Medusa Pricing Module, not a
   Promotion line-item adjustment, unless a section explicitly states otherwise.** This corrects
   the term's meaning wherever it's used in this skill's guidance (including the
   CONFLICT-8/Rule-11 narrative in `SKILL.md` and the `computeActions`-ordering facts in
   `verification.md`) — those sections still accurately diagnose what's wrong with the _current_
   ephemeral-Promotion implementation, but any _forward_ planning under this decision must use the
   Price-List/sale-price meaning unless it explicitly says "Promotion line-item adjustment."
5. **The voucher applies on the adjusted/sale line price** (the Price-List-resolved line price,
   per decision 4), not on the pre-discount list price.
6. **VoucherEngine must not alter the sale price.** It reads the Pricing Module's resolved sale
   price; it never writes to Price List data or otherwise mutates it.
7. **`VoucherUsageLog` is created only after successful order placement.** Reaffirms the existing
   Keep-table item (`keep-remove-map.md`) as a locked, non-negotiable constraint — not a new
   capability to build.
8. **V7 segment validation is mandatory.** No longer a deferred no-op stub — this supersedes the
   `BLOCKED: Pending Decision (PD-06)` status recorded in SPEC.md and the "never implemented even
   as custom logic" framing the pre-revision `keep-remove-map.md` carried; see that file's Keep
   table for the corrected disposition.
9. **"My Vouchers" is sourced from CRM campaign/customer assignment logic.** Its eligibility data
   comes from the CRM's campaign/customer assignment, not (necessarily) native Medusa customer
   groups — whether/how this also intersects with native Promotion customer-group rules is an open
   Phase 1 question, not resolved here.
10. **Reuse native Promotion/Campaign wherever possible; custom VoucherEngine code covers only
    SRS-specific gaps.** Reaffirms this skill's overall operating principle — recorded here as a
    locked constraint alongside the others, not a new decision.

**Still-open scope question to resolve in this phase:**

- **`target_rules` scope-spike timing.** Should the `target_rules` OR-across-attributes fidelity
  spike (product OR category matching via native Promotion target rules) happen now, inside
  Phase 1, or be explicitly deferred (keeping `VoucherConfig`'s plain-JSON
  `applicable_product_ids`/`applicable_category_ids` as-is) until a later rebuild pass?

**Steps:**

1. Present the ten confirmed decisions to the user as a record to be logged (not as open
   questions — they're already decided), and ask the one still-open scope-spike-timing question.
2. Record every decision, its stated consequence, and (for the scope-spike question) the answer
   and rationale, in `.claude/specs/voucher-engine/rebuild-decisions.md` (create if it doesn't
   exist; append-only after that).
3. Stop. Report the decision record back to the user and explicitly ask whether to proceed to
   Phase 1.

**Files likely affected:** `.claude/specs/voucher-engine/rebuild-decisions.md` (new, docs only).

**Required subagents:** None.

**Deliverable:** The decision record itself (not the Plan/Files/Tests/Risk/Rollback template —
Phase 0 has no code).

**Exit criteria:** All ten confirmed decisions and the scope-spike-timing answer are recorded, and
the user has explicitly approved starting Phase 1.

---

## Phase 1 — Backend foundation

**Goal:** Make Promotion/Campaign the source of truth for the fields it natively covers; wire a
real link between `VoucherConfig` and `Promotion`; resolve the scope-spike question from Phase 0.

**Gate to enter:** Phase 0 decision record exists and is approved.

**In scope:**

- A Promotion-first `createVoucherWorkflow` v2: create the real `Promotion` (+ `Campaign` for the
  validity window) via `createPromotionsWorkflow`, using `additional_data` to pass
  VoucherConfig-specific fields in the same call where appropriate, and the `promotionsCreated`
  hook (verified real in 2.16.0 via the `AdditionalData` workflow-input pattern) to auto-provision
  the linked `VoucherConfig` row — Promotion-first, hook-driven, reversing today's
  VoucherConfig-first-then-sync direction. Use `medusa-dev:building-with-medusa` for the generic
  hook/workflow pattern; this repo's specifics live here.
- A real `defineLink` between `VoucherEngineModule.linkable.voucherConfig` and
  `PromotionModule.linkable.promotion`, replacing the currently-vestigial `promotion_id` text field
  on `VoucherConfig` (confirmed unused by the current apply path).
- Backfill: for every existing `voucher_config` row, create a matching real `Promotion` (+
  `Campaign` if it has a validity window) and populate the link, so no voucher is left unlinked.
- The `target_rules` OR-across-attributes fidelity spike, **only if Phase 0 decided "now."** If
  Phase 0 deferred it, skip this step and leave `applicable_product_ids`/`applicable_category_ids`
  as plain JSON on `VoucherConfig` (Decision B stays).
- Decide, and record in the Plan deliverable, whether `code`/`is_active`/`valid_from`/`valid_to`/
  `discount_type`/`discount_value` are fully dropped from `VoucherConfig` now that Promotion/
  Campaign is authoritative, or kept as a synced read-cache for query performance. Either is
  acceptable; silently doing nothing is not — this is a real fork the review flagged and it needs a
  recorded answer, not a default.
- **Verify whether native Promotion application can serve as the discount carrier** — the default
  forward architecture (see §Default forward architecture above), not an open-ended invention task.
  `cart.credit_lines` is rejected (Phase 0, decision 1). Evaluate the current ephemeral-Promotion
  mechanism and/or a cleaner native-Promotion carrier against the installed Medusa 2.16.0 source,
  under Phase 0's corrected "item-level promotion" semantics (decisions 4–6): the voucher applies
  on the Price-List/sale-adjusted line price and VoucherEngine must never alter that sale price.
  Specifically verify the narrow coexistence case CONFLICT-8 identifies — a native Promotion
  line-item adjustment present on the same items as the voucher — and whether the chosen mechanism
  handles it correctly. **Only if this verification shows Medusa 2.16.0 cannot satisfy the SRS
  should a different carrier be proposed** (still excluding `cart.credit_lines` and any
  payment/customer-credit mechanism). Record the verified/decided mechanism, the native Medusa
  API(s) it uses (`file:line` citations against the installed source), and the coexistence-case
  finding. This decision is a hard prerequisite for Phase 2 — Phase 2 must not start without it.
- **Explicitly decide the `per_user_limit` enforcement mechanism** — native Campaign per-customer
  budget (`CampaignBudget{type:"use_by_attribute", attribute:"customer_id"}`) vs. custom atomic
  `VoucherUsageLog`-based enforcement (see `keep-remove-map.md`'s per-user-limit row). Verify the
  native option against the installed 2.16.0 source (budget-creation overhead of one Campaign per
  voucher, atomicity of `registerUsage`'s increment) before choosing either way — do not assume the
  prior revision's "keep custom" conclusion without re-verifying it against this decision's own
  merits. Record the decision and its rationale.

**Out of scope:**

- Implementing the carrier mechanism itself (do not touch `apply-voucher.ts`, `remove-voucher.ts`,
  `revalidate-voucher-on-cart-change.ts`'s carrier steps, or
  `lib/create-and-attach-ephemeral-promotion.ts`/`lib/ephemeral-promotion.ts` in this phase) —
  Phase 1 only verifies/decides the mechanism; Phase 2 implements it.
- Admin UI changes (Phase 3).
- Storefront changes (Phase 4).
- V1–V8 validation, `calculate-discount`, `redeemVoucherAtomic`, `VoucherUsageLog`,
  `DiscountCapConfig`, rate limiting — keep exactly as-is (see `keep-remove-map.md`).

**Files likely affected:**

- `src/modules/voucher-engine/models/voucher-config.ts` — field changes per the recorded
  drop-vs-cache decision.
- `src/modules/voucher-engine/migrations/` — new migration for the field change + link.
- `src/links/voucher-config-promotion.ts` (new or repaired — a `defineLink` already exists in
  SPEC.md's Decision C but is confirmed unused; verify current state before assuming it's absent).
- `src/workflows/voucher-engine/admin/create-voucher.ts` and
  `src/workflows/voucher-engine/admin/steps/create-voucher.ts` — Promotion-first rewrite.
- A new admin update workflow if one doesn't exist yet for syncing `VoucherConfig` ↔ Promotion on
  edit (this may overlap with Phase 3's "missing update route" item — coordinate, don't duplicate).
- `src/scripts/` — a new one-off idempotent backfill script (per `medusa.md`'s scripts convention:
  default-exports `async ({ container }: ExecArgs)`, idempotent, run via
  `npx medusa exec ./src/scripts/<file>.ts`).

**Required subagents:** `medusa-module-reviewer` after the module/link/workflow changes land, before
calling the phase done. `test-writer` before writing the module-integration tests for the link and
backfill.

**Deliverable:** Plan / Files affected / Tests / Risk / Rollback (see template above).

**Exit criteria:** All existing vouchers have a real linked Promotion (+Campaign where applicable);
`medusa-module-reviewer` has run clean or findings are resolved; existing V1–V8/calc/rate-limit
tests still pass unmodified; the scope-spike question is either resolved (if Phase 0 said "now") or
explicitly deferred (if Phase 0 said "later") — not silently ignored; **whether native Promotion
application can serve as the carrier is verified and recorded, with `file:line` evidence and the
narrow-coexistence-case finding — or, only if that verification failed, an alternative carrier is
proposed and recorded instead (never `cart.credit_lines`/payment-customer-credit)**; **the
`per_user_limit` enforcement mechanism is explicitly decided and recorded**; user has explicitly
approved starting Phase 2.

---

## Phase 2 — Carrier swap

**Goal:** Implement the carrier mechanism Phase 1 verified/decided — by default, a native-Promotion-
based approach (per §Default forward architecture), computed on the Price-List/sale-adjusted line
price per Phase 0's corrected terminology, without altering the sale price itself. This phase is a
genuine "swap" away from the current implementation only if Phase 1's verification found the
current ephemeral mechanism (or native Promotion generally) cannot satisfy the SRS — in that case,
and only then, an alternative (never `cart.credit_lines` — rejected in Phase 0) is implemented
instead.

**Gate to enter:** Phase 1 stable (linked Promotions exist) **and** Phase 1 has recorded its
verified/decided carrier mechanism with rationale and evidence. Do not start this phase on the
strength of Phase 1's Promotion/Campaign linking alone — the carrier decision is a separate gate,
and this phase has no default mechanism to fall back to if Phase 1 didn't record one.

**In scope:**

- In `applyVoucherWorkflow` (`apply-voucher.ts`), update the create-Promotion-and-
  `updateCartPromotionsWorkflow(ADD)` steps to match whatever mechanism Phase 1 verified/decided —
  this may mean keeping the current native-Promotion approach with narrow-case fixes (per Phase 1's
  coexistence-case finding), or replacing it with a different native-Promotion carrier, or (only if
  Phase 1 found native can't satisfy the SRS) a different mechanism entirely.
- In `removeVoucherWorkflow` (`remove-voucher.ts`), update the detach/delete-Promotion steps to
  match the same mechanism.
- In `revalidateVoucherWorkflow` (`revalidate-voucher-on-cart-change.ts`), update the
  swap-the-Promotion step to match the same mechanism.
- Simplify `steps/verify-cart-totals.ts` **only if** the new mechanism structurally cannot
  interfere with item-level discounts the way the ephemeral-Promotion carrier could (per Phase 1's
  recorded rationale) — see the non-negotiable rule below before removing the Rule-11
  shrink-detection logic. If the new mechanism doesn't eliminate the interference risk by
  construction, keep the shrink guard.
- If Phase 1 decided a different mechanism than the current one, retire
  `lib/create-and-attach-ephemeral-promotion.ts` and `lib/ephemeral-promotion.ts` (or mark them for
  Phase 6 removal — team's choice, record which in the Plan deliverable). If Phase 1 kept the
  current native-Promotion approach (with narrow-case fixes), these files stay and are updated in
  place instead.

**Out of scope:**

- Choosing the carrier mechanism itself — that's Phase 1's job. If Phase 1 didn't decide it, stop
  and go back to Phase 1 rather than deciding it here.
- Admin UI (Phase 3).
- Storefront (Phase 4) — the storefront currently filters the ephemeral promotion out of
  `cart.promotions` by id (`discount-code/index.tsx`); whether that filtering must be removed,
  changed, or left alone depends on what Phase 1's chosen mechanism actually does to
  `cart.promotions` — that determination and any resulting change belongs to Phase 4, not this
  phase.
- Deleting the old ephemeral-Promotion files outright — do that in Phase 6, once Phase 5's
  regression test has proven the swap is correct and nothing still depends on the old path.

**Files likely affected:**

- `src/workflows/voucher-engine/apply-voucher.ts`
- `src/workflows/voucher-engine/remove-voucher.ts`
- `src/workflows/voucher-engine/revalidate-voucher-on-cart-change.ts`
- `src/workflows/voucher-engine/steps/verify-cart-totals.ts`
- `src/workflows/voucher-engine/lib/create-and-attach-ephemeral-promotion.ts` (retire or mark)
- `src/workflows/voucher-engine/lib/ephemeral-promotion.ts` (retire or mark)
- `src/workflows/voucher-engine/steps/load-cart-context.ts` — verify how it must read the new
  mechanism's data (if any) for `item_promotion_discount` exclusion — today it excludes the
  ephemeral Promotion's adjustment by id; that exclusion logic may not translate directly to
  Phase 1's chosen mechanism. Verify against installed source and Phase 1's decision record before
  assuming either way.

**Required subagents:** `medusa-module-reviewer` after the workflow/step changes.
`security-auditor` after this phase (it touches the core voucher discount path). `test-writer`
before the new/updated workflow tests.

**Deliverable:** Plan / Files affected / Tests / Risk / Rollback.

**Exit criteria:** Apply/remove/revalidate all work against the Phase-1-decided mechanism; the
CONFLICT-8 regression test (Phase 5) passes; cart/order totals match expected values to the VND for
both the happy-path and cap-exceeded SRS fixtures, computed on the Price-List/sale-adjusted line
price; user has explicitly approved starting Phase 3 (Phases 3 and 4 can proceed in either order or
in parallel once Phase 2 is stable — confirm with the user which they want first).

---

## Phase 3 — Admin

**Goal:** Voucher management lives inside the Promotions section; missing CRUD is added.

**Gate to enter:** Phase 1 stable (a real linked Promotion exists to point the admin UI at).

**In scope:**

- Fold voucher-specific fields (`max_discount_amount`, `applicable_product_ids`/
  `applicable_category_ids` if still custom JSON, `per_user_limit`, `stackable_with_promotions`)
  into the Promotion detail page as a tab, section, or widget — per `medusa.md`'s guidance to
  prefer this over a separate sidebar item. Use `medusa-dev:building-admin-dashboard-customizations`
  for the generic widget/route patterns.
- Add the currently-missing admin update and deactivate routes for `VoucherConfig` (today only
  list/create/analytics exist).
- Add `DiscountCapConfig` CRUD (today it's create-only via a seed script, with no admin route at
  all).
- Remove the standalone `src/admin/routes/vouchers/page.tsx` sidebar registration **only after**
  the folded-in Promotions UI covers the same functionality — do not remove it prematurely leaving
  a functionality gap. If removing it now would leave a gap, defer the removal to Phase 6 and note
  why in the Plan deliverable.

**Out of scope:** Storefront (Phase 4); the carrier mechanism (already done in Phase 2, or not yet
started — this phase doesn't depend on Phase 2's completion, only Phase 1's).

**Files likely affected:**

- `src/admin/routes/vouchers/page.tsx` — fold or remove per above.
- `src/admin/components/create-voucher-modal.tsx`, `src/admin/components/voucher-analytics-drawer.tsx`
  — relocate/adapt as Promotion-detail widgets.
- New: an update/deactivate admin route pair for `VoucherConfig` (mirroring
  `src/api/admin/vouchers/route.ts`'s existing create/list shape).
- New: admin routes + workflow for `DiscountCapConfig` CRUD.
- `src/admin/lib/api.ts`, `src/admin/lib/types.ts` — new hooks/types for the above.

**Required subagents:** `medusa-module-reviewer` after the admin route/workflow additions.
`security-auditor` after adding the new admin routes (admin authZ correctness).

**Deliverable:** Plan / Files affected / Tests / Risk / Rollback.

**Exit criteria:** Voucher config is editable/deactivatable and cap-config is manageable from the
admin, without a functionality regression versus today; user has explicitly approved starting
Phase 4 (if not already done in parallel).

---

## Phase 4 — Storefront

**Goal:** Checkout voucher UI calls the corrected backend APIs. **Correction (post-Phase 2):**
Phase 2 shipped as a **verification-only** phase — it left the ephemeral per-cart Promotion
transport completely unchanged (no swap, no retirement; see `rebuild-decisions.md` and
`voucher-engine-rebuild-progress.md`'s Phase 2 entry). Phase 4 must therefore **not assume the
`ephemeral_promotion_id`-based filtering in `discount-code/index.tsx` is dead code** — the
mechanism it filters for is still exactly the same one in production. Phase 4's job here is to
**review, adapt if needed, and document** the current filtering logic against the (confirmed
unchanged) ephemeral mechanism, not to blindly remove it on the assumption that "the carrier
changed."

**Gate to enter:** Backend APIs this phase depends on are stable — at minimum Phase 1. Phase 2 has
shipped and its effect on `cart.promotions` is now known: **none** — the ephemeral Promotion still
appears there exactly as before Phase 2. This resolves the previous open question ("what does
Phase 2's carrier do to `cart.promotions`") — the answer is "nothing changed" — but does not by
itself prove the existing filtering logic still needs no adaptation; Phase 4 must still verify this
against the live storefront/API behavior before concluding either way.

**In scope:**

- Keep the existing dual-path design in `discount-code/index.tsx` (voucher endpoint first, generic
  promotion-code fallback) — it's sound and doesn't need to change conceptually.
- **Review** the `ephemeral_promotion_id`-based filtering of `cart.promotions` in
  `discount-code/index.tsx` against the confirmed-unchanged ephemeral mechanism. Likely outcome:
  the filtering is still needed as-is, since the mechanism it targets never changed. Do not remove
  it without first confirming (and documenting, in this file or `rebuild-decisions.md`) that it is
  genuinely no longer necessary — "Phase 2 happened" is not sufficient justification on its own.
- **Do not add a `credit_line_total` (or similar) display to `CartTotals`** — `cart.credit_lines`
  is rejected as the carrier (Phase 0), so there is no `credit_line_total` field to surface. The
  carrier is the unchanged ephemeral Promotion — no new total/savings field was introduced by
  Phase 2 for this phase to surface.
- Consolidate the hand-rolled `voucherFetch` client (`lib/data/voucher.ts`) and the hand-mirrored
  types (`modules/voucher/types.ts`, `modules/voucher/errors.ts`) — either fix the shared SDK's
  `FetchError` gap (it drops `code`/`customer_message`/`details`/`request_id` on non-2xx) in one
  shared wrapper reused by both this file and the rest of `lib/data/`, or single-source the
  error-envelope type from the backend instead of hand-copying it. Use
  `medusa-dev:building-storefronts` for the generic SDK-usage pattern.

**Out of scope:** Admin (Phase 3, independent). **Backend carrier logic is explicitly out of
scope and must not be modified in this phase** — `apply-voucher.ts`, `remove-voucher.ts`,
`revalidate-voucher-on-cart-change.ts`, `steps/verify-cart-totals.ts`, `steps/load-cart-context.ts`,
`lib/create-and-attach-ephemeral-promotion.ts`, `lib/ephemeral-promotion.ts` — all confirmed
unchanged by Phase 2 and not this phase's concern; Phase 4 only adapts the storefront's own
read/display of what these already produce.

**Files likely affected:**

- `apps/storefront/src/modules/checkout/components/discount-code/index.tsx`
- `apps/storefront/src/modules/checkout/components/discount-code/available-vouchers-modal.tsx`
- `apps/storefront/src/modules/common/components/cart-totals/index.tsx`
- `apps/storefront/src/lib/data/voucher.ts`
- `apps/storefront/src/modules/voucher/types.ts`, `apps/storefront/src/modules/voucher/errors.ts`

**Required subagents:** `security-auditor` after this phase (checkout code path).

**Deliverable:** Plan / Files affected / Tests / Risk / Rollback.

**Exit criteria:** Checkout apply/remove/replace/auto-remove UX behaves identically to before from
the customer's perspective (unless Phase 0 explicitly changed customer-visible savings display);
the `ephemeral_promotion_id`-based filtering has been reviewed against the confirmed-unchanged
ephemeral mechanism and either left in place, adapted, or removed **with a documented reason** —
never removed by default assumption; manual browser verification done (this repo's storefront
testing is manual/Playwright-stretch-goal per `.claude/rules/testing.md` — there is no automated
storefront test suite to rely on instead).

---

## Phase 5 — Verification

**Goal:** Prove the rebuild is correct end-to-end before cleanup.

**Gate to enter:** Phases 1–4 implemented (2 and 3/4 may have shipped in whatever order the user
chose, but all must be done before this phase starts).

**In scope:** See `verification.md` §Test plan for the full detail. **Priority order, highest
first** — Phase 5 must clear the accumulated deferred-test backlog from Phases 1–3 before anything
else, since none of it has actually been run yet (all blocked on an environmental port-9009
conflict across three prior sessions — see `voucher-engine-rebuild-progress.md`):

1. **Phase 1 tests** — `create-voucher-workflow.integration.spec.ts`,
   `backfill-voucher-promotions.integration.spec.ts`, the extended `voucher-admin.spec.ts` (admin
   create/list/analytics).
2. **Phase 2 test** — `voucher-sale-price-basis.spec.ts` (proves the voucher discount is computed
   against the Price-List adjusted/sale `unit_price`, never `compare_at_unit_price`, and that
   applying a voucher never alters either field).
3. **Phase 3 test** — `discount-cap-config-admin.spec.ts` (`DiscountCapConfig` upsert-safety:
   default-when-none-exists, create-then-update-in-place, exactly one active row, invalid-input
   rejection).
4. **T-VOUCH-01..12**, re-run unmodified where the carrier change doesn't affect them (it mostly
   doesn't — Phase 2 kept the ephemeral mechanism unchanged) and updated only where a test
   legitimately needs to reflect a Phase 1–3 change (e.g. an admin-response-shape assertion).
5. **Usage-count and `VoucherUsageLog` timing** (regression, not new logic) — confirm usage count
   still increments only after successful order placement, never on apply/remove, and that
   `VoucherUsageLog` is created only at that same point (Phase 0 decision 7).
6. **Manual admin/storefront checks** — the admin `DiscountCapConfig` UI (Phase 3B) and whatever
   Phase 4 storefront changes ship both lack automated coverage in this repo; use the manual
   verification checklists already produced (Phase 3B's checklist; Phase 4 should produce its own)
   rather than skipping verification because "there's no test for it."

**CONFLICT-8 regression test — conditional, not required by default.** **Correction:** CONFLICT-8
(the narrow native-Promotion-line-item-adjustment-coexistence case) is historical/out-of-default-
scope for this project's current SRS interpretation — "item-level promotion" means the Price List
sale price from the Pricing Module (Phase 0 decision 4), and native-Promotion-adjustment
coexistence with the voucher is explicitly not part of the default scope (confirmed during Phase 2
planning). **Do not treat this test as a Phase 6 blocker unless the business explicitly requires
native Promotion line-item adjustment coexistence support later.** If that requirement is ever
raised, add the regression test then (construct a cart with a native Promotion line-item adjustment
already applied, apply a voucher on the same items, and assert the pre-existing adjustment is
unchanged and VoucherEngine never alters the sale price — see `verification.md` for the full
originally-specified test shape, kept there as reference in case this is ever revisited). Until then,
this is explicitly deferred, not silently dropped — record its deferred status, not its completion.

**Out of scope:** Any new feature work — this phase only tests what Phases 1–4 built.

**Files likely affected:** New/updated spec files under
`src/workflows/voucher-engine/__tests__/`, `src/modules/voucher-engine/__tests__/`, and
`integration-tests/http/` per `.claude/rules/testing.md`'s naming convention.

**Required subagents:** `test-writer` for any new test file before it's written by the main session.
`security-auditor` for any test exercising rate-limiting/checkout paths.

**Deliverable:** Plan / Files affected / Tests / Risk / Rollback, plus the actual test run output
(never claim a test passed without having run it via the repo's `pnpm` scripts).

**Exit criteria:** The full deferred-test backlog above (Phase 1/2/3 tests) has actually been run
and passes — not just written; all of T-VOUCH-01..12 pass (updated where legitimate); usage-count
timing and `VoucherUsageLog` creation timing are confirmed unchanged; manual admin/storefront
checks completed. The CONFLICT-8 regression test is **not** a default exit-criterion — only include
it if the business has explicitly requested native-Promotion-adjustment coexistence support (see
above). User has explicitly approved starting Phase 6.

---

## Phase 6 — Cleanup

**Goal:** Remove **only truly dead code**, without losing history.

**Correction (post-Phase 2):** Phase 2 shipped as **verification-only** and explicitly kept the
ephemeral per-cart Promotion transport unchanged — it was never retired, and this phase must **not
remove** `lib/create-and-attach-ephemeral-promotion.ts`, `lib/ephemeral-promotion.ts`, or any
`PromotionActions`/`updateCartPromotionsWorkflow` usage in `apply-voucher.ts`/`remove-voucher.ts`/
`revalidate-voucher-on-cart-change.ts`. These are the **live, in-use carrier** — deleting them would
remove the actual discount mechanism, not dead code. The previous version of this phase's plan
assumed a carrier swap that did not happen; treat that assumption as void.

**Gate to enter:** Phase 5 fully green (per Phase 5's corrected exit criteria — the deferred-test
backlog run and passing, T-VOUCH-01..12 passing, usage-timing confirmed; the CONFLICT-8 regression
test is not required unless the business has explicitly asked for native-Promotion-adjustment
coexistence support).

**In scope — remove only what is proven genuinely dead:**

- The superseded old admin create step, `src/workflows/voucher-engine/admin/steps/create-voucher.ts`
  — unreferenced since Phase 1's Promotion-first rewrite (already marked dead/superseded in its own
  docstring, kept at its original path rather than deleted because this environment's permission
  system denies file deletion — see the Phase 1 review-fix entry in
  `voucher-engine-rebuild-progress.md`). Remove **only if** re-confirmed unreferenced at Phase 6
  time and file deletion is actually possible in that session's environment.
- Scripts/tests that are **proven** obsolete on their own merits — not because "the carrier
  changed" (it didn't). E.g. `src/scripts/seed-voucher-cap-demo.ts`, `seed-tier-promo.ts`,
  `seed-voucher-engine.ts`, or `__tests__/ephemeral-promotion.unit.spec.ts` remain candidates
  **only if** a Phase 6 review finds each one specifically dead/duplicated/superseded on its own
  merits (e.g. superseded by a newer fixture, or never actually used) — verify each script's actual
  content before deleting; most of these likely still exercise the current, still-live ephemeral
  mechanism and are NOT removal candidates by default.
- The old admin sidebar registration (`src/admin/routes/vouchers/page.tsx`) — remove **only after**
  a Promotion-integrated UI has full feature parity with it. As of Phase 3B, no such Promotion-
  integrated UI exists yet (Phase 3B only added the `DiscountCapConfig` section to this SAME
  standalone page — the Promotion-detail widget was explicitly deferred). This item is very likely
  not yet ready for Phase 6 removal; re-check its actual status when Phase 6 starts rather than
  assuming it's ready.
- Any test files that are proven to test genuinely removed/dead functionality with no equivalent
  assertion elsewhere — not test files for the (still-live) ephemeral mechanism.

**Out of scope:** Historical docs — never delete `voucher-engine.solution-flow.completed.md`, old
`SPEC.md` sections, or `.claude/lessons/voucher-engine/*`. If a doc needs to be superseded, add a
new, clearly named doc or a "Superseded by <link>, see rebuild-decisions.md" note at the top of the
old section — never a silent rewrite or deletion. The ephemeral-Promotion carrier files are also
out of scope for removal (see correction above) unless a future phase explicitly re-decides the
carrier mechanism.

**Files likely affected:** At most the superseded admin create step (if re-confirmed dead and
deletable), scripts/tests individually proven obsolete on their own merits, and the old admin
sidebar (only once parity is confirmed) — plus a final pass updating `docs/voucher-engine/*`
cross-references if any are now stale. This is likely a much smaller deletion set than earlier
plan revisions assumed.

**Required subagents:** `medusa-module-reviewer` as a final backend sanity pass.

**Deliverable:** Plan / Files affected / Tests / Risk / Rollback (Rollback here means: what would
restoring the deleted files look like, in case Phase 5's tests turn out to have missed something —
prefer `git revert` of the cleanup commit over manual reconstruction).

**Exit criteria:** No code proven genuinely dead remains (a much narrower bar than "no
ephemeral-Promotion code remains" — that code is intentionally kept); full test suite still green
after any deletions; historical docs are intact and clearly cross-referenced to their superseding
content; the ephemeral Promotion transport is confirmed still present and functioning (its removal
was never in scope for this phase).
