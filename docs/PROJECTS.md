# PRAXIS -- the project system, daemon-gamified and local-first (DESIGN)

*Started 2026-11-19 (the user: "let's start designing this management system which is daemon gamified and 'projects'
within it can take many forms (from life management project, to learning, to cooking recipies, etc) and for the ones
where you define points you earn rewards"). **Nothing here is built.** A decision recorded here is one the user made;
everything marked OPEN is a question for them; every in-app word is DRAFT.*

**Named by the user, 2026-11-19, by multiple choice: PRAXIS, and its points ARETE** -- Aristotle's pair: *praxis* is
action, *arete* excellence, and together they lead to *eudaimonia*, which the app already keeps as THE EUDAIMON LAYER
(and the daemon is the Greek *daimon*). You do PRAXIS, you earn ARETE, your daemon thrives.

## 1. What it is

**One system under every part of the companion where a person manages their own life** -- GOALS, the JOURNAL, the
dream journal, tending the chakras, the week's virtue over its shadow -- **and under anything else they want to run as
a project**: a course they are learning, a cookbook, a house move, a garden, the game's own tickets. It is shaped like
Redmine (projects, trackers, issues, custom fields, workflows, the history of every change) but smaller, modern and
**local-first**, and it is **daemon-gamified**: what you finish earns ARETE, its reward points; your daemon thrives on
it, and ARETE buys real rewards you choose yourself and, at SYNC, things in the game.

Four promises carry over from the companion unchanged:

- **The app is the front door.** A phone alone runs all of it. A hub, roverbyteseer, a device or (one day) a cloud
  adds reach and keeping; none is required, and someone with only a phone loses nothing but the extras.
- **It never pesters.** Points are only ever earned, never taken for a missed day. Coming back is always welcome.
- **The AI proposes, you decide.** An AI's change is a proposal until you take it.
- **Nothing personal in the repository.** The code is public; a person's projects live only on their own replicas.

## 2. Where things stand (2026-11-19)

**The app is organised by tab**: `screens/today/`, `journey/` (GOALS, the JOURNAL), `daemon/`, `you/`, `library/`,
`places/`, `settings/`, `game/`, `dev/`. What is shared is in three places: `ui/` (the shared pieces),
`screens/shared/` (pages more than one tab opens), and `platform/` + `state/` + `shell/` + `sound/`.

**The server is flat**: `server/src/` holds **128 files side by side**, one per feature, plus `ai/` (25), `save/` (15)
and `game/` (5). A file's domain is only in its name -- `care.ts` sits beside `commons.ts` beside `journal.ts`. There
is no Damagotchi grouping (the pet is `care`, `life`, `feelings`, `evolve`, `thrive`, `dreams`, `dens`, `carry`,
`gift`, `face`, `expressions`, ...) and no life-management grouping.

**The psychology metaphor is real, and enforced -- but not kept together on disk.** C-387 (2026-11-16) split the code
into the user's two vocabularies: **the psychology of mind** (feelings, persona, dreams, memory, the muse, synesthesia,
the week -- 49 modules) and **the computer science of machine-learning illusions** (thinkers, endpoints, THE MIND's
routing, the voice, image and music doors -- 32 modules). A MIND module never imports a MACHINE one and never calls a
model; it is *handed* a Thinker, Writer or Chat, or writes a recipe the machine renders. By the user's multiple choice
that day it became **a rule and a test, with no folder split**: `LAYOUT.md` names each module's side and
`server/test/layout.test.ts` checks it, but the files are interleaved, and `ai/` holds both sides.

