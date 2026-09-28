---
name: status
title: "UB: En que va el proyecto"
description: "Muestra en que va el proyecto: fases, changes con avance, olas del sprint, requisitos con cobertura e inestabilidad, decisiones e historial. Interpreta, no solo pega."
allowed-tools: Bash(npx:*), Read, Glob, Grep
---

# /sw:status — en que va el proyecto

```
npx un-specweaver status            # terminal
npx un-specweaver status --open     # .un-specweaver/dashboard.html en el navegador
```

Es una **vista derivada** de lo que ya esta en disco — PRD y memlogs de BMAD, `trace.json`,
`.un-specweaver/openspec/changes/` y su `archive/`, `sprint-plan`, `changelog.jsonl`, el grafo de graphify.
No guarda nada y se regenera cada vez; si algo se ve mal, esta mal en la fuente, no aqui.

## Interpreta, no pegues

Lo que el usuario necesita saber, en este orden:

1. **En que fase esta el proyecto** y que artefacto lo prueba. Una fase "en curso" a medias
   (arquitectura sin UX, por ejemplo) se dice explicitamente.
2. **Que se puede empezar ya.** La ola actual y sus changes en "se puede empezar". Si un change
   esta bloqueado, por cual, y si ese bloqueo es real (archivado o no).
3. **Que requisitos estan inestables.** Un FR con 3 o mas cambios es un FR que nadie entiende
   igual; sugiere `npx un-specweaver history <FR>` y, si se va a tocar, releer sus decisiones.
4. **FR sin story.** Es una brecha de trazabilidad: alguien decidio no cubrirlo, o se olvido.
   Pregunta cual.
5. **Changes con revision > 1.** Significa que algo ya construido cambio. Vale la pena saber si
   el codigo se actualizo despues.

## Lo que no dice

- No conoce el estado del codigo mas alla de las casillas de `tasks.md`. Una casilla marcada
  es una afirmacion del desarrollador, no una prueba.
- Las dependencias entre epics solo aparecen si estan escritas en la story (limite del plan).
- Si `Engram` esta "sin atar", las decisiones de construccion no estan segmentadas por proyecto:
  `npx un-specweaver init` lo resuelve.
