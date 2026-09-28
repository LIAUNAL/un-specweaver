---
name: bug
title: "UB: Corregir un defecto"
description: "Corrige un defecto: el comportamiento especificado es correcto y la implementacion no lo cumple. No pasa por control de alcance."
allowed-tools: Bash(npx:*), Bash(git:*), Bash(gh:*), Read, Write, Edit, Glob, Grep, Bash
---

# /sw:bug — corregir un defecto

Un defecto y un requerimiento nuevo son **cosas distintas y se tratan distinto**. La diferencia
no es de tamaño ni de urgencia:

> **Es un defecto** si el comportamiento especificado en `.un-specweaver/openspec/specs/` es correcto y la
> implementacion no lo cumple. **Es un requerimiento** si el spec no contempla el caso.

Un defecto **no pasa por control de alcance**: lo acordado no cambia, solo no se cumplio.
Un requerimiento si, porque cambia lo acordado. Por eso son dos flujos.

El defecto viene en `$ARGUMENTS`. Si viene vacio, pedilo.

## Paso 1 — Encontrar el requisito violado

Busca en `.un-specweaver/openspec/specs/` el `### Requirement:` que la implementacion no cumple, y el
`#### Scenario:` concreto que falla.

**Si no lo encontras, detente.** Significa una de dos cosas, y hay que decidir cual:
- el spec no contempla el caso → **no es un defecto**, es un requerimiento: usa `/sw:change`
- el comportamiento nunca se especifico → la linea base de specs tiene un hueco; dilo

Reportar como defecto algo que nunca se especifico convierte el spec en ficcion.

## Paso 2 — Reproducirlo antes de tocar nada

Escribi el test que falla **primero**. Un defecto sin test que lo reproduzca es una hipotesis.

Para ubicar el codigo que implementa el escenario usa el grafo: `graphify query "<que hace el
escenario>"` y, antes de tocar, `graphify affected "<funcion o archivo>"` para saber que mas
puede romper la correccion. Si no hay grafo, `graphify update .`; si graphify no esta, dilo.

Si no podes reproducirlo, decilo en vez de arreglar a ciegas.

## Paso 3 — El change

Crea un change de OpenSpec para la correccion:

- `proposal.md` → en `## Why`, el requisito violado y como se manifiesta
- **No toques el PRD ni `epics.md`.** Lo especificado sigue siendo correcto: el spec no cambia,
  cambia el codigo. Esa es toda la diferencia con `/sw:change`.
- `## Capabilities` → la capability afectada, en Modified. Sin requisitos nuevos.
- `tasks.md` → la correccion, y el test que la fija para que no vuelva

Si el defecto revela que el spec era **ambiguo** —dos lecturas razonables— eso **si** es un
requerimiento: cambia a `/sw:change`, porque hay que precisar lo acordado.

## Paso 4 — Cerrar

1. El test que fallaba pasa; los demas siguen pasando
2. `npx un-specweaver validate`
3. Registra la causa raiz donde corresponda (ver "Memoria" en `/sw:build`)
4. `npx un-specweaver close <change-id>`

Si el defecto salio de un issue de GitHub, comenta ahi el change-id y cerralo.

## Lo que NO hace este comando

No mueve el alcance. Si a mitad de la correccion aparece "ya que estamos, agreguemos...",
eso es `/sw:change`. Un defecto que crece en alcance deja de ser un defecto y nadie se entera.
