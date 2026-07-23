# `medusaIntegrationTestRunner` binds the same `PORT` as the dev server — HTTP integration tests fail with `EADDRINUSE` unless the dev server is stopped first

## Problem

Running `pnpm test:integration:http` for `revalidate-voucher-workflow.spec.ts` (a pre-existing,
previously-passing test) failed with `TypeError: Cannot read properties of null (reading 'resolve')`
inside `@medusajs/test-utils`'s `waitWorkflowExecutions`, and on retry with `listen EADDRINUSE:
address already in use :::9009`.

## Incorrect assumption or failed approach

The first failure (before diagnosing the port) looked like it might be a real regression in the
test or the workflow — worth investigating the test harness internals before checking anything
about the local environment.

## Root cause

The backend dev server (`pnpm backend:dev`) was already running in the background (started by a
prior session) and bound to `PORT=9009` from `apps/backend/.env`.
`medusaIntegrationTestRunner` (`@medusajs/test-utils`) boots a **second** full Medusa app instance
for the test suite using the **same** `.env`-configured port — there is no dedicated test port
override in this repo (no `.env.test`). The dev server's process wins the bind, and the test
runner's `bootstrap-app.ts` throws `EADDRINUSE`; the app instance for that suite never starts, so
container-dependent teardown (`waitWorkflowExecutions`) fails against a `null` container.

## Verified evidence

- `lsof -i :9009` showed the dev server's PID bound to the port before the test run.
- Stopping it (`kill <pid>`) made the identical `pnpm test:integration:http -- <spec>` invocation
  pass cleanly (2/2, then 3/3 for a different spec) on the next attempt.
- A leftover jest-managed app instance from a prior run can also occupy the port between test
  invocations (observed once mid-session) — `lsof -i :9009` before each HTTP-integration run
  catches this too, not just the dev server itself.

## Resolution

No code change. Stop whatever is bound to the backend's configured port (`lsof -i :9009` → `kill
<pid>`) before running `pnpm test:integration:http`, and restart the dev server afterward
(`pnpm backend:dev`, backgrounded) if it was running for other purposes (e.g. a live browser
verification session). `test:integration:modules` and `test:unit` are unaffected — they don't boot
an HTTP listener.

## Prevention rule

Before running `pnpm test:integration:http` (or any `medusaIntegrationTestRunner`-based spec) in a
session where a dev server might already be up, check `lsof -i :<PORT from .env>` first. If
occupied, stop it, run the tests, and restart it afterward rather than assuming a test failure is a
real regression — the error shapes (`Cannot read properties of null (reading 'resolve')`,
`EADDRINUSE`) are the signature of this specific conflict, not a workflow/assertion bug.

## Applicability

Applies to any future session running `test:integration:http` in this repo while a backend dev
server (or another leftover test app instance) may be bound to the same port — not specific to
VoucherEngine, but discovered while verifying Day 5 Slice 3 (tasks `4.1.8`, `4.3.6`–`4.3.8`).

## Related task IDs

4.1.8, 4.3.6, 4.3.7, 4.3.8 (discovered while verifying these; applies to any HTTP-integration run)

## Related SPEC sections

None — this is a local test-environment/tooling finding, not a SPEC or business-logic conflict.

## Relevant production and test files

- `hf-medusa-store/apps/backend/.env` (`PORT=9009`, shared by dev server and test runner)
- `hf-medusa-store/apps/backend/integration-tests/http/*.spec.ts` (any `medusaIntegrationTestRunner`-based spec)
