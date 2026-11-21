# Caps: what is fitted, and what it can do (C-444)

*The user, 2026-11-21: "If the device supports the hat, it will have that support for that hat (e.g. LoRa, CC1101 +
NFC, and any others)." A cap is the module that clips onto a Cardputer's EXT header. This is one layer for every board
that takes one: it finds which cap is fitted, and offers what that cap can do, under the ROUTINES names the boards
already use (C-28). The Cardputer Zero has its own version of each piece (C++ on Linux); the Cardputer ADV shares the
same table and the same rules in its Arduino firmware. Every word a player reads is DRAFT.*

## The caps

| Cap | Chips | What it offers (ROUTINES type) | Boards |
|---|---|---|---|
| **Cap CC1101 + NFC** (U219) | CC1101 (315 / 433 / 868-915 MHz by an RF switch, up to +10 dBm); ST25R3916 (NFC) | **LONGWAVE** (Sub-GHz: listening, and ROLL CALL between the user's own devices); **TOUCHSTONE** (NFC: READ MY TAG, HOLD A CARD) | Zero, ADV |
| **Cap LoRa-1262** | SX1262 (LoRa, 868-923 MHz); a PI4IOE5V6408 at I2C 0x43 switches its antenna | **MESH** (C-72's frames, NEARBY, CALL OUT) | Zero, ADV (C-136, built) |
| **Cap LoRa-1262 + GPS** | the same, and an ATGM336H on a UART | **MESH**, and where the board is (C-174's GPS) | Zero, ADV |
| none, or one not known | | the CAPS page says so, and what is supported | every board with a header |

The **original Cardputer** has no EXT header, only Grove: it takes no cap. Its CAPS page is not shown.

## Finding the cap

No cap carries an ID chip (M5Stack's own apps do not detect one either: each opens its own chip and fails if it is
absent). So the layer **asks the chips, cheapest and safest first**, and never writes to a chip until it has named it:

1. **The cap's power on**, as M5Stack's apps do it (Zero: the header's lines routed to the cap, not to USB --
   `ext_usb_gpio_fun` 0 -- then `ext_5v_out` 1 and GPIO26 high).
2. **I2C 0x43 answers** on the header's I2C: the **LoRa-1262** (its antenna switch). This is the ADV's rule already
   (`board.cpp`). With the GPS variant, its UART speaks NMEA within two seconds.
3. **Otherwise, the CC1101's two status registers** over the cap's SPI (PARTNUM 0x30 and VERSION 0x31, read only):
   PARTNUM 0x00 and a VERSION M5Stack's driver accepts (0x04, 0x14, 0x20, ...) is the **CC1101 + NFC**. Its NFC chip is
   then asked for its identity (register 0x3F, `(id & 0xF8) == 0x28`).
4. **Otherwise, none**. A cap that answers none of these is "a cap this build does not know yet".

The answer is kept for the run: **a cap is never fitted or removed while the Zero is on** (it is not hot-swappable), so
it is found once at start and again only when CAPS is opened. On the ADV it is found at boot, as the LoRa cap is now.

## The Cardputer Zero's wiring (from M5Stack's apps and overlay, MIT; not yet seen on the device)

| | CC1101 + NFC | LoRa-1262 |
|---|---|---|
| SPI | `/dev/spidev0.1` (CS GPIO7), mode 0 | `/dev/spidev0.1`, mode 0, 1 MHz |
| second chip | ST25R3916: `/dev/spidev0.2` (CS GPIO22, made at run time by the `spi0-spidev2-gpio22` overlay, which needs root), mode 1, IRQ GPIO23 | -- |
| lines (`/dev/gpiochip0`) | GDO0 GPIO15; **RF_SW0 GPIO14** | DIO1 GPIO23, RESET GPIO26, BUSY GPIO22 |
| band switch | **RF_SW0** a GPIO; **RF_SW1 is the CC1101's own GDO2 pin**, set by writing IOCFG2 (0x6F high, 0x2F low) | DIO2 as the RF switch; P0 of 0x43 high |
| power | GPIO26 POWER_EN, `ext_5v_out` | `ext_5v_out`, `grove_5v_out` |

**The band switch** (M5Stack's table, the same on the ADV):

| Band | RF_SW0 | RF_SW1 |
|---|---|---|
| 315 MHz | 0 | 1 |
| 433 MHz | 1 | 0 |
| 868 / 915 MHz | 1 | 1 |

The ADV's pins (M5Stack's Cap CC1101 page): CS G5, GDO0 G15, RF_SW0 G13, SCK G40, MOSI G14, MISO G39, NFC CS G6, NFC IRQ
G4. Its LoRa pins are C-136's.

**The GPS variant's UART is `/dev/ttyS0` on GPIO14 and 15**, the very pins the CC1101 cap uses for RF_SW0 and GDO0. The
layer drives those two lines only after it has found a CC1101.

## Where the user is: the band rule

**The user is in North America.** The layer has a **region**, North America by default, and it decides which bands a
routine may transmit on:

| Band | Listening | Transmitting (North America) |
|---|---|---|
| 315 MHz | yes | **never** (left to the gadgets that live there) |
| 433.92 MHz | yes | yes: short bursts, long quiet (below) |
| 868 MHz | yes | **never** -- Europe's band |
| 902-928 MHz (915) | yes | yes, at low power |

The antenna on the cap is part of the rule: the user tells CAPS which antenna is on (433 or 868/915, as fitted), and
**nothing transmits on a band whose antenna is not on**, nor with none.

## LONGWAVE ROLL CALL: radio tests between the user's own devices (C-447)

*The user, 2026-11-21: authorized indoor tests between their own devices, one, some, many or all talking at once.*
Only the user's own devices, indoors, at the lowest power that crosses the house. **Nothing here listens for, records
or replays anyone else's signals**: a roll call hears only frames that carry the DAEMONS mark and a device id the hub
knows as the user's; everything else is counted as noise and dropped unread.

**One call, many answers.** A device calls ROLL CALL with a number; every device that hears it answers in **its own
slot**, so answers do not collide; the caller draws a table, one row each: who, the signal strength both ways, and how
many of the call's packets arrived. The modes:

| Mode | What it tests |
|---|---|
| **ONE** | a device calls; one named device answers (two devices: range, walls, the antenna) |
| **SOME** | named devices answer, each in its slot |
| **ALL** | every device that hears answers, each in its slot |
| **ALL AT ONCE** | every device answers in the same slot, on purpose: how many survive a collision |

**The frame**: the DAEMONS mark, the frame kind, the call's number, the device's hourly tag (the same one its
Bluetooth beacon and C-72's LoRa frames carry, so the hub already knows the user's own from strangers), the slot, the
power it sent at, and a CRC. 2-FSK (GFSK), the same rate and sync word on every CC1101. **The SX1262 can speak the
same GFSK** (it is not LoRa), so a LoRa-capped board can join a roll call on 915 later.

**Power and time**: low power by default (the CC1101 at -10 dBm, never above 0 dBm in a roll call), every burst under
a second, and at 433 MHz a call at most every ten seconds and the band quiet between: Part 15's rules for an unlicensed
periodic transmitter as the user reads them, kept in the code as limits a setting cannot pass. *This is a design, not
legal advice; the user is the licensee of nothing and transmits only on their own gear.*

**Results go to the hub** (`/api/device/rollcall`, later): each run's table kept, so a run on Tuesday and one on
Friday can be read side by side.

**Who can take part**, today and later: the Zero with the CC1101 cap; the ADV with it; the T-Embed CC1101 (C-28's
LONGWAVE board); the hub's own 433 MHz CC1101 downstairs; on 915, the LoRa boards through GFSK.

## How it is built

**On the Zero** (`firmware/pizero/src/caps/`): `spi` (spidev, by ioctl), `gpio` (the kernel's GPIO character device,
v2, by ioctl -- no library to install), `cap` (finding it, and the table above), `cc1101` (the chip: reset, status,
the band switch, tuning, listening, later the roll call's frames), and later `st25r3916` and `sx1262`. A **CAPS** page
on HOME's row says what is fitted, what it can do, the band and the antenna, and runs its routines. On a computer
(the SDL window) `--cap cc1101|lora|none` stands a pretend cap in, so the pages are drawn and checked without one.

**On the ADV** (`firmware/esp32/`): the same table and the same order of asking, in `board.cpp` at boot beside the LoRa
cap's 0x43, and LONGWAVE's routines given the CC1101 + NFC cap's pins. The frame, the slots and the limits are one
header both firmwares share (`firmware/common/`), as the LoRa frame is.

## Tickets

| Ticket | What |
|---|---|
| **C-444** | the cap layer on the Zero: finding the cap, CAPS, and the CC1101's band switch (first) |
| **C-445** | the CC1101 + NFC cap's NFC on the Zero: TOUCHSTONE through the ST25R3916 (C-391's second half) |
| **C-446** | the LoRa-1262 cap on the Zero: MESH (C-382's LoRa) |
| **C-447** | LONGWAVE ROLL CALL between the user's own devices |
| **C-448** | the cap layer on the Cardputer ADV |

*Sources: github.com/CardputerZero/Cap-CC1101-NFC, Cap-CC1101-SubG-Chat, Cap-LoRa-1262, Cap-LoRa-1262-GPS (MIT,
2026); github.com/m5stack/m5stack-linux-dtoverlays (`modules/CardputerZero/cardputerzero-v5-overlay.dts`); docs.m5stack.com
/en/cap/Cap_CC1101, /en/cap/Cap_LoRa-1262, /en/arduino/projects/cap/cap_cc1101.*
