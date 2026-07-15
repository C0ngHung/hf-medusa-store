# Verified runtime behavior or an approved API contract can diverge from the SPEC — route the fix through the Opus `voucher-spec-advisor`, not an inline edit

## Problem

Multiple times in this module's history, an implementer discovered that the approved
`.claude/specs/voucher-engine/SPEC.md` disagreed with either (a) verified Medusa runtime behavior,
or (b) the separately-approved `docs/API_CONTRACT_Suggestive_Voucher_Cart.md`. Left unmanaged,
this creates a recurring failure mode: whoever hits the mismatch either quietly patches the code to
paper over it (leaving the SPEC wrong for the next reader) or quietly edits the SPEC inline to
match whatever the code happened to do (losing the reasoning and evidence for why it changed, and
risking rationalizing an actual defect as "the new spec").

## Incorrect assumption or failed approach

The failure mode this lesson guards against is **not a single wrong belief** but two opposite bad
habits that both look like reasonable shortcuts under time pressure:

1. **"The code is probably fine, I'll just update the SPEC to match it"** — done inline, by the
   same session that's also under pressure to keep implementing, with no independent check of
   whether the code is actually correct or whether the "obvious" resolution would quietly weaken a
   security/data-integrity/idempotency guarantee to make the mismatch disappear.
2. **"The SPEC is probably fine, I'll just make the code match it"** — applied even when the SPEC's
   assumption was never actually verified against live runtime behavior (see the companion lesson
   `2026-07-14-cart-totals-computed-fields.md`, where the SPEC's own verification notes asserted a
   framework behavior that had never been run against a live cart).

Both habits are individually plausible and both have produced real, documented mismatches in this
module — which is exactly why neither should be resolved by unaided inline judgment in the same
breath as ongoing implementation work.

## Root cause

The SPEC is a planning artifact that gets written (and re-verified) in passes, against a framework
whose exact behavior is sometimes only confirmable by reading installed source or running a live
check — and against externally-approved contracts that may be revised on their own schedule. Absent
an explicit, separately-invoked gate, there is nothing structurally stopping SPEC and code from
drifting apart in either direction, because the same context that's motivated to finish the current
task is the one deciding whether to "just" change the SPEC or "just" change the code.

## Verified evidence

- **Decisions A–D** (recorded in `.claude/specs/voucher-engine/SPEC.md`'s `Approved Decisions`
  block): four concrete, evidence-backed cases where an earlier SPEC pass's assumption (an
  illustrative error-code table, a proposed `VoucherScope`+Link-Module design, an unlisted
  `promotion_id` field, an under-specified `VoucherUsageLog` schema) needed to be formally
  reconciled against either the approved API contract or the already-shipped, already-integration-
  tested implementation — each with its own recorded evidence trail rather than a one-line inline
  fix.
- **The cart-totals computed-field case** (`2026-07-14-cart-totals-computed-fields.md`): the SPEC's
  own verification notes asserted a Medusa runtime behavior ("`query.graph` on `"cart"` returns
  computed totals") that a later empirical check disproved. This is the sharpest evidence that
  "the SPEC already says so" is not suffient grounds to skip verifying against live behavior before
  either changing code or changing the SPEC.

## Resolution

The `execute-voucher-engine-tasks` skill's Phase 4 (SPEC consistency gate) resolves this
structurally: when a task cannot be implemented as the SPEC currently describes, and the reason is
verified framework behavior, an approved contract, a security/data-integrity requirement, or a new
architecture decision (not just "the code is wrong," which gets fixed directly) — implementation of
that task stops, and the `voucher-spec-advisor` subagent (`.claude/agents/voucher-spec-advisor.md`,
pinned to `model: opus`) is invoked to investigate independently and update
`.claude/specs/voucher-engine/SPEC.md` (and only the SPEC/decision docs — never production code).
The main session then re-reads the updated SPEC and resumes. See
`.claude/skills/execute-voucher-engine-tasks/references/spec-sync.md` for the exact step-by-step
hand-off procedure — this lesson exists to record _why_ the gate exists and that it has already
paid for itself, not to restate the _how_.

## Prevention rule

Never resolve a SPEC-vs-code/runtime/contract mismatch by silently editing whichever side is more
convenient in the moment. If the code simply violates an already-correct, already-approved SPEC,
fix the code (no advisor needed). If the SPEC itself might need to change, stop and route it
through the advisor hand-off (`references/spec-sync.md`) so the decision gets independent,
evidence-first judgment and a recorded trail — even when the "obvious" answer seems clear, because
this module's own history shows the "obvious" answer has been wrong in both directions.

## Applicability

Applies whenever a task's expected behavior (per the SPEC) contradicts either verified Medusa
runtime behavior, the approved API contract, or a security/data-integrity/concurrency/idempotency
guarantee the SPEC itself requires elsewhere. Does not apply to routine "code doesn't yet match an
already-correct SPEC section" gaps (most Day 4+ work) — those are ordinary implementation, not a
gate trigger.

## Related task IDs

Not scoped to a specific task — this is a cross-cutting process pattern established during the
SPEC-decision-resolution session (2026-07-14) and expected to recur across Day 4–7 work.

## Related SPEC sections

The `Approved Decisions (2026-07-14)` block and every section it touches (§5.1, §5.4, §6, §7,
§8, §9.1, §10.7, §11.6–§11.10, §16.2, §18, §19, §20, §22) — all four decisions are worked examples
of this pattern, not separate lessons in their own right.

## Relevant production and test files

None directly — this is a process lesson about the SPEC-maintenance workflow itself, not a code
fix. The relevant artifacts are `.claude/specs/voucher-engine/SPEC.md`,
`.claude/agents/voucher-spec-advisor.md`, and
`.claude/skills/execute-voucher-engine-tasks/references/spec-sync.md`.

## Revision history

- 2026-07-14: initial lesson captured after the SPEC-decision-resolution session, generalizing
  from Decisions A–D and the cart-totals computed-field finding.
