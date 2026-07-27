@AGENTS.md

Everything shared with other AI agents lives in `AGENTS.md`, imported above. This file holds only
the Claude-Code-specific additions.

## Recommended tooling

Install the official Medusa Claude Code plugin for framework guidance:
`/plugin marketplace add medusajs/medusa-agent-skills` then `/plugin install medusa-dev@medusa`.

## Token-control defaults

- Do not create subagents automatically.
- Do not spawn subagents by default.
- Do not use Explore, general-purpose, medusa-module-reviewer, test-writer, or security-auditor unless
  the user explicitly asks, or the current task clearly reaches a documented review/security/test gate.
- Do not invoke `medusa-dev:building-with-medusa` or other broad medusa-dev plugin skills by default.
- Prefer local project examples and installed Medusa 2.16 source for targeted verification.
- If a subagent or medusa-dev skill would materially help, ask first with a short reason before using
  it.
- Keep context small: read only the files directly needed for the current task.

## Shell command policy

- Prefer Read, Glob, and Grep for source and dependency inspection.
- Use Bash only when repository tools are insufficient.
- Use one simple operation per Bash call.
- Do not combine variable assignment, `$()`, pipes, redirection,
  semicolons, or `&&` in one inspection command.
- Split compound inspection commands into separate tool calls.
- Run `pnpm` directly; never invoke it through `npx pnpm`.
- Do not pipe test output to `tail` in the same command.
- Never commit, push, reset, clean, merge, rebase, or cherry-pick
  without explicit user approval.

## Tool usage

1. Use Read, Grep, and Glob for repository inspection.
2. Do not use Bash merely as a replacement for Read, Grep, or Glob.
3. Do not recursively scan node_modules.
4. Dependency source inspection is allowed only to resolve an exact API,
   type, or runtime-behavior question.
5. Search one exact package and symbol at a time.
6. Never modify generated files or node_modules.
7. Adjacent findings must be logged, not investigated, unless explicitly
   included in the current task.
8. A subagent must not invoke another subagent unless the parent task
   explicitly permits delegation.
