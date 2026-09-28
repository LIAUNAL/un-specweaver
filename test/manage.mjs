import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { removable, cleanups, reset, migrationPlan, migrate } from '../src/manage.mjs';
import { paths, HOME } from '../src/paths.mjs';
import { gitignoreBlock, DASHBOARD_HOOK } from '../src/steps.mjs';

const ROOT_LAYER = path.join(path.resolve(import.meta.dirname, '..'), 'src', 'layer');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
const touch = (f, c = 'x') => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); };

// Un proyecto montado, con lo que crea cada paso y algo del usuario en medio.
function mounted() {
  const root = tmp();
  execFileSync('git', ['-C', root, 'init', '-q']);
  const P = paths(root);
  touch(path.join(P.home, 'trace.json'), '{}');
  touch(path.join(P.engram, 'engram.db'));
  touch(P.engramBin, '#!/bin/sh\n');
  touch(path.join(P.changes, 'e1s1-x', 'proposal.md'));
  touch(path.join(root, '_bmad', 'config.toml'), 'output_folder = ".un-specweaver/bmad"\n');
  touch(path.join(root, 'graphify-out', 'graph.json'), '{}');
  touch(path.join(root, '.graphifyignore'));
  touch(path.join(root, '.mcp.json'), '{}');
  touch(path.join(root, '.claude', 'commands', 'sw', 'new.md'));
  touch(path.join(root, '.claude', 'commands', 'bmad-prd.md'));
  touch(path.join(root, '.claude', 'skills', 'un-specweaver', 'SKILL.md'));
  touch(path.join(root, '.claude', 'skills', 'bmad-prd', 'SKILL.md'));
  touch(path.join(root, '.claude', 'skills', 'graphify', 'SKILL.md'));
  // Lo del usuario, que no se toca.
  touch(path.join(root, '.claude', 'skills', 'mi-skill', 'SKILL.md'));
  touch(path.join(root, '.claude', 'settings.json'), '{}');
  touch(path.join(root, 'src', 'app.mjs'), 'export const a = 1;\n');
  touch(path.join(root, 'docs', 'architecture-base.md'), 'MI ARQUITECTURA\n');
  fs.writeFileSync(path.join(root, '.gitignore'), `node_modules/\n\n${gitignoreBlock([])}`);
  touch(path.join(root, '.git', 'hooks', 'post-commit'), `#!/bin/sh\ngraphify update .\n${DASHBOARD_HOOK}\n`);
  return root;
}

