# DAEMONS Server: any computer a host of the house's mind

*DRAFT, 2026-11-24. The shape is decided (section 2); the small proof in section 9 is built in its own repository,
CodeMusic/daemons-server. Its name is for now: the user is leaning towards **DAEMONS Neuron** and will return to it
(section 10).*

The user, 2026-11-24: *"I would like to make a DAEMONs Server application, when installed you have options of how u
want to participate, but it essentially makes your computer a neuro host ... it should be for Mac first, but also Linux
and Windows. It should have a nice dashboard, and it allows you to make simple llm request to the network too as a
reward for donating your cycles."*

## 1. What it is, in one picture

The companion's mind already runs on more than one machine: the Tiiny and LiteLLM on roverbyteseer, the AX630C's NPU,
THE MESH's processing nodes (C-360, `procmesh.ts`), THE HANDS on a Mac, a phone lending its model. Each of those was
set up by hand, by someone who could read a shell script. **DAEMONS Server is the same thing as an app anyone can
install**: it makes the computer a *host* -- in BRAIN.md's words, a hemisphere with a connectome entry -- that serves
the regions its owner allows, when its owner allows, and pays them back in requests to the network.

```
   this computer                                        the household                 THE COMMONS (opt-in)
 +-------------------------------+                  +---------------------+        +------------------------+
 | DAEMONS Server                |  dials out only  | the hub              |        | api.daemons.codemusic  |
 |  agent: the corpus callosum --|----------------->|  thalamus, THE MESH  |<------>|  .ca: other homes'     |
 |  limits, schedule, sandbox    |  (paired key)    |  ARETE's ledger      |        |  signed jobs, ARETE    |
 |  workers: process, build,     |                  +---------------------+        +------------------------+
 |  think, remember              |
 |  dashboard on localhost       |  <- the owner: switches, limits, what it did, ARETE, ASK
 |  tray (menu bar)              |
 +-------------------------------+
```

**Nothing new listens.** As THE MESH's nodes and THE HANDS do today, the host dials out to its hub with a paired key
and asks for work; the only port it opens is its dashboard, on `127.0.0.1`.

## 2. Decided (the user, 2026-11-24, by multiple choice)

