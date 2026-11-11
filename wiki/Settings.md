# Settings

## Your save

**The save path is easiest set in the app**: open **SETTINGS**, under YOUR DAEMONS SAVE click **Choose a save…** (a
native file picker on a Mac) or type the path under OR TYPE THE PATH and **Save**; **Open the folder** shows where it
lives. What you set there overrides `config.json` and is kept by the server, so SYNC just works. If you SYNC before
setting one, the app walks you through it.

**Always a copy.** The companion writes to this file at a SYNC -- when it answers the game (SEND, CALL HOME), and when
it writes in what was met nearby, the experience a daemon earned out here, and what the boards' CASINO won or lost --
and keeps a backup beside it in `companion-backups/` first. Close the game before every SYNC: a running emulator
writes its own copy back over yours. Point the emulator and the companion at the same `.sav` and the round trip just
works.

**Watched** (C-261). The companion watches the save it reads. A change that holds still is read again at once, and a
save that asks (a SEND, a CALL HOME) is SYNCed by itself as soon as no program holds the file open -- that is, once
the emulator is closed. `"watchSave": false` in `config.json` turns it off (the DAEMONS playground's own companions
do: the playground SYNCs as its COMPANION tab opens).

- **Never half a save.** The new save is written beside the old and then put in its place, so a crash mid-write leaves
  the old one whole. What a SYNC writes in is recorded as applied all at once, or not at all (C-157).
- **The backups are pruned** after each write: the newest sixty, and every one from the last fortnight, are kept; the
  rest are removed.

