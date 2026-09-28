---
name: doctor
title: "UB: Diagnostico"
description: "Revisa que el entorno este completo y coherente: pasos de instalacion, drift de vendors y consistencia entre el plan y los specs."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Glob, Grep
---

# /sw:doctor — diagnostico

## Paso 1 — Entorno

```
npx un-specweaver doctor
```

Interpreta la salida para el usuario en vez de solo pegarla:

- pasos en `falta` → cada uno dice **que bloquea**. "necesario para planear" es un bloqueo real;
  "solo bloquea /sw:build" no impide levantar requerimientos. No reportes todo lo pendiente como
  si fuera lo mismo: la ultima linea de doctor ya distingue los dos casos, respetala.
- `DRIFT` en vendors → que implica y si urge (ver `/sw:sync`)
- preflight en `FALLA` → bloqueante, nada mas va a funcionar
- `uv` ausente → **no** es bloqueante para planear; BMAD resuelve su config sin el, solo mas
  lento. Pero `init` lo necesita (o pipx) para instalar graphify: si `graphify-bin` esta en falta,
  esa es la causa
- `graphify-bin` / `graphify` en falta → bloquean **solo** `/sw:build`. Sin grafo el codigo se
  explora a ciegas; se resuelve con `npx un-specweaver init`. "configurado; el grafo aparece con
  el primer codigo" en un proyecto nuevo es correcto, no un pendiente
- seccion `opcional` → Engram. Ausente **no** es un error: el rationale va a `design.md`

## Paso 2 — Coherencia del flujo

Esto no lo revisa el CLI. Verifica a mano:

**Trazabilidad completa.** Cada FR del PRD debe aparecer en `.un-specweaver/trace.json`.
Un FR sin change es un requisito que nadie va a construir.

**Sin specs huerfanos.** Cada change en `.un-specweaver/openspec/changes/` debe tener su entrada en
`trace.json`. Uno que no la tenga se creo a mano fuera del puente: no tiene story detras y no
va a sobrevivir la proxima regeneracion.

**Arquitectura base llena.** Si `docs/architecture-base.md` sigue siendo la plantilla, dilo:
todas las fases de diseno estan corriendo sin las restricciones de la organizacion.

**Frontera intacta.** Verifica que no reaparecieron las skills podadas. Un `un-specweaver init` sin
`--force` no las trae de vuelta, pero un `bmad-method install` corrido a mano si.

## Paso 3 — Specs validos

```
npx un-specweaver validate
```

## Paso 4 — Resumir

Un parrafo: que esta bien, que esta roto, y **cual es la siguiente accion concreta**.
Si todo esta bien, dilo en una linea y ya.
