---
name: quick-reference
version: 2.0.0
priority: P2
trigger: model_decision
description: Apply when you need to know which workspace skills exist before picking one for a task.
---

# Workspace skill index

Skills live in `.agents/skills/<name>/SKILL.md`. Read the one you need, not all of them.

## Task workflows

Mirrors of the Claude Code slash commands in `.claude/commands/`, so both tools follow the same
procedure.

| Skill | Use when |
|---|---|
| `bugfix` | fixing a bug whose cause is known — root cause first, regression test required |
| `debug` | the cause is unknown — investigate and prove it, no edits |
| `feature` | building something new — plan and get approval first |
| `refactor` | restructuring without changing behaviour |
| `review-diff` | reviewing uncommitted work before commit |

## Domain knowledge

| Skill | Covers |
|---|---|
| `api-patterns` | REST shape, auth, versioning, rate limiting, error responses |
| `database-design` | schema design, indexing, migrations, query optimisation |
| `nextjs-react-expert` | storefront performance — waterfalls, bundle size, re-renders, caching |
| `nodejs-best-practices` | Node runtime patterns |
| `tailwind-patterns` | storefront styling conventions |
| `i18n-localization` | admin dashboard translations |

## Craft

| Skill | Covers |
|---|---|
| `clean-code` | naming, structure, avoiding over-engineering |
| `code-review-checklist` | what to look for when reviewing |
| `systematic-debugging` | a disciplined debugging method |
| `tdd-workflow` | red → green → refactor |
| `testing-patterns` | test structure and coverage |
| `lint-and-validate` | running the lint and type gates |
| `verify-changes` | proving a change works before claiming it does |

Project rules — stack, layout, commands, money, prohibited actions — are in `AGENTS.md`, not
here. Where a skill disagrees with `AGENTS.md`, `AGENTS.md` wins.
