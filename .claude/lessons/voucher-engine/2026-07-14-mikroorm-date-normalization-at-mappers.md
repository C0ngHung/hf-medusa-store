# MikroORM read methods return `Date`-typed model fields as ISO strings at runtime — normalize at the mapper boundary

## Problem

`toVoucherSnapshot` (the mapper that converts a persisted `VoucherConfig` row into the
`VoucherSnapshot` shape the pure V1–V8 validation chain consumes) called `.getTime()` on
`voucher.valid_from`/`voucher.valid_to` (part of the V2 date-window check) and threw
`voucher.valid_from.getTime is not a function` at runtime, despite the TypeScript model type
declaring both fields as `Date`.

## Incorrect assumption or failed approach

The type declaration was trusted at face value: `models/voucher-config.ts` declares
`valid_from`/`valid_to` as `model.dateTime()`, and the generated TypeScript types for
`VoucherEngineService`'s auto-generated `list*`/`retrieve*` methods type these fields as `Date`.
The mapper code was written assuming a real `Date` instance would always be present, with no
runtime normalization — a reasonable assumption from the types alone, but the types describe the
declared schema, not what MikroORM's query layer actually returns for this ORM/driver combination.

## Root cause

MikroORM's generated read methods return `dateTime()` fields as **ISO date strings** at runtime,
not `Date` instances, despite the TypeScript type surface saying `Date`. This is a
types-vs-runtime mismatch in the ORM layer itself, not a bug in this module's code — it will not
be caught by `tsc --noEmit` (the types are simply wrong about the runtime shape), only by actually
exercising the read path (an integration test against a real DB row, or production traffic).

## Verified evidence

Caught by a real-DB integration test exercising `toVoucherSnapshot` against an actual persisted
`VoucherConfig` row (not a hand-built in-memory fixture, which would have used a real `Date` object
and hidden the bug) — the test failed with `voucher.valid_from.getTime is not a function` before
the fix, confirming the runtime value was a string, not a `Date`.

## Resolution

`toVoucherSnapshot` (`apps/backend/src/workflows/voucher-engine/lib/mappers.ts`) normalizes
`valid_from`/`valid_to` via `new Date(voucher.valid_from)` / `new Date(voucher.valid_to)` before
handing them to the pure validation chain, regardless of whether the incoming value is already a
`Date` or a string (`new Date(existingDate)` is a safe no-op-equivalent re-wrap).

## Prevention rule

Never trust a MikroORM-model TypeScript field type as proof of the runtime shape for date/time
fields specifically — always normalize `dateTime()`-typed fields through `new Date(value)` at the
boundary where a persisted row is mapped into a plain DTO/snapshot for a pure function to consume,
even when the TS type says `Date`. Prove any new mapper's date handling with a real-DB integration
test (not just a hand-built fixture using a literal `Date` object), since a fixture that already
uses a `Date` instance cannot exercise this bug.

## Applicability

Applies to: any mapper in this module (or a future module following the same pattern) that reads a
`model.dateTime()` field off a `VoucherEngineService`-generated read method and passes it to code
expecting a `Date` (e.g. calling `.getTime()`, `.toISOString()`, or comparing with `<`/`>` against
another `Date`). Does not apply to fields already passed through as opaque strings (e.g.
`currency_code`, `voucher_code`) — only to values a consumer will call `Date`-instance methods on.

## Related task IDs

3.2.5 (V2 date-window validation) and the Day 2/3 integration session that introduced
`toVoucherSnapshot`/`toCartSnapshot`/`toVoucherScope` (`lib/mappers.ts`).

## Related SPEC sections

§9.1 (V2 validation stage — `valid_from <= now <= valid_to`). No SPEC text changed — this is an
implementation-level ORM-runtime finding, not a business-rule or contract change.

## Relevant production and test files

- `apps/backend/src/workflows/voucher-engine/lib/mappers.ts` (`toVoucherSnapshot`, the fix).
- The real-DB integration test that caught this (module-integration suite exercising the
  validation chain against a persisted `VoucherConfig` row — see the module's
  `__tests__/service.integration.spec.ts` and the workflow-level integration spec under
  `apps/backend/integration-tests/http/`).

## Revision history

- 2026-07-14: initial lesson captured from the VoucherEngine progress file's Day 2/3 integration
  session entry ("a real bug was caught here").
