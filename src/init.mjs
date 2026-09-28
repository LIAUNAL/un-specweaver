import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { VENDORS, preflight, detectAgents, detectEngram, isGitRepo, writeState, readState, which } from './env.mjs';
import { buildPlan } from './steps.mjs';
import { unarchivedDone } from './close.mjs';
import { runPlan } from './run.mjs';
import { t, LANGS } from './i18n.mjs';
import { resolvePrefs, promptPrefs, promptAgents, validateFlag, DEFAULTS } from './prefs.mjs';

export { resolvePrefs, promptPrefs } from './prefs.mjs';

// Lo que NO es un paso de init pero el flujo necesita saber: Engram lo instala Gentle-AI y
// puede quedar bloqueado por confianza de Homebrew. Se reporta aparte, con su remedio.
function reportOptional(root, lang) {
  console.log(t(lang, 'doctor.optional'));
  const line = (key, ok, detail) =>
    console.log(`  ${t(lang, ok ? 'ok' : 'warn')}  ${t(lang, `${key}.name`).padEnd(14)} ${detail}`);

  // La memoria vive DENTRO del proyecto: borrar .un-specweaver la borra, y ningun otro
  // proyecto la ve. Lo que no podemos vencer es el plugin global, asi que se dice.
  const e = detectEngram(root);
  line('engram', e.available && e.isolated, e.available
    ? (e.isolated ? t(lang, 'engram.isolated', e.dir) : t(lang, 'engram.notIsolated'))
    : t(lang, 'engram.absent'));
  if (e.globalPlugin) console.log(`  ${t(lang, 'warn')}  ${''.padEnd(14)} ${t(lang, 'engram.plugin')}`);

  return { engram: e };
}

export async function init(opts) {
  const root = path.resolve(opts.dir || process.cwd());
  fs.mkdirSync(root, { recursive: true });

  const prior = readState(root);
  const flags = { lang: opts.lang };
  for (const [k, v] of Object.entries(flags)) {
    const err = validateFlag(k, v);
    if (err) { console.error(err); return 2; }
  }
  const { prefs } = await resolvePrefs(
    { flags, stored: prior?.preferences || { lang: prior?.lang }, isTTY: process.stdin.isTTY },
    (keys) => promptPrefs(keys, flags.lang || prior?.preferences?.lang || DEFAULTS.lang),
  );
  const lang = prefs.lang;

  console.log(t(lang, 'init.header', root));

  const pf = preflight(lang);
  for (const c of pf.checks) console.log(`  ${t(lang, c.ok ? 'ok' : c.fatal ? 'fail' : 'warn')}  ${c.name.padEnd(22)} ${c.detail}`);
  if (!pf.ok) { console.error(t(lang, 'init.preflightFailed')); return 1; }
  if (!isGitRepo(root)) console.log(`  ${t(lang, 'warn')}  ${t(lang, 'check.git').padEnd(22)} ${t(lang, 'init.notGitRepo')}`);

  // Precedencia igual que las demas preferencias: flag > guardado > pregunta > detectado.
  // Re-detectar cada vez volvia a meter agentes que el usuario ya habia descartado.
  const flagAgents = opts.agents ? opts.agents.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const detected = detectAgents();
  let ids = flagAgents || prior?.preferences?.agents || null;
  let agentSource = flagAgents ? 'init.forced' : (ids ? 'prefs.agentsStored' : 'init.autodetected');

  if (!ids) {
    if (!detected.length) { console.error(t(lang, 'init.noAgents', Object.keys(VENDORS.agents).join(', '))); return 1; }
    ids = process.stdin.isTTY ? await promptAgents(detected, lang) : detected.map((a) => a.id);
    if (process.stdin.isTTY && detected.length > 1) agentSource = 'prefs.agentsStored';
  }

  const agents = ids.map((id) => {
    const cfg = VENDORS.agents[id];
    if (!cfg) { console.error(t(lang, 'init.unknownAgent', id, Object.keys(VENDORS.agents).join(', '))); process.exit(2); }
    return { ...cfg, id };
  });
  if (!agents.length) { console.error(t(lang, 'init.noAgents', Object.keys(VENDORS.agents).join(', '))); return 1; }
  prefs.agents = agents.map((a) => a.id);

  const agentLabel = agentSource === 'prefs.agentsStored'
    ? t(lang, 'prefs.agentsStored', agents.map((a) => a.id).join(', '))
    : `${agents.map((a) => a.id).join(', ')} ${t(lang, agentSource)}`;
  console.log(`\n  ${t(lang, 'init.agents').padEnd(9)}${agentLabel}`);
  console.log(`  ${t(lang, 'init.language').padEnd(9)}${lang} (${t(lang, 'lang.name')})`);

  const ctx = {
    root, agents, lang, prefs, platform: pf.platform, langName: t(lang, 'lang.name'),
    force: !!opts.force, pruneExtra: !!opts.pruneExtra, keepVendorCommands: !!opts.keepVendorCommands, yes: !!opts.yes,
    dryRun: !!opts.dryRun, keepGoing: !!opts.keepGoing,
  };
  const plan = buildPlan(ctx, { only: opts.only, skip: opts.skip });

  if (opts.dryRun) console.log(t(lang, 'init.dryRun'));
  const results = await runPlan(plan, ctx);

  const optional = opts.dryRun ? { engram: detectEngram(root) } : reportOptional(root, lang);

  if (!opts.dryRun) {
    writeState(root, {
      installedAt: new Date().toISOString(),
      preferences: prefs,
      pruneExtra: !!opts.pruneExtra,
      agents: agents.map((a) => a.id),
      // Se registra lo que quedo instalado de verdad, no lo que se pretendia instalar:
      // un estado optimista hace que doctor reporte "ok" sobre algo que no existe.
      vendors: {
        bmad: fs.existsSync(path.join(root, '_bmad')) ? `${VENDORS.bmad.npm}@${VENDORS.bmad.version}` : null,
        openspec: fs.existsSync(path.join(root, 'openspec')) ? `${VENDORS.openspec.npm}@${VENDORS.openspec.version}` : null,
        engram: which(VENDORS.engram.bin) || null,
        graphify: which(VENDORS.graphify.bin) ? `${VENDORS.graphify.pip}@${VENDORS.graphify.version}` : null,
      },
      optional,
      pruned: [...VENDORS.bmad.prune, ...(opts.pruneExtra ? VENDORS.bmad.pruneOptional : [])],
      steps: results.map((r) => ({ id: r.id, ok: r.ok, error: r.error || null })),
    });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? t(lang, 'init.failed', failed.length, failed.map((r) => r.id).join(', ')) : t(lang, 'init.done'));
  if (!failed.length && !opts.dryRun) console.log(t(lang, 'init.next'));
  return failed.length ? 1 : 0;
}

