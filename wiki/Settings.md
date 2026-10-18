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

Home Assistant's address and token are not in this file: they are set on the site and kept by the server (below).

## In the app

- **SETTINGS, THIS APP** -- the build the phone is running, and whether a newer one is ready; and **LIGHT OR DARK**:
  Auto, Light or Dark (C-144). Auto follows the phone, or on the site the computer. Each keeps its own choice: the
  site in the browser, the phone on the phone.
- **SETTINGS, WHO ANSWERS WHEN YOU TALK** -- where your words go when you talk.
- **SETTINGS, THIS PHONE** -- on the phone: the companion it is paired with, and **Leave this companion** (tap twice),
  to host your daemon on the phone alone or to pair with another. Nothing on the companion changes.
- **SETTINGS, THIS PHONE HOSTS ON ITS OWN** -- on a phone hosting alone: **Take a newer save from Files** and **Give
  the save back to Delta**; and **A COMPANION ON A COMPUTER**, to pair with one instead
  ([Host on your phone](Host-on-your-phone#or-the-phone-on-its-own-c-111)).
- **SETTINGS, PAIR A PHONE** and **AWAY FROM HOME** -- on the site only: pairing
  ([Host on your phone](Host-on-your-phone#5-pair-it)) and the relay ([Away from home](Away-from-home)).
- **SETTINGS, HOME ASSISTANT** -- on the site only: Home Assistant's address and a long-lived access token, for the HOME
  tab. The token stays on this computer and is never sent to a phone or a device. Under it, **THE DAEMON AS ITS
  ASSISTANT**: the address Home Assistant's Ollama integration is given, and **New address**
  ([Home Assistant and the BOX-3](Home-Assistant-and-the-BOX-3)).
- **DEVICE, ITS SETTINGS** -- a board's settings: home, sleep, sound, the ring, the day's colours, MEET OTHERS
  NEARBY, the LORA BAND ([Boards](Boards#board-settings)).
- **DEVICE, EVERY DEVICE'S NETWORKS** -- one list of Wi-Fi networks for every device.

On the Tab5, SETTINGS, **THIS SCREEN** sets the way up (AUTO, PORTRAIT, LANDSCAPE) and AUTO, LIGHT or DARK. The Tab5 has
no system setting to follow, so its AUTO is dark through the daemon's night, 8pm to 6am by the companion's clock.
