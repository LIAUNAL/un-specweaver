---
name: doctor
title: "UB: Diagnostics"
description: "Check that the environment is complete and coherent: install steps, vendor drift, and consistency between the plan and the specs."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Glob, Grep
---

# /sw:doctor — diagnostics

## Step 1 — Environment

```
npx un-specweaver doctor
```

Interpret the output for the user rather than just pasting it:

- steps reading missing → each one states **what it blocks**. "required to plan" is a real
  blocker; "only blocks /sw:build" does not prevent gathering requirements. Do not report every
  pending step as equivalent: doctor's last line already distinguishes the two cases, respect it.
- `DRIFT` on vendors → what it implies and whether it is urgent (see `/sw:sync`)
- preflight `FAIL` → blocking, nothing else will work
- `uv` absent → **not** blocking for planning; BMAD resolves its config without it, just slower.
  But `init` needs it (or pipx) to install graphify: if `graphify-bin` is missing, that is why
- `graphify-bin` / `graphify` missing → block **only** `/sw:build`. Without a graph the code is
  explored blind; `npx un-specweaver init` fixes it. "configured; the graph appears with the
  first code" on a new project is correct, not pending
- the `optional` section → Engram. Absent is **not** an error: rationale goes to `design.md`

## Step 2 — Flow coherence

The CLI does not check this. Verify by hand:

**Complete traceability.** Every PRD FR must appear in `.un-specweaver/trace.json`.
An FR with no change is a requirement nobody will build.

**No orphan specs.** Every change in `.un-specweaver/openspec/changes/` must have an entry in `trace.json`.
One without it was created by hand outside the bridge: it has no story behind it and will not
survive the next regeneration.

**Architecture baseline filled in.** If `docs/architecture-base.md` is still the template, say so:
every design phase is running without the organization's constraints.

**Boundary intact.** Verify the pruned skills have not reappeared. An `un-specweaver init` without
`--force` will not bring them back, but a hand-run `bmad-method install` will.

## Step 3 — Valid specs

```
npx un-specweaver validate
```

## Step 4 — Summarize

One paragraph: what is fine, what is broken, and **what the next concrete action is**.
If everything is fine, say it in one line and stop.
