# Layout -- where everything in daemons-companion lives

**The one map of this repository** (C-292). It says where each kind of code goes, so new code lands beside its own
kind instead of at the top of a folder, and on its own side of **mind and machine** (below). **Keep it true:** a commit that adds, moves, renames or removes a folder, or a
file at the repository's root, updates this file in the same commit. `server/test/layout.test.ts` fails when a folder
exists that is not named here, or a path named here no longer exists.

How the app *navigates* (tabs, the iPad split, the game view mounted once) is in `app/AGENTS.md`. What the project
*is* is in `CONTEXT.md`, and its plan is in `docs/PLAN.md`.

## The root

| Path | What it is |
|---|---|
| `README.md`, `CONTEXT.md`, `PRIVACY.md` | what the companion is (for players), what the work is (for agents), what it keeps |
| `TODO.md` | decided work, `C-` ids, permanent; a closed ticket is struck through with its commit |
| `LAYOUT.md`, `CLAUDE.md` | this map, and the rules a session follows here |
| `bindCompanion.sh` | starts the server and the app (a site by default; `ios`, `android`, `server`, `test`) |
| `updateCompanion.sh`, `linkCompanion.sh` | flash a handheld; link it to the server over its USB cable |
| `syncCompanion.sh` | the save kept in step between this computer and the hub, both ways (C-168), and its art and backups |
| `.github/` | GitHub's workflows: the site built at every push to main, onto the `site` release the hub fetches (C-342) |
| `.hub.example`, `.nvmrc`, `.gitignore` | `syncCompanion.sh`'s settings (copied to `.hub`, never committed), the Node version, what git ignores |

## `app/` -- the Expo app (iPhone, iPad, the Mac, and the site)

