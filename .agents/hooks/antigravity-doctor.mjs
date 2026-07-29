#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const options = {root: process.cwd(), json: false, strict: false};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') options.root = path.resolve(argv[++i]);
    else if (arg === '--json') options.json = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function frontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return null;
  const data = {};
  for (const line of text.slice(4, end).split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    data[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return data;
}

function markdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.md'))
    .map(name => path.join(dir, name))
    .sort();
}

function skillFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes: true})
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(dir, entry.name, 'SKILL.md'))
    .filter(file => fs.existsSync(file))
    .sort();
}

function add(report, severity, phase, code, file, message) {
  report.findings.push({severity, phase, code, file, message});
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function checkDiscovery(root, report) {
  const agentsRoot = path.join(root, '.agents');
  const groups = [
    ['rules', markdownFiles(path.join(agentsRoot, 'rules')), ['name', 'trigger']],
    ['skills', skillFiles(path.join(agentsRoot, 'skills')), ['name', 'description']]
  ];

  for (const [kind, files, required] of groups) {
    report.counts[kind] = files.length;
    if (files.length === 0) {
      add(report, 'error', 'discovery', `${kind}.missing`, `.agents/${kind}`, `No Antigravity ${kind} were discovered.`);
      continue;
    }
    for (const file of files) {
      const meta = frontmatter(file);
      if (!meta) {
        add(report, 'error', 'discovery', `${kind}.frontmatter`, relative(root, file), 'Missing YAML frontmatter.');
        continue;
      }
      for (const field of required) {
        if (!meta[field]) add(report, 'error', 'discovery', `${kind}.required`, relative(root, file), `Missing frontmatter field: ${field}`);
      }
    }
  }
}

function walkStrings(value, callback) {
  if (typeof value === 'string') callback(value);
  else if (Array.isArray(value)) value.forEach(item => walkStrings(item, callback));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => walkStrings(item, callback));
}

function checkMcp(root, report) {
  const file = path.join(root, '.agents', 'mcp_config.json');
  if (!fs.existsSync(file)) {
    add(report, 'error', 'mcp', 'mcp.missing', '.agents/mcp_config.json', 'Workspace MCP configuration is missing.');
    return;
  }
  let config;
  try {
    config = readJson(file);
  } catch (error) {
    add(report, 'error', 'mcp', 'mcp.invalid_json', '.agents/mcp_config.json', error.message);
    return;
  }
  if (!config.mcpServers || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)) {
    add(report, 'error', 'mcp', 'mcp.servers', '.agents/mcp_config.json', 'mcpServers must be an object.');
    return;
  }
  report.counts.mcpServers = Object.keys(config.mcpServers).length;
  for (const [name, server] of Object.entries(config.mcpServers)) {
    const valid = server && typeof server === 'object' && (
      typeof server.command === 'string' || typeof server.serverURL === 'string' || typeof server.url === 'string'
    );
    if (!valid) add(report, 'error', 'mcp', 'mcp.server_shape', `.agents/mcp_config.json#${name}`, 'Server needs command, serverURL, or url.');
    walkStrings(server, value => {
      if (/YOUR_[A-Z0-9_]+|CHANGE_ME|<[^>]+>/.test(value)) {
        add(report, 'warning', 'mcp', 'mcp.placeholder', `.agents/mcp_config.json#${name}`, 'Server contains an unresolved placeholder; configure it before enabling the server.');
      }
    });
  }
}

// Hook commands run with the working directory set to the folder holding
// hooks.json, so a local target is resolved against .agents/, not the repo root.
function localCommandPath(command) {
  const match = command.match(/(?:^|\s)((?:\.{1,2}[/\\])?[\w.-]+(?:[/\\][\w.-]+)*\.(?:mjs|cjs|js|sh|py))(?:\s|$)/);
  return match ? match[1] : null;
}

function checkHandler(root, report, handler, ref) {
  if (!handler || typeof handler !== 'object') {
    add(report, 'error', 'hooks', 'hooks.handler_shape', ref, 'Hook handler must be an object.');
    return;
  }
  if (handler.type !== undefined && handler.type !== 'command') {
    add(report, 'error', 'hooks', 'hooks.handler_type', ref, 'Only type "command" is supported by Antigravity.');
  }
  if (typeof handler.command !== 'string' || !handler.command.trim()) {
    add(report, 'error', 'hooks', 'hooks.command', ref, 'command is required.');
    return;
  }
  if (handler.timeout !== undefined && (!Number.isInteger(handler.timeout) || handler.timeout < 1 || handler.timeout > 300)) {
    add(report, 'error', 'hooks', 'hooks.timeout', ref, 'timeout must be an integer from 1 to 300 seconds.');
  }
  const localPath = localCommandPath(handler.command);
  if (localPath && !fs.existsSync(path.join(root, '.agents', localPath))) {
    add(report, 'error', 'hooks', 'hooks.command_missing', ref, `Local hook target does not exist relative to .agents/: ${localPath}`);
  }
}

