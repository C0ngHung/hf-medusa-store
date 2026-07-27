---
description: Testing rules for hf-medusa-store — test types, naming, StackingEngine fixtures, evidence
paths:
  - "**/__tests__/**"
  - "**/*.spec.ts"
  - "**/integration-tests/**"
  - "**/jest.config*"
  # The StackingEngine SRS fixture amounts are contractual, so these rules must
  # also load when the discount maths itself is edited, not just its tests.
  - "**/voucher-engine/**"
---

# Testing rules

Backend testing only (storefront E2E via Playwright is a stretch goal). See the hub
[project-conventions.md](./project-conventions.md) and the workflow doc
`docs/team/CLAUDE_WORKFLOW.md`.

## Test types & scripts (run from `apps/backend/`)

- Set `TEST_TYPE` via the provided scripts — never invoke jest directly:
  - `pnpm test:unit` — pure services (StackingEngine, validators).
  - `pnpm test:integration:modules` — module service + migrations against a real DB/Redis.
  - `pnpm test:integration:http` — API endpoints end-to-end.

## Naming & location

- Unit: `*.unit.spec.ts` inside a `__tests__/` folder next to the code.
- Module integration: `src/modules/<name>/__tests__/`.
- HTTP integration: `integration-tests/http/*.spec.ts`.

## StackingEngine — exact-fixture compliance (VOUCH-003)

- The `StackingEngine` unit tests MUST match the SRS fixtures **to the VND**:
  - item promo 20% + voucher 10% → **under cap** (no capping).
  - item promo 40% + voucher 20% → voucher **reduced by cap**, expected total `3,420,000` VND.
  - suggested item promo + voucher → cap prevents negative total, expected `2,350,000` VND.
- Assert integer math (no floats) and that `discount_capped` / `cap_explanation` are set correctly.

## Acceptance coverage

- Target ≥ 20/22 acceptance tests (`T-SUGG-01..10`, `T-VOUCH-01..12`).
- Integration must exercise real Redis (docker) for cache invalidation, rate-limit cooldown, and
  atomic usage_count — not mocks.

## Evidence (ties to Day-6/7 "Tổng hợp evidence")

- Every test task attaches proof to its PR: test runner output, the asserted numbers, and for
  HTTP tests the request/response body. See `docs/team/CONTRIBUTING.md` §Evidence.

## Test quality

- Name a test after the behaviour it checks, not the implementation. `rejects a voucher past its
end_date` beats `test validateVoucher branch 3`.
- One test asserts one thing. A test that fails for four different reasons tells you nothing.
- Don't mock what doesn't need mocking. Integration tests exercise real Redis and a real DB on
  purpose (see above) — mocking them there defeats the point.
- A new test must be able to fail. After writing it, break the code and confirm it goes red. A test
  that passes against broken code is worse than no test.
