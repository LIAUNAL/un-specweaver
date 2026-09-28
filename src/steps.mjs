// Cada paso separa PLAN (puro, testeable, imprimible con --dry-run) de EJECUCION.
// Sin esa separacion, --dry-run seria una mentira mantenida a mano.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { VENDORS, which, vendorIds, isGitRepo, untrustedItems, globalEngramPlugin,
         detectGraphify, GRAPHIFY_IGNORE_START, GRAPHIFY_IGNORE_END } from './env.mjs';
import { t } from './i18n.mjs';
import { paths, HOME, rel } from './paths.mjs';

const LAYER = new URL('./layer/', import.meta.url);
const readAsset = (rel) => fs.readFileSync(new URL(rel, LAYER), 'utf8');
const listAssets = (rel) => fs.readdirSync(new URL(rel, LAYER)).filter((f) => f.endsWith('.md')).sort();

export const NAMESPACE = 'sw';

// Frontmatter minimo: clave: valor por linea, sin anidamiento. Suficiente para
// comandos y evita meter una dependencia de YAML en un paquete que no tiene ninguna.
function splitFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: md };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1');
  }
  return { meta, body: m[2] };
}

const yamlStr = (v) => `"${String(v).replace(/"/g, '\\"')}"`;

// Cada agente nombra y ubica los comandos distinto. Verificado contra lo que
// OpenSpec instala: Claude usa .claude/commands/<ns>/<n>.md -> /ns:n con frontmatter
// name/description/allowed-tools; OpenCode usa .opencode/commands/<ns>-<n>.md -> /ns-n
// con solo description.
export function renderCommand(style, meta, body) {
  // El cuerpo es unico para los dos agentes, pero las referencias cruzadas entre comandos
  // tienen que usar la sintaxis del agente donde se leen: /sw:change en Claude, /sw-change
  // en OpenCode. Sin esto el comando le dice al usuario que invoque algo que no existe ahi.
  if (style !== 'namespaced') {
    body = body.replace(new RegExp(`/${NAMESPACE}:([a-z][a-z0-9-]*)`, 'g'), `/${NAMESPACE}-$1`);
  }
  if (style === 'namespaced') {
    const lines = ['---', `name: ${yamlStr(meta.title || meta.name)}`, `description: ${yamlStr(meta.description || '')}`];
    if (meta['allowed-tools']) lines.push(`allowed-tools: ${meta['allowed-tools']}`);
    lines.push('---', '');
    return lines.join('\n') + body;
  }
  return ['---', `description: ${yamlStr(meta.description || '')}`, '---', ''].join('\n') + body;
}

export function commandPath(agent, name) {
  return agent.commandStyle === 'namespaced'
    ? path.join(agent.commands, NAMESPACE, `${name}.md`)
    : path.join(agent.commands, `${NAMESPACE}-${name}.md`);
}

const exec  = (cmd, args, why, opts = {}) => ({ kind: 'exec', cmd, args, why, ...opts });
const write = (file, content, why, opts = {}) => ({ kind: 'write', file, content, why, ...opts });
const rm    = (target, why) => ({ kind: 'rm', target, why });
const note  = (text) => ({ kind: 'note', text });
// Un prerequisito que solo el usuario puede autorizar. Falla el paso a proposito:
// reportar "listo" sobre algo que no ocurrio seria mentir.
const blocked = (title, why, fix) => ({ kind: 'blocked', title, why, fix });

// Transforma un archivo que una accion ANTERIOR del mismo paso crea (no existe al planear).
// `apply(content) -> content`. Si el archivo no existe o no cambia, no escribe nada.
const patch = (file, apply, why) => ({ kind: 'patch', file, apply, why });

// `curl | sh` es la via oficial de Gentle-AI, pero descarga y ejecuta codigo remoto.
// Se marca `consent: true` para que el runner nunca lo corra sin autorizacion explicita.
const shell = (script, why) => ({ kind: 'shell', script, why, consent: true });

const skillDirs   = (agents) => [...new Set(agents.map((a) => a.skills))];

