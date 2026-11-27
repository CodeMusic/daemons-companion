# THE HOARD: the household's own local cloud storage

*DRAFT, 2026-11-27 (C-596). The user described all of it that day and asked for it built; this file says what was
built, how it works, and what is still to come. Every word a person reads in it is a draft.*

THE HOARD is to storage what THE MIND is to thought. The household's own machines offer room; a file put in is kept on
them, belongs to whoever put it there, and is shared only as its owner said; a file asked for comes from whichever
machine would deliver it soonest. Nothing is kept on anyone else's computers.

```
   a phone, a tablet, a computer                the hub                          the nodes
 +-----------------------------+        +-----------------------+        +--------------------------+
 | the app: THE HOARD's page   |  put   | THE LEDGER            |  beat  | the hub's own folder     |
 |  FILES, JOBS, CREATIONS     |------->|  every file, its owner|<-------| a computer running the   |
 |                             |        |  and share; every node|  want  |  standalone server       |
 |  a file fetched from the    |<-------|  and what it holds    |------->|  (EXTEND or REPLICA)     |
 |  node that is soonest       | ticket |  MAKINGS, one at a time|  drop |  each with a DOOR        |
 +-----------------------------+        +-----------------------+        +--------------------------+
              |                                                                     ^
              +--------------------- the file itself, for the ticket ---------------+
```

## 1. The nodes, shared with THE MIND (C-597)

The user asked that *the architecture code for THE MIND and THE HOARD be as common as possible*. What every network
of the household's machines keeps the same way is in one file, `server/src/shared/nodes.ts`, used by THE MESH
(`machine/procmesh.ts`) and by THE HOARD (`hoard/hoard.ts`):

| | THE MESH (work) | THE HOARD (files) |
|---|---|---|
| a NODE | dials out to the hub with a paired key, says what it can do and holds | the same |
| FRESH | heard from in the last 15 s | in the last 20 s (it beats every 5) |
| RELIABLE | (done + 1) / (done + failed + 2), over its last twenty | the same |
| the SCORE | potential x reliability x free | the same |
| potential | cores x measured speed | megabits a second it can deliver to whoever asks |
| free | (1 - load) / (1 + jobs held) | 1 / (1 + transfers in hand) |

A node of THE HOARD is known **by its paired key**, whatever it says its name is, as THE MESH knows a phone: no key can
speak for another's node, and a computer that is renamed is still the node it was.

## 2. Offers: EXTEND and REPLICA (C-599, C-575)

A machine offers a **drive or a folder** and **the most it will share**. THE HOARD keeps to a folder of its own inside
the one chosen (`daemons-hoard`) and never reads, counts or removes anything else there.

- **EXTEND** adds its room: a 1 TB hoard and a new 1 TB offer make 2 TB.
- **REPLICA** adds none and holds a copy of everything, in the same house or far away, so a file is still reachable
  while another source is offline.

