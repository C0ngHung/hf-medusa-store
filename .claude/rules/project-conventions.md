---
description: Project-specific conventions for hf-medusa-store the official Medusa plugin can't infer
---

# Project-specific conventions

Generic Medusa/Next.js patterns come from the official **medusa-dev** plugin. This file only
captures decisions unique to THIS repository.

## Rule index

Topical rules split out of this hub — read the one matching your task:

- [coding.md](./coding.md) — TypeScript style, integer money (`Math.floor`, 1 = 1 VND), spec traceability, storefront.
- [testing.md](./testing.md) — test types/naming, StackingEngine SRS fixtures, evidence capture.
- [security.md](./security.md) — server-side pricing, rate limiting, audit immutability, secrets.
- [medusa.md](./medusa.md) — module shape, Link Module (no DB FKs), models, subscribers, workflows.

Team-facing decision docs live under `docs/team/`: `CLAUDE_WORKFLOW.md`, `CONTRIBUTING.md`,
`OWNERSHIP.md`, `REDIS_USAGE.md`.

## Repo layout & tooling

- Two nested `hf-medusa-store/` folders; the pnpm workspace root is the INNER one — run every pnpm/turbo command there.
- Packages are scoped `@dtc/*` (not `@medusajs`). Root shortcuts use Turbo filters: `pnpm backend:dev`, `pnpm storefront:dev`, `pnpm backend:seed`.
- Storefront dev server runs on port **8008**.
- Redis is OPTIONAL — infra modules load only when `REDIS_URL` is set (in-memory fallback). Never assume Redis is present.
- `react-router` / `react-router-dom` are pinned to **6.30.4** via pnpm overrides (single copy for the admin dashboard). Do not bump independently.

## Backend and storefront

Backend-specific conventions (module shape, seed scripts) live in `apps/backend/CLAUDE.md`;
storefront-specific conventions (path aliases, SDK usage, routing) live in
`apps/storefront/CLAUDE.md`. Both load only when working under their respective directory.
Testing conventions live in `.claude/rules/testing.md` (loads automatically for test files).
