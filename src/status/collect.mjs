// En que va el proyecto, leido de los archivos que ya existen. Una VISTA: no guarda nada, no
// tiene estado propio, se recalcula cada vez. Si guardara algo, en un mes contradiria a la
// fuente (PRD, specs, memlogs, ledger) — que es exactamente lo que la tercera regla prohibe.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseEpics } from '../../bridge/parse-epics.mjs';
import { planSprint } from '../../bridge/plan-sprint.mjs';
import { findEpics, planningRoot, findPlanningArtifacts } from '../../bridge/cli.mjs';
import { readLedger } from '../../bridge/history.mjs';
import { collectDecisions, instabilityRanking, requirementHistory, refKey } from '../../bridge/decisions.mjs';
import { VENDORS, readState, detectEngram, detectGraphify } from '../env.mjs';
import { paths, rel } from '../paths.mjs';

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const exists = (f) => fs.existsSync(f);
const mtime = (f) => { try { return fs.statSync(f).mtime.toISOString().slice(0, 10); } catch { return null; } };

// Fecha que BMAD pone en el nombre de la carpeta (prd-<proyecto>-2026-08-26) o del archivo.
const dateIn = (p) => (p.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || null;

// Progreso de un change: casillas de tasks.md.
export function taskProgress(md) {
  const lines = String(md || '').split('\n').filter((l) => /^\s*- \[[ xX]\] /.test(l));
  const done = lines.filter((l) => /^\s*- \[[xX]\]/.test(l)).length;
  return { done, total: lines.length };
}

// Las tareas con su texto: es lo que el canvas de "tareas" abre al hacer click.
export function taskList(md) {
  const out = [];
  let section = '';
  for (const l of String(md || '').split('\n')) {
    const h = l.match(/^#{1,3}\s+(.+?)\s*$/);
    if (h) { section = h[1].replace(/^\d+\.\s*/, ''); continue; }
    const m = l.match(/^\s*- \[([ xX])\] (?:(\d+(?:\.\d+)*)\s+)?(.*)$/);
    if (m) out.push({ done: m[1] !== ' ', n: m[2] || '', text: m[3].trim(), section });
  }
  return out;
}

// Los changes de OpenSpec, activos y archivados, con su estado derivado.
export function readChanges(root, trace) {
  const dir = paths(root).changes;
  const byId = new Map((trace?.changes || []).map((c) => [c.changeId, c]));
  const out = [];
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === 'archive') continue;
    const t = byId.get(e.name);
    const md = readText(path.join(dir, e.name, 'tasks.md'));
    const progress = taskProgress(md);
    const state = progress.total && progress.done === progress.total ? 'done' : progress.done > 0 ? 'in-progress' : 'pending';
    out.push({ ...changeRow(e.name, t, progress, state, null), tasks: taskList(md) });
  }
  const arch = path.join(dir, 'archive');
  if (exists(arch)) {
    for (const e of fs.readdirSync(arch, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const m = e.name.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
      const id = m ? m[2] : e.name;
      const t = byId.get(id) || [...byId.values()].find((c) => id.startsWith(c.changeId.replace(/-r\d+$/, '')));
      const md = readText(path.join(arch, e.name, 'tasks.md'));
      out.push({ ...changeRow(id, t, taskProgress(md), 'archived', m ? m[1] : null), tasks: taskList(md) });
    }
  }
  return out.sort((a, b) => (a.story || '').localeCompare(b.story || '', undefined, { numeric: true }) || a.id.localeCompare(b.id));
}

function changeRow(id, t, progress, state, archivedAt) {
  const m = id.match(/^e(\d+)s(\d+)-/);
  return {
    id, state, archivedAt, progress,
    story: t?.bmad?.story || (m ? `${m[1]}.${m[2]}` : null),
    title: t?.bmad?.storyTitle || id,
    capability: t?.capability || null,
    revision: t?.revision || (id.match(/-r(\d+)$/) ? Number(id.match(/-r(\d+)$/)[1]) : 1),
    delta: t?.delta || 'ADDED',
    requirements: t?.requirements || [],
  };
}

const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

// Olas del sprint con el estado real de cada change: que se puede empezar ya, que esta
// bloqueado y por quien. Se recalculan desde epics.md (misma regla que el puente); si no hay
// epics.md, no hay sprint.
export function sprintStatus(root, changes) {
  const epicsFile = findEpics(root)[0];
  if (!epicsFile) return null;
  const doc = parseEpics(readText(epicsFile));
  const plan = planSprint(doc);
  const byStory = new Map();
  for (const c of changes) {
    // La revision mas alta manda: es la version vigente de esa story.
    const cur = byStory.get(c.story);
    if (!cur || c.revision > cur.revision || (c.revision === cur.revision && c.state === 'archived')) byStory.set(c.story, c);
  }
  const stateOf = (story) => byStory.get(story)?.state || 'missing';
  // Misma regla que /sw:build: una dependencia esta satisfecha si esta archivada O con su
  // tasks.md completo. Verificado en un proyecto real donde nadie archivaba: exigir el archive
  // marcaba como bloqueadas 22 stories cuyas dependencias ya estaban terminadas.
  const satisfied = (story) => ['archived', 'done'].includes(stateOf(story));
  const waves = plan.waves.map((wave, i) => ({
    n: i + 1,
    items: wave.map((n) => {
      const st = stateOf(n.story);
      const blockedBy = satisfied(n.story) ? [] : n.dependsOn.filter((d) => !satisfied(d));
      return { story: n.story, title: n.title, changeId: byStory.get(n.story)?.id || n.changeId, capability: n.capability, state: st, blockedBy, ready: !satisfied(n.story) && !blockedBy.length };
    }),
  }));
  const all = waves.flatMap((w) => w.items);
  const current = waves.find((w) => w.items.some((i) => !satisfied(i.story)))?.n || null;
  return {
    waves, current,
    totals: { stories: all.length, archived: all.filter((i) => i.state === 'archived').length, inProgress: all.filter((i) => i.state === 'in-progress' || i.state === 'done').length, ready: all.filter((i) => i.ready && i.state === 'pending').length, missing: all.filter((i) => i.state === 'missing').length },
    crossEpic: plan.crossEpic, cycles: plan.cycles,
  };
}

// Las seis fases del metodo, con el artefacto que prueba que pasaron.
export function phases(root, artifacts, trace, changes) {
  const of = (kind) => artifacts.filter((a) => a.kind === kind).map((a) => ({ file: path.relative(root, a.file), date: dateIn(a.file) || mtime(a.file) }));
  const brief = of('briefs'), prd = of('prds'), arch = of('architecture'), ux = of('ux-designs'), epics = of('epics');
  const active = changes.filter((c) => c.state !== 'archived');
  const archived = changes.filter((c) => c.state === 'archived');
  return [
    { n: 1, key: 'understand', done: prd.length > 0, artifacts: [...brief, ...prd] },
    { n: 2, key: 'decide', done: arch.length > 0, partial: arch.length > 0 && !ux.length, artifacts: [...arch, ...ux] },
    { n: 3, key: 'decompose', done: epics.length > 0, artifacts: epics },
    { n: 4, key: 'translate', done: !!trace && (trace.changes || []).length > 0, artifacts: trace ? [{ file: rel(root, paths(root).trace), date: mtime(paths(root).trace) }] : [], count: trace?.changes?.length || 0 },
    { n: 5, key: 'build', done: changes.length > 0 && active.every((c) => c.state === 'done'), partial: active.some((c) => c.state !== 'pending'), count: active.length },
    { n: 6, key: 'close', done: changes.length > 0 && archived.length === changes.length, partial: archived.length > 0, count: archived.length },
  ];
}

// Requisitos con cobertura (trace) e inestabilidad (decisiones).
// El inventario sale de epics.md (la fuente, con los eliminados tachados); trace.json es
// derivado y solo se usa si no hay epics.md.
export function requirementsView(root, pr, trace, epics = [], changes = [], inventory = null) {
  const reqs = inventory || trace?.requirements;
  if (!reqs) return { rows: [], orphans: [] };
  const rank = new Map(instabilityRanking(root, pr, trace).map((r) => [refKey(r.id), r]));
  // La cobertura se lee de epics.md (el FR Coverage Map de BMAD), que es la fuente; trace.json
  // es derivado y puede estar incompleto. Caso real: un trace danado por el bug de --only
  // mostraba 2/34 FR cubiertos cuando epics.md decia 32/34.
  const covered = new Map();
  const add = (r, story) => { const k = refKey(r); if (!covered.has(k)) covered.set(k, []); covered.get(k).push(story); };
  for (const e of epics) for (const st of e.stories) for (const r of st.requirements || []) add(r, st.id);
  for (const c of trace?.changes || []) for (const r of c.requirements || []) add(r, c.bmad.story);
  // Un requisito esta completo cuando TODAS las stories que lo cubren estan terminadas o
  // archivadas. Sin stories no puede estar completo: nadie lo construyo.
  const storyState = new Map();
  for (const c of changes) { const cur = storyState.get(c.story); if (!cur || c.revision > cur.revision) storyState.set(c.story, c); }
  const satisfied = (st) => ['done', 'archived'].includes(storyState.get(st)?.state);
  const groups = [['functional', 'FR'], ['nonFunctional', 'NFR'], ['ux', 'UX-DR'], ['additional', 'ADD']];
  const rows = [];
  for (const [g, label] of groups) {
    for (const r of reqs?.[g] || []) {
      const k = refKey(r.id);
      const h = rank.get(k);
      const st = [...new Set(covered.get(k) || [])];
      rows.push({ id: r.id, group: label, text: r.text, removed: !!r.removed, removedAt: r.removedAt || null, stories: st, done: !r.removed && st.length > 0 && st.every(satisfied), changes: h?.changes || 0, mentions: h?.mentions || 0, last: h?.last || null });
    }
  }
  return { rows, orphans: rows.filter((r) => r.group === 'FR' && !r.removed && !r.stories.length).map((r) => r.id) };
}

// Linea de tiempo unica: decisiones que cambian algo, corridas del puente, archives.
export function timeline(root, pr, changes) {
  const ev = [];
  const { entries } = collectDecisions(root, pr);
  for (const e of entries) {
    if (!['change', 'override', 'decision'].includes(e.type) && e.kind !== 'change-proposal') continue;
    ev.push({ when: e.date, source: e.kind, type: e.type, text: e.text, refs: e.refs, file: e.file });
  }
  for (const run of readLedger(root)) {
    const written = (run.changes || []).filter((c) => c.action === 'written');
    if (!written.length) continue;
    ev.push({ when: run.at.slice(0, 10), source: 'bridge', type: written.some((c) => c.delta === 'MODIFIED') ? 'modified' : 'generated',
      text: written.map((c) => `${c.changeId}${c.revision > 1 ? ` (r${c.revision})` : ''}`).join(', '), refs: written.map((c) => `Story ${c.story}`), file: '.un-specweaver/changelog.jsonl' });
  }
  for (const c of changes) if (c.state === 'archived' && c.archivedAt) ev.push({ when: c.archivedAt, source: 'openspec', type: 'archived', text: c.id, refs: c.story ? [`Story ${c.story}`] : [], file: `openspec/changes/archive/${c.archivedAt}-${c.id}` });
  return ev.sort((a, b) => String(b.when || '').localeCompare(String(a.when || '')));
}

// El arbol de planeacion tal como lo escribio BMAD: epics, stories y sus criterios. Es lo que
// el flujo PRD → requisito → epic → story → spec necesita para dibujarse.
export function readPlanning(root) {
  const f = findEpics(root)[0];
  if (!f) return null;
  return parseEpics(readText(f));
}

export function epicsTree(root, doc = readPlanning(root)) {
  if (!doc) return [];
  return doc.epics.map((e) => ({
    n: e.n, title: e.title, goal: e.goal,
    stories: e.stories.map((st) => ({
      id: st.id, title: st.title, role: st.role, want: st.want, benefit: st.benefit,
      requirements: st.requirements, requirementsFrom: st.requirementsFrom,
      criteria: st.acceptanceCriteria.map((ac) => ({ given: ac.given, when: ac.when, then: ac.then, and: ac.and })),
    })),
  }));
}

// Los commits son el registro mas honesto de cuando se trabajo: memlogs y archives marcan
// hitos, git marca cada dia con manos en el codigo. Sin repo, no hay commits y no pasa nada.
export function commitsByDay(root) {
  const out = new Map();
  for (const [d, subject] of commitLog(root)) out.set(d, (out.get(d) || 0) + 1);
  return out;
}

export function commitLog(root) {
  try {
    const log = execFileSync('git', ['-C', root, 'log', '--date=short', '--format=%ad%x09%s'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return log.split('\n').filter(Boolean).map((l) => { const i = l.indexOf('\t'); return [l.slice(0, i), l.slice(i + 1)]; });
  } catch { return []; }
}

// Que paso cada dia, con detalle: es lo que se abre al hacer click en una fecha del calendario.
export function activityDetail({ artifacts, decisions, ledger, changes, commits }) {
  const days = {};
  const day = (d) => (days[d] = days[d] || { commits: [], decisions: [], changes: [], bridge: [], archived: [], artifacts: [] });
  for (const [d, subject] of commits) day(d).commits.push(subject);
  for (const a of artifacts) { const d = dateIn(a.file); if (d && a.kind !== 'decisions') day(d).artifacts.push({ kind: a.kind, file: path.basename(a.file) }); }
  for (const e of decisions.entries) if (e.date) (e.type === 'change' || e.type === 'override' || e.kind === 'change-proposal' ? day(e.date).changes : day(e.date).decisions).push({ kind: e.kind, type: e.type, text: e.text, refs: e.refs });
  for (const run of ledger) day(run.at.slice(0, 10)).bridge.push({ options: run.options, changes: (run.changes || []).map((c) => `${c.changeId}${c.action === 'skipped' ? ' (omitido)' : ''}`) });
  for (const c of changes) if (c.archivedAt) day(c.archivedAt).archived.push({ id: c.id, story: c.story, title: c.title });
  return days;
}

// Los documentos de planeacion, con su texto: el dashboard los muestra, no solo los nombra.
export function documents(root, artifacts, decisionSources) {
  const out = [];
  for (const a of artifacts) if (a.kind !== 'decisions' && a.kind !== 'epics') out.push({ kind: a.kind, name: path.basename(a.file), file: path.relative(root, a.file), text: readText(a.file), memlog: false });
  for (const d of decisionSources) if (d.format === 'memlog') out.push({ kind: d.kind, name: `${d.artifact} · memlog`, file: path.relative(root, d.file), text: readText(d.file), memlog: true });
  return out;
}

const daysBetween = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 86400000) : null);

// Lo que gerencia pregunta: cuanto se ha hecho, cuanto falta, cuanto costo llegar aqui.
// "Esfuerzo" se mide con lo que el metodo deja escrito: artefactos, decisiones registradas,
// requisitos, stories, criterios, tareas. No con horas, que nadie registra.
export function metrics({ artifacts, epics, requirements, changes, decisions, ledger, timeline, sprint, commits = new Map() }) {
  const stories = epics.flatMap((e) => e.stories);
  const scenarios = stories.reduce((n, st) => n + st.criteria.length, 0);
  const tasks = changes.reduce((a, c) => ({ done: a.done + c.progress.done, total: a.total + c.progress.total }), { done: 0, total: 0 });
  const active = changes.filter((c) => c.state !== 'archived');
  const closedStories = new Set(changes.filter((c) => c.state === 'archived' || c.state === 'done').map((c) => c.story));
  const inProgress = new Set(changes.filter((c) => c.state === 'in-progress').map((c) => c.story));
  // Los eliminados por decision no cuentan como vivos: ni en el total, ni como 'sin story'.
  const fr = requirements.rows.filter((r) => r.group === 'FR' && !r.removed);
  const removed = requirements.rows.filter((r) => r.removed).length;
  const dates = [...artifacts.map((a) => dateIn(a.file)), ...timeline.map((e) => e.when), ...commits.keys()].filter(Boolean).sort();
  const byKind = {};
  for (const e of decisions.entries) {
    const k = e.kind;
    byKind[k] = byKind[k] || { entries: 0, decisions: 0, changes: 0, overrides: 0, assumptions: 0 };
    byKind[k].entries++;
    if (e.type === 'decision') byKind[k].decisions++;
    if (e.type === 'change' || e.kind === 'change-proposal') byKind[k].changes++;
    if (e.type === 'override') byKind[k].overrides++;
    if (e.type === 'assumption') byKind[k].assumptions++;
  }
  const phaseDates = {};
  for (const a of artifacts) { const d = dateIn(a.file); if (d && (!phaseDates[a.kind] || d < phaseDates[a.kind])) phaseDates[a.kind] = d; }
  // Cuando se trabajo: cada dia con actividad registrada y que paso ese dia. Es lo que la
  // linea de tiempo de trabajo dibuja; los dias sin registro no aparecen porque no se sabe.
  const activity = new Map();
  const day = (d) => { if (!activity.has(d)) activity.set(d, { date: d, commits: 0, decisions: 0, changes: 0, bridge: 0, archived: 0, artifacts: [] }); return activity.get(d); };
  const bump = (d, k) => { if (d) day(d)[k]++; };
  for (const a of artifacts) { const d = dateIn(a.file); if (d && a.kind !== 'decisions' && !day(d).artifacts.includes(a.kind)) day(d).artifacts.push(a.kind); }
  for (const e of decisions.entries) bump(e.date, e.type === 'change' || e.type === 'override' || e.kind === 'change-proposal' ? 'changes' : 'decisions');
  for (const run of ledger) bump(run.at.slice(0, 10), 'bridge');
  for (const c of changes) if (c.archivedAt) bump(c.archivedAt, 'archived');
  for (const [d, n] of commits) day(d).commits += n;
  return {
    requirements: { fr: fr.length, nfr: requirements.rows.filter((r) => r.group === 'NFR').length, ux: requirements.rows.filter((r) => r.group === 'UX-DR').length, total: requirements.rows.length,
      covered: fr.filter((r) => r.stories.length).length, coveragePct: fr.length ? Math.round((fr.filter((r) => r.stories.length).length / fr.length) * 100) : null,
      done: fr.filter((r) => r.done).length, donePct: fr.length ? Math.round((fr.filter((r) => r.done).length / fr.length) * 100) : null, removed,
      // NFR y UX-DR con la misma regla: completo cuando todas las stories que lo cubren terminaron.
      nfrDone: requirements.rows.filter((r) => r.group === 'NFR' && r.done).length, uxDone: requirements.rows.filter((r) => r.group === 'UX-DR' && r.done).length,
      nfrCovered: requirements.rows.filter((r) => r.group === 'NFR' && r.stories.length).length, uxCovered: requirements.rows.filter((r) => r.group === 'UX-DR' && r.stories.length).length,
      unstable: requirements.rows.filter((r) => r.changes >= 2).length },
    epics: epics.length, stories: stories.length, scenarios,
    storiesDone: closedStories.size, storiesInProgress: inProgress.size,
    storiesPct: stories.length ? Math.round((closedStories.size / stories.length) * 100) : null,
    tasks, tasksPct: tasks.total ? Math.round((tasks.done / tasks.total) * 100) : null,
    changes: { total: changes.length, archived: changes.length - active.length, active: active.length, revisions: changes.filter((c) => c.revision > 1).length, doneUnarchived: active.filter((c) => c.state === 'done').length },
    bridgeRuns: ledger.length,
    decisions: { total: decisions.entries.length, byKind, overrides: decisions.entries.filter((e) => e.type === 'overrides' || e.type === 'override').length, changes: decisions.entries.filter((e) => e.type === 'change' || e.kind === 'change-proposal').length },
    dates: { first: dates[0] || null, last: dates.at(-1) || null, days: daysBetween(dates[0], dates.at(-1)), phases: phaseDates, activeDays: activity.size },
    activity: [...activity.values()].sort((a, b) => a.date.localeCompare(b.date)),
    sprint: sprint ? { waves: sprint.waves.length, current: sprint.current, ready: sprint.totals.ready } : null,
  };
}

// Que cambio y a que le pego: cada cambio registrado (memlog, propuesta, revision del puente)
// con los requisitos que cita y, via trace, las stories y changes que esos requisitos tocan.
export function impacts(decisions, trace, ledger) {
  const storiesByReq = new Map();
  for (const c of trace?.changes || []) for (const r of c.requirements || []) {
    const k = refKey(r);
    if (!storiesByReq.has(k)) storiesByReq.set(k, new Set());
    storiesByReq.get(k).add(c.bmad.story);
  }
  const changeByStory = new Map((trace?.changes || []).map((c) => [c.bmad.story, c.changeId]));
  const out = [];
  for (const e of decisions.entries) {
    if (!(e.type === 'change' || e.type === 'override' || e.kind === 'change-proposal') || !e.refs.length) continue;
    const stories = [...new Set(e.refs.flatMap((r) => [...(storiesByReq.get(refKey(r)) || [])]))].sort();
    out.push({ when: e.date, source: e.kind, type: e.type, text: e.text, refs: e.refs, stories, changes: stories.map((s) => changeByStory.get(s)).filter(Boolean), file: e.file });
  }
  for (const run of ledger) {
    const mod = (run.changes || []).filter((c) => c.action === 'written' && c.delta === 'MODIFIED');
    if (!mod.length) continue;
    const stories = mod.map((c) => c.story);
    const refs = [...new Set((trace?.changes || []).filter((c) => stories.includes(c.bmad.story)).flatMap((c) => c.requirements || []))];
    out.push({ when: run.at.slice(0, 10), source: 'bridge', type: 'modified', text: mod.map((c) => `${c.changeId} (rev ${c.revision})`).join(', '), refs, stories, changes: mod.map((c) => c.changeId), file: '.un-specweaver/changelog.jsonl' });
  }
  return out.sort((a, b) => String(b.when || '').localeCompare(String(a.when || '')));
}

// Las decisiones que hay que tener presentes: descartes con motivo primero (son las que se
// reabren por accidente), luego decisiones y restricciones que citan un requisito, luego el
// resto. Agrupadas por la fase que las tomo.
export function keyDecisions(decisions, limit = 40) {
  const weight = (e) => (e.type === 'override' ? 0 : e.type === 'constraint' ? 1 : e.type === 'decision' && e.refs.length ? 2 : e.type === 'direction' ? 3 : e.type === 'decision' ? 4 : 9);
  return decisions.entries
    .filter((e) => ['override', 'constraint', 'decision', 'direction'].includes(e.type) && e.kind !== 'change-proposal')
    .map((e) => ({ kind: e.kind, artifact: e.artifact, type: e.type, text: e.text, refs: e.refs, date: e.date, file: e.file, weight: weight(e) }))
    .sort((a, b) => a.weight - b.weight || String(a.date || '').localeCompare(String(b.date || '')))
    .slice(0, limit);
}

export function collectStatus(root) {
  root = path.resolve(root);
  const state = readState(root);
  const trace = readJson(paths(root).trace);
  const pr = planningRoot(root);
  const artifacts = findPlanningArtifacts(root);
  const changes = readChanges(root, trace);
  const decisions = collectDecisions(root, pr);
  const byType = {};
  for (const e of decisions.entries) byType[e.type] = (byType[e.type] || 0) + 1;
  const g = detectGraphify(root);
  const graph = g.graph ? readJson(path.join(root, g.graph)) : null;
  const e = detectEngram(root);
  const doc = readPlanning(root);
  const epics = epicsTree(root, doc);
  const requirements = requirementsView(root, pr, trace, epics, changes, doc?.requirements || null);
  const sprint = sprintStatus(root, changes);
  const ledger = readLedger(root);
  const tl = timeline(root, pr, changes);
  const commits = commitLog(root);
  // Historia por requisito, para el detalle al hacer click. Solo los que tienen algo que contar.
  const history = {};
  for (const r of requirements.rows) if (r.mentions > 0) history[r.id] = requirementHistory(root, pr, r.id, trace).events;

  return {
    generatedAt: new Date().toISOString(),
    project: { name: doc?.projectName || trace?.project || path.basename(root), root, lang: state?.preferences?.lang || state?.lang || 'es', agents: state?.agents || [], installedAt: state?.installedAt || null, vendors: state?.vendors || null },
    phases: phases(root, artifacts, trace, changes),
    metrics: metrics({ artifacts, epics, requirements, changes, decisions, ledger, timeline: tl, sprint, commits: commitsByDay(root) }),
    activityDetail: activityDetail({ artifacts, decisions, ledger, changes, commits }),
    documents: documents(root, artifacts, decisions.sources),
    epics,
    requirements,
    history,
    changes,
    sprint,
    decisions: { total: decisions.entries.length, sources: decisions.sources.length, byType, ranking: instabilityRanking(root, pr, trace).slice(0, 10), key: keyDecisions(decisions), all: decisions.entries.map((e) => ({ kind: e.kind, artifact: e.artifact, type: e.type, text: e.text, refs: e.refs, date: e.date })) },
    impacts: impacts(decisions, trace, ledger),
    timeline: tl,
    graph: { available: !!g.bin, path: g.graph, html: exists(path.join(root, VENDORS.graphify.outDir, 'graph.html')) ? path.join(VENDORS.graphify.outDir, 'graph.html') : null, nodes: graph?.nodes?.length ?? null, edges: graph?.edges?.length ?? null },
    engram: { available: e.available, isolated: e.isolated, dir: e.dir, globalPlugin: e.globalPlugin },
  };
}

// Regenera el dashboard si ya existe: lo llaman bridge y close al terminar, porque son los
// comandos que cambian el estado del proyecto. Si nadie lo genero nunca, no se inventa.
export async function refreshDashboard(root) {
  const out = paths(root).dashboard;
  if (!exists(out)) return false;
  const { renderHtml } = await import('./render.mjs');
  const model = collectStatus(root);
  fs.writeFileSync(out, renderHtml(model, model.project.lang), 'utf8');
  return true;
}
