# Storefront conventions (`apps/storefront/`)

Applies when working under this directory. Repo-wide rules live in the git-root `AGENTS.md`
(two levels up); do not restate them here.

## SDK access

- Call the Medusa SDK **only** from `src/lib/data/*` (`"use server"`).
- Use the single shared `sdk` instance in `src/lib/config.ts` — never construct a second client.

## Layout

- Path aliases `@lib/*`, `@modules/*`, `@pages/*` (baseUrl `./src`).
- Routes under `src/app/[countryCode]/`; page `params` are Promises; prefer `generateStaticParams`.
- Feature folders `src/modules/<feature>/` split into `components/` (leaf UI) and `templates/`
  (page composition).
- Styling: Tailwind + `@medusajs/ui-preset`; merge classes with `clsx`.

## Pricing

Never compute a price, discount, or total on the client. The cart total returned by the backend is
the only pricing truth — render it, do not recalculate it. See git-root `AGENTS.md` § Project notes.

## Dev server

Runs on port **8008**.