test('reset quita todo lo que el montaje creo y nada de lo que el usuario escribio', () => {
  const root = mounted();
  const items = removable(root).map((i) => path.relative(root, i.target));
  assert.ok(items.includes(HOME), 'la carpeta del metodo');
  for (const p of ['_bmad', 'graphify-out', '.graphifyignore', '.mcp.json',
                   path.join('.claude', 'commands', 'sw'), path.join('.claude', 'skills', 'un-specweaver'),
                   path.join('.claude', 'skills', 'bmad-prd'), path.join('.claude', 'skills', 'graphify'),
                   path.join('.claude', 'commands', 'bmad-prd.md')]) assert.ok(items.includes(p), p);
  for (const p of ['src', 'docs', path.join('.claude', 'skills', 'mi-skill'), path.join('.claude', 'settings.json')])
    assert.ok(!items.includes(p), `${p} es del usuario: no se toca`);

  const r = reset(root);
  assert.equal(r.removed, items.length);
  assert.ok(!fs.existsSync(path.join(root, HOME)));
  assert.ok(fs.existsSync(path.join(root, 'src', 'app.mjs')), 'el codigo sigue');
  assert.equal(fs.readFileSync(path.join(root, 'docs', 'architecture-base.md'), 'utf8'), 'MI ARQUITECTURA\n');
  assert.ok(fs.existsSync(path.join(root, '.claude', 'skills', 'mi-skill')));

  // El bloque del .gitignore y la linea del hook se limpian, el resto se conserva.
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gi, /^node_modules\/$/m, 'lo que ya tenia el usuario sigue');
  assert.doesNotMatch(gi, /un-specweaver/);
  const hook = fs.readFileSync(path.join(root, '.git', 'hooks', 'post-commit'), 'utf8');
  assert.match(hook, /graphify update \./, 'el hook de graphify sobrevive');
  assert.doesNotMatch(hook, /un-specweaver/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('reset --dry-run no borra nada', () => {
  const root = mounted();
  const r = reset(root, { dryRun: true });
  assert.equal(r.removed, 0);
  assert.ok(r.items.length > 5);
  assert.ok(fs.existsSync(path.join(root, HOME)));
  fs.rmSync(root, { recursive: true, force: true });
});

test('reset nunca borra fuera de la raiz del proyecto', () => {
  const root = mounted();
  for (const it of removable(root)) assert.ok(path.resolve(it.target).startsWith(root + path.sep), it.target);
  fs.rmSync(root, { recursive: true, force: true });
});

// --- migracion 0.5.x -> 0.6 ---------------------------------------------------------------

function legacyProject() {
  const root = tmp();
  execFileSync('git', ['-C', root, 'init', '-q']);
  touch(path.join(root, 'openspec', 'changes', 'e1s1-x', 'proposal.md'), 'spec\n');
  touch(path.join(root, 'openspec', 'specs', 'cap', 'spec.md'), 'base\n');
  touch(path.join(root, '_bmad-output', 'planning-artifacts', 'epics.md'), '# epics\n');
  touch(path.join(root, '_bmad', 'config.toml'), 'output_folder = "_bmad-output"\nplanning_artifacts = "{project-root}/_bmad-output/planning-artifacts"\n');
  touch(path.join(root, HOME, 'trace.json'), JSON.stringify({ source: '_bmad-output/planning-artifacts/epics.md', changes: [] }));
  execFileSync('git', ['-C', root, 'add', '-A']);
  execFileSync('git', ['-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init']);
  return root;
}

test('un proyecto de 0.5.x se sigue leyendo hasta que migre, y migrar conserva el historial', () => {
  const root = legacyProject();
  assert.equal(paths(root).legacy, true, 'el layout viejo se detecta y se usa');

  const plan = migrationPlan(root);
  assert.deepEqual(plan.moves.map((m) => [path.relative(root, m.from), path.relative(root, m.to)]),
    [['openspec', path.join(HOME, 'openspec')], ['_bmad-output', path.join(HOME, 'bmad')]]);
  assert.equal(plan.edits.length, 2, 'config de BMAD y origen del trace');

  migrate(root);
  assert.equal(paths(root).legacy, false);
  assert.ok(fs.existsSync(path.join(root, HOME, 'openspec', 'specs', 'cap', 'spec.md')), 'la linea base viajo');
  assert.ok(!fs.existsSync(path.join(root, 'openspec')));

  // Sin reescribir la config, el proximo documento de BMAD aterriza en la carpeta vieja.
  const cfg = fs.readFileSync(path.join(root, '_bmad', 'config.toml'), 'utf8');
  assert.ok(cfg.includes(`output_folder = "${HOME}/bmad"`), cfg);
  assert.ok(cfg.includes(`planning_artifacts = "{project-root}/${HOME}/bmad/planning-artifacts"`), cfg);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, HOME, 'trace.json'), 'utf8')).source, `${HOME}/bmad/planning-artifacts/epics.md`);

  // git mv: el historial de cada archivo se conserva (R = rename, no D + A).
  const st = execFileSync('git', ['-C', root, 'status', '--short'], { encoding: 'utf8' });
  assert.match(st, /^R/m, 'movido con git mv');
  assert.doesNotMatch(st, /^D /m, 'nada se borro y volvio a crear');

  assert.equal(migrationPlan(root).needed, false, 'migrar dos veces no hace nada');
  fs.rmSync(root, { recursive: true, force: true });
});

