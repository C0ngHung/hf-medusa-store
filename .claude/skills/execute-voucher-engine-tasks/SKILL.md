---
name: execute-voucher-engine-tasks
description: Executes a requested slice of VoucherEngine work (a day, a member's rows, or a task-ID range) from docs/tasks_grouped.md against .claude/specs/voucher-engine/SPEC.md as the implementation source of truth, reading relevant lessons before coding, auditing before coding, resolving SPEC/code mismatches via the voucher-spec-advisor subagent, implementing with tests, verifying, capturing reusable lessons, and updating .claude/progress/voucher-engine-progress.md. Use when the user says something like "Use execute-voucher-engine-tasks for VoucherEngine Day 4" or "Use execute-voucher-engine-tasks for tasks 3.4.1-3.4.10".
---

# Execute VoucherEngine Tasks

Reusable, day-agnostic execution skill for the VoucherEngine module. It does not hardcode any
day — it takes whatever scope the user names (a day, a member, a task-ID range, or a mix) and
runs the same process every time:

`Read tasks → Read SPEC → Read relevant lessons → Audit → SPEC consistency gate → Implement →
Test → Verify → Capture lessons → Update progress → Report`

**Exact paths (always use these, never underscore variants):**

- Task source: `docs/tasks_grouped.md`
- Technical implementation source of truth: `.claude/specs/voucher-engine/SPEC.md`
- Implementation history: `.claude/progress/voucher-engine-progress.md`
- Advisor subagent: `.claude/agents/voucher-spec-advisor.md`
- Lessons index: `.claude/lessons/voucher-engine/INDEX.md`
- Lessons storage: `.claude/lessons/voucher-engine/` (individual `YYYY-MM-DD-<topic>.md` files)

Never create `voucher_engine` / `voucher_engine_progress.md` or any other underscore-based
alternative — the hyphenated paths above are the only ones this skill reads or writes.

## Invocation examples

- `Use execute-voucher-engine-tasks for VoucherEngine Day 4.`
- `Use execute-voucher-engine-tasks for tasks 3.4.1–3.4.10.`
- `Use execute-voucher-engine-tasks for Thức's Day 5 tasks.`

Any of these (day, member, task-ID range, or a combination) is a valid scope. Do not assume Day 4
if the user names a different day or range.

## Eleven-phase process (run in order, every invocation)

`Read tasks → Read SPEC → Read relevant lessons → Audit → SPEC consistency gate → Implement →
Test → Verify → Capture lessons → Update progress → Report`

1. **Resolve requested scope (read tasks)** — read `docs/tasks_grouped.md`, extract only the
   requested module/day/member/task-IDs + their dependencies and deliverables, build a checklist.
   Full detail: `references/workflow.md` §Phase 1.
2. **Load implementation truth (read SPEC)** — read the SPEC, relevant API contracts and design
   docs, project rules/CLAUDE.md, the latest authoritative section of the progress file, and the
   actual source code/tests. Build a `task ID → SPEC section → expected files/symbols → current
evidence → required tests` traceability map. Full detail: `references/workflow.md` §Phase 2.
3. **Read relevant lessons** — read `.claude/lessons/voucher-engine/INDEX.md` in full, then open
   only the lesson files whose tags/related task IDs/related SPEC sections overlap the selected
   scope. Do this before the audit and before touching any code — a relevant lesson can change how
   you read the evidence in Phase 4/5 (e.g. it can tell you a field you're about to trust via
   `query.graph` is actually a Medusa `.computed()` field that reads back `0`). Full detail:
   `references/lessons.md`.
4. **Audit before coding** — classify every selected task as `Done` / `Partially Done` /
   `Blocked` / `Not Started` from real evidence (code + passing tests), never from checkboxes or
   prior progress-file claims alone. Full detail: `references/workflow.md` §Phase 3.
5. **SPEC consistency gate** — before touching production code, compare task requirement vs
   approved SPEC vs API contract vs actual runtime behavior vs current implementation. If code
   simply violates an approved SPEC, fix the code. If the SPEC itself must change (verified
   framework behavior, an approved contract, security/data-integrity, or an explicit new
   architecture decision), **stop and hand off to the `voucher-spec-advisor` subagent** — see
   `references/spec-sync.md` for the exact handoff protocol and how control returns to this
   session. Never let code and SPEC silently disagree; if the mismatch isn't safely resolvable,
   mark the task `Blocked` and stop that task.
6. **Implement one coherent slice** — per task or tightly-coupled group: identify files, implement
   against the (possibly just-updated) SPEC, reuse existing services/workflows/DTOs/errors/calc
   paths, wire into the real runtime path, use only server-side authoritative data, preserve
   module boundaries, add migrations/compensation/idempotency/concurrency handling the SPEC
   requires. Do not move to the next slice without tests for the current one. Full detail:
   `references/workflow.md` §Phase 5.
7. **Tests are part of completion** — a task is `Done` only with implementation + tests (created
   or updated) + all new/affected tests passing + typecheck passing + real runtime wiring. See
   `references/testing.md` for what counts as sufficient evidence and what does not (mocked-only
   tests for persistence requirements, isolated-only passes, never-called workflow steps, etc.).
8. **Verification** — run the full relevant test surface (unit, module-integration, HTTP
   integration, typecheck, lint, build, migrations, seed) through the repo's `pnpm` scripts, not
   raw `jest`. Do not hide skips/retries/flakes/warnings. Full detail: `references/testing.md`.
9. **Capture lessons** — if this slice produced reusable knowledge (a non-obvious bug, verified
   framework behavior, a resolved edge case, an architectural pattern, a SPEC/runtime/API-contract
   conflict, or a testing/migration/concurrency/idempotency/compensation finding), create or update
   a lesson file under `.claude/lessons/voucher-engine/`, then update
   `.claude/lessons/voucher-engine/INDEX.md` to point to it. Do not create a lesson for routine task
   completion. Full detail: `references/lessons.md`.
10. **Update progress** — append a new dated section to the progress file covering every selected
    task (status, SPEC section, files, migrations, tests, commands, results, conflicts, blockers,
    and any lesson created/updated/corrected this session), and refresh the current-summary block
    at the top. Exact structure: `references/progress-format.md`.
11. **Completion report** — return a concise report: requested tasks, final status per task, what
    was implemented, SPEC changes made, advisor invocations/decisions, lessons created/updated/
    corrected, files created/modified, migrations, test/typecheck/lint/build results,
    progress-update confirmation, blockers, and an explicit confirmation that no out-of-scope task
    was implemented.

## Non-negotiable rules

- Never implement anything outside the requested scope, even if you notice other unfinished work.
- Never trust task checkboxes, progress-file claims, "compiles", or "the file exists" as evidence
  of correctness — verify against actual code and, where applicable, real test runs.
- Never let production code and `.claude/specs/voucher-engine/SPEC.md` silently diverge — either
  fix the code to match the SPEC, or update the SPEC via the advisor handoff (never both changed
  ad hoc in the same breath without recording why).
- Never weaken security, validation, data integrity, concurrency, idempotency, compensation, or
  testing requirements to make an implementation shortcut fit.
- Never create a lesson for routine task completion — only for reusable knowledge (see
  `references/lessons.md` for the exact bar).
- Never let a lesson override or contradict the approved SPEC or API contract — a lesson records
  how to work correctly within them; if one is later found to disagree, correct the lesson, and if
  the disagreement stems from a genuine SPEC gap, route it through the advisor hand-off instead.
- Never commit or push unless the user explicitly asks.
- Preserve all historical entries in the progress file — append, don't rewrite history.

## Reference files

- `references/workflow.md` — its own internal Phases 1–5 in full detail (scope resolution,
  traceability building, audit classification, the SPEC gate, implementation discipline), which
  map onto this skill's outer steps 1, 2, 4, 5, and 6 respectively.
- `references/lessons.md` — Phases 3 and 9 in full detail: when to read lessons, when to create vs.
  update vs. correct one, how to avoid duplicates, the required 10-field lesson structure, how to
  correct an outdated lesson, and why lessons never override the SPEC/API contract.
- `references/spec-sync.md` — the exact advisor hand-off protocol (Phase 5), including how to
  invoke `voucher-spec-advisor` via the Agent tool, what it must return, and how this session
  resumes against the updated SPEC.
- `references/testing.md` — Phases 7–8: test types/naming, what counts as sufficient evidence,
  what does not, and the exact `pnpm` scripts to run (never raw `jest`).
- `references/progress-format.md` — Phase 10: the exact structure for the current-summary block,
  each dated entry, and each lesson record, in `.claude/progress/voucher-engine-progress.md`.


## Member ownership boundary

When the invocation specifies a member:

1. Read `docs/tasks_grouped.md`.
2. Select only tasks assigned to that member.
3. Do not implement or mark Done tasks owned by another member.
4. Shared files may be modified only when strictly required by the selected
   member's task.
5. Missing work owned by another member must be recorded as a dependency or
   blocker, not silently absorbed into the current scope.
6. Progress and completion reports must separate:
   - selected-member implementation;
   - shared integration changes;
   - external dependencies.