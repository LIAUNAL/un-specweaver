// Donde vive cada cosa. UN solo lugar: antes estaba repartido en seis archivos y mudar una
// carpeta significaba encontrar todas sus copias.
//
// La regla nueva: todo lo que produce el metodo vive en `.un-specweaver/`. Borrar esa carpeta
// borra el estado del proyecto — specs, artefactos de planeacion, memoria, trazabilidad.
// Lo que queda fuera es lo que NO se puede mover y es regenerable: `_bmad/` (el vendor fija su
// ruta), `.claude/` y `.opencode/` (los agentes solo leen ahi), `graphify-out/`.
//
// Compatibilidad: un proyecto de 0.5.x tiene `openspec/` y `_bmad-output/` en la raiz. Se
// detectan y se siguen usando hasta que corra `un-specweaver migrate`. Sin esto, actualizar la
// herramienta romperia todos los proyectos existentes en silencio.
import fs from 'node:fs';
import path from 'node:path';

export const HOME = '.un-specweaver';

// El primero que exista; si no existe ninguno, el primero: el layout nuevo es el default y
// el viejo solo gana cuando de verdad esta en disco.
const pick = (...candidates) => candidates.find((c) => c && fs.existsSync(c)) || candidates[0];

/**
 * @param {string} root raiz del proyecto
 * @returns rutas absolutas, con el layout nuevo por defecto y el viejo si ya existe.
 */
export function paths(root) {
  root = path.resolve(root);
  const home = path.join(root, HOME);
  // OpenSpec no busca hacia arriba: sus comandos necesitan correr con cwd = el padre de
  // `openspec/`. Por eso se devuelve tambien ese directorio.
  const openspec = pick(path.join(home, 'openspec'), path.join(root, 'openspec'));
  const bmadOut = pick(path.join(home, 'bmad'), path.join(root, '_bmad-output'));
  return {
    root,
    home,
    legacy: !fs.existsSync(path.join(home, 'openspec')) && fs.existsSync(path.join(root, 'openspec')),
    openspec,
    openspecCwd: path.dirname(openspec),
    specs: path.join(openspec, 'specs'),
    changes: path.join(openspec, 'changes'),
    archive: path.join(openspec, 'changes', 'archive'),
    bmadOut,
    // Relativa al proyecto: es lo que BMAD espera en --output-folder.
    bmadOutRel: path.relative(root, bmadOut),
    bmadInstall: path.join(root, '_bmad'),
    engram: path.join(home, 'engram'),
    engramBin: path.join(home, 'bin', 'engram'),
    config: path.join(home, 'config.json'),
    local: path.join(home, 'local.json'),
    trace: path.join(home, 'trace.json'),
    sprintPlan: path.join(home, 'sprint-plan.md'),
    ledger: path.join(home, 'changelog.jsonl'),
    dashboard: path.join(home, 'dashboard.html'),
  };
}

// Rutas relativas al proyecto, para imprimir y para el .gitignore.
export const rel = (root, p) => path.relative(path.resolve(root), p);
