---
name: adopt
title: "UB: Adopt an existing project"
description: "Brings an existing project into this flow: scans what is there, agrees the scope with the user, maps the real code, raises a brownfield PRD and fixes a scoped spec baseline."
allowed-tools: Bash(npx:*), Bash(git:*), Bash(graphify:*), Read, Write, Edit, Glob, Grep
---

# /sw:adopt — an existing project

Two mistakes sink this phase, and both are expensive:

1. **Planning against what you THINK the code does.** That is why it is scanned and mapped before
   anything gets written.
2. **Trying to specify the whole system before touching it.** Weeks writing contracts for code
   nobody may ever read. The baseline is scoped to what will be worked on; the rest comes in when
   it gets touched.

## Step 1 — Start from the adoption brief

```
npx un-specweaver context
```

If `adoption-brief.md` exists, **read it first and in full**: `un-specweaver adopt` generated it
and it carries what was agreed with the user, the scan evidence, the documents the team brought
from outside the repo (`inputs/`) and the capability candidates. It is the input that avoids
starting from zero.

If it does **not** exist, ask for it before continuing:

```
npx un-specweaver adopt --input <doc-or-folder>   # repeatable
```

It asks what has to be decided and leaves the brief. Meanwhile you can look at
`npx un-specweaver scan`, which is the same evidence without the answers. If the project is
already partly adopted, the plan says so: do not redo what is done.

## Step 2 — Confirm the scope (before touching a file)

If the brief already carries the answers, **confirm them in one sentence** and move on. If one is
empty, ask it now. Do not answer them for the user and do not assume the recommended option: they
change everything that follows.

The most important one is always **scope**. On a large project the cheap answer is *"only the area
I am about to work on"*, and then everything that follows is limited to that area. Say it out
loud: **adopting is incremental**, not a big bang. What is not specified today is not forbidden,
it is pending the story that touches it.

Close this step by summarizing in one sentence what will be adopted and what will not. If the user
does not answer, do not continue: without an agreed scope, the rest is work without a destination.

## Step 3 — Map what actually exists

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

## Step 4 — Real architecture vs declared architecture

1. Derive the **real** architecture from the graph: layers, boundaries, dependencies, where the
   domain lives.
2. Contrast it against `docs/architecture-base.md`. If the scan said it is still the **unfilled
   template**, fill it now with the user: an agent reading an empty template treats it as doctrine.
3. **Write the differences down explicitly.** Do not silence them or "fix" them mentally.

Each difference is one of three things, and which one must be decided before moving on:
- known technical debt → documented and left alone
- the base is out of date → update `docs/architecture-base.md`
- a real violation → becomes a remediation epic

## Step 5 — Brownfield PRD, of the agreed scope

`bmad-document-project` to capture what the system does today, then `bmad-prd` on top of that.
Use **the brief's `inputs/`** and the documentation the scan found as input: what the team already
wrote is worth more than anything you can deduce from the code, and correcting a draft is cheaper
than writing from scratch.

Rules:
- the brownfield PRD describes **what exists**, not what you wish existed; new things come later
  through `/sw:change`
- **only the scope agreed in Step 2.** If something outside shows up, note it as pending, do not
  pull it in

## Step 6 — Spec baseline

Epics and stories for the scope (`bmad-create-epics-and-stories`), then the bridge:

```
npx un-specweaver bridge --strict
npx un-specweaver validate
```

For code that **already works**, the resulting changes describe existing behavior: closing them
with `npx un-specweaver close --done` moves them into `.un-specweaver/openspec/specs/` and they
become the baseline. That baseline is what `/sw:change` measures the scope of everything that
comes later against; without it, scope control has nothing to compare to.

If a story describes behavior that is already implemented and verified, tick its tasks and close
it: do not rebuild what already exists. Say so out loud when you do.

## Step 7 — Confirm and carry on

```
npx un-specweaver status --open
```

Show the user what was adopted, what was deliberately left out of scope, and what comes next.
From here on: new things through `/sw:change`, defects through `/sw:bug`, tickets through
`/sw:ticket`, and widening the scope means running this command again on another area.
