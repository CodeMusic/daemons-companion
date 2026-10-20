# The hub: a CoreMP135 that never sleeps (C-168)

*Planned 2026-10-18 by a research workflow (M5Stack's documents, schematics, device trees and buildroot overlay; the
companion's own code read line by line; a critic pass), then brought up on the bench. The user: "I was thinking it could
be a server ... it would host bind and link companions", "and also serve lora and LLM". What has been run on the board
says so; everything else is the plan.*

## What it is

An **M5Stack CoreMP135**: an STM32MP135 (one Cortex-A7, 32-bit ARM), about 441 MB of memory that Linux can use, a
microSD card, two Ethernet ports, two USB-A ports behind a hub chip, a 320x240 touch screen, and the M5-Bus. Stacked on
it: a **LoRa433 v1.1** module and a **Module LLM** on its **LLM Mate**. It runs M5's Debian 12 image (kernel 5.15.118).

It can be the always-on home for everything the Mac does today while awake:

| | how | phase |
|---|---|---|
| **the companion server** (bindCompanion) | Node 22 (the last Node with a 32-bit ARM build), as a systemd unit | 1, 2 |
| **the cable bridges** (linkCompanion) | one bridge per board, started by udev, for boards on an allow-list | 3 |
| **a screen** | the framebuffer and touch, a small status app; PAIR A PHONE behind a confirm | 4 |
| **the daemons' offline AI** | the Module LLM over the Mate's Ethernet on the second port, as a talk provider | 5 |
| **a LoRa gateway** | the LoRa433 on SPI, a small userspace driver, relaying broadcasts (C-134) | 6 |

## Decided (the user, 2026-10-18)

- **The hub if it works well, roverbyteseer if it does not.** Either way the server stops depending on the Mac being
  awake (C-82).
- **The save comes to the hub as a copy**: from a share, or pulled off the GBA to where the server can see it. Never the
  user's own save.
- **The hub may transmit on 433 MHz** in this setting. An **868 MHz module comes later**, so the hub relays across both
  bands -- the boards are split between the two today.
- **The Module LLM answers if it answers well**, and n8n takes over when it is busy. n8n stays where it is: it does not
  move onto the hub.

## Before the cut-over: what the critic found

Five things the plan has to settle before the hub takes over from the Mac (Phase 2). None is a hardware question.

1. **The save must go both ways.** SYNC writes the save (LINKED, the AWAY answers, met daemons, experience, the casino)
   and marks those gains applied in the same transaction. A written copy that never returns to the game loses them for
   good. The hub has no save picker, so it needs `POST /api/save` (upload a copy, check it, back up, write) and
   `GET /api/save` (the written bytes), gated like SYNC; the phone already carries Delta saves through Files.
2. **The copied store carries settings that beat config.json.** A `savePath` row (a Mac path), a `host` row, and the
   marriage to one game's trainer. After copying it: clear `savePath` from the hub's loopback, check that settings
   report config.json, and decide which game the hub serves -- a different game means a fresh store or an explicit,
   local-only "marry this save" action, never a hand edit.
3. **Backups.** The hub would hold the only copy of the goals, the ledgers, every phone and board key, the relay and
   Home Assistant secrets and the shared Wi-Fi list, on a microSD card in a box that can lose power. Keep the store, its
   config and the save copy outside the clone; snapshot it consistently (`VACUUM INTO`, never a copy of the live file),
   encrypt it, and push it off the card; rehearse a restore once.
4. **Only one server.** linkCompanion.sh, `updateCompanion.sh --link` and `./bindCompanion.sh` all start a server on the
   Mac when none answers on 4730, which would bring the Mac's old store back and split phones between two. At the
   cut-over the Mac's store is renamed, and the scripts learn to refuse and say "open the tunnel" instead.
5. **Every client follows the address.** Wi-Fi boards keep the server's address from their state, so the address the
   hub advertises must be its LAN port's, never the LLM link's or a tunnel's (a `lanInterface` setting, with a test).
   Then: the relay's Forward, the Tab5 and the phones re-paired, the BOX-3's companion address, Home Assistant's
   `/ollama` URL.

## The phases

**Phase 0 -- bring-up** (`hub/phase0.sh`, run on the hub twice). New passwords, SSH by key only with fresh host keys,
the timezone, the root partition grown to the whole card; then the upgrade, the packages, and a read-only probe.
Each Ethernet port's MAC is pinned, because the board makes up a new one at every boot and the router gave it a new
address each time.

**Phase 1 -- the server by hand.** Node 22.23.3 in `/opt/node22`, a `daemons` user, the code in `/opt`, the data in
`/var/lib/daemons-companion`. `npm ci`, the typecheck and the tests on the board, then the server against a scratch
store, timed. Answers "can it run bindCompanion", with `bindCompanion.sh`'s Node gate the one expected blocker.

**Phase 2 -- always on, and the cut-over.** A systemd unit (memory-capped, waits for the clock), the five things above,
and `./bindCompanion.sh never` on the Mac.

**Phase 3 -- cable bridges.** One bridge per board by its USB serial, per-device queues in the server so boards do not
wait on each other.

**Phase 4 -- the screen.** Status, the boards on the hub, and pairing.

**Phase 5 -- the Module LLM.** The Mate's RJ45 to the hub's second port on its own small network; a module provider
alongside n8n, extending the existing talk setting rather than adding a second one; the talk prompt rebuilt for the
module's short window.

**Phase 6 -- LoRa.** The 433 gateway on SPI (CS, IRQ and RST on the module's DIP switches). The hub's own broadcasts are
registered as its own before it ever transmits, so it never answers itself.

**Phase 7 -- later.** The 868 module; Node after Node 22's end of life (2027-04-30).

## The cut-over (Phase 2)

*Decided 2026-10-20: the hub takes **the Mac's store** (goals, ledgers, paired phones, board keys, secrets), and serves
**the same save the Mac does**. The playground (the game in a browser, T-428) stays on another computer: a demo site is
a different job from this board's.*

**The save, both ways: `./syncCompanion.sh`.** SYNC writes the save, so a copy that only went to the hub would lose
what SYNC wrote at the next push. The script remembers the save as it was at the last sync and moves only the side that
changed; if both did, it stops and keeps both (`push` or `pull` chooses). It refuses to bring the hub's copy back while
the emulator has the save open. `art` sends DAEMONS' own pictures; `backups` brings the hub's nightly store snapshots
off its card. Its settings are in `.hub` (see `.hub.example`; never committed).

**In order:**

1. On the hub: `sudo bash ~/phase2.sh install` -- starts nothing. Then `sudo tailscale up` and approve the link, so
   talk reaches the voice server by its Tailscale name.
2. On the Mac: fill in `.hub`; `./syncCompanion.sh art`; `./syncCompanion.sh push` (the first copy of the save).
3. On the Mac: `./bindCompanion.sh never`, and stop any server still on 4730. Snapshot the store with the server
   stopped (`sqlite3 server/companion.sqlite ".backup companion.sqlite.cutover"`), copy it to the hub's home, and rename
   the Mac's to `companion.sqlite.migrated-<date>`.
4. On the hub: `sudo bash ~/phase2.sh cutover ~/companion.sqlite` -- installs it, starts the server, clears the
   store's own save path (a Mac path) so the shared save is read, and says so.
5. On the Mac: `SERVER_ON_HUB=1` in `.hub`. From then on `bindCompanion`, `linkCompanion` and `updateCompanion --link`
   start no server here; they say to open the tunnel (`ssh -N -L 4730:127.0.0.1:4730 <hub>`), through which the site,
   the bench tools and a cable bridge on the Mac reach the hub as if it were local.
6. Clients follow: the public relay's companion Forward to the hub's address (and a DHCP reservation for the hub's
   pinned MAC, so the address stays); Wi-Fi boards take the hub's address from their next state; re-pair the phones and
   the Tab5 (through the tunnel's site); the BOX-3's companion address and Home Assistant's `/ollama` URL.

**Going back**: stop the hub's unit, `./syncCompanion.sh pull`, copy the hub's newest backup to the Mac's
`server/companion.sqlite`, take `SERVER_ON_HUB` out of `.hub`, point the relay back, `./bindCompanion.sh always`.

## Measured on the board

*Filled in as each phase runs. Raw output, addresses and serials stay out of this repo.*

### Phase 0

*Run 2026-10-18 and 19.* **Passed.** The first run took the 1 GB root filesystem to the whole card (28 GB) in one
reboot. M5's own `resize_mmc.sh` would have left it at 1 GB: the image's GPT ends at 1 GB, so the backup header has to
move first (`sgdisk -e`), and its fsck of the mounted root is skipped. The second run upgraded the image's packages and
installed the hub's (374 in all, ffmpeg most of them) in fifteen minutes: ten for the upgrade, four for the packages.
The single core was about 85% busy unpacking, so the card was not the limit.

| | found |
|---|---|
| system | Debian 12, kernel 5.15.118 (M5's build: apt does not update it) |
| memory | 441 MB; 378 MB available with nothing of ours running |
| card | 28 GB root, 6% used after the upgrade |
| clock | a hardware RTC (`/dev/rtc0`) and NTP synchronised; holding time through a power cut is test 17 |
| heat | 67 C idle, 75-76 C with the core flat out |
| Tailscale | `CONFIG_TUN=m`: kernel mode works, so talk can keep roverbyteseer's Tailscale name |
| boards' USB serial | `cdc_acm`, `cp210x`, `ftdi_sio` built; **`ch341` is not** (CH340 boards will not appear) |
| memory limits | `CONFIG_MEMCG=y` (systemd's MemoryMax works); no zram |
| overlays | `CONFIG_OF_OVERLAY=y` |
| LoRa's SPI | `spidev0.0` is SPI4 (`spi@4c002000`), the LoRa433's bus: no overlay needed |
| screen and touch | `fb1` is the ILI9342C; the touch is `EP0110M09` on `event0` |
| watchdog | `/dev/watchdog0` (listed, never opened: it reboots the board 32 s after) |
| M5-Bus power | not driven by Linux yet (PI3 unexported); measure 5 V before touching it (test 11) |
| the MACs | made up again at every boot; pinned per port in NetworkManager by `phase0.sh` |
| listening | SSH; avahi (mDNS); M5's nginx serving Debian's welcome page on 80 (disabled at boot, restarted by the upgrade) |
| in the way | **ModemManager** is enabled: it probes every new `/dev/ttyACM*` with AT commands, which would talk over each board on the hub. Masked in Phase 1. |

### Phase 1

*Run 2026-10-19 (`hub/phase1.sh`, detached under `systemd-run`).* **Passed: the hub runs the companion server.** The
one thing that refused was `bindCompanion.sh`'s Node gate, as expected.

| | on the hub (one Cortex-A7) | |
|---|---|---|
| Node | 22.23.3 armv7l, SQLite 3.51.3 | needs `libatomic1`, which M5's image lacks; V8's default heap here is 130 MB |
| `npm ci` | 58 s; largest process 108 MB | rolldown's ARM binding wants glibc 2.16, lightningcss 2.18 (Debian has 2.36); both load |
| typecheck (TypeScript 7) | 19 s, 101 MB, clean | `--singleThreaded` |
| tests | 5 min 15 s, one worker; **306 passed, 3 skipped, 2 failed** | the Mac, Node 22.23.3: the same suite in 5 s |
| least memory free | 271 MB, during the tests | the 1 GB swapfile was never touched (0 pages out) |
| ffmpeg | **5.5 s** for one second of sound | almost all of it start-up: Debian's build loads every codec; a handheld's talk runs it twice |
| server, cold | first answer in 15.0 s; 79 MB (94 MB with tsx's esbuild child) | |
| server, warm | first answer in 7.1 s; 65 MB, 64 MB idle, 66 MB after faces and routes | |
| a face | 0.3 s each | |
| routes | 10-15 ms (`/api/today`, `/api/goals`, `/api/broadcast/acts`) | `/api/index` answers 404 with no save, as it should |
| heat | 73 C at the end | |

**The two failures are the board's surroundings, not the server.** `api.test.ts` "the art (C-05)" asks for a daemon's
picture from DAEMONS' own art beside the clone, which arrives in Phase 2. `generated.test.ts` re-runs
`casino_art.py`, which compares PNG **bytes**: Debian's Pillow (9.4, classic zlib) compresses the same pixels
differently from the Mac's (11.1, zlib-ng), so it reports 25 files to write. The three skips include the two voice
conversions, whose check looks for Homebrew's ffmpeg and not `/usr/bin/ffmpeg`.

**Since fixed, and green on the hub** (the same day). The controller session gave the art test a folder of its own,
made the voice tests skip on `voice.ts`'s own list of converters (so they find `/usr/bin/ffmpeg`), and made
`toDevicePcm` read from a file, never a pipe: a phone's m4a with its index at the end reads as nothing from a pipe past
ffmpeg's buffer, and the hub has no afconvert to rescue it (43b6cea). The casino session made `casino_art.py` compare
decoded pictures, then refuse to check or write on a Pillow older than 11: Pillow 9.4 rounds one edge pixel
differently in four of the pictures, so only the Mac redraws them (0069d02, 9a6f24d). At 43b6cea the hub passes the
**whole suite: 311 passed, 1 skipped, all 45 files, in 5 min 18 s**; the voice tests run there now (6 in 11 s).

**What it changes in the plan**

- Memory is not the limit it looked like: the server runs in a sixth of what is free, with room for the bridges, the
  LoRa gateway and the screen.
- Start-up is: 7 s warm is inside linkCompanion's wait, but a unit should not restart it often, and the cold start
  (15 s) happens after every update. A bundle built on the Mac (one file, no tsx) is worth measuring before Phase 2.
- ffmpeg's 5.5 s is the slowest thing on the board. Before the hub answers talk (Phase 5), the voice wants a lean
  ffmpeg (only the codecs it uses) or one kept running.
- Run the hub's scripts as the `daemons` user with `/opt/node22/bin` first; the clone and the store are its.
