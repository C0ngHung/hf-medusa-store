# Tech Context

## Core Technologies & Versions

- **Package Manager**: `pnpm 11.8.0` (Node `>=20`) — *Do not use npm or yarn*.
- **Monorepo Manager**: Turborepo (`turbo 2.0.14`).
- **Backend Framework**: MedusaJS 2.16.0 (`@dtc/backend`).
- **Storefront Framework**: Next.js 15 App Router, React 19, Tailwind CSS (`@dtc/storefront`, port 8008).
- **Databases**: PostgreSQL (primary store), Redis (caching & rate-limiting).
- **Payment & External**: Stripe, Postman collections (`postman/`), Bruno API collections (`bruno/`).

## Workspace Commands

Always execute `cd hf-medusa-store` (the inner monorepo root) before running `pnpm` or `turbo` commands.

| Action | Command | Note |
|---|---|---|
| Backend Dev Server | `pnpm backend:dev` | Runs Medusa 2.16 backend |
| Storefront Dev Server | `pnpm storefront:dev` | Next.js server on port 8008 |
| Seed Backend | `pnpm backend:seed` | Seeds database fixtures |
| Build All | `pnpm build` | Turbo build |
| Lint All | `pnpm lint` | ESLint TypeScript check |
| Test All | `pnpm test` | Turbo test execution |

### Backend Test Commands (from `apps/backend/`)

- `pnpm test:unit`: Unit tests (StackingEngine, discount math, workflow steps).
- `pnpm test:integration:http`: HTTP API integration tests.
- `pnpm test:integration:modules`: Medusa module integration tests.

## Development Constraints & Guidelines

- **Commit Conventions**: Conventional Commits with scope — `feat(backend): ...`, `fix(storefront): ...`, `fix(admin): ...`, `chore: ...`.
- **Branching Strategy**: Feature branches off `develop`: `<type>/<kebab-description>`.
- **Environment Variables**: Managed via `.env` (gitignored); templates provided in `.env.template`.
- **Shell Policy**: Use direct `pnpm` execution; do not wrap inside `npx pnpm`.
