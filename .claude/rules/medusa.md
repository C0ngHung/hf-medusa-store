---
description: Medusa v2 module rules for hf-medusa-store — module shape, Link Module, models, subscribers
paths:
  - "apps/backend/src/**"
  - "**/apps/backend/src/**"
  - "**/medusa-config.ts"
---

# Medusa rules

Generic Medusa v2 framework guidance comes from the **medusa-dev** plugin. This file captures the
repo-specific module conventions. See the hub [project-conventions.md](./project-conventions.md).

## Canonical module template

`src/modules/suggestive-selling/` is the **canonical shape** — copy it for `voucher-engine` and any
new module:

- `index.ts` exports a `<THING>_MODULE` constant + default `Module(...)`.
- `service.ts` default-exports a class extending `MedusaService({ ...models })`.
- One `model.define('snake_case', …)` **per file** under a `models/` folder.
- **Register** the module in `apps/backend/medusa-config.ts`: `{ resolve: './src/modules/<name>' }`.

## Cross-module references — Link Module, never DB FKs

- Store references to other modules as plain `model.text()` id fields.
- Wire relationships via the **Link Module** using `defineLink(… { readOnly: true })` under
  `src/links/`. Do NOT create database foreign keys across module boundaries — modules stay
  decoupled and communicate via Links + event subscribers only.

## Migrations

- Each module owns Mikro-ORM migrations for its own tables. Modules for this project:
  - VoucherEngine: `voucher_config`, `voucher_usage_log`, `discount_cap_config`.
  - SuggestiveSelling: `suggestion_rule`, `suggestion_rule_item`, `cart_suggestion_condition`,
    `suggestion_event`.
- Leave a `tier` column in the suggestion schema for Tier-3 Behavioral (Phase 2) but do not
  implement its logic now.

## Events & workflows

- Subscribers react synchronously: `cart.updated` → invalidate suggestion cache + re-evaluate +
  (if a voucher is attached) revalidate the voucher. Use an internal flag to prevent recursion
  (revalidation must not re-emit `cart.updated`).
- `order.placed` → atomic `usage_count` increment + append `voucher_usage_log` + copy suggestion
  attribution to order lines.
- Compensatable multi-step operations (`applyVoucher`, `evaluateSuggestions`,
  `revalidateVoucherOnCartChange`) are Medusa **workflows** with compensation steps.

## Scripts

- Seed/exec scripts live in `src/scripts/`, default-export `async ({ container }: ExecArgs)`, MUST
  be **idempotent**, and run via `npx medusa exec ./src/scripts/<file>.ts`.

## Caching & Redis

- Redis is OPTIONAL (loads only when `REDIS_URL` is set; in-memory fallback). Never assume Redis is
  present. Cache keys, TTLs, and fallback behavior are fixed in `docs/team/REDIS_USAGE.md`.
