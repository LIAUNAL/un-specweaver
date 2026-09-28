// Cerrar una story: validar su change y archivarlo, que es lo que convierte el delta en la
// linea base (openspec/specs/). Era el paso 4.4 de /sw:build y dependia de que el agente se
// acordara. Caso real: 26 changes construidos, 22 con todas las tareas marcadas, cero
// archivados — sin linea base, /sw:change no tenia contra que medir el alcance.
// Un cierre que depende de la memoria del agente no existe; este es un comando.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { VENDORS } from './env.mjs';
import { readChanges } from './status/collect.mjs';
import { paths } from './paths.mjs';
import fs from 'node:fs';

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

// Changes activos con todas las tareas marcadas: los candidatos a cerrar.
export function closable(root) {
  const trace = readJson(paths(root).trace);
  return readChanges(root, trace).filter((c) => c.state === 'done');
}

export function unarchivedDone(root) {
  return closable(root).length;
}

// OpenSpec no busca hacia arriba: sus comandos corren con cwd = el padre de openspec/, que
// ahora es .un-specweaver. El flujo nunca los invoca a mano; los envuelve este CLI.
const defaultRun = (root) => (args) => {
  const r = spawnSync('npx', ['--yes', `${VENDORS.openspec.npm}@${VENDORS.openspec.version}`, ...args], {
    cwd: paths(root).openspecCwd, encoding: 'utf8', env: { ...process.env, OPENSPEC_TELEMETRY: '0' },
  });
  return { status: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` };
};

/**
 * Cierra los changes indicados: `openspec validate <id> --strict` y luego `openspec archive <id> --yes`.
 * Un change que no valida NO se archiva: el problema esta en el epics.md, y archivarlo igual
 * seria convertir un contrato roto en la verdad del sistema.
 * @param {string} root
 * @param {string[]} ids
 * @param {{ dryRun?: boolean, run?: (args: string[]) => { status: number, out: string } }} opts
 */
export function closeChanges(root, ids, opts = {}) {
  const run = opts.run || defaultRun(root);
  const results = [];
  for (const id of ids) {
    if (opts.dryRun) { results.push({ id, ok: true, dryRun: true, steps: ['validate', 'archive'] }); continue; }
    const v = run(['validate', id, '--strict']);
    if (v.status !== 0) { results.push({ id, ok: false, step: 'validate', out: v.out.trim() }); continue; }
    const a = run(['archive', id, '--yes']);
    results.push(a.status === 0 ? { id, ok: true, step: 'archive', out: a.out.trim() } : { id, ok: false, step: 'archive', out: a.out.trim() });
  }
  return results;
}
