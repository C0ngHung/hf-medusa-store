# Workflow — Phases 1–5

## Phase 1 — Resolve requested scope

1. Read `docs/tasks_grouped.md` in full (it is organized by member → day → task rows with
   `[x]`/`[ ]`/`[~]` checkboxes and a `> Deliverable:` line per day).
2. Identify exactly what was requested:
   - **Day** (e.g. "Day 4") → every row under that `## Ngày N` heading for the named member, or
     for all members if none is named.
   - **Member** (e.g. "Thức's Day 5 tasks") → every row under that member's `# 👤 <Name>` section
     for the named day(s).
   - **Task-ID range** (e.g. "3.4.1–3.4.10") → every row whose bolded id falls in that range,
     regardless of which day/member heading it sits under.
   - A **mix** of the above is valid — resolve the union, not just the first match.
3. For each selected row, capture: task id, one-line Vietnamese description, current checkbox
   state, and the day's `> Deliverable:` line (context for what "done" means).
4. Cross-reference each task id against the SPEC's own traceability tables (SPEC §17, §17.1,
   §22.1) and its Implementation Order (SPEC §20) to surface dependencies — e.g. an apply-voucher
   task depends on the validation pipeline and the discount calculator existing first. If a
   prerequisite task is out of the requested scope but not yet implemented, note it as a blocker
   for the requested task rather than silently implementing it too.
5. **Do not implement anything outside this resolved set.** If mid-session you notice unrelated
   unfinished work, record it as an observation in the completion report — do not act on it.
6. Create an internal task checklist (via the harness's task-tracking tool if available, or a
   simple in-context list) — one entry per selected task id — before moving to Phase 2.

## Phase 2 — Load implementation truth

Read, in this order:

1. `.claude/specs/voucher-engine/SPEC.md` in full — it is long (20+ sections); do not skim only
   the section that seems relevant, because Decisions/Conflicts recorded elsewhere (§18, §19)
   frequently qualify what a numbered section says. Pay particular attention to:
   - Any `## Approved Decisions` block near the top — these override earlier illustrative tables
     wherever they conflict, and are not optional reading.
   - §18 (Conflicts) and §19 (Pending Decisions) — anything still listed as open/pending there is
     a live blocker candidate for Phase 4, not settled fact.
2. `docs/API_CONTRACT_Suggestive_Voucher_Cart.md` and any other approved API contract referenced
   by the SPEC for the task's area (error codes, route shapes, response envelopes).
3. Relevant solution/design docs under `docs/voucher-engine/` (solution flow, diagrams) if the
   task touches an area they cover.
4. `CLAUDE.md` and the applicable `.claude/rules/*.md` files (`coding.md`, `testing.md`,
   `security.md`, `medusa.md`, `project-conventions.md`) for repo-wide constraints (integer money,
   Link Module vs FKs, module shape, test naming).
5. The **latest authoritative section** of `.claude/progress/voucher-engine-progress.md` — read
   the current-summary block at the top first, then the most recent dated entry. Earlier dated
   entries are historical snapshots and may contain findings a later session corrected; don't
   treat an early entry as current without checking whether a later one superseded it.
6. The actual source code and tests for the area — models, services, workflows, steps, API
   routes, validators, migrations, `__tests__/` and `integration-tests/` files. Read the real
   files; do not infer their contents from the SPEC's planning-stage file-layout listing (§4 of
   the SPEC is a plan, not a live directory listing — actual paths may differ, e.g. code may live
   under `src/workflows/voucher-engine/` rather than the SPEC's originally-planned
   `src/workflows/voucher/`).

Build an explicit traceability table before writing anything:

```
task ID → SPEC section(s) → expected files/symbols → current evidence (file:line, test name/result) → required tests
```

This table is what this file's own Phase 3 (audit classification, below) and SKILL.md's outer
Phase 10 (update progress) are built from — do not skip building it even for small scopes.

## Phase 3 — Audit before coding

For every selected task, classify as one of:

- **Done** — implementation exists, matches the SPEC, is wired into the real runtime path (not
  just typechecked), and has passing tests that actually exercise it (not a mocked stand-in for a
  persistence/integration requirement).
