import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { VENDORS, which, gte, vendorIds, preflight, detectAgents, detectGraphify, detectEngram, brewTrusted, brewTapKinds, untrustedItems } from '../src/env.mjs';
import { runAction, runPlan } from '../src/run.mjs';
import { globalEngramPlugin, writeState, readState } from '../src/env.mjs';
import { paths, HOME } from '../src/paths.mjs';
import { ENGRAM_WRAPPER, mcpConfigFor, engramIsolation } from '../src/steps.mjs';
import { t, keysOf } from '../src/i18n.mjs';
import { resolvePrefs, parseAnswer, parseAgents, DEFAULTS, CHOICES, validateFlag } from '../src/prefs.mjs';
import { buildPlan, STEPS, renderAction, renderCommand, commandPath, NAMESPACE, gitignoreBlock, GITIGNORE_START, graphifyIgnoreBlock, scopeGraphifyHooks } from '../src/steps.mjs';
import { GRAPHIFY_IGNORE_START, graphifyIgnoreOk, graphifyHookOk } from '../src/env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI = path.join(ROOT, 'bin', 'un-specweaver.mjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ub-'));
// Se copia la config entera del agente, igual que produccion: enumerar campos a mano
// es exactamente como se perdio commandStyle la primera vez.
const ctxFor = (root, ids = ['claude-code', 'opencode']) => ({
  root,
  agents: ids.map((id) => ({ ...VENDORS.agents[id], id })),
  platform: 'linux', lang: 'es', langName: 'Spanish',
});

test('gte compara versiones semanticas', () => {
  assert.ok(gte('20.11.0', '20.11.0'));
  assert.ok(gte('25.6.1', '20.11.0'));
  assert.ok(!gte('18.0.0', '20.11.0'));
  assert.ok(gte('v2.4.0', '2.3.0'));
});

test('which no usa shell y no encuentra binarios inexistentes', () => {
  assert.equal(which('definitivamente-no-existe-xyz'), null);
  assert.equal(which('../etc/passwd'), null, 'rechaza rutas, no solo nombres');
  assert.ok(which('node'));
});

test('el mapa de adaptadores traduce cada agente al id de cada vendor', () => {
  const agents = [VENDORS.agents['claude-code'], VENDORS.agents['opencode']].map((c, i) => ({ id: i, ids: c.ids }));
  assert.equal(vendorIds(agents, 'bmad'), 'claude-code,opencode');
  assert.equal(vendorIds(agents, 'openspec'), 'claude,opencode');   // OpenSpec dice "claude", no "claude-code"
  assert.equal(vendorIds(agents, 'gentle'), 'claude-code,opencode');
});

test('preflight detecta este entorno como apto', () => {
  const pf = preflight();
  assert.ok(pf.ok);
  assert.ok(['darwin', 'linux'].includes(pf.platform));
});

test('el plan de un proyecto vacio incluye todos los pasos en orden', () => {
  const root = tmp();
  const plan = buildPlan(ctxFor(root));
  // gitignore va primero: si un paso posterior falla, el vendor a medio instalar
  // no puede terminar commiteado por accidente.
  assert.deepEqual(plan.map((s) => s.id), ['gitignore', 'bmad', 'bmad-prune', 'openspec', 'engram-bin', 'engram-project', 'graphify-bin', 'graphify', 'dashboard-hook', 'surface', 'layer']);
  // gitignore depende de si hay repo git; gentle-bin depende del PATH de la maquina,
  // no del proyecto. El resto si tiene que estar pendiente en un directorio vacio.
  // graphify-bin tambien depende del PATH.
  const projectScoped = plan.filter((s) => !['gitignore', 'engram-bin', 'graphify-bin', 'dashboard-hook'].includes(s.id));
  assert.ok(projectScoped.every((s) => s.status.state === 'pending'), 'nada del proyecto puede estar "ok" en un directorio vacio');
  fs.rmSync(root, { recursive: true, force: true });
});

test('cada paso declara que bloquea: sin eso, un pendiente se lee como bloqueo total', () => {
  const root = tmp();
  const blocks = Object.fromEntries(buildPlan(ctxFor(root)).map((s) => [s.id, s.blocks]));
  // La memoria y el mapa del codigo sirven para construir. No pueden bloquear levantar
  // requerimientos: eso es lo que hacia que un agente se detuviera antes de siquiera planear.
  for (const id of ['engram-bin', 'engram-project', 'graphify-bin', 'graphify']) assert.equal(blocks[id], 'build', id);
  for (const id of ['bmad', 'bmad-prune', 'openspec', 'layer']) assert.equal(blocks[id], 'plan', id);
  assert.equal(blocks['gitignore'], 'none', 'un .gitignore ausente no impide trabajar');
  assert.ok(Object.values(blocks).every((b) => ['plan', 'build', 'none'].includes(b)), 'blocks invalido');
  fs.rmSync(root, { recursive: true, force: true });
});

test('BMAD se instala pineado, con alcance del proyecto y sin flags inexistentes', () => {
  const root = tmp();
  const step = buildPlan(ctxFor(root)).find((s) => s.id === 'bmad');
  const args = step.actions[0].args;
  assert.equal(step.actions[0].cmd, 'npx');
  assert.ok(args.includes(`${VENDORS.bmad.npm}@${VENDORS.bmad.version}`), 'version pineada');
  assert.ok(args.includes('--directory') && args[args.indexOf('--directory') + 1] === root, 'alcance del proyecto');
  assert.ok(args.includes('--tools') && args[args.indexOf('--tools') + 1] === 'claude-code,opencode');
  assert.ok(args.includes('--communication-language') && args.includes('Spanish'));
  // Verificado contra el CLI 6.11.0: --no-shims esta en los docs pero el binario lo rechaza.
  assert.ok(!args.includes('--no-shims'), '--no-shims no existe en el CLI real');
  fs.rmSync(root, { recursive: true, force: true });
});

test('la poda cubre constructores, competidores de OpenSpec y shims deprecados', () => {
  for (const s of ['bmad-agent-dev', 'bmad-build', 'bmad-build-auto', 'bmad-spec',
                   'bmad-dev-story', 'bmad-dev-auto', 'bmad-quick-dev', 'bmad-create-story'])
    assert.ok(VENDORS.bmad.prune.includes(s), `falta podar ${s}`);
  // Lo que NO se debe podar: la planeacion es justamente lo que se aprovecha de BMAD.
  for (const s of ['bmad-prd', 'bmad-create-epics-and-stories', 'bmad-sprint-planning', 'bmad-correct-course'])
    assert.ok(!VENDORS.bmad.prune.includes(s), `${s} es planeacion, no se poda`);
});

test('la poda cubre skills y comandos de cada agente elegido', () => {
  const root = tmp();
  const step = buildPlan(ctxFor(root)).find((s) => s.id === 'bmad-prune');
  const removed = step.actions.filter((a) => a.kind === 'rm').map((a) => path.relative(root, a.target));
  assert.ok(removed.includes(path.join('.claude/skills', 'bmad-build')));
  assert.ok(removed.includes(path.join('.agents/skills', 'bmad-build')));
  assert.ok(removed.includes(path.join('.opencode/commands', 'bmad-build.md')));
  // 2 dirs de skills + 2 dirs de comandos, por cada skill podada
  // 2 dirs de skills + 3 dirs de comandos (los declarados + el home replicado por workspace)
  assert.equal(removed.length % VENDORS.bmad.prune.length, 0, 'debe podar lo mismo en cada dir');
  assert.ok(removed.length >= VENDORS.bmad.prune.length * 4);
  fs.rmSync(root, { recursive: true, force: true });
});

test('un paso dependiente nunca se reporta "ok" si su dependencia sigue pendiente', () => {
  const root = tmp();
  const plan = buildPlan(ctxFor(root));
  // sin BMAD instalado no hay nada en disco que podar, pero el paso corre despues
  assert.equal(plan.find((s) => s.id === 'bmad-prune').status.state, 'pending');
  // surface poda comandos que instala BMAD: sin BMAD todavia no hay nada en disco, pero
  // reportarse "ok" haria que el dry-run mintiera sobre lo que va a pasar.
  assert.equal(plan.find((s) => s.id === 'surface').status.state, 'pending');
  fs.rmSync(root, { recursive: true, force: true });
});

test('la instalacion es de alcance del proyecto: ninguna ruta del plan sale de root', () => {
  const root = tmp();
  const home = os.homedir();
  for (const step of buildPlan(ctxFor(root)))
    for (const a of step.actions) {
      if (a.kind === 'write') assert.ok(path.resolve(a.file).startsWith(root), `escribe fuera: ${a.file}`);
      if (a.kind === 'rm') assert.ok(path.resolve(a.target).startsWith(root), `borra fuera: ${a.target}`);
      if (a.kind === 'write' || a.kind === 'rm')
        assert.ok(!path.resolve(a.file || a.target).startsWith(path.join(home, '.claude')), 'toca el HOME del usuario');
    }
  fs.rmSync(root, { recursive: true, force: true });
});

