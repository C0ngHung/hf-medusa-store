---
name: feature
description: >-
  Use this skill when the user asks to build new functionality in this repository. It requires
  presenting a plan — files, edge cases, open questions — and getting explicit approval before
  any code is written. Not for VoucherEngine task slices, which have their own dedicated
  workflow.
---

# Feature

## First — is this VoucherEngine work?

If the request is a task from `docs/tasks_grouped.md`, or touches the voucher engine, stop and
say so: that work runs through its own plan → audit → build → verify → lessons loop against
`.claude/specs/voucher-engine/SPEC.md`. Running this skill alongside it produces two competing
workflows.

Otherwise, continue.

## Phase 1 — Plan (stop here)

Before writing any code, present:

1. **Context** — which files this touches, and the existing pattern in this codebase the
   feature should follow. For a new backend module that is
   `apps/backend/src/modules/suggestive-selling/`, the canonical template.
2. **File list** — created vs. modified, with the purpose of each.
3. **Edge cases** — empty state, loading, network failure, permissions, and for anything
   touching carts or vouchers: concurrent mutation, Redis absent (it is optional — see
   `docs/team/REDIS_USAGE.md`), and re-validation on cart change.
4. **Questions** — anything ambiguous. Ask; do not assume.

**Stop and wait for approval.**

## Phase 2 — Implement (only after approval)

### Constraints

- Follow the existing patterns and conventions; do not introduce a competing style.
- No new dependency without asking first.
- Cite the SRS/spec section each piece implements in a comment, e.g. `// VOUCH-003: global cap`.
- Money is integer VND with `Math.floor`; discounts are computed server-side only.
- Cross-module references are plain `model.text()` id fields wired via the Link Module — never
  a database foreign key.
- Everything in `AGENTS.md` applies.

### Success criteria

- [ ] Happy path works
- [ ] Every edge case listed in Phase 1 is handled
- [ ] Error states surface a clear message rather than failing silently
- [ ] Unit tests cover the core logic: `*.unit.spec.ts` inside a `__tests__/` folder
- [ ] From `hf-medusa-store/apps/backend/`: `pnpm test:unit` passes
- [ ] From the inner `hf-medusa-store/`: `pnpm lint` and `pnpm build` are clean
- [ ] No new console warnings
