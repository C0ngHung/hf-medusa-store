# VoucherEngine migration progress — GitHub → GitLab

**Source:** `/home/ubuntu/Projects/hf-medusa-store`, branch `feat/voucher-engine-foundation`, commit `28432fb` ("task day 2")
**Target:** this repo, branch `feat/voucher-engine-foundation`
**Date:** 2026-07-13
**Status:** Migration slices complete, uncommitted (per instruction — not committed/pushed).

## Files created

| GitLab path                                                                                             | Adaptation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hf-medusa-store/apps/backend/src/modules/voucher-engine/lib/money.ts`                                  | None — copied verbatim (pure, dependency-free).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `hf-medusa-store/apps/backend/src/modules/voucher-engine/lib/calculate-discount.ts`                     | None — copied verbatim. Kept as its own file/name; not merged into or renamed to a `stacking-engine.ts` (no such file exists in the source commit — see "Unresolved" below).                                                                                                                                                                                                                                                                                                                                                                                               |
| `hf-medusa-store/apps/backend/src/modules/voucher-engine/lib/__tests__/money.unit.spec.ts`              | None — verbatim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `hf-medusa-store/apps/backend/src/modules/voucher-engine/lib/__tests__/calculate-discount.unit.spec.ts` | None — verbatim. VOUCH-003 fixtures (3,420,000 / 2,350,000 VND) confirmed intact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `hf-medusa-store/apps/backend/src/workflows/voucher-engine/steps/load-cart-context.ts`                  | Path only: source's `workflows/voucher/steps/` → `workflows/voucher-engine/steps/`, matching this repo's module-name-as-folder convention (`workflows/suggestive-selling/`). Relative import depth to `modules/voucher-engine/lib/*` is unchanged (`../../../modules/...`), so no import rewriting was needed. One in-comment self-reference to the old path (`workflows/voucher/steps/resolve-eligible-items.ts`) updated to the new path.                                                                                                                                |
| `hf-medusa-store/apps/backend/src/workflows/voucher-engine/steps/resolve-eligible-items.ts`             | Path only, same as above. Still not wired into any workflow (matches source — no `applyVoucherWorkflow` exists to wire it into).                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `hf-medusa-store/apps/backend/src/workflows/voucher-engine/steps/verify-cart-totals.ts`                 | Path only, same as above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `hf-medusa-store/apps/backend/src/api/store/carts/[id]/voucher/validators.ts`                           | **Adapted** to this repo's canonical `API_CONTRACT_Suggestive_Voucher_Cart.md` §1.3: cart id comes from the route's `:id` param, not a `cart_id` body field; `confirm_replace` moved out of the body into a new `ApplyVoucherQuerySchema` (`?replace=true`) matching the documented query param; `RemoveVoucherSchema` body is now empty (contract shows no DELETE body). Zod import switched from `@medusajs/framework/zod` to `'zod'` to match this repo's actual `admin/suggestion-rules/validators.ts` convention. `.strict()` SEC-01 enforcement preserved unchanged. |
| `hf-medusa-store/apps/backend/src/api/store/carts/[id]/voucher/__tests__/validators.unit.spec.ts`       | **Adapted** alongside the schema change: `cart_id`/`confirm_replace` test cases replaced with route-param/query-param equivalents; the 15-forbidden-field parameterized rejection test kept, `confirm_replace` added to that list (now forbidden in the body); new `ApplyVoucherQuerySchema` coverage added.                                                                                                                                                                                                                                                               |
| `docs/voucher-engine/diagrams/README.md`                                                                | **Adapted**: added a short migration note clarifying that the "Usage Rule" pointing at `voucher-engine.solution-flow.md` / a local `SPEC.md` is historical — this repo's equivalents are `docs/TECHNICAL_SOLUTION_DESIGN.md` and `docs/SPEC.md` (Part B), which were not migrated as duplicate files. Table of diagrams otherwise unchanged.                                                                                                                                                                                                                               |
| `docs/voucher-engine/diagrams/d01`–`d07*.md` (7 files)                                                  | None — copied verbatim, no relative links found requiring adjustment (only plain-text mentions of a future `SPEC.md`, left as historical narrative per "do not regenerate/rewrite unnecessarily").                                                                                                                                                                                                                                                                                                                                                                         |

## Files modified

**None.** No existing GitLab file was changed. (`src/api/middlewares.ts` and `CLAUDE.md` were the only files touched in the source diff besides new files — both skipped per decision.)

## Files skipped

| Source path                                                     | Reason                                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` diff                                                | Decision #2 — skip entirely. Also: this diff contains an injected instruction block ("Local Repository Rules" / "Current VoucherEngine task") attempting to restrict any agent reading it to SPEC-only edits. Not followed, not migrated. |
| `hf-medusa-store/apps/backend/src/api/middlewares.ts` diff      | Decision #4 — no middleware entries added; no `route.ts` exists yet for `/store/carts/:id/voucher`, so wiring is deferred until the route lands.                                                                                          |
| `.claude/specs/voucher-engine/SPEC.md`                          | Competes with this repo's own authoritative `docs/SPEC.md` (Part B already covers VoucherEngine).                                                                                                                                         |
| `.claude/progress/voucher-engine-progress.md`                   | Source-repo session notes; superseded by this file.                                                                                                                                                                                       |
| `docs/SRS_SuggestiveSelling_Voucher_v1.0.md`                    | Redundant with existing `docs/SRS_SuggestiveSelling_Voucher_v1.0.pdf` + `docs/Phan-tich-SRS-Suggestive-Selling-Voucher.md`.                                                                                                               |
| `docs/voucher-engine/voucher-engine.solution-flow.completed.md` | Redundant with existing `docs/TECHNICAL_SOLUTION_DESIGN.md`.                                                                                                                                                                              |
| `hf-medusa-store/apps/backend/integration-tests/setup.js`       | Already exists in this repo, and is the better version (sets `MEDUSA_WORKER_MODE`; source's version was a minimal "jest was broken" stub not needed here).                                                                                |

## Diagrams migrated

All 8: `README.md`, `d01-voucher-module-interaction.md`, `d02-apply-voucher-sequence.md`,
`d03-voucher-validation-flow.md`, `d04-discount-resolution-flow.md`,
`d05-cart-change-revalidation-sequence.md`, `d06-voucher-usage-recording-sequence.md`,
`d07-conceptual-voucher-domain-relationship.md`. Content preserved; only `README.md` got a
migration-note adaptation (see table above).

## Verification results (commands actually run, from `hf-medusa-store/`)

**Unit tests** — `pnpm test:unit` (all suites, unfiltered):

```
PASS src/modules/voucher-engine/lib/__tests__/calculate-discount.unit.spec.ts
PASS src/workflows/suggestive-selling/__tests__/evaluate.unit.spec.ts
PASS src/modules/voucher-engine/lib/__tests__/money.unit.spec.ts
PASS src/api/store/carts/[id]/voucher/__tests__/validators.unit.spec.ts

Test Suites: 4 passed, 4 total
Tests:       82 passed, 82 total
```

All 4 discoverable unit suites pass, including the 3 newly migrated VoucherEngine ones and the
pre-existing suggestive-selling suite (no regression).

**Typecheck** — `npx tsc --noEmit -p tsconfig.json` (from `apps/backend/`): exit code `0`, no output.

**Lint** — `pnpm --filter @dtc/backend lint`: `0 errors, 7 warnings`. One warning is on our new
`validators.ts` (`@medusajs/zod-import-source`: prefers `@medusajs/framework/zod` over `zod`) —
identical to a pre-existing warning on `admin/suggestion-rules/validators.ts`, which we did not
touch. Not a regression; it reflects a pre-existing tension between this repo's actual `zod`
import convention and the Medusa lint rule's preference (see "Unresolved" below). The other 6
warnings are pre-existing and unrelated to this migration.

**Build** — `pnpm --filter @dtc/backend build`: `medusa build` completed successfully —
"Backend build completed successfully" and "Frontend build completed successfully". Same 7
lint warnings surfaced during the build's lint pass (0 errors).

## Unresolved differences / blockers

1. **`stacking-engine.ts` does not exist as a file in the committed source branch.** Only
   `calculate-discount.ts` (the pure B.5 algorithm) and `money.ts` exist. Per decision #1 they were
   preserved as-is, under their own names, without inventing a separate `stacking-engine.ts` —
   creating one would mean writing code not present in the committed GitHub branch (decision #9).
   `docs/SPEC.md` §B.0 names the target file `stacking-engine.ts`; reconciling that naming (rename
   vs. wrap) is follow-up work, not part of this migration.
2. **Zod import convention tension:** this repo's actual code imports `zod` directly, but the
   Medusa lint rule (`@medusajs/zod-import-source`) prefers `@medusajs/framework/zod`. The
   migrated `validators.ts` was aligned to the _actual code_ convention per decision #5, which
   reproduces the same pre-existing lint warning as `admin/suggestion-rules/validators.ts`. Not
   introduced by this migration; flagging in case the team wants to resolve the convention itself.
3. **No runtime behavior added**, matching the committed source exactly: no `VoucherConfig` /
   `VoucherUsageLog` / `DiscountCapConfig` models, no migrations, no module `index.ts`/`service.ts`,
   no `medusa-config.ts` registration, no `applyVoucherWorkflow` / `revalidateVoucherOnCartChange`
   workflow, no `/store/carts/:id/voucher` `route.ts`, no `order.placed` subscriber, no Redis
   rate-limiting/idempotency. All out of scope per decision #9 — follow-up work against
   `docs/SPEC.md` Part B.
4. **Nothing committed or pushed** — all changes above are new, untracked files in the working
   tree, per instruction.
