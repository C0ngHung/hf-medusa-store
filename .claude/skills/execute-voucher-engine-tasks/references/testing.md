# Testing — Phases 7–8 detail (SKILL.md's eleven-phase numbering)

## Test types and naming (repo convention — `.claude/rules/testing.md`)

Run everything from `apps/backend/` using the repo's `pnpm` scripts — **never invoke `jest`
directly**; the scripts set `TEST_TYPE` and `NODE_OPTIONS=--experimental-vm-modules`, and running
raw `jest` without them has previously produced spurious module-loader failures that look like real
defects but aren't.

- `pnpm test:unit` — pure business logic (StackingEngine/`calculate-discount.ts`, validators,
  money helpers). Files: `*.unit.spec.ts` inside a `__tests__/` folder next to the code.
- `pnpm test:integration:modules` — module service + migrations against a real DB/Redis. Files:
  `src/modules/<name>/__tests__/`.
- `pnpm test:integration:http` — full-app API/workflow/Cart/Promotion/subscriber behavior. Files:
  `integration-tests/http/*.spec.ts`.

## What counts as sufficient evidence that a task is Done

A task may be marked `Done` only when **all** of these hold:

1. The implementation actually satisfies the SPEC section it's mapped to (per the Phase 2
   traceability table).
2. Applicable tests were created or updated in the same slice — not deferred to "later".
3. All new tests pass.
4. All affected existing tests still pass (run the whole relevant suite, not just the new file).
5. `npx tsc --noEmit -p tsconfig.json` passes with no errors.
6. No relevant regression remains (re-run the full suite after any late fix, don't just eyeball
   the diff).
7. The implementation is wired into the real runtime path — a pure function with a passing unit
   test is not "Done" for a task whose requirement is end-to-end behavior; it's `Partially Done`
   until something in the real request/workflow path actually calls it.

## What is NOT sufficient evidence on its own

Do not accept any of the following as proof a task is complete, even if they pass:

- **Typecheck only** — `tsc --noEmit` passing proves types line up, not that the logic is correct
  or wired in.
- **Build only** — a successful `medusa build` proves the code compiles into the bundle, nothing
  about runtime correctness.
- **Mocked pure-function tests for a persistence requirement** — if the task requires reading a
  real DB row (e.g. `VoucherConfig.applicable_product_ids`), a test that hand-builds the scope
  object in memory does not prove the persisted-data path works. Require at least one
  module-integration or HTTP-integration test against a real seeded row for persistence-shaped
  tasks.
- **A workflow step that is never called** — a step file with its own passing unit test, but no
  workflow composes it and no route/subscriber triggers that workflow, is not evidence the feature
  works.
- **A test that passes only when run alone** — if a suite is flaky in a batch run (e.g. a
  teardown race), do not just note it and move on; either fix the root cause or apply a scoped,
  documented mitigation (see below) — never silently rely on "it passes in isolation".
- **`jest.retryTimes` without documenting the underlying infrastructure issue** — a retry is
  acceptable only as a mitigation for a _documented, understood_ infra race (e.g. a Redis-teardown
  timing issue during `--forceExit`), with a comment explaining why the retry cannot mask a real
  regression (the assertion would still fail identically on every retry attempt). A bare retry with
  no comment, added just to make CI green, is not acceptable.

## Verification pass (Phase 8)

Run, and report the actual results of, everything relevant to the slice just implemented:

- Focused unit tests for the new/changed files, then the full unit suite.
- Module-integration tests for any changed model/service/migration.
- Full-app/HTTP integration tests for any changed workflow, route, subscriber, or cross-module
  behavior (Cart, Promotion, Redis).
- `npx tsc --noEmit -p tsconfig.json`.
- `pnpm --filter @dtc/backend lint` (or the repo's equivalent lint script).
- `pnpm --filter @dtc/backend build`.
- Migration commands (`npx medusa db:generate <module>` then `npx medusa db:migrate`) whenever a
  model changed.
- Seed commands (`npx medusa exec ./src/scripts/<file>.ts`) when the slice touches seed data —
  run twice to confirm idempotency.

Run related tests together (e.g. the full unit suite after a `lib/` change, not just the one
spec file) so a regression in a neighboring test isn't missed.

**Never hide:** skipped tests, retries, flaky tests, warnings, isolated-only passes, or destructive
migration behavior. If something is flaky, name it, explain the root cause if known, and say
explicitly whether it was fixed, mitigated, or left open. If a migration would be destructive
(dropping/altering a column with data), say so explicitly before running it and prefer an additive
migration unless the user has approved a destructive one.
