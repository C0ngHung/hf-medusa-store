# Verification — pre-verified framework facts, subagent protocol, test plan

## Pre-verified framework facts (Medusa 2.16.0)

These were verified directly against this repo's installed source during the architecture review.
Trust them without re-deriving from scratch — but re-verify anything not covered here, and
re-verify everything here if the installed Medusa version changes. `.pnpm` directory names are
hash-suffixed and **will** change across lockfile updates — never hardcode a hash from a prior
session; re-resolve the path with `find`/`readlink` first, e.g.:

```
find <workspace-root>/node_modules/.pnpm -maxdepth 1 -iname "@medusajs+core-flows@2.16*"
```

Per `CLAUDE.md`'s tool-usage policy: search one exact package and symbol at a time, never
recursively scan `node_modules`, prefer `.d.ts` type definitions and workflow source, cite
`file:line`.

| Fact                                                                                                                                                                                          | Where verified                                                                                                                                                                                                     | Why it matters for this rebuild                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The native usage counter field is **`used`**, not `usage_count`, on both `Promotion` and `CampaignBudget`                                                                                     | `@medusajs/promotion` `dist/models/promotion.js:23`; `@medusajs/types` campaign-budget types                                                                                                                       | Don't write code or docs assuming a field named `usage_count` exists natively                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `registerUsage` increments `used` via plain read-then-`update()`, not an atomic `INCR`                                                                                                        | `@medusajs/promotion` `dist/services/promotion-module.js:127-226`                                                                                                                                                  | Native usage tracking cannot satisfy INT-02 on its own — `redeemVoucherAtomic` must stay authoritative (see `keep-remove-map.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `registerUsageStep` is only called from `completeCartWorkflow` (order completion), never from `updateCartPromotionsWorkflow` (cart apply)                                                     | `@medusajs/core-flows` `dist/cart/workflows/complete-cart.js:484-490`                                                                                                                                              | Confirms native timing already matches the SRS's "usage increments only after order success" — no change needed here regardless of carrier                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `CampaignBudgetTypeValues` = `spend` \| `usage` \| `use_by_attribute` \| `spend_by_attribute` (four, not two); attribute-based ones are `@since 2.11.0`, present in 2.16.0                    | `@medusajs/types` `dist/promotion/common/campaign-budget.d.ts`                                                                                                                                                     | Per-customer native budgeting is real. Whether to adopt it for `per_user_limit` vs. keep custom `VoucherUsageLog`-based enforcement is an **explicit Phase 1 decision**, not settled here — see `keep-remove-map.md`'s `per_user_limit` section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| The `target_rules`/rule-`attribute` whitelist (`items.product.id`, etc.) is enforced only by the admin dashboard's autocomplete endpoint, not by the module or the rule _write_ path          | `@medusajs/medusa` `dist/api/admin/promotions/utils/validate-rule-attribute.js` (called from exactly one route); `@medusajs/promotion` `dist/utils/validations/promotion-rule.js:7-29` (no attribute check at all) | The docs' framing of this as a hard platform constraint is wrong — it's a soft admin-UX convention. Relevant to the Phase 1 scope-spike decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `computeActions` sorts by buy-get-type first, then `application_method.value DESC` — no concept of "item promo first, voucher second, cap reduces only voucher"                               | `@medusajs/promotion` `dist/services/promotion-module.js:319+`, `ComputeActionUtils.sortByBuyGetType`                                                                                                              | Historical diagnosis of the old implementation (CONFLICT-8/PD-15), made under the assumption that "item-level promotion" = a Promotion adjustment always in play. Per Phase 0 (decision 4) and the latest business clarification, "item-level promotion" here means the Price List sale price instead — under that meaning this ordering is irrelevant to the SRS's normal path, and matters **only** in the narrow case where a native Promotion line-item adjustment coexists with the voucher on the same items. **Not an automatic blocker for the default native-Promotion-carrier hypothesis** — Phase 1 verifies this narrow case specifically (see `phase-plan.md` §Default forward architecture) rather than treating the carrier as ruled out by default |
| `createPromotionsWorkflow` input = `{promotionsData: CreatePromotionDTO[]} & AdditionalData`; `additional_data` is supported on admin create/update promotion routes via `WithAdditionalData` | `@medusajs/core-flows` `dist/promotion/workflows/create-promotions.d.ts:6-11`; `@medusajs/medusa` `dist/api/admin/promotions/route.js:26-36`, `dist/api/admin/promotions/validators.js:124,154`                    | Confirms Phase 1's `additional_data` + Promotion-first `createVoucherWorkflow` plan is viable in this exact version                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `CreatePromotionDTO` accepts `campaign_id` (attach existing) or inline `campaign: CreateCampaignDTO` (with `budget`)                                                                          | `@medusajs/types` `dist/promotion/common/promotion.d.ts:82-131`, `dist/promotion/mutations.d.ts:61-86`                                                                                                             | Confirms Phase 1 can create Promotion+Campaign in one call                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

