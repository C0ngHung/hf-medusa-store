# AGENTS.md

Shared rules for every AI coding agent working on this repository (Claude Code, Antigravity,
Cursor, Windsurf, Codex, Gemini CLI). Claude Code reads this via the `@AGENTS.md` import in
`CLAUDE.md`, which also carries the Claude-only additions.

## Project

- **Name:** hf-medusa-store
- **Purpose:** headless e-commerce platform — cross-sell suggestions (SuggestiveSelling) and
  vouchers with a global discount cap (VoucherEngine)
- **Stack:** Medusa 2.16.0 (Postgres + Redis) backend, Next.js 15 + React 19 + Tailwind +
  Stripe storefront, TypeScript throughout, Turborepo monorepo
- **Package manager:** pnpm 11.8.0 (Node >= 20) — never npm, never yarn

## ⚠️ Repository layout — two nested folders

```
hf-medusa-store/            <- git root (docker-compose.yml here)
└── hf-medusa-store/        <- pnpm workspace root — RUN ALL pnpm/turbo COMMANDS HERE
    └── apps/
        ├── backend/        <- @dtc/backend    (Medusa 2.16)
        └── storefront/     <- @dtc/storefront (Next.js 15, port 8008)
```

**Always `cd hf-medusa-store` (the inner folder) before any pnpm/turbo command.** This is the
single most common mistake on this repo.

## Commands

From the **inner** `hf-medusa-store/` workspace root, run the scripts defined in
`package.json` (root) and `apps/backend/package.json` (backend test scripts).

From `apps/backend/` — never invoke jest directly, these scripts set `TEST_TYPE`.

Infra: `docker compose up -d` from the git root → Postgres `:5433`, Redis `:6380`.

**Before reporting a task done**, run the relevant test script plus `pnpm lint` and
`pnpm build`. There is no `typecheck` script in this repo — `pnpm build` is the type gate.

## Conventions

- **Commits:** Conventional Commits with scope — `feat(backend): …`, `fix(storefront): …`,
  `fix(admin): …`, `chore: …`
- **Branches:** `<type>/<kebab-description>`, e.g. `feat/suggestive-selling-foundation`.
  Branch off `develop`; PRs merge into `develop`. **`main` is release-only.**
- **Packages** are scoped `@dtc/*`, not `@medusajs`.
- TypeScript throughout. Respect the existing ESLint/Prettier config — do not add a competing
  formatter.
- Storefront path aliases: `@lib/*`, `@modules/*`, `@pages/*`.
- **Redis is OPTIONAL** — infra modules load only when `REDIS_URL` is set, with an in-memory
  fallback. Never assume Redis is present.

## Prohibited

- No new dependency without asking first.
- No hardcoded secret, API key, or connection string. Secrets live in `.env` (gitignored);
  commit only `.env.template`.
- Never modify generated files, `node_modules/`, or `**/.medusa/`.
- Never run a destructive command: `rm -rf`, `git push --force`, `drop table`, DB reset.
- Never commit, push, reset, clean, merge, rebase, or cherry-pick without explicit approval.
- Never edit a test to make it pass — fix the code instead.
- Never bump `react-router` / `react-router-dom` independently; they are pinned to 6.30.4 via
  pnpm overrides so the admin dashboard has a single copy.

## How to work

1. A task touching more than 3 files: present a plan and wait for approval before editing.
2. Requirement unclear: ask. Do not guess.
3. When done: state which files changed and why.
4. Keep the diff minimal. No refactoring outside the assigned scope.
5. Log adjacent problems you notice; do not go fix them unless asked.

## Project notes

- **Money is non-negotiable.** All monetary values are integers (`1 = 1 VND`), rounding is
  `Math.floor` everywhere, and the discount order is fixed: item-level promotion → voucher →
  global 50% cap. When the combined discount exceeds the cap, reduce **only** the voucher.
  Full rules in `.claude/rules/coding.md`.
- **Discounts are computed server-side only.** The cart total is the sole pricing truth;
  recompute it from authoritative cart data on every mutation and reject any client-supplied
  monetary field. `voucher_usage_log` is append-only. Full rules in `.claude/rules/security.md`.
- Cite the SRS/spec section a piece of code implements in a comment, e.g. `// VOUCH-003:
global cap`.
- `src/modules/suggestive-selling/` is the canonical template for new backend modules.
  Cross-module references are plain `model.text()` id fields wired via the Link Module — never
  a database foreign key.

## Current work

- `suggestive-selling` module (cross-sell / complementary products) — under active development

Detailed rules live in `.claude/rules/`: `project-conventions.md` (hub), `coding.md`,
`testing.md`, `security.md`, `medusa.md`, `typescript.md`. Team process docs live in
`docs/team/`: `CONTRIBUTING.md` (branch/PR/evidence), `OWNERSHIP.md` (file ownership),
`REDIS_USAGE.md`, `CLAUDE_WORKFLOW.md`, `RUNNING_TESTS.md`, `SETUP-AI-TOOLS.md` (setting an agent
up on a new machine, and the enforcement layers), `PROMPT-TEMPLATE.md` (how to write a task
prompt for this repo).

## Per-tool configuration

This file is the shared source of truth; each tool adds only what it needs on top.

- **Claude Code** — `CLAUDE.md` (imports this file) plus `.claude/commands/` and
  `.claude/rules/`.
- **Antigravity CLI and IDE** — reads this file natively, walking up from the working directory
  to the repository root, so `apps/backend/AGENTS.md` and `apps/storefront/AGENTS.md` apply when
  working under those folders. `.agents/` adds a `PreToolUse` safety hook, workspace skills, and
  an MCP example; see `.agents/README.md`.

`.claude/rules/` is **Claude-Code-only** — no other tool can read it. Where a rule file is cited
below for more detail, the summary in this file is what every other tool gets, and it is
authoritative for them.

The five task workflows have **one source each**: `.agents/skills/<name>/SKILL.md` for `bugfix`,
`debug`, `feature`, `refactor`, `review-diff`. The matching `.claude/commands/*.md` are thin
wrappers that `@`-import that file and add only what cannot be shared — `$ARGUMENTS`, the
`!`-shell-injection line, and Claude-Code-only trigger words. **Edit the skill, not the wrapper.**

Because the shared body is read by every tool, it must cite only files every tool can read:
this file, `apps/*/AGENTS.md`, and `docs/team/*` — never `.claude/rules/*`.
