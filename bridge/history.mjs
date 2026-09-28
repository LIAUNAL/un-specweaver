// Lo que el puente tiene que recordar entre corridas para no destruir trazabilidad.
//
// Tres perdidas reales, reproducidas antes de escribir esto:
//  1. `bridge --only 1.2` sobreescribia trace.json con UNA story: las otras tres desaparecian.
//  2. `--force` regeneraba tasks.md con todas las casillas en blanco: el progreso se perdia.
//  3. Una story ya archivada se regeneraba como ADDED y OpenSpec rechazaba el archive
//     ("already exists"): el flujo /sw:change -> bridge -> build -> archive solo funcionaba
//     para stories que nunca se habian construido.
// Y una cuarta que no era perdida sino ausencia: nadie registraba que corrida regenero que.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { paths } from '../src/paths.mjs';

// --- 1. trace.json se fusiona, no se sobreescribe -----------------------------------------
// La identidad estable es la story (1.2), no el changeId: una revision cambia el id (-r2)
// pero sigue siendo la misma story. Las stories no seleccionadas conservan su entrada.
export function mergeTrace(prev, next) {
  const byStory = new Map();
  for (const c of prev?.changes || []) byStory.set(c.bmad?.story, c);
  for (const c of next.changes) byStory.set(c.bmad.story, c);
  const order = (id) => id.split('.').map(Number);
  const changes = [...byStory.values()].sort((a, b) => {
    const [an, am] = order(a.bmad.story), [bn, bm] = order(b.bmad.story);
    return an - bn || am - bm;
  });
  return { ...next, changes };
}

// --- 2. tasks.md conserva las casillas marcadas ------------------------------------------
// Se casan por TEXTO de la tarea, no por numero: si se inserta un criterio en medio, la
// numeracion corre pero el texto de las tareas hechas no cambia. Una tarea marcada cuyo
// texto ya no existe se reporta como perdida: eso es informacion, no ruido.
const RE_TASK = /^(\s*- \[)([ xX])(\] )(\d+\.\d+ )(.*)$/;

export function mergeTasks(oldMd, newMd) {
  const done = new Set();
  for (const line of String(oldMd || '').split('\n')) {
    const m = line.match(RE_TASK);
    if (m && m[2].toLowerCase() === 'x') done.add(m[5].trim());
  }
  if (!done.size) return { md: newMd, kept: 0, lost: [] };

  const seen = new Set();
  const md = newMd.split('\n').map((line) => {
    const m = line.match(RE_TASK);
    if (!m) return line;
    const text = m[5].trim();
    if (!done.has(text)) return line;
    seen.add(text);
    return `${m[1]}x${m[3]}${m[4]}${m[5]}`;
  }).join('\n');
  return { md, kept: seen.size, lost: [...done].filter((t) => !seen.has(t)) };
}

// --- 3. El spec principal: que requisitos y escenarios ya estan archivados -----------------
// Se lee para decidir ADDED vs MODIFIED y para reutilizar los nombres de escenario que
// OpenSpec exige que se conserven (verificado contra 1.10: un MODIFIED que no trae todos
// los escenarios actuales por nombre exacto se rechaza en archive).
export function readMainSpec(root, capability) {
  const file = path.join(paths(root).specs, capability, 'spec.md');
  const out = new Map();
  let md;
  try { md = fs.readFileSync(file, 'utf8'); } catch { return out; }
  let cur = null;
  for (const line of md.split('\n')) {
    const r = line.match(/^###\s+Requirement:\s*(.+?)\s*$/);
    if (r) { cur = { name: r[1], scenarios: [] }; out.set(normalizeName(r[1]), cur); continue; }
    const s = line.match(/^####\s+Scenario:\s*(.+?)\s*$/);
    if (s && cur) cur.scenarios.push(s[1]);
  }
  return out;
}

export const normalizeName = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');

// Nombres de escenario para un requisito que ya existe: primero coincidencia exacta,
// despues por posicion (el contenido cambio, el nombre se conserva), y lo que sobra es nuevo.
// Un escenario archivado que no se puede casar es una story que PERDIO un escenario:
// OpenSpec no permite quitarlo en un MODIFIED, asi que se devuelve como `dropped` para que
// el puente falle con instrucciones en vez de emitir un change que no se puede archivar.
export function reconcileScenarioNames(candidates, existing) {
  const names = [...candidates];
  const free = existing.map((n) => ({ n, key: normalizeName(n), used: false }));
  const taken = new Array(names.length).fill(false);
  candidates.forEach((c, i) => {
    const hit = free.find((f) => !f.used && f.key === normalizeName(c));
    if (hit) { hit.used = true; names[i] = hit.n; taken[i] = true; }
  });
  let cursor = 0;
  for (let i = 0; i < names.length; i++) {
    if (taken[i]) continue;
    while (cursor < free.length && free[cursor].used) cursor++;
    if (cursor < free.length) { free[cursor].used = true; names[i] = free[cursor].n; taken[i] = true; }
  }
  return { names, dropped: free.filter((f) => !f.used).map((f) => f.n) };
}

// --- Revision: cuantas veces se archivo esta story ---------------------------------------
// Un change archivado vive en archive/<fecha>-<id>/. Regenerar la misma story despues de
// archivarla necesita un id nuevo (el archive rechaza el duplicado) y ese id lleva la
// revision, que ademas queda escrita en trace.json.
export function archivedRevisions(root, baseId) {
  const dir = paths(root).archive;
  let names;
  try { names = fs.readdirSync(dir); } catch { return 0; }
  const re = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${baseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-r(\\d+))?$`);
  let max = 0;
  for (const n of names) {
    const m = n.match(re);
    if (m) max = Math.max(max, Number(m[1] || 1));
  }
  return max;
}

export const revisedId = (baseId, revision) => (revision > 1 ? `${baseId}-r${revision}` : baseId);

// --- 4. El ledger: una linea por corrida ---------------------------------------------------
// Append-only y con fecha: es historia, y la historia tiene fechas. Por eso es el UNICO
// archivo del puente con timestamp; trace.json y los changes siguen siendo deterministas.
export function appendLedger(root, record) {
  const P = paths(root);
  fs.mkdirSync(P.home, { recursive: true });
  fs.appendFileSync(P.ledger, JSON.stringify(record) + '\n', 'utf8');
}

export function readLedger(root) {
  try {
    return fs.readFileSync(paths(root).ledger, 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
