---
name: new
title: "UB: Proyecto nuevo"
description: "Arranca un proyecto desde cero: de la idea al PRD, a epics y stories, y de ahi a changes de OpenSpec listos para construir."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Write, Edit, Glob, Grep
---

# /sw:new — proyecto nuevo

Lleva una idea desde cero hasta changes de OpenSpec verificados. **No escribe codigo de producto.**
La construccion es `/sw:build`, en otra conversacion.

## Antes de empezar

1. Corre `npx un-specweaver doctor`. **Solo detente si dice que hay pasos que bloquean la
   planeacion.** Un paso pendiente marcado "solo bloquea /sw:build" NO impide planear —
   la memoria y el mapa del codigo hacen falta para construir, no para levantar requerimientos. La ultima linea de
   doctor te dice cual de los dos casos es.
2. Lee `docs/architecture-base.md` completo y mantenlo como contexto durante todas las fases.
   Si sigue siendo la plantilla sin llenar, **dilo y pregunta** si llenarla ahora o seguir sin
   ella. Las dos son validas: sin ella vas a tomar decisiones de arquitectura por tu cuenta,
   y el usuario tiene derecho a saberlo. **No te detengas esperando** — pregunta y sigue con
   la respuesta que te den.

## Fase 1 — Aterrizar la idea

Con el usuario, en este orden. Cada paso alimenta al siguiente; no los saltes ni los paralelices.

1. `bmad-product-brief` — que problema, para quien, por que ahora
2. `bmad-prd` — requisitos funcionales (FR) y no funcionales (NFR) numerados
3. `bmad-architecture` — decisiones tecnicas, **restringidas por `docs/architecture-base.md`**
4. `bmad-ux` — diseño y experiencia. Produce los UX-DR, que despues se mapean a stories
   con mas precision que los FR. Saltarlo deja la construccion sin contrato visual.
5. `bmad-create-epics-and-stories` — epics y stories con criterios Given/When/Then

Sale todo en `.un-specweaver/bmad/`.

**Sobre los dos "diseños" — no son lo mismo y no se hacen dos veces:**

| | `bmad-ux` | `design.md` de un change |
|---|---|---|
| Que es | diseño de producto: visual, interaccion, experiencia | diseño tecnico: patron, capas, dependencias |
| Cuantas veces | **una** para todo el proyecto | por change, y **solo si aplica** |
| Sale en | `ux-designs/DESIGN.md` y `EXPERIENCE.md` | la carpeta del change |
| Quien lo usa | todos los changes lo respetan | solo ese change |

`design.md` no se escribe por defecto — OpenSpec lo pide condicional: cuando hay patron nuevo,
dependencia externa, migracion, o algo que atraviesa modulos. El puente **no lo genera** a
proposito. Para la mayoria de los changes no hace falta.

**Puerta de calidad antes de seguir.** BMAD escribe en `{planning_artifacts}`, que por defecto es
`.un-specweaver/bmad/planning-artifacts/epics.md` pero es configurable — el puente lo descubre solo,
no asumas la ruta. Abre el archivo y verifica a mano:
- cada FR del PRD aparece en el FR Coverage Map
- cada story tiene narrativa `As a / I want / So that` completa
- cada story tiene al menos un bloque Given/When/Then

El puente es deterministico: lo que no este aqui, no existe rio abajo. Un epics.md incompleto
produce specs incompletos en silencio.

## Fase 2 — Puente

```
npx un-specweaver bridge --strict
```

`--strict` aborta si alguna story quedo incompleta, en vez de generar specs a medias.
Si aborta, vuelve a la Fase 1 y corrige el epics.md — **no parches el output**.

Genera un change por story, `.un-specweaver/trace.json` (trazabilidad FR ↔ story ↔ change) y
`.un-specweaver/sprint-plan.md` (olas de trabajo paralelo).

## Fase 3 — Verificar

```
npx un-specweaver validate
```

Tiene que dar 100% verde. Si falla, el problema esta en el epics.md, no en el spec generado.

## Fase 4 — Entregar el plan

Muestra al usuario:
- cuantos epics, stories y changes salieron
- las olas de `.un-specweaver/sprint-plan.md` y que se puede trabajar en paralelo
- el limite conocido: las dependencias entre epics solo se detectan si estan escritas en el texto

Cierra con `npx un-specweaver status --open`: el dashboard con el plan recien generado es la mejor
forma de mostrarselo a quien no conoce el metodo. Termina ahi. La construccion empieza con
`/sw:build <change-id>`.
