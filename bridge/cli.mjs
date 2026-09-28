#!/usr/bin/env node
// Puente BMAD -> OpenSpec. Determinista: mismo epics.md, mismo output, siempre.
//
//   node bridge/cli.mjs <epics.md> [opciones]
//     --out <dir>     raiz del proyecto que contiene openspec/  (default: .)
//     --only 1.2      genera solo esa story (repetible)
//     --epic 1        genera solo ese epic (repetible)
//     --dry-run       no escribe, lista lo que haria
//     --force         sobrescribe changes existentes
//     --lang es|en    idioma del marco normativo (default: autodetectado)
//     --normative shall|debe   keyword RFC 2119. `debe` lee mejor en espanol pero
//                              `openspec validate --strict` lo rechaza. Default: shall.
//     --strict        falla si el parser emitio warnings
import fs from 'node:fs';
import path from 'node:path';
import { parseEpics } from './parse-epics.mjs';
import { emitChange, capabilityPath, changeId, detectLang } from './emit-openspec.mjs';
import { planSprint, renderSprintPlan } from './plan-sprint.mjs';
import { mergeTrace, mergeTasks, readMainSpec, normalizeName, archivedRevisions, appendLedger, sha256 } from './history.mjs';
import { findDecisionSources } from './decisions.mjs';
import { paths } from '../src/paths.mjs';

// BMAD escribe epics.md en {planning_artifacts}, que es configurable (--set bmm.planning_artifacts).
// Hardcodear la ruta fue un error: en una instalacion real quedo en
// _bmad-output/planning-artifacts/epics.md, no en _bmad-output/epics.md.
// Se lee la config y, si no esta, se busca.
// Raiz de artefactos de planeacion, respetando la config de BMAD.
export function planningRoot(root) {
  for (const cfg of ['_bmad/config.toml', '_bmad/bmm/config.toml']) {
    try {
      const toml = fs.readFileSync(path.join(root, cfg), 'utf8');
      const m = toml.match(/^\s*planning_artifacts\s*=\s*"(.+?)"/m);
      if (m) return m[1].replace('{project-root}', root);
    } catch { /* siguiente */ }
  }
  return path.join(paths(root).bmadOut, 'planning-artifacts');
}

// Los artefactos que BMAD produjo y que la construccion tiene que respetar.
// Sin esto, el SDD rediseña desde cero decisiones ya tomadas y revisadas.
export function findPlanningArtifacts(root) {
  const base = planningRoot(root);
  const out = [];
  const kinds = [
    ['architecture', 'decisiones tecnicas ya tomadas — vinculantes'],
    ['ux-designs', 'diseño y experiencia — vinculantes'],
    ['prds', 'requisitos numerados (FR/NFR)'],
    ['briefs', 'el porque del producto'],
  ];
  for (const [dir, what] of kinds) {
    const d = path.join(base, dir);
    if (!fs.existsSync(d)) continue;
    const walk = (p, depth = 0) => {
      if (depth > 2) return;
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const f = path.join(p, e.name);
        if (e.isDirectory()) walk(f, depth + 1);
        else if (e.name.endsWith('.md') && e.name !== '.memlog.md' && !/^review-/.test(e.name)) out.push({ kind: dir, what, file: f });
      }
    };
    walk(d);
  }
  const epics = findEpics(root);
  for (const f of epics) out.push({ kind: 'epics', what: 'stories y criterios — fuente de los changes', file: f });
  // Las decisiones tomadas al conversar. Antes se excluian a proposito y /sw:change podia
  // proponer algo ya descartado con motivo verificado.
  for (const d of findDecisionSources(root, base)) {
    out.push({ kind: 'decisions', what: 'decisiones, cambios y descartes registrados al conversar — `un-specweaver history <FR>` los cruza', file: d.file });
  }
  return out;
}

export function findEpics(root) {
  const candidates = [];

  for (const cfg of ['_bmad/config.toml', '_bmad/bmm/config.toml']) {
    try {
      const toml = fs.readFileSync(path.join(root, cfg), 'utf8');
      const m = toml.match(/^\s*planning_artifacts\s*=\s*"(.+?)"/m);
      if (m) candidates.push(path.join(m[1].replace('{project-root}', root), 'epics.md'));
    } catch { /* siguiente */ }
  }
  const out = paths(root).bmadOut;
  candidates.push(
    path.join(out, 'planning-artifacts', 'epics.md'),
    path.join(out, 'epics.md'),
    path.join(root, 'docs', 'epics.md'),
  );

  const seen = new Set();
  const found = candidates.filter((c) => {
    if (seen.has(c)) return false;
    seen.add(c);
    return fs.existsSync(c);
  });

  // Busqueda de ultimo recurso, acotada: solo bajo el output de BMAD.
  if (!found.length) {
    const walk = (dir, depth = 0) => {
      if (depth > 3 || !fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, depth + 1);
        else if (e.name === 'epics.md') found.push(p);
      }
    };
    walk(paths(root).bmadOut);
  }
  return found;
}