| `cart.credit_lines`/`createCartCreditLinesWorkflow`/`deleteCartCreditLinesWorkflow` (and the parallel `Order.credit_lines`) were evaluated as a discount-carrier candidate — confirmed to exist in 2.16.0 with a dedicated model/workflows, `reference`/`reference_id` tagging, and persistence from cart to order. Also confirmed: credit lines apply a hardcoded 0% effective tax rate, and `credit_line_total` is tracked entirely separately from `discount_total`. **Rejected as the carrier in Phase 0 — not used by this rebuild.** | `@medusajs/types` `dist/cart/common.d.ts:658,1071-1101`, `dist/order/common.d.ts:33,932,1034`; `@medusajs/core-flows` `dist/cart/workflows/create-cart-credit-lines.d.ts`, `delete-cart-credit-lines.d.ts`; `@medusajs/utils` `dist/totals/cart/index.js:34-36,106-122` | Recorded so a future session doesn't re-evaluate `credit_lines` from scratch and rediscover the same rejected option — the replacement carrier is still an open Phase 1 question, see `phase-plan.md` §Phase 0/§Phase 1 |
| No `defineLink`, no `IPromotionModuleService` usage, no `PromotionModule` reference anywhere ties `VoucherConfig`/`VoucherUsageLog`/`DiscountCapConfig` to Promotion at the data-model/module-link level today | Repo-wide grep of `apps/backend/src`, confirmed zero hits outside one-off seed scripts | Confirms Phase 1's `defineLink` work is additive, not a conflicting rewrite of existing links |
| `updateCartPromotionsWorkflow` with `action: ADD` unions new codes into existing cart adjustment codes — native stacking (multiple codes) is supported | `@medusajs/core-flows` `dist/cart/steps/get-promotion-codes-to-apply.js:30-70` | Relevant only if the rebuild ever needs multiple simultaneous native promotion codes; not required for the voucher carrier itself, whatever mechanism Phase 1 adopts (not `cart.credit_lines` — rejected) |

## Subagent protocol

| Trigger                                                                 | Subagent                 | When exactly                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any backend module/link/workflow architecture change                    | `medusa-module-reviewer` | End of Phase 1, end of Phase 2, final pass in Phase 6                                                                                                                                              |
| Before writing implementation tests                                     | `test-writer`            | Before the main session writes any new `*.unit.spec.ts`, module-integration, or HTTP-integration test in Phases 1, 2, 5 — delegate authorship, don't write tests directly first and hand off after |
| Any change touching voucher validation, rate limiting, or checkout code | `security-auditor`       | End of Phase 2 (carrier + validation path), Phase 3 (new admin routes — authZ correctness), Phase 4 (checkout UI), and any Phase 5 test exercising those paths                                     |

Invoke each via the Agent tool with `subagent_type` matching the name above. Do not skip a required
run because the change "looks small" — these are architecture-review and security gates, not
optional polish.

## Test plan (Phase 5 detail)

**Commands — always via `pnpm`, never raw `jest`, run from `apps/backend/`** (per
`.claude/rules/testing.md`):

- `pnpm test:unit` — V1–V8 validators, `calculate-discount`, any other pure-function coverage.
- `pnpm test:integration:modules` — module service + migrations against a real DB/Redis, including
  the new `defineLink`/backfill (Phase 1) and `redeemVoucherAtomic` (unchanged, re-run for
  regression).
