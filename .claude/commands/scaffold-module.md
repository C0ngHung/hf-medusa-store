---
description: Scaffold a new Medusa backend module from the suggestive-selling template
argument-hint: <module-name-kebab> [first-model-snake_case]
allowed-tools: Read, Write, Edit, Bash(ls:*), Bash(find:*), Grep
---
Scaffold a new custom Medusa module named `$ARGUMENTS` under
`hf-medusa-store/apps/backend/src/modules/`, following the canonical
`suggestive-selling` shape (see `.claude/rules/project-conventions.md`).

Parse `$ARGUMENTS`: the first token is the kebab-case module folder name; an
optional second token is the first model's snake_case name (default: singular of
the module name).

Steps:
1. Create `src/modules/<name>/index.ts` — export a `<UPPER_SNAKE>_MODULE` constant
   (value = camelCase module key) and `export default Module(<CONST>, { service })`.
2. Create `src/modules/<name>/service.ts` — default-export a class extending
   `MedusaService({ ...models })`. Add a doc comment citing the relevant SRS section.
3. Create `src/modules/<name>/models/<model>.ts` — `model.define('<snake_case>', …)`,
   one model per file. Cross-module references MUST be plain `model.text()` id fields
   (NOT DB foreign keys) — wire them later via the Link Module with `defineLink(… readOnly: true)`.
4. Register the module in `hf-medusa-store/apps/backend/medusa-config.ts` under the
   `// ── Custom domain modules ──` section: `{ resolve: './src/modules/<name>' }`.
5. Do NOT run migrations. Instead, tell the user to generate them:
   `cd hf-medusa-store && npx medusa db:generate <ModuleKey>` then `npx medusa db:migrate`.

Match the existing code style exactly (import paths, comment density citing SRS/spec
IDs). After writing, print a short summary of files created and the follow-up commands.
