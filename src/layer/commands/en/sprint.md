---
name: sprint
title: "UB: Sprint plan"
description: "Recompute the parallel work waves and assign changes to developers based on their real dependencies."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Glob, Grep
---

# /sw:sprint — plan the sprint

## Step 1 — Recompute the plan

```
npx un-specweaver bridge --dry-run
```

`--dry-run` recomputes the graph without overwriting in-flight changes. Then read
`.un-specweaver/sprint-plan.md`.

## Step 2 — Real status of each change

The wave plan comes from the dependency graph, not from progress. Cross-check it with reality:

- `npx un-specweaver status` — which changes exist and how they are doing
- `.un-specweaver/openspec/changes/<id>/tasks.md` — how many boxes are ticked
- `.un-specweaver/openspec/changes/archive/` — what is already closed

A wave whose changes are archived is done, even if the plan still shows it.

## Step 3 — Assign

Assignment rule: **one developer, one change at a time.** Stories are sized for exactly that;
two changes in parallel per person is what produces desynchronized specs.

Within a wave, everything is parallelizable. Across waves, it is not.

## Step 4 — State the limit out loud

The graph assumes epics are independent. A cross-epic dependency that is **not** written in the
story text does not show up in the waves.

Before handing out parallel work, review the wave's stories: if two touch the same area of the
system and sit in different epics, verify by hand against `.un-specweaver/trace.json`. It is this
flow's only known blind spot, and it is cheap to check.

## Step 5 — Show it

`npx un-specweaver status --open`: the Flow section with the epic filter and the stories canvas is
the visual version of this split; useful to agree on it with the team.

## Step 6 — Optional

`bmad-sprint-planning` for the full ceremony (capacity, business priority, commitment).
The wave plan gives it the technical dependencies; BMAD supplies the rest.
