import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseEpics, slug } from '../bridge/parse-epics.mjs';
import { emitChange, changeId, capabilityPath, normalizePerson, detectLang, langScores } from '../bridge/emit-openspec.mjs';
import { planSprint } from '../bridge/plan-sprint.mjs';
import { findEpics, findPlanningArtifacts } from '../bridge/cli.mjs';
import { paths } from '../src/paths.mjs';
import { parseMemlog, parseChangeProposal, extractRefs, collectDecisions, requirementHistory, instabilityRanking } from '../bridge/decisions.mjs';
import { mergeTrace, mergeTasks, readMainSpec, reconcileScenarioNames, archivedRevisions, revisedId, readLedger } from '../bridge/history.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURE = path.join(ROOT, 'fixtures', 'epics.sample.md');
const doc = parseEpics(fs.readFileSync(FIXTURE, 'utf8'));

const FIXTURE_EN = path.join(ROOT, 'fixtures', 'epics.sample.en.md');
const docEn = parseEpics(fs.readFileSync(FIXTURE_EN, 'utf8'));

test('el fixture parsea sin avisos', () => {
  assert.deepEqual(doc.warnings, []);
});

test('extrae epics, stories y el inventario de requisitos', () => {
  assert.equal(doc.projectName, 'Portal de Proveedores');
  assert.equal(doc.epics.length, 2);
  assert.deepEqual(doc.epics.map((e) => e.stories.length), [2, 2]);
  assert.deepEqual(doc.requirements.functional.map((r) => r.id), ['FR001', 'FR002', 'FR003', 'FR004', 'FR005']);
  // Un requisito tachado con ELIMINADO sigue en el inventario (el id no se reutiliza) pero
  // marcado: no cuenta como vivo ni aparece como "sin cobertura".
  const fr5 = doc.requirements.functional.find((r) => r.id === 'FR005');
  assert.equal(fr5.removed, true); assert.equal(fr5.removedAt, '2026-09-03');
  assert.equal(fr5.text, 'El proveedor exporta sus órdenes a Excel');
  assert.ok(!doc.warnings.some((w) => /FR005/.test(w)), 'eliminado no es huerfano');
  assert.deepEqual(doc.requirements.nonFunctional.map((r) => r.id), ['NFR001']);
  assert.deepEqual(doc.requirements.ux.map((r) => r.id), ['UX-DR01']);
});

test('parsea la narrativa As a / I want / So that', () => {
  const s = doc.epics[0].stories[0];
  assert.equal(s.role, 'proveedor');
  assert.match(s.want, /^registrarme en el portal/);
  assert.match(s.benefit, /sin llamar al comprador$/);
});

test('agrupa los criterios Given/When/Then y sus multiples And', () => {
  const s = doc.epics[0].stories[0];
  assert.equal(s.acceptanceCriteria.length, 2);
  assert.equal(s.acceptanceCriteria[0].and.length, 2);
  assert.match(s.acceptanceCriteria[0].given, /^que estoy en la página de registro/);
  assert.match(s.acceptanceCriteria[1].then, /NIT ya registrado/);
});

test('AD-n tambien cuenta como referencia: una story de andamiaje puede cubrir solo una decision', () => {
  const d = parseEpics('# P\n\n## Epic 1: X\n\n### Story 1.1: Andamiaje\n\n**Cubre:** Additional Requirements · AD-6\n\nAs a dev,\nI want base,\nSo that build.\n\n**Acceptance Criteria:**\n\n**Given** a\n**When** b\n**Then** c\n');
  assert.deepEqual(d.epics[0].stories[0].requirements, ['AD-6']);
});

test('recoge los IDs de requisito citados en la story', () => {
  assert.deepEqual(doc.epics[0].stories[0].requirements, ['FR001']);
  assert.deepEqual(doc.epics[0].stories[1].requirements.sort(), ['FR002', 'NFR001']);
});

test('slug normaliza acentos (critico para rutas de capability)', () => {
  assert.equal(slug('Autenticación y Sesión de Proveedores'), 'autenticacion-y-sesion-de-proveedores');
  assert.equal(slug('Órdenes de Compra'), 'ordenes-de-compra');
});

test('normalizePerson pasa la narrativa de primera a tercera persona', () => {
  assert.equal(detectLang('registrarme usando mi NIT'), 'es');
  assert.equal(normalizePerson('registrarme usando mi NIT', 'es'), 'registrarse usando su NIT');
  assert.equal(normalizePerson('cuando me publiquen una orden', 'es'), 'cuando le publiquen una orden');
  assert.equal(normalizePerson('I want my own token', 'en'), 'they want their own token');
});

