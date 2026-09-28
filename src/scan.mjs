// Que hay en un proyecto que ya existe, antes de meterlo al metodo.
//
// El error tipico de adoptar es planear sobre lo que uno CREE que hace el codigo, y el segundo
// error es intentar especificar el sistema entero antes de tocar nada — dos semanas de escribir
// specs de codigo que nadie va a mirar. Este escaneo existe para las dos cosas: da evidencia en
// vez de impresiones, y propone una linea base ACOTADA a lo que se va a trabajar.
//
// Es una vista: no escribe nada. Todo sale de leer el repo.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { paths, rel } from './paths.mjs';
import { VENDORS, which } from './env.mjs';

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const exists = (p) => fs.existsSync(p);
const git = (root, args) => { try { return execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };

// Extension -> lenguaje. Solo lo que sirve para decir "esto es un proyecto de X".
const LANGS = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript',
  '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.kt': 'Kotlin', '.rb': 'Ruby',
  '.php': 'PHP', '.cs': 'C#', '.swift': 'Swift', '.c': 'C', '.h': 'C', '.cpp': 'C++', '.scala': 'Scala',
  '.vue': 'Vue', '.svelte': 'Svelte', '.astro': 'Astro', '.sql': 'SQL', '.sh': 'Shell',
};
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'target', 'vendor', '.venv', '__pycache__',
  'graphify-out', '_bmad', '.next', '.nuxt', 'coverage', '.cache']);
const TEST_HINT = /(^|[./_-])(test|tests|spec|specs|__tests__|e2e)([./_-]|$)/i;

export function scanCode(root, { maxFiles = 20000 } = {}) {
  const langs = {}, dirs = new Set();
  let files = 0, tests = 0;
  const walk = (dir, depth = 0) => {
    if (files > maxFiles || depth > 8) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      if (SKIP.has(e.name)) continue;
      const p = path.join(dir, e.name);
      // .github se recorre (los workflows importan) pero no es estructura del proyecto.
      if (e.isDirectory()) { if (depth === 0 && !e.name.startsWith('.')) dirs.add(e.name); walk(p, depth + 1); continue; }
      const lang = LANGS[path.extname(e.name)];
      if (!lang) continue;
      files++;
      langs[lang] = (langs[lang] || 0) + 1;
      if (TEST_HINT.test(path.relative(root, p))) tests++;
    }
  };
  walk(root);
  return {
    files, tests,
    languages: Object.entries(langs).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, files: n })),
    topDirs: [...dirs].sort(),
  };
}

// El stack declarado: lo que dicen los manifiestos, no lo que uno supone.
export function scanStack(root) {
  const out = [];
  const pkg = readJson(path.join(root, 'package.json'));
  if (pkg) out.push({ manifest: 'package.json', name: pkg.name || null,
    deps: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).length,
    scripts: Object.keys(pkg.scripts || {}) });
  for (const [f, label] of [['pyproject.toml', 'Python'], ['requirements.txt', 'Python'], ['go.mod', 'Go'],
                            ['Cargo.toml', 'Rust'], ['pom.xml', 'Java'], ['build.gradle', 'Java'], ['Gemfile', 'Ruby'],
                            ['composer.json', 'PHP'], ['Dockerfile', 'Docker'], ['docker-compose.yml', 'Docker']])
    if (exists(path.join(root, f))) out.push({ manifest: f, name: label });
  return out;
}

// Lo que ya se escribio: sirve de insumo para el PRD brownfield en vez de partir de cero.
export function scanDocs(root) {
  const out = [];
  const add = (p, kind) => { if (exists(path.join(root, p))) out.push({ file: p, kind }); };
  for (const f of ['README.md', 'README.rst', 'CONTRIBUTING.md', 'CHANGELOG.md', 'ARCHITECTURE.md', 'AGENTS.md', 'CLAUDE.md'])
    add(f, f.startsWith('README') ? 'readme' : f === 'ARCHITECTURE.md' ? 'architecture' : 'doc');
  for (const d of ['docs', 'doc', 'documentation']) {
    const dir = path.join(root, d);
    if (!exists(dir)) continue;
    const walk = (p, depth = 0) => {
      if (depth > 2) return;
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const f = path.join(p, e.name);
        if (e.isDirectory()) { walk(f, depth + 1); continue; }
        if (!/\.(md|rst|adoc)$/i.test(e.name)) continue;
        const relp = path.relative(root, f);
        out.push({ file: relp, kind: /adr|decision/i.test(relp) ? 'adr' : 'doc' });
      }
    };
    walk(dir);
  }
  return out;
}

