---
description: Coding standards for hf-medusa-store — TypeScript style, money handling, spec traceability
---

# Coding rules

Generic Medusa/Next.js patterns come from the **medusa-dev** plugin. This file captures the
coding decisions unique to THIS repo. See also [medusa.md](./medusa.md), [testing.md](./testing.md),
[security.md](./security.md), and the hub [project-conventions.md](./project-conventions.md).

## Language & tooling
- **TypeScript throughout.** Respect the existing ESLint/Prettier config — do not add competing
  formatters. A `PostToolUse` hook auto-runs Prettier on every edited file.
- **pnpm 11.8.0** only (Node >= 20). Never `npm`/`yarn`. Run all pnpm/turbo commands from the
  INNER `hf-medusa-store/` workspace root.
- Packages are scoped **`@dtc/*`** (not `@medusajs`). Use Turbo filters via root shortcuts:
  `pnpm backend:dev`, `pnpm storefront:dev`, `pnpm backend:seed`.

## Money & arithmetic (INT-01) — non-negotiable
- **All monetary values are integers**: `1 = 1 VND`. Never use floating point for money.
- **Rounding uses `Math.floor`** everywhere (discounts, caps, subtotals).
- Discount order is fixed: **item-level promotions first → voucher → global 50% cap**. When the
  combined discount exceeds the cap, reduce only the voucher, never the item promotion.
- The **cart total is the single source of pricing truth** — recompute from scratch on every
  change (INT-03); never trust a client-supplied total.

## Spec traceability
- Cite the SRS/spec section a piece of code implements in a comment, e.g.
  `// VOUCH-003: global cap`, `// SUGG-001 §5.1`, `// CR-02 threshold nudge`.
- The `StackingEngine` is a **pure function** (no I/O): inputs = items, promos, voucher, cap config;
  output = discount breakdown. Keep it side-effect free so it is unit-testable against SRS fixtures.

## Storefront specifics (`apps/storefront/src/`)
- Path aliases `@lib/*`, `@modules/*`, `@pages/*` (baseUrl `./src`).
- Call the Medusa SDK ONLY from `src/lib/data/*` (`"use server"`); use the single shared `sdk`
  instance in `src/lib/config.ts` — never create a second client.
- Routes under `src/app/[countryCode]/`; page `params` are Promises; prefer `generateStaticParams`.
- Feature folders `src/modules/<feature>/` split into `components/` (leaf UI) and `templates/`
  (page composition). Styling: Tailwind + `@medusajs/ui-preset`; merge classes with `clsx`.

## Dependency pins
- `react-router` / `react-router-dom` pinned to **6.30.4** via pnpm overrides (single copy for the
  admin dashboard). Do not bump independently.
