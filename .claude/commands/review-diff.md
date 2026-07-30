---
description: Review the uncommitted working diff, classified by severity
argument-hint: [optional path to narrow the review; empty = whole working diff]
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git status:*)
---

# Review working diff

For a GitHub pull request use `/review-pr` instead.

## Scope

$ARGUMENTS

If the line above is empty, review the whole uncommitted diff:

!`git diff HEAD`

@.agents/skills/review-diff/SKILL.md