**Life management today** (`planner.ts` is the game's story planner, not this):

| Feature | Where | Stored as | On a phone alone | What finishing it gives |
|---|---|---|---|---|
| GOALS | `store.ts`, `core.ts`, `routes.ts`, `ai/breakdown.ts`; `journey/Goals.tsx`, `today/Today.tsx` | three tables, goal -> subitem (a milestone when titled) -> step; **fixed at three levels, one open goal at a time, 40 characters** | yes | a step: 1 exp (to the save at SYNC), a meal, training, +4 mood; a goal: 3 bond and a one-time gift |
| JOURNAL, dream journal | `journal.ts`, `signs.ts`; `journey/Journal.tsx` | four tables (journals, entries, chapters, signs), `kind` standard or dream | yes (plain pages; signs from the lexicon) | nothing |
| THE SUBTLE LAYER's question | `subtleask.ts` | a JSON blob in `settings` | yes | nothing |
| the daemon's DREAMS | `dreams.ts`; `daemon/Dreams.tsx` | a JSON blob, 90 kept | yes | a rested night: 2 bond |
| TENDING | `tending.ts`; `today/Tending.tsx` | a JSON blob, 120 kept | yes | nothing |
| the week (virtue over shadow) | `data/week.json`, `days.ts`, `months.ts`, `synesthesia.ts` | static | yes | nothing -- no balance is kept |
| MEETINGS, VOICE NOTES | `meetings.ts`, `voicenotes.ts`; `daemon/Meetings.tsx` | JSON blobs; action items are plain strings | **no** (hub only) | nothing |
| THRIVE | `thrive.ts` | derived: 50 + nights x 4 + goals x 8 + steps (to 20) | yes | the glow and the pose |
| seven dawns -> THE EUDAIMON LAYER | `dawns.ts` | an array of dates | yes | a book unlocked |

**Rewards are six separate currencies** -- exp, bond, mood, the feelings, THRIVE, the save's friendship (from meetings
only) -- plus the casino's coins, which are the save's money. **Nothing is the person's own points.**

**Storage and sync today:**

- **One SQL layer on two SQLite engines** -- the `Db` interface in `store.ts`, on `node:sqlite` (the Mac, the hub) and
  `expo-sqlite` (the phone), so the same `core.ts`, `routes.ts` and `store.ts` run on both (C-111). *This is the best
  foundation the companion has, and the new system is built on it.*
- **About a hundred kinds of state are JSON blobs** in one `settings` table, read and written whole.
- **Ids are local**: integer autoincrement and per-blob counters (`p1`, `t2`). Two copies would collide.
- **One server is the truth.** The phone caches answers and queues writes in a FIFO with no timestamps; **a phone that
  hosted alone never merges with a hub it pairs with later.** Nothing anywhere is a sync engine (C-11 deferred one).
- **The save already syncs the right way**: whole file, by hash, three-way against the last copy both sides agreed,
  the losing copy set aside in the save trail -- which is content-addressed (C-188, C-364, C-384). The voicebank and
  the book chapters are content-addressed too. **That is the model this design generalises.**
- Everything else made (paintings, songs, sleep tracks, meeting audio) is a file named by a random id.

## 3. The repository: folders by domain

The user's ask: shared things in a shared folder, the virtual pet in **Damagotchi**, life management in
**LifeManagement**, and the AI's parts kept together under the psychology metaphor. Folder names follow the repo's
lowercase convention.

```
server/src/
  shared/          plumbing every domain uses: db, store, config, ids and clocks, keys, http helpers, and the
                   interfaces a mind is handed (Thinker, Writer, Chat)
  machine/         MACHINE, all of it: thinkers, endpoints, THE MIND's routing, the Tiiny, ollama, the voice,
                   image and music doors, THE MESH
  psyche/          MIND that more than one domain reads: persona, the muse, memory, feelings, the week, the
                   months, the seasons, synesthesia, the signs' lexicon
  damagotchi/      the virtual pet: care, life, bond and evolution, THRIVE, the daemon's nights and dreams, dens,
                   carry, gifts, faces and expressions
  lifemanagement/  the forms on the project system: goals, journals, dream journals, tending, the week's
                   balance, meetings and voice notes, rewards
  game/            the save, the ROM, the game's planner, the link, trades, the casino, battles
  devices/         boards, beacons, radios, firmware images, the TV, remotes
  commons/         THE COMMONS, accounts, the exchange, shared creations
  library/         the books, their recordings, the manual
  site/            THE ENGINE ROOM, JOBS, THE HANDS, the site fetch
packages/
  praxis/          PRAXIS's engine (section 4): imports nothing from the companion

app/
  shared/          ui/ (today's ui/), pages/ (today's screens/shared/)
  damagotchi/      today's screens/daemon/
  lifemanagement/  today's screens/journey/, with TENDING from screens/today/
  ...              platform/, state/, shell/ and sound/ stay where they are; the other tabs stay as they are
```

