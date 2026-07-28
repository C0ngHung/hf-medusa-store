import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { diagnose } from "../antigravity-doctor.mjs";
import { evaluateCommand, extractCommand } from "../validate-tool-call.mjs";
import { planSync } from "../sync-mcp.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const hookScript = path.join(root, ".agents/hooks/validate-tool-call.mjs");

function runHook(payload) {
  const result = spawnSync(process.execPath, [hookScript], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
  return { ...result, decision: JSON.parse(result.stdout) };
}

test("extracts the command from the documented protojson payload", () => {
  const payload = {
    toolCall: { name: "run_command", args: { CommandLine: "pnpm test:unit" } },
  };
  assert.equal(extractCommand(payload), "pnpm test:unit");
});

test("still extracts legacy payload shapes so a rename degrades gracefully", () => {
  assert.equal(
    extractCommand({ tool_args: { CommandLine: "npm test" } }),
    "npm test",
  );
});

test("allows normal project cleanup", () => {
  assert.equal(evaluateCommand("rm -rf ./dist").allowed, true);
  assert.equal(evaluateCommand("rm -rf node_modules").allowed, true);
});

test("blocks the project-level destructive commands named in AGENTS.md § Prohibited", () => {
  assert.equal(evaluateCommand("git push --force origin main").allowed, false);
  assert.equal(evaluateCommand("git push -f").allowed, false);
  assert.equal(evaluateCommand("git reset --hard HEAD~1").allowed, false);
  assert.equal(evaluateCommand("git clean -fd").allowed, false);
  assert.equal(evaluateCommand('psql -c "DROP TABLE users"').allowed, false);
  assert.equal(
    evaluateCommand('mysql app -e "drop database app"').allowed,
    false,
  );
});

test("anchors project rules to a command position, after a separator too", () => {
  assert.equal(evaluateCommand("cd /repo && git push --force").allowed, false);
  assert.equal(evaluateCommand("echo $(git reset --hard)").allowed, false);
});

// The group that actually breaks. This repo's docs quote dangerous commands on purpose, so a
// rule that is not anchored to a command position blocks ordinary documentation edits.
test("does NOT block prose or searches that merely mention a dangerous command", () => {
  assert.equal(
    evaluateCommand('echo "git push --force is banned"').allowed,
    true,
  );
  assert.equal(evaluateCommand('grep -rn "DROP TABLE" .').allowed, true);
  assert.equal(
    evaluateCommand('grep -rn "git reset --hard" docs/').allowed,
    true,
  );
  assert.equal(evaluateCommand("git push origin feat/x").allowed, true);
  assert.equal(evaluateCommand("git clean -n").allowed, true);
  assert.equal(evaluateCommand("git reset --soft HEAD~1").allowed, true);
  assert.equal(evaluateCommand("pnpm build").allowed, true);
});

test("never emits a bare {} — Antigravity reads a missing decision as DENY", () => {
  for (const command of [
    "pnpm build",
    "git status",
    "rm -rf node_modules",
    "javac -version",
  ]) {
    const result = runHook({
      toolCall: { name: "run_command", args: { CommandLine: command } },
    });
    assert.equal(
      result.decision.decision,
      "ask",
      `${command} must defer, not fall through`,
    );
    assert.ok(
      "decision" in result.decision,
      `${command} produced an output with no decision field`,
    );
  }
});

test("blocks destructive root and disk commands", () => {
  assert.equal(evaluateCommand("sudo rm -rf /").allowed, false);
  assert.equal(evaluateCommand("mkfs.ext4 /dev/sda1").allowed, false);
  assert.equal(evaluateCommand("dd if=/dev/zero of=/dev/sda").allowed, false);
  assert.equal(evaluateCommand("format C:").allowed, false);
});

test("hook denies a destructive command via the stdout decision contract", () => {
  const result = runHook({
    toolCall: { name: "run_command", args: { CommandLine: "rm -rf /" } },
  });
  assert.equal(result.status, 0);
  assert.equal(result.decision.decision, "deny");
  assert.match(result.decision.reason, /unix-root-delete/);
});

test("hook defers a normal command to the permission prompt instead of auto-allowing", () => {
  const result = runHook({
    toolCall: {
      name: "run_command",
      args: { CommandLine: "rm -rf node_modules" },
    },
  });
  assert.equal(result.decision.decision, "ask");
});

test("hook fails open to a prompt when the payload shape is unknown", () => {
  const result = runHook({ somethingElse: true });
  assert.equal(result.decision.decision, "ask");
});

test("hooks.json uses the named-hook shape Antigravity actually parses", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, ".agents/hooks.json"), "utf8"),
  );
  assert.equal(
    config.PreToolUse,
    undefined,
    "events must not sit at the top level",
  );
  const gate = config["workspace-safety-gate"];
  assert.equal(gate.enabled, true);
  assert.equal(gate.PreToolUse[0].matcher, "run_command");
  assert.equal(gate.PreToolUse[0].hooks[0].type, "command");
  // cwd is the directory holding hooks.json, so the path must not be prefixed with .agents/
  assert.equal(
    gate.PreToolUse[0].hooks[0].command,
    "node hooks/validate-tool-call.mjs",
  );
});

test("doctor passes on the pruned workspace layout", () => {
  const report = diagnose(root);
  assert.equal(report.runtime, "antigravity");
  assert.equal(report.phases.discovery, true);
  assert.equal(report.phases.mcp, true);
  assert.equal(report.phases.hooks, true);
  assert.equal(report.phases.validation, true);
  assert.equal(report.passed, true, JSON.stringify(report.findings, null, 2));
});

test("MCP sync detects placeholders and plans without writing", () => {
  const plan = planSync({ root, target: "suite", force: false });
  assert.equal(plan.placeholders, true);
  assert.ok(Object.keys(plan.workspace.mcpServers).length > 0);
});
