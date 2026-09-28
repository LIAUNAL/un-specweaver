---
name: build
title: "UB: Build a change"
description: "Hand an OpenSpec change to the SDD flow for implementation, after verifying its dependencies are satisfied."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Write, Edit, Glob, Grep, Bash
---

# /sw:build — build a change

The change-id comes in `$ARGUMENTS`. If empty, show the current wave from
`.un-specweaver/sprint-plan.md` and ask which.

**This is the only phase that writes product code.** BMAD's building skills are pruned from this
project on purpose: if you look for `bmad-build` or `bmad-agent-dev` and they are missing, that
is not an error.

## Step 0 — Verify the build environment is complete

`npx un-specweaver doctor`. Here the memory and code-map steps (`engram-bin`, `engram-project`,
`graphify-bin`, `graphify`) DO block: without them you build with no rationale and explore
blind. If any is missing, fix it with `npx un-specweaver init`.

## Step 1 — Verify you can start

Before writing anything:

1. Find the change in `.un-specweaver/sprint-plan.md`. If it declares `depende de` / depends on,
   verify **each** dependency is archived (`.un-specweaver/openspec/changes/archive/`) or has a complete `tasks.md`.
2. If a dependency is not ready, **stop and say so**. Building on a spec that can still change is
   work that will be thrown away.
3. Read the whole change: `proposal.md`, `specs/**/spec.md`, `tasks.md`.

## Step 2 — Load the right context

```
npx un-specweaver context
```

Lists the artifacts BMAD already produced, at their real paths (they are dated and configurable,
do not guess them). **Load them before designing**:

- **`architecture/ARCHITECTURE-SPINE.md`** — technical decisions already made and reviewed.
  **Binding.** SDD design does not relitigate them: it implements them.
- **`ux-designs/DESIGN.md` and `EXPERIENCE.md`** — design and experience. **Binding** for
  everything visual and interactive. The UX-DRs this story covers come from here.
- **`epics.md`** — the story this change came from, with its full criteria.
- **`prds/prd.md`** — only if you need the why behind a requirement.

And also:

- **`docs/architecture-base.md`** — organization constraints; it overrides any default you would
  assume, and overrides ARCHITECTURE-SPINE if they contradict (say so if that happens).
- the code map, **if available** (see below)
- Engram for related prior decisions, **if available** (see below)

Skipping the planning artifacts is this flow's most expensive waste: it means redesigning from
scratch what was already decided, reviewed and approved.

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

## Step 3 — Build against the spec

**This is the only phase that writes product code.** You build it here, against the contract
that already exists. There are no intermediate phases to orchestrate.

The spec **is** the specification. Every `#### Scenario:` in `specs/**/spec.md` is a test case
that must have a test exercising it. `tasks.md` is the checklist.

1. Implement each task in `tasks.md`, respecting the Step 2 constraints.
2. Write the test for each scenario. A scenario with no test is an unverified requirement.
3. **Do not invent new criteria.** If something is missing, it is missing from the spec, and
   that gets fixed through `/sw:change`, not here.
4. If the change needs deep technical decisions — a new pattern, an external dependency, a
   migration, something cross-cutting — write `design.md` in the change folder before coding.
   **Only if it applies**: OpenSpec asks for it conditionally, not by default.

### If the user already has Gentle-AI

This tool **does not install or configure it** — that would touch their global configuration and
clash with their own install. But if `gentle-ai` is on this machine's PATH, its review skills
exist and are worth offering when closing (never imposing): `work-unit-commits`, `judgment-day`,
`branch-pr` / `chained-pr`, and the `review-readability` / `review-reliability` /
`review-resilience` / `review-risk` subagents.

**Check before naming them.** Suggesting a skill that does not exist is the same silent failure
as invoking graphify and having nothing happen.

## Step 4 — Close out

1. Tick the `tasks.md` boxes that are genuinely done
2. `npx un-specweaver validate`
3. Record the implementation decisions that are not obvious from the code (see "Memory" below)
4. **Close the story**: `npx un-specweaver close <change-id>`. It validates and archives; the
   delta moves into `.un-specweaver/openspec/specs/` and becomes the baseline. **Not optional, not "when
   delivered"**: a finished story left unclosed leaves `/sw:change` with nothing to measure
   against. If you decide not to close (the story awaits review, say), say so explicitly and
   why; `doctor` keeps flagging it until it is closed
5. The graphify hook rebuilds the graph on commit. If you have not committed yet, run `graphify update .`
   so the next change sees the new code
6. `/sw:status` (or `npx un-specweaver status --open`) to see what is done and what is next: the
   current wave, what can start now, and whether anything was finished but not closed

## Decision memory (Engram)

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

## Boundary

One change at a time. If something outside the change's scope surfaces while building,
**do not fold it in**: note it and route it through `/sw:change`. A change that grows
mid-build is a change that no longer matches its spec.