| | Decided |
|---|---|
| **Kinds of work** | **All four, each a switch the owner turns on**: processing (THE MESH's jobs), builds (the Pi program, C-515), thinking (the cortex's regions on a local model), and embeddings and night work (the hippocampus's `recall` and `consolidate`) |
| **When** | **The owner's choice, three modes**: *idle and plugged in* (the default), *scheduled hours*, or *always, under caps*. Every mode keeps the caps (section 4) |
| **The reward** | **ARETE**, on PRAXIS's ledger (daemons-praxis): work done pays ARETE as ledger entries, a request to the network spends it |
| **Who may join** | **Household by default, always allowed.** The first time the owner opens a networked feature they are shown THE COMMONS's terms; once they accept, the host may also take **invited, signed jobs** from other homes. A person who never plays with others stays household only |
| **The word for beyond the house** | **THE COMMONS** -- the name today's network of homes already has. "Join THE COMMONS" is the one door to the `world` ring |
| **The name** | **DAEMONS Server, for now.** The user is leaning towards DAEMONS Neuron and will decide another day |
| **Where the code lives** | **A new public repository, CodeMusic/daemons-server**, pinning what it shares (PRAXIS, the brain's signal) by tag, as the companion pins daemons-praxis |
| **The stack** | **A Node agent, a small tray and a web dashboard on localhost**, Mac first; packaged later as a LaunchAgent and a `.pkg`, a systemd unit, and a Windows service |

## 3. How a host participates

### 3.1 The four kinds of work

Each kind is a **worker** in the agent, off until its switch is on. A worker says what it can do in the host's
connectome entry (BRAIN.md 3); the hub's thalamus routes to it by the score the house already uses,
`power x reliability x free`.

| kind | BRAIN.md region | what runs | what it needs on the host | first job |
|---|---|---|---|---|
| **Processing** | (THE MESH; no region: plain work) | THE MESH's jobs, today ffmpeg: files in by `@in:`, files out by `@out:`, nothing else named | ffmpeg (found, or offered as a download) | the hub's sleep-sound conversions and exports (C-334, C-358) |
| **Builds** | basal ganglia's `act`, on a host's body | a build of one tagged commit of a public repository, by a recipe in that repository, in a container; the result signed by the host and checked again by the hub | a container runtime (Docker, Podman, or Apple's `container`) | **the Pi program (C-515)**: GitHub builds it while the repository is public; if that ever costs money, the job falls to a volunteer host -- often roverbyteseer, others as they join |
| **Thinking** | cortex: `speak`, `comprehend`, `think`; salience: `appraise`; auditory `hear`; motor speech `voice` | a model the host already has (Ollama, LM Studio, an MLX server, llama.cpp -- found on its usual port) or one the dashboard offers to fetch | a GPU or NPU worth lending; the dashboard measures one prompt before offering it | the household's talk when the Tiiny is busy; `appraise` (System One, JEV.md) on a small model |
| **Memory** | hippocampus: `recall` (embeddings), `consolidate` (the night) | an embedding model; a night's replay | as thinking | the night's embeddings when the Tiiny is asleep or busy |

**What a worker never runs**: anything not named by its kind. A processing worker runs ffmpeg with the job's own files
and nothing else (`procmesh.ts`'s `safeArgs`, kept); a build worker runs a recipe only from a signed manifest (section
5); a thinking worker answers one signal and keeps nothing.

### 3.2 When it works

| mode | it works when | default caps |
|---|---|---|
| **Idle and plugged in** (default) | the owner has not touched the keyboard or mouse for a few minutes (5, DRAFT) **and** the computer is on power. It stops the moment they return, and lets the job be given to the next host (THE MESH already hedges) | half the cores, a quarter of the memory, the GPU and NPU only while idle |
| **Scheduled hours** | inside the hours the owner picks (overnight, say), whether or not they are at the keyboard | the same |
| **Always, under caps** | any time, at the lowest priority (`nice` 15, as THE MESH runs ffmpeg) | the same |

**In every mode the host rests**: on battery below a level the owner sets; when memory is under pressure (the rule
`mesh_worker_main.ts` already keeps, after roverbyteseer's swap filled on 2026-11-14); when the machine is hot; and
when the owner presses PAUSE, from the tray or the dashboard, for an hour, until tomorrow, or until turned back on.

### 3.3 Which networks

Household work travels over the house's own network and the tailnet, as THE MESH's does now. THE COMMONS's work goes
through `api.daemons.codemusic.ca` (C-278) and needs nothing opened on the owner's router. **On a metered or
unfamiliar network** (a phone's hotspot, a café's Wi-Fi) the host takes no work that moves files, by default.

## 4. The limits, said once

| limit | default | the owner may set |
|---|---|---|
| CPU | half the cores | 1 to all |
| memory | a quarter of it | a number |
| GPU / NPU | idle only | never, idle only, always |
| disk for jobs | 5 GB, cleared after each job | a number |
| network | not on metered networks | on or off |
| battery | never on battery | a level |
| a job's longest run | THE MESH's: twice what it should take, then passed over | -- |

## 5. Trust and safety

**Two circles.** The **household** (the owner's own hub, paired with a code as THE MESH's nodes are) is always allowed
and is where a host starts. **THE COMMONS** opens only after the owner reads and accepts its terms, the first time
they reach a networked feature; until then the host takes no job from anyone outside the house and sends nothing out.

**The ring is the rule** (BRAIN.md 3). A signal carrying anything of a person -- a daemon's self, a journal, a dream,
what was said -- is `home` at most, and the thalamus never routes it to a host outside that person's household. So a
host in THE COMMONS only ever sees `world` work: a build of a public commit, a conversion of a file its owner chose to
share, a System One question about game data. **It never sees another household's daemon, words or saves.**

**Jobs from THE COMMONS are signed.** Each kind of job is named in a **manifest** signed by the project's release key
(the same key that will sign the host app's updates): the commands a kind may run, its container image by digest, its
limits. A host runs a COMMONS job only if its manifest's signature checks and its image digest matches. A household
job is trusted as the household's hub is, and still runs only what its kind names.

**Sandboxed, every time.** Processing runs in a folder of its own that is removed after the job (as now), and on a Mac
under `sandbox-exec` with no network and no access outside that folder; builds run in a container with no network
after fetching the commit; thinking talks only to the local model's port.

**Results are checked, not trusted.** A build is reproducible by recipe: the hub (or a second host) rebuilds a sample
and compares hashes, as `check_fresh_clone.py` does for the game; a host whose build differs loses its reliability
and its ARETE for that job. A conversion is checked by its output's length and kind. A thought is the one thing that
cannot be checked: so thinking for THE COMMONS answers only `world` signals, and its answers are marked by the host
that made them.

**What a host can see**, said plainly on the dashboard: the job's kind, its files while it runs, its size and how long
it took. **What the network can see of the host**: its name (chosen, from the word lists of ACCOUNTS.md in THE
COMMONS), its caps, its power, its load and whether it is fresh. Never its files, its user, its other programs.

**The app itself is signed**: a Developer ID and notarisation on the Mac, a signing certificate on Windows, a signed
apt/rpm repository on Linux; it updates itself only from a signed release (as C-515's Pi program does).

## 6. The reward: ARETE

**Work pays ARETE; asking spends it.** Each finished job is an ARETE award on PRAXIS's ledger, its id made from the job
(`mesh:<job id>`), so a job that two hosts both finish (THE MESH's hedge) pays only the one whose result was kept, and
a replica that hears it twice pays once -- PRAXIS's rule already. What a job pays is its kind's rate x the work it took
on a host of power 1 (THE MESH's `expectMs`), so a fast machine is not paid more for the same job, only given more of
them.

**A request spends it.** The dashboard's **ASK** sends one prompt to the network -- the household's thalamus first,
THE COMMONS's when joined -- and spends ARETE by its length. **A small allowance a day** (DRAFT: ten short requests)
lets a new host try it before it has done any work. A household's own members ask their own hub as they do today,
and pay nothing: ARETE is the currency between households, and the measure of what a host has given at home.

**Rates, the allowance and what ARETE buys are DRAFT** until the user sets them.

## 7. The dashboard

One page on `http://127.0.0.1:<port>`, opened from the tray:

- **NOW**: working or resting, and why (idle, plugged in, in hours, paused, memory pressure); the job in hand.
- **WORK**: the four switches, each with what it needs and whether the host has it (ffmpeg found, a model found, a
  container runtime found).
- **WHEN**: the three modes and the limits of section 4.
- **CIRCLES**: the household it is paired with; THE COMMONS, with its terms, joined or not.
- **WHAT IT DID**: the jobs, each with its kind, how long, and the ARETE it earned.
- **ARETE and ASK**: the balance, the allowance left today, and one box to ask the network.

## 8. How it is built

**The agent is TypeScript on Node 22**, one process, no native modules, so one codebase runs on all three systems:

| part | Mac (first) | Linux | Windows |
|---|---|---|---|
| idle time | `ioreg -c IOHIDSystem` (`HIDIdleTime`) | `xprintidle` or logind's `IdleHint` | `GetLastInputInfo` (a tiny helper) |
| on power | `pmset -g batt` | `/sys/class/power_supply` | `GetSystemPowerStatus` |
| memory pressure | `memory_pressure` (as THE MESH) | `/proc/pressure/memory` | performance counters |
| sandbox | `sandbox-exec` | bubblewrap | a job object and a low-rights user |
| runs at login | a LaunchAgent, then a `.pkg` | a systemd user unit, then `.deb` / `.rpm` | a service, then an MSI |
| tray | a small Swift menu-bar app talking to the agent | an AppIndicator | a notification-area icon |

**What it shares with the companion** is a protocol, not a path: THE MESH's routes (`/api/mesh/take`, `/in`, `/out`,
`/done`), the brain's `Signal` and connectome entry (`server/src/brain/signal.ts`), PRAXIS's events. The repository
pins daemons-praxis by tag; BRAIN.md 8 says the signal moves to a repository of its own once a second one needs it --
**daemons-server is that second one**.

## 9. The proof (built 2026-11-24)

**CodeMusic/daemons-server**, the agent's first slice: a Mac host that pairs with the household's hub, **joins THE
MESH as a processing node**, works only in the mode its owner chose (idle and plugged in by default), rests under
memory pressure, and shows a **dashboard on localhost** with NOW, WORK, WHEN, CIRCLES and WHAT IT DID. Builds,
thinking, memory, THE COMMONS, ARETE, ASK and the tray are switches drawn on the page and marked *not yet*. Its
README says how to run it.

## 10. Still to decide

- **The name**: DAEMONS Server for now; DAEMONS Neuron and other neuroscience words to be weighed (the user, another day).
- **ARETE's rates**, the daily allowance, and whether ARETE earned at home may be spent in THE COMMONS.
- **THE COMMONS's terms**: what a host agrees to, written with ACCOUNTS.md's before it opens.
- **The release key**: who holds it, where, and how a manifest is signed.

## Tickets

*Opened 2026-11-24 under the companion's `C-` ids, lane hub.*

| id | what |
|---|---|
| C-538 | the parent: DAEMONS Server |
| C-539 | the proof (section 9), built in CodeMusic/daemons-server |
| C-540 | WHEN: the three modes, PAUSE and the limits, on every system |
| C-541 | builds: the Pi program (C-515) built by a volunteer host |
| C-542 | thinking: a local model served as cortex and salience regions |
| C-543 | memory: the hippocampus's recall and consolidate |
| C-544 | ARETE: work pays, ASK spends |
| C-545 | THE COMMONS: terms on first networked use, then invited, signed jobs |
| C-546 | the sandbox, per job and per system |
| C-547 | the tray, packaging and signed updates |
| C-548 | the name |
