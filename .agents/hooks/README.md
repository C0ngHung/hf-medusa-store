# Hooks and MCP implementation

Implementation notes for `.agents/hooks.json` and the MCP sync helper. Operator-level
instructions are in [../README.md](../README.md).

The authoritative reference for both is the Antigravity documentation shipped with the CLI:
`~/.gemini/antigravity-cli/builtin/skills/agy-customizations/docs/`.

## Files

| File | Purpose |
|---|---|
| `validate-tool-call.mjs` | `PreToolUse` policy — the only thing the runtime executes |
| `antigravity-doctor.mjs` | reads the workspace and reports discovery/MCP/hooks/validation findings |
| `sync-mcp.mjs` | plans and optionally applies workspace MCP servers into a global config |
| `tests/antigravity.test.mjs` | regression tests for all three |
| `antigravity-hooks.schema.json` | schema for `hooks.json` |
| `antigravity-contract.schema.json` | schema for `antigravity.json` |

## The `hooks.json` contract

`hooks.json` is a map of **hook name** to event configuration — the events do not sit at the top
level. Tool-scoped events (`PreToolUse`, `PostToolUse`) wrap their handlers in a `matcher` group
with a `hooks` array; lifecycle events (`PreInvocation`, `PostInvocation`, `Stop`) take handlers
directly.

```json
{
  "workspace-safety-gate": {
    "enabled": true,
    "PreToolUse": [
      {
        "matcher": "run_command",
        "hooks": [{"type": "command", "command": "node hooks/validate-tool-call.mjs", "timeout": 10}]
      }
    ]
  }
}
```

Three details that are easy to get wrong, and were wrong in the upstream version of this file:

- **Working directory** is the folder containing `hooks.json`, so the command path is
  `hooks/validate-tool-call.mjs`, not `.agents/hooks/validate-tool-call.mjs`.
- **Input** arrives on stdin as protojson with camelCase keys:
  `{"toolCall": {"name": "run_command", "args": {"CommandLine": "…"}}}`. Reading `tool_args`
  silently matches nothing.
- **Output** is a JSON decision on stdout, not an exit code:
  `{"decision": "deny" | "allow" | "ask" | "force_ask", "reason": "…"}`.

## Policy behaviour

`validate-tool-call.mjs` matches the command against five patterns — filesystem-root deletion,
`mkfs`, raw disk overwrite via `dd of=/dev/sd*`, and Windows drive format/root deletion — and
answers:

- `deny` on a match;
- `ask` on everything else, including unreadable payloads.

`ask` rather than `allow` is deliberate. `allow` auto-approves the tool call and would strip the
user's permission prompt from every shell command the agent runs; `ask` respects the existing
"Always Allow" cache, so the gate can only ever make things stricter, never looser.

Hooks run synchronously and block the agent loop. Keep this policy to a regex match — do not add
network calls or file scans.

## Disabling

Set `"enabled": false` on `workspace-safety-gate` and reopen the workspace. That is the first
thing to try if a runtime upgrade changes the payload shape.

## MCP sync

`sync-mcp.mjs` merges `.agents/mcp_config.json` into a global config. Safety properties:

- no write without `--apply`;
- `--apply` refuses while any `YOUR_*` / `CHANGE_ME` / `<…>` placeholder remains;
- an existing server with the same name is kept unless `--force`;
- the destination is copied to a timestamped backup before writing.

A fresh Antigravity install leaves `~/.gemini/config/mcp_config.json` as a zero-byte file;
`readJson` treats empty content as "no servers configured yet" rather than failing to parse.
