# Lessons — policy (Phase 3 read / Phase 9 capture detail)

Storage: `.claude/lessons/voucher-engine/` (actual lesson files + `INDEX.md`). This file is
**policy only** — it defines when/how to read and write lessons. It does not itself contain any
lesson content, and no lesson content should ever be pasted into this file. Conversely,
`.claude/lessons/voucher-engine/INDEX.md` holds only pointers/metadata (date, path, title, tags,
related tasks/SPEC sections) — never the full lesson body — and the lesson `.md` files hold only
the full 10-field structure below, never policy prose. Keep these three layers separate.

## When lessons must be read

Read lessons **before** Phase 5 (SPEC consistency gate) and Phase 6 (implementation) — this is
Phase 3 itself, run right after Phase 2 (load implementation truth) and before Phase 4 (audit), not
as an afterthought once code is already being written.

1. Read `.claude/lessons/voucher-engine/INDEX.md` first, in full. It's short by design — a table
   of pointers, not the lessons themselves.
2. From the index, open **only** the lesson files whose tags, related task IDs, or related SPEC
   sections overlap the currently selected scope. Do not open every lesson file "just in case" —
   the index exists precisely so you don't have to.
3. If a selected task touches an area with no matching lesson, that's normal — most tasks won't
   have one. Proceed to Phase 4 (audit) without fabricating relevance.

## When a lesson should be created

Create a lesson only for **reusable knowledge**, specifically:

- a non-obvious bug (the fix wasn't where you'd expect, or the obvious diagnosis was wrong);
- verified framework (Medusa/MikroORM/Jest/Redis/etc.) behavior that contradicted a reasonable
  assumption or the SPEC's own prior assumption;
- a resolved edge case worth remembering (not just "handled it inline in the code" — something a
  future session could plausibly get wrong again);
- an architectural pattern worth reusing or avoiding;
- a SPEC-vs-runtime or SPEC-vs-API-contract conflict and how it was resolved;
- a testing, migration, concurrency, idempotency, or compensation finding that isn't already
  obvious from reading the code/tests themselves.

**Do not create a lesson for routine task completion.** Implementing a task exactly as the SPEC
already describes, with no surprises, is progress-file material, not a lesson. Ask: "if a future
session skipped reading the code and only read this lesson, would it avoid a real mistake or
rediscover real evidence?" If no, it isn't a lesson.

## When a lesson should be updated vs. corrected vs. created new

- **Update** an existing lesson when new evidence refines or extends the same finding (e.g. a
  second, related edge case under the same root cause) — add to it, don't fork a near-duplicate
  file.
