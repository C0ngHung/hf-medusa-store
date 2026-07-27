---
description: Build a new feature — plan and get approval first, then implement
argument-hint: <feature description>
---

# Feature: $ARGUMENTS

## First — is this VoucherEngine work?

If `$ARGUMENTS` is a task from `docs/tasks_grouped.md`, or touches the voucher engine, **stop
and use the dedicated skill instead**: `execute-voucher-engine-tasks` for a task slice, or
`rebuild-voucher-engine` for the Promotion-first rebuild. Those own their own
plan → audit → build → verify → lessons loop against `.claude/specs/voucher-engine/SPEC.md`.
Running this command alongside them produces two competing workflows.

Otherwise, continue.

## Phase 1 — Plan (stop here)

Before writing any code, present:

1. **Context** — which files this touches, and the existing pattern in this codebase the
   feature should follow. For a new backend module that is
   `src/modules/suggestive-selling/`, the canonical template (`.claude/rules/medusa.md`).
   For a new endpoint, prefer the `/new-endpoint` command.
2. **File list** — created vs. modified, with the purpose of each.
3. **Edge cases** — empty state, loading, network failure, permissions, and for anything
   touching carts or vouchers: concurrent mutation, Redis absent (it is optional — see
   `docs/team/REDIS_USAGE.md`), and re-validation on cart change.
4. **Questions** — anything ambiguous. Ask; do not assume.

**Stop and wait for my approval.**

## Phase 2 — Implement (only after approval)

### Constraints

- Follow the existing patterns and conventions; do not introduce a competing style.
- No new dependency without asking first.
- Cite the SRS/spec section each piece implements in a comment, e.g. `// VOUCH-003: global
  cap` (`.claude/rules/coding.md`).
- Money is integer VND with `Math.floor`; discounts are computed server-side only.
- Everything in `AGENTS.md` and `.claude/rules/` applies.

### Success criteria

- [ ] Happy path works
- [ ] Every edge case listed in Phase 1 is handled
- [ ] Error states surface a clear message rather than failing silently
- [ ] Unit tests cover the core logic, named per `.claude/rules/testing.md`
- [ ] From `hf-medusa-store/apps/backend/`: `pnpm test:unit` passes
- [ ] From the inner `hf-medusa-store/`: `pnpm lint` and `pnpm build` are clean
- [ ] No new console warnings
