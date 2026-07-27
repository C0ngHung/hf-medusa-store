---
description: Refactor safely — behaviour preserved 100%, green after every step
argument-hint: <file or module to refactor>
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(git diff:*), Bash(pnpm test:*), Bash(pnpm lint:*)
---

# Refactor: $ARGUMENTS

## The one rule

This is a **refactor**, not a rewrite. Externally observable behaviour stays identical.
If you find a bug along the way, log it and keep going — fixing it here makes the diff
impossible to review. Fix it separately with `/bugfix`.

## 1. Before touching anything

- Read the current code and describe what it does today.
- Check test coverage. If the target is not covered, write tests for the **current**
  behaviour first, get them green, and only then refactor. Naming per
  `.claude/rules/testing.md`.
- List the refactor steps in order. Each step must be a small, independent change.

## 2. Constraints

- No public API changes, no exported signature changes.
- No new features bundled in.
- Tests stay green after **every** step, not just at the end.
- Stay inside the scope named in `$ARGUMENTS`. Do not touch anything else.
- The `StackingEngine` must remain a pure function with no I/O — see
  `.claude/rules/coding.md`. Its unit tests match SRS fixtures to the VND; if those numbers
  move, the refactor is wrong.
- Do not add a dependency.

## 3. Success criteria

- [ ] Full suite passes, and **no test was edited** to make it pass — from
      `hf-medusa-store/apps/backend/`: `pnpm test:unit`, plus
      `pnpm test:integration:modules` / `test:integration:http` where relevant
- [ ] `pnpm lint` and `pnpm build` clean from the inner `hf-medusa-store/` workspace root
- [ ] No externally observable behaviour changed
- [ ] State concretely what improved — "shorter" is not an answer; "removed the duplicated
      cap calculation that existed in 3 places" is

think harder