test('un epic es una capability y una story es un change', () => {
  assert.equal(capabilityPath(doc.epics[1]), 'ordenes-de-compra');
  assert.equal(changeId(doc.epics[1].stories[0]), 'e2s1-publicar-orden-de-compra');
});

test('solo la primera story del epic declara Purpose y New Capability', () => {
  const existing = new Set();
  const [s1, s2] = doc.epics[0].stories;
  const c1 = emitChange(doc.epics[0], s1, existing, 'es');
  existing.add(c1.capability);
  const c2 = emitChange(doc.epics[0], s2, existing, 'es');

  const spec1 = c1.files[`specs/${c1.capability}/spec.md`];
  const spec2 = c2.files[`specs/${c2.capability}/spec.md`];
  assert.match(spec1, /^## Purpose/);
  assert.doesNotMatch(spec2, /## Purpose/);
  assert.match(c1.files['proposal.md'], /### New Capabilities\n\n- `autenticacion/);
  assert.match(c2.files['proposal.md'], /### Modified Capabilities\n\n- `autenticacion/);
  // Ambas ADDED: cada story agrega un requisito distinto a la misma capability.
  assert.match(spec1, /## ADDED Requirements/);
  assert.match(spec2, /## ADDED Requirements/);
});

test('los escenarios usan exactamente 4 almohadillas (OpenSpec falla en silencio si no)', () => {
  const c = emitChange(doc.epics[0], doc.epics[0].stories[0], new Set(), 'es');
  const spec = c.files[`specs/${c.capability}/spec.md`];
  assert.equal([...spec.matchAll(/^#### Scenario: /gm)].length, 2);
  assert.doesNotMatch(spec, /^### Scenario:/m);
});

test('el requisito lleva el keyword SHALL que exige validate --strict', () => {
  for (const epic of doc.epics)
    for (const story of epic.stories) {
      const c = emitChange(epic, story, new Set(), 'es');
      const req = c.files[`specs/${c.capability}/spec.md`].match(/^### Requirement:.*\n(.*)$/m)[1];
      assert.match(req, /\b(SHALL|MUST)\b/, `story ${story.id}: "${req}"`);
    }
});

test('--normative debe cambia el keyword (y renuncia a --strict)', () => {
  const c = emitChange(doc.epics[0], doc.epics[0].stories[0], new Set(), 'es', 'debe');
  assert.match(c.files[`specs/${c.capability}/spec.md`], /El sistema DEBE permitir/);
});

test('el plan seria: secuencia dentro del epic, paralelo entre epics, deps declaradas', () => {
  const plan = planSprint(doc);
  assert.deepEqual(plan.cycles, []);
  const wave = (id) => plan.waves.findIndex((w) => w.some((n) => n.story === id));
  assert.ok(wave('1.1') < wave('1.2'), '1.2 va despues de 1.1 (misma capability)');
  assert.ok(wave('1.2') < wave('2.1'), '2.1 declara depender de 1.2');
  assert.ok(wave('2.1') < wave('2.2'), '2.2 va despues de 2.1');
  assert.deepEqual(plan.crossEpic, ['2.1 -> 1.2']);
});

test('la generacion es deterministica byte a byte', () => {
  const run = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-'));
    execFileSync('node', [path.join(ROOT, 'bridge', 'cli.mjs'), FIXTURE, '--out', dir], { stdio: 'pipe' });
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      // El ledger es historia y lleva fecha a proposito: es el UNICO archivo que se excluye.
      if (e.name === 'changelog.jsonl') continue;
      e.isDirectory() ? walk(p) : files.push([path.relative(dir, p), fs.readFileSync(p, 'utf8')]);
    } };
    walk(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    return files.sort().map(([p, c]) => `${p}\n${c}`).join('\n');
  };
  assert.equal(run(), run());
});

test('no sobrescribe un change existente sin --force', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-'));
  const cli = [path.join(ROOT, 'bridge', 'cli.mjs'), FIXTURE, '--out', dir];
  execFileSync('node', cli, { stdio: 'pipe' });
  const target = path.join(paths(dir).changes, 'e1s1-registro-de-proveedor-con-nit', 'tasks.md');
  fs.writeFileSync(target, 'EDITADO A MANO\n');
  const out = execFileSync('node', cli, { stdio: 'pipe' }).toString();
  assert.match(out, /omitido\s+e1s1/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'EDITADO A MANO\n');
  execFileSync('node', [...cli, '--force'], { stdio: 'pipe' });
  assert.notEqual(fs.readFileSync(target, 'utf8'), 'EDITADO A MANO\n');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('--strict aborta cuando la story de entrada esta incompleta', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-'));
  const bad = path.join(dir, 'epics.md');
  fs.writeFileSync(bad, '# X - Epic Breakdown\n\n## Epic 1: Uno\n\nMeta.\n\n### Story 1.1: Sin nada\n\nTexto suelto.\n');
  assert.throws(() => execFileSync('node', [path.join(ROOT, 'bridge', 'cli.mjs'), bad, '--out', dir, '--strict'], { stdio: 'pipe' }));
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- ingles -----------------------------------------------------------------

test('el fixture ingles parsea sin avisos', () => {
  assert.deepEqual(docEn.warnings, []);
  assert.equal(docEn.projectName, 'Supplier Portal');
  assert.equal(docEn.epics.length, 2);
});

test('la deteccion de idioma es por puntaje, no por primera coincidencia', () => {
  assert.equal(detectLang('registrarme en el portal usando mi NIT'), 'es');
  assert.equal(detectLang('register in the portal using my tax ID'), 'en');
  // una palabra suelta que "parece" espanola no puede voltear un texto ingles
  assert.equal(detectLang('configure the CI/CD pipeline de facto'), 'en');
  assert.ok(langScores('the system with their token').en > langScores('the system with their token').es);
});

test('autodetecta cada fixture correctamente', () => {
  const wants = (d) => d.epics.flatMap((e) => e.stories).map((s) => s.want).join(' ');
  assert.equal(detectLang(wants(doc)), 'es');
  assert.equal(detectLang(wants(docEn)), 'en');
});

test('no duplica el infinitivo ingles: "allow X to to publish"', () => {
  for (const epic of docEn.epics)
    for (const story of epic.stories) {
      const c = emitChange(epic, story, new Set(), 'en');
      const req = c.files[`specs/${c.capability}/spec.md`].match(/^### Requirement:.*\n(.*)$/m)[1];
      assert.doesNotMatch(req, /\bto\s+to\b/, `story ${story.id}: "${req}"`);
      assert.match(req, /\b(SHALL|MUST)\b/);
    }
});

test('normalizePerson en ingles pasa a tercera persona', () => {
  assert.equal(normalizePerson('to register using my tax ID', 'en'), 'to register using their tax ID');
  assert.equal(normalizePerson('notify me when an order arrives', 'en'), 'notify them when an order arrives');
});

test('el marco normativo ingles nunca usa DEBE aunque se pida --normative debe', () => {
  const c = emitChange(docEn.epics[0], docEn.epics[0].stories[0], new Set(), 'en', 'debe');
  assert.match(c.files[`specs/${c.capability}/spec.md`], /The system SHALL/);
});

test('el fixture ingles tambien produce olas correctas', () => {
  const plan = planSprint(docEn);
  assert.deepEqual(plan.cycles, []);
  assert.deepEqual(plan.crossEpic, ['2.1 -> 1.2']);
});

// --- descubrimiento de epics.md -----------------------------------------------

test('el puente descubre epics.md donde BMAD lo escribe de verdad', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'find-'));
  assert.deepEqual(findEpics(root), [], 'sin epics.md no inventa rutas');

  // Ruta real de una instalacion BMAD: planning_artifacts, no la raiz del output.
  const pa = path.join(root, '_bmad-output', 'planning-artifacts');
  fs.mkdirSync(pa, { recursive: true });
  fs.writeFileSync(path.join(pa, 'epics.md'), '# x');
  assert.deepEqual(findEpics(root), [path.join(pa, 'epics.md')]);
  fs.rmSync(root, { recursive: true, force: true });
});

test('respeta planning_artifacts configurado en _bmad/config.toml', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'find-'));
  fs.mkdirSync(path.join(root, '_bmad'), { recursive: true });
  fs.writeFileSync(path.join(root, '_bmad', 'config.toml'),
    'planning_artifacts = "{project-root}/otra-carpeta"\n');
  const dir = path.join(root, 'otra-carpeta');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'epics.md'), '# x');
  assert.deepEqual(findEpics(root), [path.join(dir, 'epics.md')], 'la config manda sobre el default');
  fs.rmSync(root, { recursive: true, force: true });
});

test('sin argumento el CLI descubre y corre; sin epics.md falla con mensaje util', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'find-'));
  const cli = path.join(ROOT, 'bridge', 'cli.mjs');
  try {
    execFileSync('node', [cli, '--out', root], { stdio: 'pipe' });
    assert.fail('deberia fallar sin epics.md');
  } catch (e) {
    assert.match(e.stderr.toString(), /No se encontro epics\.md/);
  }
  const pa = path.join(root, '_bmad-output', 'planning-artifacts');
  fs.mkdirSync(pa, { recursive: true });
  fs.copyFileSync(FIXTURE, path.join(pa, 'epics.md'));
  const out = execFileSync('node', [cli, '--out', root], { stdio: 'pipe' }).toString();
  assert.match(out, /epics\.md encontrado/);
  assert.ok(fs.existsSync(path.join(paths(root).openspec, 'changes')), 'no genero changes');
  fs.rmSync(root, { recursive: true, force: true });
});

test('acepta FR-23 y FR001: BMAD 6.11 usa guion y el parser exigia sin el', () => {
  // Bug real: contra un PRD de BMAD 6.11 (formato "#### FR-23:") el parser encontraba
  // cero requisitos y trace.json quedaba sin ancla, sin avisar de nada.
  const md = [
    '# X - Epic Breakdown', '', '## Requirements Inventory', '',
    '### Functional Requirements', '',
    '- **FR-23**: Con guion, formato de BMAD 6.11.',
    '- **FR001**: Sin guion, formato de la plantilla.', '',
    '### NonFunctional Requirements', '', '- **NFR-4**: Responde rapido.', '',
    '## Epic 1: Identidad', '',
    'Meta del epic con texto suficiente para el Purpose que exige OpenSpec en un delta nuevo.', '',
    '### Story 1.1: Bloque de identidad', '',
    'As a visitante,', 'I want ubicar quien es sin hacer scroll,',
    'So that decido en segundos si sigo leyendo.', '',
    '**Acceptance Criteria:**', '',
    '**Given** que entro a la pagina', '**When** miro la primera pantalla',
    '**Then** veo nombre y especialidad', '', 'Cubre FR-23, FR001 y NFR-4.',
  ].join('\n');

  const d = parseEpics(md);
  assert.deepEqual(d.warnings, []);
  assert.deepEqual(d.requirements.functional.map((r) => r.id), ['FR-23', 'FR001'], 'ambos formatos');
  assert.equal(d.requirements.functional[0].text, 'Con guion, formato de BMAD 6.11.');
  assert.deepEqual(d.requirements.nonFunctional.map((r) => r.id), ['NFR-4']);
  // Se conserva la forma literal del documento: grepear el PRD tiene que funcionar.
  assert.deepEqual(d.epics[0].stories[0].requirements, ['FR-23', 'FR001', 'NFR-4']);
});

test('FR-23 y FR23 son el mismo requisito, no dos', () => {
  const md = [
    '# X - Epic Breakdown', '', '## Epic 1: E', '',
    'Meta con texto suficiente para superar el minimo de caracteres del Purpose de OpenSpec.', '',
    '### Story 1.1: S', '', 'As a u,', 'I want x,', 'So that y.', '',
    '**Acceptance Criteria:**', '', '**Given** g', '**When** w', '**Then** t', '',
    'Cubre FR-23 y tambien FR23 escrito distinto.',
  ].join('\n');
  assert.deepEqual(parseEpics(md).epics[0].stories[0].requirements, ['FR-23'], 'debe deduplicar por clave normalizada');
});

test('lee la cobertura de las tablas, no solo de menciones dentro de la story', () => {
  // Bug real de una corrida completa: 29 FR en el inventario, 26 stories, y trace.json
  // con CERO mapeos. BMAD documenta la cobertura en tablas y las stories no citan FRs.
  const md = [
    '# X - Epic Breakdown', '', '## Requirements Inventory', '',
    '### Functional Requirements', '', '- **FR-1**: Uno.', '- **FR-2**: Dos.', '',
    '### FR Coverage Map', '', '| FR | Epic | Que entrega |', '|---|---|---|',
    '| FR-1 | Epic 1 | Algo |', '| FR-2 | Epic 1 | Otra cosa |', '',
    '## Epic 1: E', '',
    'Meta con texto suficiente para superar el minimo de caracteres del Purpose de OpenSpec.', '',
    '### Story 1.1: Primera', '', 'As a u,', 'I want x,', 'So that y.', '',
    '**Acceptance Criteria:**', '', '**Given** g', '**When** w', '**Then** t', '',
    '### Story 1.2: Segunda', '', 'As a u,', 'I want z,', 'So that w.', '',
    '**Acceptance Criteria:**', '', '**Given** g', '**When** w', '**Then** t', '',
    '## UX-DR Coverage Map', '', '| UX-DR | Que fija | Stories |', '|---|---|---|',
    '| UX-DR2 | Contraste | 1.2 |',
  ].join('\n');

  const d = parseEpics(md);
  const [s1, s2] = d.epics[0].stories;
  assert.deepEqual(s1.requirements, ['FR-1', 'FR-2'], 'la tabla FR->Epic debe atribuir al epic entero');
  assert.deepEqual(s1.requirementsFrom.story, [], 'ningun FR es atribuible a la story 1.1');
  assert.deepEqual(s1.requirementsFrom.epic, ['FR-1', 'FR-2']);
  // La tabla UX-DR si mapea a story: esa precision no se pierde.
  assert.ok(s2.requirementsFrom.story.includes('UX-DR2'), 'UX-DR2 se atribuye a la story 1.2');
});

test('no confunde numeros de version con referencias a stories', () => {
  const md = [
    '# X - Epic Breakdown', '', '### FR Coverage Map', '', '| FR | Notas |', '|---|---|',
    '| FR-1 | Requiere Astro 7 y Node 22.12 |', '',
    '## Epic 1: E', '',
    'Meta con texto suficiente para superar el minimo de caracteres del Purpose de OpenSpec.', '',
    '### Story 1.1: S', '', 'As a u,', 'I want x,', 'So that y.', '',
    '**Acceptance Criteria:**', '', '**Given** g', '**When** w', '**Then** t',
  ].join('\n');
  const d = parseEpics(md);
  // "22.12" no es una story existente: no puede inventarse una atribucion.
  assert.deepEqual(d.epics[0].stories[0].requirements, []);
  assert.ok(d.warnings.some((w) => /Coverage Map/.test(w)), 'debe avisar que FR-1 no referencia nada real');
});

test('cada afirmacion del escenario es una tarea, no solo el THEN', () => {
  // Bug real: un escenario con THEN + cuatro AND producia UNA casilla, y el tasks.md
  // salia mas delgado que el spec que debia cumplir.
  const md = [
    '# X - Epic Breakdown', '', '## Epic 1: E', '',
    'Meta con texto suficiente para superar el minimo de caracteres del Purpose de OpenSpec.', '',
    '### Story 1.1: S', '', 'As a u,', 'I want x,', 'So that y.', '',
    '**Acceptance Criteria:**', '',
    '**Given** g', '**When** w', '**Then** primera exigencia',
    '**And** segunda exigencia', '**And** tercera exigencia', '',
    '**Given** g2', '**When** w2', '**Then** cuarta exigencia',
  ].join('\n');
  const doc = parseEpics(md);
  const c = emitChange(doc.epics[0], doc.epics[0].stories[0], new Set(), 'es');
  const t = c.files['tasks.md'];

  for (const n of ['primera', 'segunda', 'tercera', 'cuarta'])
    assert.ok(t.includes(`${n} exigencia`), `falta la tarea de la ${n} exigencia`);
  assert.equal((t.match(/- \[ \] 1\./g) || []).length, 4, 'una tarea por afirmacion');
  assert.equal((t.match(/- \[ \] 2\./g) || []).length, 4, 'una verificacion por afirmacion');
  // La verificacion referencia el criterio del que salio, no un contador plano.
  assert.match(t, /2\.4 Test del criterio 2: cuarta exigencia/);
});

// --- historia: lo que el puente no puede destruir ------------------------------------------

const CLI_BRIDGE = path.join(ROOT, 'bridge', 'cli.mjs');
const freshProject = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-'));
  fs.mkdirSync(paths(dir).changes, { recursive: true });
  fs.copyFileSync(FIXTURE, path.join(dir, 'epics.md'));
  return dir;
};
const bridge = (dir, ...args) => execFileSync('node', [CLI_BRIDGE, 'epics.md', ...args], { cwd: dir, stdio: 'pipe' }).toString();
const readTrace = (dir) => JSON.parse(fs.readFileSync(path.join(dir, '.un-specweaver', 'trace.json'), 'utf8'));

