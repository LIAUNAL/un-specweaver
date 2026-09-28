---
name: sync
title: "UB: Update the environment"
description: "Check for drift between pinned vendors and what is installed in this project, and update in a controlled way."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Glob
---

# /sw:sync — update the environment

BMAD, OpenSpec and graphify ship almost daily. This project pins them on purpose: an unwanted update
breaks the whole flow.

## Step 1 — See the state

```
npx un-specweaver doctor
```

Read the `vendors pineados` section:

- `ok` — installed matches pinned. Nothing to do.
- `DRIFT` — your un-specweaver version pins something different from what is installed
- `falta` — the vendor is not installed in this project

## Step 2 — Before updating

If the repo has uncommitted changes, say so and suggest committing first. The update rewrites
skills and commands; without a clean restore point there is no way back.

## Step 3 — Update

```
npx un-specweaver@latest init --force
```

Pulls the latest un-specweaver with its new pins and redoes the steps.

`docs/architecture-base.md` is **never** overwritten. In-flight OpenSpec changes are not touched
either: they live in `openspec/`, which this command does not modify.

## Step 4 — Verify nothing broke

```
npx un-specweaver doctor
npx un-specweaver validate
```

If a vendor changed format and specs no longer validate, revert with git and report which version
broke it. That fact is what lets you raise the pin confidently later.

## When NOT to update

Mid-sprint with in-flight changes. Wait for the wave to close.
