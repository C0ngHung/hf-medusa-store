# Contributing — Branch, PR & Evidence Conventions

Team conventions for the 4-dev, 7-day build. Task **1.2.4**. Pairs with
[`CLAUDE_WORKFLOW.md`](./CLAUDE_WORKFLOW.md) and [`OWNERSHIP.md`](./OWNERSHIP.md).

## Branches
- Format: **`<type>/<kebab-description>`** — e.g. `feat/voucher-engine-foundation`,
  `fix/voucher-cap-rounding`, `chore/redis-usage-doc`.
- `type` ∈ `feat` · `fix` · `chore` · `test` · `docs` · `refactor`.
- Branch **off `develop`**; PRs merge back into `develop`. `main` is release-only.
- One task (or one tightly-related cluster) per branch — keeps PRs small and reviewable.

## Commits — Conventional Commits with scope
- Format: **`<type>(<scope>): <task-id> <summary>`**
- Scopes: `backend` · `storefront` · `admin` · or a module name (`voucher-engine`, `suggestive-selling`).
- Examples:
  - `feat(backend): 3.1.1 add VoucherEngine custom module`
  - `feat(voucher-engine): 3.2.4 V1 voucher exists & active validation`
  - `fix(admin): 2.5.7 validate suggestion-rule input`
  - `chore: 1.3.5 finalize Redis usage decision`

## Pull Requests
- **Target `develop`.** Title = task ID + summary (same as the commit subject).
- Body uses [`.github/PULL_REQUEST_TEMPLATE.md`](../../.github/PULL_REQUEST_TEMPLATE.md): summary,
  linked task ID(s) from [`../tasks_grouped.md`](../tasks_grouped.md), evidence, checklist.
- **Merge gate:** green `pnpm lint`, `pnpm test`, `pnpm build`; ≥ 1 approving review; no unresolved
  `/code-review` findings; only files you own touched (see [`OWNERSHIP.md`](./OWNERSHIP.md)).
- On merge, tick the task checkbox(es) in `../tasks_grouped.md`.

## Evidence (graded on Days 6–7)
Every task attaches proof to its PR. Store it inline in the PR description (paste text/output) and
attach images where relevant.

| Task type | Required evidence |
|-----------|-------------------|
| Model / migration | migration run log + `\d <table>` schema dump |
| Service / pure logic (StackingEngine, validators) | `pnpm test:unit` output showing SRS-fixture assertions passing |
| Store/Admin API | HTTP request + response body (status, discount_amount, discount_capped, cap_explanation…) |
| Subscriber / cache | before/after Redis key dump proving invalidation (`redis-cli KEYS`, `GET`) |
| Rate-limit | log of 5 failed attempts → `429` + cooldown timestamp |
| Usage / audit | `voucher_usage_log` row + proof `usage_count` didn't increment on cart-apply |
| Suggestion display | API response with correct order/limit + filter exclusions |
| Demo (Day 7) | recorded flow / screenshots of the end-to-end path |

Keep evidence reproducible: include the command run and the seed/data preconditions.
