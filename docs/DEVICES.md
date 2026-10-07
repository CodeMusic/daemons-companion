# The devices: one daemon each, and always connected (C-80, C-82)

*A design, 2026-10-07. Nothing here is built yet except where it says so. The open questions are at the end.*

## The devices

| device | screen | input | listens | speaks | lights | radios beyond Wi-Fi and Bluetooth | battery | how it reaches the server | state |
|---|---|---|---|---|---|---|---|---|---|
| **T-Embed CC1101** | 320x170 | dial, its press, top button | PDM mic | I2S speaker | 8 WS2812 | IR, NFC, Sub-GHz | gauge + charger | Wi-Fi, USB cable, phone | runs (C-26) |
| **T-Embed** (plain) | 320x170 | dial and its press | two mics (ES7210) | I2S speaker | 7 APA102 | -- | voltage only | Wi-Fi, USB cable, phone | built (C-67) |
| **T-Embed SI4732** | 320x170 | dial and its press | two mics (ES7210) | I2S speaker | 7 APA102 | AM/FM receiver | voltage only | Wi-Fi, USB cable, phone | built (C-67); its radio C-69 |
| **T-Watch S3** | 240x240 touch | touch, the crown | PDM mic | I2S speaker | -- | LoRa, IR | PMU | Wi-Fi, USB cable, phone; LoRa later | built (C-71) |
| **the phone** | -- | touch | its mic | its speaker | -- | -- | -- | Wi-Fi at home, the relay away | runs |
| M5 StickS3, Cores, Tab5 | various | various | yes | yes | -- | -- | PMU | Wi-Fi | C-74, C-75 |
| **LLM630** (behind a T-Embed) | none | none | none | none | -- | -- | own gauge | UART to its T-Embed | C-76: the offline brain, not a device of its own |

*Built* means it compiles and has not yet run on that board.

## Every device has a name of its own

Today the server knows **one** handheld (`DeviceHub`) and **one** daemon away. With several devices it has to know
which is which, and it must never take one board for another, so the name comes from the hardware.

- **A board's id is its kind and the end of its MAC**: `t-embed-cc1101-36f484`. HELLO already names the kind
  (`HELLO daemons-companion t-embed-cc1101 3`); it gains the id as a fourth word. The phone's id is made once at install
  and kept in its secure store.
- **Every request a device makes says who it is**: an `x-device` header over Wi-Fi and the relay. A bridge (the cable,
  or the phone carrying a board over Bluetooth) learns the id from the board's HELLO and tags the lines it carries.
- **A key per device** (C-82): the first time a board is linked by its cable, the server gives it a key, kept in flash;
  every later request carries it. A device that is lost is forgotten on the site and its key stops working. On the
  home network today the device door is open; with keys it can be opened to the relay safely.

## One daemon per device (C-80)

- The game already lets any number of daemons be asked for (only the last one able to battle stays home), so **the
  limit is the server's**: `save/writer.ts` refuses a second AWAY ("one at a time"). It becomes **one per device**: a
  daemon sent goes to a device chosen on the site, or to the only device without one.
- **The server keeps which daemon each device carries by its identity** (personality and trainer id, never the party
  slot, which moves). `GET /api/device/state` answers **for the device asking**: its daemon, its art, its life.
- **The site lists the devices**: each with its daemon, its battery, when it was last heard and by which way, and a
  SEND TO list when the game has asked for a daemon.
- **Care, growth and meetings are per daemon already** (they follow the daemon home), so nothing there changes.
- **linkCompanion.sh** starts one bridge per cable it finds, each naming the board it carries; `updateCompanion.sh`
  already tells boards apart (C-81).

## Always connected (C-82)

The order a device tries, and what it keeps:

1. **The server on the home network** (Wi-Fi), as now.
2. **The relay** -- the public n8n relay today, a tunnel later -- for a device away from home that has Wi-Fi (a phone's
   hotspot, a cafe): the board learns the relay's address and its key when linked, and asks the same paths through it.
3. **The phone as its way out** -- a board over Bluetooth to the phone, the phone to home or the relay (runs today for
   the state; C-55).
4. **Nothing answers**: the device keeps working on what it last had (the phone does, C-62; the boards keep the state
   and their ticks), and sends what it held as soon as any way is open.

**The server itself must always be on**: roverbyteseer rather than this Mac. What has to move with it is the open
question below -- the save.

## Open questions for the user

1. **The save**: the game's save lives beside the emulator. If the server moves to roverbyteseer, how does the save get
   there -- the app sends it at SYNC, a shared folder, or the server stays on the Mac and only the relay is always on?
2. **Choosing a device**: when the game asks to send a daemon and there are several devices, is it chosen on the site
   (SEND TO) or by pressing a button on the device that should take it?
3. **The phone as a device**: should the phone carry a daemon of its own, or only ever carry a board's way out?
4. **The relay for boards**: is it all right for a board to talk to the public relay with its own key, or should boards
   away from home always go through the phone?

*Sources: the code (server/src/device.ts, server/src/save/writer.ts, firmware/esp32/src/net.cpp) and the game's party
menu (T-358).*
