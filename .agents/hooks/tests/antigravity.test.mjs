import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

import {diagnose} from '../antigravity-doctor.mjs';
import {evaluateCommand, extractCommand} from '../validate-tool-call.mjs';
import {planSync} from '../sync-mcp.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const hookScript = path.join(root, '.agents/hooks/validate-tool-call.mjs');

function runHook(payload) {
  const result = spawnSync(process.execPath, [hookScript], {
    input: JSON.stringify(payload),
    encoding: 'utf8'
  });
  return {...result, decision: JSON.parse(result.stdout)};
}

test('extracts the command from the documented protojson payload', () => {
  const payload = {toolCall: {name: 'run_command', args: {CommandLine: 'pnpm test:unit'}}};
  assert.equal(extractCommand(payload), 'pnpm test:unit');
});

test('still extracts legacy payload shapes so a rename degrades gracefully', () => {
  assert.equal(extractCommand({tool_args: {CommandLine: 'npm test'}}), 'npm test');
});

test('allows normal project cleanup', () => {
  assert.equal(evaluateCommand('rm -rf ./dist').allowed, true);
  assert.equal(evaluateCommand('rm -rf node_modules').allowed, true);
});

test('blocks destructive root and disk commands', () => {
  assert.equal(evaluateCommand('sudo rm -rf /').allowed, false);
  assert.equal(evaluateCommand('mkfs.ext4 /dev/sda1').allowed, false);
  assert.equal(evaluateCommand('dd if=/dev/zero of=/dev/sda').allowed, false);
  assert.equal(evaluateCommand('format C:').allowed, false);
});

test('hook denies a destructive command via the stdout decision contract', () => {
  const result = runHook({toolCall: {name: 'run_command', args: {CommandLine: 'rm -rf /'}}});
  assert.equal(result.status, 0);
  assert.equal(result.decision.decision, 'deny');
  assert.match(result.decision.reason, /unix-root-delete/);
});

test('hook defers a normal command to the permission prompt instead of auto-allowing', () => {
  const result = runHook({toolCall: {name: 'run_command', args: {CommandLine: 'rm -rf node_modules'}}});
  assert.equal(result.decision.decision, 'ask');
});

test('hook fails open to a prompt when the payload shape is unknown', () => {
  const result = runHook({somethingElse: true});
  assert.equal(result.decision.decision, 'ask');
});

test('hooks.json uses the named-hook shape Antigravity actually parses', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, '.agents/hooks.json'), 'utf8'));
  assert.equal(config.PreToolUse, undefined, 'events must not sit at the top level');
  const gate = config['workspace-safety-gate'];
  assert.equal(gate.enabled, true);
  assert.equal(gate.PreToolUse[0].matcher, 'run_command');
  assert.equal(gate.PreToolUse[0].hooks[0].type, 'command');
  // cwd is the directory holding hooks.json, so the path must not be prefixed with .agents/
  assert.equal(gate.PreToolUse[0].hooks[0].command, 'node hooks/validate-tool-call.mjs');
});

test('doctor passes on the pruned workspace layout', () => {
  const report = diagnose(root);
  assert.equal(report.runtime, 'antigravity');
  assert.equal(report.phases.discovery, true);
  assert.equal(report.phases.mcp, true);
  assert.equal(report.phases.hooks, true);
  assert.equal(report.phases.validation, true);
  assert.equal(report.passed, true, JSON.stringify(report.findings, null, 2));
});

test('MCP sync detects placeholders and plans without writing', () => {
  const plan = planSync({root, target: 'suite', force: false});
  assert.equal(plan.placeholders, true);
  assert.ok(Object.keys(plan.workspace.mcpServers).length > 0);
});