*Decided by the user, 2026-11-19, by multiple choice: **domains, with the AI kept together in `psyche/` and
`machine/`**.*

- **Mind and machine become physical.** `machine/` holds every MACHINE file; `psyche/`, `damagotchi/` and
  `lifemanagement/` hold MIND and may not import `machine/`. The test gets simpler (a folder rule) and keeps its
  per-file sides for `app/`. *This supersedes C-387's "no folder split", by the user's ask of 2026-11-19.*
- **The engine is a package of its own**, `packages/praxis/`, with no import from the companion, so the site, the app,
  the hub and one day a Redmine replacement all use the one engine. *Decided by the user, 2026-11-19: a package here
  for now -- "before long we will make it its own repo"*, which the no-import rule keeps a `git mv` away.
- **Moved gradually, never in one sweep.** Other lanes commit to the companion every day, so each domain moves in a
  move-only commit (`git mv`, imports fixed, `LAYOUT.md` updated in the same commit -- C-292) when its files are not in
  flight. New code goes into the new folders from the start.

## 4. The engine

### 4.1 Redmine's ideas, renamed

| Redmine | Here | |
|---|---|---|
| project, subproject | **SPACE** | nests; the unit of sharing and of sync: *my life*, *Spanish*, *the cookbook*, *DAEMONS* |
| tracker | **KIND** | Goal, Milestone, Step, Habit, Entry, Dream, Lesson, Card, Recipe, Job, Bug -- each with its fields, states and reward |
| issue | **ITEM** | |
| status, workflow | **STATE** | each state sits in one of four phases: open, doing, done, set aside -- never "failed" |
| custom field | **FIELD** | typed: text, long text, number, date, duration, rating, choice, checklist, an item, a blob, a virtue, a centre, a feeling |
| relation, parent | **LINK** | parent, blocks, follows, relates, made from |
| journal (history and notes) | **EVENT** | every change, append-only -- the history, the undo and the sync are one thing |
| time entry | **EFFORT** | an event that carries a duration |
| wiki page | **PAGE** | a kind with a long body |
| attachment | **BLOB** | named by its content hash (section 5) |
| member, role | **MEMBER** | people, devices, the daemon and AI agents are all actors |
| saved query | **VIEW** | list, board, tree, calendar, feed, deck, and **TODAY**: the one next step |
| plugin, webhook | **RULE** | when this, then that: award points, make the next step, ask a mind |
| -- | **FORM** | the bundle a space is made from: its kinds, views, rules and rewards |

### 4.2 Forms

A space is made from a **FORM**, and a form is **data, not code**: a JSON document listing kinds (their fields and
states), views, rules and rewards. The companion ships forms (section 8); a person can change one or make their own in
the app; a form can be shared through THE COMMONS like any creation. A space records which version of its form it
was made from, and taking a newer version is an event like any other.

### 4.3 Items

Every item has a few columns the engine indexes -- id, space, kind, title, **short** (what a device shows, at most 40
characters), state, parent, position, **points**, virtue, due, made, by -- and everything else its kind defines, as
fields. A goal's depth is whatever the person needs: milestones inside milestones, steps inside either.

### 4.4 The event log

Every change is an event, and **the tables are a fold of the events** -- they can be rebuilt from the log at any time.

