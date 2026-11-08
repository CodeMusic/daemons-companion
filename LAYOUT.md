# Layout -- where everything in daemons-companion lives

**The one map of this repository** (C-292). It says where each kind of code goes, so new code lands beside its own
kind instead of at the top of a folder. **Keep it true:** a commit that adds, moves, renames or removes a folder, or a
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
| `.hub.example`, `.nvmrc`, `.gitignore` | `syncCompanion.sh`'s settings (copied to `.hub`, never committed), the Node version, what git ignores |

## `app/` -- the Expo app (iPhone, iPad, the Mac, and the site)

| Folder | What is in it |
|---|---|
| `App.tsx`, `index.ts` | `App` (pairing, the look, the providers) and `Shell`, which wires `shell/` together |
| `shell/` | the tab strip, the beside split's panes and sizes (`panes.tsx`, `split.ts`), the background syncs (`sync.ts`) |
| `screens/<tab>/` | each tab's page and the pages only it opens: `today/`, `daemon/`, `journey/` (GOALS, the JOURNAL), `library/`, `you/`, `places/`, `settings/`, `game/`, `dev/` |
| `screens/shared/` | pages more than one tab opens: `Witching`, `Reads`, `Hermetic`, `Index`, and `OwnVoice` (a daemon telling of itself over its card) |
| `ui/` | the shared pieces (`ui.tsx`), HOW TO PLAY, RECEIVED, reading aloud (and the voice button that says if a voice is made, `voiceButton.tsx`), the book recordings, the books' covers and pictures from the game, HALFTONE's two tones (`tone.tsx`), the LOGS |
| `sound/` | tunes, songs, care sounds, the instruments, the voice (`speaking.ts`) |
| `platform/` | the connection (`net.ts`), the handheld, the beacon, the widget, the phone hosting alone (`local.ts`), the phone's own mind (`mind.ts`), THE MIND that routes across every mind (`mesh.ts`, C-307) and an endpoint called from the phone (`endpoint.ts`), the voices kept on the phone (`voiceFile.ts`) and made in the background (`rendering.ts`), `useApi` |
| `state/` | types, data, the look, the manual, the sealed pages, previews, DEVELOPER MODE (`dev.ts`), the split's kept settings (`away.ts`) |
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
| `src/ai/` | talk, voices and the thinkers: the house's module, the Tiiny, `say.ts` (`sayable()`, DAY-mons) |
| `src/save/` | reading a DAEMONS save, and writing to it (`writer.ts`) |
| `src/game/` | the player's ROM: patches, hashes, the live save and its mirror |
| `src/commons*.ts` | THE COMMONS, which runs on its own machine |
| `src/*.ts` | one file per feature otherwise (care, dreams, casino, trade, glass, ...) |
| `data/` | what the game is built from, exported by DAEMONS (species, art, sounds, maps, ...) |
| `test/` | vitest, one file per feature (`npm test`, Node 22+) |
| `tools/` | the server's generators and benches |

## `firmware/` -- the devices

| Folder | What it is |
|---|---|
| `esp32/` | the one firmware for the ESP32-S3 handhelds, watches and dials (PlatformIO; `FLASHING.md`) |
| `tab5/` | the M5Stack Tab5's own firmware |
| `box3/` | the ESP32-S3-BOX-3, through ESPHome and Home Assistant |
| `common/` | headers both firmwares share, each written by the `.py` beside it |
| `pizero/` | the Pi Zero, planned |

## The rest

| Folder | What it is |
|---|---|
| `hub/` | setting up and deploying the hub (`deploy.sh`, the phases, `systemd/`), THE COMMONS (`commons.sh`), backups |
| `n8n/` | the n8n relay workflow (C-56) a phone away from home reaches the companion through |
| `docs/` | the design: `PLAN.md`, `vision.md`, one file per subject (devices, hardware, the hub, trading, ...) |
| `wiki/` | the public wiki, published by `wiki/publish.sh` |