const MATCHED_EVENTS = new Set(['PreToolUse', 'PostToolUse']);
const FLAT_EVENTS = new Set(['PreInvocation', 'PostInvocation', 'Stop']);

function checkHooks(root, report) {
  const file = path.join(root, '.agents', 'hooks.json');
  if (!fs.existsSync(file)) {
    add(report, 'error', 'hooks', 'hooks.missing', '.agents/hooks.json', 'Native Antigravity hooks configuration is missing.');
    return;
  }
  let config;
  try {
    config = readJson(file);
  } catch (error) {
    add(report, 'error', 'hooks', 'hooks.invalid_json', '.agents/hooks.json', error.message);
    return;
  }

  let total = 0;
  for (const [name, spec] of Object.entries(config)) {
    if (name === '$schema') continue;
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      add(report, 'error', 'hooks', 'hooks.named_shape', `.agents/hooks.json#${name}`, 'Each top-level key must map to a named hook object.');
      continue;
    }
    if (spec.enabled !== undefined && typeof spec.enabled !== 'boolean') {
      add(report, 'error', 'hooks', 'hooks.enabled', `.agents/hooks.json#${name}`, 'enabled must be boolean.');
    }
    for (const [event, value] of Object.entries(spec)) {
      if (event === 'enabled') continue;
      if (!MATCHED_EVENTS.has(event) && !FLAT_EVENTS.has(event)) {
        add(report, 'error', 'hooks', 'hooks.event_unknown', `.agents/hooks.json#${name}.${event}`, 'Unknown lifecycle event.');
        continue;
      }
      if (!Array.isArray(value)) {
        add(report, 'error', 'hooks', 'hooks.event_shape', `.agents/hooks.json#${name}.${event}`, `${event} must be an array.`);
        continue;
      }
      value.forEach((entry, index) => {
        const ref = `.agents/hooks.json#${name}.${event}[${index}]`;
        if (FLAT_EVENTS.has(event)) {
          total += 1;
          checkHandler(root, report, entry, ref);
          return;
        }
        if (!entry || typeof entry !== 'object' || typeof entry.matcher !== 'string') {
          add(report, 'error', 'hooks', 'hooks.matcher', ref, 'matcher is required for tool-scoped events.');
          return;
        }
        if (!Array.isArray(entry.hooks) || entry.hooks.length === 0) {
          add(report, 'error', 'hooks', 'hooks.group_shape', ref, 'Tool-scoped events wrap handlers in a non-empty "hooks" array.');
          return;
        }
        entry.hooks.forEach((handler, handlerIndex) => {
          total += 1;
          checkHandler(root, report, handler, `${ref}.hooks[${handlerIndex}]`);
        });
      });
    }
  }
  report.counts.hooks = total;
  if (total === 0) add(report, 'warning', 'hooks', 'hooks.empty', '.agents/hooks.json', 'No native hooks are registered.');
}

function checkValidation(root, report) {
  const requiredFiles = [
    '.agents/hooks/tests/antigravity.test.mjs',
    '.agents/README.md',
    'AGENTS.md'
  ];
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(root, file))) {
      add(report, 'error', 'validation', 'validation.file_missing', file, 'Required workspace file is missing.');
    }
  }
}

export function diagnose(root) {
  const report = {runtime: 'antigravity', root, passed: true, counts: {}, phases: {}, findings: []};
  const contractFile = path.join(root, '.agents', 'antigravity.json');
  let contract;
  try {
    contract = readJson(contractFile);
    if (contract.runtime !== 'antigravity') add(report, 'error', 'discovery', 'contract.runtime', '.agents/antigravity.json', 'runtime must be antigravity.');
  } catch (error) {
    add(report, 'error', 'discovery', 'contract.invalid', '.agents/antigravity.json', error.message);
  }

  checkDiscovery(root, report);
  checkMcp(root, report);
  checkHooks(root, report);
  checkValidation(root, report);

  for (const phase of ['discovery', 'mcp', 'hooks', 'validation']) {
    report.phases[phase] = !report.findings.some(item => item.phase === phase && item.severity === 'error');
  }
  report.passed = !report.findings.some(item => item.severity === 'error');
  return report;
}

function printHuman(report) {
  console.log(`Antigravity workspace doctor: ${report.root}`);
  for (const [phase, passed] of Object.entries(report.phases)) console.log(`${passed ? '[PASS]' : '[FAIL]'} ${phase}`);
  for (const item of report.findings) console.log(`[${item.severity.toUpperCase()}] ${item.file} ${item.code} - ${item.message}`);
  console.log(`Counts: ${JSON.stringify(report.counts)}`);
  console.log(report.passed ? '[PASS] Antigravity contract is ready.' : '[FAIL] Antigravity contract has blocking findings.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node .agents/hooks/antigravity-doctor.mjs [--root PATH] [--json] [--strict]');
      process.exit(0);
    }
    const report = diagnose(options.root);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
    const hasWarnings = report.findings.some(item => item.severity === 'warning');
    process.exitCode = report.passed && !(options.strict && hasWarnings) ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
