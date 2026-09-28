---
name: sync
title: "UB: Actualizar el entorno"
description: "Revisa si hay drift entre los vendors pineados y lo instalado en este proyecto, y actualiza de forma controlada."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Glob
---

# /sw:sync — actualizar el entorno

BMAD, OpenSpec y graphify se actualizan casi a diario. Este proyecto los tiene **pineados** a proposito:
lo que se rompe con una actualizacion no deseada es el flujo entero.

## Paso 1 — Ver el estado

```
npx un-specweaver doctor
```

Lee la seccion `vendors pineados`:

- `ok` — lo instalado coincide con lo pineado. No hay nada que hacer.
- `DRIFT` — la version de un-specweaver que tienes pinea algo distinto a lo instalado
- `falta` — el vendor no esta instalado en este proyecto

## Paso 2 — Antes de actualizar

Si el repo tiene cambios sin commitear, dilo y sugiere commitear primero. La actualizacion
reescribe skills y comandos; sin un punto de retorno limpio no hay como revertir.

## Paso 3 — Actualizar

```
npx un-specweaver@latest init --force
```

Trae la ultima version de un-specweaver con sus pines nuevos y rehace los pasos.

`docs/architecture-base.md` **nunca** se sobrescribe. Los changes de OpenSpec en vuelo tampoco:
viven en `openspec/`, que este comando no toca.

## Paso 4 — Verificar que nada se rompio

```
npx un-specweaver doctor
npx un-specweaver validate
```

Si un vendor cambio de formato y los specs ya no validan, revierte con git y reporta que version
lo rompio. Ese dato es lo que permite subir el pin con confianza despues.

## Cuando NO actualizar

A mitad de un sprint con changes en vuelo. Espera a que la ola cierre.
