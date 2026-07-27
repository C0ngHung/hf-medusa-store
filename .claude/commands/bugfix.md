---
description: Fix a bug — root cause first, minimal diff, regression test required
argument-hint: <bug description or file path>
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git log:*), Edit, Write
---

# Bug fix: $ARGUMENTS

Follow this order. Do not skip step 2.

## 1. Context

Locate the exact file(s) and function(s) involved in `$ARGUMENTS`. Read the code before
concluding anything. If repro steps, a stack trace, or the failing input are missing, ask
for them rather than guessing.

## 2. Root cause — before editing anything

State the root cause in 2-3 sentences **before** changing a single line. If you are not
certain, say so plainly and propose the cheapest way to confirm it. A fix built on a guess
is worse than no fix.

## 3. Constraints

- Change only the function/file that causes the bug. No opportunistic refactoring.
- Do not change a public API or an exported function signature.
- Do not add a dependency.
- Keep the diff minimal.
- Money code: integers only, `Math.floor` rounding — see `.claude/rules/coding.md`.
- All other project constraints live in `AGENTS.md` and `.claude/rules/`.

## 4. Success criteria

- [ ] The bug no longer reproduces via the original repro steps
- [ ] The existing suite still passes — from `hf-medusa-store/apps/backend/`:
      `pnpm test:unit` (plus `pnpm test:integration:modules` / `test:integration:http` if
      the change touches a module service or an endpoint)
- [ ] A regression test covering exactly this case exists, named per
      `.claude/rules/testing.md`: `*.unit.spec.ts` inside a `__tests__/` folder next to the
      code; HTTP tests in `integration-tests/http/`
- [ ] `pnpm lint` is clean (run from the inner `hf-medusa-store/` workspace root)
- [ ] No test was edited to make it pass — the code was fixed instead

## 5. Report

List each file changed and why. Paste the test output as evidence, per
`docs/team/CONTRIBUTING.md` §Evidence.
