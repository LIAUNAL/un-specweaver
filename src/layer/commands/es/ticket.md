---
name: ticket
title: "UB: Clasificar un ticket"
description: "Lee un issue de GitHub, decide si es defecto o requerimiento, y lo enruta al flujo que corresponde. No lo resuelve."
allowed-tools: Bash(gh:*), Bash(npx:*), Read, Glob, Grep
---

# /sw:ticket — clasificar y enrutar

**Este comando no resuelve nada.** Lee, clasifica y te dice a cual de los dos flujos va.
La resolucion la hacen `/sw:bug` o `/sw:change`, que trabajan distinto a proposito.

El numero de issue viene en `$ARGUMENTS`. Si viene vacio, lista los abiertos con
`gh issue list` y pregunta cual.

## Paso 1 — Leer completo

```
gh issue view <n> --comments
```

Los comentarios importan: el alcance real suele estar en la discusion, no en el titulo.

## Paso 2 — Clasificar

Busca en `.un-specweaver/openspec/specs/` el requisito relacionado. El criterio es binario:

| | Defecto | Requerimiento |
|---|---|---|
| El spec dice | lo correcto | no contempla el caso |
| Lo que falla | la implementacion | lo acordado |
| Control de alcance | **no aplica** | **obligatorio** |
| Toca el PRD | no | si |
| Va a | `/sw:bug` | `/sw:change` |

Casos que no son ninguno de los dos, y hay que nombrar en vez de forzar:

- **El spec es ambiguo** (dos lecturas razonables) → es requerimiento: hay que precisar
- **No existe requisito relacionado** → la linea base tiene un hueco. Decilo: puede que la
  funcionalidad exista sin estar especificada, que es un problema aparte
- **Es una pregunta, no un pedido** → contestala y cierra el issue; no genera change

## Paso 3 — Enrutar

Di la clasificacion **con el requisito concreto que la sustenta**, y el comando que sigue:

```
Defecto — viola "Requirement: <nombre>" en specs/<capability>/
  → /sw:bug <descripcion>

Requerimiento — ningun requisito cubre <caso>
  → /sw:change "<descripcion>"
```

Si dudas entre los dos, elegi **requerimiento**: pasar por control de alcance de mas cuesta
una conversacion; saltarselo de menos mete comportamiento nuevo sin que nadie lo apruebe.

## Paso 4 — Dejar rastro

Comenta en el issue la clasificacion y el razonamiento, aunque todavia no exista el change.
Un ticket que entra a un flujo interno sin dejar rastro es un ticket que se vuelve a abrir.
