// Todas las cadenas visibles del CLI, en un solo lugar.
// Regla: si una cadena se imprime al usuario, vive aqui. Si esta embebida en el codigo,
// alguien la va a olvidar cuando se agregue un idioma.
const S = {
  es: {
    ok: 'ok   ', fail: 'FALLA', warn: 'aviso', missing: 'falta', skip: 'skip ', drift: 'DRIFT',

    'init.header': (root) => `\nspecweaver init  —  ${root}\n`,
    'init.preflightFailed': '\nPreflight fallo. Corrige lo marcado FALLA y vuelve a intentar.',
    'init.notGitRepo': 'el directorio no es un repo git; los vendors funcionan igual, pero no vas a poder revertir',
    'init.unknownAgent': (id, valid) => `\nAgente desconocido: "${id}". Validos: ${valid}`,
    'init.noAgents': (valid) => `\nNo se detecto ningun agente. Instala Claude Code u OpenCode, o pasa --agents <id>.\nValidos: ${valid}`,
    'init.agents': 'agentes', 'init.language': 'idioma',
    'init.forced': '(forzados con --agents)', 'init.autodetected': '(autodetectados)',
    'init.dryRun': '\n--- dry-run: nada se escribe ni se ejecuta ---',
    'init.done': '\nListo.',
    'init.failed': (n, ids) => `\n${n} paso(s) con error: ${ids}`,
    'init.next': `\nSiguiente:
  1. Llena docs/architecture-base.md con la arquitectura de tu organizacion.
     Si lo dejas en blanco, /sw:new te lo va a decir y decidis ahi.
  2. Abri tu agente en esta carpeta y corre:  /sw:new
     (en OpenCode es /sw-new)

Los comandos, para tenerlos a mano:
  /sw:new              arrancar un proyecto desde cero
  /sw:build <change>   construir una historia
  /sw:change "<req>"   requerimiento nuevo (cambia lo acordado)
  /sw:bug "<defecto>"  defecto (lo acordado esta bien, el codigo no)
  /sw:ticket <n>       issue de GitHub: clasifica y enruta
  /sw:doctor           salud del entorno y del flujo
  /sw:status           en que va el proyecto (o: npx un-specweaver status --open)
  /sw:close            cerrar stories terminadas: validar y archivar su spec`,
    'prefs.header': `\n  Configuracion del proyecto — Enter toma el valor por defecto [1].\n  Queda en .un-specweaver/config.json y no se vuelve a preguntar.\n`,
    'prefs.ask': '  > ',
    'prefs.agentsHeader': '\n  Agentes a configurar (detectados en tu maquina)\n',
    'prefs.agentsHint': '    Numeros separados por coma, o Enter para todos.\n',
    'prefs.agentsStored': (a) => `${a} (elegidos al configurar)`,
    'prefs.lang': `
  Idioma de comandos, documentos y mensajes
    1) Espanol
    2) English
`,

    'lang.name': 'Spanish',

    'check.node': 'node >= 20.11', 'check.npx': 'npx', 'check.curl': 'curl',
    'check.git': 'git', 'check.platform': 'plataforma soportada',
    'check.uv': 'uv (Python)', 'check.uvMissing': 'ausente — BMAD lo usa para su config (funciona sin el, mas lento); graphify necesita uv o pipx para instalarse',
    'check.notFound': 'no encontrado',

    'run.wrote': (f) => `escrito ${f}`,
    'run.patched': (f) => `ajustado ${f}`,
    'run.removed': (f) => `removido ${f}`,
    'run.kept': (f) => `conservado ${f}`,
    'run.refusedOutside': (p) => `se rechazo borrar fuera del proyecto: ${p}`,
    'run.exitCode': (c) => `salio con codigo ${c}`,
    'run.unknownAction': (k) => `accion desconocida: ${k}`,
    'run.blocked': 'bloqueado por un prerequisito que solo vos podes autorizar',
    'run.remoteCode': (s) => `     ejecuta codigo remoto:\n       ${s}\n     continuar?`,
    'run.notAuthorized': 'no autorizado por el usuario',
    'run.yesChars': ['s', 'si', 'y', 'yes'],
    'run.yesNo': '[s/N]',
    'run.stepFailed': (id) => `     Paso "${id}" fallo. Los que no dependen de el siguen; corrige y vuelve a correr.`,
    'run.skippedDep': (dep) => `omitido: depende de "${dep}", que fallo`,
    'run.alreadyDone': 'ya hecho, se omite',

    'step.gitignore.title': 'Ignorar lo regenerable en git',
    'step.gitignore.ok': 'bloque ya presente',
    'step.gitignore.create': 'crea .gitignore',
    'step.gitignore.append': 'agrega el bloque al .gitignore existente',
    'step.gitignore.why': (n) => `${n} archivos de vendor son regenerables con init; el repo guarda specs, no dependencias`,
    'step.gitignore.noGit': 'no es un repo git, se omite',

    'step.surface.title': 'Una sola superficie de comandos',
    'step.surface.ok': 'sin comandos que compitan',
    'step.surface.pending': (n) => `${n} comando(s) de vendor por ocultar`,
    'step.surface.after': 'corre despues de instalar los vendors',
    'step.surface.why': 'compite con /sw:* y confunde: la skill sigue disponible',
    'step.surface.note': `Se podan COMANDOS, no skills. judgment-day, work-unit-commits, branch-pr y los
     revisores siguen ahi: se invocan pidiendolos en lenguaje normal.`,

    'step.bmad.title': 'BMAD METHOD (planeacion)',
    'step.bmad.ok': '_bmad/ ya existe (usa --force para reinstalar)',
    'step.bmad.why': (v) => `instala el modulo bmm pineado en ${v}, alcance del proyecto`,
    'step.bmad-prune.title': 'Podar los agentes constructores de BMAD',
    'step.bmad-prune.after': 'corre despues de instalar BMAD',
    'step.bmad-prune.pending': (n) => `${n} skill(s)/comando(s) por remover`,
    'step.bmad-prune.ok': 'ya podado',
    'step.bmad-prune.willRemove': 'se remueven si BMAD los instala en este mismo run',
    'step.bmad-prune.why': 'la construccion la hace el SDD',
    'step.openspec.title': 'OpenSpec (artefactos de especificacion)',
    'step.openspec.ok': 'openspec/ ya existe',
    'step.openspec.why': 'inicializa openspec/ y registra los comandos del agente',
    'step.layer.title': 'Capa un-specweaver (comandos, skill, arquitectura base)',
    'step.layer.pending': (n) => `${n} archivo(s)`,
    'step.layer.ok': 'al dia',
    'step.layer.skill': (d) => `skill de orquestacion (${d})`,
    'step.layer.command': (inv, agent) => `${inv} en ${agent}`,
    'step.layer.arch': 'plantilla de arquitectura; se carga como contexto en diseno y construccion',
    'step.depAfter': (dep) => `se revisa tras "${dep}"`,
    'step.nothing': 'nada que podar',

    'doctor.header': (root) => `\nspecweaver doctor  —  ${root}\n`,
    'doctor.installed': (at, agents) => `\n  instalado  ${at}  agentes: ${agents}`,
    'doctor.noState': '\n  aviso  este proyecto no tiene .un-specweaver/config.json — corre "un-specweaver init"',
    'doctor.steps': '\n  pasos',
    'blocks.plan': 'necesario para planear (/sw:new, /sw:adopt)',
    'blocks.build': 'solo bloquea /sw:build — planear funciona sin esto',
    'blocks.none': 'higiene del repo, no bloquea nada',
    'doctor.pendingPlan': (n) => `\n${n} paso(s) bloquean la planeacion. Corre "un-specweaver init".`,
    'doctor.pendingBuildOnly': (n) => `\n${n} paso(s) pendiente(s), pero ninguno bloquea planear. Pod\u00e9s arrancar con /sw:new.`,
    'doctor.vendors': '\n  vendors pineados',
    'doctor.optional': '\n  opcional',
    'doctor.vendorLine': (installed, pinned) => `instalado: ${installed.padEnd(30)} pineado ahora: ${pinned}`,
    'doctor.notInstalled': 'no instalado',
    'doctor.unknownVersion': 'version desconocida',
    'doctor.pending': (n) => `\n${n} paso(s) pendiente(s). Corre "un-specweaver init" — los ya hechos se omiten solos.`,
    'doctor.allGood': '\nTodo al dia.',
    'doctor.unarchived': (n) => `\n${n} story/ies con todas las tareas completas SIN archivar: no hay linea base y /sw:change no puede medir alcance. Cierra con "npx un-specweaver close --done".`,

    'engram.name': 'engram',
    'engram.present': (b) => `presente (${b})`,
    'engram.absent': 'ausente — el flujo funciona, pero el rationale de las decisiones no se guarda',
    'step.graphify-bin.title': 'Instalar graphify (mapa del codigo)',
    'step.graphify-bin.missing': 'graphify no esta en PATH',
    'step.graphify-bin.already': (b) => `${b} ya esta instalado`,
    'step.graphify-bin.why': (via) => `instala graphify pineado via ${via}, aislado en su propio entorno de Python`,
    'step.graphify-bin.noInstaller': 'no hay uv ni pipx para instalar graphify',
    'step.graphify-bin.noInstallerWhy': `graphify es una herramienta de Python. uv y pipx la aislan en su propio entorno; instalarla
     con pip sobre el Python del sistema es lo que un-specweaver no va a hacer por vos.`,
    'step.graphify-bin.noInstallerFix': (platform) => `instala uno de los dos y vuelve a correr init:
       ${platform === 'darwin' ? 'brew install uv' : 'curl -LsSf https://astral.sh/uv/install.sh | sh'}
       npx un-specweaver init`,
    'step.graphify.title': 'Mapa del codigo: skill en el proyecto, alcance solo codigo, grafo AST y hook',
    'step.graphify.after': 'corre despues de instalar graphify',
    'step.graphify.pending': (m) => `falta: ${m}`,
    'step.graphify.ok': (g) => `configurado; grafo en ${g}`,
    'step.graphify.okNoGraph': 'configurado; el grafo aparece con el primer codigo (todavia no hay)',
    'step.graphify.scope': `El grafo es SOLO de codigo. PRD, specs, docs y memoria tienen otro dueno y no se
     duplican aqui; .graphifyignore lo garantiza aunque alguien corra /graphify completo.`,
    'step.graphify.ignoreWhy': 'acota el grafo a codigo — va al repo, es la regla del equipo',
    'step.graphify.skillWhy': (a) => `skill de graphify dentro del proyecto para ${a} (tambien agrega "## graphify" a su archivo de contexto)`,
    'step.graphify.hooksWhy': 'acota los hooks PreToolUse de graphify a codigo: leer el PRD o un spec no debe pedir consultar el grafo',
    'step.graphify.updateWhy': 'grafo AST inicial: determinista, sin LLM; sin codigo termina bien y no crea nada',
    'step.graphify.hookWhy': 'post-commit y post-checkout reconstruyen solo lo que cambio — el grafo nunca queda viejo',
    'step.graphify.noGitHook': 'sin repo git no se instala el hook: reconstruye con `graphify update .` cuando cambie el codigo',
    'step.dashboard-hook.title': 'Regenerar el dashboard en cada commit',
    'step.dashboard-hook.ok': 'hook de post-commit instalado',
    'step.dashboard-hook.pending': 'agregar al post-commit',
    'step.dashboard-hook.why': 'si .un-specweaver/dashboard.html existe, cada commit lo regenera; una vista que solo se actualiza cuando alguien se acuerda es una vista vieja',
    'step.engram.title': 'Aislar la memoria de Engram dentro del proyecto',
    'step.openspec.legacy': 'openspec/ en la raiz (layout anterior) — `un-specweaver migrate` lo muda',
    'step.engram-bin.title': 'Instalar Engram (memoria de decisiones)',
    'step.engram-bin.missing': 'engram no esta en PATH',
    'step.engram-bin.already': (b) => `${b} ya instalado`,
    'step.engram-bin.brew': 'via Homebrew (sirve en macOS y Linux): no ejecuta scripts remotos',
    'step.engram-bin.go': 'via `go install`, la alternativa oficial sin Homebrew',
    'step.engram-bin.untrusted': (list) => `Homebrew no confia en: ${list}`,
    'step.engram-bin.untrustedWhy': `Autorizar una formula le da permiso de ejecutar codigo de instalacion en tu maquina:
     es una decision tuya, un-specweaver no la toma por vos.`,
    'step.engram-bin.untrustedFix': (cmds) => `autoriza y vuelve a intentar:\n${cmds}\n       npx un-specweaver init`,
    'step.engram-bin.noInstaller': 'no hay Homebrew ni Go para instalar Engram',
    'step.engram-bin.noInstallerWhy': `Engram es un binario de Go. Sus dos vias oficiales son Homebrew (macOS y Linux) y
     \`go install\`; ninguna esta disponible aqui.`,
    'step.engram-bin.noInstallerFix': `instala uno de los dos y vuelve a correr init:
       /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
       npx un-specweaver init`,
    'step.engram.ok': (d) => `memoria en ${d}`,
    'step.engram.pending': (m) => `falta: ${m}`,
    'step.engram.legacy': 'migrar desde el layout anterior',
    'step.engram.isolation': `La memoria de este proyecto vive en .un-specweaver/engram, no en ~/.engram: borrar
     la carpeta borra la memoria, y ningun otro proyecto la ve.`,
    'step.engram.wrapper': 'wrapper que fija ENGRAM_DATA_DIR a este proyecto (resuelve su propia ruta: sin rutas absolutas de una maquina)',
    'step.engram.mcp': (a) => `registra el servidor de memoria de ${a} apuntando al wrapper`,
    'step.engram.pluginWarning': `AVISO: tenes el plugin global de Engram en Claude Code. Vive en otro namespace y
     ninguna config de proyecto lo vence: sus herramientas siguen escribiendo en ~/.engram.
     Para que la memoria de este proyecto sea la unica, desactivalo aqui:
       claude plugin disable engram`,
    'engram.isolated': (d) => `memoria del proyecto en ${d}`,
    'engram.notIsolated': 'sin aislar — corre `npx un-specweaver init`',
    'engram.plugin': 'ademas esta el plugin global de Claude Code: sus herramientas escriben en ~/.engram',
    'step.engram.why': (p) => `fija "${p}" como proyecto de Engram para todos los agentes; sin esto cada servidor deriva el nombre por su cuenta`,

  },

  en: {
    ok: 'ok   ', fail: 'FAIL ', warn: 'warn ', missing: 'todo ', skip: 'skip ', drift: 'DRIFT',

    'init.header': (root) => `\nspecweaver init  —  ${root}\n`,
    'init.preflightFailed': '\nPreflight failed. Fix what is marked FAIL and try again.',
    'init.notGitRepo': 'not a git repo; the vendors still work, but you will not be able to revert',
    'init.unknownAgent': (id, valid) => `\nUnknown agent: "${id}". Valid: ${valid}`,
    'init.noAgents': (valid) => `\nNo agent detected. Install Claude Code or OpenCode, or pass --agents <id>.\nValid: ${valid}`,
    'init.agents': 'agents', 'init.language': 'language',
    'init.forced': '(forced with --agents)', 'init.autodetected': '(autodetected)',
    'init.dryRun': '\n--- dry-run: nothing is written or executed ---',
    'init.done': '\nDone.',
    'init.failed': (n, ids) => `\n${n} step(s) failed: ${ids}`,
    'init.next': `\nNext:
  1. Fill docs/architecture-base.md with your organization's architecture.
     If you leave it blank, /sw:new will tell you and you decide there.
  2. Open your agent in this folder and run:  /sw:new
     (on OpenCode it is /sw-new)

The commands, for reference:
  /sw:new              start a project from scratch
  /sw:build <change>   build one story
  /sw:change "<req>"   new requirement (changes what was agreed)
  /sw:bug "<defect>"   defect (what was agreed is fine, the code is not)
  /sw:ticket <n>       GitHub issue: classify and route
  /sw:doctor           environment and flow health
  /sw:status           where the project stands (or: npx un-specweaver status --open)
  /sw:close            close finished stories: validate and archive their spec`,
    'prefs.header': `\n  Project setup — Enter takes the default [1].\n  Stored in .un-specweaver/config.json and never asked again.\n`,
    'prefs.ask': '  > ',
    'prefs.agentsHeader': '\n  Agents to configure (detected on your machine)\n',
    'prefs.agentsHint': '    Comma-separated numbers, or Enter for all.\n',
    'prefs.agentsStored': (a) => `${a} (chosen at setup)`,
    'prefs.lang': `
  Language for commands, documents and messages
    1) Espanol
    2) English
`,

    'lang.name': 'English',

    'check.node': 'node >= 20.11', 'check.npx': 'npx', 'check.curl': 'curl',
    'check.git': 'git', 'check.platform': 'supported platform',
    'check.uv': 'uv (Python)', 'check.uvMissing': 'absent — BMAD uses it for its config (works without it, slower); graphify needs uv or pipx to install',
    'check.notFound': 'not found',

    'run.wrote': (f) => `wrote ${f}`,
    'run.patched': (f) => `adjusted ${f}`,
    'run.removed': (f) => `removed ${f}`,
    'run.kept': (f) => `kept ${f}`,
    'run.refusedOutside': (p) => `refused to delete outside the project: ${p}`,
    'run.exitCode': (c) => `exited with code ${c}`,
    'run.unknownAction': (k) => `unknown action: ${k}`,
    'run.blocked': 'blocked by a prerequisite only you can authorize',
    'run.remoteCode': (s) => `     runs remote code:\n       ${s}\n     continue?`,
    'run.notAuthorized': 'not authorized by the user',
    'run.yesChars': ['y', 'yes', 's', 'si'],
    'run.yesNo': '[y/N]',
    'run.stepFailed': (id) => `     Step "${id}" failed. Steps that do not depend on it continue; fix and run again.`,
    'run.skippedDep': (dep) => `skipped: depends on "${dep}", which failed`,
    'run.alreadyDone': 'already done, skipping',

    'step.gitignore.title': 'Ignore regenerable files in git',
    'step.gitignore.ok': 'block already present',
    'step.gitignore.create': 'creates .gitignore',
    'step.gitignore.append': 'appends the block to the existing .gitignore',
    'step.gitignore.why': (n) => `${n} vendor files are regenerable with init; the repo keeps specs, not dependencies`,
    'step.gitignore.noGit': 'not a git repo, skipped',

    'step.surface.title': 'One command surface',
    'step.surface.ok': 'no competing commands',
    'step.surface.pending': (n) => `${n} vendor command(s) to hide`,
    'step.surface.after': 'runs after the vendors are installed',
    'step.surface.why': 'competes with /sw:* and confuses: the skill stays available',
    'step.surface.note': `Commands are pruned, not skills. judgment-day, work-unit-commits, branch-pr and
     the reviewers are still there: invoke them by asking in plain language.`,

    'step.bmad.title': 'BMAD METHOD (planning)',
    'step.bmad.ok': '_bmad/ already exists (use --force to reinstall)',
    'step.bmad.why': (v) => `installs the bmm module pinned at ${v}, project scope`,
    'step.bmad-prune.title': 'Prune BMAD builder skills',
    'step.bmad-prune.after': 'runs after BMAD is installed',
    'step.bmad-prune.pending': (n) => `${n} skill(s)/command(s) to remove`,
    'step.bmad-prune.ok': 'already pruned',
    'step.bmad-prune.willRemove': 'removed if BMAD installs them in this same run',
    'step.bmad-prune.why': 'building is done by SDD',
    'step.openspec.title': 'OpenSpec (specification artifacts)',
    'step.openspec.ok': 'openspec/ already exists',
    'step.openspec.why': 'initializes openspec/ and registers the agent commands',
    'step.layer.title': 'un-specweaver layer (commands, skill, base architecture)',
    'step.layer.pending': (n) => `${n} file(s)`,
    'step.layer.ok': 'up to date',
    'step.layer.skill': (d) => `orchestration skill (${d})`,
    'step.layer.command': (inv, agent) => `${inv} on ${agent}`,
    'step.layer.arch': 'architecture template; loaded as context in design and build',
    'step.depAfter': (dep) => `re-checked after "${dep}"`,
    'step.nothing': 'nothing to prune',

    'doctor.header': (root) => `\nspecweaver doctor  —  ${root}\n`,
    'doctor.installed': (at, agents) => `\n  installed  ${at}  agents: ${agents}`,
    'doctor.noState': '\n  warn   this project has no .un-specweaver/config.json — run "un-specweaver init"',
    'doctor.steps': '\n  steps',
    'blocks.plan': 'required to plan (/sw:new, /sw:adopt)',
    'blocks.build': 'only blocks /sw:build — planning works without it',
    'blocks.none': 'repo hygiene, blocks nothing',
    'doctor.pendingPlan': (n) => `\n${n} step(s) block planning. Run "un-specweaver init".`,
    'doctor.pendingBuildOnly': (n) => `\n${n} step(s) pending, but none blocks planning. You can start with /sw:new.`,
    'doctor.vendors': '\n  pinned vendors',
    'doctor.optional': '\n  optional',
    'doctor.vendorLine': (installed, pinned) => `installed: ${installed.padEnd(30)} pinned now: ${pinned}`,
    'doctor.notInstalled': 'not installed',
    'doctor.unknownVersion': 'unknown version',
    'doctor.pending': (n) => `\n${n} step(s) pending. Run "un-specweaver init" — completed ones are skipped.`,
    'doctor.allGood': '\nAll up to date.',
    'doctor.unarchived': (n) => `\n${n} story/ies with every task complete but NOT archived: there is no baseline and /sw:change cannot measure scope. Close them with "npx un-specweaver close --done".`,


    'engram.name': 'engram',
    'engram.present': (b) => `present (${b})`,
    'engram.absent': 'absent — the flow works, but decision rationale is not recorded',
    'step.graphify-bin.title': 'Install graphify (code map)',
    'step.graphify-bin.missing': 'graphify is not on PATH',
    'step.graphify-bin.already': (b) => `${b} already installed`,
    'step.graphify-bin.why': (via) => `installs pinned graphify via ${via}, isolated in its own Python environment`,
    'step.graphify-bin.noInstaller': 'neither uv nor pipx available to install graphify',
    'step.graphify-bin.noInstallerWhy': `graphify is a Python tool. uv and pipx isolate it in its own environment; installing it
     with pip into the system Python is something un-specweaver will not do on your behalf.`,
    'step.graphify-bin.noInstallerFix': (platform) => `install one of them and run init again:
       ${platform === 'darwin' ? 'brew install uv' : 'curl -LsSf https://astral.sh/uv/install.sh | sh'}
       npx un-specweaver init`,
    'step.graphify.title': 'Code map: project skill, code-only scope, AST graph and hook',
    'step.graphify.after': 'runs after installing graphify',
    'step.graphify.pending': (m) => `missing: ${m}`,
    'step.graphify.ok': (g) => `configured; graph at ${g}`,
    'step.graphify.okNoGraph': 'configured; the graph appears with the first code (none yet)',
    'step.graphify.scope': `The graph is code ONLY. PRD, specs, docs and memory have another owner and are not
     duplicated here; .graphifyignore guarantees it even if someone runs the full /graphify.`,
    'step.graphify.ignoreWhy': 'scopes the graph to code — goes to the repo, it is the team rule',
    'step.graphify.skillWhy': (a) => `graphify skill inside the project for ${a} (also adds "## graphify" to its context file)`,
    'step.graphify.hooksWhy': 'scopes graphify PreToolUse hooks to code: reading the PRD or a spec must not demand a graph query',
    'step.graphify.updateWhy': 'initial AST graph: deterministic, no LLM; with no code it exits fine and writes nothing',
    'step.graphify.hookWhy': 'post-commit and post-checkout rebuild only what changed — the graph never goes stale',
    'step.graphify.noGitHook': 'no git repo, so no hook: rebuild with `graphify update .` when code changes',
    'step.dashboard-hook.title': 'Regenerate the dashboard on every commit',
    'step.dashboard-hook.ok': 'post-commit hook installed',
    'step.dashboard-hook.pending': 'append to post-commit',
    'step.dashboard-hook.why': 'if .un-specweaver/dashboard.html exists, every commit regenerates it; a view that only updates when someone remembers is a stale view',
    'step.engram.title': 'Scope Engram memory inside the project',
    'step.openspec.legacy': 'openspec/ at the project root (previous layout) — `un-specweaver migrate` moves it',
    'step.engram-bin.title': 'Install Engram (decision memory)',
    'step.engram-bin.missing': 'engram is not on PATH',
    'step.engram-bin.already': (b) => `${b} already installed`,
    'step.engram-bin.brew': 'via Homebrew (works on macOS and Linux): runs no remote scripts',
    'step.engram-bin.go': 'via `go install`, the official path without Homebrew',
    'step.engram-bin.untrusted': (list) => `Homebrew does not trust: ${list}`,
    'step.engram-bin.untrustedWhy': `Authorizing a formula lets it run install code on your machine: that is your decision,
     un-specweaver does not make it for you.`,
    'step.engram-bin.untrustedFix': (cmds) => `authorize and try again:\n${cmds}\n       npx un-specweaver init`,
    'step.engram-bin.noInstaller': 'neither Homebrew nor Go available to install Engram',
    'step.engram-bin.noInstallerWhy': `Engram is a Go binary. Its two official paths are Homebrew (macOS and Linux) and
     \`go install\`; neither is available here.`,
    'step.engram-bin.noInstallerFix': `install one of them and run init again:
       /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
       npx un-specweaver init`,
    'step.engram.ok': (d) => `memory at ${d}`,
    'step.engram.pending': (m) => `missing: ${m}`,
    'step.engram.legacy': 'migrate from the previous layout',
    'step.engram.isolation': `This project's memory lives in .un-specweaver/engram, not ~/.engram: deleting the folder
     deletes the memory, and no other project sees it.`,
    'step.engram.wrapper': 'wrapper pinning ENGRAM_DATA_DIR to this project (resolves its own path: no machine-specific absolutes)',
    'step.engram.mcp': (a) => `registers ${a}'s memory server pointing at the wrapper`,
    'step.engram.pluginWarning': `HEADS UP: the global Engram plugin is enabled in Claude Code. It lives in another namespace
     and no project config overrides it: its tools keep writing to ~/.engram.
     To make this project's memory the only one, disable it here:
       claude plugin disable engram`,
    'engram.isolated': (d) => `project memory at ${d}`,
    'engram.notIsolated': 'not isolated — run `npx un-specweaver init`',
    'engram.plugin': 'the global Claude Code plugin is also active: its tools write to ~/.engram',
    'step.engram.why': (p) => `pins "${p}" as the Engram project for every agent; without it each server derives the name on its own`,

  },
};

export const LANGS = Object.keys(S);

export function t(lang, key, ...args) {
  const v = (S[lang] || S.es)[key] ?? S.es[key];
  if (v === undefined) throw new Error(`cadena i18n faltante: ${key}`);
  return typeof v === 'function' ? v(...args) : v;
}

// Sirve para el test que verifica que ningun idioma se quede atras.
export function keysOf(lang) { return Object.keys(S[lang] || {}); }
