#!/usr/bin/env node

import process from "node:process";

// Every rule below anchors the command name to a COMMAND POSITION: start of string, or right
// after `;` `&&` `||` `|` or `$(`. Without the anchor the gate blocks prose that merely quotes a
// command, and this repository is full of teaching docs that quote dangerous commands on purpose
// (docs/team/*). A backtick is deliberately NOT a command position: in this repo a lone backtick
// almost always opens Markdown inline code.
const CMD_START = String.raw`(?:^|[;&|]\s*|\$\(\s*)`;

// Database clients, for the SQL rules. `drop table` cannot be anchored like a shell command
// because it appears as an argument, so instead we require the command to BE a db client.
// That is what keeps `grep -rn "DROP TABLE" .` and `echo "drop table x"` out of the net.
const DB_CLIENT = String.raw`(?:psql|mysql|mariadb|mongosh|mongo|sqlite3)`;

const BLOCK_RULES = [
  {
    id: "git-force-push",
    pattern: new RegExp(
      `${CMD_START}git\\s+push\\b[^\\n]*(?:--force\\b|--force-with-lease=|\\s-f\\b)`,
      "i",
    ),
    message: "force push rewrites published history (AGENTS.md § Prohibited)",
  },
  {
    id: "git-reset-hard",
    pattern: new RegExp(`${CMD_START}git\\s+reset\\b[^\\n]*--hard\\b`, "i"),
    message:
      "git reset --hard discards uncommitted work (AGENTS.md § Prohibited)",
  },
  {
    id: "git-clean-force",
    pattern: new RegExp(
      `${CMD_START}git\\s+clean\\b[^\\n]*\\s-[A-Za-z]*f`,
      "i",
    ),
    message:
      "git clean -f deletes untracked files irrecoverably (AGENTS.md § Prohibited)",
  },
  {
    id: "sql-drop",
    pattern: new RegExp(
      `${CMD_START}(?:sudo\\s+)?${DB_CLIENT}\\b[^\\n]*\\bdrop\\s+(?:table|database|schema)\\b`,
      "i",
    ),
    message:
      "DROP TABLE/DATABASE against a live database (AGENTS.md § Prohibited)",
  },
  {
    id: "unix-root-delete",
    pattern:
      /(?:^|[;&|]\s*)(?:sudo\s+)?rm\s+(?:-[A-Za-z]*r[A-Za-z]*f[A-Za-z]*|-[A-Za-z]*f[A-Za-z]*r[A-Za-z]*)\s+(?:--\s+)?\/(?:\*|\s|$)/i,
    message: "recursive deletion of the filesystem root",
  },
  {
    id: "filesystem-format",
    pattern: /(?:^|[;&|]\s*)(?:sudo\s+)?mkfs(?:\.[A-Za-z0-9_-]+)?\b/i,
    message: "filesystem formatting command",
  },
  {
    id: "raw-disk-overwrite",
    pattern: /\bdd\b[^\n]*\bof=\/dev\/(?:sd|nvme|vd|xvd)[A-Za-z0-9_-]*/i,
    message: "raw disk overwrite",
  },
  {
    id: "windows-drive-format",
    pattern: /(?:^|[;&|]\s*)format(?:\.com)?\s+[A-Za-z]:/i,
    message: "Windows drive format",
  },
  {
    id: "windows-root-delete",
    pattern:
      /remove-item\b[^\n]*-(?:recurse|r)\b[^\n]*-(?:force|fo)\b[^\n]*(?:[A-Za-z]:\\(?:\s|$)|[A-Za-z]:\\\*)/i,
    message: "recursive deletion of a Windows drive root",
  },
];

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
      if (input.length > 1024 * 1024) {
        reject(new Error("hook payload exceeds 1 MiB"));
      }
    });
    process.stdin.on("end", () => resolve(input));
    process.stdin.on("error", reject);
  });
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

// Antigravity sends the PreToolUse payload as protojson (camelCase):
// {"toolCall": {"name": "run_command", "args": {"CommandLine": "..."}}}
// The remaining shapes are tolerated so an upstream payload rename degrades to
// a warning instead of a silent no-op.
export function extractCommand(payload) {
  const args =
    payload?.toolCall?.args ??
    payload?.tool_args ??
    payload?.toolArgs ??
    payload?.arguments ??
    {};
  return firstString(
    args.CommandLine,
    args.commandLine,
    args.command,
    args.cmd,
    payload?.command,
    payload?.cmd,
  );
}

export function evaluateCommand(command) {
  for (const rule of BLOCK_RULES) {
    if (rule.pattern.test(command)) {
      return { allowed: false, rule: rule.id, reason: rule.message };
    }
  }
  return {
    allowed: true,
    rule: null,
    reason: "no destructive command pattern matched",
  };
}

// The PreToolUse contract expects a JSON decision on stdout, not an exit code.
// "deny" hard-blocks; "defer" is expressed as "ask", which keeps Antigravity's
// normal permission prompt (and its "Always Allow" cache) in charge. Returning
// "allow" here would auto-approve every shell command, so we never do that.
function emit(decision, reason) {
  process.stdout.write(
    JSON.stringify(reason ? { decision, reason } : { decision }),
  );
}

async function main() {
  let raw;
  try {
    raw = await readStdin();
  } catch (error) {
    console.error(`safety gate warning: ${error.message}`);
    emit(
      "ask",
      "Safety gate could not read the payload; falling back to a permission prompt.",
    );
    return 0;
  }

  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    console.error(
      "safety gate warning: Antigravity sent invalid JSON; deferring to the permission prompt.",
    );
    emit("ask", "Safety gate received an unreadable payload.");
    return 0;
  }

  const command = extractCommand(payload);
  if (!command) {
    console.error(
      "safety gate warning: no command found in the payload; deferring to the permission prompt.",
    );
    emit("ask", "Safety gate found no command to inspect.");
    return 0;
  }

  const result = evaluateCommand(command);
  if (!result.allowed) {
    emit(
      "deny",
      `Blocked by the workspace safety gate (${result.rule}): ${result.reason}.`,
    );
    return 0;
  }

  emit("ask");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
