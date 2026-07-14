# Progress file format — "Update progress" phase detail (§Phase 10 of SKILL.md's eleven-phase list)

Target file: `.claude/progress/voucher-engine-progress.md` (never `voucher_engine_progress.md` or
any other underscore variant).

**Preserve all historical entries.** This phase only appends a new dated section and refreshes the
current-summary block at the very top of the file — it never deletes or rewrites a prior dated
entry, even one a later session found partially wrong. If a later session corrects an earlier
claim, say so explicitly in the new entry (as prior sessions in this file already do) rather than
editing the old text.

## 1. Current-summary block (top of file, refreshed every session)

Keep this as the first thing in the file, before any dated entry. Refresh it completely each time
this skill runs — it must always reflect the latest state, not accumulate stale sub-bullets from
old sessions. Include:

- Latest authoritative verification date.
- Current Day statuses (which days are Done / Partially Done / Not Started, per member if the
  work is member-scoped).
- Current production workflow entry points (name the actual top-level workflow file(s) that exist
  right now, e.g. `resolveVoucherDiscountWorkflow` — keep this in sync as new workflows land).
- Unit-test result (pass count / total, suite count).
- Module-integration result.
- Full-app/HTTP integration result.
- Typecheck result.
- Lint result.
- Build result.
- Migration result.
- Unresolved blockers (short list, or "none").
- Next allowed scope (what the next session is cleared to work on, per `docs/tasks_grouped.md`).

Immediately after this block, include verbatim:

> Older entries are historical snapshots and may contain findings corrected by later sessions. The
> latest authoritative summary and latest dated verification section are the current source of
> truth.

## 2. Dated entry (appended, one per session)

Header: `## YYYY-MM-DD — <short description of the session's scope>` (use the real current date;
if a second session happens the same day, suffix `(session 2)` etc., matching this file's existing
convention).

For **every selected task** in the session's scope, include:

- Member.
- Day.
- Task ID.
- Final status (`Done` / `Partially Done` / `Blocked` / `Not Started`).
- Mapped SPEC section(s).
- Previous state (what the audit phase found before this session's work — SKILL.md phase 4,
  `references/workflow.md` §Phase 3).
- Implementation completed (what actually changed, in plain terms).
- Exact files created (full repo-relative paths).
- Exact files modified (full repo-relative paths).
- Important symbols (function/class/type names introduced or changed).
- Migrations (generated migration file name(s), or "none").
- Integration wiring (what now calls this — a workflow, route, subscriber; or "not yet wired" if
  still partial).
- Tests added (file + what they assert).
- Commands executed (the literal `pnpm`/`npx` commands run this session).
- Actual results (real pass/fail counts and messages — never a paraphrase like "tests pass" without
  the number).
- Conflict and SPEC-update history (any Phase 5 advisor invocation for this task: what was flagged,
  what the advisor decided, which SPEC sections it touched).
- Blockers and remaining work (what's left, if anything, and why).

After the per-task detail, include a session-level wrap-up mirroring this file's existing style:

- Session verification summary (all commands run this session and their results, even ones that
  don't map to a single task — e.g. a full-suite re-run).
- Conflicts/deviations recorded this session (anything surfaced but not resolved, with reasoning).
- **Lessons captured this session** — see §3 below. Omit this bullet entirely if Phase 9 produced
  no lesson action this session; do not write "none" as a placeholder.
- Files created / modified this session (a flat list, useful for a reviewer skimming the diff).
- Confirmation of what was explicitly out of scope and not touched.

## 3. Lesson records (part of the session-level wrap-up)

Whenever Phase 9 (Capture lessons) creates, updates, or corrects a lesson this session, record it
here — one entry per lesson touched, with **exactly** these five fields and nothing more:

- **Lesson action:** `Created` / `Updated` / `Corrected`.
- **Lesson path:** the exact repo-relative path, e.g.
  `.claude/lessons/voucher-engine/2026-07-14-cart-totals-computed-fields.md`.
- **Title:** the lesson's own title (its `#` heading), so a reader doesn't have to open the file to
  know what it's about.
- **Related tasks:** the task ID(s) this session's work surfaced the lesson under.
- **One-sentence finding:** a single sentence capturing the reusable takeaway — not the full
  problem/root-cause/resolution write-up.

**Do not paste the lesson's full content into the progress file.** The lesson file itself
(`.claude/lessons/voucher-engine/<file>.md`) is the source of truth for the detailed problem,
incorrect assumption, root cause, evidence, resolution, prevention rule, applicability, and related
SPEC sections/files — the progress file only records that the action happened and points to it.
This keeps the progress file from re-accumulating the same long-form analysis a lesson file already
owns, and keeps a single place (the lesson file) to correct if the finding is later refined.

Example (format only — not a real entry):

```
- Lesson action: Created
  Lesson path: .claude/lessons/voucher-engine/2026-07-14-example-topic.md
  Title: Example lesson title
  Related tasks: 3.4.2
  One-sentence finding: One sentence stating the reusable takeaway.
```

## Tone and honesty

Match this file's existing style: report real numbers, name real root causes when a bug is found
(not just "fixed a bug"), and flag anything uncertain (a framework behavior not fully verified, a
flaky test not fully root-caused) rather than smoothing it over. A completed task with an honestly
documented caveat is more useful to the next session than an over-claimed "Done".
