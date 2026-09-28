---
name: adopt
title: "UB: Adopt existing project"
description: "Bring an existing project into this flow: map the real code, derive its architecture, raise a brownfield PRD and set a spec baseline."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Write, Edit, Glob, Grep
---

# /sw:adopt — existing project

The classic mistake is planning against what you **think** the code does. Map it first.

## Phase 1 — Map what actually exists

The classic mistake in this phase is planning against what you think the code does.

## Code map (graphify)

graphify is **part of the method**, not an optional capability: `init` installs it, drops the skill
into the project, scopes the graph to **code only** with `.graphifyignore`, builds the AST graph and
leaves a hook that rebuilds it on every commit. The graph is the only witness of the **real**
structure of the code — it has not read the PRD or the declared architecture, on purpose.

Resolve in this order and **say which branch you took**:

1. **`graphify-out/graph.json` exists** → query it: `graphify query "<question>"` for context,
   `graphify affected "<symbol or file>"` to learn what depends on something, `graphify path "A" "B"`
   for the route between two pieces. Do not read files blind when a graph exists.
2. **No graph but `graphify` is on PATH** → build it: `graphify update .` (AST, seconds, no LLM).
   If the project has no code yet, it is normal for it not to exist; carry on.
3. **`graphify` is not on PATH** → `npx un-specweaver doctor` reports it missing and
   `npx un-specweaver init` fixes it. If that is not possible now, fall back to Glob/Grep/Read and
   **explicitly warn that the map will be less reliable**.

The only serious failure is the silent one: invoking graphify, nothing happening, and carrying on
as if you had the map. **Do not widen the graph to docs** (full `/graphify .` over the PRD or specs):
those layers have another owner and duplicating them in the graph is how they start to contradict.

**The brownfield exception:** if the project carries technical docs *that predate the method*
(an architecture README, old ADRs, wikis), contrasting them against the code is exactly this phase's
diagnosis. There it is worth running `/graphify <folder-of-those-docs>` **once, asking first** (it
uses an LLM and tokens), and lifting that folder from `.graphifyignore` only while adoption lasts.

## Phase 2 — Real architecture vs declared architecture

1. Derive the **real** architecture from the graph: layers, boundaries, dependencies, where the
   domain lives.
2. Contrast it against `docs/architecture-base.md`.
3. **Write the differences down explicitly.** Do not silence them or mentally "fix" them.

Each difference is one of three things, and you must decide which before moving on:
- known technical debt → document it and leave it
- the baseline is stale → update `docs/architecture-base.md`
- a real violation → turn it into a remediation epic

## Phase 3 — Brownfield PRD

`bmad-document-project` to capture what the system does today, then `bmad-prd` on top of that.

Rule: the brownfield PRD describes **what exists**, not what you wish existed. New behavior
comes later through `/sw:change`.

## Phase 4 — Spec baseline

For each capability that already works, write its spec in `openspec/specs/<capability>/spec.md`
with `## Purpose` and its `### Requirement:` entries in present tense. This baseline is what
`/sw:change` measures scope against; without it, scope control has nothing to compare to.

Verify: `npx un-specweaver validate`

## Phase 5 — From here on

The project is in the flow. New behavior enters through `/sw:change`, tickets through
`/sw:ticket`, and new epics via `bmad-create-epics-and-stories` + `npx un-specweaver bridge`.
