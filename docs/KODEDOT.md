# The Kode Dot: every routine in a pocket (C-424)

*Planned 2026-11-19. The user: "I also have this new device coming in about a month and would like to start planning
and developing software for it ... it has even more abilities (I have some 125khz tags I will love to unify in this
device along with other daemon routines)."*

## What it is

Kode's pocket maker device (kode.diy), shipping December 2026. It is the Tab5's pair of chips in a pocket: an
**ESP32-P4** (two RISC-V cores at 400 MHz, 32 MB of flash, 32 MB of PSRAM) with an **ESP32-C5** beside it for the radio,
over ESP-Hosted. It holds nearly every radio and sense the other devices have between them:

| part | chip | what the daemon does with it |
|---|---|---|
| screen | 2.06" AMOLED, 410x502, CO5300 over MIPI-DSI; capacitive touch (CST820 or CST916E) | the menus, then the den |
| buttons | a four-way pad, TOP and BOTTOM | up and down move, TOP opens and runs, BOTTOM goes back |
| 125 kHz RFID | a discrete front end on the antenna board | **LODESTONE** (below) |
| NFC | ST25R3916B | **TOUCHSTONE** |
| infrared | two emitters and a 38 kHz receiver, on the C5 | **FLARE** |
| Wi-Fi, Bluetooth | ESP32-C5: Wi-Fi on 2.4 and 5 GHz, Bluetooth LE | **UPLINK**, **WHISPER**, the companion's API |
| motion | a 6-axis IMU and a compass (which ones: below) | steps and bearings (C-427) |
| sound | ES8311 codec, a speaker and a microphone | the voice, push to talk |
| touch back | AW86233 driving an LRA | a tick on every move, a pulse when a tag is read |
| light | KTD2026 RGB LED | the routine type's colour |
| power | BQ25896 charger, CW2217 gauge, 1000 mAh | the battery on the status bar |
| storage | microSD; a 2 MB internal FAT | the INDEX and its art, as the Tab5 keeps them |
| the rest | a battery-backed clock; a 20-pin header (14 GPIOs, 5 V and 3.3 V); magnetic pads (USB and power) | the clock; the header for later |

## The decisions (the user, 2026-11-19, by multiple choice)

