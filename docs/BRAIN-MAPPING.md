# THE BRAIN: the mapping for the headers pass (C-518)

*DRAFT, 2026-11-24. Step 1 of the nightly refactor (docs/BRAIN.md 10): research on both sides, then every AI file
mapped to its region with the reason. Step 2 is a review by another agent (section 6); step 3 is the night's plan,
put to the user on C-518. **Nothing here has been applied.***

**The headers pass changes comments only.** Each file below gets one line in its header naming its region and why, and
nothing else: no file moves, no name changes, no code. Its form:

```
// BRAIN: thalamus (relay, attend) -- picks which mind takes a thought, as the thalamus picks what reaches the cortex
```

`#` in Python and shell. **Where it goes**: directly after the C-290 line in a file that has one (that line must stay
first), otherwise first. A file mapped to **none** gets `BRAIN: none -- <what it is>`, so a later check can ask that
every MACHINE file says *something*.

## 1. The neuroscience and psychology, region by region

What each region does, the model it is named after, and what that implies for the code.

| region | what it does | the model and its source | what it implies here |
|---|---|---|---|
| **brainstem** | keeps the body alive without asking the cortex: breathing, heart, reflex arcs; its **ascending reticular activating system** keeps the cortex awake | Moruzzi & Magoun (1949), the reticular activating system | vitals and reflexes, and **keeping a model loaded** (arousal of the cortex) belong here |
| **hypothalamus** | homeostasis -- energy, temperature, drives -- and the **suprachiasmatic nucleus**'s day; the **sleep-wake switch** is a hypothalamic flip-flop (the VLPO against the arousal nuclei) | Saper, Chou & Scammell (2001), the sleep switch; the SCN as master clock | **deciding** whether to wake (by charge: an energy budget) is hypothalamic; *doing* it is the brainstem's. BRAIN.md 5.1 put `mayWake` in the brainstem: **this research moves the decision to the hypothalamus** |
| **thalamus** | relays nearly every sense to the cortex; its **reticular nucleus** gates what passes (the "searchlight" of attention) | Sherman & Guillery (2006), the thalamus as relay and driver; Crick (1984), the searchlight hypothesis | choosing where a signal goes, and holding or dropping it, is thalamic. *Caveat*: in the brain the gate is opened by the basal ganglia's disinhibition, so routing and action selection touch |
| **salience network** (anterior insula, dorsal anterior cingulate) | decides what matters now and switches the brain between networks; the **insula** senses the body from inside (interoception); the **dACC** monitors conflict and errors | Menon & Uddin (2010), the salience network; Craig (2002), interoception; Botvinick et al. (2001) and Carter et al. (1998), conflict and error monitoring | System One's typed appraisal; **a ledger of the brain's own load is interoception**; **detecting that the agent is stuck in a loop is dACC error monitoring** -- the salience network needs a `monitor` verb BRAIN.md does not yet have |
| **amygdala** | fast, crude emotional appraisal; the "low road" from the thalamus | LeDoux (1996), the two roads | affect tags and the quick read of the person; the daemon's *feelings themselves* stay psychology (decided) |
| **prefrontal cortex** | deliberation, planning, goals held over time; **working memory** (the central executive and its buffers) | Baddeley & Hitch (1974); Miller (1956) and Cowan (2001) on its limits; Fuster (2004), the perception-action cycle | the slow mind; **building a prompt is filling working memory**; pruning history is its decay |
| **language areas** | Wernicke's understands, Broca's produces, the **arcuate fasciculus** joins them (hear, then say) | the Wernicke-Geschwind model (Geschwind 1970), simplified but standard; Levelt (1983), self-monitoring and repair of speech | generation is Broca's; a pipeline from hearing to speaking is a *pathway*, not a region |
| **auditory cortex** | from sound to words; listeners **restore** a missing phoneme from what the word should be | Warren (1970), phonemic restoration | correcting what an ear heard against the known lexicon is auditory cortex doing top-down restoration |
| **visual cortex** | from light to objects; **mental imagery runs on the same areas** | Kosslyn (1994), imagery | `see` and `imagine` share a region: making a picture is visual imagery |
| **motor cortex (speech)** | articulation: the plan for the mouth | Levelt (1989), from formulation to articulation | respelling a word so a voice says it right is articulatory planning; practised lines are motor programs |
| **hippocampus** | binds episodes fast; **replays them in sleep** so the cortex learns slowly; **place cells** build a map of space | McClelland, McNaughton & O'Reilly (1995), complementary learning systems; O'Keefe & Nadel (1978), the hippocampus as a cognitive map | the night's memory and the fold's dream are consolidation; **pathfinding is the hippocampus's spatial map** -- BRAIN.md 5.6 needs a `navigate` verb |
| **basal ganglia** | select one action among competitors: the direct pathway's go, the indirect's no-go, the hyperdirect's stop; dopamine signals reward prediction error; habits are chunked here | Mink (1996); Redgrave, Prescott & Gurney (1999), "a vertebrate solution to the selection problem"; Schultz, Dayan & Montague (1997); Graybiel (1998) | named actions with go, ask, no-go; a manifest is the repertoire |
| **cerebellum** | forward models: predicts the result of a movement and corrects the error; timing | Wolpert, Miall & Kawato (1998); Ito (2008) | latency and reliability per host; speech pacing; **correcting a malformed command** is motor error correction |
| **corpus callosum** | joins the two hemispheres | Gazzaniga (2000), the split brain | the link between two machines that make one brain (the Zero and its Kit) |
| **default mode network** | active when nothing is asked: the self, reflection, imagining | Raichle et al. (2001) | later: the daemon's idle thoughts |

