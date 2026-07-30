---
name: bugfix
description: >-
  Use this skill when the user asks to fix a known bug in this repository — a failing test, a
  wrong result, an error with an identified symptom. It enforces root-cause-before-edit, a
  minimal diff, and a mandatory regression test. Use the debug skill instead when the cause is
  still unknown.
when_to_use: "When the user reports a bug whose location or cause is already identified and asks for a fix."
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# Bug fix

Follow this order. Do not skip step 2.

## 1. Context

Locate the exact file(s) and function(s) involved. Read the code before concluding anything.
If repro steps, a stack trace, or the failing input are missing, ask for them rather than
guessing.

## 2. Root cause — before editing anything

State the root cause in 2-3 sentences **before** changing a single line. If you are not
certain, say so plainly and propose the cheapest way to confirm it. A fix built on a guess is
worse than no fix.

## 3. Constraints

- Change only the function/file that causes the bug. No opportunistic refactoring.
- Do not change a public API or an exported function signature.
- Do not add a dependency.
- Keep the diff minimal.
- Money: integers only (`1 = 1 VND`), `Math.floor` rounding. The full rule — discount order and
  the global cap — is in `AGENTS.md` § Project notes.
- All other project constraints live in `AGENTS.md`.

## 4. Success criteria

- [ ] The bug no longer reproduces via the original repro steps
- [ ] The existing suite still passes — test commands and file naming are in
      `apps/backend/AGENTS.md` § Tests. Run the integration suites too if the change touches a
      module service or an endpoint.
- [ ] A regression test covering exactly this case exists, named per that same section
- [ ] `pnpm lint` is clean, run from the inner `hf-medusa-store/` workspace root
- [ ] No test was edited to make it pass — the code was fixed instead

## 5. Report

List each file changed and why. Paste the test output as evidence, per
`docs/team/CONTRIBUTING.md` § Evidence.