test('la capa escribe la skill en todos los dirs de skills y respeta architecture-base existente', () => {
  const root = tmp();
  const ctx = ctxFor(root);
  let plan = buildPlan(ctx).find((s) => s.id === 'layer');
  const files = plan.actions.filter((a) => a.kind === 'write').map((a) => path.relative(root, a.file));
  assert.ok(files.includes(path.join('.claude/skills/un-specweaver', 'SKILL.md')));
  assert.ok(files.includes(path.join('.agents/skills/un-specweaver', 'SKILL.md')));
  assert.ok(files.includes(path.join('docs', 'architecture-base.md')));

  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'architecture-base.md'), 'MI ARQUITECTURA\n');
  plan = buildPlan(ctx).find((s) => s.id === 'layer');
  assert.ok(!plan.actions.some((a) => a.kind === 'write' && a.file.endsWith('architecture-base.md')),
    'no debe sobrescribir la arquitectura del usuario');
  fs.rmSync(root, { recursive: true, force: true });
});

test('--only y --skip filtran los pasos', () => {
  const root = tmp();
  assert.deepEqual(buildPlan(ctxFor(root), { only: ['layer'] }).map((s) => s.id), ['layer']);
  assert.ok(!buildPlan(ctxFor(root), { skip: ['gentle-bin', 'gentle-config'] }).some((s) => s.id.startsWith('gentle')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('un agente invalido se rechaza en vez de instalarse a medias', () => {
  const root = tmp();
  assert.throws(() => execFileSync('node', [CLI, 'init', root, '--agents', 'no-existe', '--dry-run'], { stdio: 'pipe' }));
  fs.rmSync(root, { recursive: true, force: true });
});

test('--dry-run no escribe absolutamente nada, ni cuando reporta un bloqueo', () => {
  const root = tmp();
  // Puede salir distinto de cero (un paso bloqueado se propaga en seco, a proposito).
  // Lo que se afirma aqui es lo otro: que no toque el disco pase lo que pase.
  try { execFileSync('node', [CLI, 'init', root, '--agents', 'claude-code', '--dry-run'], { stdio: 'pipe' }); }
  catch { /* el codigo de salida no es lo que este test verifica */ }
  assert.deepEqual(fs.readdirSync(root), [], 'dry-run dejo archivos');
  fs.rmSync(root, { recursive: true, force: true });
});

test('renderAction imprime rutas relativas al proyecto, no absolutas', () => {
  const root = '/tmp/x';
  assert.equal(renderAction({ kind: 'rm', target: '/tmp/x/.claude/skills/bmad-build' }, root), '- .claude/skills/bmad-build');
  assert.match(renderAction({ kind: 'exec', cmd: 'npx', args: ['a', 'b c'] }, root), /^\$ npx a "b c"$/);
});

// --- superficie de comandos ---------------------------------------------------

const LAYER = path.join(ROOT, 'src', 'layer');
const CMDS = fs.readdirSync(path.join(LAYER, 'commands', 'es')).map((f) => f.replace(/\.md$/, '')).sort();

test('existen los once comandos, en los dos idiomas', () => {
  // bug y change son flujos separados a proposito: uno cambia lo acordado, el otro no.
  assert.deepEqual(CMDS, ['adopt', 'bug', 'build', 'change', 'close', 'doctor', 'new', 'sprint', 'status', 'sync', 'ticket']);
  const en = fs.readdirSync(path.join(LAYER, 'commands', 'en')).map((f) => f.replace(/\.md$/, '')).sort();
  assert.deepEqual(en, CMDS, 'es y en deben tener exactamente los mismos comandos');
});

test('cada comando trae el frontmatter que los dos formatos necesitan', () => {
  for (const lang of ['es', 'en'])
    for (const name of CMDS) {
      const src = fs.readFileSync(path.join(LAYER, 'commands', lang, `${name}.md`), 'utf8');
      assert.match(src, /^---\n/, `${lang}/${name}: sin frontmatter`);
      assert.match(src, new RegExp(`^name: ${name}$`, 'm'), `${lang}/${name}: name no coincide con el archivo`);
      assert.match(src, /^title: /m, `${lang}/${name}: falta title`);
      assert.match(src, /^description: /m, `${lang}/${name}: falta description`);
    }
});

test('la skill y la plantilla de arquitectura existen en los dos idiomas', () => {
  for (const lang of ['es', 'en']) {
    assert.ok(fs.existsSync(path.join(LAYER, 'skills', 'un-specweaver', `SKILL.${lang}.md`)));
    assert.ok(fs.existsSync(path.join(LAYER, 'docs', `architecture-base.${lang}.md`)));
  }
});

test('la skill lista todos los comandos: si se agrega uno, el mapa no puede quedar viejo', () => {
  for (const [lang, sep] of [['es', ':'], ['en', ':']]) {
    const skill = fs.readFileSync(path.join(LAYER, 'skills', 'un-specweaver', `SKILL.${lang}.md`), 'utf8');
    for (const name of CMDS) assert.ok(skill.includes(`/${NAMESPACE}${sep}${name}`), `SKILL.${lang} no menciona /${NAMESPACE}${sep}${name}`);
  }
});

test('cada formato de agente emite el frontmatter que ese agente entiende', () => {
  const meta = { name: 'change', title: 'UB: X', description: 'desc', 'allowed-tools': 'Read, Bash' };
  const claude = renderCommand('namespaced', meta, '# cuerpo\n');
  assert.match(claude, /^---\nname: "UB: X"\ndescription: "desc"\nallowed-tools: Read, Bash\n---\n/);

  const oc = renderCommand('prefixed', meta, '# cuerpo\n');
  assert.match(oc, /^---\ndescription: "desc"\n---\n/);
  assert.ok(!oc.includes('allowed-tools'), 'OpenCode no usa allowed-tools');
  assert.ok(!oc.includes('name:'), 'OpenCode solo lleva description');
});

test('las referencias cruzadas se reescriben a la sintaxis del agente', () => {
  const body = 'Ver /sw:change y tambien /sw:build para seguir.\n';
  assert.ok(renderCommand('namespaced', {}, body).includes('/sw:change'), 'Claude conserva /sw:');
  const oc = renderCommand('prefixed', {}, body);
  assert.ok(oc.includes('/sw-change') && oc.includes('/sw-build'), 'OpenCode debe usar /sw-');
  assert.ok(!oc.includes('/sw:'), 'un comando no puede decirle al usuario que invoque algo inexistente');
});

test('commandPath ubica cada comando donde su agente lo busca', () => {
  assert.equal(commandPath({ commands: '.claude/commands', commandStyle: 'namespaced' }, 'new'), path.join('.claude/commands', 'sw', 'new.md'));
  assert.equal(commandPath({ commands: '.opencode/commands', commandStyle: 'prefixed' }, 'new'), path.join('.opencode/commands', 'sw-new.md'));
});

test('la capa emite skill a todos y comandos solo a quien tiene formato documentado', () => {
  const root = tmp();
  const files = (ids) => STEPS.find((s) => s.id === 'layer').files(ctxFor(root, ids)).map((f) => path.relative(root, f.file));

  const both = files(['claude-code', 'opencode']);
  assert.equal(both.filter((f) => f.startsWith('.claude/commands')).length, CMDS.length);
  assert.equal(both.filter((f) => f.startsWith('.opencode/commands')).length, CMDS.length);
  assert.ok(both.includes(path.join('.claude/skills/un-specweaver', 'SKILL.md')));
  assert.ok(both.includes(path.join('.agents/skills/un-specweaver', 'SKILL.md')));

  // Todo agente soportado recibe skill Y comandos: no se declara soportado uno a medias.
  for (const [id, cfg] of Object.entries(VENDORS.agents)) {
    assert.ok(cfg.commands, `${id}: un agente soportado debe tener formato de comandos`);
    assert.ok(files([id]).some((f) => f.includes('commands')), `${id}: debe recibir los comandos`);
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test('--lang cambia el idioma de comandos, skill y plantilla', () => {
  const root = tmp();
  const get = (lang, rel) => {
    const ctx = { ...ctxFor(root), lang };
    return STEPS.find((s) => s.id === 'layer').files(ctx).find((f) => f.file.endsWith(rel));
  };
  assert.match(get('es', path.join('sw', 'change.md')).content, /Requerimiento nuevo/);
  assert.match(get('en', path.join('sw', 'change.md')).content, /New requirement/);
  assert.match(get('es', path.join('un-specweaver', 'SKILL.md')).content, /Flujo de desarrollo/);
  assert.match(get('en', path.join('un-specweaver', 'SKILL.md')).content, /Spec-driven development/);
  assert.match(get('es', 'architecture-base.md').content, /^# Arquitectura base/);
  assert.match(get('en', 'architecture-base.md').content, /^# Base architecture/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('la poda alcanza tambien los comandos, no solo los directorios de skills', () => {
  const root = tmp();
  const targets = STEPS.find((s) => s.id === 'bmad-prune').targets(ctxFor(root)).map((t) => path.relative(root, t));
  // BMAD instala cada skill dos veces: directorio + comando .md por agente.
  assert.ok(targets.includes(path.join('.opencode/commands', 'bmad-build.md')), 'fuga: bmad-build sigue invocable en OpenCode');
  assert.ok(targets.includes(path.join('.opencode/commands', 'bmad-agent-dev.md')));
  assert.ok(targets.includes(path.join('.agents/skills', 'bmad-build')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('los agentes se construyen con su config completa (commandStyle incluido)', () => {
  // Una vez se enumeraron los campos a mano y se perdio commandStyle: Claude Code
  // emitio comandos con el formato de OpenCode y nadie lo noto hasta instalarlo.
  for (const [id, cfg] of Object.entries(VENDORS.agents)) {
    if (!cfg.commands) continue;
    assert.ok(cfg.commandStyle, `${id}: tiene dir de comandos pero no commandStyle`);
    assert.ok(['namespaced', 'prefixed'].includes(cfg.commandStyle), `${id}: commandStyle invalido`);
  }
});

test('bridge reenvia sus propios flags sin que el dispatcher los rechace', () => {
  // /sw:new le dice al usuario que corra `un-specweaver bridge ... --strict`. Si el dispatcher
  // parsea los flags del subcomando, ese comando documentado falla.
  const root = tmp();
  const epics = path.join(root, 'epics.md');
  fs.copyFileSync(path.join(ROOT, 'fixtures', 'epics.sample.md'), epics);
  for (const extra of [['--strict'], ['--only', '1.1'], ['--normative', 'debe'], ['--dry-run']]) {
    const out = execFileSync('node', [CLI, 'bridge', epics, '--out', root, ...extra], { stdio: 'pipe' }).toString();
    assert.ok(!/Opcion desconocida/.test(out), `bridge rechazo ${extra[0]}`);
  }
  fs.rmSync(root, { recursive: true, force: true });
});

// --- i18n y capacidades opcionales -------------------------------------------

test('los dos idiomas tienen exactamente las mismas claves', () => {
  const es = keysOf('es'), en = keysOf('en');
  assert.deepEqual(es.filter((k) => !en.includes(k)), [], 'claves sin traducir al ingles');
  assert.deepEqual(en.filter((k) => !es.includes(k)), [], 'claves sin equivalente en espanol');
  assert.ok(es.length > 50);
});

test('ninguna clave i18n devuelve undefined ni queda sin interpolar', () => {
  for (const lang of ['es', 'en'])
    for (const key of keysOf(lang)) {
      const v = t(lang, key, 'A', 'B');
      assert.ok(v !== undefined && v !== null, `${lang}/${key} vacia`);
      if (typeof v === 'string') assert.ok(!v.includes('${'), `${lang}/${key} quedo sin interpolar`);
    }
});

test('los titulos de los pasos salen en el idioma del contexto', () => {
  const root = tmp();
  const es = buildPlan({ ...ctxFor(root), lang: 'es' }).map((s) => s.title).join(' ');
  const en = buildPlan({ ...ctxFor(root), lang: 'en' }).map((s) => s.title).join(' ');
  assert.match(es, /planeacion/);
  assert.match(en, /planning/);
  assert.notEqual(es, en);
  fs.rmSync(root, { recursive: true, force: true });
});

test('preflight revisa uv como aviso, no como bloqueante', () => {
  const uv = preflight('es').checks.find((c) => c.name.startsWith('uv'));
  assert.ok(uv, 'falta el chequeo de uv: BMAD lo verifica al instalar');
  assert.equal(uv.fatal, false, 'uv no puede bloquear: las skills de BMAD traen fallback manual');
});

test('graphify es parte del metodo: init lo instala, lo acota a codigo y deja el hook', () => {
  // VERIFICADO contra graphify 0.8.37: `update` es AST puro (sin LLM, solo extensiones de
  // codigo; sin codigo termina en exit 0 sin crear graph.json), `install --project` deja la
  // skill dentro del proyecto y `hook install` es idempotente.
  const root = tmp();
  execFileSync('git', ['-C', root, 'init', '-q']);
  const bin = STEPS.find((s) => s.id === 'graphify-bin');
  const step = STEPS.find((s) => s.id === 'graphify');
  assert.equal(step.dependsOn, 'graphify-bin');
  assert.equal(step.blocks, 'build', 'sin grafo se planea igual; construir es lo que pierde precision');

  const ctx = ctxFor(root);
  const binActions = bin.plan(ctx);
  if (which('graphify')) {
    assert.equal(binActions[0].kind, 'note', 'ya instalado: no se reinstala');
  } else if (which('uv') || which('pipx')) {
    const e = binActions[0];
    assert.equal(e.kind, 'exec');
    assert.match(e.args.join(' '), new RegExp(`${VENDORS.graphify.pip}==${VENDORS.graphify.version.replace(/\./g, '\\.')}`), 'pineado');
  } else {
    assert.equal(binActions[0].kind, 'blocked', 'sin uv ni pipx no se instala con pip sobre el python del sistema');
  }

  assert.equal(step.status(ctx).state, 'pending');
  const actions = step.plan(ctx);
  const ignore = actions.find((a) => a.kind === 'write' && a.file.endsWith(VENDORS.graphify.ignoreFile));
  assert.ok(ignore, 'debe escribir .graphifyignore');
  assert.ok(actions.indexOf(ignore) < actions.findIndex((a) => a.kind === 'exec'), 'el alcance se fija ANTES de construir el grafo');
  for (const pat of ['_bmad-output/', 'openspec/', 'docs/', '*.md', '.engram/', 'graphify-out/'])
    assert.ok(ignore.content.includes(`\n${pat}\n`), `el grafo no puede incluir ${pat}`);

  const execs = actions.filter((a) => a.kind === 'exec');
  const installs = execs.filter((a) => a.args[0] === 'install');
  assert.deepEqual(installs.map((a) => a.args.slice(1)), [['--project', '--platform', 'claude'], ['--project', '--platform', 'opencode']],
    'skill dentro del proyecto, un comando por agente, con el id que graphify usa');
  assert.ok(installs.every((a) => a.tolerateFailure), 'un agente que falle no debe impedir los demas');
  assert.ok(execs.some((a) => a.args[0] === 'update' && a.args[1] === '.'), 'grafo AST inicial');
  assert.ok(execs.some((a) => a.args[0] === 'hook'), 'con repo git se instala el hook');
  fs.rmSync(root, { recursive: true, force: true });
});

test('los hooks PreToolUse de graphify se acotan a codigo: el PRD y los specs no estan en el grafo', async () => {
  // Texto real que graphify 0.8.37 escribe en .claude/settings.json (Read|Glob dispara sobre .md).
  const real = {
    hooks: { PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'case "$CMD" in *grep*) echo x ;; esac' }] },
      { matcher: 'Read|Glob', hooks: [{ type: 'command', command: "HIT=$(python3 -c \"...exts=('.py','.js','.ts','.lua','.sh','.md','.rst','.txt','.mdx');sys.stdout.write('1' if 'graphify-out/' not in s and any(e in s for e in exts) else '')\")" }] },
    ] },
  };
  const out = JSON.parse(scopeGraphifyHooks(JSON.stringify(real)));
  const read = out.hooks.PreToolUse[1].hooks[0].command;
  assert.doesNotMatch(read, /'\.md'|'\.txt'|'\.rst'/, 'los docs no disparan el hook');
  assert.match(read, /'\.py','\.js'/, 'el codigo si');
  for (const dir of ['_bmad-output/', 'openspec/', 'docs/', '.engram/']) assert.ok(read.includes(`'${dir}'`), `${dir} excluida`);
  assert.equal(out.hooks.PreToolUse[0].hooks[0].command, real.hooks.PreToolUse[0].hooks[0].command, 'el hook de Bash (grep) no se toca');

  // Texto desconocido (version futura): se deja igual, no se rompe.
  const other = JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Read|Glob', hooks: [{ type: 'command', command: 'algo nuevo' }] }] } });
  assert.equal(scopeGraphifyHooks(other), other);
  assert.equal(scopeGraphifyHooks('no es json'), 'no es json');

  // El patch va DESPUES del install que crea el archivo, y sin archivo no hace nada.
  const root = tmp();
  const step = STEPS.find((s) => s.id === 'graphify');
  const actions = step.plan(ctxFor(root, ['claude-code']));
  const i = actions.findIndex((a) => a.kind === 'exec' && a.args[0] === 'install');
  const p = actions.findIndex((a) => a.kind === 'patch');
  assert.ok(p > i, 'el patch sigue al install');
  assert.ok(actions[p].file.endsWith(path.join('.claude', 'settings.json')));
  const r = await runAction(actions[p], { root, lang: 'es' });
  assert.equal(r.ok, true, 'sin settings.json no falla');
  assert.match(renderAction(actions[p], root), /^~ \.claude\/settings\.json/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('sin repo git graphify no intenta instalar el hook', () => {
  const root = tmp();
  const step = STEPS.find((s) => s.id === 'graphify');
  const actions = step.plan(ctxFor(root));
  assert.ok(!actions.some((a) => a.kind === 'exec' && a.args[0] === 'hook'));
  assert.ok(actions.some((a) => a.kind === 'note' && /graphify update/.test(a.text)), 'y dice como reconstruir a mano');
  fs.rmSync(root, { recursive: true, force: true });
});

test('.graphifyignore es un bloque marcado: preserva lo del usuario y no se duplica', () => {
  const root = tmp();
  const step = STEPS.find((s) => s.id === 'graphify');
  const f = path.join(root, VENDORS.graphify.ignoreFile);
  fs.writeFileSync(f, 'mi-carpeta-privada/\n');
  const w = () => step.plan(ctxFor(root)).find((a) => a.kind === 'write' && a.file === f);
  fs.writeFileSync(f, w().content);
  assert.ok(graphifyIgnoreOk(root));
  assert.match(fs.readFileSync(f, 'utf8'), /^mi-carpeta-privada\//m, 'lo del usuario sigue');
  fs.writeFileSync(f, w().content);
  assert.equal(fs.readFileSync(f, 'utf8').split(GRAPHIFY_IGNORE_START).length - 1, 1, 'un solo bloque');
  fs.rmSync(root, { recursive: true, force: true });
});

test('el estado de graphify no exige graph.json: en greenfield no hay codigo que mapear', () => {
  const root = tmp();
  execFileSync('git', ['-C', root, 'init', '-q']);
  const step = STEPS.find((s) => s.id === 'graphify');
  const ctx = ctxFor(root);
  if (!which('graphify')) { fs.rmSync(root, { recursive: true, force: true }); return; }
  fs.writeFileSync(path.join(root, VENDORS.graphify.ignoreFile), graphifyIgnoreBlock());
  for (const a of ctx.agents) {
    fs.mkdirSync(path.join(root, a.graphifySkill), { recursive: true });
    fs.writeFileSync(path.join(root, a.graphifySkill, 'SKILL.md'), '# graphify');
  }
  fs.mkdirSync(path.join(root, '.git', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git', 'hooks', 'post-commit'), '#!/bin/sh\ngraphify update .\n');
  assert.ok(graphifyHookOk(root));
  const st = step.status(ctx);
  assert.equal(st.state, 'ok', st.detail);
  assert.match(st.detail, /primer codigo|first code/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('detectGraphify mira la ruta de skill que graphify usa para cada agente, no la de BMAD', () => {
  // graphify install --project deja OpenCode en .opencode/skills, no en .agents/skills.
  const root = tmp();
  let g = detectGraphify(root);
  assert.deepEqual(g.skills.map((x) => [x.id, x.path, x.present]), [['claude-code', '.claude/skills/graphify', false], ['opencode', '.opencode/skills/graphify', false]]);
  assert.equal(g.graph, null);
  fs.mkdirSync(path.join(root, '.opencode', 'skills', 'graphify'), { recursive: true });
  fs.writeFileSync(path.join(root, '.opencode', 'skills', 'graphify', 'SKILL.md'), '');
  fs.mkdirSync(path.join(root, 'graphify-out'), { recursive: true });
  fs.writeFileSync(path.join(root, 'graphify-out', 'graph.json'), '{}');
  g = detectGraphify(root);
  assert.equal(g.skills.find((x) => x.id === 'opencode').present, true);
  assert.equal(g.graph, path.join('graphify-out', 'graph.json'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('el gitignore ignora el grafo y las skills de graphify, pero no .graphifyignore', () => {
  const block = gitignoreBlock();
  assert.match(block, /^graphify-out\/$/m, 'AST regenerable, y el hook lo reescribe en cada commit');
  for (const d of ['.claude/skills', '.opencode/skills', '.agents/skills']) assert.ok(block.includes(`${d}/graphify/`), d);
  assert.ok(!/^\.graphifyignore/m.test(block), 'la regla del equipo va al repo');
  assert.match(block, /\.graphifyignore/, 'y se dice explicitamente');
});

test('los comandos que usan graphify declaran las tres ramas y prohiben ampliarlo a docs', () => {
  for (const lang of ['es', 'en']) {
    for (const name of ['adopt', 'build']) {
      const src = fs.readFileSync(path.join(LAYER, 'commands', lang, `${name}.md`), 'utf8');
      assert.match(src, /graphify-out\/graph\.json/, `${lang}/${name}: no revisa si hay grafo`);
      assert.match(src, /graphify update \./, `${lang}/${name}: no dice como construirlo`);
      assert.match(src, lang === 'es' ? /menos confiable/ : /less reliable/, `${lang}/${name}: no declara la degradacion`);
      assert.match(src, lang === 'es' ? /No ampl/ : /Do not widen/, `${lang}/${name}: debe prohibir el grafo sobre docs`);
    }
    // change y bug miden impacto y localizan con el grafo: es para lo que existe.
    for (const name of ['change', 'bug']) {
      const src = fs.readFileSync(path.join(LAYER, 'commands', lang, `${name}.md`), 'utf8');
      assert.match(src, /graphify affected/, `${lang}/${name}: debe medir impacto real`);
    }
  }
});

test('la skill declara graphify como parte del metodo y solo de codigo', () => {
  for (const lang of ['es', 'en']) {
    const skill = fs.readFileSync(path.join(LAYER, 'skills', 'un-specweaver', `SKILL.${lang}.md`), 'utf8');
    assert.match(skill, lang === 'es' ? /parte del metodo/ : /part of the method/);
    assert.match(skill, /\.graphifyignore/);
    assert.doesNotMatch(skill, lang === 'es' ? /se detecta, no se instala/ : /detected, not installed/);
  }
});





// --- gitignore ----------------------------------------------------------------

const gitInit = () => { const d = tmp(); execFileSync('git', ['init', '-q', d], { stdio: 'pipe' }); return d; };
const runInit = (root, extra = []) => execFileSync('node',
  [CLI, 'init', root, '--agents', 'claude-code,opencode', '--only', 'gitignore'], { stdio: 'pipe' });

test('el bloque cubre lo regenerable y nada mas', () => {
  const agents = ['claude-code', 'opencode'].map((id) => ({ ...VENDORS.agents[id], id }));
  const b = gitignoreBlock(agents);
  for (const line of ['node_modules/', '_bmad/', '**/.openspec-target', '.claude/skills/bmad-*/',
                      '.agents/skills/bmad-*/', '.claude/commands/sw/', '.opencode/commands/sw-*.md',
                      '.opencode/skills/bmad-*/'])
    assert.ok(b.includes(line), `falta: ${line}`);
  // Lo que es producto NUNCA se ignora: son los artefactos que justifican el repo.
  for (const bad of ['openspec/', '_bmad-output/', 'docs/', '.un-specweaver/'])
    assert.ok(!new RegExp(`^${bad.replace('.', '\\.')}$`, 'm').test(b), `no debe ignorar ${bad}`);
});

test('ignora el vendor pero no las skills ni comandos propios del usuario', () => {
  const root = gitInit();
  runInit(root);
  const ignored = (f) => {
    try { execFileSync('git', ['-C', root, 'check-ignore', '-q', f], { stdio: 'pipe' }); return true; }
    catch { return false; }
  };
  assert.ok(ignored('.claude/skills/bmad-prd/SKILL.md'), 'vendor de BMAD debe ignorarse');
  assert.ok(ignored('.claude/commands/sw/new.md'), 'comandos generados deben ignorarse');
  assert.ok(ignored('node_modules/x'), 'node_modules debe ignorarse');
  // La linea roja: ignorar `.claude/` entero escondería lo del usuario.
  assert.ok(!ignored('.claude/skills/mi-skill/SKILL.md'), 'una skill propia NO puede quedar oculta');
  assert.ok(!ignored('.claude/commands/mio/algo.md'), 'un comando propio NO puede quedar oculto');
  assert.ok(!ignored('openspec/specs/x/spec.md'), 'los specs son el producto: van al repo');
  fs.rmSync(root, { recursive: true, force: true });
});

test('preserva las reglas que el usuario ya tenia', () => {
  const root = gitInit();
  fs.writeFileSync(path.join(root, '.gitignore'), '# mis reglas\ndist/\n.env\n');
  runInit(root);
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gi, /^# mis reglas$/m);
  assert.match(gi, /^dist\/$/m);
  assert.match(gi, /^\.env$/m);
  assert.ok(gi.indexOf('dist/') < gi.indexOf(GITIGNORE_START), 'lo del usuario va primero');
  fs.rmSync(root, { recursive: true, force: true });
});

test('re-ejecutar no duplica el bloque: lo reemplaza', () => {
  const root = gitInit();
  runInit(root);
  const once = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  execFileSync('node', [CLI, 'init', root, '--agents', 'claude-code,opencode', '--only', 'gitignore', '--force'], { stdio: 'pipe' });
  const twice = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.equal((twice.match(new RegExp(GITIGNORE_START, 'g')) || []).length, 1, 'bloque duplicado');
  assert.equal(once, twice, 'la reescritura debe ser identica');
  fs.rmSync(root, { recursive: true, force: true });
});

test('sin repo git el paso se omite en vez de crear un .gitignore huerfano', () => {
  const root = tmp();                     // sin git init
  const step = buildPlan(ctxFor(root)).find((s) => s.id === 'gitignore');
  assert.equal(step.status.state, 'skip');
  assert.ok(!fs.existsSync(path.join(root, '.gitignore')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('un prerequisito que solo el usuario puede autorizar falla el paso, no lo da por hecho', async () => {
  const root = tmp();
  const action = { kind: 'blocked', title: 'tap no confiable', why: 'porque X', fix: 'corre Y' };
  const r = await runAction(action, { root, lang: 'es' });
  // Reportar "listo" sobre algo que no ocurrio seria mentir; el paso tiene que fallar.
  assert.equal(r.ok, false);
  assert.match(r.error, /autorizar/);
  assert.match(renderAction(action, root), /^! tap no confiable$/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('la confianza de Homebrew se lee por item y por tipo, no por tap', () => {
  // Dos casos reales encadenados: (1) el tap marcado "Untrusted" mientras gentle-ai SI
  // estaba confiada, y (2) engram publicado como formula Y cask — confiar la formula no
  // basta porque brew resuelve a la cask y pide --cask aparte.
  const home = tmp();
  fs.mkdirSync(path.join(home, '.homebrew'), { recursive: true });
  fs.writeFileSync(path.join(home, '.homebrew', 'trust.json'),
    JSON.stringify({ trustedformulae: ['t/tap/gentle-ai'], trustedcasks: [] }));

  const tr = brewTrusted(home, {});
  assert.deepEqual([...tr.formulae], ['t/tap/gentle-ai']);
  assert.deepEqual([...tr.casks], []);
  fs.rmSync(home, { recursive: true, force: true });
});

test('sin trust.json no explota: trata todo como no confiado', () => {
  const home = tmp();
  const tr = brewTrusted(home, {});
  assert.deepEqual([...tr.formulae], []);
  assert.deepEqual([...tr.casks], []);
  fs.rmSync(home, { recursive: true, force: true });
});

test('untrustedItems no inventa nada cuando el tap no aplica', () => {
  const r = untrustedItems('tap-que-no-existe/nada', ['x']);
  assert.ok(r === null || Array.isArray(r), 'null si no aplica, lista si aplica');
  if (Array.isArray(r)) assert.deepEqual(r, [], 'un tap inexistente no publica nada que autorizar');
});

test('el remedio del tap nombra el comando exacto en los dos idiomas', () => {
  for (const lang of ['es', 'en']) {
    const fix = t(lang, 'step.engram-bin.untrustedFix', '       brew trust --cask foo/tap/engram');
    // Solo UN item que autorizar: antes eran tres (gentle-ai, engram, gga) y cada uno
    // aparecia en su propia ronda de whack-a-mole.
    assert.match(fix, /brew trust --cask foo\/tap\/engram/);
    assert.match(fix, /un-specweaver init/);
  }
});

test('Engram se trata como capacidad opcional, no se asume', () => {
  for (const lang of ['es', 'en']) {
    for (const name of ['change', 'build']) {
      const src = fs.readFileSync(path.join(LAYER, 'commands', lang, `${name}.md`), 'utf8');
      assert.match(src, /Engram/, `${lang}/${name}`);
      // Debe existir el destino alternativo: un rationale sin donde caer se pierde.
      assert.match(src, /design\.md/, `${lang}/${name}: sin fallback si Engram no esta`);
      assert.match(src, lang === 'es' ? /silencio/ : /silently/, `${lang}/${name}: no advierte del fallo silencioso`);
    }
    const skill = fs.readFileSync(path.join(LAYER, 'skills', 'un-specweaver', `SKILL.${lang}.md`), 'utf8');
    assert.match(skill, /Engram/);
    assert.match(skill, /design\.md/, `SKILL.${lang}: la tabla debe nombrar el fallback`);
  }
});

test('un dry-run con un paso bloqueado no puede reportar exito', async () => {
  const root = tmp();
  const plan = [{ id: 'x', title: 'X', status: {}, actions: [{ kind: 'blocked', title: 't', why: 'w', fix: 'f' }] }];
  const [r] = await runPlan(plan, { root, lang: 'es', dryRun: true });
  assert.equal(r.ok, false, 'dry-run debe propagar el bloqueo, no decir "Listo"');
  fs.rmSync(root, { recursive: true, force: true });
});

test('confiar el tap entero cubre todos sus items', () => {
  // Bug de bloqueo falso: el usuario corrio `brew trust <tap>` y la deteccion siguio
  // exigiendo item por item porque solo leia trustedformulae/trustedcasks.
  const home = tmp();
  fs.mkdirSync(path.join(home, '.homebrew'), { recursive: true });
  fs.writeFileSync(path.join(home, '.homebrew', 'trust.json'),
    JSON.stringify({ trustedtaps: ['t/tap'], trustedformulae: [], trustedcasks: [] }));
  assert.ok(brewTrusted(home, {}).taps.has('t/tap'), 'trustedtaps debe leerse');
  const missing = untrustedItems('t/tap', ['a', 'b', 'c'], home, {});
  if (missing !== null) assert.deepEqual(missing, [], 'con el tap confiado no falta nada');
  fs.rmSync(home, { recursive: true, force: true });
});

test('el bloque de gitignore no depende de los agentes de esa corrida', () => {
  // Bug real: `init --agents claude-code` regeneraba el bloque sin las rutas de .agents/
  // y desprotegia 229 archivos que ya estaban ignorados.
  const uno = gitignoreBlock([VENDORS.agents['claude-code']]);
  const todos = gitignoreBlock(Object.values(VENDORS.agents));
  assert.equal(uno, todos, 'el bloque debe ser el mismo sin importar los agentes elegidos');
  for (const d of ['.claude/skills', '.agents/skills', '.opencode/commands'])
    assert.ok(uno.includes(d), `falta cubrir ${d}`);
});

test('/sw:build carga los artefactos de planeacion de BMAD', () => {
  // Hueco real: el spine de arquitectura y el diseño UX existian y el comando no los
  // mencionaba. El SDD rediseñaba desde cero lo ya decidido y revisado.
  for (const lang of ['es', 'en']) {
    const src = fs.readFileSync(path.join(LAYER, 'commands', lang, 'build.md'), 'utf8');
    assert.match(src, /un-specweaver context/, `${lang}: debe descubrir las rutas, no adivinarlas`);
    assert.match(src, /ARCHITECTURE-SPINE/, `${lang}: falta el spine de arquitectura`);
    assert.match(src, /DESIGN\.md/, `${lang}: falta el diseño UX`);
    assert.match(src, lang === 'es' ? /[Vv]inculante/ : /[Bb]inding/, `${lang}: no dice que son vinculantes`);
  }
});

test('/sw:new incluye la fase de UX que produce los UX-DR', () => {
  for (const lang of ['es', 'en']) {
    const src = fs.readFileSync(path.join(LAYER, 'commands', lang, 'new.md'), 'utf8');
    assert.match(src, /bmad-ux/, `${lang}: la fase de UX faltaba en la cadena`);
    assert.match(src, /UX-DR/, `${lang}: debe explicar que produce`);
  }
});





test('/sw:build construye directo contra el spec, sin orquestar el SDD', () => {
  // Decision de diseño: las 10 fases del SDD rehacen lo que BMAD ya hizo antes y mejor.
  // El rigor vive en el spec, no en las ceremonias.
  for (const lang of ['es', 'en']) {
    const src = fs.readFileSync(path.join(LAYER, 'commands', lang, 'build.md'), 'utf8');
    assert.doesNotMatch(src, /\/sdd-/, `${lang}: no debe mandar a ningun comando SDD`);
    assert.doesNotMatch(src, /preflight/i, `${lang}: la ceremonia del SDD ya no aplica`);
    assert.match(src, /#### Scenario:/, `${lang}: los escenarios son los casos de prueba`);
    assert.match(src, /tasks\.md/, `${lang}: tasks.md es el checklist`);
  }
});

test('design.md se escribe solo cuando aplica, no por defecto', () => {
  // La duplicacion que confundia: bmad-ux produce el diseño de producto UNA vez;
  // design.md es tecnico, por change, y OpenSpec lo pide condicional.
  for (const lang of ['es', 'en']) {
    const src = fs.readFileSync(path.join(LAYER, 'commands', lang, 'build.md'), 'utf8');
    assert.match(src, /design\.md/, `${lang}: debe mencionarlo`);
    assert.match(src, lang === 'es' ? /Solo si aplica/ : /Only if it applies/, `${lang}: debe decir que es condicional`);
  }
});

test('la poda de superficie quita comandos pero conserva las skills', () => {
  assert.deepEqual(VENDORS.surface.pruneCommandPrefixes, ['sdd-', 'opsx-', 'bmad-']);
  // Podar el atajo no puede quitar la skill: bmad-prd sigue existiendo como skill,
  // solo deja de aparecer como comando suelto en el palette.
  for (const keep of ['bmad-prd', 'bmad-create-epics-and-stories', 'bmad-ux'])
    assert.ok(!VENDORS.bmad.prune.includes(keep), `${keep} es planeacion: la skill se queda`);
  assert.deepEqual(VENDORS.surface.pruneCommandDirs, ['opsx']);
  // Lo que el usuario instale por su cuenta no se poda: solo se podan los comandos que
  // compiten con /sw:*, y solo de lo que instala este montaje.
  const podadas = [...VENDORS.bmad.prune, ...VENDORS.surface.pruneCommandPrefixes];
  for (const skill of [...VENDORS.gentle.reviewSkills, ...VENDORS.gentle.reviewAgents])
    assert.ok(!podadas.includes(skill), `${skill} no es nuestro: no se poda`);
});

test('bug y change son flujos distintos, no variantes del mismo', () => {
  for (const lang of ['es', 'en']) {
    const bug = fs.readFileSync(path.join(LAYER, 'commands', lang, 'bug.md'), 'utf8');
    const chg = fs.readFileSync(path.join(LAYER, 'commands', lang, 'change.md'), 'utf8');
    // Un defecto NO pasa por control de alcance: lo acordado no cambia.
    assert.match(bug, lang === 'es' ? /[Nn]o toques el PRD/ : /[Dd]o not touch the PRD/, `${lang}/bug`);
    assert.match(bug, lang === 'es' ? /no pasa por control de alcance/i : /does not go through scope control/i, `${lang}/bug`);
    // Un requerimiento SI, y antes de tocar archivos.
    assert.match(chg, lang === 'es' ? /[Cc]ontrol de alcance/ : /[Ss]cope control/, `${lang}/change`);
    // Y ticket no resuelve: enruta.
    const tk = fs.readFileSync(path.join(LAYER, 'commands', lang, 'ticket.md'), 'utf8');
    assert.match(tk, /\/sw:bug/, `${lang}/ticket debe enrutar a bug`);
    assert.match(tk, /\/sw:change/, `${lang}/ticket debe enrutar a change`);
  }
});

test('/sw:new distingue el diseño de producto del tecnico', () => {
  // La confusion real del usuario: bmad-ux pidio diseño y despues openspec tambien.
  for (const lang of ['es', 'en']) {
    const src = fs.readFileSync(path.join(LAYER, 'commands', lang, 'new.md'), 'utf8');
    assert.match(src, /bmad-ux/, `${lang}: debe nombrar el de producto`);
    assert.match(src, /design\.md/, `${lang}: debe nombrar el tecnico`);
    assert.match(src, lang === 'es' ? /una\*\* para todo el proyecto/ : /once\*\* for the whole project/,
      `${lang}: debe decir que el de producto se hace una sola vez`);
  }
});

test('los siguientes pasos apuntan a los comandos, no a rutas ni skills internas', () => {
  for (const lang of ['es', 'en']) {
    const next = t(lang, 'init.next');
    assert.match(next, /\/sw:new/, `${lang}: debe mandar al comando`);
    assert.doesNotMatch(next, /_bmad-output\/epics\.md/, `${lang}: el puente descubre la ruta solo`);
    assert.doesNotMatch(next, /bmad-product-brief/, `${lang}: la skill es maquinaria interna`);
    for (const c of ['/sw:build', '/sw:change', '/sw:bug']) assert.ok(next.includes(c), `${lang}: falta ${c}`);
  }
});

test('un home creado entero por el vendor se ignora completo; uno compartido, por patron', () => {
  // .config/opencode/ lo crea Gentle-AI entero (las skills de OpenCode viven en .agents/skills
  // y sus comandos en .opencode/commands), asi que se ignora completo.
  // .claude/ NO: ahi el usuario guarda sus propias skills y comandos.
  const b = gitignoreBlock([]);
  assert.ok(b.includes('.config/opencode/'), 'el home replicado por workspace debe ignorarse entero');
  assert.ok(!/^\.claude\/$/m.test(b), '.claude/ jamas se ignora entero: ahi vive lo del usuario');
  assert.ok(!/^\.claude\/skills\/$/m.test(b), '.claude/skills/ tampoco');
});

test('la poda de superficie alcanza los comandos del home replicado', () => {
  const root = tmp();
  const targets = STEPS.find((s) => s.id === 'surface').targets(ctxFor(root, ['opencode']));
  assert.ok(targets.some((p) => p.includes(path.join('.config', 'opencode', 'commands'))),
    'los /sdd-* de OpenCode viven en .config/opencode/commands y seguian visibles');
  fs.rmSync(root, { recursive: true, force: true });
});

test('detectAgents no pisa la ruta relativa del agente con la absoluta', () => {
  // Bug real: detectAgents ponia home = /Users/<user>/.config/opencode (absoluta) y la poda
  // construia <proyecto>/Users/<user>/.config/... que no existe. Los tests no lo vieron porque
  // construian el agente desde vendors.json, donde home es relativa. Misma divergencia que
  // ya habia perdido commandStyle.
  for (const a of detectAgents()) {
    assert.ok(!path.isAbsolute(a.home), `${a.id}: home debe ser relativa, llego "${a.home}"`);
    assert.equal(a.home, VENDORS.agents[a.id].home, `${a.id}: home debe coincidir con vendors.json`);
  }
});

test('las rutas de poda caen dentro del proyecto, tambien con agentes detectados', () => {
  const root = tmp();
  const ctx = { root, agents: detectAgents(), platform: 'darwin', lang: 'es', langName: 'Spanish' };
  if (ctx.agents.length) {
    for (const p of STEPS.find((s) => s.id === 'surface').targets(ctx)) {
      assert.ok(p.startsWith(root + path.sep), `sale del proyecto: ${p}`);
      assert.ok(!p.includes(path.join(root, 'Users')), `ruta absoluta anidada: ${p}`);
    }
  }
  fs.rmSync(root, { recursive: true, force: true });
});

// --- preferencias del proyecto -------------------------------------------------

test('las preferencias respetan flag > guardado > pregunta > default', async () => {
  const never = () => { throw new Error('no debio preguntar'); };

  const soloDefaults = await resolvePrefs({ isTTY: false }, never);
  assert.deepEqual(soloDefaults.prefs, DEFAULTS, 'sin TTY usa defaults y no se cuelga');

  // Con las otras dos ya guardadas, no queda nada que preguntar y el flag pisa lo guardado.
  const flagGana = await resolvePrefs(
    { flags: { lang: 'en' }, stored: { lang: 'es' }, isTTY: true },
    never,
  );
  assert.equal(flagGana.prefs.lang, 'en', 'el flag manda sobre lo guardado');

  // Un config.json de 0.1.x/0.2.x traia engramScope y graphify; se ignoran sin romper nada.
  const guardado = await resolvePrefs({ stored: { lang: 'en', engramScope: 'global', graphify: 'off' }, isTTY: true }, never);
  assert.deepEqual(guardado.prefs, { lang: 'en' }, 'reinstalar no vuelve a preguntar');
});

test('solo pregunta lo que falta, no todo de nuevo', async () => {
  let preguntadas = null;
  const r = await resolvePrefs(
    { isTTY: true },
    async (keys) => { preguntadas = keys; return { lang: '2' }; },
  );
  assert.deepEqual(preguntadas, ['lang'], 'lo unico que queda por preguntar');
  assert.equal(r.prefs.lang, 'en');
});

test('las respuestas aceptan formas razonables y caen al default', () => {
  for (const a of ['2', 'en', 'EN', 'English', ' ingles ']) assert.equal(parseAnswer('lang', a, 'es'), 'en', a);
  for (const a of ['1', 'es', 'espanol', '', 'cualquier cosa']) assert.equal(parseAnswer('lang', a, 'es'), 'es', a);
});

test('un valor invalido en un flag se rechaza en vez de aceptarse a medias', () => {
  assert.equal(validateFlag('lang', 'es'), null);
  assert.match(validateFlag('lang', 'fr'), /--lang/);
  assert.equal(validateFlag('lang', undefined), null, 'ausente no es invalido');
  for (const [k, vals] of Object.entries(CHOICES))
    assert.ok(vals.includes(DEFAULTS[k]), `el default de ${k} debe ser una opcion valida`);
});

test('graphify no es una preferencia: ningun comando la consulta ni init la pregunta', () => {
  assert.equal(DEFAULTS.graphify, undefined);
  assert.equal(CHOICES.graphify, undefined);
  for (const lang of ['es', 'en']) {
    for (const f of fs.readdirSync(path.join(LAYER, 'commands', lang))) {
      const src = fs.readFileSync(path.join(LAYER, 'commands', lang, f), 'utf8');
      assert.doesNotMatch(src, /preferences\.graphify/, `${lang}/${f}`);
    }
    const skill = fs.readFileSync(path.join(LAYER, 'skills', 'un-specweaver', `SKILL.${lang}.md`), 'utf8');
    assert.match(skill, lang === 'es' ? /Nunca preguntes estas cosas/ : /Never ask about these/,
      `SKILL.${lang}: las preferencias no se re-preguntan en conversacion`);
  }
});

test('/sw:change consulta la historia del requisito antes de clasificar', () => {
  // Caso real: 150 entradas de memlog, un (override) con el motivo exacto de un descarte, y el
  // comando no lo veia. Reabrir una decision sin saber que existio es lo que esto evita.
  for (const lang of ['es', 'en']) {
    const src = fs.readFileSync(path.join(LAYER, 'commands', lang, 'change.md'), 'utf8');
    assert.match(src, /un-specweaver history/, `${lang}: debe consultar la historia`);
    assert.ok(src.indexOf('un-specweaver history') < src.indexOf(lang === 'es' ? 'Clasifica el requerimiento' : 'Classify the requirement'), `${lang}: antes de clasificar`);
    const skill = fs.readFileSync(path.join(LAYER, 'skills', 'un-specweaver', `SKILL.${lang}.md`), 'utf8');
    assert.match(skill, /memlog/, `SKILL.${lang}: la tabla de fuentes debe nombrar el memlog`);
  }
});

test('los comandos declaran que la memoria es por proyecto y prohiben cruzarla por defecto', () => {
  // El riesgo es el agente leyendo memoria de OTRO proyecto como si fuera de este:
  // una alucinacion con fuente. Se dice en los comandos que guardan y en la skill.
  for (const lang of ['es', 'en']) {
    for (const f of ['build', 'change']) {
      const src = fs.readFileSync(path.join(LAYER, 'commands', lang, `${f}.md`), 'utf8');
      assert.match(src, /\.un-specweaver\/engram/, `${lang}/${f}: debe decir donde vive la memoria`);
      // El modo de fallo real ya no es cruzar proyectos (cada uno tiene su base) sino el
      // plugin global, que ninguna config de proyecto vence.
      assert.match(src, /plugin/i, `${lang}/${f}: debe advertir del plugin global`);
      assert.doesNotMatch(src, /engramScope|all_projects/, `${lang}/${f}: diseño anterior`);
    }
    const skill = fs.readFileSync(path.join(LAYER, 'skills', 'un-specweaver', `SKILL.${lang}.md`), 'utf8');
    assert.match(skill, /\.un-specweaver\/engram/, `SKILL.${lang}: debe decir donde vive la memoria`);
    assert.doesNotMatch(skill, /engramScope/, `SKILL.${lang}`);
  }
});

test('un paso que falla solo detiene a los que dependen de el', async () => {
  // Caso real: Codex 0.133 hizo fallar gentle-config y eso impidio instalar los comandos
  // /sw:*, que no tienen ninguna relacion con Codex. El proyecto quedo sin superficie.
  const root = tmp();
  const orig = console.error; console.error = () => {};
  const results = await runPlan([
    { id: 'a', title: 'A', status: {}, actions: [{ kind: 'exec', cmd: 'node', args: ['-e', 'process.exit(1)'] }] },
    { id: 'b', title: 'B', dependsOn: 'a', status: {}, actions: [{ kind: 'note', text: 'x' }] },
    { id: 'c', title: 'C', status: {}, actions: [{ kind: 'note', text: 'x' }] },
  ], { root, lang: 'es' });
  console.error = orig;

  assert.equal(results.find((r) => r.id === 'a').ok, false, 'a fallo');
  assert.equal(results.find((r) => r.id === 'b').ok, false, 'b depende de a: se omite');
  assert.equal(results.find((r) => r.id === 'c').ok, true, 'c no depende de a: debe correr igual');
  fs.rmSync(root, { recursive: true, force: true });
});

test('los agentes elegidos quedan guardados y no se re-detectan', async () => {
  // Caso real: el usuario dijo dos veces "Claude Code y OpenCode" y la deteccion
  // automatica seguia metiendo Codex, que hacia fallar gentle-config en cada corrida.
  const av = ['claude-code', 'opencode', 'codex'];
  assert.deepEqual(parseAgents('1,2', av), ['claude-code', 'opencode'], 'por numero');
  assert.deepEqual(parseAgents('claude-code,opencode', av), ['claude-code', 'opencode'], 'por nombre');
  assert.deepEqual(parseAgents('1 2', av), ['claude-code', 'opencode'], 'separados por espacio');
  assert.deepEqual(parseAgents('', av), av, 'Enter = todos los detectados');
  assert.deepEqual(parseAgents('basura', av), av, 'entrada invalida no deja el proyecto sin agentes');
  assert.deepEqual(parseAgents('2,2', av), ['opencode'], 'sin duplicados');
});

test('reinstalar respeta los agentes guardados en vez de volver a detectar', () => {
  const root = tmp();
  writeState(root, { preferences: { ...DEFAULTS, agents: ['claude-code'] }, agents: ['claude-code'] });
  const stored = readState(root);
  assert.deepEqual(stored.preferences.agents, ['claude-code'],
    'la eleccion de agentes se recuerda por maquina');
  fs.rmSync(root, { recursive: true, force: true });
});

test('config.json es del proyecto y local.json de la maquina: lo que cambia por compañero no va al repo', () => {
  // Señalado en revision de codigo: un PR traia el config.json con la ruta del binario de
  // engram de OTRA maquina, sus agentes y el resultado de sus pasos. Un diff por compañero.
  const root = tmp();
  writeState(root, {
    installedAt: '2026-09-14T00:00:00Z', preferences: { lang: 'en', agents: ['opencode'] }, pruneExtra: true,
    agents: ['opencode'], vendors: { bmad: 'x' }, optional: { engram: { bin: '/home/carlos/.local/bin/engram' } },
    steps: [{ id: 'bmad', ok: true }],
  });
  const config = JSON.parse(fs.readFileSync(path.join(root, '.un-specweaver', 'config.json'), 'utf8'));
  const local = JSON.parse(fs.readFileSync(path.join(root, '.un-specweaver', 'local.json'), 'utf8'));
  assert.deepEqual(config, { version: 2, preferences: { lang: 'en' }, pruneExtra: true }, 'solo decisiones del proyecto');
  assert.deepEqual(Object.keys(local).sort(), ['agents', 'installedAt', 'optional', 'steps', 'vendors']);
  assert.doesNotMatch(JSON.stringify(config), /carlos|opencode|installedAt/, 'nada de la maquina en el repo');

  // Leer devuelve lo de siempre, fusionado.
  const st = readState(root);
  assert.equal(st.preferences.lang, 'en'); assert.deepEqual(st.preferences.agents, ['opencode']); assert.equal(st.vendors.bmad, 'x');

  // Un config.json de 0.x con todo junto se sigue leyendo; el proximo init lo separa.
  fs.rmSync(path.join(root, '.un-specweaver', 'local.json'));
  fs.writeFileSync(path.join(root, '.un-specweaver', 'config.json'), JSON.stringify({ version: 1, lang: 'es', preferences: { lang: 'es', agents: ['claude-code'] }, agents: ['claude-code'], vendors: { bmad: 'y' } }));
  const old = readState(root);
  assert.equal(old.preferences.lang, 'es'); assert.deepEqual(old.preferences.agents, ['claude-code']); assert.equal(old.vendors.bmad, 'y');

  assert.ok(gitignoreBlock([]).includes('.un-specweaver/local.json'), 'local.json se ignora');
  assert.ok(!gitignoreBlock([]).includes('.un-specweaver/config.json'), 'config.json va al repo');
  fs.rmSync(root, { recursive: true, force: true });
});

test('solo se declaran soportados los agentes probados de punta a punta', () => {
  // Codex se saco: su toolchain desactualizada hacia fallar gentle-config en cada corrida
  // y nunca se probo el flujo completo con el. Soportar a medias es peor que no soportar.
  assert.deepEqual(Object.keys(VENDORS.agents).sort(), ['claude-code', 'opencode']);
  for (const [id, cfg] of Object.entries(VENDORS.agents)) {
    assert.ok(cfg.skills, `${id}: falta dir de skills`);
    assert.ok(cfg.commands, `${id}: falta dir de comandos`);
    assert.ok(cfg.commandStyle, `${id}: falta commandStyle`);
    for (const v of ['bmad', 'openspec', 'gentle'])
      assert.ok(cfg.ids?.[v], `${id}: falta el id para ${v}`);
  }
});

test('el hook del dashboard se agrega al post-commit sin pisar lo que ya habia, y es idempotente', async () => {
  const root = tmp();
  execFileSync('git', ['-C', root, 'init', '-q']);
  const step = STEPS.find((s) => s.id === 'dashboard-hook');
  const hook = path.join(root, '.git', 'hooks', 'post-commit');
  fs.mkdirSync(path.dirname(hook), { recursive: true });
  fs.writeFileSync(hook, '#!/bin/sh\ngraphify update . # de graphify\n');
  assert.equal(step.status(ctxFor(root)).state, 'pending');
  const [w] = step.plan(ctxFor(root));
  await runAction(w, { root, lang: 'es' });
  const c = fs.readFileSync(hook, 'utf8');
  assert.match(c, /graphify update \./, 'lo de graphify sigue');
  assert.match(c, /un-specweaver status --html/);
  assert.ok(fs.statSync(hook).mode & 0o111, 'ejecutable');
  assert.equal(step.status(ctxFor(root)).state, 'ok');
  assert.equal(step.plan(ctxFor(root))[0].content.split('un-specweaver: dashboard').length - 1, 1, 'no se duplica');
  fs.rmSync(root, { recursive: true, force: true });
});

// --- aislamiento: todo lo que produce el metodo, dentro de .un-specweaver ------------------

test('el layout nuevo vive en .un-specweaver, y un proyecto de 0.5.x se sigue leyendo', () => {
  const root = tmp();
  let P = paths(root);
  assert.equal(P.openspec, path.join(root, HOME, 'openspec'), 'por defecto, dentro');
  assert.equal(P.bmadOutRel, path.join(HOME, 'bmad'));
  assert.equal(P.openspecCwd, path.join(root, HOME), 'openspec no busca hacia arriba: cwd es el padre');
  assert.equal(P.legacy, false);

  // Proyecto de 0.5.x: openspec/ y _bmad-output/ en la raiz. Se detectan y se siguen usando
  // hasta que corra `migrate`; actualizar la herramienta no puede romperlos en silencio.
  fs.mkdirSync(path.join(root, 'openspec', 'changes'), { recursive: true });
  fs.mkdirSync(path.join(root, '_bmad-output'), { recursive: true });
  P = paths(root);
  assert.equal(P.legacy, true);
  assert.equal(P.openspec, path.join(root, 'openspec'));
  assert.equal(P.openspecCwd, root);
  assert.equal(P.bmadOut, path.join(root, '_bmad-output'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('BMAD manda su output adentro pero se instala en la raiz: sus skills solo sirven ahi', () => {
  // VERIFICADO: con --directory .un-specweaver las skills caen en .un-specweaver/.claude/skills,
  // donde el agente no las ve. Por eso se muda el output, no la instalacion.
  const root = tmp();
  const args = STEPS.find((s) => s.id === 'bmad').plan(ctxFor(root))[0].args;
  assert.equal(args[args.indexOf('--directory') + 1], root);
  assert.equal(args[args.indexOf('--output-folder') + 1], path.join(HOME, 'bmad'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('OpenSpec se inicializa dentro de .un-specweaver y sin comandos de agente', () => {
  const root = tmp();
  const [a] = STEPS.find((s) => s.id === 'openspec').plan(ctxFor(root));
  assert.deepEqual(a.args.slice(a.args.indexOf('init')), ['init', HOME, '--tools', 'none', '--language', 'Spanish']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('la memoria de Engram queda dentro del proyecto, sin rutas absolutas en el repo', async () => {
  // VERIFICADO contra engram 1.20: ENGRAM_DATA_DIR mueve la base entera y exige ruta absoluta.
  // El wrapper la resuelve solo, asi que lo que se commitea es una ruta relativa.
  const root = tmp();
  const step = STEPS.find((s) => s.id === 'engram-project');
  assert.equal(step.status(ctxFor(root)).state, 'pending');

  const actions = step.plan(ctxFor(root));
  const wrapper = actions.find((a) => a.kind === 'write' && a.file.endsWith(path.join('bin', 'engram')));
  assert.ok(wrapper, 'falta el wrapper');
  assert.equal(wrapper.mode, 0o755, 'tiene que ser ejecutable');
  assert.match(wrapper.content, /ENGRAM_DATA_DIR/);
  assert.match(wrapper.content, /dirname -- "\$0"/, 'resuelve su propia ruta, no una absoluta');
  assert.doesNotMatch(wrapper.content, new RegExp(root), 'nada de esta maquina adentro');

  for (const a of actions.filter((x) => x.kind === 'write')) await runAction(a, { root, lang: 'es' });
  const mcp = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
  assert.equal(mcp.mcpServers.engram.command, `./${path.join(HOME, 'bin', 'engram')}`, 'relativa: Claude Code la resuelve contra el proyecto');
  assert.equal(mcp.mcpServers.engram.command.includes(root), false);
  const oc = JSON.parse(fs.readFileSync(path.join(root, 'opencode.json'), 'utf8'));
  assert.equal(oc.mcp.engram.type, 'local');
  assert.equal(oc.mcp.engram.command[0], mcp.mcpServers.engram.command);
  assert.equal(step.status(ctxFor(root)).state, 'ok');

  // El wrapper de verdad apunta adentro: se ejecuta con un engram falso en el PATH.
  const bin = path.join(root, 'fakebin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'engram'), '#!/bin/sh\necho "$ENGRAM_DATA_DIR"\n');
  fs.chmodSync(path.join(bin, 'engram'), 0o755);
  const out = execFileSync(path.join(root, HOME, 'bin', 'engram'), ['x'], { cwd: os.tmpdir(), env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }).toString().trim();
  assert.equal(out, path.join(root, HOME, 'engram'), 'la memoria queda en el proyecto aunque el cwd sea otro');
  fs.rmSync(root, { recursive: true, force: true });
});

test('otros servidores MCP del usuario sobreviven al registro de la memoria', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { context7: { command: 'npx' } } }));
  const cfg = mcpConfigFor(root, { id: 'claude-code' }, './x');
  const j = JSON.parse(cfg.content);
  assert.ok(j.mcpServers.context7, 'no se pisan');
  assert.ok(j.mcpServers.engram);
  fs.rmSync(root, { recursive: true, force: true });
});

test('el plugin global de Engram se detecta y se avisa: ninguna config de proyecto lo vence', () => {
  const home = tmp();
  assert.equal(globalEngramPlugin(home), false);
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'engram@engram': true } }));
  assert.equal(globalEngramPlugin(home), true);
  for (const lang of ['es', 'en']) assert.match(t(lang, 'step.engram.pluginWarning'), /claude plugin disable engram/);
  fs.rmSync(home, { recursive: true, force: true });
});

test('Engram se instala solo, sin Gentle-AI y sin ejecutar scripts remotos', () => {
  const root = tmp();
  const actions = STEPS.find((s) => s.id === 'engram-bin').plan(ctxFor(root));
  assert.ok(!actions.some((a) => a.kind === 'shell'), 'nada de curl | bash');
  const a = actions[0];
  if (a.kind === 'exec') assert.ok(['brew', 'go'].includes(a.cmd), a.cmd);
  else assert.ok(['note', 'blocked'].includes(a.kind));
  assert.equal(VENDORS.gentle.detectOnly, true, 'Gentle-AI solo se detecta');
  assert.equal(VENDORS.engram.brewFormula, 'engram', 'un solo item que confiar, no tres');
  fs.rmSync(root, { recursive: true, force: true });
});

test('el gitignore ignora la memoria y el wrapper, pero no lo que el equipo comparte', () => {
  const b = gitignoreBlock([]);
  assert.match(b, new RegExp(`^${HOME}/engram/$`, 'm'), 'SQLite binario: no se mergea');
  assert.match(b, new RegExp(`^${HOME}/bin/$`, 'm'));
  assert.ok(!new RegExp(`^${HOME}/$`, 'm').test(b), 'la carpeta entera NO se ignora: los specs son el producto');
  for (const f of ['trace.json', 'config.json', 'openspec', 'bmad']) assert.ok(!b.includes(`${HOME}/${f}`), f);
});
