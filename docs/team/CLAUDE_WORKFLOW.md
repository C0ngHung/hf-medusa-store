# Claude Code Workflow (Vibe Coding)

How every dev turns an unchecked task in [`../tasks_grouped.md`](../tasks_grouped.md) into a merged
PR with evidence, using Claude Code. Task **1.2.3**.

> Golden rule: **Plan → Build → Verify → Evidence → Review → PR.** Never skip Verify or Evidence —
> Days 6–7 grade the project on evidence, not on code that "looks done".

## The per-task loop

### 1. Plan
- Pick one task ID (e.g. `3.1.2`). Read its SRS/spec source **before** coding:
  `docs/SPEC.md`, `docs/Phan-tich-SRS-Suggestive-Selling-Voucher.md`,
  `docs/API_CONTRACT_Suggestive_Voucher_Cart.md`, `docs/TECHNICAL_SOLUTION_DESIGN.md`.
- For anything non-trivial, use Claude Code **plan mode** (or the `Explore`/`Plan` agents) to map
  the change before editing. Confirm the task is yours in [`OWNERSHIP.md`](./OWNERSHIP.md).

### 2. Build
- Follow the rules in `.claude/rules/` — [`coding.md`](../../.claude/rules/coding.md),
  [`medusa.md`](../../.claude/rules/medusa.md), [`security.md`](../../.claude/rules/security.md).
- Cite the spec section in code comments (`// VOUCH-003`, `// SUGG-001 §5.1`).
- Copy the `suggestive-selling` module shape for new modules. Money is integer VND + `Math.floor`.
- The Prettier `PostToolUse` hook formats files automatically on save.

### 3. Verify (never skip)
- Run the `/verify` skill to exercise the change end-to-end.
- Backend tests from `apps/backend/`: `pnpm test:unit`, `pnpm test:integration:modules`,
  `pnpm test:integration:http` (see [`testing.md`](../../.claude/rules/testing.md)).
- Bring up infra with Docker (Postgres `:5433`, Redis `:6380`) so cache / rate-limit / atomic
  counter behavior is exercised against real Redis, not mocks.

### 4. Evidence
- Capture proof for the task and keep it for the PR: test output, HTTP request/response, a Redis
  key dump, or a screenshot. Exact requirements per task type: [`CONTRIBUTING.md`](./CONTRIBUTING.md) §Evidence.

### 5. Review
- Run `/code-review` on the diff. For voucher, rate-limit, discount, or auth-adjacent code also run
  `/security-review`. Address findings before opening the PR.

### 6. PR
- Branch, commit, and open the PR per [`CONTRIBUTING.md`](./CONTRIBUTING.md). Fill the PR template
  (task ID + evidence + checklist). Green `pnpm lint` / `test` / `build` required.
- On merge, tick the task's checkbox in [`../tasks_grouped.md`](../tasks_grouped.md).

## Handy Claude Code skills / commands
| Command | Use |
|---------|-----|
| plan mode | design a change before editing |
| `Explore` / `Plan` agents | fan-out codebase search / architecture |
| `dev-backend` | start the Medusa backend dev server |
| `dev-storefront` | start the Next.js storefront (port 8008) |
| `seed` | seed the backend dev database |
| `/bugfix` | fix a bug — root cause first, minimal diff, regression test |
| `/debug` | unknown cause — hypotheses first, no edits until proven |
| `/feature` | new feature — plan for approval, then implement |
| `/refactor` | behaviour-preserving cleanup, green after every step |
| `/new-endpoint` | scaffold a REST route under `src/api/` |
| `/scaffold-module` | scaffold a module from the suggestive-selling template |
| `/verify` | drive the change end-to-end |
| `/review-diff` | review your **uncommitted** working diff by severity |
| `/review-pr` | review a **GitHub PR** against repo conventions |
| `/code-review` | built-in review of the working diff |
| `/security-review` | security pass (use for voucher/rate-limit code) |
| `medusa-dev` plugin | generic Medusa v2 framework guidance |

Which review command: `/review-diff` while the work is still uncommitted, `/review-pr` once it
is a pull request. For VoucherEngine task slices use the `execute-voucher-engine-tasks` skill
rather than `/feature` — it owns its own plan → build → verify loop.

## Environment quick ref
- Run all pnpm/turbo commands from the INNER `hf-medusa-store/` workspace root.
- Infra: `docker compose up -d` → Postgres `:5433`, Redis `:6380` (project-specific ports).
- Redis is OPTIONAL — code must fall back to in-memory when `REDIS_URL` is unset.
