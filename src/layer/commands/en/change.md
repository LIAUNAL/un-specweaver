---
name: change
title: "UB: New requirement"
description: "Process a requirement that arrives mid-development: control scope first, then update the source document and regenerate only what is affected."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Write, Edit, Glob, Grep
---

# /sw:change — new requirement mid-development

This is the case that breaks most often when done by feel. **The order is not negotiable.**

The requirement comes in `$ARGUMENTS`. If empty, ask for it before doing anything.

## Step 1 — Scope control (before touching a single file)

Read `.un-specweaver/trace.json` and the PRD. And before classifying, **look at the history of
the requirement it touches**:

```
npx un-specweaver history            # ranking: which requirements changed most, and how much
npx un-specweaver history FR-21      # everything decided, changed or discarded about that FR
```

It crosses the `.memlog.md` files BMAD writes while conversing (decisions, changes, discards with
their reason), the `sprint-change-proposal-*.md` files and the bridge history. If what is being
asked **was already discarded**, say so with the entry and its reason before reopening it:
reopening a decision without knowing it existed is the most expensive way to lose time. An FR with
many changes is an FR nobody understands the same way; if that is the case, say so too.

Classify the requirement as exactly **one** of:

| Classification | How to recognize it | What follows |
|---|---|---|
| **In scope** | refines an existing FR; adds no new behavior | Step 2 |
| **Scope creep** | new behavior the PRD does not cover, but it fits an existing epic | **Stop and say so.** Wait for a decision. |
| **New epic** | a whole new capability | **Stop.** This goes back to planning, it is not a patch. |

State the classification out loud, citing the specific FR or story that backs it. If torn between
two, pick the more restrictive one and explain why.

**Measure the impact on the real code, not the imagined one.** If `graphify-out/graph.json` exists,
run `graphify affected "<module or symbol the requirement touches>"` and report what depends on it:
an "in scope" that drags five modules along is not that in scope. If there is no graph,
`graphify update .` builds it in seconds; if graphify is missing, say so and carry on.

**Do not move to Step 2 without user confirmation for anything other than "in scope".**

## Step 2 — Update the source document, not the derived one

If behavior changes, change the PRD/epics with `bmad-correct-course`.

Editing the spec without updating the PRD leaves both lying: the spec says one thing, the PRD
another, and in three weeks nobody knows which wins. The spec is **derived** from epics.md — it
gets regenerated, not hand-edited.

## Step 3 — Regenerate only what is affected

```
npx un-specweaver bridge --only <N.M> --force
```

One `--only` per touched story. **Do not regenerate everything**: you would overwrite in-flight
changes other developers are already working on.

The bridge knows it is regenerating, not creating:

- if the change exists and is in progress, it **keeps the checked boxes** in `tasks.md` and tells
  you which were lost because the task text changed
- if the requirement is **already archived** (lives in `.un-specweaver/openspec/specs/`), it emits
  `## MODIFIED Requirements` in a new change `<id>-r2`, `-r3`… — the previous one stays in
  `archive/`. It reuses the archived scenario names because OpenSpec demands them; the content
  is updated
- if the story **dropped** an archived scenario, the bridge **fails and writes nothing**: OpenSpec
  does not allow removing it in a `MODIFIED`. Follow the instruction it prints (keep the criterion,
  or a manual `## REMOVED Requirements` change archived before regenerating). Do not patch by hand
- `trace.json` is merged: stories you did not touch keep their entry
- every run lands in `.un-specweaver/changelog.jsonl`: the history of what was regenerated when

Before running it, check `.un-specweaver/sprint-plan.md`: if the affected story has dependents in
later waves, name which ones are impacted.

## Step 4 — Re-verify

```
npx un-specweaver validate
```

## Step 5 — Record the why

Engram is **optional**, and its memory lives **inside the project**: `.un-specweaver/engram` is
a database of its own, not a label over a shared one. What you store here does not exist for any
other project, and deleting `.un-specweaver/` deletes it.

**Known limit, and the only real failure mode:** if the user has the **global Engram plugin** in
Claude Code, its tools live in another namespace (`mcp__plugin_engram_*`) and keep writing to
`~/.engram`, outside the project. No project configuration overrides it. If you see two sets of
memory tools, **use the project's and say so**; storing rationale in the wrong database is losing
it without noticing. `npx un-specweaver doctor` reports it.

- **If `engram` is on PATH** → store the decision and its reason there.
- **If it is not** → write it anyway, in the change's `design.md` under `## Decisions`, and
  **tell the user** it went there because Engram is not installed.

What is not acceptable is invoking Engram, nothing happening, and losing the rationale silently.
A "why" that ends up written nowhere is lost just as if it had never been thought.

Store the **decision and its reason**, not the what (that is already in the spec).
What always gets lost is why a scope change was accepted or rejected.

If the change was rejected as scope creep, record it anyway: next time someone proposes it, that
decision saves the entire discussion.