```
{ id, space, item, op, field?, value?, actor, replica, hlc }
  op: make | set | move | link | unlink | state | note | effort | award | spend | propose | accept | decline | archive
```

History is the log (Redmine's journals, for free). Undo is a compensating event. Sync is sending events (section 5).
An AI's proposal is an event marked *proposed* that counts only once accepted.

### 4.5 Ids

**Every record's id is a UUIDv7**: made anywhere, offline, without asking, and in time order. People see a short
**handle** (`LIFE-12`, `T-581`), numbered by the space's keeper -- the hub, or the phone when it is alone. An item made
offline shows a provisional handle until the keeper numbers it, so a handle, once given, is permanent.

### 4.6 When two places changed the same thing

| What | Rule |
|---|---|
| a field | the later write wins by hybrid logical clock; the other stays in the history and can be taken back |
| a long body (an entry, a page) | the later wins and the other is **set aside beside it** as a version, as the save trail does -- never lost; a text CRDT only if two people ever write one page together |
| links, tags, a checklist | added and removed by event id; an add and a remove that never saw each other keep the add |
| points | never merged: awards and spends are separate events, summed. An award's id is made from the item and its finish, so two phones that both finish one step offline make **the same** award, once |
| a save | a whole-file register, three-way by hash: the rule SYNC already keeps |

**Our own engine, not a library** (*decided by the user, 2026-11-19, by multiple choice: "our own small event
log"*). Document CRDTs (Automerge, Yjs) are made for shared text and
are heavy for a tracker; server-database sync (PowerSync, ElectricSQL, Zero) needs Postgres behind it, and a phone
alone must need nothing; local-first SQLite engines (TinyBase, LiveStore, cr-sqlite) are close, and their ideas are
worth borrowing. What the companion needs is narrow: the same code on `expo-sqlite` and `node:sqlite` (it has that already),
devices that speak plain JSON, and Redmine-style history. A log, a clock and a fold are a few hundred lines we own.

## 5. Replicas, sync and blobs

**A replica is any place that keeps a copy**: the phone, the hub, roverbyteseer, the Mac, later a cloud. Each has an
id and, per space, a record of what it has seen from every other replica (a version vector). **Sync is one exchange:**
"here is what I have seen; send me the rest" -- both ways, safe to repeat, in any order. The transport does not matter:
HTTP to the hub, the n8n relay's envelope, the tailnet, Bluetooth between a phone and a handheld, a USB cable, or a file
carried by hand. A replica holds only the spaces it belongs to.

```
   phone ---+                                   +--- a cloud, later (holds only ciphertext)
            +--- hub (home) --- roverbyteseer --+
   phone ---+       |                           +--- THE COMMONS (shared spaces, forms, creations)
                 devices: a view down, ticks up
```

- **A phone that hosted alone joins a hub later and loses nothing** -- it simply syncs. (Today it cannot.)
- **Devices stay thin.** A board pulls a view (today's step, the daemon) and pushes ticks, as now; the hub or the phone
  turns a tick into an event with the device as its actor. A Pi Zero could become a replica later.
- **Saves ride the same rails**: a SAVE kind whose versions are blobs, merged by the rule SYNC already has, so the
  phone-to-hub mirror and `syncCompanion.sh` become one path.

**Blobs: your data as a CDN.** Every binary is stored under its SHA-256: photos, attachments, paintings, voices,
songs, recordings, meeting audio, saves. An event names the hash; **any replica that holds a blob can serve it**; a
replica fetches what it needs from whoever has it (the hub, the seer, THE COMMONS, a cloud), checks the hash, and keeps
it for good -- the same hash is always the same bytes, so it is cached forever and stored once. Generated content is a
blob plus the event that says what made it (the recipe, the mind, the persona of the day), so its making is never lost.

**Who sees what.** Each space has a reach: **THIS PHONE** (never leaves it), **HOME** (the hub's household), **SHARED**
(named members), **PUBLIC** (THE COMMONS). A cloud would keep encrypted events and blobs -- a key per space, kept in the
phone's keychain -- and could relay and back up without reading. Which minds may read a space is the space's own
setting: a THIS PHONE space reaches only the phone's own mind. Nothing calls a paid model unless it is turned on.

## 6. ARETE: the daemon's economy

**ARETE is earned by rules.** Each kind has a default -- say a step 1, a milestone 5, a goal 20, a journal entry 2 (once a day),
a dream written 2, a lesson 3, a card reviewed 1, a recipe cooked 3, the day's centre tended 1 -- and **any item can
carry its own value**, set when it is made or proposed by the planner from its size (Redmine's story points, turned
into reward points). Points are paid **once per finish** (undo takes them back; doing it again does not pay twice),
each rule has **a daily cap** so tiny steps cannot be farmed, and **nothing is ever taken away** for a day missed.

**The week's balance.** A kind or an item can carry a virtue -- Chastity, Temperance, Charity, Diligence, Forgiveness,
Kindness, Humility -- and finished on its own day it earns a little more. **THE WEEK'S BALANCE** shows, per virtue, what
was lived this week and which shadow went untended: lit, never scolded (T-418: "over", never "cures"). Tending the
day's centre is the same mechanic for the chakras.

**Where points go -- three places:**

1. **The daemon.** A rule can also give the daemon what it gets today -- exp, bond, mood, a feeling -- with today's
   numbers, so moving GOALS onto the engine changes nothing the daemon feels. THRIVE reads the week's points instead
   of counting goals and steps.
2. **Real life.** **A REWARD SHELF the person stocks themselves** -- an episode, a coffee out, an hour of DAEMONS --
   each with a price. Spending is an event, and the daemon celebrates it with you.
3. **The game.** At SYNC, points can buy what the save writer already knows how to give -- money (as the casino does),
   an item in a pocket, a gift daemon, a story value -- capped per day, and only what the game lane agrees to (OPEN).

Unlocks are rules too: THE EUDAIMON LAYER's seven dawns is already one.

## 7. AI inside it

Every change has an actor, and an AI is an actor too: an **agent** with a role. Agents write **proposals** -- new
items, a breakdown, points for an item, links between spaces, a lesson -- and you accept, edit or decline each one.
The roles are MIND (their words, in `lifemanagement/` or `psyche/`), each handed a thinker; which machine runs a role is
THE MIND's routing, in `machine/` (C-387 holds).

| Role | Does | From |
|---|---|---|
| **REASON** | the logical pass: the real steps, their order, their size and points | `ai/breakdown.ts`'s first pass |
| **INSTINCT** | the associative pass: why it matters, what makes it easy to start, what it touches in your other spaces | its second |
| **the third** | reads both, keeps where they agree and where they do not, writes the plan | its third -- Musai's shape |
| **TUTOR** | for a learning space: the syllabus, lessons, cards and quizzes; marks answers; schedules review | Musai University |
| **READER** | a journal's chapters and READ THE SIGNS | `journal.ts`, `signs.ts` |
| **REVIEWER** | the week's review: the balance, what moved, what waits, and a focus proposed for the next | new |
| **WORKER** | in a work space, a ticket names an agent; n8n or THE MESH runs it and moves the ticket | AgileMusai |

*REASON and INSTINCT are the game's own pair -- the player's two ways, the GUIDE's and THE SUBTLE LAYER's (DRAFT).*

## 8. The forms of the first year

| Form | Kinds | Views | Points for |
|---|---|---|---|
| **LIFE** | Goal, Milestone, Step (any depth), Habit | TODAY, the tree, a board | steps, milestones, goals, a habit kept |
| **JOURNAL** | Entry, Chapter, Reading | the feed, a calendar | an entry a day |
| **DREAM JOURNAL** | Dream, Chapter, Reading | the feed | a dream written |
| **TENDING** | Tended | the week | the day's centre |
| **THE WEEK** | a view over every space's virtues | the balance | the virtue of the day |
| **LEARNING** | Course, Module, Lesson, Card, Quiz | the syllabus, a deck for review | lessons, reviews, quizzes passed |
| **RECIPES** | Recipe, Cooked | cards, the log | a meal cooked -- *it would eat, if you are eating* |
| **MEETINGS** | Meeting, Action (an item, no longer a string) | the feed | actions done |
| **WORK** | Job, Bug | a board, a list | its story points |

**The daemon keeps spaces of its own**: its dreams are its own dream journal, written by it as the actor.

## 9. Today's features, moved onto it

- **GOALS**: goals, subitems and steps become items in the person's LIFE space, each old id kept as a handle. **The
  routes stay as they are** (`/api/goal`, `/api/steps/:id/done`, the devices' ticks) in front of the engine, so the app
  and every board keep working unchanged. *One open goal* becomes TODAY's rule rather than the database's, and the
  40-character limit becomes the item's short title.
- **The JOURNAL** becomes spaces of the JOURNAL and DREAM JOURNAL forms; entries, chapters and signs become items
  linked *made from*.
- **TENDING, the subtle question, MEETINGS and VOICE NOTES** move out of their `settings` blobs into items.
- **The interactions log stays the daemon's**; an award writes to it what the daemon needs.

## 10. Redmine, and the site

**A bridge, both ways**: project to SPACE, tracker to KIND, status to STATE, custom field to FIELD, journal to EVENT,
relation to LINK, attachment to BLOB. **Off Redmine in three steps, each the user's call**: (1) the `daemons` and
`companion` projects mirrored in, read-only, to use the views on real work; (2) both ways; (3) the engine becomes the
source, `tools/tickets.py` talks to it, the TODO files' nightly mirror is unchanged, and Redmine retires.

**The site** is the app's web build against a hub or roverbyteseer replica, on its own subdomain under
daemons.codemusic.ca (C-408's network). More than one person needs C-11's accounts; THE COMMONS has guardians and
passkeys already.

## 11. The game world (later; ideas, all OPEN)

- Points spent at SYNC arrive in the game (section 6).
- A goal finished while a daemon was carried could come home as **a ribbon on that daemon** -- every daemon's record
  has ribbons -- so it remembers being there when you did it.
- The game keeps the same week (DAEMONS vision 9.21); the week's balance could colour the carried daemon's days there.

## 12. Phases

1. **The folders** (section 3), domain by domain, move-only commits. **C-428**
2. **The engine**: kinds, items, fields, states, the event log, the fold, UUIDv7 and the clock, on the existing `Db`;
   tested on Node and on the phone's engine. No sync yet. **C-429**
3. **GOALS onto it**, behind the same routes; the ARETE ledger and the rules with today's numbers; THRIVE from the
   ledger. *Phases 2 and 3 are the slice: one form, the same behaviour, new rails.* **C-430**
4. **Sync**: phone and hub by version vectors; a phone that hosted alone joins a hub; blobs by hash. **C-431**
5. **The JOURNAL, the DREAM JOURNAL, TENDING and MEETINGS** onto it; THE WEEK'S BALANCE. **C-432**
6. **Forms you make yourself**; LEARNING and RECIPES; the REWARD SHELF. **C-433**
7. **The site**; the Redmine bridge; a cloud replica, encrypted; its own repository. **C-434**

## 13. Decided, and OPEN

**Decided by the user, 2026-11-19, by multiple choice:** the names, **PRAXIS** and **ARETE**; the engine a package
here, **`packages/praxis/`**, its own repository before long; **our own small event log** for sync; **domains, with
`psyche/` and `machine/`** for the folders.

**OPEN:**

- **What the game will take for ARETE** at SYNC, and how much a day (the game lane).
- **The default ARETE per kind** and the virtue bonus (the numbers in section 6 are placeholders).
- **When PRAXIS moves to its own repository**, and its name there.
- **The site's subdomain.**