A phone hosting on its own keeps its own copy of the save instead, taken from Files
([Host on your phone](Host-on-your-phone#or-the-phone-on-its-own-c-111)).

## YOUR SAVES

**A companion can know more than one save** (C-215): the one you gave it (the save path above, or `config.json`'s), the
**mirror** of a device playing the game in [the one app](The-one-app#one-save-c-188), and saves kept on the companion by
name. With two or more, SETTINGS shows **YOUR SAVES**: each save's trainer and where it comes from, its play time,
MARKS, the daemons seen and where it was saved, and **READING** beside the one the companion reads now. Tap another
(**READ THIS**) to have the companion read, SYNC and mirror that one instead. Choosing writes nothing into any save;
choosing one that is not the mirror ends the mirror, as setting a save path does. Only a paired phone or the machine
the companion runs on may see the saves, so YOUR SAVES shows in the app and on the site opened on that machine, and
stays hidden on a hub's site opened from another browser.

**A game the mirror refuses.** The mirror never takes another game's place -- a new game begun in the app, say, would
otherwise replace the companion's. The app's GAME then offers, once a session, to **Keep it** on the companion as a
save of its own; told to, it keeps that game there each time it saves, and the same game kept again replaces its own
copy rather than piling up. Choose it in YOUR SAVES when you want the companion to follow it. Both were built on
2026-10-28.

## `server/config.json`

Everything else is in `server/config.json` -- copy
[`server/config.example.json`](https://github.com/CodeMusic/daemons-companion/blob/main/server/config.example.json).
It is never committed. The server runs on safe defaults with no config at all: **it reads no save and calls no model.**

| key | what it is |
|---|---|
| `host` | `127.0.0.1` (the default) serves this machine only; `0.0.0.0` serves the local network too, so a phone or a board can reach it. The site's SETTINGS, PAIR A PHONE, *Open to my network* sets the same (restart once after) |
| `port` | `4730` by default |
| `edition` | `CONTENT` or `CONTEXT` -- whose voice the daemon keeps, and whose season: CONTENT keeps the northern year, CONTEXT the southern |
| `savePath` | a **copy** of your DAEMONS save (`daemonsContent.sav` or `daemonsContext.sav`) -- **never the one the game is using** |
| `artDir` | DAEMONS' own `gfx/daemons/`, served at `/art/`; by default the DAEMONS checkout beside this repository |
| `talk` | the daemon's voice and words: `url` (your n8n's webhook base, `http://<your-n8n>:5678/webhook`), `secretEnv` (the *name* of the variable holding the shared secret, `DEX_SHARED_SECRET` by default) and optionally `localModel`. Off until `url` is set ([Talk to your daemon](Talk-to-your-daemon)) |
| `ai` | off by default. `enabled`, a `baseUrl` that speaks the OpenAI chat API, the `model`, and `apiKeyEnv`: the *name* of an environment variable holding the key, never the key itself. **Off, the goal breakdown answers with a built-in example**, so everything works without a model |

With `host` at `0.0.0.0`, only the device routes, the two voice routes and the art answer from another machine
without a key; everything else answers this machine or a paired phone only ([Server API](Server-API)).

Home Assistant's address and token are not in this file, and neither is THE WEATHER's city: they are set in SETTINGS
(Home Assistant's on the site only) and kept by the server (below).

## In the app

- **SETTINGS, THIS APP** -- the build the phone is running, and whether a newer one is ready; and **LIGHT OR DARK**:
  Auto, Light or Dark (C-144). Auto follows the phone, or on the site the computer. Each keeps its own choice: the
  site in the browser, the phone on the phone.
- **SETTINGS, THE WEATHER** -- the city whose real weather your devices follow, and THE CASINO's luck with them: type it
  and **Set**, or **Forget** it (C-158). The server asks [Open-Meteo](https://open-meteo.com) for it every fifteen
  minutes while a city is set -- no account, and only the city is kept, with the weather it last had. With none set,
  nothing is fetched ([The CASINO](The-CASINO#the-days-odds)).
- **SETTINGS, DEVELOPER MODE** -- off unless you turn it on: the game's workings, and a **</>** tab after PLACES with
  the game session, your daemon's sliders and LOGS ([below](#developer-mode)). There is no PREVIEW card any more
  (C-275): a book or the hour is previewed from **</>**, or on the site with `?preview=1` (or `harp`, `flute`) in its
  address. Either way the companion is asked with `?preview=1` and your save is never touched.
- **SETTINGS, WHO ANSWERS WHEN YOU TALK** -- the hub's first choice for your words (the Tiiny, the boards in the house,
  your own model or OpenRouter), with AN AI BOARD ON YOUR NETWORK, THE TIINY, THE VOICES and THE INDEX READS IN
  ([The hub and its AI](The-hub-and-its-AI)).
- **SETTINGS, THE MIND** (C-307) -- every mind the app can reach, each with its dot: THIS PHONE, THE HUB and AN
  ENDPOINT OF YOUR OWN; how far each kind of work may go (ANYWHERE, AT HOME, THIS PHONE); TRY IT, RECENT THOUGHTS; and
  at its foot **THE HUB'S ENDPOINTS** (C-280). Under it, **THE MIND AT WORK** (C-319): every task the house's mind has
  in hand, with STOP, TRY AGAIN and FORGET ([The hub and its AI](The-hub-and-its-AI#the-mind-c-307)).
- **SETTINGS, YOUR SAVES** -- every save the companion knows, and which it reads; tap one to read it
  ([above](#your-saves)).
- **SETTINGS, THIS PHONE** -- on the phone: the companion it is paired with, and **Leave this companion** (tap twice),
  to host your daemon on the phone alone or to pair with another. Nothing on the companion changes.
- **SETTINGS, THIS PHONE HOSTS ON ITS OWN** -- on a phone hosting alone: **Take a newer save from Files** and **Give
  the save back to Delta**; and **A COMPANION ON A COMPUTER**, to pair with one instead
  ([Host on your phone](Host-on-your-phone#or-the-phone-on-its-own-c-111)).
- **SETTINGS, MUTE THE GAME WHILE IT IS PUT AWAY** -- on an iPad on its side (or the Mac), with the game beside the
  companion: whether the game keeps its sound when the divider's ‹ puts it away (C-260).
- **SETTINGS, PAIR A PHONE** and **AWAY FROM HOME** -- on the site only: pairing
  ([Host on your phone](Host-on-your-phone#5-pair-it)) and the relay ([Away from home](Away-from-home)).
- **SETTINGS, HOME ASSISTANT** -- on the site only: Home Assistant's address and a long-lived access token, for HOME in
  PLACES. The token stays on this computer and is never sent to a phone or a device. A new address forgets the token
  unless a new one is entered with it, so a token is never sent somewhere it was not made for. Under it, **THE DAEMON
  AS ITS ASSISTANT**: the address Home Assistant's Ollama integration is given, and **New address**
  ([Home Assistant and the BOX-3](Home-Assistant-and-the-BOX-3)).
- **PLACES, EVERY DEVICE'S SETTINGS** -- what every device takes, carried to each board the next time it is linked:
  HOME, WHERE IT WAKES; SLEEP WHEN LEFT ALONE; SOUND; THE RING AT REST; THE DAY'S COLOURS -- EVERY SCREEN; MEET OTHERS
  NEARBY; and the LORA BAND ([Boards](Boards#board-settings)).
- **PLACES, YOUR DEVICES, ITS SETTINGS** -- one device's own, over every device's ([below](#each-devices-own)).
- **PLACES, EVERY DEVICE'S NETWORKS** -- one list of Wi-Fi networks for every device.

On the Tab5, SETTINGS, **THIS SCREEN** sets the way up (AUTO, PORTRAIT, LANDSCAPE) and AUTO, LIGHT or DARK. The Tab5 has
no system setting to follow, so its AUTO is dark through the daemon's night, 8pm to 6am by the companion's clock.

## Each device's own

Tap **ITS SETTINGS** beside a device in PLACES, YOUR DEVICES -- on the app, the site or the Tab5 -- and **ITS OWN
SETTINGS** open under it (C-159). Each row says whether it is **this one's own** or **as every device**, and a tap on
*back to every device's* hands it back to the shared one.

| row | what it sets |
|---|---|
| **SOUND** | Off, Quiet, Middle, Loud or Loudest |
| **THE WAKE JINGLE** | the few notes of the title theme **When it starts** (the default) or **Every time it wakes** |
| **HOME, WHERE IT WAKES** | the daemon, or today's step |
| **SLEEP WHEN LEFT ALONE** | 30 seconds to 5 minutes, or Never |
| **THE RING AT REST** | Off, Dim, A third or Bright |
| **ITS FACE** | on a round face -- the T-Watch S3, the Dial, the CoreS3 -- **DAEMON**, **CLOCK** or **VIRTUE**, each drawn small with that device's own daemon (C-162) |
| **SEASON AND WEATHER** | on a round face: the season's sky behind the daemon and the weather in front, On or Off (C-163) |

MEET OTHERS NEARBY, THE DAY'S COLOURS and the LORA BAND are every device's alike. The face pickers are built on the app,
the site and the Tab5; the Tab5's is not yet flashed, and the Dial and the CoreS3 have not yet been seen wearing them.

## Sound

**Every device's sound is its own.** On a board, its **SOUND** page (the one before SWITCH OFF) turns its sound off or
on with one press, and the companion hears it as that board's own setting. **The phone's own** is under PLACES, YOUR
DEVICES, **This phone's widget**, ITS SETTINGS: off silences the CASINO, the care phrases and the widget's buttons, and
the volume sets how loud they play (C-160).

**The tunes are one copy for every device**: the boards' own, on the day's note. The phone, the site and the widget play
them -- the CASINO's tunes and the care phrases, and on the phone and the site the SONGBOOK's songs -- on **your game's
own instrument**: DAEMONS' HARP for a CONTENT save, its FLUTE for CONTEXT, synthesized for the project and nothing of
Nintendo's (DAEMONS T-425). The Tab5's is built, not yet flashed. The boards play the same notes on their own beeps;
the boards with a speaker are to take the instrument too (C-164, open).

## DEVELOPER MODE

**SETTINGS, DEVELOPER MODE** (C-268) is off unless you turn it on, in the app and on the site. The app keeps the choice
on the device; the site keeps it for the visit. Off, the game shows none of its workings. On:

- **Under the game**, the frames run and drawn each second and whether the sound is running, and what EmulatorJS
  warned of while starting ([The one app](The-one-app#the-game-in-the-app-c-187)).
- **</>**, a tab of its own after PLACES (C-275), there only while DEVELOPER MODE is on: **THE GAME SESSION** as a
  developer wants to see it, section by section -- **THE BOOKS** (each held or not, as the save has it, and changeable;
  a book held here is read as a preview), **CALLOW SCHOOL** (the TEXTBOOK and the DIPLOMA), every **GAME EVENT** by
  section, **THE WITCHING HOUR**, **THE CREATOR'S HOUR**, **NIGHTS OF LIGHT** and **FROM THE OTHER SIDE** (as the clock,
  the date or the party has it, or on or off now), **YOUR DAEMON** (the sliders below) and **LOGS**. Each row is
  pre-checked as the save has it, and says so where you have moved it. **Everything here is in memory only**: nothing
  reaches the companion, the save or the game, and **Restore the game session**, DEVELOPER MODE off or the app closed
  puts the save's own answers back.
- **LOGS** -- the game's pace, how much memory the app's JavaScript holds (where it can say), whether the device hosts
  alone or the companion it is paired with, and every warning the game and the app gave, newest first. **PING** times a
  request to the companion, **COPY** shares the lines, **CLEAR** empties them. On an iPad on its side, LOGS is a panel
  at the right, beside the game and the companion, with a divider of its own to drag (its width is kept) and **›** to
  put it away. Elsewhere it is at the foot of the **</>** tab.
- **YOUR DAEMON** (C-269), in the **</>** tab (it was once a **</>** on the daemon's card): sliders for its MOOD, REST, HUNGER, THIRST, WEIGHT and COMPANY, each
  beside its true value, and the card's bars, its word and its width follow them
  ([Feelings and expressions](Feelings-and-expressions#how-it-has-been-cared-for-c-266)). **In memory only**: nothing
  reaches the companion, the save or the game, and **RESET**, the game session restored, DEVELOPER MODE off or the
  app closed puts it back. The shadows under its eyes are drawn by the companion, which never hears of the sliders, so
  they stay as they truly are.

Every word DRAFT.