- `pnpm test:integration:http` — `POST/DELETE /store/carts/:id/voucher`, `GET
/store/customers/me/vouchers`, admin routes, end-to-end. These five routes are exactly the SRS
  §6.2 endpoints (`phase-plan.md` §SRS §6.2) — assert against the SRS's behavior and response fields
  for each, not just whatever the Medusa-normalized path happens to return by default.

**Deferred-test backlog (run first, in this order — none of these has actually been executed as of
Phase 3B; all blocked so far on an environmental port-9009 conflict, not a code problem, across
three prior sessions — see `voucher-engine-rebuild-progress.md`):**

1. `src/modules/voucher-engine/__tests__/create-voucher-workflow.integration.spec.ts`,
   `backfill-voucher-promotions.integration.spec.ts`, and the extended
   `integration-tests/http/voucher-admin.spec.ts` (Phase 1).
2. `integration-tests/http/voucher-sale-price-basis.spec.ts` (Phase 2).
3. `integration-tests/http/discount-cap-config-admin.spec.ts` (Phase 3A).
4. T-VOUCH-01..12 (below).
5. Usage-count/`VoucherUsageLog` timing (below).
6. Manual admin (`DiscountCapConfig` UI, Phase 3B) and storefront (Phase 4) checks — no automated
   coverage exists for either in this repo; use a manual checklist, don't skip verification because
   there's no test to run.

**T-VOUCH-01..12 re-run:** re-run every acceptance test from `.claude/rules/testing.md`'s
acceptance-coverage target. Nearly all should pass unmodified — Phase 2 kept the ephemeral carrier
mechanism completely unchanged (verification-only scope), so there is no carrier-driven discount-math
change to reconcile. Update only tests that need to reflect an actual Phase 1–3 change (e.g. an
admin API response-shape assertion). Do not weaken an assertion to make it pass — if an expected
value genuinely needs to change, that change must trace back to a specific Phase 0–3 decision, not
be invented ad hoc.

**CONFLICT-8 regression test — CORRECTED: conditional, not a default requirement, not a Phase 6
blocker.** The previous version of this section required this test unconditionally before Phase 6.
That assumed CONFLICT-8 was a live risk needing proof either way. Per the business clarification
already recorded elsewhere (`phase-plan.md` §Default forward architecture, Phase 0 decision 4):
"item-level promotion" means the Price List sale price from the Pricing Module, not a Promotion
line-item adjustment — so the narrow coexistence case this test targets (a **native** Promotion
line-item adjustment coexisting with the voucher) is historical/out-of-default-scope for this
project's current SRS interpretation, not part of the normal path. **Do not require or add this
test unless the business explicitly requests native Promotion line-item adjustment coexistence
support.** If that requirement is ever raised, the test shape is still valid and kept here for
reference:

1. Construct a cart with a **native Promotion line-item adjustment already applied** (e.g. a
   percentage-off-product Promotion), then apply a voucher on the same items, and assert the
   pre-existing Promotion adjustment amount is identical before and after (Rule 11 — the scenario
   CONFLICT-8/PD-15 originally identified as broken).
2. Assert VoucherEngine never writes to or otherwise alters the Price List sale price itself
   (Phase 0 decision 6), regardless of whether a Promotion adjustment is also present.
3. Assert `cart.total` matches the independently-computed expected total to the VND.

Until such a requirement is raised, this test's absence is an explicit, recorded deferral — not a
gap to silently carry forward as if forgotten, and not something Phase 6 should treat as blocking.
The Rule-11 shrink guard in `verify-cart-totals.ts` stays in place regardless of whether this test
is ever added — its existence is not conditioned on this specific test.

**Usage-count and `VoucherUsageLog` timing check (regression, not new logic):** confirm applying a
voucher to a cart does not change `usage_count`/`used` and does not create a `VoucherUsageLog` row;
confirm removing a voucher does not change either; confirm `usage_count` increments and exactly one
`VoucherUsageLog` row is created per successful order, not again on a duplicate/retried
order-placed event (idempotency) — per Phase 0 decision 7. This should already pass unmodified —
it's listed here as a required regression check, not a new feature.

## Evidence requirements

Per `.claude/rules/testing.md` §Evidence and this repo's general evidence conventions: every phase's
completion report attaches real test-runner output and the asserted numbers — not a claim that
tests "should pass." For HTTP-integration tests, attach the actual request/response body observed,
not a reconstructed example.