export function scanCi(root) {
  const out = [];
  const wf = path.join(root, '.github', 'workflows');
  if (exists(wf)) for (const f of fs.readdirSync(wf)) if (/\.ya?ml$/.test(f)) out.push(path.join('.github/workflows', f));
  for (const f of ['.gitlab-ci.yml', 'Jenkinsfile', '.circleci/config.yml', 'azure-pipelines.yml'])
    if (exists(path.join(root, f))) out.push(f);
  return out;
}

export function scanHistory(root) {
  if (!git(root, ['rev-parse', '--is-inside-work-tree'])) return null;
  const count = Number(git(root, ['rev-list', '--count', 'HEAD']) || 0);
  const first = git(root, ['log', '--reverse', '--format=%ad', '--date=short', '--max-count=1']);
  const last = git(root, ['log', '-1', '--format=%ad', '--date=short']);
  const authors = (git(root, ['shortlog', '-sn', '--all', '--no-merges']) || '').split('\n').filter(Boolean).length;
  const recent = Number(git(root, ['rev-list', '--count', '--since=90.days', 'HEAD']) || 0);
  const days = first && last ? Math.round((new Date(last) - new Date(first)) / 86400000) : null;
  return { commits: count, first, last, days, authors, recent, branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']) };
}

// Que le falta a este proyecto para trabajar con el metodo, y que bloquea que.
export function scanMethod(root) {
  const P = paths(root);
  const trace = readJson(P.trace);
  const specs = exists(P.specs) ? fs.readdirSync(P.specs).filter((d) => exists(path.join(P.specs, d, 'spec.md'))) : [];
  const changes = exists(P.changes) ? fs.readdirSync(P.changes).filter((d) => d !== 'archive') : [];
  const planning = path.join(P.bmadOut, 'planning-artifacts');
  const has = (d) => exists(path.join(planning, d)) && fs.readdirSync(path.join(planning, d)).length > 0;
  const archBase = read(path.join(root, 'docs', 'architecture-base.md'));
  return {
    installed: exists(P.config),
    legacyLayout: P.legacy,
    brief: has('briefs'), prd: has('prds'), architecture: has('architecture'), ux: has('ux-designs'),
    epics: exists(path.join(planning, 'epics.md')) || exists(path.join(P.bmadOut, 'epics.md')),
    trace: !!trace, capabilities: specs, changes: changes.length,
    // La plantilla sin llenar es peor que no tenerla: el agente la lee como si fuera doctrina.
    architectureBase: archBase ? (/\[(completar|TODO|pendiente)\]/i.test(archBase) || archBase.length < 1200 ? 'plantilla' : 'llena') : 'ausente',
    graph: exists(path.join(root, VENDORS.graphify.outDir, 'graph.json')),
    memory: exists(path.join(P.engram, 'engram.db')),
  };
}

export function scan(root) {
  root = path.resolve(root);
  const code = scanCode(root);
  const history = scanHistory(root);
  const method = scanMethod(root);
  const docs = scanDocs(root);
  // Sin codigo no hay nada que documentar: el camino es /sw:new, no el de adopcion. Proponer
  // "levanta lo que el sistema hace hoy" sobre una carpeta vacia es mandar a nadie a ningun lado.
  // Sin codigo PERO con el metodo ya montado o con artefactos, no es un proyecto nuevo: es uno
  // a medio adoptar (o uno de 0.5.x sin codigo propio), y merece su plan, no el de arranque.
  const greenfield = code.files === 0 && !method.installed && !method.legacyLayout && !method.trace && !method.epics;
  const ctx = { code, docs, history, method, greenfield };
  return {
    root, name: path.basename(root), greenfield,
    code, stack: scanStack(root), docs, ci: scanCi(root), history, method,
    plan: plan(ctx),
    questions: questions(ctx),
  };
}

// --- el plan ------------------------------------------------------------------------------
// Ordenado por dependencia real, no por gusto: sin mapa no hay arquitectura derivada, sin PRD
// no hay stories, sin stories no hay specs. Cada paso dice que comando lo hace.

function plan({ code, docs, history, method, greenfield }) {
  const steps = [];
  const add = (id, title, why, cmd, done) => steps.push({ id, title, why, cmd, done: !!done });

  add('install', 'Montar la herramienta', 'instala BMAD, OpenSpec, Engram y graphify, y deja los comandos /sw:*',
      'npx un-specweaver init', method.installed);
  if (greenfield) {
    add('arch-base', 'Llenar docs/architecture-base.md', 'son las restricciones de la organizacion; sin ellas el agente asume defaults propios',
        'editalo a mano (lo escribe init)', method.architectureBase === 'llena');
    add('new', 'Levantar la idea: brief, PRD, arquitectura, UX, epics', 'no hay codigo que documentar: esto arranca conversando',
        '/sw:new', method.epics);
    add('bridge', 'Traducir stories a contratos', 'deterministico: mismo epics.md, mismos specs',
        'npx un-specweaver bridge --strict', method.trace);
    add('build', 'Construir la primera historia', 'contra su contrato, y cerrarla para fijar la linea base',
        '/sw:build <change-id>', method.capabilities.length > 0);
    return steps;
  }
  if (method.legacyLayout) add('migrate', 'Mudar al layout consolidado', 'este proyecto tiene openspec/ y _bmad-output/ en la raiz',
      'npx un-specweaver migrate', false);
  add('map', 'Mapear el codigo real', `${code.files} archivo(s) de codigo: el grafo dice que hay, no que crees que hay`,
      'graphify update .', method.graph);
  add('arch-base', 'Llenar docs/architecture-base.md', 'son las restricciones de la organizacion; sin ellas el agente asume defaults propios',
      'editalo a mano (lo escribe init)', method.architectureBase === 'llena');
  add('document', 'Levantar lo que el sistema hace HOY',
      docs.length ? `hay ${docs.length} documento(s) que sirven de insumo` : 'no hay documentacion previa: sale del codigo y de vos',
      '/sw:adopt → bmad-document-project', method.prd);
  add('prd', 'PRD brownfield con FR numerados', 'describe lo que EXISTE, no lo que quisieras; lo nuevo entra despues por /sw:change',
      '/sw:adopt → bmad-prd', method.prd);
  add('epics', 'Epics y stories del alcance elegido', 'la unidad que una persona termina, con criterios Given/When/Then',
      '/sw:adopt → bmad-create-epics-and-stories', method.epics);
  add('bridge', 'Traducir stories a contratos', 'deterministico: mismo epics.md, mismos specs',
      'npx un-specweaver bridge --strict', method.trace);
  add('baseline', 'Fijar la linea base de specs',
      'es contra lo que /sw:change va a medir el alcance de todo lo que llegue despues',
      'npx un-specweaver close --done', method.capabilities.length > 0);
  return steps;
}

// Lo que el escaneo NO puede deducir y cambia el plan. Se preguntan una vez, al principio.
function questions({ code, docs, history, method, greenfield }) {
  const q = [];
  if (greenfield) return [{
    id: 'greenfield',
    q: 'Este proyecto no tiene codigo todavia. ¿Arrancamos la idea desde cero?',
    why: 'El camino de un proyecto nuevo es /sw:new: brief, PRD, arquitectura, UX y epics conversando. La adopcion (escanear y documentar lo que existe) no aplica aqui.',
    options: ['si, /sw:new', 'el codigo esta en otra carpeta'],
  }];
  const big = code.files > 300;
  q.push({
    id: 'scope',
    q: big ? '¿Adoptamos el sistema entero o solo el area donde vas a trabajar ahora?'
           : '¿Adoptamos todo el proyecto o solo una parte?',
    why: big ? `Son ${code.files} archivos. Especificar todo antes de tocar nada son semanas de escribir contratos de codigo que quiza nadie mire. Lo barato es una linea base ACOTADA: el area donde vas a trabajar, y el resto entra cuando se toque.`
             : 'El proyecto es chico, asi que adoptarlo entero es viable. Igual conviene decirlo explicitamente.',
    options: big ? ['solo el area donde voy a trabajar (recomendado)', 'el sistema entero'] : ['todo', 'solo un area'],
  });
  q.push({
    id: 'requirements',
    q: '¿Hay requisitos escritos en algun lado? (Jira, Notion, Confluence, un doc suelto)',
    why: docs.length ? `Encontre ${docs.length} documento(s) en el repo, pero lo que vive fuera no lo puedo ver y es el mejor insumo para el PRD.`
                     : 'No hay documentacion en el repo. Si tampoco hay fuera, el PRD sale del codigo y de lo que vos sepas.',
    options: ['si, los traigo', 'no hay: sale del codigo'],
  });
  q.push({
    id: 'stability',
    q: '¿Que partes estan estables y cuales estan por reescribirse?',
    why: 'Una linea base sobre codigo que va a cambiar la semana que viene es trabajo tirado. Lo estable se especifica; lo que se va a reescribir espera a su propia story.',
    options: [],
  });
  if (history && history.recent === 0 && history.commits > 0)
    q.push({ id: 'active', q: '¿El proyecto sigue en desarrollo activo?',
      why: `Sin commits en los ultimos 90 dias (${history.commits} en total). Si esta en mantenimiento, conviene adoptar solo lo que se vaya a tocar.`,
      options: ['si, activo', 'mantenimiento'] });
  if (!code.tests && code.files > 20)
    q.push({ id: 'tests', q: 'No encontre tests. ¿Los hay en otro repo, o el proyecto no tiene?',
      why: 'Cada `#### Scenario:` de un spec quiere un test que lo ejerza. Sin tests, la linea base describe comportamiento que nadie verifica — sirve igual, pero conviene saberlo.',
      options: ['estan en otro lado', 'no hay tests'] });
  return q;
}
