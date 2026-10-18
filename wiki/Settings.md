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

- **Never half a save.** The new save is written beside the old and then put in its place, so a crash mid-write leaves
  the old one whole. What a SYNC writes in is recorded as applied all at once, or not at all (C-157).
- **The backups are pruned** after each write: the newest sixty, and every one from the last fortnight, are kept; the
  rest are removed.

A phone hosting on its own keeps its own copy of the save instead, taken from Files
([Host on your phone](Host-on-your-phone#or-the-phone-on-its-own-c-111)).

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
- **SETTINGS, WHO ANSWERS WHEN YOU TALK** -- where your words go when you talk.
- **SETTINGS, THIS PHONE** -- on the phone: the companion it is paired with, and **Leave this companion** (tap twice),
  to host your daemon on the phone alone or to pair with another. Nothing on the companion changes.
- **SETTINGS, THIS PHONE HOSTS ON ITS OWN** -- on a phone hosting alone: **Take a newer save from Files** and **Give
  the save back to Delta**; and **A COMPANION ON A COMPUTER**, to pair with one instead
  ([Host on your phone](Host-on-your-phone#or-the-phone-on-its-own-c-111)).
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
