# Active Context

## Current Status (2026-07-29)

Repo state: Branch **`develop`** clean, up to date with `origin/develop`.

Recent major milestones merged:
- **Option B Carrier Pivot (Decision H)**: Vouchers attach as `cart.credit_lines`, insulating native item promotions from re-sorting or shrinking.
- **Native Promotion Read-Through (Decision I)**: Backing Promotion/Campaign entities created for custom vouchers; Voucher admin UI integrated directly into Medusa Admin Promotion detail page.
- **QA Phase 3 Audit Completed**: Full SRS §8 (EC-01..10) and §10 (T-VOUCH-01..12, T-SUGG-01..10) re-verified against live Postgres/Redis. **27 out of 32 test scenarios Pass with fresh evidence.**
- **Postman Collection & E2E Specs Updated**: Postman collection updated with new routes; E2E flows and Phase 3-4 synthesis documentation added.
- **Cooldown SEC-02 Bug Fixed**: `COOLDOWN_S` correctly set to 30 minutes (1800s).

## Open Decision Gaps (Awaiting Cealus's Direction)

1. **EC-03 / T-VOUCH-09 Floor Fix (1 VND Floor)**:
   - **Status**: Confirmed gap. SRS §8 specifies that combined discounts must floor final cart total at 1 VND (never 0 VND).
   - **Current Behavior**: `calculate-discount.ts` currently calculates a 0 VND total in edge cases. RED unit test exists (`calculate-discount.unit.spec.ts:257-280`).
   - **Action Needed**: Cealus approval to apply `clampMin(..., { floor: 1 })` in `calculate-discount.ts`.

2. **EC-04 Race Condition Architecture**:
   - **Status**: Partially implemented. Existing mutex lock (`revalidateVoucherWorkflow`) handles concurrent VoucherEngine calls, but does not cover native Medusa cart mutations (e.g. cart item removal racing voucher apply).
   - **Action Needed**: Architectural decision on whether to extend the version-column lock or wrap native cart mutations.

3. **T-SUGG-06 E2E Test Suite (Playwright)**:
   - **Status**: One-tap add to cart E2E test requires a browser E2E framework (Playwright) which is currently not installed in the repo.
   - **Action Needed**: Cealus decision to either accept T-SUGG-06 as a documented gap (covered via HTTP tests) or install Playwright.

## Next Steps

1. Review and address the 3 open decision items above with Cealus.
2. Maintain SRS Google Doc annotations to reflect resolved status of EC-08 and T-SUGG-10.
3. Continue feature enhancements on feature branches created off `develop`.
