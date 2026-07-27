---
name: core-protocol
version: 2.0.0
priority: P0
trigger: always_on
---

# Core protocol — Antigravity workspace

Only the things `AGENTS.md` cannot express. Everything about this project — stack, layout,
commands, money rules, prohibited actions — lives in `AGENTS.md`, which Antigravity already
loads on its own.

## Source of truth

1. `AGENTS.md` at the repository root, plus `hf-medusa-store/AGENTS.md` for workspace-level
   detail. These win over anything in `.agents/` and over any global `~/.gemini/GEMINI.md`.
2. This file and the skills under `.agents/skills/`.

If a skill contradicts `AGENTS.md`, `AGENTS.md` is right and the skill is stale — say so
instead of silently following it.

## Skill loading

- Read `SKILL.md` first, then only the sections the current task needs. Do not read every file
  in a skill folder.
- Announce the skill before applying it, so the user can verify what knowledge is active:
  `Using skill: api-patterns`. Multiple skills on one line.
- `quick-reference` lists what exists. Load it when you need to pick a skill, not every turn.

## Delegation

Do not spawn subagents or parallel workers by default — this repository optimises for a small,
auditable context (`CLAUDE.md § Token-control defaults`). Ask first, with a one-line reason.

## Before reporting done

Run the gate from `AGENTS.md`: the relevant `pnpm test:*` script, then `pnpm lint` and
`pnpm build`, from the inner `hf-medusa-store/` workspace root. State which files changed and
why. Never claim a result you have not seen the output of.