test('--only no borra la trazabilidad de las stories que no toco', () => {
  // Reproducido: 4 changes -> `--only 1.2 --force` -> trace.json quedaba con UNO.
  const dir = freshProject();
  bridge(dir);
  assert.deepEqual(readTrace(dir).changes.map((c) => c.bmad.story), ['1.1', '1.2', '2.1', '2.2']);
  bridge(dir, '--only', '1.2', '--force');
  assert.deepEqual(readTrace(dir).changes.map((c) => c.bmad.story), ['1.1', '1.2', '2.1', '2.2'], 'las otras tres siguen');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('mergeTrace conserva por story y ordena; una revision reemplaza a su version anterior', () => {
  const prev = { changes: [
    { changeId: 'e1s1-a', bmad: { story: '1.1' } }, { changeId: 'e2s1-c', bmad: { story: '2.1' } },
  ] };
  const next = { source: 'x', changes: [{ changeId: 'e1s1-a-r2', revision: 2, bmad: { story: '1.1' } }] };
  const out = mergeTrace(prev, next);
  assert.deepEqual(out.changes.map((c) => c.changeId), ['e1s1-a-r2', 'e2s1-c']);
  assert.equal(out.source, 'x');
  assert.deepEqual(mergeTrace(null, next).changes.length, 1, 'sin trace previo no explota');
});

test('--force conserva las casillas marcadas por texto de tarea y reporta las perdidas', () => {
  const dir = freshProject();
  bridge(dir);
  const tasks = path.join(paths(dir).openspec, 'changes', 'e1s2-inicio-de-sesion-con-mfa', 'tasks.md');
  fs.writeFileSync(tasks, fs.readFileSync(tasks, 'utf8').replace('- [ ] 1.1', '- [x] 1.1').replace('- [ ] 2.1', '- [x] 2.1'));
  const out = bridge(dir, '--only', '1.2', '--force');
  assert.match(out, /2 tarea\(s\) hecha\(s\) conservada\(s\)/);
  assert.equal((fs.readFileSync(tasks, 'utf8').match(/\[x\]/g) || []).length, 2);
  fs.rmSync(dir, { recursive: true, force: true });

  const m = mergeTasks('- [x] 1.1 hacer A\n- [x] 1.2 hacer B\n- [ ] 1.3 hacer C\n', '- [ ] 1.1 hacer Z\n- [ ] 1.2 hacer A\n- [ ] 1.3 hacer C\n');
  assert.equal(m.kept, 1, 'A se conserva aunque cambio de numero');
  assert.deepEqual(m.lost, ['hacer B'], 'B ya no existe: se reporta');
  assert.match(m.md, /^- \[x\] 1\.2 hacer A$/m);
  assert.match(m.md, /^- \[ \] 1\.1 hacer Z$/m);
});

test('una story ya archivada se regenera como MODIFIED con revision y nombres de escenario reutilizados', () => {
  // VERIFICADO contra OpenSpec 1.10: ADDED sobre un requisito existente se rechaza en archive
  // ("already exists"); MODIFIED exige todos los escenarios actuales por NOMBRE exacto.
  const dir = freshProject();
  bridge(dir);
  // Simula el archive de 1.1: el requisito pasa al spec principal y el change al archive.
  const cap = path.join(paths(dir).openspec, 'specs', 'autenticacion-y-sesion-de-proveedores');
  fs.mkdirSync(cap, { recursive: true });
  fs.writeFileSync(path.join(cap, 'spec.md'), [
    '# autenticacion', '', '## Purpose', 'x', '', '## Requirements', '',
    '### Requirement: Registro de proveedor con NIT', 'El sistema SHALL ...', '',
    '#### Scenario: Ingreso un NIT válido y un correo con dominio corporativo', '- **WHEN** viejo', '- **THEN** viejo', '',
    '#### Scenario: Envío el formulario', '- **WHEN** viejo', '- **THEN** viejo', '',
  ].join('\n'));
  fs.mkdirSync(path.join(paths(dir).openspec, 'changes', 'archive', '2026-09-01-e1s1-registro-de-proveedor-con-nit'), { recursive: true });
  fs.rmSync(path.join(paths(dir).openspec, 'changes', 'e1s1-registro-de-proveedor-con-nit'), { recursive: true });
  assert.equal(archivedRevisions(dir, 'e1s1-registro-de-proveedor-con-nit'), 1);

  // La story cambia el WHEN: el nombre derivado cambiaria, pero el archivado manda.
  const epics = path.join(dir, 'epics.md');
  fs.writeFileSync(epics, fs.readFileSync(epics, 'utf8').replace('un correo con dominio corporativo', 'un correo corporativo verificado por DNS'));
  const out = bridge(dir, '--only', '1.1', '--force');
  assert.match(out, /e1s1-registro-de-proveedor-con-nit-r2 .*\[MODIFIED, revision 2\]/);
  const delta = fs.readFileSync(path.join(paths(dir).openspec, 'changes', 'e1s1-registro-de-proveedor-con-nit-r2', 'specs', 'autenticacion-y-sesion-de-proveedores', 'spec.md'), 'utf8');
  assert.match(delta, /^## MODIFIED Requirements$/m);
  assert.doesNotMatch(delta, /## Purpose/, 'la capability ya existe');
  assert.match(delta, /#### Scenario: Ingreso un NIT válido y un correo con dominio corporativo\n- \*\*GIVEN\*\*[^\n]*\n- \*\*WHEN\*\* ingreso un NIT válido y un correo corporativo verificado por DNS/, 'nombre archivado, contenido nuevo');
  const t = readTrace(dir).changes.find((c) => c.bmad.story === '1.1');
  assert.equal(t.revision, 2); assert.equal(t.delta, 'MODIFIED'); assert.equal(t.changeId, 'e1s1-registro-de-proveedor-con-nit-r2');
  const proposal = fs.readFileSync(path.join(paths(dir).openspec, 'changes', 'e1s1-registro-de-proveedor-con-nit-r2', 'proposal.md'), 'utf8');
  assert.match(proposal, /Revision 2 de la Story 1\.1/);
  assert.match(proposal, /modifica el requisito/);

  // Si la story PIERDE un escenario archivado, OpenSpec no dejaria archivar: se falla antes, con instrucciones.
  const src = fs.readFileSync(epics, 'utf8');
  const i = src.indexOf('### Story 1.1'), j = src.indexOf('### Story 1.2');
  const block = src.slice(i, j); const k = block.lastIndexOf('**Given**');
  fs.writeFileSync(epics, src.slice(0, i) + block.slice(0, k).trimEnd() + '\n\n' + src.slice(j));
  let err = null;
  try { bridge(dir, '--only', '1.1', '--force'); } catch (e) { err = e; }
  assert.ok(err, 'debe fallar');
  assert.match(err.stderr.toString(), /perdio 1 escenario\(s\): "Envío el formulario"/);
  assert.match(err.stderr.toString(), /REMOVED Requirements/, 'dice como salir');
  assert.ok(!fs.existsSync(path.join(paths(dir).openspec, 'changes', 'e1s1-registro-de-proveedor-con-nit-r3')), 'no escribe un change inarchivable');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('reconcileScenarioNames: exacto primero, posicion despues, lo que sobra es nuevo o perdido', () => {
  let r = reconcileScenarioNames(['A', 'B nuevo', 'C'], ['C', 'B', 'A']);
  assert.deepEqual(r.names, ['A', 'B', 'C'], 'A y C exactos; el segundo toma el nombre libre por posicion');
  assert.deepEqual(r.dropped, []);
  r = reconcileScenarioNames(['X', 'Y', 'Z'], ['A']);
  assert.deepEqual(r.names, ['A', 'Y', 'Z'], 'el primero hereda el nombre; Y y Z son escenarios nuevos');
  r = reconcileScenarioNames(['A'], ['A', 'B']);
  assert.deepEqual(r.dropped, ['B']);
  assert.equal(revisedId('e1s1-x', 1), 'e1s1-x'); assert.equal(revisedId('e1s1-x', 3), 'e1s1-x-r3');
});

test('readMainSpec y archivedRevisions leen lo que hay, sin explotar cuando no hay nada', () => {
  const dir = freshProject();
  assert.equal(readMainSpec(dir, 'nada').size, 0);
  assert.equal(archivedRevisions(dir, 'e1s1-x'), 0);
  fs.mkdirSync(path.join(paths(dir).openspec, 'changes', 'archive', '2026-01-01-e1s1-x-r2'), { recursive: true });
  fs.mkdirSync(path.join(paths(dir).openspec, 'changes', 'archive', '2026-01-02-e1s1-xy'), { recursive: true });
  assert.equal(archivedRevisions(dir, 'e1s1-x'), 2, 'e1s1-xy no cuenta: el id se casa entero');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('cada corrida del puente deja una linea en el ledger; el dry-run no', () => {
  const dir = freshProject();
  bridge(dir, '--dry-run');
  assert.deepEqual(readLedger(dir), []);
  bridge(dir);
  bridge(dir, '--only', '2.1');           // ya existe: omitido, pero queda registrado
  const led = readLedger(dir);
  assert.equal(led.length, 2);
  assert.match(led[0].at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(led[0].changes.length, 4);
  assert.deepEqual(led[1].options.only, ['2.1']);
  assert.equal(led[1].changes[0].action, 'skipped');
  assert.equal(led[0].sourceHash, led[1].sourceHash, 'mismo epics.md, mismo hash');
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- decisiones: lo que BMAD registro al conversar ------------------------------------------

const PLANNING = path.join(ROOT, 'fixtures', 'planning-artifacts');
const withPlanning = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dec-'));
  fs.cpSync(PLANNING, path.join(dir, '_bmad-output', 'planning-artifacts'), { recursive: true });
  return dir;
};

test('parseMemlog lee frontmatter, entradas tipadas, texto envuelto y tipos desconocidos', () => {
  const md = fs.readFileSync(path.join(PLANNING, 'prds', 'prd-portal-2026-09-01', '.memlog.md'), 'utf8');
  const m = parseMemlog(md);
  assert.equal(m.meta.updated, '2026-09-01T10:15');
  assert.deepEqual(m.entries.map((e) => e.type), ['event', 'decision', 'decision', 'assumption', 'change', 'override', 'question']);
  assert.match(m.entries[1].text, /nadie puede auditar$/, 'la linea envuelta se pega a la entrada');
  assert.deepEqual(m.entries[4].refs, ['FR001']);
  assert.equal(m.entries[6].type, 'question', 'un tipo no documentado se conserva');
});

test('extractRefs conserva la forma literal y deduplica por clave', () => {
  assert.deepEqual(extractRefs('FR-21 y FR21 son lo mismo; UX-DR4, AD-9, la Story 1.2 y el Epic 3'), ['FR-21', 'UX-DR4', 'AD-9', 'Story 1.2', 'Epic 3']);
  assert.deepEqual(extractRefs('Node 22.12 no es una story'), []);
});

test('parseChangeProposal saca una entrada por fila de tabla que cite un id', () => {
  const md = fs.readFileSync(path.join(PLANNING, 'sprint-change-proposal-2026-09-05.md'), 'utf8');
  const p = parseChangeProposal(md);
  assert.equal(p.entries.length, 3, 'el pedido 3 (Epic nuevo, sin id) y la fila sin cambios no cuentan');
  assert.deepEqual(p.entries[0].refs, ['FR001']);
  assert.match(p.entries[0].text, /Dentro del alcance/);
  assert.deepEqual(p.entries[2].refs, ['FR001', 'FR002']);
});

test('la historia de un requisito cruza memlogs, propuestas y puente, en orden', () => {
  const dir = withPlanning();
  const pr = path.join(dir, '_bmad-output', 'planning-artifacts');
  const c = collectDecisions(dir, pr);
  assert.equal(c.sources.length, 3);
  assert.equal(c.entries.length, 12);

  const h = requirementHistory(dir, pr, 'fr-001');           // clave tolerante
  assert.equal(h.events.length, 5);
  assert.deepEqual(h.events.map((e) => e.type), ['decision', 'change', 'override', 'change', 'change']);
  assert.equal(h.changes, 4);
  assert.ok(h.events.every((e, i, a) => i === 0 || a[i - 1].when <= e.when), 'cronologico');
  assert.match(h.events[2].text, /Descartado permitir registro con Gmail/, 'el descarte con motivo esta ahi');

  // Con trace.json y ledger, aparecen las corridas del puente sobre las stories que lo cubren.
  fs.copyFileSync(FIXTURE, path.join(dir, 'epics.md'));
  fs.mkdirSync(paths(dir).changes, { recursive: true });
  execFileSync('node', [CLI_BRIDGE, 'epics.md'], { cwd: dir, stdio: 'pipe' });
  const trace = readTrace(dir);
  const h2 = requirementHistory(dir, pr, 'FR001', trace);
  assert.deepEqual(h2.stories, ['1.1']);
  assert.ok(h2.events.some((e) => e.source === 'bridge' && /Story 1\.1/.test(e.text)));

  const rank = instabilityRanking(dir, pr, trace);
  assert.equal(rank[0].id, 'FR001');
  assert.ok(rank.every((r) => !/^(Story|Epic)/.test(r.id)), 'stories y epics no son requisitos');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('context lista los memlogs y las propuestas de cambio: antes se excluian', () => {
  const dir = withPlanning();
  const found = findPlanningArtifacts(dir);
  const dec = found.filter((a) => a.kind === 'decisions');
  assert.equal(dec.length, 3);
  assert.ok(dec.some((a) => a.file.endsWith('.memlog.md')));
  assert.ok(dec.some((a) => /sprint-change-proposal/.test(a.file)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('history desde el CLI: ranking sin argumento, linea de tiempo con id, y sin datos no explota', () => {
  const cli = (dir, ...args) => execFileSync('node', [path.join(ROOT, 'bin', 'un-specweaver.mjs'), 'history', ...args], { cwd: dir, stdio: 'pipe' }).toString();
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'dec-'));
  assert.match(cli(empty), /No hay memlogs/);
  fs.rmSync(empty, { recursive: true, force: true });

  const dir = withPlanning();
  const rank = cli(dir);
  assert.match(rank, /FR001\s+4 cambio/);
  const one = cli(dir, 'FR001');
  assert.match(one, /FR001 — 4 cambio\(s\) en 5 evento\(s\)/);
  assert.match(one, /\(override\) Descartado/);
  assert.match(cli(dir, 'FR999'), /sin decisiones registradas/);
  fs.rmSync(dir, { recursive: true, force: true });
});
