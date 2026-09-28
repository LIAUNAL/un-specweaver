---
name: change
title: "UB: Requerimiento nuevo"
description: "Procesa un requerimiento que llega a mitad del desarrollo: primero controla el alcance, luego actualiza el documento fuente y regenera solo lo afectado."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Write, Edit, Glob, Grep
---

# /sw:change — requerimiento nuevo a mitad del desarrollo

Este es el caso que mas se rompe si se hace a ojo. **El orden no es negociable.**

El requerimiento viene en `$ARGUMENTS`. Si viene vacio, pidelo antes de hacer nada.

## Paso 1 — Control de alcance (antes de tocar un solo archivo)

Lee `.un-specweaver/trace.json` y el PRD. Y antes de clasificar, **mira la historia del requisito
que toca**:

```
npx un-specweaver history            # ranking: que requisitos han cambiado mas, y cuanto
npx un-specweaver history FR-21      # todo lo que se decidio, cambio o descarto sobre ese FR
```

Cruza los `.memlog.md` que BMAD escribe al conversar (decisiones, cambios, descartes con motivo),
las `sprint-change-proposal-*.md` y el historial del puente. Si lo que te piden **ya se descarto**,
dilo con la entrada y su motivo antes de reabrirlo: reabrir una decision sin saber que existio es
la forma mas cara de perder tiempo. Un FR con muchos cambios es un FR que nadie entiende igual;
si es el caso, dilo tambien.

Clasifica el requerimiento en **una** de tres:

| Clasificacion | Como se reconoce | Que sigue |
|---|---|---|
| **Dentro del alcance** | refina un FR que ya existe; no agrega comportamiento nuevo | Paso 2 |
| **Scope creep** | comportamiento nuevo que el PRD no contempla, pero cabe en un epic existente | **Detente y dilo.** Espera decision. |
| **Epic nuevo** | capability nueva completa | **Detente.** Esto vuelve a planeacion, no es un parche. |

Di la clasificacion en voz alta, con el FR o la story concreta que la sustenta. Si dudas entre
dos, elige la mas restrictiva y explica por que.

**Mide el impacto en el codigo real, no el imaginado.** Si hay `graphify-out/graph.json`, corre
`graphify affected "<modulo o simbolo que toca el requerimiento>"` y reporta que depende de eso:
un "dentro del alcance" que arrastra cinco modulos no es tan dentro del alcance. Si no hay grafo,
`graphify update .` lo construye en segundos; si graphify no esta, dilo y sigue.

**No sigas al Paso 2 sin que el usuario confirme una clasificacion que no sea "dentro del alcance".**

## Paso 2 — Actualizar el documento fuente, no el derivado

Si cambia el comportamiento, cambia el PRD/epics con `bmad-correct-course`.

Editar el spec sin actualizar el PRD deja los dos mintiendo: el spec dice una cosa, el PRD otra,
y en tres semanas nadie sabe cual manda. El spec es **derivado** del epics.md — se regenera, no
se edita a mano.

## Paso 3 — Regenerar solo lo afectado

```
npx un-specweaver bridge --only <N.M> --force
```

Un `--only` por cada story tocada. **No regeneres todo**: sobreescribirias changes en vuelo que
otros desarrolladores ya estan trabajando.

El puente sabe que esta regenerando, no creando:

- si el change existe y esta en curso, **conserva las casillas marcadas** de `tasks.md` y te dice
  cuales se perdieron porque la tarea cambio de texto
- si el requisito **ya esta archivado** (vive en `.un-specweaver/openspec/specs/`), emite `## MODIFIED Requirements`
  en un change nuevo `<id>-r2`, `-r3`… — el anterior sigue en `archive/`. Reutiliza los nombres de
  escenario archivados porque OpenSpec los exige; el contenido si se actualiza
- si la story **perdio** un escenario ya archivado, el puente **falla y no escribe**: OpenSpec no
  permite quitarlo en un `MODIFIED`. Sigue la instruccion que imprime (conservar el criterio, o
  un change manual `## REMOVED Requirements` archivado antes de regenerar). No lo parches a mano
- `trace.json` se fusiona: las stories que no tocaste conservan su entrada
- cada corrida queda en `.un-specweaver/changelog.jsonl`: es el historial de que se regenero cuando

Antes de correrlo, revisa `.un-specweaver/sprint-plan.md`: si la story afectada tiene dependientes en
olas posteriores, avisa cuales se ven impactados.

## Paso 4 — Reverificar

```
npx un-specweaver validate
```

## Paso 5 — Registrar el por que

Engram es **opcional**, y su memoria vive **dentro del proyecto**: `.un-specweaver/engram` es
una base propia, no una etiqueta sobre una base compartida. Lo que guardes aqui no existe para
ningun otro proyecto, y borrar `.un-specweaver/` lo borra.

**Limite conocido, y el unico modo de fallo real:** si el usuario tiene el **plugin global de
Engram** en Claude Code, sus herramientas viven en otro namespace (`mcp__plugin_engram_*`) y
siguen escribiendo en `~/.engram`, fuera del proyecto. Ninguna configuracion de proyecto lo
vence. Si ves dos juegos de herramientas de memoria, **usa las del proyecto y dilo**; guardar el
rationale en la base equivocada es perderlo sin enterarte. `npx un-specweaver doctor` lo reporta.

- **Si `engram` esta en PATH** → guarda ahi la decision y su razon.
- **Si no esta** → escribela igual, en `design.md` del change bajo `## Decisions`, y **avisa
  al usuario** que se guardo ahi porque Engram no esta instalado.

Lo que no se vale es invocar Engram, que no pase nada, y perder el rationale en silencio.
Un "por que" que no quedo escrito en ningun lado se pierde igual que si nunca se hubiera pensado.

Guarda la **decision y su razon**, no el que (eso ya esta en el spec). Lo que se pierde
siempre es por que se acepto o se rechazo un cambio de alcance.

Si el cambio se rechazo por scope creep, registralo igual: la proxima vez que alguien lo proponga,
esa decision ahorra la discusion completa.
