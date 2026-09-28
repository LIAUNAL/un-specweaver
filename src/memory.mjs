// La memoria del proyecto: traerla de la base global y compartirla con el equipo.
//
// Desde 0.6.0 cada proyecto tiene su propia base (`.un-specweaver/engram`). Un proyecto que
// venia de antes tiene su memoria en la base global (`~/.engram`), etiquetada con --project:
// `memory import` la trae. Y como la base es un SQLite binario que git no puede mergear,
// `memory share` usa el formato de sincronizacion de engram, que si esta hecho para el repo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { paths, rel } from './paths.mjs';
import { which } from './env.mjs';

// El binario correcto segun donde queremos escribir: el wrapper apunta a la base del proyecto,
// `engram` a secas a la global.
const projectBin = (root) => {
  const w = paths(root).engramBin;
  return fs.existsSync(w) ? w : null;
};

function run(bin, args, opts = {}) {
  const r = spawnSync(bin, args, { encoding: 'utf8', ...opts });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

// Nombre con el que la base global etiqueto a este proyecto: engram lo deriva del remote de git
// y, sin remote, del nombre de la carpeta.
export function likelyProjectName(root) {
  try {
    const url = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim().replace(/\.git$/, '');
    const name = url.split(/[/:]/).filter(Boolean).pop();
    if (name) return name.trim().toLowerCase();
  } catch { /* sin remote */ }
  return path.basename(path.resolve(root)).toLowerCase();
}

// Que hay en la base global, para elegir de donde importar. Nunca la modifica.
export function globalProjects() {
  if (!which('engram')) return [];
  const { ok, out } = run('engram', ['projects', 'list']);
  if (!ok) return [];
  return out.split('\n')
    .map((l) => l.match(/^\s{2}(\S+)\s+(\d+)\s+obs\s+(\d+)\s+session/))
    .filter(Boolean)
    .map((m) => ({ name: m[1], observations: Number(m[2]), sessions: Number(m[3]) }));
}

export function memoryStatus(root) {
  const P = paths(root);
  const db = path.join(P.engram, 'engram.db');
  const status = { dir: rel(root, P.engram), isolated: fs.existsSync(P.engramBin), hasDb: fs.existsSync(db), observations: 0, global: null };
  const bin = projectBin(root);
  if (bin && status.hasDb) {
    const { ok, out } = run(bin, ['projects', 'list']);
    if (ok) for (const p of out.split('\n')) {
      const m = p.match(/(\d+)\s+obs/);
      if (m) status.observations += Number(m[1]);
    }
  }
  const name = likelyProjectName(root);
  status.global = globalProjects().find((p) => p.name === name) || null;
  return status;
}

// La exportacion de engram no filtra por proyecto: vuelca la base entera. El proyecto de una
// observacion no esta en la observacion, viene por su sesion.
export function filterExport(dump, project) {
  const sessions = (dump.sessions || []).filter((s) => s.project === project);
  const ids = new Set(sessions.map((s) => s.id));
  return {
    version: dump.version,
    exported_at: dump.exported_at,
    sessions,
    observations: (dump.observations || []).filter((o) => ids.has(o.session_id)),
    prompts: (dump.prompts || []).filter((p) => p.project === project || ids.has(p.session_id)),
  };
}

/**
 * Trae la memoria de un proyecto desde la base global a la del proyecto.
 *
 * VERIFICADO contra engram 1.20, y la razon de que esto exija `--force`: `import` deduplica
 * observaciones y sesiones por id, pero NO los prompts. Importar dos veces los duplica.
 */
export function importFromGlobal(root, { project, dryRun = false, force = false } = {}) {
  const bin = projectBin(root);
  if (!which('engram')) return { ok: false, reason: 'no-engram' };
  if (!bin) return { ok: false, reason: 'not-isolated' };

  const name = project || likelyProjectName(root);
  const src = globalProjects().find((p) => p.name === name);
  if (!src) return { ok: false, reason: 'not-found', name, available: globalProjects() };

  const status = memoryStatus(root);
  if (status.observations > 0 && !force) return { ok: false, reason: 'already-has-memory', name, ...status };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'usw-mem-'));
  try {
    const dumpFile = path.join(tmp, 'global.json');
    const dump = run('engram', ['export', dumpFile]);
    if (!dump.ok || !fs.existsSync(dumpFile)) return { ok: false, reason: 'export-failed', out: dump.out };

    const filtered = filterExport(JSON.parse(fs.readFileSync(dumpFile, 'utf8')), name);
    const counts = { sessions: filtered.sessions.length, observations: filtered.observations.length, prompts: filtered.prompts.length };
    if (dryRun) return { ok: true, dryRun: true, name, counts };

    const inFile = path.join(tmp, 'project.json');
    fs.writeFileSync(inFile, JSON.stringify(filtered, null, 2), 'utf8');
    const imp = run(bin, ['import', inFile], { cwd: root });
    return imp.ok ? { ok: true, name, counts, out: imp.out } : { ok: false, reason: 'import-failed', out: imp.out };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Exporta la memoria a un formato que git si puede versionar (chunks + manifest), para que el
 * equipo comparta el rationale. La base en si se queda ignorada: es binaria y no se mergea.
 */
export function share(root, { importing = false } = {}) {
  const bin = projectBin(root);
  if (!bin) return { ok: false, reason: 'not-isolated' };
  const r = run(bin, importing ? ['sync', '--import'] : ['sync'], { cwd: paths(root).home });
  return { ...r, dir: path.join(rel(root, paths(root).home), '.engram') };
}
