# un-specweaver

**Desarrollo dirigido por especificacion, de la idea al codigo, con trazabilidad completa.**

Una metodologia y la herramienta que la implementa. En vez de describirle una funcionalidad a un
agente y esperar que acierte, el trabajo baja por fases: cada una produce un artefacto verificable
que alimenta a la siguiente, y cada linea de codigo se puede rastrear hasta el requisito que la
justifica.

```bash
npx un-specweaver init
```

macOS y Linux. Claude Code u OpenCode. Espanol o ingles. Nadie necesita clonar este repositorio.

---

## La metodologia

Seis fases. Cada una tiene una salida concreta, y ninguna empieza sin la anterior.

| | Fase | Produce | Por que existe |
|---|---|---|---|
| 1 | **Entender** | brief y PRD con requisitos numerados | sin requisitos numerados no hay que rastrear |
| 2 | **Decidir** | arquitectura y diseno UX | las decisiones tecnicas se toman una vez, no en cada historia |
| 3 | **Descomponer** | epicas e historias con criterios Given/When/Then | una historia es la unidad que una persona puede terminar |
| 4 | **Traducir** | un contrato ejecutable por historia | **deterministico**: misma entrada, misma salida, siempre |
| 5 | **Construir** | codigo que cumple el contrato | los escenarios del contrato son los casos de prueba |
| 6 | **Cerrar** | el contrato pasa a ser la verdad del sistema | de ahi se mide el alcance de todo lo que llegue despues |

### Las tres reglas que la sostienen

**El contrato es derivado, no fuente.** Los contratos se regeneran desde las historias; no se
editan a mano. Si un contrato esta mal, la historia esta mal. Editar el derivado desincroniza los
dos y nadie se entera hasta que es tarde.

**El alcance se controla antes de tocar archivos.** Un requerimiento nuevo se clasifica primero
—dentro del alcance, scope creep, o epica nueva— y recien despues se toca algo. Un defecto no
pasa por ese control: lo acordado no cambio, solo no se cumplio. Son dos flujos distintos a
proposito.

**Cada dato tiene un solo dueno.** La intencion de producto vive en el PRD; el contrato de
comportamiento en los specs; el rationale en la memoria; la estructura del codigo en el grafo.
Duplicar entre capas es como empiezan a contradecirse.

---

## El flujo, en comandos

Once comandos, un solo vocabulario. En Claude Code se escriben `/sw:new`; en OpenCode, `/sw-new`.

```
                  ┌─ /sw:new ─────────────────────────────────┐
   idea  ────────▶│  entender → decidir → descomponer         │
                  │  → traducir → verificar                   │
                  └───────────────────┬───────────────────────┘
                                      │  contratos verificados
                                      ▼
   /sw:sprint ──▶ que se puede hacer en paralelo y que no
                                      │
                                      ▼
   /sw:build <id> ──▶ construir una historia contra su contrato
                                      │
                                      ▼
                    /sw:close la valida y archiva (linea base)

   /sw:status ──▶ ¿como vamos? el dashboard, en cualquier momento
```

| Comando | Cuando |
|---|---|
| `/sw:new` | proyecto desde cero |
| `/sw:adopt` | proyecto que ya existe: mapear, derivar arquitectura, fijar la linea base |
| `/sw:build <id>` | construir una historia |
| `/sw:change "<req>"` | requerimiento nuevo — **cambia lo acordado**, pasa por control de alcance |
| `/sw:bug "<defecto>"` | defecto — lo acordado esta bien, el codigo no. Sin control de alcance |
| `/sw:ticket <n>` | issue de GitHub: clasifica y enruta a uno de los dos anteriores |
| `/sw:sprint` | recalcula que se puede paralelizar segun dependencias reales |
| `/sw:sync` | actualizar las herramientas de forma controlada |
| `/sw:status` | ¿como vamos? — abre el **dashboard** (`status --open`) y lo interpreta: que se puede empezar, que esta inestable, que falta cerrar |
| `/sw:close [id]` | cerrar stories terminadas: validar y archivar su spec. **Terminar no es cerrar** |
| `/sw:doctor` | salud del entorno y coherencia del flujo |

---

## Que hace la herramienta

`un-specweaver` no reimplementa la metodologia: **orquesta herramientas que ya la resuelven bien**,
las pinea a una version conocida, y aporta la pieza que a ninguna le sobraba.

