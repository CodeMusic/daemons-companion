# Settings

## Your save

**The save path is easiest set in the app**: open **SETTINGS**, under YOUR DAEMONS SAVE click **Choose a save…** (a
native file picker on a Mac) or type the path under OR TYPE THE PATH and **Save**; **Open the folder** shows where it
lives. What you set there overrides `config.json` and is kept by the server, so SYNC just works. If you SYNC before
setting one, the app walks you through it.

**Always a copy.** The companion writes to this file when you answer the game from the DAEMON tab (SEND, CALL HOME),
and keeps a backup beside it in `companion-backups/` first. Close the game before every SYNC: a running emulator
writes its own copy back over yours. Point the emulator and the companion at the same `.sav` and the round trip just
works.

## `server/config.json`

Everything else is in `server/config.json` -- copy
[`server/config.example.json`](https://github.com/CodeMusic/daemons-companion/blob/main/server/config.example.json).
It is never committed. The server runs on safe defaults with no config at all: **it reads no save and calls no model.**

| key | what it is |
|---|---|
| `host` | `127.0.0.1` (the default) serves this machine only; `0.0.0.0` serves the local network too, so a phone or a board can reach it. The site's SETTINGS, PAIR A PHONE, *Open to my network* sets the same (restart once after) |
| `edition` | `CONTENT` or `CONTEXT` -- whose voice the daemon keeps, and whose season: CONTENT keeps the northern year, CONTEXT the southern |
| `savePath` | a **copy** of your DAEMONS save (`daemonsContent.sav` or `daemonsContext.sav`) -- **never the one the game is using** |
| `talk` | the daemon's voice and words: `url` (your n8n's webhook base, `http://<your-n8n>:5678/webhook`), `secretEnv` (the *name* of the variable holding the shared secret, `DEX_SHARED_SECRET` by default) and optionally `localModel`. Off until `url` is set ([Talk to your daemon](Talk-to-your-daemon)) |
| `ai` | off by default. `enabled`, a `baseUrl` that speaks the OpenAI chat API, the `model`, and `apiKeyEnv`: the *name* of an environment variable holding the key, never the key itself. **Off, the goal breakdown answers with a built-in example**, so everything works without a model |

With `host` at `0.0.0.0`, only the device routes, the two voice routes and the art answer from another machine
without a key; everything else answers this machine or a paired phone only ([Server API](Server-API)).

## In the app

- **SETTINGS, THIS APP** -- the build the phone is running, and whether a newer one is ready.
- **SETTINGS, WHO ANSWERS WHEN YOU TALK** -- where your words go when you talk.
- **SETTINGS, PAIR A PHONE** and **AWAY FROM HOME** -- on the site only: pairing
  ([Host on your phone](Host-on-your-phone#5-pair-it)) and the relay ([Away from home](Away-from-home)).
- **DEVICE, ITS SETTINGS** -- a board's settings: home, sleep, sound, the ring, the day's colours, MEET OTHERS
  NEARBY, the LORA BAND ([Boards](Boards#board-settings)).
- **DEVICE, EVERY DEVICE'S NETWORKS** -- one list of Wi-Fi networks for every device.
