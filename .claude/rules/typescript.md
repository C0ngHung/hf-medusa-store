---
paths:
  - "**/src/**/*.{ts,tsx}"
---

# TypeScript rules

Elaborates on [coding.md](./coding.md), which holds the non-negotiable money and traceability
rules and is always loaded. This file only loads when a matching source file is read.

## Typing

- **No new `any`.** Use `unknown` and narrow it. Roughly 50 existing backend files still use
  `: any` — that is legacy. Do not mass-migrate them; just do not add more.
- No `as` cast without a comment saying why the compiler cannot infer it.
- Export the types and interfaces that form a module's public API.
- `async` functions must handle errors explicitly. Never swallow an exception into an empty
  `catch`.

## Strictness differs per app

`apps/storefront/tsconfig.json` sets `"strict": true`. `apps/backend/tsconfig.json` does
**not**. Backend code therefore cannot rely on strict-null inference to catch a missing
`undefined` check — write the check.

## Money

Monetary values are integers (`1 = 1 VND`) and round with `Math.floor`. Never `number`
arithmetic that can produce a float, and never a client-supplied total. Full rules in
[coding.md](./coding.md) and [security.md](./security.md).
