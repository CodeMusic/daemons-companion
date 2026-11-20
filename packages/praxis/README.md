# PRAXIS -- the engine

PRAXIS is the project system under the companion's life management: goals, journals, tending, and any project a person
runs. Its points are **ARETE**. The design is [`docs/PROJECTS.md`](../../docs/PROJECTS.md); this package is its
section 4, the engine (C-429).

It imports **nothing from the companion and no package at all**: it runs on the phone's expo-sqlite and Node's
`node:sqlite` through the same small `Db` interface the companion's Store uses (C-111), and it moves to a repository
of its own with a `git mv`. `test/portable.test.ts` holds it to that.

## What it is

- **One append-only log.** Every change is an event, `{ id, space, item, op, field?, value?, actor, replica, hlc }`,
  with ops `make set move link unlink state note effort award spend propose accept decline archive`. The tables
  (`px_*`) are a fold of the log and can be rebuilt from it at any time (`rebuild()`).
- **Ids** are UUIDv7s, made anywhere, offline. An id two replicas must make alike (an award, an accepted proposal's
  change) is a UUIDv8 derived from a SHA-256 of what it names. The SHA-256 is plain TypeScript, so the phone and the
  hub derive the same id.
- **A hybrid logical clock** orders every event, so "the later write wins" means the same thing on every replica, and a
  change made after reading another always comes later, even from a slow clock.
- **SPACES, KINDS, STATES, FIELDS and FORMS.** A space is made from a form (data: kinds, each with states in four
  phases, open, doing, done and aside, and typed fields). Taking a newer form is an event.
- **Handles** (`LIFE-12`) are numbered by the space's keeper, provisional (`LIFE-~a3f2`) until then, kept once given. A
  kind with a `prefix` of its own is numbered on its own (`STEP-17`; kinds sharing a prefix share its numbers), and the
  keeper may give an item a chosen number as it is made (`make(..., { number })`), so items brought in from elsewhere
  keep the numbers they had (C-430: GOALS).

## How two replicas merge

| What | Rule |
|---|---|
| a field | the later write wins; every write is kept (`writes()`) and can be set again |
| a long body | the same, and a write that lost to one it never saw is set aside (`versions()`) |
| links, tags, a checklist | added and removed by event id: a concurrent add stands |
| a parent | a field; two moves that make a loop set the later aside (`tree()`) |
| ARETE | awards and spends are entries, summed. An award's id comes from its item and key (`finish:1`), so two replicas that finish one step offline pay once. Undo takes it back, and finishing again pays once. A rule can say what a finish pays (`state(item, "done", { pay })`, under its own cap), and a finish paid nothing is still an entry, so every finish can be read from the ledger (`ledger(space, { since })`, each entry with its item's kind) |
| a proposal | counts only once accepted; an accept anywhere takes it |

## Sync

`have()` says what a replica has seen (per space, the latest time from each replica). `missing(have)` is what the
other lacks, and `receive(events)` takes it. `sync(a, b)` runs the exchange both ways over any `Peer`, so the transport
does not matter. A space whose reach is `phone` is never sent. Which replicas may exchange which spaces, and blobs,
come in C-431.

## Use

```ts
import { Praxis } from "./packages/praxis/src/index.js";
const px = new Praxis(db);                 // a node:sqlite DatabaseSync, or fromExpo(openDatabaseSync(...))
const life = px.makeSpace({ title: "Life", prefix: "LIFE", form, reach: "home" });
const step = px.make(life, "step", { title: "Water the seedlings" });
px.state(step, "done");                    // pays the step's ARETE, once
```

The companion's GOALS are the first use (`server/src/goals.ts`, C-430): a LIFE space, its form's rules paying ARETE
under daily caps, behind the routes the app and the boards already call.

## Test

Node 22 or later: `npm install`, then `npm test` and `npm run typecheck`. Every suite runs twice, on `node:sqlite` and
through `fromExpo()` over expo-sqlite's call shapes. The native expo-sqlite itself is only exercised on a phone.
`test/converge.test.ts` has three replicas with skewed clocks make random changes and exchange them at random. They
must end with the same tables and the same ARETE, and so must fresh replicas that receive every event one at a time
in shuffled orders.
