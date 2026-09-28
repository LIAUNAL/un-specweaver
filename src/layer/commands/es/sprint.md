---
name: sprint
title: "UB: Plan de sprint"
description: "Recalcula las olas de trabajo paralelo y reparte los changes entre desarrolladores segun sus dependencias reales."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Glob, Grep
---

# /sw:sprint — planear el sprint

## Paso 1 — Recalcular el plan

```
npx un-specweaver bridge --dry-run
```

`--dry-run` recalcula el grafo sin sobrescribir changes en vuelo. Luego lee
`.un-specweaver/sprint-plan.md`.

## Paso 2 — Estado real de cada change

El plan de olas sale del grafo de dependencias, no del avance. Cruzalo con la realidad:

- `npx un-specweaver status` — que changes existen y como van
- `.un-specweaver/openspec/changes/<id>/tasks.md` — cuantas casillas van marcadas
- `.un-specweaver/openspec/changes/archive/` — que ya se cerro

Una ola cuyos changes ya estan archivados esta hecha, aunque el plan la siga mostrando.

## Paso 3 — Repartir

Regla de asignacion: **un desarrollador, un change a la vez.** Las stories estan dimensionadas
para eso; dos changes en paralelo por persona es lo que produce specs desincronizados.

Dentro de una ola todo es paralelizable. Entre olas, no.

## Paso 4 — Decir el limite en voz alta

El grafo asume que los epics son independientes. Una dependencia entre epics que **no** este
escrita en el texto de la story no aparece en las olas.

Antes de repartir trabajo paralelo, revisa las stories de la ola: si dos tocan la misma area del
sistema y estan en epics distintos, verificalo a mano contra `.un-specweaver/trace.json`. Es el unico
punto ciego conocido de este flujo, y es barato de revisar.

## Paso 5 — Mostrarlo

`npx un-specweaver status --open`: la seccion Flujo con filtro por epic y el canvas de stories es
la version visual de este reparto; sirve para acordarlo con el equipo.

## Paso 6 — Opcional

`bmad-sprint-planning` para la ceremonia completa (capacidad, prioridad de negocio, compromiso).
El plan de olas le da las dependencias tecnicas; BMAD le pone el resto.