The hub makes its own offer in THE ENGINE ROOM (THE HOARD, *THE HUB'S OWN OFFER*); any computer makes one in the
**standalone server** ([CodeMusic/daemons-server](https://github.com/CodeMusic/daemons-server), its THE HOARD card),
which carries the same node file the hub uses (`server/src/hoard/node.ts`, byte for byte). A machine that only has the
companion's code can run `server/src/hoard/hoard_node_main.ts`.

**Where a file is kept** (`rules.ts`, `plan`): one copy on the EXTEND node with the most room (a node that is here before
one that is away), and one on every REPLICA. A file is kept **whole on one node**, so a new file needs a node with that
much room, not only that much room in all. Nodes dial out, so each learns at its next beat what to fetch (from the
hub, or from another node's door), what to let go of, and what to hand back.

**Taking an offer back** drains it first: the node says its offer is gone and holds on, its door open, until every file
it held is held elsewhere, then lets go. The hub's own folder fetches what it is asked to keep the same way.

**WHEN** (C-601): a node takes part at any time, only on Wi-Fi (or a cable: never over a phone's data), and/or only
while plugged in. While it rests it says so, tells no door and moves nothing. The app keeps the same choice for what it
sends.

## 3. Files, owners and shares (C-598, C-576)

A file is put in as a **COPY** (a backup: the device keeps its own) or a **MOVE** (the device lets go, only after the
hub's hash of what arrived matches its own, and only where the file is the app's to remove). On the way in its owner
says who it is shared with and for how long:

| who | for how long |
|---|---|
| only yourself | -- |
| the household | always; a limited time (days, hours, minutes); or only until someone else has downloaded it |
| a friend outside the household (a link that opens that one file) | the same |

The hub alone decides who may read what (`server/src/hoard/rules.ts`, tested against a real server in
`server/test/hoard.test.ts`):

- its **owner** always reads it; the household while a household share lasts; a link's holder while a friend share lasts;
- when a share **ends** the file is its owner's alone again -- it is not removed (DRAFT);
- **until downloaded**: the first whole download by someone else ends the share; such a file comes only through the hub,
  which sees it arrive whole (a part of it is not a download);
- **only the owner who posted it removes it**; a keeper of THE HOARD, in THE ENGINE ROOM, may delete any;
- one person's several devices (a phone, a tablet) can be set together by a keeper, so each reads what the other kept
  to itself.

A friend's link works wherever the hub can be reached (the home network and the tailnet today). How a friend with
neither reaches it is C-613, asked of the user.

## 4. Where a file comes from (C-574)

`GET /api/hoard/files/<id>/sources` answers every node that holds the file and can be reached from where the asker is,
the soonest first (`server/src/hoard/route.ts`, which the app runs too with its own pings):

```
time = ping + size / (megabits a second x reliability x 1 / (1 + transfers in hand))
megabits a second = what its deliveries that near have measured, once there is one; else
                    its link's (Ethernet 400, Wi-Fi 80; DRAFT) when the asker is on its network,
                    and no more than its internet's upload when the asker is away
```

So it weighs how far away the node is, the upload speed of its internet, Ethernet or Wi-Fi, its current traffic, its
ping, and how its last deliveries went. Each source is an address that carries a **ticket**: the file's hash and an
hour it ends, signed by the hub with a secret only the hub and that node have. A node's door checks the ticket and
nothing else; the hub decided who may have one. The hub's own copy is a source too, and the hub **passing on** another
node's copy is the last resort. After each download the app says how it went, and the node's measured speed and
reliability change with it.

## 5. THE ENGINE ROOM's HOARD (C-600)

`/admin/#hoard` (`server/admin/hoard.js`): how much is used and whether every file is held, and held twice; each node,
its kind, its room, whether it is here and how it is linked; the hub's own offer; **WHEN IT IS FULL** -- *by hand* (a
new file is refused) or *the oldest first* (only as many as the new file needs; a dry run shows what would go) -- and a
**PROTECTED** file is never removed that way; every file with its owner and share, PROTECT, and delete; and its
**keepers**. The hub has no separate admin sign-in (C-330): until keepers are named, anyone with a paired key manages
THE HOARD, and the page says so. A keeper sees that a file is there; seeing is not reading.

## 6. In the app (C-501, C-602, C-603)

PLACES has THE HOARD's card and page: **FILES** (mine, shared with me), **JOBS**, **CREATIONS**. Audio plays in the
app; video plays (a web view on the phone: no new module); a text is read; a picture is shown; any file is saved or
shared as the original. A text can be **READ ALOUD** in a voice cast from the file itself, by a daemon the reader
picks, or by the daemon on the device (the default). SETTINGS has THE HOARD's WHEN and the default share.

## 7. Makings: JOBS and CREATIONS (C-605, C-577, C-604, C-606)

What the house's mind makes of a file is **queued and built one at a time** (`server/src/hoard/makings.ts`); a job says
its step and progress; a finished one is a **creation** kept in THE HOARD, its asker's alone until they share it.

| making | what happens |
|---|---|
| **SPOKEN** | a text file read aloud, in breaths of one voice |
| **MAGIC** | a picture is looked at by the house's own seeing model, given something to say and a voice cast to sound as it looks, and rendered as a video in which its mouth moves with the voice |
| **VIDEO** | a sequence of pictures, each speaking by magic, in the person's own words, or as a daemon they have -- with music under the voices; or silent, with a song that carries the words |
| **ANSWER** | a picture, a recording, a text or a creation asked a question, typed or spoken, answering as itself in its voice |

The mind's words are `server/src/psyche/photovoice.ts` (what is asked, how answers are read); the machine's doors are
handed in by `api.ts`: the seeing model (`machine/seeing.ts` -- a picture is shown only to the house's own models, never
one on someone else's machines), the house's writer, the voice door, the hearing, the music door
(`machine/musicdoor.ts`) and THE MESH's ffmpeg. **The mouth** (`hoard/render.ts`) needs no model and no browser: the
seeing model says where the mouth is; five stills are made with the jaw dropped a little more in each; the voice's
loudness picks the still for each frame; ffmpeg plays them under the voice.

Seen on the hub with the household's own models, 2026-11-27: a drawn test fox was looked at (about ten seconds), given
a line and a "bright and youthful" voice, and rendered as a nine-second video with its mouth on the right spot; asked
what it liked best about being a fox, it answered aloud in that voice.

## 8. The requests

| | |
|---|---|
| `GET /api/hoard` | how much is used, the nodes, who is asking |
| `GET /api/hoard/files?scope=mine\|shared\|all` | the files the caller may read |
| `POST /api/hoard/upload?name=&share=&friend=&minutes=&once=1&how=copy\|move` | a file put in (its bytes as the body) |
| `GET /api/hoard/files/<id>`, `POST` (name, share, how, protected), `POST .../remove` | one file; its owner's changes |
| `GET /api/hoard/files/<id>/sources`, `POST .../fetched` | where from, and how the download went |
| `GET /api/hoard/files/<id>/text` | a text file's words |
| `POST /api/hoard/make`, `GET /api/hoard/jobs`, `POST /api/hoard/jobs/<id>/stop\|again` | makings |
| `POST /api/hoard/files/<id>/ask` (`{text}`, or `?spoken=1` with a recording) | ASK A FILE |
| `POST /api/hoard/beat`, `GET\|POST /api/hoard/blob/<sha>` | a node's own |
| `GET /hoard/d/<sha>?e=&t=`, `/hoard/ping`, `/hoard/s/<token>` | the door: a blob for a ticket; a friend's link |
| `GET /api/engine/hoard`, `POST .../offer\|policy\|protect\|delete\|cleanup\|node\|person\|keepers` | THE ENGINE ROOM's |

## 9. Not yet

- **On a phone**: the app's pages have been used on the site, not yet on a phone (the next TestFlight build).
- **The devices** (C-607 the Linux boards, C-608 the handhelds): THE HOARD's files, JOBS and ASK A FILE on a device
  with a keyboard or a microphone. The hub needs nothing new for them.
- **The standalone server's reward** (C-609), its install from inside the app (C-610), and a phone or tablet version
  (C-611, the user's decision).
- **A friend with neither the home network nor the tailnet** (C-613, the user's decision); gamified sharing (C-502).
- **Other paths** for a transfer -- Bluetooth, radio, LoRa (C-574's remainder).
- **Cloud providers** as another kind of offer (C-612): later.
- **A real photograph's mouth**: tried on a drawing. A face read by a face model would place a mouth more surely than
  the seeing model does; pictures in formats the hub's ffmpeg cannot read (HEIC) are not yet converted.
- **A file larger than any one node** is refused: files are not split across nodes.
- **Linux and Windows nodes**: the Ethernet/Wi-Fi and on-power readings are written and untried there.
