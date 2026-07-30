# `.agents/` — Antigravity workspace configuration

Configuration for **Antigravity CLI (`agy`)** and **Antigravity IDE**, checked in so the whole
team gets the same setup. Claude Code does not read this directory; its equivalent lives in
`.claude/`.

## What is the source of truth

`AGENTS.md` at the repository root — stack, layout, commands, money rules, prohibited actions.
Antigravity discovers it natively: it walks up from the current working directory to the
repository root and loads every `AGENTS.md` and `GEMINI.md` it finds, so both the root file and
`hf-medusa-store/AGENTS.md` apply. Keep the two consistent; they are loaded together.

`.agents/` only adds what `AGENTS.md` cannot express: a safety hook, workspace skills, and an
MCP example.

## Layout

```
.agents/
├── rules/            always-on protocol + the skill index
├── skills/           18 skills, loaded on demand
├── hooks.json        native PreToolUse safety gate
├── hooks/            hook implementation, MCP sync helper, doctor, tests
├── mcp_config.json   workspace MCP example (placeholder key — see below)
└── antigravity.json  machine-readable description of the four phases above
```

Antigravity discovers customizations from `.agents/` at the repository root — the folder holding
`.git`, which is the outer `hf-medusa-store/`, not the inner pnpm workspace.

## Skills

Five task workflows (`bugfix`, `debug`, `feature`, `refactor`, `review-diff`) are the **single
source** for those procedures. The matching `.claude/commands/*.md` are thin wrappers that
`@`-import the `SKILL.md` here, so Claude Code and Antigravity follow the same text rather than two
copies that drift. Edit the skill; never edit the wrapper's body.

A wrapper carries only what cannot be shared: `$ARGUMENTS` (not substituted in `SKILL.md`), the
`!`-shell-injection line (does not run through an import), and Claude-Code-only trigger words such
as `think harder`.

The shared body may cite only files every tool can read — the root and `apps/*` `AGENTS.md`, and
`docs/team/*`. It must not cite `.claude/rules/*`, which Antigravity cannot open.

The rest are domain and craft skills. `rules/quick-reference.md` is the index.

Skills use progressive disclosure: only the name and description enter the context window until
one is activated.

## Safety hook

`hooks.json` registers one `PreToolUse` gate on `run_command`. It denies a short list of
high-confidence destructive operations — deleting the filesystem root, `mkfs`, raw disk
overwrite, Windows drive format — and defers everything else to Antigravity's normal permission
prompt. It deliberately allows ordinary cleanup such as `rm -rf node_modules`.

It never answers `allow`, because that would auto-approve every shell command. Blocked commands
get `deny`; everything else gets `ask`, which respects the "Always Allow" cache.

Verify it without involving the runtime:

```bash
printf '%s' '{"toolCall":{"name":"run_command","args":{"CommandLine":"rm -rf /"}}}' \
  | node .agents/hooks/validate-tool-call.mjs
```

Expected: `{"decision":"deny","reason":"…unix-root-delete…"}`.

The hook is not a sandbox and does not replace Antigravity's permission settings or workspace
trust. Unknown payload shapes fail open to a prompt rather than locking the runtime out. Note
that hook commands run with the working directory set to `.agents/`, so paths in `hooks.json`
are relative to this folder.

## MCP

`mcp_config.json` is an example only and ships with `YOUR_API_KEY` — never commit a real key
(`AGENTS.md` § Prohibited). Inspect the merge plan before doing anything:

```bash
node .agents/hooks/sync-mcp.mjs --check
node .agents/hooks/sync-mcp.mjs --print
```

Nothing in your home directory changes without an explicit `--apply`, placeholders block
`--apply` outright, an existing server with the same name is preserved unless `--force`, and the
target is backed up before writing.

```bash
node .agents/hooks/sync-mcp.mjs --apply --target suite   # ~/.gemini/config/mcp_config.json
node .agents/hooks/sync-mcp.mjs --apply --target cli     # ~/.gemini/antigravity-cli/mcp_config.json
```

## Checking the workspace

```bash
node .agents/hooks/antigravity-doctor.mjs
node --test .agents/hooks/tests/antigravity.test.mjs
```

The doctor reads the workspace without changing files. `--json` for machine-readable output,
`--strict` to treat unresolved placeholders as failures (the MCP example will fail `--strict`
until you configure a real key — that is intended).

There is no `package.json` at the repository root, so these run as plain `node` commands. The
project's own gates (`pnpm lint`, `pnpm build`, `pnpm test:*`) run from the inner
`hf-medusa-store/` workspace root as described in `AGENTS.md`.

## Provenance

Forked from AG Kit `2026.7.27` (`VERSION`) and pruned to this project. The upstream agent roles,
workflows, memory store, Python toolkit, and plugin builder were removed: agent and workflow
files are not surfaces Antigravity actually discovers, the memory store carried AG Kit's own
conventions rather than this repository's, and the toolkit assumed an `npm` project at the root.
Because the installer lock was removed with them, treat this as a fork — an upstream AG Kit
update will not apply cleanly.
