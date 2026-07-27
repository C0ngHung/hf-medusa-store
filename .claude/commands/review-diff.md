---
description: Review the uncommitted working diff, classified by severity
argument-hint: [optional path to narrow the review; empty = whole working diff]
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git status:*)
---

# Review working diff

Use this for **uncommitted work in progress**. For a GitHub pull request use `/review-pr`
instead.

## Scope

$ARGUMENTS

If the line above is empty, review the whole uncommitted diff:

!`git diff HEAD`

## How to review

Report real problems only. Skip anything Prettier or ESLint already handles — a
`PostToolUse` hook formats every edited file automatically, so style nits are noise here.
Do not invent findings to look thorough.

Check against this repo's rules in `AGENTS.md` and `.claude/rules/`, paying particular
attention to:

- **Money** (`coding.md`): integers only, `1 = 1 VND`, `Math.floor` rounding, discount order
  is item promotion → voucher → 50% cap, and the cap reduces the voucher only.
- **Pricing authority** (`security.md`): discounts computed server-side; never trust a
  client-supplied total; recompute from cart data on every mutation.
- **Audit** (`security.md`): `voucher_usage_log` is append-only; `usage_count` increments
  atomically and only on a placed order, never on cart apply.
- **Module shape** (`medusa.md`): cross-module refs are `model.text()` ids wired via the
  Link Module — never a DB foreign key.
- **Correctness**: logic errors, unhandled edge cases, missing error handling, race
  conditions.

## Severity

- 🔴 **Blocker** — bug, security hole, data loss, race condition, money computed wrong
- 🟡 **Should fix** — performance, unhandled edge case, missing error handling
- 🔵 **Nit** — nice to have

## Format

One line per issue: `path/to/file.ts:42` → what is wrong → the concrete fix.

If the diff is fine, say so directly.