test('migrar un proyecto ya consolidado no propone nada', () => {
  const root = tmp();
  touch(path.join(root, HOME, 'openspec', 'changes', '.keep'));
  assert.equal(migrationPlan(root).needed, false);
  fs.rmSync(root, { recursive: true, force: true });
});

// --- memoria: traerla de la base global y compartirla -------------------------------------
import { filterExport, likelyProjectName, memoryStatus, importFromGlobal } from '../src/memory.mjs';

test('el filtro por proyecto sigue la sesion: la observacion no dice a que proyecto pertenece', () => {
  // Forma real de `engram export` (verificada contra 1.20): las observaciones solo traen
  // session_id, y el proyecto vive en la sesion.
  const dump = {
    version: '0.1.0', exported_at: 'x',
    sessions: [{ id: 's1', project: 'mio' }, { id: 's2', project: 'otro' }],
    observations: [{ id: 1, session_id: 's1', title: 'a' }, { id: 2, session_id: 's2', title: 'b' }],
    prompts: [{ id: 1, session_id: 's1', project: 'mio' }, { id: 2, session_id: 's2', project: 'otro' },
              { id: 3, session_id: 's1', project: null }],
  };
  const f = filterExport(dump, 'mio');
  assert.deepEqual(f.sessions.map((s) => s.id), ['s1']);
  assert.deepEqual(f.observations.map((o) => o.id), [1], 'la del otro proyecto no viaja');
  assert.deepEqual(f.prompts.map((p) => p.id), [1, 3], 'por proyecto o por sesion');
  assert.equal(f.version, '0.1.0');
});

test('el nombre del proyecto se deriva como lo hace engram: remote de git, si no la carpeta', () => {
  const root = tmp();
  assert.equal(likelyProjectName(root), path.basename(root).toLowerCase());
  execFileSync('git', ['-C', root, 'init', '-q']);
  execFileSync('git', ['-C', root, 'remote', 'add', 'origin', 'git@github.com:Acme/Mi_Repo.git']);
  assert.equal(likelyProjectName(root), 'mi_repo');
  fs.rmSync(root, { recursive: true, force: true });
});

test('sin memoria aislada, importar no hace nada a medias', () => {
  const root = tmp();
  const st = memoryStatus(root);
  assert.equal(st.isolated, false);
  assert.equal(st.observations, 0);
  const r = importFromGlobal(root, { project: 'no-existe' });
  assert.equal(r.ok, false);
  assert.ok(['not-isolated', 'no-engram'].includes(r.reason), r.reason);
  fs.rmSync(root, { recursive: true, force: true });
});

// --- escanear un proyecto que ya existe ----------------------------------------------------
import { scan, scanCode, scanMethod } from '../src/scan.mjs';

test('el escaneo describe el proyecto por evidencia, no por impresiones', () => {
  const root = tmp();
  execFileSync('git', ['-C', root, 'init', '-q']);
  touch(path.join(root, 'src', 'app.ts'), 'export const a = 1;\n');
  touch(path.join(root, 'src', 'lib.ts'), 'export const b = 2;\n');
  touch(path.join(root, 'test', 'app.test.ts'), 'test();\n');
  touch(path.join(root, 'api', 'main.py'), 'x = 1\n');
  touch(path.join(root, 'package.json'), '{"name":"demo","scripts":{"test":"x"},"dependencies":{"a":"1"}}');
  touch(path.join(root, 'README.md'), '# demo\n');
  touch(path.join(root, 'docs', 'adr', '001-elegimos-x.md'), '# ADR\n');
  touch(path.join(root, '.github', 'workflows', 'ci.yml'), 'on: push\n');
  // Ruido que no debe contarse como codigo del proyecto.
  touch(path.join(root, 'node_modules', 'dep', 'index.js'), 'x');
  touch(path.join(root, 'dist', 'bundle.js'), 'x');

  const s = scan(root);
  assert.equal(s.code.files, 4, 'node_modules y dist no cuentan');
  assert.deepEqual(s.code.languages.map((l) => l.name).sort(), ['Python', 'TypeScript']);
  assert.equal(s.code.tests, 1);
  assert.deepEqual(s.code.topDirs, ['api', 'docs', 'src', 'test']);
  assert.ok(s.docs.some((d) => d.kind === 'adr'), 'los ADR se distinguen de la documentacion suelta');
  assert.ok(s.docs.some((d) => d.kind === 'readme'));
  assert.deepEqual(s.ci, ['.github/workflows/ci.yml']);
  assert.equal(s.stack[0].manifest, 'package.json');
  fs.rmSync(root, { recursive: true, force: true });
});

