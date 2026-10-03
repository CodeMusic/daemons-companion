# TODO -- daemons-companion

Work that has been **decided and not done**, kept the way DAEMONS keeps its own (`DAEMONS/docs/TODO.md`): ids are
permanent, a closed ticket is struck through with its commit, never deleted. Questions live in `docs/PLAN.md` as
**OPEN** until the user answers them; a ticket waits on one by naming it.

| | Ticket | State | See |
|---|---|---|---|
| **C-01** | **Read what came before**: CodeMusic/RoverByte (RoverCodeBase, RoverByteOS, The RoverVerse) and CodeMusic/RoverCub, read-only, into `docs/INHERITANCE.md` -- what each part does, what is reused, the boards they target, and RoverRadio's day table (colour, note, chakra, virtue, statement). | *first sprint* | PLAN 2, 4, 6 |
| **C-02** | **The DAEMONS save reader** (`server/`): open a `.sav` **copy**, take the newer valid of its two saves, check every section's checksum, and read the party -- species (by our names), nickname, level, and the AWAY bit. Tested on scratch saves only; never the user's own. | *first sprint* | PLAN 3 |
| **C-03** | **One export from DAEMONS** (`DAEMONS/tools/companion_export.py`): the species table under our names and types, **each daemon's INDEX category and entry in both editions' voices**, each daemon's art from `gfx/daemons/`, the charmap the save's text uses, and the week -- written into `server/data/`, so nothing is typed twice. | *first sprint* | PLAN 2, 6 |
| **C-04** | **The server's skeleton** (Node + TypeScript, SQLite): goals and their steps, today's one step, and the party from a configured save copy, over a small local HTTP API. | *first sprint* | PLAN 1, 2 |
| **C-05** | **The app's skeleton** (Expo): Today, Goals and Daemon screens against the local server, running as a local site. | *first sprint* | PLAN 5 |
| **C-06** | **The three-pass breakdown** (Musai's shape) behind a setting, through DAEMONS' LiteLLM config; a built-in example answer when no model is set. **No paid model is called unless the user turns it on.** | *first sprint* | PLAN 2 |
| **C-07** | **The ESP32-S3 handheld firmware**: RoverCodeBase's structure building clean on the S3, then the daemon and today's step on screen. | *waits on PLAN 4: which board* | PLAN 4 |
| **C-08** | **The Pi Zero device**, from RoverCub and RoverOSpi. | *waits on PLAN 4: which board and screen* | PLAN 4 |
| **C-09** | **The sync protocol**: devices pull today's step and their daemon, push the steps ticked off. | *after C-04* | PLAN 4 |
| **C-10** | **Send and receive a daemon** (decided 2026-10-03, PLAN 3): the app's *receive daemon* and *send daemon* read a save the game has just written, check the daemon is in the active party and matches, and write AWAY (or clear it, with the friendship it built), with a backup every time. | *after C-02 and DAEMONS T-358* | PLAN 3 |
| **C-11** | **Many users**: accounts, hosting. | *later, by the user's word* | PLAN 7 |
| **C-13** | **The daemon's life**: fed, trained, mood, friendship, tired by the hour, and the season of its edition's hemisphere -- the rules, then the server's model, then the device showing it. | *after C-04; PLAN 7's rules OPEN* | PLAN 7, 8 |
| **C-14** | **Seasons by edition**: CONTEXT the northern year, CONTENT the southern -- one function, shared with DAEMONS T-359 so both agree. | *after C-03* | PLAN 8 |
| **C-15** | **Meeting others over the radio**: a nearby device is an event -- your INDEX *sees* its daemon (written into your save at the next sync) and your daemon's friendship grows. | *waits on PLAN 9: which radio* | PLAN 9 |
| **C-16** | **The LoRa epic**: a mesh of every unit, and the daemons on them talking to each other. | *later, by design* | PLAN 10 |
| **C-17** | **Trading and battling between devices.** | *back burner, by the user's word* | PLAN 10 |
| ~~**C-12**~~ | ~~**A home on GitHub** for this repo, and DAEMONS' `setup.sh` cloning it beside the engines.~~ | ***CLOSED 2026-10-03***: *public at CodeMusic/daemons-companion (the user: "yes, we can make the repo public"); DAEMONS `65a1fcfb` links it from its README and clones it in `setup.sh`.* | |
