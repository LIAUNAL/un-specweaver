---
name: status
title: "UB: Where the project stands"
description: "Shows where the project stands: phases, changes with progress, sprint waves, requirements with coverage and instability, decisions and history. Interpret, do not just paste."
allowed-tools: Bash(npx:*), Read, Glob, Grep
---

# /sw:status — where the project stands

```
npx un-specweaver status            # terminal
npx un-specweaver status --open     # .un-specweaver/dashboard.html in the browser
```

It is a **derived view** of what is already on disk — BMAD's PRD and memlogs, `trace.json`,
`.un-specweaver/openspec/changes/` and its `archive/`, `sprint-plan`, `changelog.jsonl`, the graphify graph.
It stores nothing and is regenerated every time; if something looks wrong, it is wrong at the
source, not here.

## Interpret, do not paste

What the user needs to know, in this order:

1. **Which phase the project is in** and which artifact proves it. A phase that is half "in
   progress" (architecture without UX, for instance) is called out explicitly.
2. **What can start now.** The current wave and its "ready to start" changes. If a change is
   blocked, by which one, and whether that block is real (archived or not).
3. **Which requirements are unstable.** An FR with 3 or more changes is an FR nobody understands
   the same way; suggest `npx un-specweaver history <FR>` and, if it is about to be touched,
   re-reading its decisions.
4. **FR without a story.** A traceability gap: someone decided not to cover it, or forgot. Ask which.
5. **Changes with revision > 1.** Something already built changed. Worth knowing whether the code
   was updated afterwards.

## What it does not say

- It knows nothing about the code beyond the `tasks.md` boxes. A checked box is a developer's
  claim, not a proof.
- Cross-epic dependencies only show up if written in the story (a limit of the plan).
- If `Engram` is "not bound", build decisions are not scoped per project:
  `npx un-specweaver init` fixes it.