- **Partially Done** — some of the above is missing; say exactly what (e.g. "pure logic done and
  unit-tested, but never called from any workflow").
- **Blocked** — a genuine unresolved SPEC/code mismatch or missing prerequisite prevents safe
  implementation; do not force it (see Phase 4).
- **Not Started** — no evidence of any of the above.

Never accept these as sufficient evidence of "Done" on their own:

- The task's checkbox in `docs/tasks_grouped.md` is `[x]`.
- A prior progress-file entry claims it's done.
- The code compiles / typechecks.
- The file exists.
- A commit message says so.

While auditing, actively look for and record:

- Missing wiring (a step or function that exists but nothing calls it).
- Duplicate logic (two implementations of the same calculation/validation living side by side).
- Stale comments (a header comment claiming a limitation that a later change already fixed, or
  vice versa).
- Wrong framework assumptions (a comment or code path relying on an unverified Medusa API shape
  that later code proved wrong).
- Missing migrations for model changes that were made.
- Disconnected workflow steps (built, typechecked, never composed into a workflow).
- Tests that only pass in isolation (batch-run flakiness, shared state, ordering dependencies).
- Implementation that uses test-supplied data instead of the authoritative persisted/server-side
  source (a correctness/security smell, not just a style nit).

Do not reimplement anything already correctly Done.

## Phase 4 — SPEC consistency gate

Before modifying any production code for a task, compare:

1. The task's requirement (from `docs/tasks_grouped.md` + the day's deliverable line).
2. The approved SPEC section(s) (including any `Approved Decisions` block).
3. The approved API contract, where applicable.
4. Actual Medusa runtime behavior (verified against installed `@medusajs/*` source or MedusaDocs,
   not assumed).
5. The current implementation.

Then:

- **If the code simply violates an approved SPEC** (no framework constraint, no security/data-
  integrity reason, no already-approved architecture decision justifies the divergence) — fix the
  code to follow the SPEC. This is the common case and does not need the advisor.
- **If the implementation must differ from the SPEC** because of verified framework behavior, an
  approved contract, a security/data-integrity requirement, or an explicit new architecture
  decision that isn't in the SPEC yet — **stop implementing the affected task** and follow the
  hand-off protocol in `references/spec-sync.md` (invoke `voucher-spec-advisor`, wait for its
  SPEC update, re-read the updated SPEC, then resume).
- **If the mismatch cannot be safely resolved either way** (e.g. the advisor could not verify the
  framework behavior, or resolving it requires a business decision beyond this skill's authority)
  — mark the task `Blocked`, record why, and stop that task. Do not invent a decision to unblock
  yourself.

Never silently let production code and the SPEC disagree — one of the three outcomes above must
be reached and recorded for every task before Phase 5 implementation begins on it.

## Phase 5 — Implement one coherent slice

For each task or tightly-coupled group of tasks (implement together only when they share a single
runtime path — e.g. a workflow and the step it calls):

1. Identify exactly which files to create or modify (cite them, don't guess later).
2. Implement strictly against the (possibly just-updated) SPEC.
3. Reuse existing services, models, workflows, DTOs, constants, error catalogues, and calculation
   paths — grep for an existing equivalent before writing a new one. Do not create a second
   parallel implementation of something that already exists (this is the single most common defect
   class recorded in this module's own progress history).
4. Wire the implementation into the actual runtime path — a step that nothing calls, or a workflow
   with no route/subscriber invoking it, is not complete.
5. Use only authoritative server-side data (cart from `query.graph`/module service, never a
   client-supplied total/discount/eligibility field — see `.claude/rules/security.md`).
6. Preserve Medusa module boundaries (Link Module for cross-module refs per repo convention,
   except where an approved SPEC decision explicitly says otherwise — e.g. Decision B's JSON-array
   voucher scope).
7. Add migrations whenever a model changes (`db:generate`, never hand-write).
8. Add compensation, idempotency, concurrency, and error handling exactly where the SPEC requires
   them for that task — do not add speculative handling the SPEC doesn't call for, and do not skip
   handling it does call for.
9. Do not move on to the next slice until the current slice has applicable tests (SKILL.md's outer
   Phase 7 — "Tests are part of completion").