| Fase | Motor |
|---|---|
| Entender, decidir, descomponer | [BMAD METHOD](https://github.com/bmad-code-org/BMAD-METHOD) |
| **Traducir** | **el puente de este repositorio** |
| Contratos y verificacion | [OpenSpec](https://github.com/Fission-AI/OpenSpec) |
| Memoria de decisiones | [Engram](https://github.com/Gentleman-Programming/engram) — **una base por proyecto** |
| Mapa del codigo (impacto, estructura real) | [graphify](https://github.com/safishamsi/graphify) — **solo codigo** |

**La fase 4 es la que no existia.** BMAD llega hasta la historia; OpenSpec arranca en el contrato;
entre las dos habia un salto que se hacia a mano o se improvisaba. El puente lo cierra de forma
deterministica: mismo `epics.md`, mismos contratos, byte por byte, con la trazabilidad
requisito ↔ historia ↔ contrato escrita en un archivo.

Ademas la herramienta hace cuatro cosas que suenan menores y no lo son:

- **Poda lo que se pisa.** Dos herramientas del stack traen agentes constructores; si conviven,
  compiten por el mismo archivo. Se remueven en la instalacion, no con una regla que un agente
  pueda ignorar.
- **Deja un solo vocabulario.** Los comandos de los vendors se ocultan; queda `/sw:*`. Las skills
  utiles siguen todas disponibles.
- **Aisla el proyecto.** Todo lo que el metodo produce vive en `.un-specweaver/`: specs,
  planeacion, trazabilidad y **la memoria**. La base de Engram es del proyecto, no una etiqueta
  sobre una base compartida; borrar la carpeta borra la memoria. Y no escribimos nada en tu
  `$HOME`: si ya tenias Gentle-AI o Engram instalados, tu configuracion queda intacta.
- **Acota el mapa del codigo a codigo.** graphify construye un grafo AST del proyecto —
  determinista, sin LLM— y un hook lo reconstruye en cada commit. `.graphifyignore` deja fuera el
  PRD, los specs y la memoria: esas capas tienen otro dueño, y el grafo tiene que ser un testigo
  que no leyo la arquitectura declarada para poder contrastarla con la real.

Nada se forkea. Los vendors se actualizan solos y el pin vive en un unico archivo.

---

## Instalacion para el equipo

Cinco pasos. **Los cuatro primeros son iguales en macOS y Linux**; solo cambian el gestor
de paquetes del sistema y un permiso de Homebrew que aplica solo a macOS.

### Lo que tiene que estar antes de correr `init`

| | Requisito | Bloquea si falta |
|---|---|---|
| 1 | Node.js **20.11+** | **si** |
| 2 | **Claude Code** u **OpenCode** (al menos uno) | **si** |
| 3 | Homebrew (macOS y Linux) o Go | **solo `/sw:build`**: es como se instala Engram |
| 4 | git | no, pero sin el no podes revertir |
| 5 | `uv` (o `pipx`) | **solo `/sw:build`**: es como se instala graphify. Sin el, BMAD tambien va mas lento |

---

### Paso 1 — Node.js 20.11 o superior

<table>
<tr><th>macOS</th><th>Linux</th></tr>
<tr><td>

```bash
brew install node
```

</td><td>

```bash
# Debian / Ubuntu
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Fedora
sudo dnf install nodejs npm

# Arch
sudo pacman -S nodejs npm
```

</td></tr>
</table>

En macOS, si no tenes Homebrew:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Homebrew es la via mas simple para instalar Engram, y sirve igual en macOS y en Linux. Sin el,
`init` usa `go install`.

### Paso 2 — Un agente (igual en los dos sistemas)

```bash
npm install -g @anthropic-ai/claude-code    # Claude Code
npm install -g opencode-ai                  # OpenCode
```

Con uno alcanza. Si instalas los dos, `init` te deja elegir cuales configurar.

### Paso 3 — `uv` (o `pipx`)

```bash
# macOS
brew install uv

# Linux (cualquier distro)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

`init` lo usa para instalar graphify aislado en su propio entorno de Python (con `pipx` tambien
sirve; sobre el Python del sistema con `pip`, no lo hace por vos). BMAD ademas lo usa para
resolver su configuracion. Sin ninguno de los dos, planear funciona; construir se queda sin mapa
del codigo y `doctor` lo dice.

### Paso 4 — Comprobar antes de seguir

```bash
node --version      # v20.11.0 o superior
claude --version    # o: opencode --version
git --version
uv --version        # o: pipx --version
brew --version      # solo macOS
```

Si algo falta, volve al paso correspondiente. `init` tambien lo verifica y te dice que falta,
pero es mas rapido saberlo ahora.

### Paso 5 — Montar el entorno

```bash
cd mi-proyecto
npx un-specweaver init
```

Hace dos preguntas —idioma y que agentes configurar— y despues instala BMAD, inicializa OpenSpec
dentro de `.un-specweaver/`, instala Engram y lo ata al proyecto, y monta graphify. Tarda unos
minutos.

**Se puede detener una vez** pidiendo autorizar una formula de Homebrew: Engram vive en un tap
de terceros y brew se niega a cargar formulas no confiables. **Es una decision de seguridad que
la herramienta no toma por nadie** — te da el comando exacto y se detiene:

```bash
brew trust --formula gentleman-programming/tap/engram
npx un-specweaver init
```

Es **un** item, no tres: antes se instalaba Gentle-AI, que arrastraba `engram` y `gga` y cada uno
pedia su propia ronda de autorizacion.

Sin Homebrew, `init` usa `go install`, la otra via oficial de Engram. Sin ninguno de los dos se
detiene y te dice que instalar: nunca ejecuta un script remoto.

### Las dos preguntas de `init`

Se hacen **una sola vez**. El idioma queda en `.un-specweaver/config.json` (del proyecto, va al repo);
los agentes en `.un-specweaver/local.json` (de tu maquina, ignorado — cada compañero elige los suyos):

| Pregunta | Opciones | Recomendado |
|---|---|---|
| Idioma | Espanol / English | el del equipo |
| Agentes | los detectados en la maquina | los que uses de verdad |

Sin preguntas, para scripts o CI:

```bash
npx un-specweaver init --lang es --agents claude-code,opencode --yes
```

### Verificar

```bash
npx un-specweaver doctor
```

Todo en `ok`. Si algo falta, dice **que bloquea**: los pasos de memoria y mapa solo impiden
`/sw:build`; planear funciona sin ellos.

### Empezar

Abri tu agente en esa carpeta y corre:

```
/sw:new          # Claude Code
/sw-new          # OpenCode
```

---

## Idioma

Es una decision de proyecto, no un flag suelto. `init` la pregunta si no pasas `--lang` y hay
terminal, la guarda en `.un-specweaver/config.json`, y no vuelve a preguntar. La respetan **los
comandos, la skill, la plantilla de arquitectura y los mensajes del CLI**.

```
$ npx un-specweaver init

  Idioma del proyecto:
    1) Espanol
    2) English
  > 2

  agents   claude-code, opencode (autodetected)
  language en (English)

▸ BMAD METHOD (planning)  [bmad]
```

Precedencia: `--lang` > lo guardado > pregunta si hay terminal > `es`.
Sin terminal (CI) nunca pregunta.

## El mapa del codigo (graphify)

Es parte del metodo, no una capacidad opcional. `init` deja cuatro cosas:

| Que | Como | Para que |
|---|---|---|
| el binario | `uv tool install graphifyy==<pin>` (o `pipx`) | `graphify query / affected / path` desde cualquier agente |
| la skill **dentro del proyecto** | `graphify install --project --platform <agente>` | `/graphify` en Claude Code y OpenCode, sin depender de `~/.claude` |
| el alcance | `.graphifyignore` (bloque marcado, va al repo) | el grafo es **solo codigo** |
| el grafo y su mantenimiento | `graphify update .` + `graphify hook install` | AST determinista; post-commit lo reconstruye solo |

**Por que solo codigo.** La tercera regla del metodo: cada dato tiene un solo dueño. La intencion
vive en el PRD, el contrato en los specs, el rationale en Engram, la estructura del codigo en el
grafo. Si el grafo ingiere los otros tres, los duplica — y ademas deja de servir para lo que
`/sw:adopt` lo necesita: contrastar la arquitectura **real** con la **declarada**. Un grafo que
leyo `architecture.md` responde con lo que el documento dice, no con lo que el codigo hace.

**Que hacen los comandos con el.** `/sw:change` corre `graphify affected` para medir el impacto
real de un requerimiento antes de clasificarlo; `/sw:bug` localiza el codigo del escenario y que
mas puede romper la correccion; `/sw:build` y `/sw:adopt` consultan antes de leer archivos a ciegas.
Las tres ramas siguen declaradas (hay grafo → consultar; no hay → `graphify update .`; no hay
graphify → seguir **diciendo que el mapa va a ser menos confiable**), porque el fallo que hay que
evitar es el silencioso.

**Los hooks.** `graphify install` registra hooks `PreToolUse` en `.claude/settings.json` que le
exigen al agente consultar el grafo antes de grepear o leer codigo. Se conservan, pero `init` los
**acota a codigo**: tal como vienen tambien disparan sobre `.md`, y leer el PRD no debe pedir
consultar un grafo que no lo contiene.

**Proyecto nuevo.** Sin codigo, `graphify update .` termina bien y no crea nada; `doctor` lo
reporta como "configurado; el grafo aparece con el primer codigo". No es un pendiente.

## Comandos del CLI

```bash
npx un-specweaver init [dir]          # monta el entorno completo
npx un-specweaver doctor [dir]        # salud, pasos pendientes y drift de vendors
npx un-specweaver bridge <epics.md>   # stories de BMAD -> changes de OpenSpec
npx un-specweaver context [dir]       # artefactos de planeacion, en sus rutas reales
npx un-specweaver history [FR-21]     # historia de un requisito, o ranking de los que mas cambian
npx un-specweaver close [ids|--done]  # cierra stories terminadas: valida y archiva su spec
npx un-specweaver status [dir]        # en que va: fases, changes, sprint, requisitos, decisiones
npx un-specweaver status --open       # lo mismo como .un-specweaver/dashboard.html, en el navegador
npx un-specweaver scan [dir]          # escanea un proyecto que ya existe y propone como adoptarlo
npx un-specweaver validate            # valida todos los specs (envuelve a OpenSpec)
npx un-specweaver memory              # estado de la memoria; `import` la trae, `share` la comparte
npx un-specweaver migrate             # muda un proyecto de 0.5.x al layout consolidado
npx un-specweaver reset               # quita TODO lo que la herramienta creo
npx un-specweaver vendors             # versiones pineadas
```

`context` existe porque BMAD escribe en rutas fechadas y configurables (`{planning_artifacts}`).
Lista brief, PRD, arquitectura, UX y `epics.md` donde de verdad quedaron, para que `/sw:build`
los cargue en vez de adivinarlos. Tambien lista los `.memlog.md` y las `sprint-change-proposal-*.md`.

`history` cruza tres fuentes que ya existian y nadie leia junto: los **`.memlog.md`** que BMAD
escribe al conversar (cada artefacto lleva el suyo, con entradas `(decision)`, `(change)`,
`(override)`, `(assumption)`… y el motivo escrito), las **propuestas de cambio de sprint** de
`bmad-correct-course` (tablas de impacto por FR), y el **`changelog.jsonl`** del puente. Sin
argumento, un ranking de los requisitos que mas han cambiado despues de nacer; con un id, la
linea de tiempo completa con archivo y motivo. Es una vista: no guarda nada. En un proyecto real
(150 entradas, 34 ids citados) el primero del ranking era un FR con un `(override)` que decia
exactamente por que se descarto lo que el asistente habia sugerido — y `/sw:change` no lo veia.

`status` en terminal es el resumen; `status --open` es **el dashboard**, pensado para responder
"¿como vamos?" a alguien que no conoce el metodo:

| Seccion | Que muestra |
|---|---|
| Nomenclatura | que es un FR, NFR, UX-DR, AD, epic, story, AC, spec, change, ola, revision, descarte. Abierta por defecto |
| ¿Como vamos? | anillos en cadena: FR / NFR / UX-DR completados → stories terminadas → specs cerradas → tareas hechas. Click en cualquiera abre un canvas a pantalla completa con **Completados / Pendientes** y cada item plegable (una story con su narrativa, requisitos, spec y criterios; una tarea con su seccion y su casilla). Debajo, la alerta de **requisitos inestables** (2+ cambios), que explica que significa y abre cada uno con su historial |
| Cuando se trabajo | un calendario por mes con cada dia coloreado por actividad registrada —commits de git, decisiones, cambios, corridas del puente, specs cerradas— y click en el dia para ver que paso |
| Esfuerzo por etapa | Brief, PRD, arquitectura, UX y cambios de alcance: cuantas decisiones, cambios, descartes y supuestos dejo cada una. Click en una barra abre las entradas; click en un documento (`prd.md`, `DESIGN.md`, el memlog…) lo abre renderizado. Debajo, la descomposicion: FR/NFR/UX-DR → epics → stories → specs → tareas |
| Flujo | cuatro columnas conectadas —requisitos, epics, stories, specs— con filtro por epic para proyectos largos (NFR y UX-DR ocultos por defecto). Click resalta el camino y abre el detalle; los requisitos inestables llevan su conteo en el bloque |
| Memoria del proyecto | pestañas: por etapa, historial paso a paso, decisiones clave (descartes primero), cambios y a que afectaron |

Todo sale de archivos que ya existen: el PRD y los memlogs de BMAD, `epics.md` (con los requisitos
eliminados tachados, que no cuentan), `trace.json`, `openspec/changes/` y `archive/`,
`changelog.jsonl`, el grafo de graphify, el `git log`. `--html` escribe un archivo
**autocontenido** —CSS y JS inline, sin CDN ni servidor— que se abre offline, en CI, o lo abre
un compañero sin instalar nada. Es una vista: **no guarda nada** y se regenera cada vez, asi
que va al `.gitignore`. Si algo se ve mal ahi, esta mal en la fuente. Se mantiene solo: `bridge`
y `close` lo regeneran al terminar, e `init` deja un hook de post-commit que lo rehace con cada
commit — una vista que solo se actualiza cuando alguien se acuerda es una vista vieja.

`close` existe porque el cierre dependia de la memoria del agente. `/sw:build` decia "archiva
cuando este entregado" y en un proyecto real quedaron 22 stories terminadas y **cero archivadas**:
sin `.un-specweaver/openspec/specs/` no hay linea base y `/sw:change` no tenia contra que medir el alcance. Ahora
es un comando: por cada change con todas las tareas marcadas corre `openspec validate --strict` y
`openspec archive`; el que no valida no se archiva. `doctor` y el dashboard avisan mientras haya
terminadas sin cerrar, y `/sw:build` lo invoca en su paso de cierre.

`init` acepta `--agents`, `--lang es|en`, `--dry-run`, `--yes`, `--force`, `--prune-extra`,
`--only`, `--skip`, `--keep-going`.

**`--dry-run` imprime el plan exacto** — cada comando, cada archivo, cada borrado — sin ejecutar
nada. El plan y la ejecucion salen del mismo codigo, asi que no puede mentir.

### Que hace `init`

1. `.gitignore`: bloque marcado con lo regenerable. Va **primero** para que un paso posterior
   que falle no deje vendor a medio instalar listo para commitear
2. Preflight: node ≥ 20.11, npx, curl, plataforma; `git` y `uv` como avisos (sin `uv` ni `pipx`,
   el paso de graphify se detiene y dice que instalar)
3. BMAD pineado, alcance del proyecto, solo el modulo de planeacion, idioma configurado
4. Poda de la frontera
5. BMAD escribe su salida en `.un-specweaver/bmad/` (`--output-folder`)
5b. `openspec init` **dentro de `.un-specweaver/`**, sin comandos de agente: la superficie son
   los `/sw:*`, y el CLI envuelve las invocaciones a OpenSpec
6. Engram: binario (Homebrew o `go install`) — un solo item que autorizar, no tres
7. `.un-specweaver/bin/engram` (el wrapper que fija la memoria al proyecto) y el servidor de
   memoria de cada agente apuntando a el. Si tenes el plugin global de Engram, lo dice
8. graphify pineado (via `uv` o `pipx`), la skill dentro del proyecto para cada agente,
   `.graphifyignore` (solo codigo), los hooks acotados, el grafo AST y el hook de post-commit
9. Los once comandos `/sw:*` en el formato de cada agente, la skill `un-specweaver` en todos los
   dirs de skills, y `docs/architecture-base.md`

### Prerequisitos que la herramienta NO resuelve sola

Engram vive en un tap de terceros y brew se niega a cargar formulas no confiables.
`un-specweaver` **detecta lo que falta y da el comando minimo**, pero no lo ejecuta: autorizar
una formula le da permiso de correr codigo de instalacion, y esa es una decision del usuario.

```
! Homebrew no confia en: gentleman-programming/tap/engram (formula)
  autoriza y vuelve a intentar:
       brew trust --formula gentleman-programming/tap/engram
       npx un-specweaver init
```

La confianza se mide **por item y por tipo**: `brew tap-info` reporta un tap como "Untrusted"
aunque una formula suya si este confiada, y `engram` esta publicado como formula **y** como cask.
Se lee `trust.json` y se pide solo lo que falta, en vez de confiar el tap entero.

El paso **falla** en vez de omitirse en silencio: reportar "listo" sobre algo que no ocurrio
seria mentir.

### Que bloquea que

`doctor` anota cada paso pendiente con lo que impide. No todo pendiente es un bloqueo:

| Paso | Bloquea |
|---|---|
| `bmad`, `bmad-prune`, `openspec`, `layer` | planear (`/sw:new`, `/sw:adopt`) |
| `engram-bin`, `engram-project`, `graphify-bin`, `graphify` | **solo** `/sw:build` — planear funciona sin ellos |
| `gitignore`, `dashboard-hook` | nada; higiene del repo y frescura del dashboard |

Sin esa distincion un agente se detiene por la memoria o el mapa del codigo antes siquiera de
levantar requerimientos, que es exactamente lo que pasaba antes.

### Que va al repo y que no

`init` escribe un bloque marcado en `.gitignore` (preserva lo que ya tuvieras, y re-ejecutar lo
reemplaza en vez de duplicarlo). En un proyecto real la diferencia es de **499 archivos a 7**:

| Al repo | Ignorado |
|---|---|
| `.un-specweaver/openspec/` — los specs son el producto | `.un-specweaver/engram/` — memoria: SQLite binario, no se mergea |
| `.un-specweaver/bmad/` — PRD, epics, memlogs | `.un-specweaver/local.json` — agentes, rutas y pasos de **esta** maquina |
| `.un-specweaver/config.json` (idioma), `trace.json`, `sprint-plan.md`, `changelog.jsonl` | `.un-specweaver/dashboard.html`, `.un-specweaver/bin/` — regenerables |
| `docs/architecture-base.md`, `.graphifyignore` | `_bmad/`, `node_modules/`, `graphify-out/` |
| | `.claude/skills/bmad-*/`, `.claude/commands/sw/`, y sus equivalentes en `.opencode/` |

Se ignora **por patron exacto, nunca `.claude/` entero**: tus propias skills y comandos siguen
versionados. Un companero clona, corre `npx un-specweaver init`, y reconstituye el tooling desde
el pin — el repo guarda especificaciones, no dependencias.

### Que se escribe fuera del proyecto

**Solo binarios.** Ni un archivo de configuracion tuyo se toca: no escribimos en `~/.claude`,
`~/.agents`, `~/.engram` ni en la config de ningun agente. Si ya tenias Engram o Gentle-AI
instalados, tu montaje global queda como estaba.

| Paso | Que escribe fuera |
|---|---|
| `engram-bin` | el binario de Engram (herramienta de sistema, via Homebrew o `go install`) |
| `graphify-bin` | el binario de graphify (aislado por `uv tool` o `pipx`) |

La version anterior escribia bastante mas: Gentle-AI registraba `~/.engram/`,
`~/.claude/mcp/engram.json` y la config MCP de cada agente. Por eso salio del montaje.

**Un limite que no podemos vencer y por eso se avisa:** si tenes el **plugin de Engram para
Claude Code**, sus herramientas viven en otro namespace (`mcp__plugin_engram_*`) y siguen
escribiendo en `~/.engram`. Un servidor de proyecto con el mismo nombre si gana sobre uno de
alcance de usuario, pero a un plugin no lo vence ninguna configuracion de proyecto. `doctor` lo
detecta y te da el comando para desactivarlo aqui.

Si no querés nada fuera del proyecto, corre `init --skip engram-bin,graphify-bin`: perdes la
memoria de decisiones y el mapa del codigo; todo lo demas funciona igual.

### Quitarlo todo

```bash
npx un-specweaver reset --dry-run    # lista exactamente que borraria
npx un-specweaver reset              # pide confirmacion escrita
```

El aislamiento nunca puede ser total —`_bmad/` lo instala el vendor en la raiz, y las skills y
comandos solo sirven dentro de `.claude/` y `.opencode/`—, asi que al menos quitarlo es **un
comando**: borra la carpeta del metodo, la instalacion de los vendors, la superficie de los
agentes, el bloque del `.gitignore` y la linea del hook. Lo tuyo no lo toca: tus skills, tu
`settings.json` y `docs/architecture-base.md` se quedan.

### Venir de 0.5.x

```bash
npx un-specweaver migrate --dry-run
npx un-specweaver migrate
```

Mueve `openspec/` y `_bmad-output/` dentro de `.un-specweaver/` **con `git mv`** (el historial de
cada archivo se conserva) y reescribe lo que apuntaba a las rutas viejas: la config de BMAD y el
origen en `trace.json`. Un proyecto sin migrar **se sigue leyendo**: la herramienta detecta el
layout anterior y lo usa, porque actualizar no puede romper un proyecto en silencio.

Es idempotente: volver a correrlo omite lo ya hecho.

### Adoptar un proyecto que ya existe

```bash
npx un-specweaver init     # el montaje, igual que en uno nuevo
npx un-specweaver scan     # que hay, que falta, que plan y que preguntas
/sw:adopt                  # en tu agente: lee el escaneo, pregunta y ejecuta
```

`scan` no adivina: lee el repo y reporta **evidencia** — lenguajes y cuantos archivos, si hay
tests, el stack por sus manifiestos, la estructura de primer nivel, la documentacion que ya existe
(distinguiendo ADRs), CI, e historia de git (commits, autores, si hay actividad reciente). Despues
dice **que le falta** a ese proyecto para el metodo y propone un plan donde cada paso lleva el
comando que lo hace y **los que ya estan hechos salen marcados**: adoptar dos veces no rehace nada.

Y termina con lo que el escaneo **no puede** saber, que es lo que de verdad cambia el trabajo:

> **¿Adoptamos el sistema entero o solo el area donde vas a trabajar?**
> Son 2.400 archivos. Especificar todo antes de tocar nada son semanas de escribir contratos de
> codigo que quiza nadie mire. Lo barato es una linea base **acotada**: el area donde vas a
> trabajar, y el resto entra cuando se toque.

Esa es la decision que hunde una adopcion si se toma por defecto, y por eso `/sw:adopt` **se
detiene** hasta que la respondas. Adoptar es incremental: lo que no se especifica hoy no queda
prohibido, queda pendiente de la story que lo toque. Ampliar el alcance despues es volver a correr
`/sw:adopt` sobre otra area.

Para el codigo que ya funciona, las stories que salen describen comportamiento existente: se
cierran con `close` y pasan a ser la linea base contra la que `/sw:change` mide todo lo que llegue
despues. No se vuelve a construir lo que ya existe.

### La memoria de un proyecto que ya existia

Un proyecto anterior a 0.6.0 tiene su memoria en la base global (`~/.engram`), etiquetada con
`--project`. Traerla a la del proyecto:

```bash
npx un-specweaver memory               # que hay aqui y que hay en la global
npx un-specweaver memory import --dry-run
npx un-specweaver memory import        # o: memory import <nombre-del-proyecto>
```

Exporta la base global (solo lectura), **filtra por proyecto** —las observaciones no dicen a que
proyecto pertenecen: se sigue por su sesion— e importa el resultado. La base global queda intacta.

Se niega si el proyecto ya tiene memoria propia, y esto no es cautela de mas: **`engram import`
deduplica observaciones y sesiones por id, pero no los prompts**. Importar dos veces los duplica.
Lo descubrimos duplicando 357 prompts en una base real; con `--force` se puede forzar igual.

### Compartir el rationale con el equipo

La base es SQLite binario y **se ignora**: dos personas guardando produce un conflicto que git no
puede resolver. Lo que sí se comparte es el formato de sincronizacion de engram — chunks
comprimidos + manifest — que va al repo como cualquier otro archivo.

**Vos, que tenes la memoria:**

```bash
npx un-specweaver memory share     # escribe .un-specweaver/.engram/{manifest.json,chunks/}
git add .un-specweaver/.engram && git commit -m "memoria del proyecto" && git push
```

**Tu companero, despues de clonar:**

```bash
npx un-specweaver init             # deja el wrapper y su base vacia
npx un-specweaver memory share --import
```

Y ya tiene las decisiones con su busqueda. Verificado de punta a punta: 24 observaciones, 3
sesiones y 112 prompts viajaron por git a un clon limpio.

Cada vez que quieras publicar lo nuevo, `memory share` otra vez y commitea; del otro lado,
`--import` tras el pull. Es **opt-in**: si nadie corre `share`, la memoria se queda local.

La carpeta se protege sola: `init` escribe `.un-specweaver/.gitignore` con `engram/`, `bin/`,
`local.json` y `dashboard.html`, asi que la base no se puede commitear por accidente ni aunque
falte el bloque del `.gitignore` de la raiz — pasó en una prueba con un `init --only`.

## El puente

```bash
npx un-specweaver bridge
npx @fission-ai/openspec validate --all --strict
```

Opciones: `--only 1.2` · `--epic 1` · `--dry-run` · `--force` · `--strict` · `--lang es|en` · `--normative shall|debe`

### Lo que el puente no destruye

Cuatro perdidas reproducidas y cerradas, todas verificadas contra OpenSpec 1.10:

| Situacion | Antes | Ahora |
|---|---|---|
| `bridge --only 1.2` | `trace.json` quedaba con **una** story | se fusiona por story: las demas conservan su entrada |
| `--force` sobre un change en curso | `tasks.md` volvia a `[ ]` | las casillas marcadas se conservan **por texto de tarea**; las que ya no existen se reportan |
| story ya **archivada** que cambia | salia como `ADDED` y OpenSpec rechazaba el archive (`already exists`) | sale como `MODIFIED`, con id `-r2`, `-r3`… y `revision` en `trace.json` |
| ¿que corrida regenero que? | nadie lo sabia | `changelog.jsonl`: fecha, opciones, hash del `epics.md`, changes escritos u omitidos, tareas conservadas y perdidas |

Sobre `MODIFIED` hay una regla de OpenSpec que conviene conocer: el bloque tiene que traer **todos
los escenarios actuales por nombre exacto**, y no permite quitar ninguno (protege contra perdida
silenciosa). Como el puente nombra los escenarios con el texto del `WHEN`, una story reescrita
cambiaria los nombres y el archive fallaria. Por eso, para un requisito ya archivado, **los nombres
archivados mandan**: coincidencia exacta primero, posicion despues; el contenido si se actualiza.
Si la story **perdio** un escenario, el puente falla antes de escribir y dice como salir (un change
manual `## REMOVED Requirements`, archivarlo, y volver a correr). Emitir un change que no se puede
archivar seria peor que no emitirlo.

`changelog.jsonl` es el unico archivo del puente con fecha, a proposito: `trace.json` y los changes
siguen siendo deterministas byte a byte.

### Mapeo

| BMAD | OpenSpec |
|---|---|
| `## Epic {N}: {titulo}` | capability → `specs/<kebab>/` |
| `### Story {N}.{M}` | **un change** → `changes/e{N}s{M}-<slug>/` |
| `So that {value}` | `proposal.md` → `## Why` |
| `I want {want}` | `proposal.md` → `## What Changes` + `### Requirement:` |
| bloque `Given/When/Then/And` | `#### Scenario:` + `- **GIVEN/WHEN/THEN/AND**` |
| FR Coverage Map | `.un-specweaver/trace.json` |
| story ya archivada, cambiada | `## MODIFIED Requirements`, change `<id>-r<N>` |
| cada corrida | una linea en `.un-specweaver/changelog.jsonl` |

Funciona en **espanol e ingles**, autodetectado por puntaje de tokens (una palabra suelta que
"parezca" espanola no voltea un documento ingles). `--lang` fuerza el idioma.

## Decisiones no obvias

Todas verificadas contra los CLIs reales, no contra la documentacion.

- **`--no-shims` no existe.** Esta en los docs de BMAD; el binario 6.11.0 responde
  `unknown option`. Por eso los shims deprecados se podan por ruta.
- **`openspec validate --strict` exige el literal `SHALL`/`MUST`** aunque el spec este en espanol.
  El modo por defecto emite prosa espanola con el keyword intacto; `--normative debe` lee mejor
  pero obliga a soltar `--strict`.
- **La memoria de Engram se aisla con `ENGRAM_DATA_DIR`, no con `--project`.** Verificado contra
  engram 1.20: esa variable mueve la **base entera** al proyecto (con `--project` se compartia
  `~/.engram/engram.db` y solo cambiaba la etiqueta). Exige ruta **absoluta**, y una ruta absoluta
  en un archivo que va al repo es de una maquina: por eso `init` genera `.un-specweaver/bin/engram`,
  un wrapper que resuelve su propia ubicacion, y los agentes lo invocan por ruta relativa —
  Claude Code la resuelve contra la raiz del proyecto y OpenCode fusiona el config del proyecto
  sobre el global. Limite declarado: el **plugin** de Engram para Claude Code vive en otro
  namespace y ninguna configuracion de proyecto lo vence; un servidor de proyecto con el mismo
  nombre si gana sobre uno de alcance de usuario. Se detecta y se avisa.
- **OpenSpec no busca hacia arriba.** Verificado: con `openspec/` dentro de `.un-specweaver/`,
  sus comandos fallan desde la raiz y funcionan con `cwd` ahi. Por eso el CLI los envuelve
  (`un-specweaver validate`, `close`) y los comandos del agente nunca los invocan a mano.
- **BMAD muda su salida pero no su instalacion.** `--output-folder` lleva PRD, epics y memlogs a
  `.un-specweaver/bmad/`. Probamos `--directory .un-specweaver` para mudar tambien `_bmad/`: sus
  skills terminan en `.un-specweaver/.claude/skills/`, donde el agente **no las ve**. Los
  directorios destino los fija BMAD, asi que `_bmad/` se queda en la raiz, ignorado y regenerable.
- **El grafo de graphify es solo de codigo, y se instala en el proyecto.** `graphify update` es
  AST puro (determinista, sin LLM, solo extensiones de codigo); en un proyecto sin codigo termina
  en exit 0 sin crear nada, asi que greenfield no rompe `init`. `graphify install --project` deja
  la skill en `.claude/skills/graphify` y `.opencode/skills/graphify` (no en `.agents/`, que es
  donde BMAD manda las de OpenCode), agrega `## graphify` a `CLAUDE.md`/`AGENTS.md`, y en Claude
  Code registra hooks `PreToolUse` que tambien disparan sobre `.md`: `init` los acota a codigo con
  un reemplazo exacto, y si una version futura cambia el texto, no los toca.
- **Cada vendor nombra los agentes distinto** (BMAD `claude-code`, OpenSpec `claude`,
  Gentle `claude-code`). El mapa en `src/vendors.json` es el unico lugar donde eso se sabe.
- **`uv` es un prerequisito real de BMAD** que su documentacion no destaca: el instalador lo
  verifica en su primera linea. No bloquea, pero callarlo seria mentir.
- **Cada agente ubica y formatea los comandos distinto.** Claude Code:
  `.claude/commands/<ns>/<n>.md` con `name`/`description`/`allowed-tools`. OpenCode:
  `.opencode/commands/<ns>-<n>.md` con solo `description`. Las referencias cruzadas dentro del
  cuerpo se reescriben (`/sw:change` → `/sw-change`) para que un comando no le diga al usuario
  que invoque algo que en su agente no existe.
- **Una story = un change**, no un epic = un change. Las stories de BMAD estan dimensionadas para
  un solo dev agent, que es la unidad que consume el SDD.
- **Solo la primera story de un epic declara `## Purpose`.** El resto emite `ADDED Requirements`
  sobre la misma capability — todas ADDED, nunca MODIFIED: cada story agrega un requisito distinto.
- **La narrativa se pasa a tercera persona.** BMAD escribe "registrarme usando mi NIT"; un requisito
  normativo no habla en primera persona. En ingles ademas se quita el infinitivo duplicado
  ("allow X to to publish").
- **El grafo de dependencias no se inventa.** Stories del mismo epic van en secuencia (comparten
  capability); epics distintos en paralelo; las dependencias cruzadas solo se detectan si estan
  escritas en el texto. Ese limite se reporta en `sprint-plan.md` en vez de fingir precision.

## Fuente de verdad por tipo de dato

El detalle de la tercera regla. Tres memorias solapadas (BMAD + Engram + graphify) gastan tokens y se contradicen.
Una sola duena por dato:

| Dato | Duena |
|---|---|
| Intencion de producto (el *que* de negocio) | `.un-specweaver/bmad/` |
| Contrato de comportamiento (el *que* tecnico) | `.un-specweaver/openspec/specs/` |
| Decisiones y rationale (el *por que*) | Engram, en `.un-specweaver/engram/` |
| Estructura del codigo (el *donde*) | grafo de graphify |
| Trazabilidad FR ↔ story ↔ change | `.un-specweaver/trace.json` |
| Historia de un requisito (que cambio y por que) | `.memlog.md` + `sprint-change-proposal-*.md` + `changelog.jsonl`, via `history` |
| Arquitectura de la organizacion | `docs/architecture-base.md` |

## Desarrollo

```bash
npm test                    # 157 tests
npm pack                    # ~23 kB
node bin/un-specweaver.mjs init --dry-run
```

`src/steps.mjs` separa **plan** (puro, testeable) de **ejecucion**. Un paso nuevo se agrega ahi
implementando `status()` y `plan()`; `--dry-run`, la idempotencia y `doctor` salen gratis.

## Estado

| Pieza | Estado |
|---|---|
| `bridge/` — story → change | **funciona**, es/en, validado contra `openspec validate --all --strict`; `MODIFIED` + revisiones + ledger verificados contra `openspec archive` |
| `init` / `doctor` — instalador multi-agente | **funciona**, probado end-to-end desde el tarball |
| 11 comandos `/sw:*` | **funciona**, es/en, Claude Code + OpenCode |
| Skill `un-specweaver` | **funciona**, es/en, todos los agentes |
| `history` — decisiones por requisito | **funciona** — memlogs + propuestas de cambio + ledger; probado sobre un proyecto real |
| `status` / dashboard | **funciona** — terminal y dashboard HTML autocontenido de gerencia, es/en, probado sobre un proyecto real; se regenera con bridge, close y cada commit |
| `close` — cerrar stories | **funciona** — valida y archiva; 22 stories cerradas en un proyecto real |
| Mensajes del CLI bilingües | **funciona**, 86 cadenas, es/en |
| graphify (mapa del codigo, solo codigo) | **funciona** — instalado, acotado, grafo AST y hook; verificado contra graphify 0.8.37 |
| Engram (instalacion) | **funciona** — Homebrew o `go install`, un solo item que autorizar |
| Engram (memoria dentro del proyecto) | **funciona** — `ENGRAM_DATA_DIR` + wrapper, verificado contra engram 1.20 |
| `reset` / `migrate` | **funciona** — probados sobre un proyecto montado y uno de 0.5.x |
| `scan` + `/sw:adopt` | **funciona** — evidencia, plan con pasos ya hechos marcados y preguntas de alcance; probado sobre dos proyectos reales |
| `memory import` / `share` | **funciona** — 24 observaciones traidas de la base global a la del proyecto, sin tocar la global |
| Gentle-AI | **fuera del montaje**: no se instala ni se configura; si esta en el PATH, sus skills se ofrecen |
