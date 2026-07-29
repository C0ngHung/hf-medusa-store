# System Patterns & Architecture

## Architecture Overview

RallyGear is structured as a pnpm + Turborepo monorepo:

```
hf-medusa-store/            <- git root (docker-compose.yml)
└── hf-medusa-store/        <- pnpm workspace root
    └── apps/
        ├── backend/        <- @dtc/backend (Medusa 2.16.0, Node >=20, Postgres, Redis)
        └── storefront/     <- @dtc/storefront (Next.js 15 App Router, React 19, Tailwind)
```

## Key Technical Architectural Decisions

### Decision H: Credit Line Carrier Strategy (`cart.credit_lines`)
- **Problem**: Ephemeral fixed-promotion carriers interacted poorly with native Medusa `computeActions`, causing re-sorting and unintended shrinking of coexisting percentage promotions (violating Rule 11 stacking invariant).
- **Solution**: Vouchers carry discounts via Medusa `cart.credit_lines`. Credit lines net directly against `cart.total` without passing through `computeActions`, strictly preserving item-level promotion calculations.

### Decision I: Native Medusa Promotion Read-Through & Unified Admin
- **Backing Model**: Custom vouchers create backing native Medusa `Promotion` & `Campaign` records for configuration/eligibility checks.
- **Admin UI**: Custom voucher management is embedded directly into Medusa's Admin Dashboard under `admin/routes/vouchers/page.tsx` as a "Voucher settings" widget and read-through view rather than a standalone app.

## Custom Modules & Core Building Blocks

### 1. Backend Structure (`apps/backend/src/`)
- `modules/suggestive-selling`: Recommendation engine algorithms, category complement trees, and rule evaluators.
- `modules/voucher`: Custom voucher domain logic, usage tracking, brute-force rate-limiting, and validation rules (V1-V8).
- `lib/calculate-discount.ts`: Pure-function StackingEngine enforcing the 50% VND global discount cap and Rule 11 stacking rules.
- `workflows/`: Medusa Workflows orchestrating cart revalidation, voucher application, usage recording, and credit line maintenance.
- `links/`: Cross-module Link definitions (e.g. `voucher-config-promotion.ts`).

### 2. Storefront Structure (`apps/storefront/src/`)
- `app/[countryCode]/`: Multi-region Next.js App Router layout.
- `modules/cart/`, `modules/checkout/`: UI components for cart nudges, checkout voucher inputs, and separate display of promotions vs credit line vouchers.

## Architectural Invariants & Rules

1. **Rule 11 (Non-Interference)**: Voucher credit lines must never shrink coexisting item-level promotions.
2. **Global Cap (50%)**: Combined discounts (promotions + vouchers) cannot exceed 50% of the cart's pre-discount total.
3. **VND Integer Arithmetic**: All money calculations must use whole numbers (VND has no sub-units).
4. **Cache & Rate Limit**: Redis caches recommendation outputs (TTL 5m) and tracks attempt counts for voucher brute-force protection (SEC-02 30-min cooldown).
