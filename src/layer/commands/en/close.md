---
name: close
title: "UB: Close finished stories"
description: "Closes finished stories: validates their spec and archives it, which is what turns the contract into the system baseline. Without it there is nothing to measure scope against."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Glob, Grep
---

# /sw:close — close finished stories

Building is not closing. A story is **finished** when its tasks are done; it is **closed** when
its spec has been archived and moved into `.un-specweaver/openspec/specs/`: the baseline `/sw:change` measures
everything that comes later against. Real case: 22 stories finished, zero closed, and
`/sw:change` with nothing to compare to.

Ids come in `$ARGUMENTS`. Empty = every finished one.

## Step 1 — See what there is

```
npx un-specweaver close
```

Lists the changes with **every** task checked and not archived. If one has half-checked tasks
the user considers finished, have them check the boxes first: a box is the developer's claim,
and closing does not invent it.

## Step 2 — Close

```
npx un-specweaver close --done          # every finished one
npx un-specweaver close <id> [<id>...]  # only those
```

For each it runs `openspec validate --strict` and, if it passes, `openspec archive`. **A change
that does not validate is not archived**: archiving a broken contract would make it the truth.

## Step 3 — If something fails

The `validate` error points at the spec, but the spec is derived: **the problem is in
`epics.md`**. Fix the story there and regenerate with `npx un-specweaver bridge --only N.M --force`
(it keeps the checked boxes). Do not patch the spec by hand.

## Step 4 — Confirm

`npx un-specweaver status`: the "specs archived" tile should no longer be amber. If you commit,
`.un-specweaver/openspec/specs/` and `.un-specweaver/openspec/changes/archive/` go to the repo: they are the product.