1. **A kodeOS app on Kode's SDK.** The Dot runs Kode's own launcher, kodeOS; DAEMONS is one app in it, written in C on
   kode-sdk (ESP-IDF 6.1, QP/C Active Objects, LVGL 9.6), using Kode's drivers. Not an Arduino sketch, and not a
   firmware of our own that replaces kodeOS. The SDK is GPL-3.0-or-later, so **`firmware/kodedot/` is published
   GPL-3.0-or-later** (with the RFAL permission Kode's template asks for, `firmware/kodedot/NOTICE.md`); nothing else
   in the repository changes licence.
2. **125 kHz: read, keep and play the author's own tags**, with a T5577 blank as the fallback, and a kept tag never
   leaving the Dot. `CONTEXT.md`'s boundary says it in full.
3. **LODESTONE** *(125 kHz)* is the routine type's name (DRAFT): a natural magnet, because these tags speak by magnetic
   coupling rather than radio, and a pair for TOUCHSTONE.
4. **The toolchain lives on roverbyteseer** (22 GB free there; this Mac had 7.5). `firmware/kodedot/seer.sh` copies
   the folder there and builds, reviews or runs it.

## How it is built

- **An app is a whole firmware.** kodeOS installs it into its apps region (11.75 MB, up to 64 apps) and starts it;
  kodeOS does not run while it does. **Any reset returns to kodeOS** -- BOTTOM held three seconds does it from any
  app -- and an app cannot make itself the one the Dot starts in. So the Dot opens on Kode's launcher, with DAEMONS one
  tap away. Wi-Fi survives the jump into an app; a new Bluetooth pairing is refused inside one (bonds made in kodeOS
  carry over), which shapes WHISPER.
- **One Active Object** (`main/daemons_ao.c`) owns the screen and the buttons and asks the SDK's owners for the rest:
  AO_Rfid for a read, AO_LedMgr for the light, the haptic's owner for a tick. It never blocks; a wait is a request
  whose answer comes back as an event. Work that must block goes on a `kode_worker`, as Kode's template shows.
- **The routines are a table** (`main/routines.c`), the same shape as the handhelds' `routines.cpp`: a type is a radio
  with a game name and its raw name in brackets, holding a list that may be empty.
- **Not the handhelds' code.** They are Arduino on ESP-IDF 4.4, the Tab5 Arduino on 5.5; the Dot is plain ESP-IDF 6.1.
  What carries over is the design -- the Tab5's store and outbox (`docs/TAB5.md`), the handhelds' routines and their
  words -- rewritten in C. The headers in `firmware/common/` are plain data and can be included as they are.
- **kode-sim** (kodediy/kode-sim) runs the real firmware on Espressif's P4 emulator, with the Dot's chips modelled:
  screen, touch, buttons, LED, haptic, charger and gauge, IMU and compass, speaker and microphone, microSD, and Wi-Fi
  through Kode's own C5 firmware. **It has no NFC, no 125 kHz and no infrared** -- those wait for the board.

```sh
firmware/kodedot/seer.sh build                       # the board's image, build/daemons.bin
firmware/kodedot/seer.sh review                      # kode-sim: boot kodeOS, install the app, play scenarios/menu.json
firmware/kodedot/scratch_companion.sh                # a fresh scratch companion on roverbyteseer (a synthetic save)
firmware/kodedot/seer.sh review scenarios/den.json   # ... and the den against it
firmware/kodedot/seer.sh run                         # the Dot in a browser here, http://127.0.0.1:8765
```

Two things about the simulator learned the hard way: a review's network is closed unless its scenario says
`"network": "internet"`, and its network is user-mode, so the Dot reaches a server on roverbyteseer by roverbyteseer's
own address (a scenario writes `@HOST_IP@`; `seer.sh` fills it in), never 127.0.0.1. About one install in three fails
in kodeOS's installer (`corrupt`, or an `appmgr` assert) before the app runs; run it again.

A review's verdict and screenshots come back to `firmware/kodedot/review/` (ignored). `scenarios/menu.json` walks to
LODESTONE, runs READ MY TAG (which, with no front end in the simulator, hears nothing), comes back, and **forbids any
line in the console shaped like a tag's ID**.

## LODESTONE (125 kHz) -- C-425

**What Kode's SDK already does** (v0.1.5, `kode_sys.h`): read an EM4100 tag's 40-bit ID (`kode_sys_rfid_read`), write an
ID to a T5577 blank and read it back (`kode_sys_rfid_write`), and **play an ID as an EM4100 tag** until told to stop
(`kode_sys_rfid_emulate_start`): Manchester at RF/64, loading the antenna through its shunt in time with the reader's
field. The decoders keep the ID in memory and never log it.

**What only the board can answer.** Kode's docs are written from the September V1 schematics and say emulation is "No"
and the reader "needs firmware validation"; the Dots that ship are V2, whose schematics are not published. The SDK's
emulation is newer than those docs. And the author's own tags may not all be EM4100: HID Prox (FSK) and Indala (PSK)
are common too, and would need decoders written from the front end's raw capture (`kdrv_rfid_lf_field_capture`) --
work worth offering back to Kode.

**The routines** (DRAFT words):

| routine | what it does | state |
|---|---|---|
| READ MY TAG | hold a tag to the Dot: its kind and ID on the glass, for five seconds of listening | **built**; the simulator hears nothing, as it should |
| KEEP A TAG | read it, name it with the pad or the touch keyboard, and keep it | on the board |
| MY TAGS | the kept tags; choose one and the Dot plays it while held to the author's own reader; rename, forget | on the board, if V2 plays |
| COPY TO A BLANK | write a kept tag to a T5577 card or sticker the author owns, and read it back | on the board |

**Where a kept tag lives**: only on the Dot -- the app's own settings (`kode_setting_*`, in kodeOS's NVS) or its data
folder on the internal FAT -- never on the microSD, which leaves the Dot in a pocket. It is never synced to the hub or
the phone, never put in the save or its mirror, never logged, never committed. **Forget** deletes it. Kode's own `kode.h` says of its settings
that anyone who can read the board can read them, so a kept tag is as safe as the Dot in the hand -- the same as the
fob it stands for; whether kodeOS encrypts its NVS is kodeOS's to say, and Kode is asked before the first tag is kept.

## The other routines -- C-427

