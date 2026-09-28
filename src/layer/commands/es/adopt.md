---
name: adopt
title: "UB: Adoptar proyecto existente"
description: "Trae un proyecto que ya existe a este flujo: mapea el codigo real, deriva su arquitectura, levanta un PRD brownfield y fija una linea base de specs."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Write, Edit, Glob, Grep
---

# /sw:adopt — proyecto existente

El error tipico es planear sobre lo que **crees** que hace el codigo. Aqui se mapea primero.

## Fase 1 — Mapear lo que existe de verdad

El error tipico de esta fase es planear contra lo que crees que hace el codigo.

## Mapa del codigo (graphify)

graphify es **parte del metodo**, no una capacidad opcional: `init` lo instala, deja la skill en el
proyecto, acota el grafo a **solo codigo** con `.graphifyignore`, construye el grafo AST y deja un
hook que lo reconstruye en cada commit. El grafo es el unico testigo de la estructura **real** del
codigo — no leyo el PRD ni la arquitectura declarada, a proposito.

Resuelve en este orden y **di cual rama tomaste**:

1. **Existe `graphify-out/graph.json`** → consultalo: `graphify query "<pregunta>"` para contexto,
   `graphify affected "<simbolo o archivo>"` para saber que depende de algo, `graphify path "A" "B"`
   para la ruta entre dos piezas. No leas archivos a ciegas cuando hay grafo.
2. **No hay grafo pero `graphify` esta en PATH** → constrúyelo: `graphify update .` (AST, segundos,
   sin LLM). Si el proyecto no tiene codigo todavia, es normal que no exista; sigue.
3. **`graphify` no esta en PATH** → `npx un-specweaver doctor` dice que falta y `npx un-specweaver init`
   lo resuelve. Si no se puede ahora, sigue con Glob/Grep/Read y **avisa explicitamente que el
   mapa va a ser menos confiable**.

El unico error grave es el silencioso: invocar graphify, que no pase nada, y seguir como si
tuvieras el mapa. **No amplíes el grafo a docs** (`/graphify .` completo sobre PRD o specs):
esas capas tienen otro dueño y duplicarlas en el grafo es como empiezan a contradecirse.

**La excepcion de brownfield:** si el proyecto trae docs tecnicos *anteriores al metodo* (README de
arquitectura, ADRs viejos, wikis), contrastarlos contra el codigo es justamente el diagnostico de
esta fase. Ahi vale correr `/graphify <carpeta-de-esos-docs>` **una vez, preguntando primero**
(usa LLM y tokens), y quitar esa carpeta de `.graphifyignore` solo mientras dure la adopcion.

## Fase 2 — Arquitectura real vs arquitectura declarada

1. Deriva del grafo la arquitectura **real**: capas, fronteras, dependencias, donde vive el dominio.
2. Contrastala contra `docs/architecture-base.md`.
3. **Escribe las diferencias explicitamente.** No las silencies ni las "corrijas" mentalmente.

Cada diferencia es una de tres cosas, y hay que decidir cual antes de seguir:
- deuda tecnica conocida → se documenta y se deja
- la base esta desactualizada → se actualiza `docs/architecture-base.md`
- violacion real → se convierte en un epic de remediacion

## Fase 3 — PRD brownfield

`bmad-document-project` para levantar lo que el sistema hace hoy, y luego `bmad-prd` sobre eso.

Regla: el PRD brownfield describe **lo que existe**, no lo que quisieras que existiera. Lo nuevo
entra despues por `/sw:change`.

## Fase 4 — Linea base de specs

Para cada capability que ya funciona, escribe su spec en `openspec/specs/<capability>/spec.md`
con `## Purpose` y sus `### Requirement:` en presente. Esta linea base es contra lo que
`/sw:change` va a medir el alcance de todo lo que llegue despues; sin ella, el control de
alcance no tiene contra que comparar.

Verifica: `npx un-specweaver validate`

## Fase 5 — De aqui en adelante

El proyecto ya esta en el flujo. Lo nuevo entra por `/sw:change`, los tickets por `/sw:ticket`,
y epics nuevos con `bmad-create-epics-and-stories` + `npx un-specweaver bridge`.
