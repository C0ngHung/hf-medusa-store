---
name: debug
description: >-
  Use this skill when the user reports a symptom whose cause is not yet known — something behaves
  unexpectedly, works in one environment but not another, or fails intermittently. It investigates
  and proves a root cause with evidence and explicitly forbids editing code. Use the bugfix skill
  once the cause is confirmed.
---

# Debug

## Rule 1

**Do not change a single line of code** until the root cause is established with evidence.
This skill investigates. It does not fix.

## 1. Gather

Ask for anything missing: the exact symptom, when it happens, when it does *not* happen, the
environment (which app, dev vs. built, Redis present or absent), logs or stack trace, and what
changed recently.

Redis is optional in this project and the in-memory fallback behaves differently — "works
locally, fails in staging" is often this. See `docs/team/REDIS_USAGE.md`.

## 2. Hypotheses

List 3-5 hypotheses ranked by probability, highest first. For each, give the cheapest way to
confirm or kill it: which file to read, which log line to look for, which command to run.

## 3. Test them

Eliminate each hypothesis with concrete evidence found in the code or in output — not with
reasoning about what the code probably does. Quote the file and line that settles it.

## 4. Conclude

State the root cause with its evidence. If you are still unsure, say so and name the next
investigation step. Do not guess and then start editing.

Propose a fix only after the user has confirmed the root cause.
