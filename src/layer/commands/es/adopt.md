---
name: adopt
title: "UB: Adoptar proyecto existente"
description: "Trae un proyecto que ya existe a este flujo: escanea lo que hay, acuerda el alcance con el usuario, mapea el codigo real, levanta un PRD brownfield y fija una linea base de specs acotada."
allowed-tools: Bash(npx:*), Bash(git:*), Bash(graphify:*), Read, Write, Edit, Glob, Grep
---

# /sw:adopt — proyecto que ya existe

Dos errores hunden esta fase, y los dos son caros:

1. **Planear sobre lo que crees que hace el codigo.** Por eso se escanea y se mapea antes de escribir nada.
2. **Querer especificar el sistema entero antes de tocarlo.** Semanas escribiendo contratos de
   codigo que quiza nadie mire. La linea base se acota a lo que se va a trabajar; el resto entra
   cuando se toque.

## Paso 1 — Partir del brief de adopcion

```
npx un-specweaver context
```

Si existe `adoption-brief.md`, **leelo primero y entero**: lo genero `un-specweaver adopt` y trae
lo acordado con el usuario, la evidencia del escaneo, los documentos que el equipo trajo de fuera
del repo (`inputs/`) y los candidatos a capability. Es el insumo que evita arrancar de cero.

Si **no** existe, pediselo antes de seguir:

```
npx un-specweaver adopt --input <doc-o-carpeta>   # repetible
```

Te pregunta lo que hay que decidir y deja el brief. Mientras tanto podes mirar `npx un-specweaver scan`,
que es la misma evidencia sin las respuestas. Si el proyecto ya esta parcialmente adoptado, el
plan lo dice: no rehagas lo que ya esta.

## Paso 2 — Confirmar el alcance (antes de tocar un archivo)

Si el brief ya trae las respuestas, **confirmalas en una frase** y seguí. Si alguna quedo vacia,
preguntala ahora. No las contestes por el usuario ni asumas la opcion recomendada: cambian todo
lo que sigue.

La mas importante siempre es el **alcance**. Si el proyecto es grande, la respuesta barata es
*"solo el area donde voy a trabajar"*, y entonces todo lo que sigue se limita a esa area. Dilo
explicitamente: **adoptar es incremental**, no un big bang. Lo que no se especifica hoy no queda
prohibido, queda pendiente de la story que lo toque.

Cierra este paso resumiendo en una frase que se va a adoptar y que no. Si el usuario no responde,
no sigas: sin alcance acordado, el resto es trabajo sin destino.

## Paso 3 — Mapear lo que existe de verdad

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

## Paso 4 — Arquitectura real vs arquitectura declarada

1. Deriva del grafo la arquitectura **real**: capas, fronteras, dependencias, donde vive el dominio.
2. Contrastala contra `docs/architecture-base.md`. Si el escaneo dijo que sigue siendo la
   **plantilla sin llenar**, llenala ahora con el usuario: un agente que lee una plantilla vacia
   la trata como doctrina.
3. **Escribe las diferencias explicitamente.** No las silencies ni las "corrijas" mentalmente.

Cada diferencia es una de tres cosas, y hay que decidir cual antes de seguir:
- deuda tecnica conocida → se documenta y se deja
- la base esta desactualizada → se actualiza `docs/architecture-base.md`
- violacion real → se convierte en un epic de remediacion

## Paso 5 — PRD brownfield, del alcance acordado

`bmad-document-project` para levantar lo que el sistema hace hoy, y luego `bmad-prd` sobre eso.
Usa como insumo **`inputs/` del brief** y la documentacion que el escaneo encontro: lo que el
equipo ya escribio vale mas que lo que vos puedas deducir del codigo, y es mas barato corregir un
borrador que escribir desde cero.

Reglas:
- el PRD brownfield describe **lo que existe**, no lo que quisieras que existiera; lo nuevo entra
  despues por `/sw:change`
- **solo el alcance acordado en el Paso 2.** Si aparece algo fuera, anotalo como pendiente, no lo
  metas

## Paso 6 — Linea base de specs

Epics y stories del alcance (`bmad-create-epics-and-stories`), y despues el puente:

```
npx un-specweaver bridge --strict
npx un-specweaver validate
```

Para el codigo que **ya funciona**, los changes que salen describen comportamiento existente: al
cerrarlos con `npx un-specweaver close --done` pasan a `.un-specweaver/openspec/specs/` y se
vuelven la linea base. Esa linea base es contra lo que `/sw:change` va a medir el alcance de todo
lo que llegue despues; sin ella, el control de alcance no tiene contra que comparar.

Si una story describe comportamiento que ya esta implementado y verificado, marca sus tareas y
cierrala: no vuelvas a construir lo que ya existe. Dilo en voz alta cuando lo hagas.

## Paso 7 — Confirmar y seguir

```
npx un-specweaver status --open
```

Muestra al usuario que quedo adoptado, que quedo fuera del alcance a proposito, y cual es el
siguiente paso. De aqui en adelante: lo nuevo por `/sw:change`, los defectos por `/sw:bug`, los
tickets por `/sw:ticket`, y ampliar el alcance es volver a este comando sobre otra area.
