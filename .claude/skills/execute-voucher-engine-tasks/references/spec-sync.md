# SPEC Sync — the advisor hand-off protocol (Phase 5 detail)

This is the exact procedure for the "implementation must differ from the SPEC" branch of Phase 5
(SPEC consistency gate — SKILL.md's eleven-phase numbering).
Follow it precisely — the point of routing through a separate Opus-backed subagent is that SPEC
changes get independent, framework-verified judgment instead of being rationalized inline by the
same session that's under pressure to keep implementing.

## When to trigger this protocol

Trigger it only when **all** of these hold:

1. The task cannot be implemented as the SPEC currently describes it.
2. The reason is one of: verified Medusa framework behavior that contradicts the SPEC's
   assumption, an approved external contract (e.g. `docs/API_CONTRACT_Suggestive_Voucher_Cart.md`)
   that the SPEC hasn't caught up to, a security/data-integrity requirement the SPEC's current
   wording would violate, or an explicit new architecture decision that needs to be recorded before
   code can follow it.
3. The change is not simply "the code is wrong" — if the code is wrong and the SPEC is right, fix
   the code directly; do not invoke the advisor for that.

Do not trigger it for: a task the SPEC already covers and current code violates (fix the code); a
task marked `Blocked` for reasons outside this skill's authority (mark it `Blocked` and stop, no
advisor needed — the advisor updates the SPEC, it doesn't make business calls the SPEC itself
defers, like PD-06's segment source).

## Step-by-step hand-off

1. **Stop implementation** of the affected task immediately — do not keep coding against the old
   SPEC while waiting, and do not code against your own guess of what the new SPEC should say.
2. **Invoke the `voucher-spec-advisor` subagent** via the Agent tool:
   - `subagent_type: "voucher-spec-advisor"`
   - `model: "opus"` — always pass this explicitly; do not rely on the agent definition's default
     in case it's overridden at call time. (The agent definition itself is also pinned to Opus —
     see `.claude/agents/voucher-spec-advisor.md`.)
   - The prompt must be self-contained (the advisor does not see this session's transcript):
     state the task id and its one-line requirement, quote the exact SPEC section(s) that appear
     to conflict, state the concrete evidence for the conflict (a file:line from installed
     `@medusajs/*` source, the exact contradicting line from an approved contract, the specific
     security/integrity concern, or the new decision being proposed and why), and ask it to
     investigate, decide, and update the SPEC.
   - Prefer `run_in_background: false` for this call in almost all cases — Phase 6 (Implement)
     cannot proceed on the affected task until the advisor returns, so there's rarely a reason to
     let it run asynchronously while you do something else with the same task.
3. **Wait for the advisor's structured handoff.** It must return (see
   `.claude/agents/voucher-spec-advisor.md` for the required output shape):
   - the original SPEC statement,
   - the verified evidence,
   - the decision,
   - which SPEC sections it updated,
   - migration impact,
   - API impact,
   - test impact,
   - any unresolved questions.
4. **Re-read the updated `.claude/specs/voucher-engine/SPEC.md`** — specifically the sections the
   advisor reports changing, plus any `Approved Decisions` block if it added one. Do not assume
   the advisor's summary is a complete substitute for reading the actual updated section — the
   summary is a pointer, the file is the truth.
5. **Continue implementation only against the updated SPEC.** If the advisor left unresolved
   questions that block the task, mark it `Blocked` with those questions recorded rather than
   proceeding on an assumption.
6. **Record the round-trip in the progress-file entry** for this task (see
   `references/progress-format.md` — every entry has a "conflict and SPEC-update history" field):
   what was flagged, that the advisor was invoked, what it decided, and the resulting SPEC
   section(s).

## What the advisor is not for

- It does not implement production feature code — if it starts describing application code beyond
  what's needed to justify the SPEC change, that's out of its scope; only trust its SPEC/decision-
  document edits.
- It does not weaken security, validation, data integrity, concurrency, idempotency, compensation,
  or testing requirements to make an existing implementation shortcut look justified. If a
  proposed resolution would do that, treat it as unresolved and mark the task `Blocked` instead of
  accepting the weakened SPEC.
- It is not a substitute for this skill's own Phase 4 audit — invoke it only for a genuine SPEC-vs-
  reality mismatch, not as a general-purpose "check my work" call.

## Returning control to Sonnet

The advisor's job ends when it has updated the SPEC and returned its structured report — it does
not resume implementation itself. This main (Sonnet) session is what re-reads the SPEC and
continues into Phase 6 (Implement). If the advisor's report is ambiguous about which sections
changed, re-read the whole SPEC's table of contents and diff mentally against what you read in
Phase 2 rather than guessing which part moved.
