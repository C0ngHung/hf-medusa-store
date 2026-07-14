# Batched full-app integration tests intermittently fail on Redis/BullMQ teardown — `jest.retryTimes` is a mitigation, not a fix

## Problem

`integration-tests/http/voucher-engine-resolve-workflow.spec.ts` (a full-app-boot
`medusaIntegrationTestRunner` suite with 6 tests) intermittently failed exactly one test —
consistently the same one, "V6 no eligible items…" — only when all 6 tests ran together in a
single batch. The same test passed every time when run in isolation. The failure was
`Unhandled error. (Error: Connection is closed.)` surfaced by `ioredis`/`bullmq`, not an assertion
failure.

## Incorrect assumption or failed approach

Initially treated as a possible real intermittent defect in the workflow under test (since it was
the same test failing repeatedly) before the error message and isolation-passes-every-time pattern
were checked. The natural first suspicion for "same test fails in batch, passes alone" is shared
test state or an ordering-dependent bug in the code under test — that was ruled out only after
reproducing the exact same error message across three consecutive batch runs and confirming zero
assertion-content difference between the passing (isolated) and failing (batched) runs.

## Root cause

Jest's `--forceExit` teardown races with `ioredis`/`bullmq` connection teardown when multiple
heavy full-app (`medusaIntegrationTestRunner`) tests run sequentially in the same file/process —
each full-app boot brings up Medusa's workflow-engine-Redis connection, and tearing one down while
the next test's boot is starting (or during Jest's forced exit at the very end) occasionally races
with an in-flight Redis operation, producing an unhandled connection-closed error that Jest surfaces
as a test failure even though no assertion in that test actually failed.

## Verified evidence

Reproduced 3 consecutive batch runs of the full 6-test file: the identical error, on the identical
test, each time it failed (not a random test) — and the identical test passing every time when
filtered to run alone. After applying the mitigation below, the full batch was re-run 3 times
consecutively with `Tests: 6 passed, 6 total` every time (previously roughly 1-in-2 batch runs
failed). This is enough to establish the race as an infra/teardown-timing issue rather than a
content-of-assertion bug, but it is an empirical pattern-match, not a confirmed single line of
framework source proving the exact race window.

## Resolution

Added `jest.retryTimes(2)` to the top of the spec file, with an inline comment explaining it's a
documented infra-race mitigation (not masking a real regression, since a genuinely broken assertion
would fail identically on every retry attempt, not intermittently). This is currently the only
mitigation in place — the root _timing_ race itself (Redis/BullMQ teardown vs. sequential full-app
boots in one process) has not been eliminated, only absorbed by retrying.

## Prevention rule

**`jest.retryTimes` here is a temporary, documented mitigation — not a resolved root cause.** Do not
extend this pattern silently to new flaky tests without the same explicit inline justification
(why it's an infra race, why a real regression would still fail identically on retry). If Day 4/5
adds more heavy full-app integration tests to this same file/suite and the flake rate increases,
the next step is to **split heavy workflow tests across multiple spec files** (each gets its own
`medusaIntegrationTestRunner` boot/teardown in isolation) rather than adding more retries — retries
scale badly (they hide an increasing race probability instead of removing it) while file-splitting
actually reduces the number of sequential Redis teardown/boot transitions sharing one process.

## Applicability

Applies to: any `integration-tests/http/*.spec.ts` file containing multiple
`medusaIntegrationTestRunner`-boot test cases run sequentially in one Jest process/file, especially
once Redis-backed modules (workflow engine, event bus, cache) are active (`REDIS_URL` set). Does
not apply to `test:unit` or `test:integration:modules` suites, which don't boot the full app or its
Redis-backed workflow engine.

**New manifestation (Day 4 session, confirmed with 2 files):** the same underlying race also
surfaces ACROSS separate spec files sharing one `pnpm test:integration:http` invocation (that
script runs plain `jest --runInBand`, i.e. every `integration-tests/http/*.spec.ts` file boots
sequentially in the SAME Node process, one full `medusaIntegrationTestRunner` app per file). With
`apply-remove-voucher.spec.ts` (new, Day 4) added alongside the pre-existing
`voucher-engine-resolve-workflow.spec.ts`, running the full `pnpm test:integration:http` twice
back-to-back failed a DIFFERENT one of the two files each time — always at `beforeAll`/app-boot
(`MedusaTestRunner.setupApplication` → `MedusaApp_` → `loadModules` → `bootstrapAll`), with the
error `Loaders for module <Fulfillment|Notification> failed: Method Map.prototype.set called on
incompatible receiver #<Map>` (not the `ioredis`/`bullmq` "Connection is closed" error the
within-file race produces, but the same class: two sequential full Medusa app boots in one Node
process corrupting shared module-registry state). `jest.retryTimes(2)` does NOT help this
manifestation — the failure is in `beforeAll` app bootstrap, not an individual `it()`, so Jest's
retry-per-test mechanism never gets a chance to re-run it. **Verified each file passes reliably
100% of the time run alone** (`apply-remove-voucher.spec.ts` 5/5 twice, `voucher-engine-resolve-workflow.spec.ts`
6/6 once) — this confirms the flake is purely a multi-boot-in-one-process infra issue, not a
regression in either file's business logic. No fix was applied this session (out of scope for the
VoucherEngine business logic); if this flake rate keeps climbing as Day 5+ adds more heavy
full-app HTTP spec files, the real fix is to give each `integration-tests/http/*.spec.ts` file
(or small groups) its own Jest **process** (e.g. `jest --projects`/per-file `testPathPattern`
CI matrix), not more `jest.retryTimes`.

## Related task IDs

Introduced under the Day 2–3 integration/re-verification session (`resolveVoucherDiscountWorkflow`
integration tests); relevant again for Day 4/5 (`applyVoucherWorkflow`, `revalidateVoucherWorkflow`,
`recordVoucherUsageWorkflow`) once those add their own full-app integration tests to the same or
adjacent files.

## Related SPEC sections

§16.3 (HTTP integration test plan), §16.6 (Redis-fallback tests). No SPEC text changed — this is a
test-infrastructure finding, not a business-rule or contract change.

## Relevant production and test files

- `apps/backend/integration-tests/http/voucher-engine-resolve-workflow.spec.ts` (the
  `jest.retryTimes(2)` mitigation + explanatory comment).

## Revision history

- 2026-07-14: initial lesson captured from the VoucherEngine progress file's 2026-07-14 (session 2)
  entry ("Flaky test fixed: Redis-teardown race in the batched `integration:http` run"), preserving
  that session's own explicit caveat that the mitigation is not a root-cause fix.
- 2026-07-14 (Day 4 session): added the cross-file manifestation above after
  `apply-remove-voucher.spec.ts` (tasks 3.4.x/3.5.x) became the second heavy full-app-boot HTTP
  spec file in this repo — confirms the lesson's own predicted risk ("if Day 4/5 adds more heavy
  full-app integration tests... the flake rate increases") and extends the root-cause description
  since `jest.retryTimes` cannot mitigate a `beforeAll`-level failure.
