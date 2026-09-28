// Preparar la adopcion de un proyecto que ya existe.
//
// `scan` reporta y `/sw:adopt` guia, pero entre los dos faltaba lo que de verdad desbloquea:
// un lugar donde poner lo que ya sabes (un doc, notas, un export de Jira) y las respuestas a
// las preguntas que nadie mas puede contestar. Sin eso, el agente arranca de cero aunque el
// equipo lleve dos años acumulando contexto.
//
// La division es la de siempre: aqui va lo deterministico —recolectar, copiar, dejar por
// escrito lo acordado— y el juicio (escribir el PRD, numerar los FR) lo hace el agente con
// este documento como insumo.
import fs from 'node:fs';
import path from 'node:path';
import { paths, rel } from './paths.mjs';
import { scan } from './scan.mjs';

export const BRIEF = 'adoption-brief.md';

const planningRootOf = (root) => path.join(paths(root).bmadOut, 'planning-artifacts');
export const briefPath = (root) => path.join(planningRootOf(root), BRIEF);
export const inputsDir = (root) => path.join(planningRootOf(root), 'inputs');

// Candidatos a capability, derivados de la estructura. NO se interpretan: un directorio no es
// una capability hasta que alguien lo dice. Se ofrecen para que el usuario confirme o corrija.
export function capabilityCandidates(s) {
  const skip = new Set(['docs', 'test', 'tests', 'scripts', 'config', 'public', 'assets', 'bin']);
  return s.code.topDirs.filter((d) => !skip.has(d.toLowerCase()));
}

/**
 * Copia los insumos que trae el usuario a un lugar donde BMAD y el agente los van a leer.
 * Se copia, no se enlaza: un insumo que desaparece a mitad de la adopcion es peor que no tenerlo.
 */
export function collectInputs(root, sources = []) {
  const dest = inputsDir(root);
  const copied = [];
  for (const src of sources) {
    const abs = path.resolve(src);
    if (!fs.existsSync(abs)) { copied.push({ from: src, error: 'no existe' }); continue; }
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(abs)) {
        const file = path.join(abs, f);
        if (!fs.statSync(file).isFile()) continue;
        fs.mkdirSync(dest, { recursive: true });
        fs.copyFileSync(file, path.join(dest, f));
        copied.push({ from: path.join(src, f), to: path.join(rel(root, dest), f) });
      }
      continue;
    }
    fs.mkdirSync(dest, { recursive: true });
    const name = path.basename(abs);
    fs.copyFileSync(abs, path.join(dest, name));
    copied.push({ from: src, to: path.join(rel(root, dest), name) });
  }
  return copied;
}

const list = (arr, empty = '_(ninguno)_') => (arr.length ? arr.map((x) => `- ${x}`).join('\n') : empty);

export function renderBrief(s, { answers = {}, inputs = [], date = new Date().toISOString().slice(0, 10) } = {}) {
  const L = [];
  L.push(`# Brief de adopcion — ${s.name}`, '');
  L.push(`Generado por \`un-specweaver adopt\` el ${date}. **Esto no es el PRD**: es el insumo con`);
  L.push('el que `/sw:adopt` lo escribe, para que no arranque de cero.', '');

  L.push('## Lo acordado', '');
  if (Object.keys(answers).length) {
    for (const [q, a] of Object.entries(answers)) L.push(`**${q}**`, '', a || '_(sin responder)_', '');
  } else {
    L.push('_(sin responder todavia: corre `npx un-specweaver adopt` en una terminal interactiva)_', '');
  }

  L.push('## Insumos que trajo el equipo', '');
  L.push('Lo que ya estaba escrito vale mas que lo que el agente pueda deducir del codigo.', '');
  L.push(list(inputs.filter((i) => !i.error).map((i) => `\`${i.to}\` (de \`${i.from}\`)`)));
  const failed = inputs.filter((i) => i.error);
  if (failed.length) L.push('', 'No se pudieron traer:', '', list(failed.map((i) => `\`${i.from}\` — ${i.error}`)));
  L.push('');

  L.push('## Evidencia del escaneo', '');
  L.push('| | |', '|---|---|');
  L.push(`| Codigo | ${s.code.files} archivo(s): ${s.code.languages.slice(0, 5).map((l) => `${l.name} (${l.files})`).join(', ') || '—'} |`);
  L.push(`| Tests | ${s.code.tests ? `${s.code.tests} archivo(s)` : '**no se encontraron**'} |`);
  L.push(`| Stack declarado | ${s.stack.map((x) => x.manifest).join(', ') || '—'} |`);
  L.push(`| Estructura | ${s.code.topDirs.join(', ') || '—'} |`);
  L.push(`| Documentacion en el repo | ${s.docs.length ? s.docs.map((d) => d.file).join(', ') : '—'} |`);
  L.push(`| CI | ${s.ci.join(', ') || '—'} |`);
  if (s.history) L.push(`| Historia | ${s.history.commits} commits, ${s.history.authors} autor(es), ${s.history.first} → ${s.history.last}${s.history.recent ? `, ${s.history.recent} en 90 dias` : ', sin actividad reciente'} |`);
  L.push('');

  L.push('## Candidatos a capability', '');
  L.push('Derivados de la estructura de primer nivel, **sin interpretar**: un directorio no es una');
  L.push('capability hasta que alguien lo dice. Confirmalos o corregilos en el PRD.', '');
  L.push(list(capabilityCandidates(s).map((d) => `\`${d}/\``)));
  L.push('');

  const pending = s.plan.filter((p) => !p.done);
  L.push('## Lo que falta', '');
  L.push(list(pending.map((p) => `**${p.title}** — ${p.why} → \`${p.cmd}\``)));
  L.push('');

  L.push('## Siguiente', '');
  L.push('Abri tu agente en esta carpeta y corre `/sw:adopt`. Va a leer este documento, confirmar');
  L.push('lo acordado y ejecutar el plan: mapear el codigo, contrastar la arquitectura real con la');
  L.push('declarada, levantar el PRD brownfield **del alcance acordado** y fijar la linea base.', '');
  return L.join('\n');
}

/**
 * Deja el brief y los insumos en su sitio. Idempotente: volver a correrlo reescribe el brief
 * con lo que haya, sin tocar los insumos ya copiados.
 */
export function prepareAdoption(root, { inputs = [], answers = {}, dryRun = false } = {}) {
  root = path.resolve(root);
  const s = scan(root);
  if (s.greenfield) return { ok: false, reason: 'greenfield', scan: s };

  const copied = dryRun ? inputs.map((i) => ({ from: i, to: '(dry-run)' })) : collectInputs(root, inputs);
  const content = renderBrief(s, { answers, inputs: copied });
  const file = briefPath(root);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  }
  return { ok: true, scan: s, file, rel: rel(root, file), inputs: copied, content };
}
