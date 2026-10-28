# Server API

The companion's server answers on <http://127.0.0.1:4730>: JSON in, JSON out. The code is
[`server/src/api.ts`](https://github.com/CodeMusic/daemons-companion/blob/main/server/src/api.ts), and
[`server/src/routes.ts`](https://github.com/CodeMusic/daemons-companion/blob/main/server/src/routes.ts) for the
requests a phone hosting on its own answers the same way (C-111) -- marked *alone too* below.

## Who may ask

- **This machine** may ask anything.
- **Another machine on your network** (with `host` at `0.0.0.0`, see [Settings](Settings)) reaches only the device
  routes (the board's side of the Devices table below), the two voice routes (`/api/ai/talk`, `/api/ai/speak`) and the
  art -- unless it is a **paired phone**, whose key (`Authorization: Bearer <key>`) opens everything but what is this
  machine's own.
- **Through the relay** ([Away from home](Away-from-home)), a paired phone reaches everything but what is this
  machine's own, and a board reaches only the device routes, with the key it was given down its cable. Pairing is
  refused.
- **This machine's own**, never through the relay: `/api/pair/code`, `/api/pair/phones`, `/api/pair/forget`,
  `/api/settings/network`, `/api/settings/pick`, `/api/settings/reveal`, `/api/settings/relay`, `/api/settings/home`.
- **Home Assistant's door**, `/ollama/<key>/...`, answers only the key in its address, and never through the relay
  ([below](#home-assistants-conversation-agent)).
- **A meeting or a voice note** (`/api/device/meeting/...`, `/api/device/voicenote`) is taken only from a board with
  its own key (handed to it down its cable), a paired phone, or this machine -- never on an `x-device` anyone on the
  network could claim.
- **YOUR SAVES, the mirror and the testing builds** (`/api/saves...`, `/api/save/mirror`, `/api/game/debug...`) answer
  this machine or a paired phone, never a board; the testing builds never through the relay either.
- **THE EXCHANGE**, `/api/exchange/...`, answers the home network and the tailnet, never the relay
  ([below](#trading)).

A device names itself with an `x-device` header, or `?device=` through the relay.

**From a browser**, a request must come from a page of the companion's own (its `Origin`) and name an address of the
companion's (its `Host`); anything else is refused with 403, so no other web page can drive it. A request body is JSON
of at most 4 MB: a bigger one is refused with 413, and one that is not JSON with 400.

## The day, goals and the walk

| route | what it does |
|---|---|
| `GET /api/today` | the day (colour, note, virtue over its shadow), the season of the daemon's edition, and the one next step (*alone too*) |
| `GET /api/goals` | every goal, its sub-items and steps (*alone too*) |
| `POST /api/goals` | `{title, breakdown?: true}` -- a goal, broken down when asked |
| `GET`/`POST /api/goal` | the one goal (`{title, replace?}`), its milestones and steps (*alone too*) |
| `POST /api/goal/step` | `{text, milestone?}` -- a step, in a milestone if one is named (*alone too*) |
| `POST /api/goal/milestone` | `{title}` -- a milestone (*alone too*) |
| `POST /api/goal/remove` | `{step}` or `{milestone}` (*alone too*) |
| `POST /api/steps/:id/done` (`/undo`) | tick a step off, or undo it (*alone too*) |
| `GET`/`POST /api/walk` | the walking goal and today's steps (*alone too*) |
| `GET /api/where` | C-174: a watch's fixes, the newest first (`?device=`), and the distance walked since `?since=` (*alone too*) |
| `POST /api/where/find` | `{id, stop?}` -- FIND IT: that watch asked to say HERE and sound until it has a fix; `stop: true` takes the ask back (*alone too*) |

## The game

| route | what it does |
|---|---|
| `GET /api/party` | the party of the configured save copy (*alone too*) |
| `GET /api/profile` | the save's trainer, the player's choice and rival, play time, money, shoes, INDEX counts, MARKS and their wisdom, ROOTS, the DIPLOMA, OPUS, the places visited, the groves found, where it was saved, whether it is the companion's game -- and `casino`: what the CASINO has won or lost since the last SYNC (`pending`, `spins`, `balance`) and who is at the reels now (`table`) (*alone too*) |
| `GET /api/index` | the save's INDEX: seen and bound, each entry, OPUS's margins, and each entry's NATIVE lines (*alone too*) |
| `GET /api/species/:id` | one daemon's name, types, category and its edition's INDEX entry (*alone too*) |
| `GET /api/notebook` | the NOTEBOOK pages the save holds, by section: each page's words, its kind (a song is `song`, with its key, notes and frames), whether it is still unread in the game, where it was found, and its link where the game draws a QR code; and the twelve key colours and the outline the SONGBOOK's staff is drawn in (*alone too*) |
| `GET /api/progress` | GAME EVENTS -- every row held, not yet (and then unnamed) or unknown -- and CALLOW SCHOOL: the floors stood on, the TEXTBOOK, the DIPLOMA, the best and last mark, the sittings and the grade (*alone too*) |
| `GET /api/play` | the instrument the save's edition plays (the HARP for CONTENT, the FLUTE for CONTEXT), whether the save holds it yet, and each song learned or only heard; `?preview=1`, for a check, as if held with every song learned (*alone too*) |
| `GET /api/guide` | whether the save has found THE GUIDE, and once it has, the book by part and chapter, with its title and author for a screen to set over the cover (*alone too*) |
| `GET /api/books`, `GET /api/book?book=&n=` | C-208: the books the save holds, as a watch's BOOKS reads them -- the shelf and its chapters, then one chapter; never `?preview` (*alone too*) |
| `GET /api/index/list`, `GET /api/index/entry?species=` | C-199: THE INDEX as a watch reads it -- every daemon met, a line each, with the counts seen and bound; then one entry, its kind, types, words and OPUS's margin (*alone too*) |
| `GET /api/dreams` | C-200: the dream journal, the newest first (*alone too*) |
| `GET /api/soundings` | C-195: each daemon away, when it was last heard and how it was doing (*alone too*) |
| `GET /api/planner`, `GET /api/planner/wild?place=` | C-191: THE ROAD AHEAD, up to the next step and nothing past it; then one open place's wild daemons (*alone too*) |
| `GET /api/reads` | C-203: the companion's own log of THE SUBTLE LAYER's reads and leans -- `held` (the save has found the book; nothing else matters before), how many reads were given and landed, leans told and landed, and the last ten reads, each with its line, when it landed, or `open` while it still can (*alone too*) |
| `POST /api/subtle/ask` | C-229: `{text, mode: ask|voices, turn}` (or `audioBase64`) -- THE SUBTLE LAYER answers: `line` (its nearest page's own sentence, or the hub's module saying it), `back` (a question back), or `asking` (TWO VOICES); `answer` the whole, read aloud where the voice is (*a phone alone: the book's own line*) |
| `GET /api/subtle/today`, `POST /api/subtle/today` | C-230: the book's question of the day (`question`, `centre`, `note`, `word`, today's `answer`); POST `{text}` keeps the answer in the journal, one a day (*alone too*) |
| `GET /api/subtle/journal` | C-230: what was answered, newest first, with the day and the centre (*alone too*) |
| `GET /api/arcana/today`, `GET /api/arcana/draw?count=1|3` | C-232: THE SUBTLE LAYER's cards, once the book is held -- the day's card (the same all day for the save's trainer), or a fresh draw: one, or PAST PRESENT FUTURE; each `{n, roman, side: reason|instinct, keyword, phrase, name, species, shiny, art, face}` (`face` is `/art/arcana/<side>[_shiny].png`). Open to the boards (*alone too*) |
| `GET /api/subtle` | whether the save has found THE SUBTLE LAYER, and once it has, the book by section and page, each page's paragraphs in their voice (`telling` or `asking`) and its picture's frames; `?preview=1`, for a check, as if found (*alone too*) |
| `GET /api/marks` | each MARK's and understanding's words, colours and towns -- no save needed (*alone too*) |
| `GET /api/regions` | the two region maps' cells -- no save needed (*alone too*) |
| `GET /api/groves` | the groves' universes, signs and who lives in each -- no save needed (*alone too*) |
| `GET /api/school` | CALLOW SCHOOL's floors, syllabi, boards and the paper -- no save needed (*alone too*) |
| `POST /api/sync` | **SYNC**: read the save, bring a daemon across or home, link the save the first time, and write in the meetings, the experience earned and what the boards' CASINO won or lost (the money kept between 0 and 999999); and the trades -- what the exchange sent fetched first, each written into the slot its own left, TRADING set on every daemon in a trade, the exchange told after ([Trading](#trading)) (*alone too*) |
| `GET /art/<name>_front.png` | a daemon's art, from DAEMONS' own `gfx/daemons/` |
| `GET /art/party/<slot>.png` | a party daemon as the game draws it, its streaks painted for its routines; `?expression=` shades it |
| `GET /art/species/<id>.png` | a species as the INDEX draws it |
| `GET /api/art` | the same pictures as JSON, so they cross the relay: `?party=<slot>` (and `&expression=`), `?species=<id>`, `?all=species`, `?player=reason` or `instinct` (and `&walk=1`), `?mark=1` to `8`, `?guide=cover` |

## THE CASINO

[The CASINO](The-CASINO) has how it plays. Its rules are
[`server/src/slots.ts`](https://github.com/CodeMusic/daemons-companion/blob/main/server/src/slots.ts); its coins, seats
and admin page [`server/src/casino.ts`](https://github.com/CodeMusic/daemons-companion/blob/main/server/src/casino.ts);
the day's luck and dress
[`server/src/context.ts`](https://github.com/CodeMusic/daemons-companion/blob/main/server/src/context.ts).

| route | what it does |
|---|---|
| `GET /api/casino` | THE HOUSE: the day's luck and return with every reason (`context`), the hour and the weather (`world`), the holiday, and everyone at the reels in the last two minutes -- each by its device and the daemon it hosts, with the odds it last said and its reasons, the string's among them (`players`) |
| `GET`/`POST /api/weather` | the city whose real weather the devices follow (`{city}`; `""` forgets it), and the weather there now -- from Open-Meteo, asked every fifteen minutes while a city is set |
| `GET /art/subtle/<picture>_<frame>.png` | one of THE SUBTLE LAYER's pictures (and `/art/subtle/cover.png`, its cover, without lettering); `GET /api/art?subtle=<picture>_<frame>` the same as base64, for the phone away |
| `GET /art/head` | where a daemon's head is in its picture, for a holiday hat: `?slot=` (a party daemon) or `?species=` |
| `GET /art/casino/<piece>.png` | one of the CASINO's drawn pieces or hats, as the boards draw them; `?a=` and `?b=` the holiday's or the season's two colours, `?day=` the day's (each `RRGGBB`) |

A device's results reach the server as `POST /api/device/interact` with `kind: casino` (what a run of pulls came to,
counted once, never more than its pulls could come to) and its seat as `kind: table` (`here` or `gone`, and the odds it
plays at). A big win is a broadcast act, `JACKPOT` or `BIGWIN`.

## The daemon's life

| route | what it does |
|---|---|
| `GET /api/daemon/life` | the hosted daemon's life: mood, fed, watered, trained, drowsy or asleep, a cue at a meal time or bedtime, and its expression (*alone too*) |
| `POST /api/daemon/feed` (`water`, `train`, `sleep`, `wake`) | tend it -- `water` is DRINK on the screens; `sleep` puts it to bed, `wake` only wakes it (*alone too*) |

## Broadcasts

[docs/BROADCAST.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/BROADCAST.md) has the design.

| route | what it does |
|---|---|
| `GET /api/broadcasts?since=` | the broadcasts kept (the last sixty), each once, with the ways it came (*alone too*) |
| `GET /api/broadcast/acts` | the acts a daemon can do, from `server/data/acts.json`, and the CASINO's two (`casino`: JACKPOT and BIGWIN, never offered to choose) (*alone too*) |
| `POST /api/broadcast` | `{kind: say, act or reply, text or act, replyTo?, as?}` -- from the app, the site or the Tab5, as one of the daemons away (*alone too*) |
| `POST /api/device/broadcast` | a board's broadcast, sent (`dir: out`) or heard by LoRa or Bluetooth (`via`), kept once (*alone too*) |

Every device's state carries the last ten minutes' broadcasts as `casts`.

## Devices

| route | what it does |
|---|---|
| `GET /api/device/state` | what a device shows -- **for the device asking**: the day (its theme, virtue over its shadow, chakra, note, and its menu and light colours), the season, the one next step, its daemon (what it holds, its INDEX entry, its life, its `expression` and `den`, OPUS's margin), the party and their routines, the clock, its settings (its own over every device's), `holiday` (today's, and how to dress for it), `world` (the hour by the game's watches, and the weather), `casino` (`{money, pending, balance, seen, friends, table, reel, context, dress}`: the save's money, what waits for SYNC, what it plays with, which of its reports are counted, the party's other slots, who else is at the reels, the reels' daemons, the day's luck and return with its reasons, and how the CASINO is dressed), `play` (the instrument, whether it is held, the songs learned and heard), `casts`, and a note waiting for a card. `?expression=` draws it in another expression, for a check |
| `GET /api/device/art` | the hosted daemon's front sprite, as sixteen RGB565 colours and 4-bit pixels; `?slot=0` to `5`, a party daemon's, or `?species=`, a reel's daemon by its species |
| `POST /api/device/hello` | `{firmware}` -- a device's build (the Tab5) |
| `POST /api/device/battery` | `{percent, mv, charging, full, usb}` -- a board's charge, when it changes |
| `POST /api/device/ticks` | `{steps: [ids]}` -- the steps a device ticked off; answers with the new state and what to celebrate |
| `POST /api/device/untick` | `{step}` -- a step ticked by accident, undone |
| `POST /api/device/interact` | `{kind, detail}` -- a device was used (a routine run, a care): tending the daemon. `kind: casino` is a CASINO result, kept until SYNC writes it into the save; `kind: table` a seat at the reels; `kind: setting` (`sound on` or `off`) a board's SOUND page, kept as its own setting. C-203: `kind: read` (`<near|rain|night|walk> <0|1> [way]`) a read a watch gave, judged by what happens after; `kind: lean` (`<pays|not> <0|1>`) a lean told at the reels, and whether it landed -- neither is tending. Over the network a board logs only its routines, its cares, the CASINO, its seat and its sound |
| `GET /api/device/link` | (this machine) the board: linked or not and how, its routines, their results, and every device with its daemon |
| `GET /api/devices` | every device heard -- when, how, its firmware and battery, and which daemon it hosts -- and every daemon away |
| `POST /api/devices/carry` | `{id, personality}` -- put a daemon that is away in that device (`null`: none); it leaves the device that had it |
| `POST /api/devices/forget` | `{id}` -- forget a device; its key stops working |
| `POST /api/device/run` | `{routine}` -- run one of the board's routines |
| `GET /api/device/commands` | (the board) what the site sent it; `POST /api/device/results` and `/api/device/routines` answer |
| `GET`/`POST /api/device/settings` | every device's settings: home, sleep, sound, volume, ring, colours, meeting, LoRa band |
| `GET`/`POST /api/devices/<id>/settings` | one device's own settings over every device's: `shared`, `own`, what results (`settings`) and the keys it may keep (`keys`: home, sleep, sound, volume, ring, `wakeSound`, `face`, `faceSky`). A key sent as `null` goes back to every device's. This machine's, or a paired phone's -- never a board's own door |
| `POST /api/device/wifi` | `{ssid, password}` -- the board's Wi-Fi, sent down its cable only |
| `POST /api/device/networks` | the networks a board knows; a device that has proved itself is handed the whole shared list back |
| `POST /api/device/network` | `{op: forget, ssid}` -- a network forgotten everywhere |
| `GET`/`POST /api/networks` | the one list of networks every device shares (names only here), and adding to it |
| `POST /api/device/remotes` | the board's remotes, as it reports them |
| `POST /api/device/remote` | `{op, ...}` -- `activate`, `remove` or `rename` one of its remotes, or `add` a brand's whole remote |
| `POST /api/device/ir` | `{protocol, code, bits, keep?}` -- one IR code, tried (and kept) |
| `GET /api/ir/brands` | TV power codes by brand, for FLARE's search |
| `POST /api/device/beacon` | `{peer}` -- one of our own beacon tags, so it is never counted as a meeting |
| `GET /api/beacons` | what the phone needs for its beacon, our own tags, and the last listen |
| `POST /api/device/listen` | a board's last Bluetooth listen, for the check |
| `POST /api/device/met` | `{species, peer, how?, hops?}` -- a meeting nearby, by Bluetooth, LoRa, a card, or a T-Watch Ultra's TOUCH (`how: nfc`: the bond grows a little) |
| `POST /api/device/message` | a wave or a word over LoRa, heard or sent (eighty letters at most) |
| `GET /api/meetings` | C-60: who the daemon met nearby and whether a SYNC has written each in, and the latest waves and words. A meeting recorded on a watch is [below](#meetings-and-voice-notes-c-212-c-199) |
| `GET /api/device/greet` | the hosted daemon's hello, from its written lines (C-196) |
| `GET /api/remotes` | the names of the remotes every board shares |
| `POST /api/device/card` | `{uid, op}` -- a card held to a board: `read` what each holds, `put` the board's daemon on it, `take` the card's, or `swap` |
| `POST /api/device/note` | `{text}` -- a note for a card, typed on the T-Deck, kept until a reader writes it |
| `POST /api/device/note/written` | a reader has written the note onto a card |
| `GET /api/device/face` | (the BOX-3) its face's revision, the daemon's name and its den |
| `GET /art/face/<phase>-<frame>.png` | (the BOX-3) the daemon's face in a voice phase -- `idle`, `listening`, `thinking`, `replying`, `error`, `muted`, `timer` -- two frames each (0, 1) |

## Voice

| route | what it does |
|---|---|
| `POST /api/device/talk` | a board's recording (a WAV, raw): the daemon's answer, and a link to its voice. With `?async=1` (and on `/api/ai/talk`), answered at once with an `id` |
| `GET /api/device/talk/<id>` | that answer, when it is ready: `waiting`, then the words and the voice. Fetched once; the phone never keeps it |
| `POST /api/device/speak` | the hosted daemon's INDEX entry -- or `{species}`, any entry -- aloud: a link to its voice |
| `GET /api/device/voice/:id` | that voice, as 16 kHz 16-bit mono samples, for a board to stream (kept ten minutes) |
| `POST /api/ai/talk` | `{text}` or `{audioBase64, audioMime}` -- the phone's push to talk: the answer, what was heard, and the voice as mp3 |
| `POST /api/ai/speak` | `{species}` or `{text}` -- an INDEX entry or a line in the INDEX voice, as mp3 |
| `GET`/`POST /api/talk/settings` | who answers: `auto`, `local` or `openrouter` |
| `POST /api/ai/modules` | the AI boards to ask, set by hand (AN AI BOARD ON YOUR NETWORK) or from the hub's own search ([The hub and its AI](The-hub-and-its-AI)) |

## Meetings and voice notes (C-212, C-199)

A watch records a meeting in parts; the companion hears each part on the hub's module as it arrives, writes the
meeting up and has the daemon day-dream about it. A voice note is one recording of up to a minute, heard the same way
([The T-Watch Ultra](The-T-Watch-Ultra)). The device routes are on the device's own door, and take a recording only
from a board with its own key, a paired phone or this machine ([above](#who-may-ask)). A board's LAST MEETING is
only its own.

| route | what it does |
|---|---|
| `POST /api/device/meeting/start`, `/part`, `/end` | a watch's recording: begun, a half-minute part (raw audio), finished -- with how many parts there were and which were lost on the way, heard as nothing. 480 parts (four hours) and 500 MB a meeting at most |
| `GET /api/device/meeting` | the latest write-up, for the watch's LAST MEETING |
| `GET /api/meeting/list` | every meeting recorded, for the app's MEETINGS. (`GET /api/meetings` is C-60's: who was met nearby) |
| `GET /api/meeting/audio` | one part's recording, while it is kept (1.5 GB at most, the oldest cleared first) |
| `POST /api/meeting/retry` | hear again what was not heard, then write it up |
| `POST /api/meeting/forget` | the meeting and its recording, gone |
| `POST /api/device/voicenote?at=` | a watch's voice note, a WAV of up to 2 MB; `at` is when it was said, for a note kept on the card and sent later |
| `GET /api/voicenotes` | the voice notes and their words, for the app's VOICE NOTES |
| `POST /api/voicenote/retry`, `/api/voicenote/forget` | `{id}` -- hear it again, or forget it and its recording |

## HOME: Home Assistant

| route | what it does |
|---|---|
| `GET /api/home` | the home's rooms and what HOME can show in each: lights, switches, fans, covers, scenes, scripts, media players, heating; locks shown, never opened |
| `POST /api/home/act` | `{id, action}` -- only an action that kind allows; answered at once, never kept for later |
| `POST /api/home/ask` | `{text, conversationId?}` -- Home Assistant's conversation agent, in words |
| `GET`/`POST /api/settings/home` | (this machine) Home Assistant's address and a long-lived token -- the token is never returned -- and the daemon-as-assistant address; `{renewAgentKey: true}` makes a new one |

## Home Assistant's conversation agent

`/ollama/<key>/` speaks enough of Ollama's API for Home Assistant's own Ollama integration to take a daemon as its
model (C-142): `/`, `GET /api/version`, `GET /api/tags` (`daemon` -- the one the BOX-3 hosts -- then each daemon away
by its name), `POST /api/show`, `GET /api/ps`, `POST /api/pull` and `POST /api/chat`, streamed as Ollama streams. The
answers come from the companion's own talk ([Talk to your daemon](Talk-to-your-daemon)). The key is on the site's
SETTINGS, Home Assistant card; see [Home Assistant and the BOX-3](Home-Assistant-and-the-BOX-3).

## Settings and pairing

| route | what it does |
|---|---|
| `GET /api/settings` | the save path, where it came from, and whether it is a save |
| `POST /api/settings` | `{savePath}` -- set it (kept by the server; overrides `config.json`) |
| `POST /api/settings/pick` | a native file picker, on a Mac |
| `POST /api/settings/reveal` | open the save's folder in Finder |
| `GET`/`POST /api/settings/network` | whether the server is open to your network (takes effect at the next start), and the computer's address, its own name (`<name>.local`) and the port |
| `GET`/`POST /api/settings/relay` | the relay's address and secret |
| `GET /api/settings/away` | the relay's address, for a paired phone to keep |
| `POST /api/pair/code` | a six-digit pairing code, good once for ten minutes |
| `POST /api/pair` | `{code, name}` -- pair a phone: answers with its key and the relay's address |
| `GET /api/pair/phones`, `POST /api/pair/forget` | the paired phones, and forgetting one |
| `GET /api/version` | the server's commit, and whether the app has changed since a build |

## YOUR SAVES, the mirror and the hub

| route | what it does |
|---|---|
| `GET /api/saves` | C-215: every save the companion knows -- the one given, the mirror, those kept by name -- who each is (trainer, play time, MARKS, seen, where it was saved) and which it reads now; never a path |
| `POST /api/saves/choose` | `{id}` -- the save the companion reads, syncs and mirrors from now on; nothing is written |
| `POST /api/saves/keep` | `{b64, label?}` -- a whole save kept on the companion as one of its own, filed by its game, so the same game kept again replaces its copy |
| `GET`/`POST /api/save/mirror` | C-188: the one app's save -- the companion's mirror, and the device's sent to it (`{b64, base}`, `base` the copy the device last agreed with). 409 when it is another game's, or when the mirror has moved on since `base` |
| `GET /api/hub` | C-190: what this companion adds beyond a phone alone -- the save it mirrors, its AI boards and whether each answers, its LoRa boards and when one was last heard |
| `GET /api/game/debug`, `/api/game/debug/file?file=` | C-216: the testing builds' patches this companion keeps, if any, for this machine or a paired phone at home |

## Trading

[Trading](Trading) has how it works, and
[docs/TRADING.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/TRADING.md) the design. The app and
the site ask their own companion (`/api/trade...`); it asks THE EXCHANGE -- its own, on the hub, or the hub's over the
network -- as the player it joined as. A phone hosting alone answers the same, through the hub named in THE HUB.

| route | what it does |
|---|---|
| `GET /api/trade` | this companion's player, its game and edition, its AWAY daemons and which are free to offer, the offers and its trades, and how many deliveries wait for the next SYNC (*alone too*) |
| `POST /api/trade/hub` | `{url}` -- THE HUB: the hub's address, `http://<hub>:4730`; `""` makes this companion the hub. A new hub forgets the old player (*alone too*) |
| `POST /api/trade/join` | `{name, code?, password?}` -- join as a player, with an invite code unless this is the hub (*alone too*) |
| `POST /api/trade/offer` | `{personality, kind, to?}` -- offer an AWAY daemon, `full` (TRADE IT) or `loan` (LEND IT), to anyone or to one player (*alone too*) |
| `POST /api/trade/accept` | `{offer, personality}` -- take an offer, giving one of yours (*alone too*) |
| `POST /api/trade/withdraw`, `/recall`, `/password` | `{id}` -- take back an offer; `{id}` -- CALL MINE HOME on a loan; `{password}` -- set one (*alone too*) |
| `POST /api/exchange/invite` | on the hub, from this machine or a paired phone: an invite code, eight letters, once, for fifteen minutes |
| `POST /api/exchange/join` | `{name, code}` or `{name, password}`: a player's token. Eight wrong tries from one address in ten minutes, then 429 |
| `GET /api/exchange/players` | the players, for this machine or a paired phone |
| `/api/exchange/me`, `board`, `offer`, `accept`, `withdraw`, `recall`, `inbox`, `handback`, `written`, `password` | as a player (`x-daemons-player`): the exchange's own side -- who you are, the offers and trades, and at SYNC what arrives, a loan handed back, and what was written |