- **Correct** an existing lesson when later evidence shows part of it was wrong (see "Correcting an
  outdated lesson" below) — this is not the same as creating a new lesson that quietly contradicts
  an old one.
- **Create new** only when the finding's problem/root-cause is genuinely distinct from every
  existing lesson's.

## Avoiding duplicate lessons

Before creating a new file:

1. Check `INDEX.md` for an existing entry with an overlapping topic, tags, related task IDs, or
   related SPEC sections.
2. If a plausible match exists, open that lesson file and compare its "Problem" and "Root cause"
   fields against the new finding. Same root cause → update that file (see above), don't create a
   second one.
3. If the new finding is a specific instance of a broader existing lesson (e.g. another field
   needing the same MikroORM date-normalization treatment), extend the existing lesson's
   "Applicability" and "Related task IDs" fields rather than writing a new file that would just
   restate the same root cause.
4. Only when no existing lesson shares the root cause, create a new file and add a new `INDEX.md`
   row.

## Required lesson structure

Every lesson file (`YYYY-MM-DD-<topic>.md`, e.g. `2026-07-14-cart-totals-computed-fields.md`) must
contain exactly these fields, as headed sections, in this order:

1. **Problem** — what went wrong or what question needed answering, in concrete terms.
2. **Incorrect assumption or failed approach** — what was believed or tried first, and why it
   seemed reasonable at the time. Name the specific wrong belief, not a vague "we were confused".
   If more than one wrong belief compounded the problem (a common shape when an earlier session's
   own mis-diagnosis is part of the story), name each one.
3. **Root cause** — the actual underlying reason, stated precisely enough that someone could
   recognize the same root cause in a different context.
4. **Verified evidence** — the concrete proof (file:line in installed source, an empirical test
   comparing behaviors, the literal contradicting line from an approved contract). Mark clearly
   what was verified vs. merely inferred.
5. **Resolution** — what was actually done to fix/resolve it, precisely enough to reproduce.
6. **Prevention rule** — a short, actionable rule a future session can apply _before_ hitting the
   same problem (not just a restatement of the resolution).
7. **Applicability** — where this rule applies (which files, which pattern of code, which
   condition) and, just as importantly, where it does _not_ apply if that's non-obvious.
8. **Related task IDs** — the `docs/tasks_grouped.md` task ID(s) this was found under.
9. **Related SPEC sections** — the `.claude/specs/voucher-engine/SPEC.md` section(s) this touches
   or that were updated because of it (or "none" if purely an implementation-level finding with no
   SPEC impact).
10. **Relevant production and test files** — exact repo-relative paths.

Every field must be filled in substantively for every lesson, including lessons that describe a
process/architectural pattern rather than a bug — e.g. for a process lesson, "incorrect assumption
or failed approach" becomes the process failure mode being guarded against (such as "silently
editing code to match a stale SPEC, or silently editing the SPEC to match existing code, without
recording why"), and "root cause" becomes the structural reason that failure mode recurs absent a
gate. A lesson with fields marked "N/A" to save effort does not meet this structure — if a field
genuinely doesn't apply, say why in one line rather than leaving it empty.

Do not restate procedure that already lives in another reference file (e.g. the exact
advisor-invocation steps in `references/spec-sync.md`). A lesson's job is the motivating evidence
and the prevention rule; point to the procedural reference for the "how".

## Correcting an outdated lesson

Lessons are **reference docs**, not an append-only log — unlike the progress file, a lesson should
always read correct at a glance, not require a reader to reconcile a contradiction between an
original section and a later correction appended below it.

When later evidence shows a lesson was wrong or incomplete:

1. **Edit the actionable fields in place** — update "Root cause", "Resolution", "Prevention rule",
   and "Applicability" to reflect the corrected understanding directly, so the top-to-bottom read
   is never self-contradictory.
2. **Keep a dated "Revision history" footer** at the bottom of the file recording what changed and
   why (one line per revision: date, what was wrong, what it's now). This preserves the audit
   trail without forcing a reader to wade through superseded reasoning to find the current truth.
3. **Update `INDEX.md`'s entry** for that lesson (the one-line description and any changed tags),
   and record the correction action in the progress file per `references/progress-format.md`
   (lesson action: `Corrected`).
4. If a whole prior lesson turns out to rest on a mis-diagnosis discovered by a later session (this
   has happened before in this module's own progress history — see the cart-totals lesson's
   revision history for a real example), correct that lesson using the **latest** verified
   conclusion, not the first one written. Never let a new lesson silently contradict an existing
   one; always correct the existing one instead of leaving two lessons disagreeing.

## Lessons never override the SPEC or the approved API contract

A lesson is operational/process knowledge about implementing correctly within the approved
`.claude/specs/voucher-engine/SPEC.md` and `docs/API_CONTRACT_Suggestive_Voucher_Cart.md` — it
never overrides either. If a lesson's guidance and the current SPEC/contract disagree:

- The SPEC/contract wins. Correct the lesson (per the process above) to match, or to explicitly
  defer to the SPEC section that now governs.
- If the disagreement arose because verified runtime behavior or the approved contract requires a
  SPEC change that hasn't happened yet, that is a Phase 5 SPEC-consistency-gate situation — route
  it through the `voucher-spec-advisor` hand-off (`references/spec-sync.md`), not a lesson edit. A
  lesson records that this kind of gap can happen and why the gate exists (see
  `2026-07-14-spec-advisor-handoff-pattern.md` in the lessons directory for the standing example);
  it does not substitute for actually updating the SPEC when a new gap is found.
