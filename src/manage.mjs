// Poner y quitar el montaje completo.
//
// `reset` existe porque el aislamiento nunca puede ser total: `_bmad/` lo instala el vendor en
// la raiz, y las skills y comandos solo sirven dentro de `.claude/` y `.opencode/`. Si no se
// puede juntar todo en una carpeta, al menos que quitarlo sea UN comando y no una cacería.
//
// `migrate` existe porque un proyecto de 0.5.x tiene `openspec/` y `_bmad-output/` en la raiz,
// y actualizar la herramienta no puede romperlo en silencio: se mueven con git, se reescribe lo
// que apuntaba a las rutas viejas, y el resto del flujo sigue igual.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { VENDORS, isGitRepo } from './env.mjs';
import { paths, HOME, rel } from './paths.mjs';
import { NAMESPACE, GITIGNORE_START, GITIGNORE_END, DASHBOARD_HOOK_MARK } from './steps.mjs';

const exists = (p) => fs.existsSync(p);

/**
 * Todo lo que este montaje crea, con lo que pasa si se borra. El orden es el del reporte:
 * primero lo que duele (se pierde), despues lo regenerable.
 */
export function removable(root) {
  const P = paths(root);
  const out = [];
  const add = (target, kind, what) => { if (exists(target)) out.push({ target, kind, what }); };

  add(P.home, 'data', 'specs, planeacion, trazabilidad, memoria y config del proyecto');
  add(P.bmadInstall, 'vendor', 'instalacion de BMAD (regenerable)');
  add(path.join(root, VENDORS.graphify.outDir), 'vendor', 'grafo del codigo (regenerable)');
  add(path.join(root, VENDORS.graphify.ignoreFile), 'config', 'alcance del grafo');
  add(path.join(root, '.mcp.json'), 'config', 'servidor de memoria del proyecto');
  add(path.join(root, 'opencode.json'), 'config', 'servidor de memoria del proyecto');

  // Superficie en cada agente: nuestros comandos, nuestra skill, y lo que instalaron los vendors.
  for (const [id, agent] of Object.entries(VENDORS.agents)) {
    add(path.join(root, agent.commands, NAMESPACE), 'surface', `comandos /${NAMESPACE}:* de ${id}`);
    for (const f of listing(path.join(root, agent.commands))) {
      if (f.startsWith(`${NAMESPACE}-`) || /^(bmad|opsx)-/.test(f)) add(path.join(root, agent.commands, f), 'surface', 'comando de vendor');
    }
    add(path.join(root, agent.skills, 'un-specweaver'), 'surface', `skill de ${id}`);
    add(path.join(root, agent.graphifySkill || 'x'), 'surface', 'skill de graphify');
    for (const d of listing(path.join(root, agent.skills))) {
      if (/^(bmad|openspec)-/.test(d)) add(path.join(root, agent.skills, d), 'surface', 'skill de vendor');
    }
  }
  return out;
}

const listing = (dir) => { try { return fs.readdirSync(dir); } catch { return []; } };

// Lo que no se borra pero si se limpia: el bloque del .gitignore y la linea del hook.
export function cleanups(root) {
  const out = [];
  const gi = path.join(root, '.gitignore');
  if (exists(gi) && fs.readFileSync(gi, 'utf8').includes(GITIGNORE_START)) out.push({ file: gi, what: 'bloque de .gitignore' });
  const hook = hookPath(root);
  if (hook && exists(hook) && fs.readFileSync(hook, 'utf8').includes(DASHBOARD_HOOK_MARK)) out.push({ file: hook, what: 'linea del hook de post-commit' });
  return out;
}

function hookPath(root) {
  try {
    const gitDir = spawnSync('git', ['-C', root, 'rev-parse', '--git-dir'], { encoding: 'utf8' }).stdout.trim();
    return gitDir ? path.resolve(root, gitDir, 'hooks', 'post-commit') : null;
  } catch { return null; }
}