export function doctor(opts) {
  const root = path.resolve(opts.dir || process.cwd());
  const state = readState(root);
  const prefs = { ...DEFAULTS, ...(state?.preferences || {}), ...(state?.lang ? { lang: state.lang } : {}) };
  const lang = opts.lang || prefs.lang;

  console.log(t(lang, 'doctor.header', root));

  const pf = preflight(lang);
  for (const c of pf.checks) console.log(`  ${t(lang, c.ok ? 'ok' : c.fatal ? 'fail' : 'warn')}  ${c.name.padEnd(24)} ${c.detail}`);

  console.log(state ? t(lang, 'doctor.installed', state.installedAt, state.agents.join(', ')) : t(lang, 'doctor.noState'));

  const agents = state ? state.agents.map((id) => ({ ...VENDORS.agents[id], id })).filter((a) => a.skills) : detectAgents();
  const ctx = { root, agents, lang, prefs, platform: pf.platform, langName: t(lang, 'lang.name') };

  console.log(t(lang, 'doctor.steps'));
  let blockingPlan = 0, pendingOther = 0;
  for (const step of buildPlan(ctx)) {
    const isPending = step.status.state === 'pending';
    if (isPending) (step.blocks === 'plan' ? blockingPlan++ : pendingOther++);
    const mark = t(lang, step.status.state === 'ok' ? 'ok' : step.status.state === 'skip' ? 'skip' : 'missing');
    // Un paso pendiente sin decir QUE bloquea se lee como bloqueo total: es lo que hacia
    // que un agente se detuviera por gentle-config antes de siquiera planear.
    const why = isPending ? `  \u2014 ${t(lang, `blocks.${step.blocks}`)}` : '';
    console.log(`  ${mark}  ${step.id.padEnd(14)} ${step.status.detail}${why}`);
  }

  if (state) {
    console.log(t(lang, 'doctor.vendors'));
    const now = { bmad: `${VENDORS.bmad.npm}@${VENDORS.bmad.version}`, openspec: `${VENDORS.openspec.npm}@${VENDORS.openspec.version}`, engram: VENDORS.engram.bin, graphify: `${VENDORS.graphify.pip}@${VENDORS.graphify.version}` };
    const present = { bmad: fs.existsSync(path.join(root, '_bmad')), openspec: fs.existsSync(path.join(root, 'openspec')), engram: !!which(VENDORS.engram.bin), graphify: !!which(VENDORS.graphify.bin) };
    for (const [k, v] of Object.entries(now)) {
      const had = state.vendors?.[k];
      const mark = !present[k] ? t(lang, 'missing') : had === v ? t(lang, 'ok') : t(lang, 'drift');
      const actual = !present[k] ? t(lang, 'doctor.notInstalled') : (had || t(lang, 'doctor.unknownVersion'));
      console.log(`  ${mark}  ${k.padEnd(14)} ${t(lang, 'doctor.vendorLine', actual, v)}`);
    }
  }

  reportOptional(root, lang);

  // Terminado no es cerrado. Sin archive no hay linea base y /sw:change no mide alcance.
  const pending = unarchivedDone(root);
  if (pending) console.log(t(lang, 'doctor.unarchived', pending));

  console.log(
    blockingPlan ? t(lang, 'doctor.pendingPlan', blockingPlan)
    : pendingOther ? t(lang, 'doctor.pendingBuildOnly', pendingOther)
    : t(lang, 'doctor.allGood'));
  return 0;
}
