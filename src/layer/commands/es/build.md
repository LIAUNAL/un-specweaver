---
name: build
title: "UB: Construir un change"
description: "Entrega un change de OpenSpec al flujo SDD para implementarlo, verificando primero que sus dependencias esten satisfechas."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Write, Edit, Glob, Grep, Bash
---

# /sw:build — construir un change

El change-id viene en `$ARGUMENTS`. Si viene vacio, muestra la ola actual de
`.un-specweaver/sprint-plan.md` y pregunta cual.

**Esta es la unica fase que escribe codigo de producto.** Las skills constructoras de BMAD estan
podadas de este proyecto a proposito: si buscas `bmad-build` o `bmad-agent-dev` y no aparecen,
no es un error.

## Paso 0 — Verificar que el entorno de construccion esta completo

`npx un-specweaver doctor`. Aqui **si** bloquean los pasos de memoria y mapa del codigo
(`engram-bin`, `engram-project`, `graphify-bin`, `graphify`): sin ellos construis sin rationale
y explorando a ciegas. Si estan en "falta", resuelvelos con `npx un-specweaver init`.

## Paso 1 — Verificar que se puede empezar

Antes de escribir nada:

1. Busca el change en `.un-specweaver/sprint-plan.md`. Si declara `depende de`, verifica que **cada**
   dependencia este archivada (`.un-specweaver/openspec/changes/archive/`) o con su `tasks.md` completo.
2. Si una dependencia no esta lista, **detente y dilo**. Construir sobre un spec que todavia
   puede cambiar es trabajo que se va a botar.
3. Lee el change completo: `proposal.md`, `specs/**/spec.md`, `tasks.md`.

## Paso 2 — Cargar el contexto correcto

```
npx un-specweaver context
```

Lista los artefactos que BMAD ya produjo, en sus rutas reales (son fechadas y configurables,
no las adivines). **Cargalos antes de diseñar**:

- **`architecture/ARCHITECTURE-SPINE.md`** — decisiones tecnicas ya tomadas y revisadas.
  **Vinculantes.** El diseño del SDD no las rediscute: las implementa.
- **`ux-designs/DESIGN.md` y `EXPERIENCE.md`** — diseño y experiencia. **Vinculantes**
  para todo lo visual y de interaccion. Los UX-DR que cubre esta story salen de aqui.
- **`epics.md`** — la story de la que salio este change, con sus criterios completos.
- **`prds/prd.md`** — solo si necesitas el porque de un requisito.

Y ademas:

- **`docs/architecture-base.md`** — restricciones de la organizacion; manda sobre cualquier
  default que asumirias, y sobre el ARCHITECTURE-SPINE si se contradicen (dilo si pasa).
- el mapa del codigo, **si esta disponible** (ver abajo)
- Engram para decisiones previas relacionadas, **si esta disponible** (ver abajo)

Saltarse los artefactos de planeacion es el desperdicio mas caro de este flujo: significa
rediseñar desde cero lo que ya se decidio, se reviso y se aprobo.

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

## Paso 3 — Construir contra el spec

**Esta es la unica fase que escribe codigo de producto.** Construis vos, aqui, contra el
contrato que ya existe. No hay fases intermedias que orquestar.

El spec **es** la especificacion. Cada `#### Scenario:` de `specs/**/spec.md` es un caso de
prueba que tiene que tener un test que lo ejerza. `tasks.md` es el checklist.

1. Implementa cada tarea de `tasks.md` respetando las restricciones del Paso 2.
2. Escribi el test de cada escenario. Un escenario sin test es un requisito sin verificar.
3. **No inventes criterios nuevos.** Si algo falta, falta en el spec, y eso se arregla por
   `/sw:change`, no aqui.
4. Si el change necesita decisiones tecnicas de fondo — patron nuevo, dependencia externa,
   migracion, cosa que atraviesa modulos — escribi `design.md` en la carpeta del change antes
   de programar. **Solo si aplica**: OpenSpec lo pide condicional, no por defecto.

### Si el usuario ya tiene Gentle-AI

Esta herramienta **no lo instala ni lo configura** — tocaria su configuracion global y
chocaria con su propia instalacion. Pero si `gentle-ai` esta en el PATH de esta maquina, sus
skills de revision existen y valen la pena ofrecerlas al cerrar (nunca imponerlas):
`work-unit-commits`, `judgment-day`, `branch-pr` / `chained-pr`, y los subagentes
`review-readability` / `review-reliability` / `review-resilience` / `review-risk`.

**Compruébalo antes de nombrarlas.** Sugerir una skill que no existe es el mismo fallo
silencioso que invocar graphify y que no pase nada.

## Paso 4 — Cerrar

1. Marca las casillas de `tasks.md` que quedaron hechas de verdad
2. `npx un-specweaver validate`
3. Registra las decisiones de implementacion que no son obvias desde el codigo (ver "Memoria" abajo)
4. **Cierra la story**: `npx un-specweaver close <change-id>`. Valida y archiva; el delta pasa a
   `.un-specweaver/openspec/specs/` y se vuelve la linea base. **No es opcional ni "cuando este entregado"**: una
   story terminada sin cerrar deja a `/sw:change` sin contra que medir. Si decides no cerrar
   (por ejemplo, la story espera revision), dilo explicitamente y por que; `doctor` lo va a
   seguir marcando hasta que se cierre
5. El hook de graphify reconstruye el grafo al commitear. Si no commiteaste todavia, `graphify update .`
   para que el siguiente change vea el codigo nuevo
6. `/sw:status` (o `npx un-specweaver status --open`) para ver que quedo y que sigue: la ola
   actual, que se puede empezar ya, y si algo quedo terminado sin cerrar

## Memoria de decisiones (Engram)

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

## Frontera

Un change a la vez. Si aparece algo fuera del alcance del change mientras construyes,
**no lo metas aqui**: anotalo y sacalo por `/sw:change`. Un change que crece a mitad de
construccion es un change que ya no corresponde a su spec.