// Gentle-AI con --scope workspace replica el directorio del agente DENTRO del proyecto:
// OpenCode termina en <proyecto>/.config/opencode/ con sus propios commands y skills.
// Descubierto en una instalacion limpia: 60 archivos sin ignorar y los /sdd-* seguian
// visibles en OpenCode porque la poda solo miraba .opencode/commands.
const agentHomes = (agents) => [...new Set(agents.map((a) => a.home).filter(Boolean))];
const commandDirs = (agents) => [...new Set([
  ...agents.map((a) => a.commands).filter(Boolean),
  ...agentHomes(agents).map((h) => path.join(h, 'commands')),
])];

// El dashboard se regenera con cada commit, como el grafo de graphify: una vista que solo se
// actualiza cuando alguien se acuerda es una vista vieja.
export const DASHBOARD_HOOK_MARK = '# un-specweaver: dashboard';
export const DASHBOARD_HOOK = `${DASHBOARD_HOOK_MARK}
[ -f .un-specweaver/dashboard.html ] && (npx --yes un-specweaver status --html >/dev/null 2>&1 || true)`;
export function dashboardHookOk(root) {
  try { return fs.readFileSync(path.join(root, gitDir(root), 'hooks', 'post-commit'), 'utf8').includes(DASHBOARD_HOOK_MARK); } catch { return false; }
}
function gitDir(root) {
  try { return execFileSync('git', ['-C', root, 'rev-parse', '--git-dir'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return '.git'; }
}

export const GITIGNORE_START = '# >>> un-specweaver >>>';
export const GITIGNORE_END   = '# <<< un-specweaver <<<';

// Lo que se ignora es SOLO lo regenerable con `un-specweaver init`, por patron exacto.
// Ignorar `.claude/` entero escondería las skills y comandos propios del usuario, que no
// son nuestros para ocultar.
export function gitignoreBlock(_agentsIgnored) {
  // Se cubren los directorios de TODOS los agentes conocidos, no solo los seleccionados.
  // Correr `init --agents claude-code` regeneraba el bloque sin las rutas de .agents/ y
  // desprotegia 229 archivos que ya estaban ignorados. Ignorar la ruta de un agente que
  // no esta instalado no cuesta nada; desprotegerla si.
  const agents = Object.values(VENDORS.agents);
  const lines = [GITIGNORE_START, '# Regenerable con `un-specweaver init` — no va al repo.', '',
                 'node_modules/', '_bmad/', '**/.openspec-target',
                 // Memoria del proyecto: SQLite binario, no mergeable. Se comparte, si se
                 // quiere, con `un-specweaver memory share` (formato de git de engram).
                 `${HOME}/engram/`,
                 // Wrapper generado por init: se regenera, y su contenido depende de la maquina.
                 `${HOME}/bin/`,
                 // AST puro, regenerable en segundos; el hook lo reescribe en cada commit.
                 `${VENDORS.graphify.outDir}/`,
                 // Vista derivada de `status --html`: se regenera, no se versiona.
                 `${HOME}/dashboard.html`,
                 // Estado de ESTA maquina (agentes, rutas, pasos): un diff por compañero si se commitea.
                 `${HOME}/local.json`,
                 ''];
  // Cada vendor escribe en sitios distintos. OpenSpec ademas crea <dir-del-agente>/skills/,
  // que no aparece en la config porque BMAD manda las skills de OpenCode a .agents/skills.
  // Se deriva del directorio propio del agente para no dejar esa ruta fuera.
  const siblings = agents.flatMap((a) => (a.commands ? [path.join(path.dirname(a.commands), 'skills')] : []));
  const dirs = [...new Set([...agents.flatMap((a) => [a.skills, a.commands].filter(Boolean)), ...siblings])].sort();
  for (const d of dirs) {
    if (d.endsWith('skills')) {
      // Solo lo que ESTE montaje genera. Lo que instale el usuario por su cuenta (incluido
      // Gentle-AI, que ya no instalamos) es suyo y decide el si lo versiona.
      lines.push(`${d}/bmad-*/`, `${d}/openspec-*/`, `${d}/un-specweaver/`, `${d}/graphify/`);
    } else {
      lines.push(`${d}/${NAMESPACE}/`, `${d}/${NAMESPACE}-*.md`, `${d}/opsx/`, `${d}/opsx-*.md`, `${d}/bmad-*.md`);
    }
  }
  const homes = [...new Set([
    ...agents.map((a) => (a.commands ? path.dirname(a.commands) : null)).filter(Boolean),
    ...agentHomes(agents),
  ])].sort();
  // Un home donde el usuario tambien guarda lo suyo (.claude, que contiene sus skills y
  // comandos) se ignora por patron. Un home que Gentle-AI creo entero (.config/opencode,
  // que no es donde viven las skills ni los comandos de OpenCode) se puede ignorar completo.
  const sharedWithUser = new Set(agents.flatMap((a) => [a.skills, a.commands].filter(Boolean).map((d) => path.dirname(d))));
  for (const h of homes) if (!sharedWithUser.has(h)) lines.push(`${h}/`);

  lines.push('', `# Al repo SI van: ${HOME}/ (specs, planeacion, trazabilidad, config), docs/, ${VENDORS.graphify.ignoreFile}`, GITIGNORE_END);
  return lines.join('\n') + '\n';
}

// El grafo es SOLO de codigo. Los docs tienen otro dueno (PRD, specs, Engram) y duplicarlos
// en el grafo es como las capas empiezan a contradecirse. Ademas /sw:adopt necesita un testigo
// que no haya leido la arquitectura declarada. Bloque marcado, como el de .gitignore.
export function graphifyIgnoreBlock() {
  return [GRAPHIFY_IGNORE_START,
          '# El grafo de graphify es de CODIGO. Los docs tienen otro dueno: PRD, specs, Engram.',
          ...VENDORS.graphify.ignore,
          GRAPHIFY_IGNORE_END].join('\n') + '\n';
}

// graphify registra hooks PreToolUse en .claude/settings.json que dicen "MANDATORY: consulta el
// grafo antes de leer/grepear". Utiles para codigo; ruido para docs: el hook de Read|Glob tambien
// dispara sobre .md/.txt/.rst, y el PRD, los specs y la memoria NO estan en el grafo a proposito.
// Se acota el hook a extensiones de codigo y se excluyen las carpetas de docs del metodo. Si una
// version futura cambia el texto del hook, no se toca: mejor un hook ruidoso que uno roto.
export function scopeGraphifyHooks(json) {
  let j;
  try { j = JSON.parse(json); } catch { return json; }
  let changed = false;
  for (const entry of j?.hooks?.PreToolUse || []) {
    if (!/Read|Glob/.test(entry.matcher || '')) continue;
    for (const h of entry.hooks || []) {
      if (typeof h.command !== 'string') continue;
      const before = h.command;
      h.command = h.command
        .replace(/,'\.md','\.rst','\.txt','\.mdx'/, '')
        .replace("'graphify-out/' not in s", "not any(p in s for p in ('graphify-out/','_bmad/','_bmad-output/','openspec/','docs/','.un-specweaver/','.engram/'))");
      if (h.command !== before) changed = true;
    }
  }
  return changed ? JSON.stringify(j, null, 2) + '\n' : json;
}

function mergeMarkedBlock(current, block, start, end) {
  const without = current.includes(start) ? current.replace(new RegExp(`${start}[\\s\\S]*?${end}\\n?`), '') : current;
  return without.trimEnd() ? `${without.trimEnd()}\n\n${block}` : block;
}

// Wrapper que fija la memoria al proyecto. Resuelve su propia ruta: no depende del cwd desde
// el que arranque el agente, ni lleva rutas absolutas de una maquina.
export const ENGRAM_WRAPPER = `#!/bin/sh
# Generado por un-specweaver. La memoria de Engram de ESTE proyecto vive junto a este script.
# Regenerable con \`npx un-specweaver init\`; no lo edites a mano.
set -e
here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENGRAM_DATA_DIR="$here/engram"
export ENGRAM_DATA_DIR
mkdir -p "$ENGRAM_DATA_DIR"
exec engram "$@"
`;

// Cada agente declara sus servidores MCP en su propio archivo y con su propia forma.
// VERIFICADO en la documentacion de cada uno: Claude Code resuelve un `command` relativo
// contra la raiz del proyecto; OpenCode fusiona el config del proyecto sobre el global.
export function mcpConfigFor(root, agent, relBin) {
  const merge = (file, apply) => {
    let j = {};
    try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* nuevo */ }
    apply(j);
    return { file, content: JSON.stringify(j, null, 2) + '\n' };
  };
  if (agent.id === 'claude-code') {
    return merge(path.join(root, '.mcp.json'), (j) => {
      j.mcpServers = j.mcpServers || {};
      // Mismo nombre que el servidor de usuario a proposito: el de proyecto gana.
      j.mcpServers.engram = { command: relBin, args: ['mcp', '--tools=agent'] };
    });
  }
  if (agent.id === 'opencode') {
    return merge(path.join(root, 'opencode.json'), (j) => {
      j['$schema'] = j['$schema'] || 'https://opencode.ai/config.json';
      j.mcp = j.mcp || {};
      j.mcp.engram = { type: 'local', command: [relBin, 'mcp', '--tools=agent'], enabled: true };
    });
  }
  return null;
}

// Que le falta al aislamiento de memoria: el wrapper y la config de cada agente.
export function engramIsolation(root, agents) {
  const P = paths(root);
  const missing = [];
  if (!fs.existsSync(P.engramBin)) missing.push(P.engramBin);
  for (const a of agents) {
    const cfg = mcpConfigFor(root, a, 'x');
    if (!cfg) continue;
    try {
      const j = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
      const cmd = j.mcpServers?.engram?.command || j.mcp?.engram?.command?.[0];
      if (!cmd || !String(cmd).includes(HOME)) missing.push(cfg.file);
    } catch { missing.push(cfg.file); }
  }
  return { missing, legacyGlobalServer: false };
}

export const STEPS = [
  {
    id: 'gitignore',
    blocks: 'none',
    title: 'gitignore',
    titleKey: 'step.gitignore.title',
    status(ctx) {
      if (!isGitRepo(ctx.root)) return { state: 'skip', detail: t(ctx.lang, 'step.gitignore.noGit') };
      const f = path.join(ctx.root, '.gitignore');
      const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
      return cur.includes(GITIGNORE_START)
        ? { state: 'ok', detail: t(ctx.lang, 'step.gitignore.ok') }
        : { state: 'pending', detail: t(ctx.lang, fs.existsSync(f) ? 'step.gitignore.append' : 'step.gitignore.create') };
    },
    plan(ctx) {
      const f = path.join(ctx.root, '.gitignore');
      const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
      const block = gitignoreBlock(ctx.agents);
      // Se preserva lo que el usuario ya tenia; el bloque propio se reemplaza entero.
      const without = cur.includes(GITIGNORE_START)
        ? cur.replace(new RegExp(`${GITIGNORE_START}[\\s\\S]*?${GITIGNORE_END}\\n?`), '')
        : cur;
      const content = without.trimEnd() ? `${without.trimEnd()}\n\n${block}` : block;
      return [write(f, content, t(ctx.lang, 'step.gitignore.why', '~400'))];
    },
  },

  {
    id: 'bmad',
    blocks: 'plan',
    titleKey: 'step.bmad.title',
    status(ctx) {
      const dir = path.join(ctx.root, '_bmad');
      return fs.existsSync(dir)
        ? { state: 'ok', detail: t(ctx.lang, 'step.bmad.ok') }
        : { state: 'pending', detail: `npm ${VENDORS.bmad.npm}@${VENDORS.bmad.version}` };
    },
    plan(ctx) {
      const v = VENDORS.bmad;
      // --directory sigue siendo la raiz a proposito: BMAD instala sus skills en
      // <directory>/.claude/skills, y el agente SOLO lee las de la raiz del proyecto
      // (verificado: con --directory .un-specweaver quedan donde nadie las ve).
      // Lo que si se muda es el output, que es lo que el metodo produce.
      const args = [
        '--yes', `${v.npm}@${v.version}`, 'install', '--yes',
        '--directory', ctx.root,
        '--modules', v.modules,
        '--tools', vendorIds(ctx.agents, 'bmad'),
        '--output-folder', paths(ctx.root).bmadOutRel,
        '--communication-language', ctx.langName,
        '--document-output-language', ctx.langName,
        // Sin esto, --yes instala shims deprecados que reenvian a skills que este
        // montaje poda; quedarian apuntando al vacio.
        ...(v.noShims ? ['--no-shims'] : []),
      ];
      return [exec('npx', args, t(ctx.lang, 'step.bmad.why', v.version))];
    },
  },

  {
    id: 'bmad-prune',
    blocks: 'plan',
    dependsOn: 'bmad',
    titleKey: 'step.bmad-prune.title',
    status(ctx) {
      // Sin BMAD instalado no hay nada en disco que podar, pero eso no es "ya podado":
      // el paso corre despues de la instalacion. Decir lo contrario haria mentir al dry-run.
      if (!fs.existsSync(path.join(ctx.root, '_bmad'))) return { state: 'pending', detail: t(ctx.lang, 'step.bmad-prune.after') };
      const present = this.targets(ctx).filter((t) => fs.existsSync(t));
      return present.length
        ? { state: 'pending', detail: t(ctx.lang, 'step.bmad-prune.pending', present.length) }
        : { state: 'ok', detail: t(ctx.lang, 'step.bmad-prune.ok') };
    },
    targets(ctx) {
      const list = [...VENDORS.bmad.prune, ...(ctx.pruneExtra ? VENDORS.bmad.pruneOptional : [])];
      return [
        // BMAD instala cada skill dos veces: el directorio y un comando .md por agente.
        // Podar solo el directorio deja los constructores invocables desde OpenCode.
        ...skillDirs(ctx.agents).flatMap((d) => list.map((s) => path.join(ctx.root, d, s))),
        ...commandDirs(ctx.agents).flatMap((d) => list.map((s) => path.join(ctx.root, d, `${s}.md`))),
      ];
    },
    plan(ctx) {
      const all = this.targets(ctx);
      const present = all.filter((t) => fs.existsSync(t));
      const targets = present.length ? present : all;      // aun no instalado: se planean todos
      return [
        note(VENDORS.bmad.pruneReason),
        ...(present.length ? [] : [note(t(ctx.lang, 'step.bmad-prune.willRemove'))]),
        ...targets.map((target) => rm(target, t(ctx.lang, 'step.bmad-prune.why'))),
      ];
    },
  },

  {
    id: 'openspec',
    blocks: 'plan',
    titleKey: 'step.openspec.title',
    status(ctx) {
      const P = paths(ctx.root);
      if (!fs.existsSync(P.openspec)) return { state: 'pending', detail: `npm ${VENDORS.openspec.npm}@${VENDORS.openspec.version}` };
      return { state: 'ok', detail: t(ctx.lang, P.legacy ? 'step.openspec.legacy' : 'step.openspec.ok') };
    },
    plan(ctx) {
      const v = VENDORS.openspec;
      // Dentro de .un-specweaver. OpenSpec no busca hacia arriba, asi que sus comandos se
      // corren con cwd = esa carpeta; el flujo nunca los invoca a mano (los envuelve el CLI).
      // --tools none: la superficie del agente son los /sw:*, no los comandos de OpenSpec,
      // que ademas se podaban despues.
      return [exec('npx', [
        '--yes', `${v.npm}@${v.version}`, 'init', HOME,
        '--tools', 'none',
        '--language', ctx.langName,
      ], t(ctx.lang, 'step.openspec.why'))];
    },
  },

  {
    id: 'engram-bin',
    blocks: 'build',
    titleKey: 'step.engram-bin.title',
    status(ctx) {
      const bin = which(VENDORS.engram.bin);
      return bin ? { state: 'ok', detail: bin } : { state: 'pending', detail: t(ctx.lang, 'step.engram-bin.missing') };
    },
    plan(ctx) {
      const v = VENDORS.engram;
      if (which(v.bin)) return [note(t(ctx.lang, 'step.engram-bin.already', which(v.bin)))];
      // Homebrew sirve en macOS y Linux (documentado por engram). La alternativa oficial sin
      // brew es `go install`. No hay `curl | bash`: no hace falta ejecutar codigo remoto.
      if (which('brew')) {
        const missing = untrustedItems(v.brewTap, [v.brewFormula]);
        if (missing && missing.length) {
          const cmds = missing.map((m) => `       brew trust --${m.kind} ${m.name}`).join('\n');
          return [blocked(
            t(ctx.lang, 'step.engram-bin.untrusted', missing.map((m) => `${m.name} (${m.kind})`).join(', ')),
            t(ctx.lang, 'step.engram-bin.untrustedWhy'),
            t(ctx.lang, 'step.engram-bin.untrustedFix', cmds),
          )];
        }
        return [exec('brew', ['install', `${v.brewTap}/${v.brewFormula}`], t(ctx.lang, 'step.engram-bin.brew'))];
      }
      if (which('go')) return [exec('go', ['install', v.goPackage], t(ctx.lang, 'step.engram-bin.go'))];
      return [blocked(t(ctx.lang, 'step.engram-bin.noInstaller'), t(ctx.lang, 'step.engram-bin.noInstallerWhy'), t(ctx.lang, 'step.engram-bin.noInstallerFix'))];
    },
  },

  {
    id: 'engram-project',
    blocks: 'build',
    // Sin dependsOn: lo que escribe no necesita el binario, y asi un fallo de instalacion no
    // deja el proyecto sin su configuracion de memoria.
    titleKey: 'step.engram.title',
    status(ctx) {
      const st = engramIsolation(ctx.root, ctx.agents);
      const missing = st.missing.map((m) => rel(ctx.root, m));
      if (st.legacyGlobalServer) return { state: 'pending', detail: t(ctx.lang, 'step.engram.legacy') };
      return missing.length
        ? { state: 'pending', detail: t(ctx.lang, 'step.engram.pending', missing.join(', ')) }
        : { state: 'ok', detail: t(ctx.lang, 'step.engram.ok', rel(ctx.root, paths(ctx.root).engram)) };
    },
    plan(ctx) {
      // VERIFICADO contra engram 1.20: ENGRAM_DATA_DIR mueve la base entera al proyecto, y
      // exige ruta ABSOLUTA. Una ruta absoluta en un archivo que va al repo es de una maquina,
      // asi que el que la resuelve es este wrapper: averigua su propia ubicacion y exporta la
      // variable. Los agentes lo invocan por ruta relativa, que si es portable.
      const P = paths(ctx.root);
      const actions = [
        note(t(ctx.lang, 'step.engram.isolation')),
        write(P.engramBin, ENGRAM_WRAPPER, t(ctx.lang, 'step.engram.wrapper'), { mode: 0o755 }),
      ];

      const relBin = `./${rel(ctx.root, P.engramBin)}`;
      for (const agent of ctx.agents) {
        const cfg = mcpConfigFor(ctx.root, agent, relBin);
        if (cfg) actions.push(write(cfg.file, cfg.content, t(ctx.lang, 'step.engram.mcp', agent.id)));
      }
      // El plugin global de Engram (si esta) vive en otro namespace y NINGUNA configuracion de
      // proyecto lo vence: sus herramientas escriben en ~/.engram. Se avisa, no se toca.
      if (globalEngramPlugin()) actions.push(note(t(ctx.lang, 'step.engram.pluginWarning')));
      return actions;
    },
  },

  {
    id: 'graphify-bin',
    blocks: 'build',
    titleKey: 'step.graphify-bin.title',
    status(ctx) {
      const bin = which(VENDORS.graphify.bin);
      return bin ? { state: 'ok', detail: bin } : { state: 'pending', detail: t(ctx.lang, 'step.graphify-bin.missing') };
    },
    plan(ctx) {
      const v = VENDORS.graphify;
      if (which(v.bin)) return [note(t(ctx.lang, 'step.graphify-bin.already', v.bin))];
      // Herramienta Python. uv y pipx la aislan en su propio entorno; pip sobre el python del
      // sistema no. Sin ninguno de los dos, se pide (no se instala un gestor de paquetes a nadie).
      if (which('uv'))   return [exec('uv',   ['tool', 'install', `${v.pip}==${v.version}`], t(ctx.lang, 'step.graphify-bin.why', 'uv'))];
      if (which('pipx')) return [exec('pipx', ['install', `${v.pip}==${v.version}`], t(ctx.lang, 'step.graphify-bin.why', 'pipx'))];
      return [blocked(t(ctx.lang, 'step.graphify-bin.noInstaller'), t(ctx.lang, 'step.graphify-bin.noInstallerWhy'), t(ctx.lang, 'step.graphify-bin.noInstallerFix', ctx.platform))];
    },
  },

  {
    id: 'graphify',
    blocks: 'build',
    dependsOn: 'graphify-bin',
    titleKey: 'step.graphify.title',
    status(ctx) {
      if (!which(VENDORS.graphify.bin)) return { state: 'pending', detail: t(ctx.lang, 'step.graphify.after') };
      const g = detectGraphify(ctx.root, ctx.agents);
      const missing = [];
      if (!g.ignore) missing.push(VENDORS.graphify.ignoreFile);
      for (const sk of g.skills) if (!sk.present) missing.push(`${sk.path} (${sk.id})`);
      if (isGitRepo(ctx.root) && !g.hook) missing.push('post-commit hook');
      // graph.json no se exige: en un proyecto sin codigo `graphify update` no lo crea, y
      // eso es correcto — el grafo aparece con el primer commit que traiga codigo.
      return missing.length
        ? { state: 'pending', detail: t(ctx.lang, 'step.graphify.pending', missing.join(', ')) }
        : { state: 'ok', detail: t(ctx.lang, g.graph ? 'step.graphify.ok' : 'step.graphify.okNoGraph', g.graph) };
    },
    plan(ctx) {
      const v = VENDORS.graphify;
      const f = path.join(ctx.root, v.ignoreFile);
      const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
      const actions = [
        note(t(ctx.lang, 'step.graphify.scope')),
        write(f, mergeMarkedBlock(cur, graphifyIgnoreBlock(), GRAPHIFY_IGNORE_START, GRAPHIFY_IGNORE_END), t(ctx.lang, 'step.graphify.ignoreWhy')),
        // Un comando por agente: la skill queda dentro del proyecto, en la ruta que graphify
        // usa para ese agente. Tambien agrega `## graphify` a CLAUDE.md / AGENTS.md.
        ...ctx.agents.filter((a) => a.ids?.graphify).flatMap((a) => [
          exec(v.bin, ['install', '--project', '--platform', a.ids.graphify], t(ctx.lang, 'step.graphify.skillWhy', a.id), { tolerateFailure: true }),
          // Solo Claude Code recibe hooks; el patch no encuentra archivo en los demas y no hace nada.
          ...(a.commands ? [patch(path.join(ctx.root, path.dirname(a.commands), 'settings.json'), scopeGraphifyHooks, t(ctx.lang, 'step.graphify.hooksWhy'))] : []),
        ]),
        // AST: determinista, sin LLM. En un proyecto sin codigo termina bien y no crea nada.
        exec(v.bin, ['update', '.'], t(ctx.lang, 'step.graphify.updateWhy'), { tolerateFailure: true }),
      ];
      if (isGitRepo(ctx.root)) actions.push(exec(v.bin, ['hook', 'install'], t(ctx.lang, 'step.graphify.hookWhy')));
      else actions.push(note(t(ctx.lang, 'step.graphify.noGitHook')));
      return actions;
    },
  },

  {
    id: 'dashboard-hook',
    blocks: 'none',
    titleKey: 'step.dashboard-hook.title',
    status(ctx) {
      if (!isGitRepo(ctx.root)) return { state: 'skip', detail: t(ctx.lang, 'step.gitignore.noGit') };
      return dashboardHookOk(ctx.root)
        ? { state: 'ok', detail: t(ctx.lang, 'step.dashboard-hook.ok') }
        : { state: 'pending', detail: t(ctx.lang, 'step.dashboard-hook.pending') };
    },
    plan(ctx) {
      // Se agrega al post-commit existente (graphify tambien vive ahi); nunca se reemplaza.
      const f = path.join(ctx.root, gitDir(ctx.root), 'hooks', 'post-commit');
      const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '#!/bin/sh\n';
      const content = cur.includes(DASHBOARD_HOOK_MARK) ? cur : `${cur.trimEnd()}\n${DASHBOARD_HOOK}\n`;
      return [write(f, content, t(ctx.lang, 'step.dashboard-hook.why'), { mode: 0o755 })];
    },
  },

  {
    id: 'surface',
    blocks: 'none',
    dependsOn: 'bmad',
    titleKey: 'step.surface.title',
    status(ctx) {
      if (ctx.keepVendorCommands) return { state: 'skip', detail: '--keep-vendor-commands' };
      const found = this.targets(ctx).filter((t) => fs.existsSync(t));
      return found.length
        ? { state: 'pending', detail: t(ctx.lang, 'step.surface.pending', found.length) }
        : { state: 'ok', detail: t(ctx.lang, 'step.surface.ok') };
    },
    targets(ctx) {
      const out = [];
      for (const d of commandDirs(ctx.agents)) {
        const dir = path.join(ctx.root, d);
        for (const sub of VENDORS.surface.pruneCommandDirs) out.push(path.join(dir, sub));
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) {
          if (f.endsWith('.md') && VENDORS.surface.pruneCommandPrefixes.some((p) => f.startsWith(p))) out.push(path.join(dir, f));
        }
      }
      return out;
    },
    plan(ctx) {
      const found = this.targets(ctx).filter((t) => fs.existsSync(t));
      if (!found.length) return [note(t(ctx.lang, 'step.surface.ok'))];
      return [note(t(ctx.lang, 'step.surface.note')), ...found.map((f) => rm(f, t(ctx.lang, 'step.surface.why')))];
    },
  },

  {
    id: 'layer',
    blocks: 'plan',
    titleKey: 'step.layer.title',
    status(ctx) {
      const missing = this.files(ctx).filter((f) => !f.keepExisting && !fs.existsSync(f.file));
      return missing.length ? { state: 'pending', detail: t(ctx.lang, 'step.layer.pending', missing.length) } : { state: 'ok', detail: t(ctx.lang, 'step.layer.ok') };
    },
    files(ctx) {
      const lang = ctx.lang === 'en' ? 'en' : 'es';
      const out = [];

      // La skill va a todos los agentes: es el mismo contenido, sin atajo.
      const skill = readAsset(`skills/un-specweaver/SKILL.${lang}.md`);
      for (const d of skillDirs(ctx.agents))
        out.push({ file: path.join(ctx.root, d, 'un-specweaver', 'SKILL.md'), content: skill, why: t(ctx.lang, 'step.layer.skill', d) });

      // Los comandos solo a los agentes con formato documentado (Claude Code, OpenCode).
      const names = listAssets(`commands/${lang}`).map((f) => f.replace(/\.md$/, ''));
      for (const agent of ctx.agents.filter((a) => a.commands)) {
        for (const name of names) {
          const { meta, body } = splitFrontmatter(readAsset(`commands/${lang}/${name}.md`));
          const invocation = agent.commandStyle === 'namespaced' ? `/${NAMESPACE}:${name}` : `/${NAMESPACE}-${name}`;
          out.push({
            file: path.join(ctx.root, commandPath(agent, name)),
            content: renderCommand(agent.commandStyle, meta, body),
            why: t(ctx.lang, 'step.layer.command', invocation, agent.id),
          });
        }
      }

      out.push({
        file: path.join(ctx.root, 'docs', 'architecture-base.md'),
        content: readAsset(`docs/architecture-base.${lang}.md`),
        why: t(ctx.lang, 'step.layer.arch'),
        keepExisting: true,
      });
      return out;
    },
    plan(ctx) {
      return this.files(ctx)
        .filter((f) => !(f.keepExisting && fs.existsSync(f.file)))
        .map((f) => write(f.file, f.content, f.why, { keepExisting: f.keepExisting }));
    },
  },
];