test('el plan no repite lo que ya esta hecho y el primer paso siempre es montar la herramienta', () => {
  const root = tmp();
  touch(path.join(root, 'src', 'a.js'), 'x');
  let s = scan(root);
  assert.equal(s.plan[0].id, 'install');
  assert.equal(s.plan[0].done, false);
  assert.ok(s.plan.every((p) => p.cmd), 'cada paso dice con que comando se hace');

  // Proyecto ya montado y con linea base: esos pasos salen marcados.
  touch(path.join(root, HOME, 'config.json'), '{}');
  touch(path.join(root, HOME, 'openspec', 'specs', 'cap', 'spec.md'), '# spec');
  s = scan(root);
  assert.equal(s.plan.find((p) => p.id === 'install').done, true);
  assert.equal(s.plan.find((p) => p.id === 'baseline').done, true);
  assert.deepEqual(scanMethod(root).capabilities, ['cap']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('el layout viejo aparece en el plan como paso de migracion', () => {
  const root = tmp();
  touch(path.join(root, 'openspec', 'changes', '.keep'));
  const ids = scan(root).plan.map((p) => p.id);
  assert.ok(ids.includes('migrate'), 'un proyecto de 0.5.x tiene que ver el paso');
  fs.rmSync(root, { recursive: true, force: true });
});

test('las preguntas dependen del proyecto: en uno grande la primera es acotar el alcance', () => {
  const root = tmp();
  for (let i = 0; i < 350; i++) touch(path.join(root, 'src', `m${i}.ts`), 'export const x = 1;\n');
  const s = scan(root);
  const scope = s.questions.find((q) => q.id === 'scope');
  assert.equal(s.questions[0].id, 'scope', 'el alcance se decide primero');
  assert.match(scope.why, /semanas/i, 'tiene que decir por que especificar todo sale caro');
  assert.ok(scope.options[0].includes('recomendado'));
  assert.ok(s.questions.some((q) => q.id === 'tests'), 'sin tests, se pregunta');

  // La plantilla de arquitectura sin llenar no cuenta como llena.
  touch(path.join(root, 'docs', 'architecture-base.md'), '# Base\n\n[completar]\n');
  assert.equal(scanMethod(root).architectureBase, 'plantilla');
  fs.rmSync(root, { recursive: true, force: true });
});

test('scan no escribe nada: es una vista', () => {
  const root = tmp();
  touch(path.join(root, 'src', 'a.js'), 'x');
  const before = fs.readdirSync(root).sort();
  scan(root);
  assert.deepEqual(fs.readdirSync(root).sort(), before);
  fs.rmSync(root, { recursive: true, force: true });
});

test('/sw:adopt escanea y acuerda el alcance antes de escribir, en los dos idiomas', () => {
  for (const lang of ['es', 'en']) {
    const src = fs.readFileSync(path.join(ROOT_LAYER, 'commands', lang, 'adopt.md'), 'utf8');
    assert.match(src, /un-specweaver scan/, `${lang}: tiene que partir del escaneo`);
    const iScan = src.indexOf('un-specweaver scan');
    const iAsk = src.search(lang === 'es' ? /preguntas que imprimio el escaneo/ : /questions the scan printed/);
    const iWrite = src.search(lang === 'es' ? /bmad-document-project/ : /bmad-document-project/);
    assert.ok(iScan < iAsk && iAsk < iWrite, `${lang}: escanear -> preguntar -> escribir`);
    assert.match(src, lang === 'es' ? /incremental/ : /incremental/, `${lang}: la adopcion es incremental`);
  }
});
