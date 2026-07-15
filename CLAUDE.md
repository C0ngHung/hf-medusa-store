# hf-medusa-store

Headless e-commerce platform on **Medusa 2.16**. pnpm + Turborepo monorepo.

## ⚠️ Repository layout — two nested folders

```
hf-medusa-store/            <- git root (docker-compose.yml here)
└── hf-medusa-store/        <- pnpm workspace root — RUN ALL pnpm/turbo COMMANDS HERE
    └── apps/
        ├── backend/        <- @dtc/backend    (Medusa 2.16)
        └── storefront/     <- @dtc/storefront (Next.js 15, port 8008)
```

**Always `cd hf-medusa-store` (the inner folder) before any pnpm/turbo command.**

## Recommended tooling

Install the official Medusa Claude Code plugin for framework guidance:
`/plugin marketplace add medusajs/medusa-agent-skills` then `/plugin install medusa-dev@medusa`.
Project-specific conventions live in `.claude/rules/` — the hub `project-conventions.md` plus
topical rules: `coding.md`, `testing.md`, `security.md`, `medusa.md`. Team process docs
(workflow, contributing, ownership, Redis usage) live under `docs/team/`.

## Tech stack

- Package manager: **pnpm 11.8.0** (Node >= 20) — never use npm or yarn
- Monorepo: **Turborepo**
- Backend: **Medusa 2.16.0** (Postgres + Redis), TypeScript
- Storefront: **Next.js 15**, React 19, Tailwind, Stripe

## Common commands (run from the inner `hf-medusa-store/`)

| Task | Command |
|------|---------|
| Backend dev server | `pnpm backend:dev` |
| Storefront dev server (port 8008) | `pnpm storefront:dev` |
| Seed backend data | `pnpm backend:seed` |
| Build all | `pnpm build` |
| Lint all | `pnpm lint` |
| Test all | `pnpm test` |

Backend tests (from `apps/backend/`):
- `pnpm test:unit`
- `pnpm test:integration:http`
- `pnpm test:integration:modules`

## Backend structure (`apps/backend/src/`)

- `api/admin`, `api/store` — REST endpoints
- `modules/` — custom modules (e.g. `suggestive-selling`)
- `workflows/`, `subscribers/`, `jobs/`, `links/` — Medusa building blocks
- `scripts/`, `migration-scripts/` — seeds & data migration
- `admin/` — admin dashboard customizations (i18n)

## Storefront structure (`apps/storefront/src/`)

- `app/[countryCode]/` — Next.js App Router, multi-region
- `modules/` — UI grouped by domain (cart, checkout, products, …)
- `lib/` — shared context, data fetching, hooks, utils

## Conventions

- **Commits:** Conventional Commits with scope — `feat(backend): …`, `fix(storefront): …`, `fix(admin): …`, `chore: …`
- **Branches:** `<type>/<kebab-description>` — e.g. `feat/suggestive-selling-foundation`
- Secrets live in `.env` (gitignored); commit only `.env.template`
- TypeScript throughout; respect existing ESLint/Prettier config
- Full branch/PR/evidence rules: `docs/team/CONTRIBUTING.md`. File ownership (4-dev): `docs/team/OWNERSHIP.md`. Redis usage: `docs/team/REDIS_USAGE.md`. Dev workflow: `docs/team/CLAUDE_WORKFLOW.md`.

## Current work

- `suggestive-selling` module (cross-sell / complementary products) — under active development


## Shell command policy

- Prefer Read, Glob, and Grep for source and dependency inspection.
- Use Bash only when repository tools are insufficient.
- Use one simple operation per Bash call.
- Do not combine variable assignment, `$()`, pipes, redirection,
  semicolons, or `&&` in one inspection command.
- Split compound inspection commands into separate tool calls.
- Run `pnpm` directly; never invoke it through `npx pnpm`.
- Do not pipe test output to `tail` in the same command.
- Never commit, push, reset, clean, merge, rebase, or cherry-pick
  without explicit user approval.