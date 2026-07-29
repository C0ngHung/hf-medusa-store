# Storefront conventions (`apps/storefront/src/`)

Moved here from `.claude/rules/coding.md` and `.claude/rules/project-conventions.md` — loads only
when working under this directory. See the repo-root `AGENTS.md`/`CLAUDE.md` for rules that apply
everywhere.

- Path aliases `@lib/*`, `@modules/*`, `@pages/*` (baseUrl `./src`).
- Call the Medusa SDK ONLY from `src/lib/data/*` (`"use server"`); use the single shared `sdk`
  instance in `src/lib/config.ts` — never create a second client.
- Routes under `src/app/[countryCode]/`; page `params` are Promises; prefer `generateStaticParams`.
- Feature folders `src/modules/<feature>/` split into `components/` (leaf UI) and `templates/`
  (page composition). Styling: Tailwind + `@medusajs/ui-preset`; merge classes with `clsx`.
- Storefront dev server runs on port **8008**.
