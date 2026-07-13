---
description: Review a GitHub pull request against this repo's conventions
argument-hint: <pr-number-or-url>
allowed-tools: Bash(git:*), Bash(gh pr view:*), Bash(gh pr diff:*), Read, Grep
---
Review pull request `$ARGUMENTS` for the hf-medusa-store repo.

1. Fetch it: `gh pr view $ARGUMENTS` and `gh pr diff $ARGUMENTS` (accepts a PR
   number or full URL). If `$ARGUMENTS` is empty, review the PR for the current branch.
2. Assess the diff against the repo's rules (`.claude/rules/project-conventions.md`
   + `CLAUDE.md`):
   - **Commits/title:** Conventional Commits with scope — `feat(backend):`,
     `fix(storefront):`, `fix(admin):`, `chore:`.
   - **Module conventions (backend):** `model.define('snake_case', …)` one model per
     file; cross-module refs as `model.text()` id fields + Link Module (`defineLink
     … readOnly: true`), NEVER DB foreign keys; code comments cite the SRS spec ID.
   - **Imports/scope:** packages are `@dtc/*`; storefront calls the SDK only from
     `src/lib/data/*`; use path aliases `@lib/*` `@modules/*` `@pages/*`.
   - **Secrets:** no committed `.env`; only `.env.template` / `.env.example`.
   - **Correctness & tests:** logic bugs, missing edge cases, and whether tests
     follow the naming rules (`*.unit.spec.ts` in `__tests__/`, HTTP in
     `integration-tests/http/`).
3. Output findings grouped by severity (Blocker / Should-fix / Nit), each with
   `file:line` and a concrete suggested change. Do NOT push or comment on GitHub
   unless explicitly asked — just report.
