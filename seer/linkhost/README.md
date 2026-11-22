# The link cable (C-221) -- DRAFT, a spike

Two GBA games joined by **mGBA's own lockstep link cable**, run headless on one machine, each player's screen and
buttons over HTTP. It is the way the user chose on 2026-11-12 (`docs/TRADING.md`, "The link cable"): the app's
EmulatorJS core cannot link two phones, so the always-on machine runs both games and each player plays theirs from afar.

**Proven 2026-11-12**: CONTENT and CONTEXT (the DEBUG builds, on copies of their saves) met at the Cable Club, entered
the TRADE CENTER, saw each other's parties and traded; both saves hold the trade (read back by the server's own save
reader). mGBA 0.10.5, on a Mac. **The same day on roverbyteseer** (built here with `MACOSX_DEPLOYMENT_TARGET=14.0` and
copied, as it has no cmake): the two games played from the Mac over the tailnet reached 2P LINK and the TRADE CENTER; a
screen deflated is about 2 KB and arrives in 60-80 ms.

```sh
seer/linkhost/build.sh                       # mGBA 0.10.5 as a library (checked by hash), then linkhost
seer/linkhost/linkhost A.gba A.sav B.gba B.sav 4795 seer/linkhost/link.html [ADDRESS]
```

It answers `127.0.0.1` unless it is given an address. **No ROM and no save is ever kept here** -- they are the player's.

| Path | What it does |
|---|---|
| `/` | the page: both screens, or `?p=0` / `?p=1` for one player's; arrows, X = A, Z = B, Enter, Shift, A/S = L/R |
| `/f/N` | player N's screen, 240x160 RGBX bytes, deflated when the request accepts it (every browser's `fetch` does) |
| `/v/N` | player N's screen as video: one connection held open, each changed frame deflated and led by its length (4 bytes, big-endian), a length of 0 each second the screen is still; at most 8 viewers. The link page uses it, and asks `/f/N` a frame at a time only where it cannot |
| `/k/N/KEYS` | player N's buttons held, the GBA's key bits (A 1, B 2, SELECT 4, START 8, RIGHT 16, LEFT 32, UP 64, DOWN 128, R 256, L 512) |
| `/p/N/ADDR/8or16/VALUE` | a byte or halfword into player N's memory (the DEBUG build's theatre warp, `gDaemonsDebugWarp`) -- **only when started with `LINKHOST_POKE=1`**, for testing; the hub never passes it on |
| `GET /s/N` | player N's save as the game holds it now (128 KiB) |
| `PUT /s/N` | a whole save into player N's seat: written to the seat's file, and that game starts again from it |
| `/state` | frames run by each game, and players on the cable |

The lockstep's callbacks are mGBA's Qt `MultiplayerController` ported to C; player 1 is the cable's master and keeps
the GBA's 59.73 frames a second, player 2 is paced by the cycles it is posted. mGBA's own logger is replaced by one
that keeps only errors -- left as it is, it writes megabytes a second. Saves are written as the games write
them, and flushed when it is stopped (SIGINT or SIGTERM).

**In the app (2026-11-12)**: the hub passes a player's screen, buttons and the cable's state on at `/api/link/`
(`server/src/game/linkcable.ts`; never `/p/`, never through the relay) and serves a phone-sized page with touch buttons at
`/link/`; the GAME tab's title has **LINK CABLE** for a paired phone, a seat for each player. The hub finds linkhost by
the setting `link.host` or `DAEMONS_LINKHOST` (e.g. `http://roverbyteseer:4795`, linkhost started with that address).

**Kept running on roverbyteseer (2026-11-14)**: `ca.codemusic.daemons.linkhost.plist` (copied to
`~/Library/LaunchAgents/`, `launchctl bootstrap` then `kickstart`) runs it from `~/daemons-linkhost/` on the tailnet
address only, the test pair of DEBUG saves in `run/`; the hub is told where it is with `POST /api/link/host
{"host": "http://roverbyteseer:4795"}` (a paired phone, or the hub itself). Its log: `~/Library/Logs/daemons-linkhost.log`.

**Each player's own save (2026-11-14, DRAFT)**: under the screen, the page lists the saves the companion knows (the
device's mirror, C-188, and saves kept by name, C-215). **SIT IT HERE** sends the chosen one into the seat (`POST
/api/link/seat {seat, id}`, then linkhost's `PUT /s/N`) and that game starts again from it; **TAKE IT HOME** brings
the seat's save back (`POST /api/link/home {seat}`, linkhost's `GET /s/N`) as a copy kept on the companion, labelled
LINK CABLE · PLAYER N and filed by who the game is, so a kept game comes back over its own copy. Nothing is ever
written over the mirror or anyone's own save: a game from the mirror comes home as a kept copy beside it.

**Next**: the screen sent as video rather than polled frames; the mirror itself carried home (a choice for the user,
since the device's save is the real one).
