#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { init, doctor } from '../src/init.mjs';
import { VENDORS } from '../src/env.mjs';

const pkg = createRequire(import.meta.url)('../package.json');

const HELP = `
un-specweaver ${pkg.version} — flujo de desarrollo dirigido por especificacion
  BMAD (planeacion) -> puente deterministico -> OpenSpec/SDD (ejecucion)

USO
  npx un-specweaver init [dir]        prepara el entorno completo en un proyecto
  npx un-specweaver doctor [dir]      revisa salud, pasos pendientes y drift de vendors
  npx un-specweaver bridge <epics.md> convierte stories de BMAD en changes de OpenSpec
  npx un-specweaver context        lista los artefactos de planeacion a cargar
  npx un-specweaver history [FR-21] historial de decisiones por requisito, o ranking de los que mas cambian
  npx un-specweaver close [ids]    cierra stories terminadas: valida y archiva su spec (--done: todas las
                                   que tienen sus tareas completas · --dry-run: solo lista)
  npx un-specweaver status [dir]   en que va el proyecto: fases, changes, sprint, requisitos, decisiones
                                   --html escribe .un-specweaver/dashboard.html · --open lo abre · --json
  npx un-specweaver validate       valida todos los specs (envuelve a OpenSpec)
  npx un-specweaver scan [dir]     escanea un proyecto que ya existe y propone como adoptarlo
  npx un-specweaver memory         estado de la memoria del proyecto
                                   import [proyecto]  trae la memoria de la base global
                                   share [--import]   exporta/trae el formato que git si versiona
  npx un-specweaver migrate        muda un proyecto de 0.5.x al layout consolidado
  npx un-specweaver reset          quita TODO lo que la herramienta creo (pide confirmacion)
  npx un-specweaver vendors           muestra las versiones pineadas

INIT
  --agents <ids>   agentes a configurar (default: autodetectados)
                   validos: ${Object.keys(VENDORS.agents).join(', ')}
  Preferencias del proyecto. Si se omiten y hay terminal, init las pregunta una vez y
  quedan en .un-specweaver/config.json. Los flags siempre mandan sobre lo guardado.

  --lang es|en                 idioma de comandos, documentos y mensajes
  --dry-run        imprime el plan exacto sin escribir ni ejecutar nada
  --yes            no pregunta antes de ejecutar el instalador remoto de Gentle-AI
  --force          rehace pasos que ya estaban hechos
  --keep-vendor-commands  conserva /sdd-* y /opsx:* (por defecto se ocultan)
  --prune-extra    poda tambien ${VENDORS.bmad.pruneOptional.join(', ')} (el SDD queda unico dueno de los tests)
  --only <ids>     corre solo estos pasos (coma-separados)
  --skip <ids>     omite estos pasos
  --keep-going     no se detiene en el primer paso que falle

QUE HACE INIT
  1. preflight: node >= 20.11, npx, curl, plataforma
  2. instala BMAD pineado, alcance del proyecto, solo el modulo de planeacion
  3. poda ${VENDORS.bmad.prune.join(', ')}
     (escriben codigo o compiten con OpenSpec; --no-shims evita los shims deprecados)
  4. inicializa OpenSpec
  5. instala y configura Gentle-AI (SDD + Engram) con alcance workspace
  6. segmenta la memoria de Engram por proyecto (.engram/config.json)
  7. instala graphify, la skill en el proyecto, .graphifyignore (solo codigo), el grafo AST y el hook
  8. escribe los comandos /sw:*, la skill un-specweaver y docs/architecture-base.md

  Todo queda dentro del proyecto. Nada se escribe en tu $HOME salvo el binario
  de Gentle-AI, que es una herramienta de sistema.
`;

function flags(argv) {
  const o = { _: [], lang: null, only: [], skip: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--agents') o.agents = argv[++i];
    else if (a === '--lang') o.lang = argv[++i];
    // Existio en 0.1.x. La memoria ahora es siempre por proyecto; se acepta para no romper
    // scripts, se avisa, y se ignora.
    else if (a === '--engram-scope') { argv[++i]; console.error('aviso: --engram-scope ya no existe, la memoria de Engram siempre se segmenta por proyecto'); }
    else if (a === '--graphify') { argv[++i]; console.error('aviso: --graphify ya no existe, el mapa del codigo es parte del metodo (usa --skip graphify-bin,graphify si no lo quieres)'); }
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--yes' || a === '-y') o.yes = true;
    else if (a === '--force') o.force = true;
    else if (a === '--prune-extra') o.pruneExtra = true;
    else if (a === '--keep-vendor-commands') o.keepVendorCommands = true;
    else if (a === '--keep-going') o.keepGoing = true;
    else if (a === '--only') o.only = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--skip') o.skip = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--done') o.done = true;
    else if (a === '--import') o.import = true;
    else if (a === '--html') o.html = true;
    else if (a === '--open') { o.html = true; o.open = true; }
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a.startsWith('--')) { console.error(`Opcion desconocida: ${a}`); process.exit(2); }
    else o._.push(a);
  }
  return o;
}

