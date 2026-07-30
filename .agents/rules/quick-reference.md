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

These five files are the **single source** for those procedures. The Claude Code slash commands in
`.claude/commands/` are thin wrappers that `@`-import them, so both tools follow the same text.
Edit the skill here, not the wrapper.

| Skill         | Use when                                                                       |
| ------------- | ------------------------------------------------------------------------------ |
| `bugfix`      | fixing a bug whose cause is known — root cause first, regression test required |
| `debug`       | the cause is unknown — investigate and prove it, no edits                      |
| `feature`     | building something new — plan and get approval first                           |
| `refactor`    | restructuring without changing behaviour                                       |
| `review-diff` | reviewing uncommitted work before commit                                       |

## Domain knowledge

Background reading only. Every one of these is generic material carried over from AG Kit, so the
stack choices they discuss are **already decided** in this repo. Where one disagrees with
`AGENTS.md`, `apps/*/AGENTS.md`, or `docs/API_CONTRACT_Suggestive_Voucher_Cart.md`, those win.

| Skill                   | Covers                                    | Already decided here                                                                 |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `api-patterns`          | REST shape, auth, pagination, errors      | Medusa REST routes; contract fixed in `docs/API_CONTRACT_Suggestive_Voucher_Cart.md` |
| `database-design`       | schema design, indexing, query tuning     | Mikro-ORM via Medusa; no cross-module foreign keys                                   |
| `nextjs-react-expert`   | storefront waterfalls, bundle size, cache | Next.js 15 + React 19                                                                |
| `nodejs-best-practices` | Node runtime and async patterns           | Medusa 2.16 is the framework                                                         |
| `i18n-localization`     | admin dashboard translations              | `react-i18next`                                                                      |

## Craft

| Skill                  | Covers                                           | Already decided here                                           |
| ---------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| `systematic-debugging` | disciplined debugging method; pairs with `debug` | —                                                              |
| `tdd-workflow`         | red → green → refactor                           | —                                                              |
| `testing-patterns`     | test structure and mocking strategy              | Jest via `TEST_TYPE`; naming fixed in `apps/backend/AGENTS.md` |
| `lint-and-validate`    | running the lint and type gates                  | `pnpm lint` + `pnpm build`; there is no `typecheck` script     |

Project rules — stack, layout, commands, money, prohibited actions — are in `AGENTS.md`, not here.
Where a skill disagrees with `AGENTS.md`, `AGENTS.md` wins.

## Removed on purpose

Four AG Kit skills were deleted as actively wrong for this repo. Do not restore them from upstream
without re-checking:

- `tailwind-patterns` — taught Tailwind **v4** (CSS-first `@theme`) while the storefront runs
  `tailwindcss@^3`, and explicitly recommended migrating. Confidently wrong is worse than absent.
- `clean-code` — declared itself always-on for all code writing, competing with the conventions
  above on every task.
- `code-review-checklist` — hijacked "review my code" / "check this PR" from the `review-diff`
  workflow, knowing nothing about the money or Link Module rules.
- `verify-changes` — triggered on a `/verify` workflow that does not exist in this repo.