**What the research changes in BRAIN.md** (proposed; written there only when the review agrees):

1. The sleep-wake **decision** moves to the hypothalamus (5.2); the brainstem keeps the doing (5.1).
2. The salience network gains **`monitor`** (the dACC: stuck, looping, wrong) beside `appraise`, and interoception
   (the insula: the brain's own load).
3. The hippocampus gains **`navigate`** (place cells, a map, a path).
4. Keeping a model loaded is the brainstem's **arousal** (`wake` already covers it).
5. A file that only chains regions -- hear, think, say -- is a **pathway** (a white-matter tract), not a region. One
   word for it: `pathway`.

## 2. The machine-learning side: what each kind of code actually is

| our code does | its name in computer science | sources | the region it matches, and how well |
|---|---|---|---|
| ordering minds by power x reliability x free, falling through | **routing and cascades**; mixture-of-experts gating | Shazeer et al. (2017), sparsely-gated mixture of experts; Chen, Zaharia & Zou (2023), FrugalGPT's cascade | thalamus: a learned relay. Close |
| asking a second mind when the first is late | **hedged requests** | Dean & Barroso (2013), "The Tail at Scale" | thalamus with the cerebellum's timing. Close |
| `(ok + 1) / (n + 2)` | **Laplace's rule of succession**, the mean of a Beta posterior | -- | cerebellum: a forward model of success. Exact in spirit |
| typed questions answered with probabilities | a **discriminative classifier** with calibrated outputs, against a generator | JEV.md | salience network. Close |
| the self, the month, yesterday written into the prompt | **context construction**, working memory as a window | -- | prefrontal (hold). Close |
| embeddings over the month and the shelf | **retrieval-augmented generation** | Lewis et al. (2020) | hippocampus (recall). Close |
| the night's summary, the fold's dream | **replay and consolidation**; summarisation as compression | Kumaran, Hassabis & McClelland (2016), complementary learning systems revisited for AI | hippocampus (consolidate). The closest match on this page: the AI literature took it from this very model |
| a manifest of tools, a call checked against it | **tool use / function calling** | Schick et al. (2023), Toolformer; Yao et al. (2023), ReAct | basal ganglia (select, act). Close |
| detecting a loop from the trajectory, self-critique | **self-reflection and error detection** | Shinn et al. (2023), Reflexion | salience network (monitor, the dACC). Close |
| correcting ASR against the lexicon | **contextual biasing**, hotword boosting | -- | auditory cortex (restoration). Close |
| a fixed line's voice kept and replayed | **memoisation, a cache** | -- | motor programs (practised). Loose: a cache is not learning |
| ffmpeg, WAV conversion, file export | **codecs and I/O** | -- | **none**. Forcing a region on a codec would be decoration, which the project's own rule forbids (colour carries the argument, never decorates it) |

**Where the metaphor should stop.** A region name is earned when the code does what the region does *in kind*, not
when it merely sits nearby. Codecs, caches of files and exports get `none`. This keeps the brain an argument, not a
skin.

## 3. The mapping, file by file

Strength: **A** the match is in kind and well sourced; **B** defensible, with a named alternative; **C** a stretch, for
the reviewer to decide. `split` marks a file that holds two regions and should be split on a later night (not now).

### 3.1 The companion's server, `server/src/machine/`

| file | region (verbs) | reason | alternative | strength |
|---|---|---|---|---|
| `thoughtroute.ts` | thalamus (relay, attend) | orders the minds and falls through, hedged: a relay deciding what reaches which cortex | basal ganglia (selection among competing channels, Redgrave 1999). Its reliability history is the cerebellum's: `split` | A |
| `tiinyfirst.ts` | thalamus (relay, gate) | the Tiiny first, the boards when it is away: the relay's order and its gate | -- | A |
| `talkjobs.ts` | thalamus (attend) | the device in the hand first: priority is attention | prefrontal (a queue as a buffer) | B |
| `procmesh.ts` | thalamus (relay) and the connectome | routes processing jobs by the same score; keeps the nodes | none (much of it is ffmpeg, not thought) | B |
| `discover.ts` | thalamus (the connectome) | finds the AX630C hosts and keeps those that answer | none (service discovery) | B |
| `endpoints.ts` | the connectome and the ring | each endpoint is a host; `atHome` is the blood-brain barrier | -- | A |
| `mindlog.ts` | cerebellum (learn, predict) | each talk's timing kept so a slow mind is covered at once: a forward model | -- | A |
| `tasks.ts` | salience network (interoception) | the ledger of every piece of work is the brain sensing its own load; the thalamus reads it as `free` | thalamus; none (observability for THE ENGINE ROOM) | C |
| `schedule.ts` | hypothalamus (clock) | work given a time: the SCN's day | prefrontal (prospective memory, a plan to act later) | B |
| `tiinykeep.ts` | brainstem (wake) | keeps the Tiiny's models loaded: the reticular activating system keeping the cortex awake | hypothalamus | A |
| `tiiny.ts` | host: the Tiiny -- cortex.prefrontal (background) and cortex.language (quick) | its two thinkers are the slow mind and the talker | -- | A |
| `module.ts` | the neurocortical bridge (AX630C) -- cortex.language, .auditory, .motor | the Module LLM's OpenAI-shaped door | -- | A |
| `stackflow.ts` | the neurocortical bridge (StackFlow) | the module's own protocol; `firstSentences` is the cerebellum's tempo | `split` later (tempo) | A |
| `house.ts` | cortex.language, .auditory, .motor on the house's AX630C boards | one talk a module, LATE to the caller | it also gates: a small thalamus inside, `split` | B |
| `llmtalker.ts` | cortex.language (speak) | one meeting turn from any endpoint | -- | A |
| `ollama.ts` | a door in and out (Home Assistant), to cortex.language | Home Assistant is one more speaker and listener | pathway | B |
| `hotwords.ts` | cortex.auditory (hear: restoration) | what an ear heard, corrected toward the lexicon, as listeners restore a phoneme | -- | A |
| `say.ts` | cortex.motor (voice: articulation) | DAEMON respelled so it is said DAY-mon: articulatory planning | -- | A |
| `voice.ts` | cortex.motor (voice) | the efferent path to a handheld's speaker | none (conversion and a shelf) | B |
| `voicebank.ts` | cortex.motor (practised lines) | a fixed line said again at once, in the same voice: a motor program | basal ganglia (habit); none (a cache) | B |
| `comfy.ts` | cortex.visual (imagine) | a picture made from words is visual imagery | -- | A |
| `songs.ts` | cortex.motor (singing) | the daemon's song sung on the music door | cortex.auditory (auditory imagery) | B |
| `sleeptracks.ts` | cortex.auditory (imagine) | a sleep piece made from a recipe | none (a render and three files) | C |
| `sleepexport.ts` | none -- an export (ffmpeg) | -- | -- | A |
| `drifts.ts` | none -- a library of files | -- | -- | A |
| `wav.ts` | none -- a codec | -- | -- | A |
| `brain/signal.ts` | the interface itself | already says so | -- | A |

### 3.2 THE HANDS, `server/src/site/`

| file | region | reason | strength |
|---|---|---|---|
| `jobs.ts` | basal ganglia (repertoire) | only the named jobs run, each argument checked: the repertoire, and no-go for anything else | A |
| `hands_main.ts` | basal ganglia (act) on the Mac | dials out, runs the job, reports | A |

### 3.3 The phone, `app/platform/`

| file | region | reason | alternative | strength |
|---|---|---|---|---|
| `mesh.ts` | thalamus (the phone's) | routes HEARD, THOUGHT and SAID by ring, hedged | -- | A |
| `mind.ts` | host: the phone -- cortex.language, .auditory, .motor | Apple's on-device model, hearing and voice | -- | A |
| `endpoint.ts` | the connectome and the ring | an endpoint called from the phone; at home or not | -- | A |
| `lend.ts` | host: the phone as a MESH node | lends its thinking by its settings | -- | A |
| `rendering.ts` | none -- delivery of a voice made elsewhere | -- | cortex.motor | B |
| `voiceFile.ts`, `sleepFile.ts`, `local.ts` | not in the pass: files and hosting, not AI | -- | -- | -- |

### 3.4 The firmware

| file | region | reason | alternative | strength |
|---|---|---|---|---|
| `firmware/pizero/src/kit/kit.h`, `kit.cpp` | corpus callosum (the Zero and its Kit), with its thalamus choice (`Via`) and the Kit's vitals | the pair's link and what the Zero knows of the other half | `split` later | B |
| `firmware/pizero/src/kit/policy.h`, `policy.cpp` | hypothalamus (the sleep-wake decision) | may the Kit wake, by the charges: an energy budget, a homeostatic switch (Saper 2001) | brainstem, as BRAIN.md 5.1 first said | A |
| `firmware/pizero/src/kit/stackflow.h`, `stackflow.cpp` | the neurocortical bridge (C++) | StackFlow's JSON over the cable | -- | A |
| `firmware/llm630/kitd.py` | brainstem (vitals) on the Kit | its cell, heat and hotspot | -- | A |
| `firmware/esp32/src/brain.h`, `brain.cpp` | the neurocortical bridge (ESP32), with the thalamus's fallback | the handheld's offline turn on the LLM630 when no server answers. *Its name, BRAIN, is now too wide*: a rename candidate, never in a headers pass | -- | A |
| `firmware/esp32/src/talk.cpp` | a pathway: ears to mouth (a talk turn) | records, sends, plays the answer | thalamus | B |

### 3.5 The local cloud, `seer/`

| file | region | reason | strength |
|---|---|---|---|
| `seer/stt/whisper_server.py` | cortex.auditory (hear) on roverbyteseer | speech to text | A |
| `seer/tiiny-voice/tiiny_voice_stream.py` | cortex.motor (voice) | the Tiiny's voice streamed | A |
| `seer/n8n/make_workflows.py` | a pathway: the arcuate fasciculus (hear, think, say) | `daemon/talk` and `daemon/hear` chain the regions | B |
| `seer/litellm/install.sh` (and its config) | thalamus (roverbyteseer's relay of model names) | LiteLLM relays a name to a backend | B |

### 3.6 DAEMONS, `ai/` (a second night: a different repository)

| file | region | reason | strength |
|---|---|---|---|
| `ai/inplay_beat.py` | brainstem (vitals: the heartbeat) | a beat to the hub every few seconds, the save and the screen | A |
| `ai/airun.sh` | basal ganglia (act) | a job THE HANDS run: the playtester's whole body started and stopped | B |
| `ai/n8n/push.py` (its workflows) | cortex doors on roverbyteseer: look (visual), sprite (imagine), voice (motor), health (brainstem), chat (language) | each workflow is one verb | B |

### 3.7 The playtester, `engineAi` (a third night: our fork, its own branch)

The harness already thinks in these terms: a trait self, a dream per fold, a fast feeling layer. Its mapping:

| file | region | reason | strength |
|---|---|---|---|
| `server/src/ai/mind.js` | thalamus | which mind plays: the hub, the Tiiny, seer, OpenRouter (paid, never automatic: the ring) | A |
| `server/src/ai/promptBuilder.js` | cortex.prefrontal (hold) | the prompt is working memory, filled each turn | A |
| `server/src/ai/historyProcessor.js` | cortex.prefrontal (hold: decay) | what falls out of the window | B |
| `server/src/ai/tools.js` | basal ganglia (repertoire, act) | the agent's actions; its failed-sequence check is the cerebellum's, `split` | A |
| `server/src/ai/salvageToolCall.js` | cerebellum (error correction) | a malformed command repaired before it is lost | B (Levelt's repair) |
| `server/src/ai/localPath.js` | hippocampus (navigate) | a path over the map, on this machine: place cells | A |
| `server/src/ai/chatBridge.js`, `core/openaiClient.js` | a synaptic pathway (a protocol adapter) | the Responses API spoken over chat; any endpoint | B |
| `server/src/core/dream.js` | hippocampus (consolidate) | what the fold leaves behind | A |
| `server/src/core/feelings.js` | MIND (psychology): the fast affect layer, read by the salience network | feelings stay psychology (decided) | A |
| `server/src/core/trajectory.js` | salience network (monitor: the dACC) | a loop seen in the trajectory, which the current state alone could not show | A |
| `server/src/core/playtest.js` | cortex.prefrontal (judge) | the agent asked what it thought of the place | B (default mode) |
| `server/src/core/backchannel.js` | a door in: a second channel to the agent | it steers without being the game or a person | C |
| `server/src/core/gameLoop.js` | a pathway: the perception-action cycle (Fuster) | the whole turn, sense to act | B |
| `server/src/core/progress.js`, `progressTracker.js` | cortex.prefrontal (goals held) | objectives met and to come | C (hippocampus: episodes) |
| `firered_bridge/` (its `__init__.py`) | the senses: transduction | the game's state read out of RAM; the Lua socket is its nerve | A |
| `server/src/services/screenshotService.js` | the senses: the eyes | the screen, beside RAM | A |

## 4. The night's scope, proposed

**Night 1 -- the companion only**: sections 3.1 to 3.5, about forty files, one comment line each, in one commit,
with the server's tests and the Pi build's checks run after. **Night 2** -- DAEMONS' `ai/`. **Night 3** -- `engineAi`.
The changes to BRAIN.md (section 1's list) go in with night 1, if the review agrees. Nothing is moved or renamed on any
of these nights.

## 5. What is not decided here

The `split` files, the rename candidates (`firmware/esp32/src/brain.*`), the folders the regions might one day have:
all of them wait for the architecture and plan review the user checks off after the headers.

## 6. The review (2026-11-24): GO WITH CHANGES

A second agent, from both computer science and psychology, read the code and this mapping cold. Its verdict: **the
skeleton is sound** -- routing, timing, the bridges, the hosts and the repertoire match what the code does, and the
strongest rows (thoughtroute, tiinyfirst, mindlog, comfy, whisper_server, policy, stackflow) earn their names -- **but
about a third of the rows failed this page's own test**: caches, codecs, proxies, ledgers and installers given regions,
and music generation called singing. **Sections 1 to 3 above are kept as they were written, for the record; this
section supersedes them where they differ.**

**What it found wrong in the research** (to correct in BRAIN.md on night 1):

- *Seven things, as Baddeley put them* (BRAIN.md 5.5): seven is Miller (1956), about four is Cowan (2001); Baddeley gave
  the components, not the number.
- *LeDoux's two roads and Kahneman's two systems are the same idea* (BRAIN.md 2): an analogy, not an identity. The
  low road is contested (Pessoa & Adolphs 2010); LeDoux since 2015 calls these survival circuits, not feelings, which
  supports keeping feelings in psychology. System 1 and 2 are Stanovich & West's terms (2000).
- Wernicke-Geschwind is classic but superseded by the dual-stream model (Hickok & Poeppel 2007); Sherman & Guillery's
  higher-order relays, cortex to cortex, fit routing between minds better than the sensory relay does.
- Interoception is the body's state, not the brain's processing load (and BRAIN.md already puts load in `vitals`).
  RoverByte's *proprioception* mode is interoception in standard usage: keep the word, say so.
- The wake decision in the hypothalamus is **right**, but needs the energy link: orexin (Yamanaka et al. 2003; Sakurai
  2007).
- Computer science: thoughtroute is a hand-weighted scheduler with failover (close to weighted least-connections), **not
  mixture-of-experts gating**; FrugalGPT's cascade runs cheap-first, the other way; C-480's resting rule is a circuit
  breaker (Nygard); a nightly summary is memory compression or reflection (Park et al. 2023; MemGPT), not
  weight-training replay; LLM probabilities are not calibrated by default (Kadavath et al. 2022); `hotwords.ts` is
  post-ASR fuzzy correction (closer to Ganong's lexical effect, 1980), not contextual biasing; THE HANDS is an allowlisted
  job runner, and the model-picks-a-command shape is `commands.ts`.

**The header line, made checkable.** `// BRAIN: <head> [(<verbs or regions>)] -- <reason>` on one line of at most 120
characters. The head is exactly one of `signal.ts`'s REGIONS keys (`thalamus`, `basal_ganglia`, `cortex.motor`, ...),
or `host <name>`, `bridge`, `pathway`, `connectome`, `interface`, `none`. Verbs must be that region's in REGIONS; a
`host` line lists region keys. Placed after a `// C-290:` line, a shebang or `#pragma once`; otherwise first. Every
reason technical, nothing personal (the companion is public).

### Night 1, final (about fifty lines, one companion commit, comments only)

| file | BRAIN line (head and verbs) | changed by the review |
|---|---|---|
| `machine/thoughtroute.ts` | `thalamus (relay, gate)` | was relay, attend |
| `machine/tiinyfirst.ts` | `thalamus (relay, gate)` | |
| `machine/talkjobs.ts` | `thalamus (attend)` | |
| `machine/procmesh.ts` | `thalamus (relay)` -- the thought half; the ffmpeg half is load balancing | reason narrowed |
| `machine/discover.ts` | `connectome` | was thalamus |
| `machine/endpoints.ts` | `connectome` | |
| `machine/mindlog.ts` | `cerebellum (learn, predict)` | |
| `machine/tasks.ts` | `none` -- THE ENGINE ROOM's ledger | was interoception |
| `machine/schedule.ts` | `cortex.prefrontal (plan)` -- prospective memory (Burgess, Scott & Frith 2003) | was hypothalamus |
| `machine/tiinykeep.ts` | `brainstem (wake)` -- arousal, on demand | |
| `machine/tiiny.ts` | `host tiiny (cortex.prefrontal, cortex.language, cortex.auditory, cortex.motor)` | all four |
| `machine/module.ts` | `host ax630c-module (cortex.language, cortex.auditory, cortex.motor)` | was bridge |
| `machine/stackflow.ts` | `bridge` -- StackFlow | |
| `machine/house.ts` | `host house-ax630c (cortex.language, cortex.auditory, cortex.motor)` | |
| `machine/llmtalker.ts` | `cortex.language (speak)` | |
| `machine/hotwords.ts` | `cortex.auditory (hear)` -- lexical correction | reason |
| `machine/say.ts` | `cortex.motor (voice)` -- phonological encoding | |
| `machine/comfy.ts` | `cortex.visual (imagine)` | |
| `machine/ollama.ts`, `voice.ts`, `voicebank.ts`, `wav.ts`, `sleepexport.ts`, `drifts.ts`, `mesh_worker_main.ts` | `none` -- an adapter, a converter, a cache, a codec, an export, a library, an ffmpeg node | four were regions |
| `machine/songs.ts`, `sleeptracks.ts` | **WAIT**, or `cortex.auditory (imagine)` if that verb is added | was motor / auditory |
| `machine/brain/signal.ts` | `interface` | |
| `commands.ts` | `basal_ganglia (select)` -- rules first, then the model, checked against a list | added |
| `site/jobs.ts` | `basal_ganglia (repertoire)` | |
| `site/hands_main.ts` | `basal_ganglia (act)` -- `act` a simplification | |
| `app/platform/mesh.ts` | `thalamus (relay, gate)` | verbs |
| `app/platform/mind.ts` | `host phone (cortex.language, cortex.auditory, cortex.motor)` | |
| `app/platform/endpoint.ts` | `connectome` | |
| `app/platform/lend.ts` | `host phone` -- lent to THE MESH | |
| `app/platform/rendering.ts` | `none` | |
| `firmware/pizero/src/kit/kit.h`, `kit.cpp` | `host kit (cortex.language, cortex.auditory, cortex.motor)` -- driven from the Zero | was corpus callosum |
| `firmware/pizero/src/kit/policy.h`, `policy.cpp` | `hypothalamus (drives)` -- the wake decision, by charge | was brainstem in BRAIN.md |
| `firmware/pizero/src/kit/stackflow.h`, `stackflow.cpp` | `bridge` | |
| `firmware/pizero/src/pages/talk.cpp` | `pathway` -- the Zero's route choice (`Via`, `mayWake`) | added |
| `firmware/llm630/kitd.py` | `brainstem (vitals)` | |
| `firmware/esp32/src/brain.h`, `brain.cpp` | `bridge` -- no fallback here | reason |
| `firmware/esp32/src/talk.cpp` | `pathway` -- its route choice (home, phone, cable, LLM630) is the board's thalamus | reason |
| `seer/stt/whisper_server.py` | `cortex.auditory (hear)` | |
| `seer/tiiny-voice/tiiny_voice_stream.py` | `none` -- a keyed proxy | was motor |
| `seer/n8n/make_workflows.py` | `pathway` -- hear, think, say | no arcuate |
| `seer/make.py` | `thalamus (relay)` -- writes LiteLLM's names and fallbacks | added |
| `seer/sleep-sounds/sleep_sounds.py` | `none` -- a keyed door | added |

**Dropped**: `seer/litellm/install.sh` (an installer). **Later nights**: `meetsafe.ts` (`monitor`), `library/guideask.ts`
(retrieval), DAEMONS' `ai/` (night 2), `engineAi` with `fog_of_war.py`, the costs and the state manager (night 3).

**BRAIN.md with night 1**: the wake decision to 5.2 with orexin, by `drives` (no new verb); arousal noted under `wake`;
the `pathway` category and the header grammar; Baddeley's seven corrected; the two roads softened to an analogy; `act`
called a simplification. **`monitor`, interoception and `navigate` wait for night 3**, where their files are. **Any verb
added to `signal.ts` is a code change and its own line on a night's plan, never slipped into the comment pass.**

**After the edit, before the commit**: the server's tests, the app's typecheck, the Pi build's checks, the ESP32's
compile, and a grep that every listed file has exactly one `BRAIN:` line.

## 7. Night 2 (2026-11-24): DAEMONS' `ai/`, reviewed cold, GO WITH CHANGES

The review turned all three proposed regions into `none`: each failed the earned-metaphor test night 1 set.

| file | BRAIN line | why |
|---|---|---|
| `ai/inplay_beat.py` | `none` -- a presence beat to the hub | it reads none of the body's state (what earned `kitd.py` its vitals); it sends the save and the screen when they change: an export |
| `ai/airun.sh` | `none` -- a launcher | starts and stops the run's processes; no signal passes through it. The playtester's `host` line belongs on night 3, in `engineAi` |
| `ai/litellm/config.yaml` | `none` -- LiteLLM's proxy | its fallbacks are off by design (a second LM Studio slot evicts the first), so it is a name table and a protocol translation, not a relay. `seer/make.py` keeps `thalamus (relay)`: it writes real failover chains |
| `ai/litellm/install.sh`, `ai/n8n/push.py` | dropped | an installer, a deploy tool |
| `ai/n8n/README.md` | a BRAIN column | health `brainstem (vitals)` (it only probes the model servers), look `cortex.visual (see)`, sprite `cortex.visual (imagine)`, voice `cortex.motor (voice)` (it shapes the line and the prosody), chat `none` (a pass-through shim), talk moved to the companion (`pathway`); the public relays `none` |

**Found on the way**: the playtester's voice path (`/speak` -> `daemon/voice` -> the voice) never respells DAEMON as
DAY-mon (DAEMONS T-618). **Left for night 3**: `tools/ai_models.py` (it writes the LiteLLM table: `none`) and
`bindDaemons.sh --ai` (a launcher), with `engineAi`.

## 8. Night 3 (2026-11-24): the playtester, reviewed cold, GO WITH CHANGES

engineAi 663afbf (27 files) and DAEMONS b544403e (`tools/ai_models.py`). The lines that earn a region:

| file | BRAIN line |
|---|---|
| `server/src/ai/mind.js` | `thalamus (relay, gate)` -- which mind plays, first well; paid never automatic |
| `server/src/ai/promptBuilder.js` | `cortex.prefrontal (hold)` -- the context built fresh each turn |
| `server/src/ai/tools.js` | `basal_ganglia (repertoire, act, stop)` -- the actions; a just-failed move refused (inhibition) |
| `server/src/ai/localPath.js` | `hippocampus (navigate)` -- a route over the remembered map |
| `firered_bridge/fog_of_war.py` | `hippocampus (encode)` -- the tiles seen, kept per map: a map built from experience |
| `server/src/core/gameLoop.js` | `pathway` -- the perception-action cycle |

**`none`**: `chatBridge.js` and `openaiClient.js` (adapters), `historyProcessor.js` (context hygiene, not decay),
`salvageToolCall.js` (a parser), `trajectory.js` (a digest that never judges), `playtest.js` (a ledger), `backchannel.js`,
`progress.js`, `progressTracker.js`, `socketHub.js`, `pythonService.js`, `screenshotService.js` (a codec),
`stateManager.js`, `markdownFormatter.js`, the accounting, `server/index.js`, `firered_bridge/__init__.py`,
`firered_mgba_bridge.py`, the Lua socket, `tools/ai_models.py`. **No line**: `feelings.js` and `dream.js` (MIND: the
dream is a mood, not consolidation), configuration and constants, `bindDaemons.sh`.

**The review changed six rows**: dream.js, trajectory.js, playtest.js, historyProcessor.js and openaiClient.js away
from regions, and `stop` added to tools.js. **Verbs**: `navigate` added (localPath.js earns it); `monitor` waits for a
file that computes conflict or error; no interoception verb. **Found on the way**: nothing sets `OPENAI_MAX_RETRIES`
though a comment says `--ai` does (DAEMONS T-619); `mind.js` counts a 502 as a mind that is up (T-620).

**Every AI harness in the three repositories now carries its line.** What is left is the architecture and plan review
(BRAIN.md 10): the `split` files, the renames, the region folders -- for the user to check off.