export function reset(root, { dryRun = false } = {}) {
  root = path.resolve(root);
  const items = removable(root);
  const clean = cleanups(root);
  if (dryRun) return { items, clean, removed: 0 };

  let removed = 0;
  for (const it of items) {
    // Nunca fuera de la raiz, pase lo que pase con la configuracion de agentes.
    if (!path.resolve(it.target).startsWith(root + path.sep)) continue;
    fs.rmSync(it.target, { recursive: true, force: true });
    removed++;
  }
  for (const c of clean) {
    const cur = fs.readFileSync(c.file, 'utf8');
    const next = c.file.endsWith('.gitignore')
      ? cur.replace(new RegExp(`${GITIGNORE_START}[\\s\\S]*?${GITIGNORE_END}\\n?`), '').trimEnd() + '\n'
      : cur.split('\n').filter((l, i, a) => !l.includes(DASHBOARD_HOOK_MARK) && !(i > 0 && a[i - 1].includes(DASHBOARD_HOOK_MARK))).join('\n');
    fs.writeFileSync(c.file, next, 'utf8');
  }
  return { items, clean, removed };
}

// --- migracion 0.5.x -> 0.6 ---------------------------------------------------------------

export function migrationPlan(root) {
  root = path.resolve(root);
  const home = path.join(root, HOME);
  const moves = [];
  const from = (src, dst) => { if (exists(src) && !exists(dst)) moves.push({ from: src, to: dst }); };
  from(path.join(root, 'openspec'), path.join(home, 'openspec'));
  from(path.join(root, '_bmad-output'), path.join(home, 'bmad'));

  const edits = [];
  // BMAD guarda la ruta de salida en su config: si no se reescribe, el proximo documento
  // aterriza en la carpeta vieja y nadie se entera hasta que falta.
  for (const cfg of ['config.toml', path.join('bmm', 'config.toml')]) {
    const f = path.join(root, '_bmad', cfg);
    if (!exists(f)) continue;
    const cur = fs.readFileSync(f, 'utf8');
    const next = cur.replace(/^(\s*output_folder\s*=\s*)"[^"]*"/m, `$1"${HOME}/bmad"`)
                    .replace(/^(\s*planning_artifacts\s*=\s*)"[^"]*"/m, `$1"{project-root}/${HOME}/bmad/planning-artifacts"`);
    if (next !== cur) edits.push({ file: f, content: next, what: 'rutas de salida de BMAD' });
  }
  // trace.json guarda de que epics.md salio cada change.
  const trace = path.join(home, 'trace.json');
  if (exists(trace)) {
    try {
      const j = JSON.parse(fs.readFileSync(trace, 'utf8'));
      if (typeof j.source === 'string' && j.source.startsWith('_bmad-output')) {
        j.source = j.source.replace(/^_bmad-output/, `${HOME}/bmad`);
        edits.push({ file: trace, content: JSON.stringify(j, null, 2) + '\n', what: 'origen en trace.json' });
      }
    } catch { /* trace ilegible: no se toca */ }
  }
  return { moves, edits, needed: moves.length > 0 || edits.length > 0 };
}

export function migrate(root, { dryRun = false } = {}) {
  root = path.resolve(root);
  const plan = migrationPlan(root);
  if (dryRun || !plan.needed) return { ...plan, moved: 0 };

  fs.mkdirSync(path.join(root, HOME), { recursive: true });
  const git = isGitRepo(root);
  let moved = 0;
  for (const m of plan.moves) {
    // `git mv` conserva el historial de cada archivo; sin repo, un rename normal.
    const ok = git && spawnSync('git', ['-C', root, 'mv', rel(root, m.from), rel(root, m.to)], { encoding: 'utf8' }).status === 0;
    if (!ok) fs.renameSync(m.from, m.to);
    moved++;
  }
  for (const e of plan.edits) fs.writeFileSync(e.file, e.content, 'utf8');
  return { ...plan, moved };
}
