---
name: new
title: "UB: New project"
description: "Start a project from scratch: idea to PRD, to epics and stories, and from there to OpenSpec changes ready to build."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Write, Edit, Glob, Grep
---

# /sw:new — new project

Takes an idea from zero to verified OpenSpec changes. **It does not write product code.**
Building is `/sw:build`, in a separate conversation.

## Before you start

1. Run `npx un-specweaver doctor`. **Only stop if it says steps are blocking planning.**
   A pending step marked "only blocks /sw:build" does NOT prevent planning — Gentle-AI is
   needed to build, not to gather requirements. Doctor's last line tells you which case it is.
2. Read `docs/architecture-base.md` in full and keep it in context through every phase.
   If it is still the unfilled template, **say so and ask** whether to fill it now or proceed
   without it. Both are valid: without it you will make architecture decisions on your own, and
   the user deserves to know. **Do not stall waiting** — ask, then continue with their answer.

## Phase 1 — Land the idea

With the user, in this order. Each step feeds the next; do not skip or parallelize them.

1. `bmad-product-brief` — what problem, for whom, why now
2. `bmad-prd` — numbered functional (FR) and non-functional (NFR) requirements
3. `bmad-architecture` — technical decisions, **constrained by `docs/architecture-base.md`**
4. `bmad-ux` — design and experience. Produces the UX-DRs, which later map to stories more
   precisely than the FRs. Skipping it leaves the build with no visual contract.
5. `bmad-create-epics-and-stories` — epics and stories with Given/When/Then criteria

Everything lands in `.un-specweaver/bmad/`.

**About the two "designs" — they are not the same, and they are not done twice:**

| | `bmad-ux` | a change's `design.md` |
|---|---|---|
| What it is | product design: visual, interaction, experience | technical design: pattern, layers, dependencies |
| How often | **once** for the whole project | per change, and **only if it applies** |
| Lands in | `ux-designs/DESIGN.md` and `EXPERIENCE.md` | the change folder |
| Who uses it | every change respects it | only that change |

`design.md` is not written by default — OpenSpec asks for it conditionally: a new pattern, an
external dependency, a migration, or something cross-cutting. The bridge **does not generate it**
on purpose. Most changes do not need one.

**Quality gate before moving on.** BMAD writes to `{planning_artifacts}`, which defaults to
`.un-specweaver/bmad/planning-artifacts/epics.md` but is configurable — the bridge discovers it on its
own, do not assume the path. Open the file and verify by hand:
- every PRD FR appears in the FR Coverage Map
- every story has a complete `As a / I want / So that` narrative
- every story has at least one Given/When/Then block

The bridge is deterministic: what is not here does not exist downstream. An incomplete epics.md
produces incomplete specs silently.

## Phase 2 — Bridge

```
npx un-specweaver bridge --strict
```

`--strict` aborts if any story came out incomplete instead of generating half-formed specs.
If it aborts, go back to Phase 1 and fix epics.md — **do not patch the output**.

Generates one change per story, `.un-specweaver/trace.json` (FR ↔ story ↔ change traceability) and
`.un-specweaver/sprint-plan.md` (parallel work waves).

## Phase 3 — Verify

```
npx un-specweaver validate
```

It must be fully green. If it fails, the problem is in epics.md, not in the generated spec.

## Phase 4 — Hand over the plan

Show the user:
- how many epics, stories and changes came out
- the waves from `.un-specweaver/sprint-plan.md` and what can run in parallel
- the known limit: cross-epic dependencies are only detected when written in the story text

Close with `npx un-specweaver status --open`: the dashboard with the freshly generated plan is the
best way to show it to someone who does not know the method. Stop there. Building starts with
`/sw:build <change-id>`.
