# Backend conventions (`apps/backend/`)

Applies when working under this directory. Repo-wide rules live in the git-root `AGENTS.md`
(two levels up); do not restate them here.

## Module shape

**`src/modules/suggestive-selling/` is the canonical template** for new modules — copy its shape:

- `index.ts` exports a `<THING>_MODULE` constant + default `Module(...)`.
- `service.ts` default-exports a class extending `MedusaService({ ...models })`.
- Models: `model.define('snake_case', …)`, one per file. Store cross-module references as plain
  `model.text()` id fields wired via the **Link Module** (`defineLink(… readOnly: true)`), never a
  database foreign key.
- Register the module in `medusa-config.ts` (`{ resolve: './src/modules/<name>' }`).

Most of `api/`, `workflows/`, `subscribers/`, `jobs/` are still starter stubs. When adding real code
there, follow the canonical module template above rather than inventing a second style.

## Scripts

Seed/exec scripts live in `src/scripts/`, default-export `async ({ container }: ExecArgs)`, must be
idempotent, and run via `npx medusa exec ./src/scripts/<file>.ts`.

## API routes (`src/api/`)

- The agreed request/response shapes are in `docs/API_CONTRACT_Suggestive_Voucher_Cart.md`. Read it
  before adding or changing an endpoint; do not invent a second shape.
- Validate input at the route boundary, then delegate — a route handler stays glue, business logic
  lives in the module service.
- **Reject any monetary field sent by the client** (price, discount, total). Recompute from
  authoritative cart data. See git-root `AGENTS.md` § Project notes.

## Tests

- Unit tests: `*.unit.spec.ts` inside a `__tests__/` folder next to the code under test.
- HTTP tests: `integration-tests/http/`.
- Run from this directory: `pnpm test:unit`, `pnpm test:integration:modules`,
  `pnpm test:integration:http`. Never invoke jest directly — these scripts set `TEST_TYPE`.

## Traceability

Code comments cite the SRS spec section they implement, e.g. `// SUGG-001 §5.1`.
