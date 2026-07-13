<!-- Title format: <type>(<scope>): <task-id> <summary>  e.g. feat(backend): 3.1.1 add VoucherEngine module -->

## Summary
<!-- What changed and why, in 1–3 sentences. -->

## Task(s)
<!-- Link the task ID(s) from docs/tasks_grouped.md this PR completes. -->
- [ ] `<task-id>` — <task description>

## Evidence
<!-- Required. Paste proof per docs/team/CONTRIBUTING.md §Evidence.
     e.g. test output, HTTP request/response, Redis key dump, migration log, screenshot. -->

## Checklist
- [ ] Branch off `develop`, PR targets `develop`
- [ ] Follows `.claude/rules/*` (money = integer VND + `Math.floor`; spec IDs cited in comments)
- [ ] Only touched files I own (see `docs/team/OWNERSHIP.md`)
- [ ] `pnpm lint` / `pnpm test` / `pnpm build` green
- [ ] `/code-review` clean (+ `/security-review` if voucher / rate-limit / discount code)
- [ ] Evidence attached above
- [ ] Task checkbox ticked in `docs/tasks_grouped.md` on merge