function parseArgs(argv) {
  const o = { out: '.', only: [], epic: [], dryRun: false, force: false, strict: false, lang: null, normative: 'shall', input: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--only') o.only.push(argv[++i]);
    else if (a === '--epic') o.epic.push(Number(argv[++i]));
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--force') o.force = true;
    else if (a === '--lang') o.lang = argv[++i];
    else if (a === '--normative') o.normative = argv[++i];
    else if (a === '--strict') o.strict = true;
    else if (a.startsWith('--')) { console.error(`Opcion desconocida: ${a}`); process.exit(2); }
    else o.input = a;
  }
  return o;
}

// Capabilities que ya existen: las del repo (post-archive) + las que declara
// un change todavia en vuelo. Sin esto, dos stories del mismo epic emitirian
// dos "## Purpose" y OpenSpec rechazaria el segundo.
function readExistingCapabilities(root) {
  const found = new Set();
  const specsDir = paths(root).specs;
  const walk = (dir, prefix = '') => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (fs.existsSync(path.join(dir, e.name, 'spec.md'))) found.add(rel);
      walk(path.join(dir, e.name), rel);
    }
  };
  walk(specsDir);

  const changesDir = paths(root).changes;
  if (fs.existsSync(changesDir)) {
    for (const c of fs.readdirSync(changesDir, { withFileTypes: true })) {
      if (!c.isDirectory() || c.name === 'archive') continue;
      walk(path.join(changesDir, c.name, 'specs'));
    }
  }
  return found;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.input) {
    const found = findEpics(path.resolve(opts.out));
    if (found.length === 1) {
      opts.input = found[0];
      console.log(`epics.md encontrado: ${path.relative(path.resolve(opts.out), opts.input)}\n`);
    } else if (found.length > 1) {
      console.error('Hay varios epics.md; indica cual:');
      for (const f of found) console.error(`  ${path.relative(path.resolve(opts.out), f)}`);
      process.exit(2);
    } else {
      console.error('No se encontro epics.md. Corre bmad-create-epics-and-stories primero, o indica la ruta.');
      console.error('Uso: un-specweaver bridge [epics.md] [--out dir] [--only N.M] [--epic N] [--dry-run] [--force] [--strict] [--lang es|en]');
      process.exit(2);
    }
  }

  const source = fs.readFileSync(opts.input, 'utf8');
  const doc = parseEpics(source);
  const lang = opts.lang || detectLang(doc.epics.flatMap((e) => e.stories).map((s) => s.want).join(' ') || source);
  if (!['es', 'en'].includes(lang)) { console.error(`--lang debe ser es o en (recibido: ${lang})`); process.exit(2); }
  console.log(`Idioma del marco normativo: ${lang}${opts.lang ? '' : ' (autodetectado)'}\n`);

  for (const w of doc.warnings) console.error(`  aviso: ${w}`);
  if (opts.strict && doc.warnings.length) { console.error(`\n--strict: ${doc.warnings.length} aviso(s), abortado.`); process.exit(1); }

  const root = path.resolve(opts.out);
  const existing = readExistingCapabilities(root);
  const changesRoot = paths(root).changes;

  const selected = [];
  for (const epic of doc.epics) {
    if (opts.epic.length && !opts.epic.includes(epic.n)) continue;
    for (const story of [...epic.stories].sort((a, b) => a.m - b.m)) {
      if (opts.only.length && !opts.only.includes(story.id)) continue;
      selected.push({ epic, story });
    }
  }

  const trace = [];
  const ledger = [];
  let written = 0, skipped = 0;
  const mainSpecs = new Map();     // capability -> requisitos ya archivados (cache por corrida)
  const failures = [];

  for (const { epic, story } of selected) {
    const cap = capabilityPath(epic);
    if (!mainSpecs.has(cap)) mainSpecs.set(cap, readMainSpec(root, cap));
    // Si el requisito ya vive en el spec principal, la story ya se construyo y archivo:
    // el delta es MODIFIED y el change lleva revision. Verificado contra OpenSpec 1.10:
    // un ADDED sobre un requisito existente se rechaza en archive ("already exists").
    const existingRequirement = mainSpecs.get(cap).get(normalizeName(story.title)) || null;
    const baseId = changeId(story);
    const revision = existingRequirement ? archivedRevisions(root, baseId) + 1 : 1;

    const change = emitChange(epic, story, existing, lang, opts.normative, { existingRequirement, revision });
    existing.add(change.capability);          // la siguiente story del epic ya no es "New"

    // OpenSpec no permite quitar escenarios en un MODIFIED (protege contra perdida silenciosa).
    // Emitir el change igual produciria uno que no se puede archivar: mejor fallar aqui y decir que hacer.
    if (change.dropped.length) {
      failures.push(`Story ${story.id}: el requisito ya esta archivado y la story perdio ${change.dropped.length} escenario(s): ${change.dropped.map((d) => `"${d}"`).join(', ')}.\n` +
        `    OpenSpec no permite quitarlos en un MODIFIED. Opciones: conservar esos criterios en la story, o retirar el requisito\n` +
        `    con un change manual (## REMOVED Requirements), archivarlo, y volver a correr el puente.`);
      continue;
    }
    trace.push(change.trace);

    const dir = path.join(changesRoot, change.id);
    const entry = { changeId: change.id, story: story.id, capability: change.capability, revision: change.revision, delta: change.delta };
    if (fs.existsSync(dir) && !opts.force) {
      console.log(`  omitido  ${change.id}  (ya existe; usa --force)`);
      ledger.push({ ...entry, action: 'skipped' });
      skipped++;
      continue;
    }

    // --force regenera el contrato, no el progreso: las casillas marcadas se conservan por
    // texto de tarea, y las que ya no existen se reportan en vez de desaparecer en silencio.
    const prevTasks = fs.existsSync(path.join(dir, 'tasks.md')) ? fs.readFileSync(path.join(dir, 'tasks.md'), 'utf8') : '';
    const merged = mergeTasks(prevTasks, change.files['tasks.md']);
    change.files['tasks.md'] = merged.md;

    for (const [rel, content] of Object.entries(change.files)) {
      const file = path.join(dir, rel);
      if (opts.dryRun) { console.log(`  [dry] ${path.relative(root, file)}`); continue; }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content, 'utf8');
    }
    const tag = change.delta === 'MODIFIED' ? ` [MODIFIED, revision ${change.revision}]` : '';
    console.log(`  ${opts.dryRun ? '[dry] ' : ''}${change.id}  ->  capability \`${change.capability}\`${change.isNewCapability ? ' (nueva)' : ''}, ${change.trace.scenarios} escenario(s)${tag}`);
    if (merged.kept) console.log(`           ${merged.kept} tarea(s) hecha(s) conservada(s)${merged.lost.length ? `; ${merged.lost.length} perdida(s) porque su texto cambio: ${merged.lost.map((t) => `"${t}"`).join(', ')}` : ''}`);
    ledger.push({ ...entry, action: 'written', tasksKept: merged.kept, tasksLost: merged.lost });
    written++;
  }

  if (failures.length) {
    for (const f of failures) console.error(`\n  error: ${f}`);
    console.error(`\n${failures.length} story/ies no se pudieron regenerar. Nada de esas stories se escribio.`);
    process.exit(1);
  }

  const plan = planSprint(doc);
  if (!opts.dryRun) {
    const P = paths(root);
    const traceFile = P.trace;
    fs.mkdirSync(P.home, { recursive: true });
    // Se fusiona con lo que habia: `--only 1.2` no puede borrar la trazabilidad de las demas.
    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(traceFile, 'utf8')); } catch { /* primera corrida */ }
    fs.writeFileSync(traceFile, JSON.stringify(mergeTrace(prev, {
      source: path.relative(root, path.resolve(opts.input)),
      project: doc.projectName,
      lang,
      requirements: doc.requirements,
      changes: trace,
    }), null, 2) + '\n', 'utf8');
    fs.writeFileSync(P.sprintPlan, renderSprintPlan(doc, plan) + '\n', 'utf8');
    // El ledger es el unico archivo con fecha: es historia. Una linea por corrida.
    appendLedger(root, {
      at: new Date().toISOString(),
      source: path.relative(root, path.resolve(opts.input)),
      sourceHash: sha256(source),
      options: { only: opts.only, epic: opts.epic, force: opts.force, lang, normative: opts.normative },
      changes: ledger,
    });
  }

  console.log(`\n${written} change(s) generado(s), ${skipped} omitido(s). ${plan.waves.length} ola(s) de trabajo paralelo.`);
  if (!opts.dryRun) console.log('Trazabilidad en .un-specweaver/trace.json — plan en .un-specweaver/sprint-plan.md — historial en .un-specweaver/changelog.jsonl');
  if (!opts.dryRun) {
    const { refreshDashboard } = await import('../src/status/collect.mjs');
    if (await refreshDashboard(root)) console.log('Dashboard actualizado: .un-specweaver/dashboard.html');
  }
  if (plan.cycles.length) { console.error(`\nCiclo de dependencias en: ${plan.cycles.join(', ')}`); process.exit(1); }
}

// Solo corre como CLI. Sin esta guarda, importar el modulo para testear findEpics
// disparaba main() y abortaba el proceso.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
