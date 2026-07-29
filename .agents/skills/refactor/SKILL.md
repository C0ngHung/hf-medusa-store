---
name: refactor
description: >-
  Use this skill when the user asks to restructure, clean up, extract, or simplify existing code
  in this repository without changing what it does. It requires characterisation tests first,
  green tests after every step, and forbids bundling in bug fixes or new features.
---

# Refactor

## The one rule

This is a **refactor**, not a rewrite. Externally observable behaviour stays identical. If you
find a bug along the way, log it and keep going — fixing it here makes the diff impossible to
review. Fix it separately with the `bugfix` skill.

## 1. Before touching anything

- Read the current code and describe what it does today.
- Check test coverage. If the target is not covered, write tests for the **current** behaviour
  first, get them green, and only then refactor.
- List the refactor steps in order. Each step must be a small, independent change.

## 2. Constraints

- No public API changes, no exported signature changes.
- No new features bundled in.
- Tests stay green after **every** step, not just at the end.
- Stay inside the scope the user named. Do not touch anything else.
- The `StackingEngine` must remain a pure function with no I/O. Its unit tests match SRS
  fixtures to the VND; if those numbers move, the refactor is wrong.
- Do not add a dependency.

## 3. Success criteria

- [ ] Full suite passes, and **no test was edited** to make it pass — from
      `hf-medusa-store/apps/backend/`: `pnpm test:unit`, plus
      `pnpm test:integration:modules` / `pnpm test:integration:http` where relevant
- [ ] `pnpm lint` and `pnpm build` clean from the inner `hf-medusa-store/` workspace root
- [ ] No externally observable behaviour changed
- [ ] State concretely what improved — "shorter" is not an answer; "removed the duplicated cap
      calculation that existed in 3 places" is
