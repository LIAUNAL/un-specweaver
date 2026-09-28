---
name: ticket
title: "UB: Triage a ticket"
description: "Read a GitHub issue, decide whether it is a defect or a requirement, and route it to the right flow. It does not resolve it."
allowed-tools: Bash(gh:*), Bash(npx:*), Read, Glob, Grep
---

# /sw:ticket — triage and route

**This command resolves nothing.** It reads, classifies, and tells you which of the two flows it
belongs to. Resolution is done by `/sw:bug` or `/sw:change`, which work differently on purpose.

The issue number comes in `$ARGUMENTS`. If empty, list open ones with `gh issue list` and ask.

## Step 1 — Read it all

```
gh issue view <n> --comments
```

Comments matter: real scope usually lives in the discussion, not the title.

## Step 2 — Classify

Find the related requirement in `.un-specweaver/openspec/specs/`. The criterion is binary:

| | Defect | Requirement |
|---|---|---|
| The spec says | the right thing | does not cover the case |
| What fails | the implementation | what was agreed |
| Scope control | **does not apply** | **mandatory** |
| Touches the PRD | no | yes |
| Goes to | `/sw:bug` | `/sw:change` |

Cases that are neither, and must be named rather than forced:

- **The spec is ambiguous** (two reasonable readings) → it is a requirement: it needs sharpening
- **No related requirement exists** → the baseline has a hole. Say so: the feature may exist
  without being specified, which is a separate problem
- **It is a question, not a request** → answer it and close the issue; no change needed

## Step 3 — Route

State the classification **with the concrete requirement backing it**, and the next command:

```
Defect — violates "Requirement: <name>" in specs/<capability>/
  → /sw:bug <description>

Requirement — no requirement covers <case>
  → /sw:change "<description>"
```

If torn between the two, pick **requirement**: going through scope control unnecessarily costs
one conversation; skipping it lets new behavior in with nobody approving it.

## Step 4 — Leave a trace

Comment the classification and reasoning on the issue, even before the change exists.
A ticket that enters an internal flow without a trace is a ticket that gets reopened.
