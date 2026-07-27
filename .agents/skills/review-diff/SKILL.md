---
name: review-diff
description: >-
  Use this skill when the user asks for a review of uncommitted work in this repository — "review
  my changes", "check this diff before I commit". It reviews the working diff against the repo's
  money, pricing-authority, audit, and module-shape rules and reports findings by severity.
---

# Review the working diff

For uncommitted work in progress. A GitHub pull request is a different job.

## Scope

Run `git diff HEAD` from the repository root. If the user named a path, narrow to it.

## How to review

Report real problems only. Skip anything Prettier or ESLint already handles — style nits are
noise here. Do not invent findings to look thorough.

Check against `AGENTS.md`, paying particular attention to:

- **Money**: integers only, `1 = 1 VND`, `Math.floor` rounding, discount order is item
  promotion → voucher → global 50% cap, and the cap reduces the voucher only.
- **Pricing authority**: discounts computed server-side; never trust a client-supplied total;
  recompute from authoritative cart data on every mutation.
- **Audit**: `voucher_usage_log` is append-only; `usage_count` increments atomically and only on
  a placed order, never on cart apply.
- **Module shape**: cross-module refs are `model.text()` ids wired via the Link Module — never a
  DB foreign key.
- **Correctness**: logic errors, unhandled edge cases, missing error handling, race conditions.

## Severity

- **Blocker** — bug, security hole, data loss, race condition, money computed wrong
- **Should fix** — performance, unhandled edge case, missing error handling
- **Nit** — nice to have

## Format

One line per issue: `path/to/file.ts:42` → what is wrong → the concrete fix.

If the diff is fine, say so directly.
