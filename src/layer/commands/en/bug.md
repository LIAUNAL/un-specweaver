---
name: bug
title: "UB: Fix a defect"
description: "Fix a defect: the specified behavior is correct and the implementation does not meet it. No scope control involved."
allowed-tools: Bash(npx:*), Bash(git:*), Bash(gh:*), Read, Write, Edit, Glob, Grep, Bash
---

# /sw:bug — fix a defect

A defect and a new requirement are **different things and are handled differently**. The
difference is not size or urgency:

> **It is a defect** if the behavior specified in `.un-specweaver/openspec/specs/` is correct and the
> implementation does not meet it. **It is a requirement** if the spec does not cover the case.

A defect **does not go through scope control**: what was agreed does not change, it just was not
met. A requirement does, because it changes what was agreed. Hence two flows.

The defect comes in `$ARGUMENTS`. If empty, ask for it.

## Step 1 — Find the violated requirement

Search `.un-specweaver/openspec/specs/` for the `### Requirement:` the implementation fails, and the specific
`#### Scenario:` that breaks.

**If you cannot find it, stop.** It means one of two things, and you must decide which:
- the spec does not cover the case → **not a defect**, it is a requirement: use `/sw:change`
- the behavior was never specified → the spec baseline has a hole; say so

Reporting as a defect something that was never specified turns the spec into fiction.

## Step 2 — Reproduce it before touching anything

Write the failing test **first**. A defect with no test reproducing it is a hypothesis.

To locate the code that implements the scenario use the graph: `graphify query "<what the scenario
does>"` and, before touching anything, `graphify affected "<function or file>"` to learn what else
the fix could break. If there is no graph, `graphify update .`; if graphify is missing, say so.

If you cannot reproduce it, say so instead of fixing blind.

## Step 3 — The change

Create an OpenSpec change for the fix:

- `proposal.md` → in `## Why`, the violated requirement and how it manifests
- **Do not touch the PRD or `epics.md`.** What was specified is still correct: the spec does not
  change, the code does. That is the whole difference from `/sw:change`.
- `## Capabilities` → the affected capability, under Modified. No new requirements.
- `tasks.md` → the fix, and the test that pins it so it does not come back

If the defect reveals the spec was **ambiguous** — two reasonable readings — that **is** a
requirement: switch to `/sw:change`, because what was agreed needs sharpening.

## Step 4 — Close out

1. The failing test passes; the others still pass
2. `npx un-specweaver validate`
3. Record the root cause where it belongs (see "Memory" in `/sw:build`)
4. `npx un-specweaver close <change-id>`

If the defect came from a GitHub issue, comment the change-id there and close it.

## What this command does NOT do

It does not move scope. If mid-fix someone says "while we are here, let us also add...",
that is `/sw:change`. A defect that grows in scope stops being a defect and nobody notices.
