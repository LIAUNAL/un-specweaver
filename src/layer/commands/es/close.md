---
name: close
title: "UB: Cerrar stories terminadas"
description: "Cierra las stories terminadas: valida su spec y la archiva, que es lo que convierte el contrato en la linea base del sistema. Sin esto no hay contra que medir el alcance."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Glob, Grep
---

# /sw:close — cerrar stories terminadas

Construir no es cerrar. Una story esta **terminada** cuando sus tareas estan hechas; esta
**cerrada** cuando su spec se archivo y paso a `.un-specweaver/openspec/specs/`: la linea base contra la que
`/sw:change` mide todo lo que llega despues. Caso real: 22 stories terminadas, cero cerradas,
y `/sw:change` sin nada contra que comparar.

Los ids vienen en `$ARGUMENTS`. Vacio = todas las terminadas.

## Paso 1 — Ver que hay

```
npx un-specweaver close
```

Lista los changes con **todas** las tareas marcadas y sin archivar. Si hay alguno con tareas
a medias que el usuario considere terminado, primero que marque las casillas: una casilla es
la afirmacion del desarrollador, y el cierre no la inventa.

## Paso 2 — Cerrar

```
npx un-specweaver close --done          # todas las terminadas
npx un-specweaver close <id> [<id>...]  # solo esas
```

Por cada una corre `openspec validate --strict` y, si pasa, `openspec archive`. **Un change que
no valida no se archiva**: archivar un contrato roto seria convertirlo en la verdad del sistema.

## Paso 3 — Si algo falla

El error de `validate` apunta al spec, pero el spec es derivado: **el problema esta en el
`epics.md`**. Corrige la story ahi y regenera con `npx un-specweaver bridge --only N.M --force`
(conserva las casillas). No parches el spec a mano.

## Paso 4 — Confirmar

`npx un-specweaver status`: la tile "specs archivadas" ya no debe estar en ambar. Si commiteas,
`.un-specweaver/openspec/specs/` y `.un-specweaver/openspec/changes/archive/` van al repo: son el producto.
