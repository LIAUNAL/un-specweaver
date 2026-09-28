---
name: un-specweaver
description: "Flujo de desarrollo dirigido por especificacion que une BMAD (planeacion) con OpenSpec/SDD (ejecucion). Usar al arrancar un proyecto, al adoptar uno existente, al procesar requerimientos o tickets nuevos, al planear sprints y al construir."
---

# un-specweaver

Une la mitad de planeacion de **BMAD METHOD** con la mitad de ejecucion de **OpenSpec / SDD**.
El puente entre ambos es deterministico: no lo improvises, ejecutalo.

## Comandos

| Comando | Cuando |
|---|---|
| `/sw:new` | proyecto desde cero |
| `/sw:adopt` | proyecto que ya existe |
| `/sw:change "<req>"` | requerimiento nuevo: cambia lo acordado, **pasa por control de alcance** |
| `/sw:bug "<defecto>"` | defecto: lo acordado esta bien, la implementacion no lo cumple |
| `/sw:ticket <n>` | issue de GitHub: clasifica y enruta a uno de los dos anteriores |
| `/sw:sprint` | repartir trabajo segun dependencias reales |
| `/sw:build <change-id>` | construir un change |
| `/sw:sync` | actualizar vendors de forma controlada |
| `/sw:status` | en que va el proyecto: fases, changes, sprint, requisitos, decisiones |
| `/sw:close [id]` | cerrar stories terminadas: validar y archivar su spec (la linea base) |
| `/sw:doctor` | diagnostico del entorno y del flujo |

En OpenCode los mismos comandos son `/sw-new`, `/sw-change`, etc.
Si el usuario describe una de esas situaciones sin invocar el comando, sugierelo.

## Defecto y requerimiento son dos flujos, no uno

La diferencia no es de tamaño ni de urgencia:

- **Defecto** — el spec dice lo correcto, la implementacion no lo cumple. No toca el PRD.
  **No pasa por control de alcance**: lo acordado no cambia.
- **Requerimiento** — el spec no contempla el caso. Cambia lo acordado, asi que **si** pasa
  por control de alcance antes de tocar un archivo.

Ante la duda, tratalo como requerimiento: pasar por control de alcance de mas cuesta una
conversacion; saltarselo de menos mete comportamiento nuevo sin que nadie lo apruebe.

## Regla de frontera

BMAD **termina en la story**. De ahi en adelante el contrato es el spec de OpenSpec, y la
construccion se hace contra el, directo: no hay fases intermedias que orquestar.

Gentle-AI **no se instala** en este montaje: tocaria la configuracion global del usuario y
chocaria con su propia instalacion. Si aun asi esta en el PATH, sus skills de revision
(`judgment-day`, `work-unit-commits`, `branch-pr`) se pueden ofrecer al cerrar — pero
compruébalo antes de nombrarlas.
`bmad-agent-dev`, `bmad-build`, `bmad-build-auto` y `bmad-spec` estan podados en esta
instalacion a proposito. Si no los encuentras, no es un error: no busques agentes
desarrolladores de BMAD ni uses `bmad-spec` en lugar de OpenSpec.

## Fuente de verdad por tipo de dato

Antes de buscar algo, sabe donde vive. No dupliques entre capas.

| Dato | Donde vive | No lo busques en |
|---|---|---|
| Intencion de producto (el *que* de negocio) | `.un-specweaver/bmad/` (PRD, epics) | los specs |
| Contrato de comportamiento (el *que* tecnico) | `.un-specweaver/openspec/specs/` | el PRD |
| Decisiones y rationale (el *por que*) | Engram **si existe**, si no `design.md` | los docs |
| Historia de un requisito (que cambio y por que) | `.memlog.md` de BMAD + `sprint-change-proposal-*.md` + `changelog.jsonl`, via `un-specweaver history <FR>` | la memoria del agente |
| Estructura del codigo (el *donde*) | grafo de graphify **si existe** | leyendo archivos a ciegas |
| Trazabilidad FR ↔ story ↔ change | `.un-specweaver/trace.json` | ningun otro lado |
| Arquitectura de la organizacion | `docs/architecture-base.md` | inventarla |

Carga `docs/architecture-base.md` en cualquier fase de diseno o construccion: manda sobre
cualquier default que asumirias.

## Reglas que aplican a todo el flujo

1. **Los specs son derivados.** Se regeneran desde `.un-specweaver/bmad/planning-artifacts/epics.md` con
   `npx un-specweaver bridge`, no se editan a mano. Si un spec esta mal, el epics.md esta mal.
2. **El alcance se controla antes de tocar archivos**, no despues. Ver `/sw:change`.
3. **Un desarrollador, un change a la vez.** Las stories estan dimensionadas para eso.
4. **Los `#### Scenario:` del spec son los casos de prueba.** No inventes criterios nuevos
   durante la construccion.
5. **Terminar no es cerrar.** Una story con tareas completas se cierra con `/sw:close` (valida y
   archiva). Sin cierre no hay linea base y `/sw:change` no puede medir alcance.

## Las preferencias del proyecto mandan

`.un-specweaver/config.json` guarda lo que el usuario eligio al inicializar:

```json
"preferences": { "lang": "es" }
```

**Leelas antes de decidir por tu cuenta.** Nunca preguntes estas cosas en una conversacion: ya
estan decididas, y se cambian con `npx un-specweaver init --lang en`.

## Mapa del codigo (graphify) — parte del metodo

`init` instala graphify, deja su skill en el proyecto, acota el grafo a **solo codigo** con
`.graphifyignore`, construye el grafo AST (`graphify-out/graph.json`) y deja un hook que lo
reconstruye en cada commit. Es el unico testigo de la estructura **real** del codigo.

- Hay grafo → `graphify query`, `graphify affected`, `graphify path`. No leas archivos a ciegas.
- No hay grafo → `graphify update .` (segundos, sin LLM). Sin codigo todavia, es normal.
- No hay graphify → `doctor` lo dice, `init` lo arregla. Si no se puede ahora, sigue y **dilo**.
- **No amplíes el grafo a docs.** PRD, specs y memoria tienen otro dueño (tabla de arriba).

## Capacidades opcionales

**Engram** lo instala `init` (via Homebrew o `go install`). Si `engram` no esta en PATH,
escribe el rationale en `design.md` del change bajo `## Decisions` y dilo. Nunca lo pierdas
en silencio.

La memoria vive **dentro del proyecto**, en `.un-specweaver/engram`: no es una etiqueta sobre
una base compartida, es una base propia. Borrar la carpeta borra la memoria, y ningun otro
proyecto la ve. Limite conocido: si el usuario tiene el **plugin global de Engram** en Claude
Code, sus herramientas viven en otro namespace y siguen escribiendo en `~/.engram`. Si ves dos
juegos de herramientas de memoria, usa las del proyecto y dilo; `doctor` lo reporta.

**uv** (Python) lo usa BMAD para resolver su configuracion, y es una de las dos vias (con pipx)
por las que `init` instala graphify. Si BMAD no lo encuentra, sus skills traen fallback manual.

## Limite conocido

El plan de sprint asume que los epics son independientes. Una dependencia entre epics que no
este escrita en el texto de la story no aparece en las olas. Verificala a mano contra
`trace.json` antes de repartir trabajo en paralelo.
