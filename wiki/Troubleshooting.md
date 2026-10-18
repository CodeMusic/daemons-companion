# Troubleshooting

## The widget says *Looking for your companion...* and stays there

1. **Open the app once, paired.** The app is what hands the widget the companion's address and key. A widget that
   says *Open DAEMONS and pair this phone with your companion.* has not been given them yet.
2. **Allow the Local Network.** Settings, Privacy & Security, **Local Network**, and switch on DAEMONS companion.
   Without it neither the app nor the widget reaches the companion at home.
3. **Remove the widget and add it again.** A widget kept from an older build can stay stuck.
4. Check the companion is running and open to your network (the site, SETTINGS, PAIR A PHONE).

*No daemon here* is different: the companion answered, and the widget hosts no daemon yet. SEND one in the game, SYNC,
and choose it for the widget under DEVICE, YOUR DEVICES ([Host on your phone](Host-on-your-phone#7-choose-the-daemon-it-hosts)).

## A press on the widget says *Kept until home answers.*

The companion could not be reached when you pressed. Nothing is lost: the press is kept on the phone, and the widget
sends it itself the next time it reaches the companion -- or the app does, when it opens. If this happens **at home**:

- Is the server running, and the computer awake? `./bindCompanion.sh always` keeps both
  ([Running the companion](Running-the-companion#keep-it-running)).
- Was the phone paired by number, and has the computer's address moved? See the next section.

On a phone hosting on its own there is no companion to reach: its widget's presses wait for the app to open, and the
app tends them then.

## *Away from the companion* while you are at home

The app shows a toast at the foot (and, dismissed, a small **AWAY** at the top right) when it cannot reach the
companion and is showing what it kept. At home, the usual cause is a phone **paired by the computer's number**, and the
number has changed. SETTINGS on the phone says what it is paired with.

- **Pair again by name.** On the phone, SETTINGS, THIS PHONE, **Leave this companion** (tap twice); nothing on the
  companion changes. On the site, SETTINGS, PAIR A PHONE, **Show a code**: the address it offers is the computer's own
  name, `http://<your-computer>.local:4730`, which finds it on any Wi-Fi the two share, whatever its number. Type that
  and the code on the phone.
- **Stop it moving**: a DHCP reservation on your router, and a **Fixed** private Wi-Fi address on the computer
  ([Away from home](Away-from-home#a-fixed-address-at-home)).
- **The relay names the computer by address too.** If you use one, its Forward node has to say the computer's current
  address ([Away from home](Away-from-home#the-limit-the-relay-reaches-your-computer-at-its-home-address-c-88)).

The Tab5 is paired the same way, and looks a `.local` name up on the network itself.

## Many slow runs in n8n

A run of *Succeeded in 1m 0.0xs* is the relay's 60-second **timeout**: the companion did not answer it. The app asks
the relay one request at a time until it answers, and rests it 30 seconds after a failure, so you should see one run
per try ([Away from home](Away-from-home#reading-n8ns-executions)). If they keep coming, the relay cannot reach your
computer: check its address in the Forward node.

## SYNC says something unexpected

- **Close the game first.** A running emulator writes its own copy of the save back over the companion's.
- *"This save belongs to a different game…"* -- the companion is married to the first save you SYNCed; another game's
  save is shown but never written.
- No SEND in the game's menu? SYNC once first: the first SYNC links the save.
- *"The CASINO won ... but your MONEY is already full."* -- the save's money stops at 999999, and what the boards won
  past it is settled all the same.

## A board looks dead after flashing

Screen dark, nothing on the cable: it is waiting in its bootloader, and its battery keeps it powered when unplugged.
**Press RST once.** If an upload cannot connect at all, hold BOOT, press and release RST, let go of BOOT, and run it
again. More on [Flashing and linking](Flashing-and-linking#recovery).

## A board on Wi-Fi has lost the companion

A board that was out of touch while the computer moved to a new address keeps asking the old one. **Link it by cable
once** (`./linkCompanion.sh`): the bridge hands it the companion's address and the shared networks, and it goes back to
asking over its own Wi-Fi.

## The StickC-Plus shows a black screen with its Thermal HAT on

The HAT can hold a line the chip reads as it starts, which leaves it waiting in its download mode after a reset. **Hold
the power button six seconds, then press it.** Or, with the bridge stopped, from the computer:
`python3 firmware/esp32/hatfree.py`. If GLOW says it has not enough memory, flash the newest firmware: GLOW now fits
beside the daemon the stick hosts.

## The M5GO or Fire is silent with its LoRa433

The M5 LoRa433 module's reset is set by a small switch on the module. Set to **G25** it shares the speaker's pin: the
board makes no sound, and its amplifier may tick faintly at rest. **Set the module's reset switch to G13**; the firmware
finds it there by itself.

## A board that says nothing, and a BOX-3

`updateCompanion.sh` asks what a silent board is. Say only when you are sure: the wrong build replaces what the board
had. An **ESP32-S3-BOX-3** never says HELLO -- it runs ESPHome -- so skip it there. If the companion's firmware has gone
onto one, `firmware/box3/box3.sh upload --device PORT` puts ESPHome back, and the box keeps its saved Wi-Fi
([Home Assistant and the BOX-3](Home-Assistant-and-the-BOX-3)).

## HOME says to set up Home Assistant

HOME needs Home Assistant's address and a long-lived token, entered on the **site** (SETTINGS, HOME ASSISTANT), on the
computer the companion runs on -- never on the phone or the Tab5. A tap that Home Assistant refuses says so; nothing is
kept for later.

## A phone build fails

- **Out of disk.** `./bindCompanion.sh phone` generates an Xcode project, installs its pods and builds a Release build
  into `app/ios/build`, which takes several gigabytes. **Leave about 5 GB free** before you start. If a build fails
  part-way on a full disk, free space and run it again; deleting `app/ios` makes the next run generate the project
  afresh.
- **`cannot find type '__ObjC::expo'`**, with a newer Xcode (27.1 and its Swift 6.4): `./bindCompanion.sh phone` patches
  the Expo script behind it and builds Expo's modules from source, so build with it rather than by hand. That first
  build is slower.

## Still stuck

[docs/FIELD-GUIDE.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/FIELD-GUIDE.md) walks through
everything with what you should see at each step. The server's log is `.logs/server.log`.
