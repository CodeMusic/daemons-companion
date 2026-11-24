# THE BRAIN: one architecture for every AI harness

*DRAFT, 2026-11-24. The shape is approved (section 9); nothing is built beyond the small proof in section 8, and existing code moves only by the nightly refactor (section 10).*

The user, 2026-11-24: *"any AI harnesses or AI we write for ANY of these (tiiny, ax630 compute kit, ax630 hat, etc) --
THEY ALL SHOULD be in neuroscience psychology code ... I want the AI stuff architected like the architecture of the
human brain."*

Today the companion thinks in pieces: the Tiiny and LiteLLM on roverbyteseer, the AX630C's StackFlow units on the hub's
Module LLM and on the LLM630 Kit, n8n's workflows, THE MESH's processing nodes, THE HANDS, the AI playtester in
`engineAi`, a phone's own model. Each found its own way to be asked, to be routed to and to fail over. This page gives
them **one shape**: a brain with named regions, each region **one interface that is the same on every host**, and a
table of which hosts can run which region. A new board, a new model or a new harness then has one question to answer:
*which regions does it run?*

## 1. Where the vocabulary comes from

**Not invented here: carried forward from the user's own projects**, all public under CodeMusic.

| project | what it named | what we keep |
|---|---|---|
| **publicCodeMusAIgpt** (the GPT-2 port "written through a psychology and neuroscience lens") | `Cortex` (the model), `ThoughtProcessor` (a block), `TemporalAttention`, `Neuron`, `NeuralNetwork`, `CognitiveClarifier` (the norm), `NeuralCircuitSettings`, `dendrites_input`, synapses for parameters, `loadMemories` for weights; a LanguageCortex beside an EmotionCortex | **inside** a model we wrap or train, the same words: input is dendrites, output axons, a model a cortex |
| **RoverByte** (`RoverCodeBase/src/`, the robot dog's ESP32 code) | a folder per cortex -- PrefrontalCortex, VisualCortex, AuditoryCortex, SomatosensoryCortex, **PsychicCortex** (Wi-Fi, NFC, IR), MotorCortex, GameCortex -- joined by the **CorpusCallosum**'s `SynapticPathways`; and five words for what any code does: **Perception** (in), **Cognition** (deciding), **Expression** (out), **Synesthesia** (one sense as another), **Proprioception** (the body's own state); nightly training as the AI's "dreams" | the five words become the five **modes** of every signal (section 3); PsychicCortex keeps the radios |
| **PenphinMind** (the AX630C's first harness, on a Pi) | `Mind/` by lobe and region, each with an `*_area` and an `integration_area`: Thalamus (`sensory_relay`, `motor_relay`, `reticular`, `alerting`), LimbicSystem (Amygdala, Hippocampus with episodic / semantic / working / spatial areas, MemoryConsolidation, MotivationNetwork, EmotionalRegulation), Subcortex/BasalGanglia (`task_manager`, `autopilot`), Cerebellum (motor coordination, vestibular, learning), FrontalLobe (Broca, Wernicke, the prefrontal areas), the `neurocortical_bridge` to the AX630C; a **BicameralMind** of perspectives, the red dolphin's logic and the blue penguin's intuition; its rule: a cortex talks only to its own hemisphere, and across only through the CorpusCallosum | the regions themselves, and the rule (section 4) |
| **RoverSeer / RoverSeerApi** (the Pi 5 that "sees and acts", the Mac's silicon server) | `ProtoConsciousness`: an `EmotionalState` of valence and arousal, a `CognitiveFrame`, cognitive distortions caught before answering | the amygdala's two numbers; reappraisal as a later area |

**And the companion's own rule, kept** (C-387, `LAYOUT.md`): the code has two vocabularies, **MIND** (who a daemon is:
its feelings, self, dreams, memory) and **MACHINE** (the thinkers, endpoints, routing). This page proposes the
plainest reading of the user's words against it: **psychology for the mind, neuroscience for the machine.** The
daemon's feelings stay `feelings.ts`; the machinery that produces and carries them becomes anatomy. A psychological
module still never imports an anatomical one: it is *handed* a region, as it is handed a `Writer` today.

## 2. The shape: two roads, and the rest

```
              senses (PERCEPTION)                                        body (EXPRESSION)
   ears  eyes  touch  motion  the save  a message                  voice  screen  LEDs  actions  the game's keys
     |     |     |      |        |         |                         ^      ^      ^      ^        ^
     v     v     v      v        v         v                         |      |      |      |        |
  +--------------------------------------------+      reflex      +-------------------------------------+
  | BRAINSTEM  vitals, reflexes, sleep and wake |---------------->| MOTOR: the basal ganglia's choice,   |
  +--------------------------------------------+   (no model)     | timed by the cerebellum             |
                     |                                            +-------------------------------------+
                     v                                                          ^
  +--------------------------------------------+                               |
  | THALAMUS  relays, gates, attends, routes    |                               |
  +--------------------------------------------+                               |
        | the low road (fast)            | the high road (slow)                 |
        v                                v                                      |
  +--------------------------+   +-------------------------------------+       |
  | SALIENCE NETWORK         |   | CORTEX                              |       |
  | + AMYGDALA               |-->|  prefrontal: deliberate, plan       |-------+
  | System One: typed        |   |  language: Broca writes, Wernicke   |
  | answers in milliseconds  |   |  understands; auditory, visual      |
  +--------------------------+   +-------------------------------------+
        |   affect tags                    ^  recall        | encode
        v                                  |                v
  +--------------------------------------------+   +--------------------------------+
  | HIPPOCAMPUS  episodes now, consolidated at |   | HYPOTHALAMUS  drives, the clock |
  | night into the cortex (the dreams)          |   | (when the night is)             |
  +--------------------------------------------+   +--------------------------------+
```

**The two roads are LeDoux's** (the amygdala's quick, crude route from the thalamus, and the slow, detailed one through
the cortex), and they are the same idea as **Kahneman's System One and System Two**, which is what the Jev research
(`docs/research/JEV.md`) is about. The thalamus sends a stimulus down both at once when someone is waiting: the low
road answers typed questions in milliseconds (*is this a care action? does it need the cortex? is the person upset?*)
and can act on its own -- a reflex, a canned line, a named action -- or tell the high road how much to think (which
length of self, `self.ts`: short, day or full). The high road writes the words. That is what `thoughtroute.ts`'s hedge
already does for minds of different speeds; here it gets its name and a reason.

## 3. One signal, the same everywhere

Every region is reached the same way on every host: by a **signal**, a small JSON object, answered by a **response**.
On a board it is one line over the link it already has; between computers it is an HTTP POST; to the AX630C it goes
through the **neurocortical bridge** (PenphinMind's name), which speaks StackFlow.

```ts
type Mode = "perception" | "cognition" | "expression" | "proprioception" | "synesthesia";   // RoverByte's five
type Ring = "body" | "home" | "world";   // how far it may travel (below)

type Signal = {
  id: string;            // UUIDv7, as PRAXIS's events
  region: Region;        // "thalamus", "salience", "cortex.language", ... (section 5)
  verb: string;          // the region's own verb: "appraise", "think", "hear", "encode", "select", ...
  mode: Mode;
  ring: Ring;
  from: string;          // the host that sent it ("cardputer-zero", "hub", ...)
  at: string;            // ISO time
  deadlineMs?: number;   // when an answer stops being useful (a person waiting: short)
  salience?: number;     // 0..1, set by the low road; the thalamus attends to the highest first
  body: unknown;         // the verb's own arguments
};
type Response = { id: string; ok: boolean; by: string; ms: number; body?: unknown; error?: string };
```

**The ring is the blood-brain barrier.** `body`: never leaves the device (a reflex, the Kit's offline talk). `home`:
the house's own machines and the tailnet (the hub, roverbyteseer, the Tiiny, the Kit). `world`: may leave the house
(the cloud, Jev). A signal carrying anything of a person -- the daemon's self, a journal, a dream, what was said -- is
`home` at most, and the thalamus refuses to route it further. It is C-307's "only at home" ring and MIND.md's "what
leaves the house", made one field.

**Each host says what it runs: its connectome entry.** `GET /brain/connectome` (or the board's HELLO) answers with the
regions it serves, each with its verbs, its POWER and its ring. THE MESH's nodes (C-360, `procmesh.ts`) already say
their CAPS, cores, speed and load: a connectome entry is that, named by region. The hub's thalamus keeps them all.

## 4. Hemispheres and the corpus callosum

**A host is a hemisphere.** Regions on one host call each other directly; **across hosts, only through the CORPUS
CALLOSUM** -- the one transport (`SynapticPathways`, after RoverByte and PenphinMind), which pairs, authenticates,
times out and logs. It is PenphinMind's rule, and it is the rule THE MESH, THE HANDS and the hub's relay already keep
(each dials out with a paired key; nothing new listens).

**The Cardputer Zero and its LLM630 Kit are the plainest pair of hemispheres**: the Zero has the senses, the screen and
the game (perception and expression), the Kit has the NPU (cognition), and the USB cable's network between them is
their corpus callosum (C-458). Cut it and each half goes on alone, as section 7 says.

## 5. The regions

Each region: what it does in the brain, what it does here, its verbs (the interface), what exists today, and where it
can run. **Every verb's name and argument is DRAFT until the user approves this page.**

### 5.1 BRAINSTEM: vitals, reflexes, sleep and wake

The medulla keeps the heart beating without asking the cortex. Here: the device's own state and the responses that need
no model.

- `vitals` (proprioception) -> `{ cell, charging, heat, load, memFreeMb, awake, link }`
- `reflex` (expression) -> a response wired in, under 10 ms, **never routed off the device** (ring `body`): a button's
  sound, the face blinking, the daemon's flinch at a fall
- `sleep` / `wake` -- for a part of the body: the Kit's units (C-459's `mayWake`)

**Today**: the Kit's agent `kitd.py` (cell, heat, hotspot), `kit/policy.h`'s wake rule, every board's battery read.
**Hosts**: every one, ESP32 included. It is the only region every host must have.

### 5.2 HYPOTHALAMUS: drives and the clock

Hunger, thirst, temperature, and the suprachiasmatic nucleus's day. Here: the body's drives as signals -- the care
needs (fed, watered, trained, rested), RESTLESS -- and **the circadian clock**: when the night is, when the wake is,
when the hippocampus may consolidate. The drives' *meaning* stays psychology (`life.ts`, `care.ts`, `feelings.ts`); the
hypothalamus only says the numbers and the time.

- `drives` (proprioception) -> the needs, 0-100
- `clock` (proprioception) -> `{ phase: "day" | "dusk" | "night" | "wake", nextWake }`

**Today**: `persona.ts`'s WAKE, `machine/schedule.ts`, the watch's stillness at night (C-201). **Hosts**: the hub (the
truth), every device (a copy, for offline).

### 5.3 THALAMUS: relay, gate, attend, route

Every sense but smell passes through the thalamus to the cortex; its reticular nucleus gates what gets through. Here:
**the router.** Every signal that is not a reflex goes to the thalamus, which picks the host for its region.

- `relay` (any mode) -> sends a signal to the best host for its region, and returns its response
- `attend` -- the order: **salience first, then a person in hand** (`talkjobs.ts`'s `inHand`), then reading, then chatter
- `gate` -- the reticular nucleus: drop or hold a signal when the region is asleep, the ring forbids it, or the
  deadline cannot be met (the cerebellum's prediction says so)

Its score is the one the house already uses, `power x reliability x free` (`thoughtroute.ts`, `procmesh.ts`), with two
more terms: the ring filters before the score, and a host the cerebellum predicts will miss the deadline is passed.
**Today**: `thoughtroute.ts`, `tiinyfirst.ts`, `procmesh.ts`'s router, `talkjobs.ts`, the Zero's `kit::Via`
(Best, Kit, Mind). **Hosts**: the hub (the house's); every Pi device (its own pair's, when the hub is away); the phone
(when it hosts alone, C-111). An ESP32's thalamus is one choice: this board, or the hub.

### 5.4 SALIENCE NETWORK and AMYGDALA: the low road (System One)

The anterior insula and the cingulate decide what matters now; the amygdala tags it with feeling, fast and crude.
Here: **typed questions answered with probabilities**, never sentences -- Jev's four kinds of question, which the
research found run locally through TypeSafe's MIT adapter on any OpenAI-shaped model.

- `appraise` (cognition) -> body `{ state, questions: [{ kind: "noul" | "choice" | "score" | "box", ask, options?, legend? }] }`,
  answers `[{ p? , choice?, probs?, score?, box?, confidence }]`
- `affect` (proprioception) -> `{ valence, arousal }` (RoverSeerApi's two) plus the daemon's five from `feelings.ts`
- `tag` -- an episode's weight for the hippocampus: what moved the daemon is remembered longer (KEPT, C-253)

**What it is asked, first**: is this a care action, a goal check-in, a game question, small talk? does it need the
cortex, and how much self? is the person upset (a Score the feelings can read)? For the playtester and THE HANDS: stuck
or not, which menu row, run or fight. **Today**: nothing typed; `hotwords.ts` and the boards' keyword matches are its
crudest form. **Hosts**: the Tiiny (`tiiny-9b`), the AX630C (a 0.5-1.5B through the adapter: measure before trusting),
the phone's model; an ESP32's is its hotwords. **Jev itself** (ring `world`) only for game state and release data,
never a person's, and off by default like OpenRouter.

### 5.5 CORTEX: the high road (System Two)

The neocortex: slow, detailed, words. Its areas here:

| area | in the brain | here | verbs | hosts |
|---|---|---|---|---|
| **prefrontal** | deliberation, planning, working memory | the slow mind with thinking on; a plan; the playtester's next move; WORKING MEMORY's seven things (`workingmemory.ts`) live here, as Baddeley put them | `think`, `plan`, `hold` | the Tiiny (35B, 120B), roverbyteseer's LiteLLM, the cloud (paid, never automatic) |
| **language** | Broca writes, Wernicke understands | the daemon's words: a talk, a dream, a write-up | `speak` (body `{ self, said, length, most }`), `comprehend` | the Tiiny, the Kit and the hub's Module LLM (0.5-1.5B, the short self), a phone's model, an endpoint (C-280) |
| **auditory** | Heschl's gyrus, the belt | hearing: speech to text | `hear` (a 16 kHz WAV) -> text | the Tiiny (Qwen3-ASR), the AX630C (whisper), roverbyteseer (Whisper) |
| **visual** | V1 to the fusiform | sight: YOLO's list, a VLM's description, a box, the INDEX from life (C-463) | `see` (an image and a question) | the Kit (SC850SL, yolo, vlm), the Tiiny (OCR, image models), roverbyteseer (ComfyUI, for the reverse: `imagine`) |
| **motor speech** | the larynx's motor cortex | the voice: text to speech by a recipe (C-251) | `voice` (text, recipe) -> audio | the Tiiny (Qwen3-TTS), the AX630C (melotts), roverbyteseer |

**Inside** any model we train or wrap, `publicCodeMusAIgpt`'s words hold: dendrites in, axons out, a ThoughtProcessor a
block.

### 5.6 HIPPOCAMPUS: memory, and consolidation at night

The hippocampus binds an episode quickly; during sleep it replays them and the cortex slowly takes them in (systems
consolidation). Here: the same, and it already exists as psychology -- `memory.ts` writes YESTERDAY, THE MONTH and KEPT
at night, `dreams.ts` writes the dream from the night's shape, DAEMONS' own sessions dream at every fold. The region is
the machinery under them.

- `encode` (perception) -- an episode: an interaction, a game difference from SYNC, a seen room; with the amygdala's tag
- `recall` (cognition) -- a cue -> the nearest episodes (the Tiiny's embeddings over the month and the shelf)
- `consolidate` (cognition) -- the night: replay the day, write the month, the shelf and the dream; asked by the
  hypothalamus's clock, waits if the cortex is away

Episodes are PRAXIS events, so a device away from home encodes offline and the hub takes them in when it is back.
**Hosts**: the hub (the store), the Tiiny (the night and the embeddings), every Pi and the Kit (a day's episodes
offline), an ESP32 (a ring of today's events only).

### 5.7 BASAL GANGLIA: choosing what to do

The basal ganglia pick one action from many: the direct pathway says **go**, the indirect says **no-go**, the
hyperdirect stops everything at once; dopamine teaches which actions paid off. Here: **THE HANDS**, on every body.

- `repertoire` -> the device's manifest of named actions, each with its arguments, one line, and its class
- `select` (cognition) -> from the cortex's or the low road's intent, `{ action, args, gate: "go" | "ask" | "nogo" }`:
  **harmless goes**, **anything that spends, sends, deletes or moves asks** on the device's own screen (ZEROKIT.md 5,
  chosen), anything not in the manifest is no-go
- `act` (expression) -- runs it; every call, allowed or refused, is logged
- `stop` -- the hyperdirect pathway: everything on this body stops (a RoverByte walking toward the stairs)

**Today**: THE HANDS on the Mac (`hands_main.ts`, only the commands `jobs.ts` names), C-462's HANDS on every Pi, the
playtester's button presses. **Hosts**: wherever the body is -- the actions run on the device that has them, always;
the choosing can be lent. Learning from reward (which actions helped a goal) is later.

### 5.8 CEREBELLUM: timing, prediction, correction

The cerebellum predicts what a movement will feel like and corrects the error; it holds timing. Here: **how long each
region takes on each host, and whether it worked** -- the forward model the thalamus routes by -- and the timing of
anything that moves.

- `predict` -> for a region on a host, `{ ms, p }` (the time it will take, and the chance it works)
- `learn` -- a response's `ms` and `ok`; every response teaches it
- `tempo` -- the rhythm of an expression: a voice's pace (the AX630C's 0.35 s a word, `stackflow.ts`'s
  `firstSentences`), the playtester's frames between presses, a walk's gait

**Today**: `mindlog.ts`'s speeds, `thoughtroute.ts`'s and `procmesh.ts`'s reliability, `HEDGE_QUICK_MS`. **Hosts**:
every one, locally (it is a few numbers kept per host and region).

### 5.9 Later regions, named so they have a place

- **DEFAULT MODE NETWORK**: what the brain does with nothing to do -- the self thinking about itself. The daemon's idle
  thoughts, its songs and paintings made unasked, the night's rehearsal; the thalamus's `chatter` priority.
- **SOMATOSENSORY and VESTIBULAR**: buttons, touch, the IMU (the watch's stillness is vestibular).
- **PSYCHIC CORTEX** (RoverByte's name): the radios -- Wi-Fi, BLE, LoRa, IR, the cap. It is the corpus callosum's
  physical layer.
- **EMOTIONAL REGULATION** (PenphinMind, RoverSeerApi): reappraisal, a distortion noticed before answering.
- **BICAMERAL PERSPECTIVES** (PenphinMind): one question thought logically and intuitively, and joined.

## 6. Which hosts run which region

`#` runs it natively, `+` runs a small or partial one, `-` cannot. The ring each host can hold is the last column.

| host | brainstem | hypothal. | thalamus | low road | cortex: language | prefrontal | auditory | visual | voice | hippocampus | basal g. | cerebellum | ring |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **ESP32 boards** (T-Embed, watch, Tab5, ...) | # | + | + | + (hotwords) | - | - | - | - | - | + (today) | # (its body) | # | body |
| **Pi Zero devices** (Cardputer Zero, GamePi20) | # | + | # (its pair) | + | - | - | - | - | - | + (offline) | # | # | body, home |
| **Pi 4 / 5, uConsole** | # | + | # | + | + (a 1B on CPU) | - | + (whisper tiny) | + | + (piper) | + | # | # | body, home |
| **AX630C** (LLM630 Kit; the hub's Module LLM; any AX630 HAT) | # | - | - | + (0.5-1.5B) | # (short self) | - | # | # (Kit: camera) | # (melotts) | + | - | # | body, home |
| **the phone** | # | + | # (hosting alone) | + | # (its model) | - | + | + | + | + | # | # | body, home |
| **the hub** (daemons-hearth) | # | # (the truth) | # (the house's) | - | - | - | - | - | - | # (the store) | # (jobs) | # | home |
| **the Tiiny** | # | - | - | # (9B) | # (9B, 35B) | # | # | + (OCR) | # | # (the night, embeddings) | - | # | home |
| **roverbyteseer** (LiteLLM, n8n, ComfyUI) | # | - | + (n8n) | + | # (through LiteLLM) | # | # | # (imagine) | # | + | - | # | home |
| **THE HANDS' Mac** | # | - | - | - | - | - | - | - | - | - | # (jobs, the playtester's presses) | # | home |
| **the cloud** (OpenRouter, Jev) | - | - | - | # (Jev: game data only) | # | # | - | - | - | - | - | - | world |

**One implementation per region and kind of host, not per device**: the Pi Zero devices share one, all the AX630C
boards share the neurocortical bridge, every ESP32 shares one brainstem.

## 7. What happens when a part is missing

**The brain degrades; it does not stop.** The thalamus routes to what answers; what nothing answers falls back to the
region below it.

| missing | what still works |
|---|---|
| the internet | everything at `home` and `body` |
| the hub | each Pi device's own thalamus routes its pair; episodes wait as PRAXIS events |
| the Tiiny | the AX630C's short self speaks; the night waits (MIND.md 2) |
| the Kit (asleep, low cell) | the low road on the Zero answers with canned lines; the cortex waits or is asked of the hub |
| every model | the brainstem's reflexes and the written lines (`dreams.ts`' words, the canned talk): the daemon is quieter, never broken |

## 8. Code: where it lives, and the proof

**The interface is one file per language**, kept identical by a test: TypeScript in the companion (the hub, the phone,
EUDAIMONIA), C++ for the Pi devices and the ESP32 boards, Python for the AX630C's agent and the playtester. *Decided: in the
companion first, in a repository of its own pinned by tag (as daemons-praxis is) once a second one needs it.*

**Existing files move into their regions by the nightly refactor** (section 10), never in one great rename and never
without that night's approval: `thoughtroute.ts` is the thalamus's score, `mindlog.ts` the cerebellum's memory,
`hands_main.ts` the basal ganglia's on the Mac.

**The proof** (built with this page, nothing else): the `Signal` and `Response` types, the region names and verbs, the
ring check, and a test that routes one `appraise` and one `speak` through a thalamus over the existing score. It calls
no model. It shows the interface holds; it is not the brain.

**Built** (2026-11-24): `server/src/machine/brain/signal.ts` and `server/test/brain.test.ts` -- the signal, the twelve regions
and their verbs, the ring, a host's connectome entry, the cerebellum's forward model and the thalamus's `relay`, which
asks hosts best first and falls through on a failure. Five checks: a verb that is not the region's is refused, a `home`
signal never reaches a `world` host, a low-road `appraise` and a high-road `speak` each reach the best host that
answers, a host expected to miss the deadline goes last, and a signal no host may take says so.

## 9. Decided (the user, 2026-11-24, by multiple choice)

1. **Neuroscience for the machine, psychology for the mind.** Every AI harness's machinery takes the brain's regions;
   the daemon's own mind (`feelings.ts`, `self.ts`, `memory.ts`, `dreams.ts`) keeps its psychology, and C-387's rule
   holds: a MIND module is handed a region, never imports one.
2. **The interface lives in the companion first**, and moves to a repository of its own once a second one (engineAi,
   EUDAIMONIA) needs it.
3. **System One is local first**: Jev's four questions answered on the house's own models through the adapter; **Jev's
   API only for game and release data, and off by default.**
4. **The existing code moves into its regions by a nightly refactor, each night approved by the user** (section 10).

## 10. The nightly refactor (the user's process, 2026-11-24)

The user: *"as each is touched, but with scheduled nightly jobs.... first the headers, and following that an architecture
and plan review sent to me,,,, I will check off and give priority to each, and define how much change per night, then I
test, and each day (night) you show me the plan for that night and I approve or defer..... if u dont hear from me, pause
that nights refactor... and also before any rename pass (as touched, headers, or all) I want you to research the
neuroscience and psychology side, and also research the machine learning side -- make a mapping and reason for
decision... and once that is complete pass it to another agent who reviews from a background of both computer science
and psychology and gives a final recommendation for that night pass."*

**Before any pass -- headers, as-touched or all -- three steps, in order:**

1. **Research, both sides.** The neuroscience and psychology of each region (what it does, the models it is named after:
   LeDoux's two roads, Kahneman's two systems, Baddeley's working memory, systems consolidation, the basal ganglia's
   go and no-go, the cerebellum's forward models) *and* the machine-learning side (what each piece of our code actually
   is: a router, a classifier, a generator, a retrieval index, a scheduler). The output is **a mapping, file by file**:
   the region and area each file belongs to, and the **reason** for the choice, with the alternatives considered.
2. **A review by another agent** with a background in both computer science and psychology, which reads the mapping
   cold (the code and the research, not this session's conclusions) and gives **a final recommendation for that
   night's pass**: which mappings stand, which change, which wait.
3. **The night's plan shown to the user**, who **approves or defers** it.

**Then the order of the work:**

1. **First pass: the headers.** Each AI file gets its region and area in its header comment; nothing moves or is
   renamed.
2. **An architecture and plan review sent to the user**: every remaining move and rename, one line each. The user
   **checks off** each, **gives it a priority**, and **says how much change a night may hold**.
3. **The nightly passes.** Each night the plan for that night (from the checked list, at most the amount allowed) goes
   to the user before it runs. **Approved, it runs; deferred, it waits; no answer, that night's pass is paused** --
   never run on silence. The user tests the result the next day.

**How the user answers**: each night's plan is put as a question on its ticket (`tickets.py ask`, *Approve* or
*Defer*), which EUDAIMONIA's dashboard draws as buttons. A pass runs only on an *Approve* given for that night.

## Tickets

*Opened 2026-11-24, all lane app.*

| Ticket | What |
|---|---|
| **C-517** | THE BRAIN, this design (the parent) |
| **C-518** | the nightly refactor (section 10): research, review, approve, then move |
| **C-519** - **C-527** | the regions: brainstem, hypothalamus, thalamus, the low road (salience and amygdala), the high road (prefrontal and language), the sensory and motor cortices, hippocampus, basal ganglia, cerebellum |
| **C-528** - **C-537** | the hosts: ESP32 boards, Pi Zero devices, Pi 4 and 5 and the uConsole, the AX630C boards (the neurocortical bridge), the phone, the hub, the Tiiny, roverbyteseer, THE HANDS' Mac and the playtester, the cloud |