export function buildPlan(ctx, { only = [], skip = [] } = {}) {
  const selected = STEPS.filter((s) => (!only.length || only.includes(s.id)) && !skip.includes(s.id));
  const statuses = new Map(selected.map((s) => [s.id, s.status(ctx)]));

  // Si una dependencia va a correr en este mismo run, el dependiente no puede
  // reportarse como "ya hecho" contra un disco que todavia no cambio.
  for (const s of selected) {
    const dep = s.dependsOn && statuses.get(s.dependsOn);
    if (dep && dep.state === 'pending' && statuses.get(s.id).state === 'ok') {
      statuses.set(s.id, { state: 'pending', detail: t(ctx.lang, 'step.depAfter', s.dependsOn) });
    }
  }

  return selected.map((s) => {
    const status = statuses.get(s.id);
    const actions = status.state === 'ok' && !ctx.force ? [note(t(ctx.lang, 'run.alreadyDone'))]
      : status.state === 'skip' ? [note(status.detail)]
      : s.plan(ctx);
    return { id: s.id, blocks: s.blocks, title: t(ctx.lang, s.titleKey), status, actions };
  });
}

export function renderAction(a, root) {
  const rel = (p) => path.relative(root, p) || '.';
  switch (a.kind) {
    case 'exec':  return `$ ${a.cmd} ${a.args.map((x) => (/[\s]/.test(x) ? JSON.stringify(x) : x)).join(' ')}`;
    case 'shell': return `$ ${a.script}`;
    case 'write': return `+ ${rel(a.file)} (${Buffer.byteLength(a.content)} bytes)`;
    case 'patch': return `~ ${rel(a.file)} — ${a.why}`;
    case 'rm':    return `- ${rel(a.target)}`;
    case 'note':  return `  ${a.text}`;
    case 'blocked': return `! ${a.title}`;
    default:      return `  ?`;
  }
}
