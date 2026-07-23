# A custom error class thrown inside a workflow step loses `instanceof` identity by the time it's caught at the route — duck-type on shape instead

## Problem

`checkActiveVoucherStep` throws `throwVoucherError("VOUCHER_REPLACE_REQUIRED", ...)`, which
constructs and throws a `new VoucherValidationError(...)` (a class extending `MedusaError`, carrying
`code`/`http_status`/`customer_message`/`details`). The store route's `catch` block calls
`toErrorEnvelope(err, req.requestId)`, whose first line was `if (err instanceof
VoucherValidationError)`. This check evaluated `false` at the route, so every business error (409
replace-required, etc.) fell through to the generic 500 `INTERNAL_ERROR` response instead of the
correct status/code/customer message — even though debug logging showed the caught object had
EVERY expected field correct, including `name: "VoucherValidationError"` and a stack trace showing
it really was constructed by that exact class.

## Incorrect assumption or failed approach

Assumed a thrown `Error` subclass keeps its prototype chain intact as it propagates up through
Medusa's workflow step → `TransactionOrchestrator` → `LocalWorkflow` → route `.catch()` call chain,
the same way it would through a plain synchronous JS call stack. Initially suspected the route's
`unwrapWorkflowError()` helper (added to unwrap a `{ cause }`/`{ errors: [...] }` wrapper some
Medusa workflow failures use) was unwrapping to the wrong nested value, and spent time adjusting
that helper before checking the actual object shape landing at `toErrorEnvelope`.

## Root cause

Medusa's workflow orchestration layer (`TransactionOrchestrator`/`DistributedTransaction`) does not
guarantee that an error thrown inside a `createStep` handler keeps its exact class/prototype by the
time it surfaces to the workflow's `.run()` caller — the object that arrives has all the same OWN
enumerable properties (`code`, `http_status`, `customer_message`, `details`, `name`,
`__isMedusaError`, `stack`) but fails `instanceof OriginalClass` at the call site. (The precise
mechanism — whether it's a structured-clone-style rehydration, a plain-object copy preserving
`name`/message, or something else in the orchestrator's error-collection path — was not traced to an
exact line of framework source this session; the fix does not depend on knowing the exact
mechanism, only on the empirically-confirmed fact that `instanceof` cannot be trusted at this
boundary.)

## Verified evidence

Added temporary debug logging at both the throw site (`check-active-voucher.ts`) and the catch site
(`route.ts`), ran the failing 409-replace HTTP integration test, and confirmed via the logged JSON
that the caught object had `code: "VOUCHER_REPLACE_REQUIRED"`, `http_status: 409`,
`customer_message`, `details: {}`, `type: "conflict"`, `__isMedusaError: true`, and a stack trace
proving it was constructed by `new VoucherValidationError` inside `throwVoucherError` — yet
`err instanceof VoucherValidationError` was `false` in `toErrorEnvelope`. After replacing the
`instanceof` check with a duck-typed shape check (`typeof err.code === "string" && typeof
err.http_status === "number" && typeof err.customer_message === "string"`), the same test correctly
returned `409` with the right envelope, and remained correct across a second full test run.

## Resolution

`toErrorEnvelope` (`apps/backend/src/workflows/voucher-engine/lib/errors.ts`) now checks `err
instanceof VoucherValidationError || isVoucherErrorLike(err)`, where `isVoucherErrorLike` is a
duck-type guard on the three fields above. This keeps the `instanceof` check too (cheap, and
correct for errors caught WITHOUT crossing a workflow-step boundary, e.g. in a unit test calling the
pure function directly) but no longer depends on it as the only path. Also added
`fillPlaceholders()` so `customer_message` templates like `"Bạn đang dùng mã {current_code}..."`
are filled from `details` before being sent to the customer — a related, previously-unfixed gap
found while re-reading this function (the raw `{current_code}` placeholder was being sent to
customers verbatim).

## Prevention rule

Never gate a route/workflow-boundary error handler purely on `instanceof CustomErrorClass` for an
error that may have been thrown from inside a `createStep` handler and propagated through
`workflow.run()` — always also (or instead) duck-type on the error's own distinguishing fields
(a `code` that's a member of your known error-code catalog, plus whatever fields your envelope
needs). `instanceof` remains safe for errors caught in the SAME synchronous call frame that threw
them (e.g. a unit test calling a pure function directly), just not across a workflow step boundary.

## Applicability

Applies to: any custom `MedusaError` subclass thrown from inside a `createStep` handler in this
repo (VoucherEngine's `VoucherValidationError`, and any future custom error class used the same way
in SuggestiveSelling or elsewhere) whose `instanceof` identity needs to survive to a route's
top-level `catch`. Does not apply to errors constructed and caught without crossing a workflow-run
boundary (e.g. thrown and caught inside the same step, or inside a pure function under a unit test).

## Related task IDs

3.4.6, 3.4.7 (replace-confirmation 409 contract), 3.4.9 (error envelope must be correct per code).

## Related SPEC sections

§8.3 (error envelope shape), §8.4 (Day-4 error codes), §12.5 (never leak raw exception text to the
customer — the generic-500 fallback path is unaffected by this fix). No SPEC text changed — this is
an implementation-detail correction in the route-boundary error mapper.

## Relevant production and test files

- `apps/backend/src/workflows/voucher-engine/lib/errors.ts` (`isVoucherErrorLike` +
  `fillPlaceholders`, both added to `toErrorEnvelope`).
- `apps/backend/src/api/store/carts/[id]/voucher/route.ts` (`unwrapWorkflowError` helper — kept
  alongside the duck-type fix as a first-pass unwrap for the `{ cause }`/`{ errors: [...] }` wrapper
  shape some workflow failures use; harmless no-op when the caught error is already flat).
- `apps/backend/integration-tests/http/apply-remove-voucher.spec.ts` ("returns 409
  VOUCHER_REPLACE_REQUIRED..." test — the one that surfaced and then confirmed the fix).

## Revision history

- 2026-07-14: initial lesson captured while implementing Thức's VoucherEngine Day 4 tasks, after
  the duck-typing fix was verified against a real failing-then-passing HTTP integration test.
