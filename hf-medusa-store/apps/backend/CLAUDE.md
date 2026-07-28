# Backend conventions (`apps/backend/src/`)

Moved here from `.claude/rules/project-conventions.md` — loads only when working under this
directory. See the repo-root `AGENTS.md`/`CLAUDE.md` and `.claude/rules/medusa.md` for rules that
apply more broadly.

- **`src/modules/suggestive-selling/` is the canonical template** for new modules — copy its shape:
  - `index.ts` exports a `<THING>_MODULE` constant + default `Module(...)`.
  - `service.ts` default-exports a class extending `MedusaService({ ...models })`.
  - Models: `model.define('snake_case', …)`, one per file; store cross-module references as plain
    `model.text()` id fields wired via the **Link Module** (`defineLink(… readOnly: true)`), NOT DB
    foreign keys.
  - Register the module in `apps/backend/medusa-config.ts` (`{ resolve: './src/modules/<name>' }`).
- Seed/exec scripts live in `src/scripts/`, default-export `async ({ container }: ExecArgs)`, must
  be idempotent, run via `npx medusa exec ./src/scripts/<file>.ts`.
- Code comments cite the SRS spec section they implement (e.g. `SUGG-001`, "SRS §5.1").
- Most of `api/`, `workflows/`, `subscribers/`, `jobs/` are still starter stubs — when adding real
  code, follow the medusa-dev plugin's guidance.

Testing conventions live in `.claude/rules/testing.md` (loads automatically for test files).
