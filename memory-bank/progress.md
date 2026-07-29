# Progress Log

## What Works (Completed & Merged)

### Suggestive Selling Module
- [x] Product-level complementary recommendations ("Complete Your Setup").
- [x] Cart-level threshold nudging rules (CR-01 through CR-04).
- [x] Category complement trees & manual curation rules.
- [x] Redis caching with 5-minute TTL.
- [x] Storefront cart nudge UI components.

### Voucher Engine Module
- [x] Single-voucher application workflow.
- [x] Voucher validation rules (V1 through V8).
- [x] StackingEngine with strict 50% VND global discount cap & Rule 11 non-interference.
- [x] Credit line carrier strategy (`cart.credit_lines`, Decision H).
- [x] Native Medusa Promotion & Campaign backing model (Decision I).
- [x] Embedded Medusa Admin UI widget (`admin/routes/vouchers/page.tsx`).
- [x] Brute-force rate limiting with 30-minute cooldown (SEC-02).
- [x] Storefront distinction between catalog promotions vs voucher credit lines.

### Testing & Documentation
- [x] QA Phase 3 Audit: 27/32 SRS §8/§10 test suites passing.
- [x] Postman API collection (`postman/`) updated with new endpoints.
- [x] E2E flow and Phase 3-4 synthesis documentation (`docs/`).

## What's Remaining / Open Gaps

- [ ] **EC-03**: Enforce 1 VND cart total floor (RED test ready, awaiting code fix approval).
- [ ] **EC-04**: Architectural resolution for cross-boundary race conditions between native cart mutations and voucher revalidation.
- [ ] **T-SUGG-06**: Browser-level E2E automation (Playwright).

## Overall Status Summary

| Area | Status | Notes |
|---|---|---|
| Monorepo & Build System | 🟢 Stable | Turbo + pnpm monorepo operating cleanly |
| Backend Core (Medusa 2.16) | 🟢 Stable | PostgreSQL + Redis infrastructure active |
| Suggestive Selling | 🟢 Complete | Functional in backend & storefront |
| Voucher Engine | 🟢 Core Complete | Credit line carrier & Admin UI merged |
| QA & Test Coverage | 🟡 27/32 Pass | 3 open items pending decision |