| Folder | What is in it |
|---|---|
| `App.tsx`, `index.ts` | `App` (pairing, the look, the providers) and `Shell`, which wires `shell/` together |
| `shell/` | the tab strip, the beside split's panes and sizes (`panes.tsx`, `split.ts`), the background syncs (`sync.ts`) |
| `screens/<tab>/` | each tab's page and the pages only it opens: `today/`, `daemon/`, `journey/` (GOALS, the JOURNAL), `library/`, `you/`, `places/`, `settings/`, `game/`, `dev/` |
| `screens/shared/` | pages more than one tab opens: `Witching`, `Reads`, `Hermetic`, `Index`, and `OwnVoice` (a daemon telling of itself over its card) |
| `ui/` | the shared pieces (`ui.tsx`), HOW TO PLAY, RECEIVED, reading aloud (and the voice button that says if a voice is made, `voiceButton.tsx`), the book recordings (the voice module, in the open book's look: `bookLook.tsx`, and the paragraph being said, `spoken.tsx`, C-309), the books' covers and pictures from the game, HALFTONE's two tones (`tone.tsx`), the LOGS, WHAT'S NEW (`whatsnew.tsx`, C-318), the link to THE ENGINE ROOM where the hub's admin is kept (`engineRoom.tsx`, C-330), THE BATTLE over every screen (`battle.tsx`, C-328), a daemon's song on its staves and sung (`staff.tsx`, C-419) |
| `sound/` | tunes, songs, care sounds, the instruments, the voice (`speaking.ts`) |
| `platform/` | the connection (`net.ts`), the handheld, the beacon, the widget, the phone hosting alone (`local.ts`), the phone's own mind (`mind.ts`), THE MIND that routes across every mind (`mesh.ts`, C-307) and an endpoint called from the phone (`endpoint.ts`), a meeting recorded or a voice memo sent to the hub (`meetings.ts`, C-316), the voices kept on the phone (`voiceFile.ts`) and made in the background (`rendering.ts`), `useApi` |
| `state/` | types, data, the look, the reader's places that outlive a refresh (`place.ts`, C-309), the manual, the sealed pages, previews, DEVELOPER MODE (`dev.ts`), the split's kept settings (`away.ts`), who this phone is to THE MIND (`me.ts`, C-319) |
| `art/` | species sprites (`speciesArt.ts`, written by `tools/species-art.py`), device sprites, the casino's dress |
| `game/` | the game's ROM and its gate |
| `modules/` | native modules, one folder each (`daemons-beacon`, `-menu`, `-mind`, `-night`, `-pad`, `-pixels`) |
| `targets/` | the home-screen widget's Swift (`widget/`) |
| `tools/`, `assets/` | the app's generators; its icons and splash |
| `tamagui.config.ts`, `app.json`, `metro.config.js` | stay at `app/`'s root (Tamagui, Expo and Metro look for them there) |

**Where a new file goes:** a page or card one tab opens goes in that tab's folder; one two tabs open, in
`screens/shared/`; a piece of UI any page uses, in `ui/`; anything that talks to the phone, a device or the network, in
`platform/`. Nothing new goes loose at `app/`'s root.

## `server/` -- the companion's rules, on a computer, the hub, or the phone

| Path | What is in it |
|---|---|
| `src/main.ts`, `src/api.ts` | the server on a computer or the hub (Node): its HTTP API |
| `src/core.ts`, `src/routes.ts`, `src/store.ts` | the rules themselves, and the requests a phone hosting alone answers -- **they run on the phone too** (C-111; every such file says so in its first line, C-290) |
| `src/ai/` | talk, voices and the thinkers: the house's module, the Tiiny, the player's endpoints after it (`endpoints.ts`, C-280: also `atHome`, which the phone imports), `say.ts` (`sayable()`, DAY-mons), THE MIND's ledger of work (`tasks.ts`, C-319) and its plans for LATER (`schedule.ts`, C-319), every voice from its speaker and context (`voiceof.ts`, C-323: a daemon, the INDEX, the player, a book; `../playervoice.ts` reads the player's from the save), and every persona, its sibling (`personaof.ts`, C-329: a daemon's telling, care, goals, dream, the day's virtue over its shadow and chakra, and the card they travel as; `../persona.ts` is the persona of the day over it, built at wake, C-338); the self's memory, made each night (`../memory.ts`, C-253: YESTERDAY, THE MONTH and KEPT, written by the quick thinker after the wake); READ THE SIGNS in a journal (`../signs.ts`, C-356: the four books distilled into `data/symbols.json`, principles and a lexicon read by word, for the quick thinker or alone), THE EASEL's painter (`easel.ts`, C-338: each daemon's style) and the image door it paints through (`comfy.ts`, C-387: ComfyUI on roverbyteseer), and THE MUSE every creation is made from (`muse.ts`, C-386: the persona of the day, a thread of the journal, the synesthesia of now) |
| `src/save/` | reading a DAEMONS save, and writing to it (`writer.ts`) |
| `src/game/` | the player's ROM: patches, hashes, the live save and its mirror |
| `src/commons*.ts` | THE COMMONS, which runs on its own machine |
| `src/lifemanagement/` | C-428, the first domain moved: LIFE MANAGEMENT on PRAXIS -- GOALS (`goals.ts`), the journals and dream journals, TENDING, THE WEEK'S BALANCE and THE DAY'S VIRTUE (`balance.ts`, `practice.ts`), MEETINGS, VOICE NOTES, THE REWARD SHELF, RECIPES, LEARNING and the forms you make yourself (`myforms.ts`); MIND, so it never imports the machine's modules (docs/PROJECTS.md 3) |
| `src/vault*.ts`, `src/backup.ts`, `src/sealing.ts`, `src/restore_main.ts` | THE VAULT (C-434), PRAXIS's encrypted relay on its own machine, holding no key; the hub's backup to it, the recovery code, and a new hub restored from the code alone (Node only) |
| `src/jobs.ts`, `src/hands_main.ts`, `src/sitefetch.ts` | THE ENGINE ROOM's JOBS and THE HANDS that run them on the computer, and the site the hub fetches from the release (C-342) |
| `src/admin.ts`, `admin/` | THE ENGINE ROOM (C-330): the hub's admin -- one installable web app the server serves at `/admin/` (its page, script, manifest, worker and icons, the icons drawn by `tools/admin_icons.py`), never through the relay |
| `src/synesthesia.ts`, `src/drift.ts` | SYNESTHESIA (C-385): the week's seven and the year's twelve -- day, month, note, colour, hertz, ordinal -- translated into one another; DRIFT DOWN's carrier and beats from it (C-386), for the phone and the hub's exports alike |
| `src/*.ts` | one file per feature otherwise (care, dreams, casino, trade, glass, ...; BATTLES: the fight `battle.ts`, the arena `battles.ts`, its requests `battleroute.ts`, C-328) |
| `data/` | what the game is built from, exported by DAEMONS (species, art, sounds, maps, ...) |
| `test/` | vitest, one file per feature (`npm test`, Node 22+) |
| `tools/` | the server's generators and benches |

## Mind and machine -- the code's two vocabularies (C-387)

The companion is two things at once, and its code keeps them apart (the user, 2026-11-16): **the psychology of mind**
-- the game's logic of who a daemon is: its feelings, persona, dreams, memory, care, the week and the months and their
colours, the signs it reads, the words a creation is asked for -- and **the computer science of machine-learning
illusions** -- the thinkers, endpoints, THE MIND's routing, the hearing, voice, image and music doors, and the files they
render into. Everything else (the game and its save, devices and radios, storage, the exchange, the site) is neither.

**The rule: a MIND module never imports a MACHINE one, and never calls a model itself.** When the mind needs a model it
is *handed* one -- a `Writer`, a `Thinker`, a `Chat` (`lifemanagement/journal.ts`, `memory.ts`, `dialogue.ts`, `ai/breakdown.ts`) -- or
it writes a RECIPE the machine renders (`sleepsound.ts` for `sleeptracks.ts`, `sing.ts` for `songs.ts`, `ai/easel.ts`
for `ai/comfy.ts`, `ai/voices.ts` for the voice doors). A MACHINE module may read MIND words to render them. The wiring
that joins the two is `api.ts`, `routes.ts`, `core.ts` and the `*_main.ts` files. **THE MIND** (C-307), despite its name,
is machine vocabulary: the minds it routes across are machines. `server/src/mind.ts` is the daemon's own mind.

Paths are under `server/src/` unless they begin `app/`. `server/test/layout.test.ts` checks that every file named here
exists, that no MIND file imports a MACHINE one or calls `fetch` or `node:*`, and that **every file in `server/src/ai/`
is named on one side** -- `ai/` holds both, so a new file there says which it is. A new MIND or MACHINE file elsewhere
is added here in the same commit; when one file starts to hold both, split it (the words to MIND, the call to MACHINE).

| Side | Modules |
|---|---|
| **MIND** | `app/state/month.ts`, `ai/breakdown.ts`, `ai/easel.ts`, `ai/gender.ts`, `ai/muse.ts`, `ai/personaof.ts`, `ai/voiceof.ts`, `ai/voices.ts`, `arcana.ts`, `aurora.ts`, `care.ts`, `context.ts`, `dawns.ts`, `days.ts`, `dialogue.ts`, `dreams.ts`, `drift.ts`, `eudaimon.ts`, `evolve.ts`, `expressions.ts`, `feelings.ts`, `gift.ts`, `guideask.ts`, `halloween.ts`, `hermetic.ts`, `holidays.ts`, `intuition.ts`, `lifemanagement/journal.ts`, `life.ts`, `lines.ts`, `memory.ts`, `mentions.ts`, `mind.ts`, `months.ts`, `originbook.ts`, `ownsong.ts`, `persona.ts`, `playervoice.ts`, `seasons.ts`, `self.ts`, `signs.ts`, `sing.ts`, `sleepsound.ts`, `spirits.ts`, `subtleask.ts`, `synesthesia.ts`, `lifemanagement/tending.ts`, `thrive.ts`, `unity.ts`, `vessel.ts`, `weathering.ts`, `witching.ts`, `workingmemory.ts` |
| **MACHINE** | `app/platform/endpoint.ts`, `app/platform/lend.ts`, `app/platform/mesh.ts`, `app/platform/mind.ts`, `app/platform/rendering.ts`, `app/state/me.ts`, `ai/comfy.ts`, `ai/discover.ts`, `ai/endpoints.ts`, `ai/hotwords.ts`, `ai/house.ts`, `ai/mindlog.ts`, `ai/module.ts`, `ai/say.ts`, `ai/schedule.ts`, `ai/stackflow.ts`, `ai/talkjobs.ts`, `ai/tasks.ts`, `ai/thoughtroute.ts`, `ai/tiiny.ts`, `ai/tiinyfirst.ts`, `ai/tiinykeep.ts`, `ai/voice.ts`, `ai/wav.ts`, `bookrecordings.ts`, `llmtalker.ts`, `mesh_worker_main.ts`, `ollama.ts`, `procmesh.ts`, `sleepexport.ts`, `sleeptracks.ts`, `songs.ts`, `voicebank.ts` |

## Outside this repository -- engines the companion is built on, each importing nothing from it

| Engine | Where it is |
|---|---|
| **PRAXIS**'s engine (C-429; `docs/PROJECTS.md` section 4) | **[daemons-praxis](https://github.com/CodeMusic/daemons-praxis)**, its own repository since C-435 (it came out of this one with its history): the append-only event log, UUIDv7 ids and the hybrid logical clock, the fold into its `px_` tables, the merge rules, handles numbered by a space's keeper, the ARETE ledger, the exchange of events by version vector, each event carrying its format, and (C-431) a space joined to another, blobs by their SHA-256 and a bound on a clock running ahead. `server/package.json` and `app/package.json` pin it by one tag as `@daemons/praxis`, and `app/metro.config.js` gives the phone's copy of `server/src` the app's. It runs on the phone too, on the same `Db` as the Store (C-111). GOALS run on it (`server/src/lifemanagement/goals.ts`, C-430); the hub answers its exchange and keeps its blobs (`server/src/praxissync.ts`, `server/src/blobstore.ts`, C-431). **To change it**: change and tag it there (its tests are its own), then move both pins here in one commit. Neither MIND nor MACHINE: storage and the exchange |

## `firmware/` -- the devices

| Folder | What it is |
|---|---|
| `esp32/` | the one firmware for the ESP32-S3 handhelds, watches and dials (PlatformIO; `FLASHING.md`) |
| `tab5/` | the M5Stack Tab5's own firmware |
| `kodedot/` | the Kode Dot's app (C-424): C on Kode's SDK, run from Kode's own launcher, built and simulated on roverbyteseer by `seer.sh`; **GPL-3.0-or-later**, this folder only, because the SDK it links is (`docs/KODEDOT.md`) |
| `box3/` | the ESP32-S3-BOX-3, through ESPHome and Home Assistant |
| `llm630/` | the **LLM630 Compute Kit** on the Cardputer Zero's back (C-453): what runs on the Kit -- `setup.sh` (StackFlow updated, the talk set's models), `gadget.sh` (its OTG port as the cable's network), `kitd.py` (its cell, heat and hotspot), `install.sh` from a computer (its `README.md`; docs/ZEROKIT.md, docs/LLM630.md). The Zero's half is `pizero/src/kit/` |
| `common/` | headers both firmwares share, each written by the `.py` beside it |
| `pizero/` | the Linux boards: the **Cardputer Zero** (a Raspberry Pi CM0; C-377) first, then the **GamePi20** (a Pi Zero 2 W; C-457) and the **Game HAT** (a full Pi; C-468) -- one C++ program, an SDL window on a computer and `/dev/fb0` and evdev on the device, the game on mGBA's core; what differs per board is one file in `firmware/pizero/src/boards/`, picked by `ZERO_BOARD`, and a board with no launcher has its setup in `firmware/pizero/tools/boards/` (its `README.md`; docs/PIBOARDS.md, docs/CARDPUTERZERO.md) |

## The rest

| Folder | What it is |
|---|---|
| `seer/` | the local cloud: the always-on machine beside the hub (LiteLLM, n8n and its workflows, the Tiiny's voice, sleep sounds, ACE-Step, local models, ComfyUI, the link cable's two games in `seer/linkhost/`, C-221), set up by `seer/bindSeer.sh` from one settings file (`seer/README.md`); a folder for each part |
| `hub/` | setting up and deploying the hub (`deploy.sh`, the phases, `systemd/`), its name (`rename.sh`), THE COMMONS (`commons.sh`), THE VAULT (`vault.sh`, C-434), THE HANDS on the computer (`hands.sh`, C-342) and the boards on its cable (`boards.py`, C-406), a node of THE MESH on a Mac (`mesh.sh`, C-360), backups |
| `n8n/` | the n8n relay workflow (C-56) a phone away from home reaches the companion through |
| `docs/` | the design: `PLAN.md`, `vision.md`, one file per subject (devices, hardware, the hub, trading, the Cardputer Zero, ...) |
| `wiki/` | the public wiki, published by `wiki/publish.sh` |