const argv = process.argv.slice(2);
const cmd = argv[0]?.startsWith('-') ? null : argv[0];

// `bridge` reenvia sus argumentos verbatim: tiene sus propios flags (--strict, --only,
// --normative...) y parsearlos aqui hacia que rechazara los suyos. Va antes de flags().
if (cmd === 'bridge') {
  const cli = new URL('../bridge/cli.mjs', import.meta.url);
  const r = spawnSync(process.execPath, [cli.pathname, ...argv.slice(1)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const o = flags(cmd ? argv.slice(1) : argv);

if (o.version) { console.log(pkg.version); process.exit(0); }
if (o.help || !cmd) { console.log(HELP); process.exit(cmd ? 0 : 1); }

switch (cmd) {
  case 'init':
    process.exit(await init({ ...o, dir: o._[0] }));

  case 'doctor':
    process.exit(doctor({ dir: o._[0], lang: o.lang }));

  case 'context': {
    // Los artefactos de planeacion viven en rutas fechadas y configurables. Que el agente
    // los adivine es como se pierden entre fases: aqui se listan.
    const { findPlanningArtifacts } = await import('../bridge/cli.mjs');
    const root = path.resolve(o._[0] || process.cwd());
    const found = findPlanningArtifacts(root);
    if (!found.length) { console.log('\nNo hay artefactos de planeacion todavia. Corre /sw:new.\n'); process.exit(0); }
    console.log('\nArtefactos de planeacion — cargalos antes de diseñar o construir:\n');
    let last = null;
    for (const a of found) {
      if (a.kind !== last) { console.log(`  ${a.kind}  (${a.what})`); last = a.kind; }
      console.log(`    ${path.relative(root, a.file)}`);
    }
    console.log('');
    process.exit(0);
  }

  case 'history': {
    // Las decisiones que BMAD registro en las conversaciones (.memlog.md, sprint-change-proposal)
    // y lo que hizo el puente (changelog.jsonl), por requisito. Vista derivada: no guarda nada.
    const { planningRoot } = await import('../bridge/cli.mjs');
    const { requirementHistory, instabilityRanking, collectDecisions } = await import('../bridge/decisions.mjs');
    const root = path.resolve(process.cwd());
    const pr = planningRoot(root);
    let trace = null;
    const { paths } = await import('../src/paths.mjs');
    try { trace = JSON.parse((await import('node:fs')).readFileSync(paths(root).trace, 'utf8')); } catch { /* sin puente aun */ }
    const id = o._[0];
    if (!id) {
      const { sources, entries } = collectDecisions(root, pr);
      if (!sources.length) { console.log('\nNo hay memlogs ni propuestas de cambio todavia. Aparecen con /sw:new (BMAD los escribe al conversar).\n'); process.exit(0); }
      console.log(`\n${entries.length} decision(es) en ${sources.length} fuente(s). Requisitos que mas han cambiado despues de nacer:\n`);
      const rows = instabilityRanking(root, pr, trace);
      if (!rows.length) console.log('  (ninguna entrada cita un requisito por id)');
      for (const r of rows.slice(0, 15)) console.log(`  ${r.id.padEnd(9)} ${String(r.changes).padStart(2)} cambio(s)  ${String(r.mentions).padStart(2)} mencion(es)  ${r.stories.length ? `stories ${r.stories.join(', ')}` : ''}${r.last ? `  ultimo ${r.last}` : ''}`);
      console.log('\n  npx un-specweaver history <id> para ver el detalle de uno.\n');
      process.exit(0);
    }
    const h = requirementHistory(root, pr, id, trace);
    if (!h.events.length) { console.log(`\n${id}: sin decisiones registradas que lo citen${h.stories.length ? ` (lo cubren las stories ${h.stories.join(', ')})` : ''}.\n`); process.exit(0); }
    console.log(`\n${h.id} — ${h.changes} cambio(s) en ${h.events.length} evento(s)${h.stories.length ? `; stories ${h.stories.join(', ')}` : ''}\n`);
    for (const e of h.events) console.log(`  ${(e.when || '????-??-??').padEnd(10)} ${e.source.padEnd(22)} (${e.type}) ${e.text}\n             ${e.file}`);
    console.log('');
    process.exit(0);
  }

  case 'close': {
    // Validar y archivar: lo que vuelve el delta linea base. Un comando, no un recordatorio.
    const { closable, closeChanges } = await import('../src/close.mjs');
    const root = path.resolve(process.cwd());
    const done = closable(root);
    let ids = o._;
    if (!ids.length && o.done) ids = done.map((c) => c.id);
    if (!ids.length) {
      if (!done.length) { console.log('\nNo hay changes con todas las tareas completas. Nada que cerrar.\n'); process.exit(0); }
      console.log(`\n${done.length} change(s) con todas las tareas completas, sin archivar:\n`);
      for (const c of done) console.log(`  ${(c.story || '').padEnd(5)} ${c.id}`);
      console.log('\n  npx un-specweaver close --done        cierra todos\n  npx un-specweaver close <id> [<id>]  cierra esos\n');
      process.exit(0);
    }
    const results = closeChanges(root, ids, { dryRun: !!o.dryRun });
    for (const r of results) {
      if (r.dryRun) console.log(`  [dry] ${r.id}  validate --strict → archive`);
      else if (r.ok) console.log(`  ok     ${r.id}  archivado`);
      else console.error(`  falla  ${r.id}  en ${r.step}:\n${r.out.split('\n').map((l) => '         ' + l).join('\n')}`);
    }
    const failed = results.filter((r) => !r.ok);
    if (!o.dryRun && results.length - failed.length) { const { refreshDashboard } = await import('../src/status/collect.mjs'); if (await refreshDashboard(root)) console.log('  dashboard actualizado'); }
    console.log(`\n${results.length - failed.length} cerrado(s), ${failed.length} con fallas.${failed.length ? ' Un change que no valida no se archiva: corrige el epics.md y regenera con `bridge --only N.M --force`.' : ''}\n`);
    process.exit(failed.length ? 1 : 0);
  }

  case 'status': {
    // Vista derivada de lo que ya esta en disco. No guarda estado: el HTML es regenerable
    // y va al .gitignore, igual que graph.html de graphify.
    const { collectStatus } = await import('../src/status/collect.mjs');
    const { renderTerminal, renderHtml } = await import('../src/status/render.mjs');
    const root = path.resolve(o._[0] || process.cwd());
    const model = collectStatus(root);
    const lang = o.lang || model.project.lang;
    if (o.json) { console.log(JSON.stringify(model, null, 2)); process.exit(0); }
    if (o.html) {
      const fs = await import('node:fs');
      const { paths } = await import('../src/paths.mjs');
      const out = paths(root).dashboard;
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, renderHtml(model, lang), 'utf8');
      console.log(`${path.relative(root, out)} (${fs.statSync(out).size} bytes)`);
      if (o.open) {
        const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
        spawnSync(opener, [out], { stdio: 'ignore' });
      }
      process.exit(0);
    }
    console.log(renderTerminal(model, lang));
    process.exit(0);
  }

  case 'scan': {
    // Evidencia antes que impresiones: adoptar planeando sobre lo que uno CREE que hace el
    // codigo es el error tipico, y especificar el sistema entero antes de tocarlo es el otro.
    const { scan } = await import('../src/scan.mjs');
    const root = path.resolve(o._[0] || process.cwd());
    const r = scan(root);
    if (o.json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }

    console.log(`\n${r.name} — que hay aqui\n`);
    const langs = r.code.languages.slice(0, 5).map((l) => `${l.name} (${l.files})`).join(', ');
    console.log(`  codigo      ${r.code.files} archivo(s)${langs ? `: ${langs}` : ''}`);
    console.log(`  tests       ${r.code.tests ? `${r.code.tests} archivo(s) de test` : 'no encontre'}`);
    if (r.stack.length) console.log(`  stack       ${r.stack.map((x) => x.manifest).join(', ')}`);
    if (r.code.topDirs.length) console.log(`  estructura  ${r.code.topDirs.slice(0, 8).join(', ')}`);
    console.log(`  docs        ${r.docs.length ? r.docs.slice(0, 4).map((d) => d.file).join(', ') + (r.docs.length > 4 ? ` (+${r.docs.length - 4})` : '') : 'ninguna'}`);
    if (r.ci.length) console.log(`  CI          ${r.ci.join(', ')}`);
    if (r.history) console.log(`  historia    ${r.history.commits} commits, ${r.history.authors} autor(es), ${r.history.first} → ${r.history.last}${r.history.recent ? ` · ${r.history.recent} en los ultimos 90 dias` : ' · sin actividad reciente'}`);

    console.log(`\nEstado del metodo\n`);
    const m = r.method;
    const mark = (b) => (b ? 'ok  ' : '—   ');
    console.log(`  ${mark(m.installed)} herramienta montada`);
    console.log(`  ${mark(m.graph)} mapa del codigo`);
    console.log(`  ${mark(m.architectureBase === 'llena')} docs/architecture-base.md (${m.architectureBase})`);
    console.log(`  ${mark(m.prd)} PRD`);
    console.log(`  ${mark(m.epics)} epics y stories`);
    console.log(`  ${mark(m.trace)} contratos generados`);
    console.log(`  ${mark(m.capabilities.length > 0)} linea base${m.capabilities.length ? `: ${m.capabilities.length} capability(s)` : ''}`);

    console.log(`\nPlan propuesto\n`);
    for (const st of r.plan) {
      console.log(`  ${st.done ? '✓' : ' '} ${st.title}`);
      if (!st.done) { console.log(`      ${st.why}`); console.log(`      → ${st.cmd}`); }
    }

    console.log(`\nLo que el escaneo no puede saber — se decide una vez, al principio\n`);
    for (const q of r.questions) {
      console.log(`  • ${q.q}`);
      console.log(`    ${q.why}`);
      if (q.options.length) console.log(`    ${q.options.join('  |  ')}`);
      console.log('');
    }
    console.log('  Corre /sw:adopt en tu agente: lee este escaneo, te hace estas preguntas y ejecuta el plan.\n');
    process.exit(0);
  }

  case 'memory': {
    const { memoryStatus, importFromGlobal, share, globalProjects, likelyProjectName } = await import('../src/memory.mjs');
    const root = path.resolve(process.cwd());
    const sub = o._[0];

    if (!sub) {
      const st = memoryStatus(root);
      console.log(`\nMemoria del proyecto: ${st.dir}`);
      console.log(`  ${st.isolated ? 'aislada' : 'SIN AISLAR — corre `npx un-specweaver init`'}${st.hasDb ? `, ${st.observations} observacion(es)` : ', vacia todavia'}`);
      if (st.global) console.log(`\n  En la base global hay "${likelyProjectName(root)}" con ${st.global.observations} observacion(es).\n  Traerla: npx un-specweaver memory import`);
      console.log('\n  memory import [proyecto]   trae la memoria de la base global a este proyecto');
      console.log('  memory share               exporta la memoria a un formato que git puede versionar\n');
      process.exit(0);
    }

    if (sub === 'import') {
      const r = importFromGlobal(root, { project: o._[1], dryRun: !!o.dryRun, force: !!o.force });
      if (!r.ok) {
        if (r.reason === 'no-engram') console.error('\nengram no esta instalado. Corre `npx un-specweaver init`.\n');
        else if (r.reason === 'not-isolated') console.error('\nEste proyecto no tiene memoria aislada todavia. Corre `npx un-specweaver init`.\n');
        else if (r.reason === 'not-found') {
          console.error(`\nLa base global no tiene un proyecto llamado "${r.name}".`);
          if (r.available.length) { console.error('  Hay:'); for (const p of r.available) console.error(`    ${p.name}  (${p.observations} obs)`); console.error('\n  Elegi uno: npx un-specweaver memory import <nombre>'); }
          console.error('');
        } else if (r.reason === 'already-has-memory') console.error(`\nEste proyecto ya tiene ${r.observations} observacion(es) propias.\nImportar de nuevo DUPLICA los prompts (engram deduplica observaciones y sesiones, prompts no).\nSi aun asi queres, usa --force.\n`);
        else console.error(`\nFallo: ${r.reason}\n${r.out || ''}\n`);
        process.exit(1);
      }
      const c = r.counts;
      console.log(`\n${r.dryRun ? '[dry-run] traeria' : 'Traido'} de "${r.name}": ${c.observations} observacion(es), ${c.sessions} sesion(es), ${c.prompts} prompt(s).`);
      console.log(r.dryRun ? '' : 'La base global queda intacta.\n');
      process.exit(0);
    }

    if (sub === 'share') {
      const r = share(root, { importing: !!o.import });
      if (!r.ok) { console.error(`\n${r.reason === 'not-isolated' ? 'Este proyecto no tiene memoria aislada. Corre `npx un-specweaver init`.' : r.out}\n`); process.exit(1); }
      console.log(`\n${r.out}\n\nLos chunks quedan en ${r.dir}: eso SI se commitea (la base binaria no).\nDel otro lado: npx un-specweaver memory share --import\n`);
      process.exit(0);
    }

    console.error(`Subcomando desconocido: ${sub}. Usa: memory | memory import [proyecto] | memory share\n`);
    process.exit(2);
  }

  case 'validate': {
    // OpenSpec no busca hacia arriba: corre con cwd = el padre de openspec/. El flujo nunca
    // lo invoca a mano; por eso esta envuelto aqui.
    const { paths } = await import('../src/paths.mjs');
    const root = path.resolve(o._[0] || process.cwd());
    const r = spawnSync('npx', ['--yes', `${VENDORS.openspec.npm}@${VENDORS.openspec.version}`, 'validate', '--all', '--strict'],
      { cwd: paths(root).openspecCwd, stdio: 'inherit', env: { ...process.env, OPENSPEC_TELEMETRY: '0' } });
    process.exit(r.status ?? 1);
  }

  case 'migrate': {
    const { migrate, migrationPlan } = await import('../src/manage.mjs');
    const root = path.resolve(o._[0] || process.cwd());
    const plan = migrationPlan(root);
    if (!plan.needed) { console.log('\nNada que migrar: este proyecto ya usa el layout consolidado.\n'); process.exit(0); }
    console.log('\nMudanza al layout consolidado (.un-specweaver):\n');
    for (const m of plan.moves) console.log(`  ${path.relative(root, m.from)}  ->  ${path.relative(root, m.to)}`);
    for (const e of plan.edits) console.log(`  ~ ${path.relative(root, e.file)} — ${e.what}`);
    if (o.dryRun) { console.log('\n--dry-run: no se movio nada.\n'); process.exit(0); }
    const r = migrate(root);
    console.log(`\n${r.moved} carpeta(s) movida(s) con git mv (el historial de cada archivo se conserva), ${r.edits.length} archivo(s) reescrito(s).`);
    console.log('Revisa con `git status` y commitea. Despues corre `npx un-specweaver init` para el resto.\n');
    process.exit(0);
  }

  case 'reset': {
    // Quitar el montaje entero. Pide confirmacion: borra la memoria y los specs del proyecto.
    const { reset } = await import('../src/manage.mjs');
    const readline = await import('node:readline/promises');
    const root = path.resolve(o._[0] || process.cwd());
    const { items, clean } = reset(root, { dryRun: true });
    if (!items.length && !clean.length) { console.log('\nNo hay nada de un-specweaver en este proyecto.\n'); process.exit(0); }
    console.log('\nSe va a borrar:\n');
    for (const it of items) console.log(`  ${it.kind === 'data' ? '!' : '-'} ${path.relative(root, it.target).padEnd(40)} ${it.what}`);
    for (const c of clean) console.log(`  ~ ${path.relative(root, c.file).padEnd(40)} ${c.what}`);
    console.log('\n  ! .un-specweaver contiene los specs, la trazabilidad y la memoria del proyecto.');
    console.log('    Lo demas se regenera con `npx un-specweaver init`.\n');
    if (o.dryRun) { console.log('--dry-run: no se borro nada.\n'); process.exit(0); }
    if (!o.yes) {
      if (!process.stdin.isTTY) { console.error('Sin terminal no se asume consentimiento: usa --yes.\n'); process.exit(2); }
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const a = (await rl.question('Escribi "borrar" para confirmar: ')).trim().toLowerCase();
      rl.close();
      if (a !== 'borrar') { console.log('Cancelado.\n'); process.exit(1); }
    }
    const r = reset(root);
    console.log(`\n${r.removed} elemento(s) borrado(s), ${r.clean.length} archivo(s) limpiado(s).\n`);
    process.exit(0);
  }

  case 'vendors':
    console.log(`\nversiones pineadas (${path.basename(new URL('../src/vendors.json', import.meta.url).pathname)})\n`);
    console.log(`  bmad      ${VENDORS.bmad.npm}@${VENDORS.bmad.version}   modulos: ${VENDORS.bmad.modules}   podado: ${VENDORS.bmad.prune.join(', ')}`);
    console.log(`  openspec  ${VENDORS.openspec.npm}@${VENDORS.openspec.version}`);
    console.log(`  engram    ${VENDORS.engram.brewTap}/${VENDORS.engram.brewFormula} (memoria aislada por proyecto)`);
    console.log(`  graphify  ${VENDORS.graphify.pip}@${VENDORS.graphify.version}   solo codigo (${VENDORS.graphify.ignoreFile})`);
    console.log(`\n  Para subir un vendor: edita src/vendors.json, publica, y "un-specweaver doctor" reporta el drift.\n`);
    process.exit(0);

  default:
    console.error(`Comando desconocido: ${cmd}\n${HELP}`);
    process.exit(2);
}