- **FLARE (IR)**: `kode_ir_send` (NEC and named protocols), `kode_ir_send_raw` and `kode_ir_capture_*`, through the C5.
  The handhelds' learned remotes and the one shared list (C-165) carry over: TEACH A REMOTE, POWER, VOLUME, THEATER MODE.
- **TOUCHSTONE (NFC)**: READ MY TAG, HOLD A CARD (C-124), TAP A TAG and TEACH A TAG (C-176), on `kode_nfc_*`. The SDK
  also presents a card (`kode_nfc_emulate_start`), but V1's antenna board has no copper for it; whether V2 does is a
  question for the board.
- **WHISPER (Bluetooth)**: `kode_ble_*`. Pairing is kodeOS's (above), so PAIR MY PHONE becomes "pair it in kodeOS's
  settings first".
- **UPLINK (Wi-Fi)**: `kode_wifi_*`, and the one list of networks every device shares (C-93).
- **What no other board has together** -- proposed for the author to choose, nothing built:
  - a **compass**: the daemon points the way home, or to where a goal is done;
  - **steps** from the IMU, the daemon's walk (the T-Embed's question, `PLAN.md` 4, answered here);
  - the **haptic** as the daemon's heartbeat in the hand, quicker when it is hungry;
  - the **microphone** for push to talk, as on the Tab5 (C-66).

## Steps

1. **The toolchain and the skeleton.** ***Built 2026-11-19***: ESP-IDF 6.1, Rust and kode-sim on roverbyteseer
   (`~/kode/setup_seer.sh`); the app builds for the board (1.3 MB, 90% of the apps region free) and runs the ROUTINES
   menu -- five types, LODESTONE's READ MY TAG wired -- with the pad, the touch, the haptic and the LED.
2. **The den** (C-426). ***First slice built 2026-11-19***: the app opens on its daemon's den -- the day and its virtue,
   the daemon drawn from `/api/device/art` at three times its size, its name, level and care, the next step -- with DRINK
   FEED TRAIN SLEEP (WAKE while it sleeps) and ROUTINES under it. It is a board on the device's door: it names itself
   `kode-dot-` and the end of its MAC with `?device=` (a header cannot be set through Kode's HTTP calls), asks
   `/api/device/state` when it opens and every 30 s, and sends a care to `/api/device/interact`, drawn at once (C-121)
   and kept in order in kodeOS's settings until the companion takes it, so a reset loses none. The companion's address
   is the Dot's own setting, given over the cable: `function name="server" arg="http://HOST:4730"` at its console.
   `scenarios/den.json` passes against `scratch_companion.sh`'s synthetic save on roverbyteseer: the den, FEED ("Thank
   you. That helps."), SLEEP ("Goodnight.", and WAKE in its place), recorded by the companion. **Still to do**: the den
   kept on the Dot so it opens on it at once (the Tab5's store), its expression and its place (C-113, C-119), a key for
   away through the relay (the cable's link, C-82), and the address chosen on the Dot rather than typed at the console.
3. **The board arrives**: READ MY TAG on the author's own tags; which kinds they are; whether V2 plays a tag.
4. **LODESTONE's KEEP, MY TAGS and COPY TO A BLANK** (C-425).
5. **FLARE, TOUCHSTONE, WHISPER, and the senses** (C-427).

## Waiting on the board

- **Which motion chips V2 has**: the docs (V1) name a QMI8658A and a QMC5883P, Kode's own page an LSM6DSV and a LIS2MDL.
  The SDK's `kode_imu_*` and `kode_mag_*` hide which; anything below them must look first.
- **Which touch chip**: the CST916E answers at 0x5A, where the haptic's AW86233 also lives -- on the same bus.
- **Whether V2 plays a 125 kHz tag, and presents an NFC card.**
- **Which kinds the author's tags are.**

*Sources: kode.diy and its product page; docs.kode.diy (device/overview, soc, rfid, nfc, infrared, expansion, input,
power, display; internals/apps-region, boot-model, apps-and-examples); kodediy/kode-sdk v0.1.5 (`kode.h`, `kode_sys.h`,
`kdrv/rfid`, the examples), kodediy/kode-app-template, kodediy/kode-sim (README, docs/GUIDE.md), kodediy/KodeOS. The
Kickstarter page refused automated reading.*
