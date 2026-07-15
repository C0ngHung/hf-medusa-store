# `.claude/lessons/`

This directory stores **reusable, verified knowledge** captured while executing work in this
repository — the kind of finding that would otherwise get re-discovered (or re-broken) by a later
session: non-obvious bugs, verified framework behavior, resolved edge cases, architectural
patterns, SPEC/runtime/API-contract conflicts, and testing/migration/concurrency/idempotency/
compensation findings.

This file is orientation only. It does not define policy for any specific module — module-level
rules for _when_ to read/write lessons, _how_ to avoid duplicates, the _required lesson
structure_, and _how to correct_ an outdated one live in that module's own execution skill, e.g.
`.claude/skills/execute-voucher-engine-tasks/references/lessons.md` for VoucherEngine. Read the
relevant skill's `references/lessons.md` before creating or editing anything under this directory
— don't infer policy from this file or from other modules' lesson files.

## Layout

```
.claude/lessons/
  README.md                  # this file — orientation only, no policy
  <module>/
    INDEX.md                 # pointers + metadata only (date, path, title, tags, related tasks/SPEC
                              # sections) — not the lesson content itself
    YYYY-MM-DD-<topic>.md     # one file per lesson, full required structure (see the owning
                              # skill's references/lessons.md for the exact fields)
```

Each module that adopts this system owns its own `<module>/` folder and its own `INDEX.md`. There
is currently one such module: `voucher-engine` (`.claude/lessons/voucher-engine/`), governed by
`.claude/skills/execute-voucher-engine-tasks/references/lessons.md`.

## What does not belong here

- Routine task-completion notes — those belong in the module's own progress file (e.g.
  `.claude/progress/voucher-engine-progress.md`), not a lesson.
- Anything that overrides an approved spec or API contract. A lesson is operational/process
  knowledge about how to work correctly _within_ the approved spec/contract — it never supersedes
  either. If a lesson and the spec disagree, the spec wins and the lesson gets corrected.
