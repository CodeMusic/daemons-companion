# The link cable (C-221) -- DRAFT, a spike

Two GBA games joined by **mGBA's own lockstep link cable**, run headless on one machine, each player's screen and
buttons over HTTP. It is the way the user chose on 2026-11-12 (`docs/TRADING.md`, "The link cable"): the app's
EmulatorJS core cannot link two phones, so the always-on machine runs both games and each player plays theirs from afar.

**Proven 2026-11-12**: CONTENT and CONTEXT (the DEBUG builds, on copies of their saves) met at the Cable Club, entered
the TRADE CENTER, saw each other's parties and traded; both saves hold the trade (read back by the server's own save
reader). mGBA 0.10.5, on a Mac.

```sh
seer/linkhost/build.sh                       # mGBA 0.10.5 as a library (checked by hash), then linkhost
seer/linkhost/linkhost A.gba A.sav B.gba B.sav 4795 seer/linkhost/link.html [ADDRESS]
```

It answers `127.0.0.1` unless it is given an address. **No ROM and no save is ever kept here** -- they are the player's.

| Path | What it does |
|---|---|
| `/` | the page: both screens, or `?p=0` / `?p=1` for one player's; arrows, X = A, Z = B, Enter, Shift, A/S = L/R |
| `/f/N` | player N's screen, 240x160 RGBX bytes |
| `/k/N/KEYS` | player N's buttons held, the GBA's key bits (A 1, B 2, SELECT 4, START 8, RIGHT 16, LEFT 32, UP 64, DOWN 128, R 256, L 512) |
| `/p/N/ADDR/8or16/VALUE` | a byte or halfword into player N's memory (the DEBUG build's theatre warp, `gDaemonsDebugWarp`) |
| `/state` | frames run by each game, and players on the cable |

The lockstep's callbacks are mGBA's Qt `MultiplayerController` ported to C; player 1 is the cable's master and keeps
the GBA's 59.73 frames a second, player 2 is paced by the cycles it is posted. Saves are written as the games write
them, and flushed when it is stopped (SIGINT or SIGTERM).

**Next** (TODO goal 7): run it on roverbyteseer, and reach each player's screen from the app's GAME tab -- the saves
carried there and back by C-188's mirror, the screen sent as video rather than raw frames.
