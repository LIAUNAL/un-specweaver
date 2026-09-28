---
name: un-specweaver
description: "Spec-driven development flow joining BMAD (planning) with OpenSpec/SDD (execution). Use when starting a project, adopting an existing one, processing new requirements or tickets, planning sprints, and building."
---

# un-specweaver

Joins the planning half of **BMAD METHOD** with the execution half of **OpenSpec / SDD**.
The bridge between them is deterministic: do not improvise it, run it.

## Commands

| Command | When |
|---|---|
| `/sw:new` | project from scratch |
| `/sw:adopt` | project that already exists |
| `/sw:change "<req>"` | new requirement: changes what was agreed, **goes through scope control** |
| `/sw:bug "<defect>"` | defect: what was agreed is right, the implementation does not meet it |
| `/sw:ticket <n>` | GitHub issue: classifies and routes to one of the two above |
| `/sw:sprint` | assign work by real dependencies |
| `/sw:build <change-id>` | build a change |
| `/sw:sync` | update vendors in a controlled way |
| `/sw:status` | where the project stands: phases, changes, sprint, requirements, decisions |
| `/sw:close [id]` | close finished stories: validate and archive their spec (the baseline) |
| `/sw:doctor` | environment and flow diagnostics |

In OpenCode the same commands are `/sw-new`, `/sw-change`, and so on.
If the user describes one of these situations without invoking the command, suggest it.

## Defect and requirement are two flows, not one

The difference is not size or urgency:

- **Defect** — the spec says the right thing, the implementation does not meet it. Does not
  touch the PRD. **No scope control**: what was agreed does not change.
- **Requirement** — the spec does not cover the case. It changes what was agreed, so it **does**
  go through scope control before touching a file.

When in doubt, treat it as a requirement: going through scope control unnecessarily costs one
conversation; skipping it lets new behavior in with nobody approving it.

## Boundary rule

BMAD **ends at the story**. From there the contract is the OpenSpec spec, and building happens
against it, directly: there are no intermediate phases to orchestrate.

Gentle-AI is **not installed** by this setup: it would touch the user's global configuration and
clash with their own install. If it happens to be on PATH, its review skills (`judgment-day`,
`work-unit-commits`, `branch-pr`) can be offered when closing — but check before naming them.
`bmad-agent-dev`, `bmad-build`, `bmad-build-auto` and `bmad-spec` are pruned from this
installation on purpose. If you cannot find them, that is not an error: do not look for BMAD
developer agents, and do not use `bmad-spec` in place of OpenSpec.

## Source of truth per kind of data

Before looking for something, know where it lives. Do not duplicate across layers.

| Data | Where it lives | Do not look in |
|---|---|---|
| Product intent (the business *what*) | `.un-specweaver/bmad/` (PRD, epics) | the specs |
| Behavior contract (the technical *what*) | `.un-specweaver/openspec/specs/` | the PRD |
| Decisions and rationale (the *why*) | Engram **if present**, else `design.md` | the docs |
| History of a requirement (what changed and why) | BMAD `.memlog.md` + `sprint-change-proposal-*.md` + `changelog.jsonl`, via `un-specweaver history <FR>` | the agent's memory |
| Code structure (the *where*) | graphify graph **if present** | reading files blind |
| Traceability FR ↔ story ↔ change | `.un-specweaver/trace.json` | anywhere else |
| Organization architecture | `docs/architecture-base.md` | inventing it |

Load `docs/architecture-base.md` in any design or build phase: it overrides any default you
would otherwise assume.

## Rules that apply across the whole flow

1. **Specs are derived.** They are regenerated from `.un-specweaver/bmad/planning-artifacts/epics.md` with
   `npx un-specweaver bridge`, not hand-edited. If a spec is wrong, epics.md is wrong.
2. **Scope is controlled before touching files**, not after. See `/sw:change`.
3. **One developer, one change at a time.** Stories are sized for exactly that.
4. **The spec's `#### Scenario:` blocks are the test cases.** Do not invent new criteria
   during the build.

## Project preferences win

`.un-specweaver/config.json` stores what the user chose at init time:

```json
"preferences": { "lang": "es" }
```

**Read them before deciding on your own.** Never ask about these in conversation: they are
already decided, and they change with `npx un-specweaver init --lang en`.

## Code map (graphify) — part of the method

`init` installs graphify, drops its skill into the project, scopes the graph to **code only** with
`.graphifyignore`, builds the AST graph (`graphify-out/graph.json`) and leaves a hook that rebuilds
it on every commit. It is the only witness of the **real** structure of the code.

- Graph exists → `graphify query`, `graphify affected`, `graphify path`. Do not read files blind.
- No graph → `graphify update .` (seconds, no LLM). With no code yet, that is normal.
- No graphify → `doctor` says so, `init` fixes it. If not possible now, carry on and **say so**.
- **Do not widen the graph to docs.** PRD, specs and memory have another owner (table above).

## Optional capabilities

**Engram** is installed by `init` (via Homebrew or `go install`). If `engram` is not on PATH,
write the rationale in the change's `design.md` under `## Decisions` and say so. Never lose it
silently.

Memory lives **inside the project**, at `.un-specweaver/engram`: not a label over a shared
database, a database of its own. Deleting the folder deletes the memory, and no other project
sees it. Known limit: if the user has the **global Engram plugin** in Claude Code, its tools live
in another namespace and keep writing to `~/.engram`. If you see two sets of memory tools, use
the project's and say so; `doctor` reports it.

**uv** (Python) is used by BMAD to resolve its configuration, and it is one of the two ways
(with pipx) `init` installs graphify. If BMAD cannot find it, its skills have a manual fallback.

## Known limit

The sprint plan assumes epics are independent. A cross-epic dependency not written in the story
text does not show up in the waves. Verify it by hand against `trace.json` before handing out
parallel work.
