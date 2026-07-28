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

## Module shape and scripts — single source elsewhere

The canonical module template (`src/modules/suggestive-selling/`), the `model.text()` + Link Module
rule, module registration, and the `src/scripts/` conventions live in **`apps/backend/AGENTS.md`**,
because Antigravity can read that file and cannot read this one. Do not restate them here.

This file adds only the depth that Claude Code alone needs.

## Cross-module references — the part worth expanding

`apps/backend/AGENTS.md` states the rule (ids as `model.text()`, never a DB foreign key). The
mechanics: declare links with `defineLink(… { readOnly: true })` under `src/links/`. Modules stay
decoupled and communicate through Links plus event subscribers only — never a direct service import
across a module boundary.

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

## Caching & Redis

- Redis is OPTIONAL (loads only when `REDIS_URL` is set; in-memory fallback). Never assume Redis is
  present. Cache keys, TTLs, and fallback behavior are fixed in `docs/team/REDIS_USAGE.md`.
