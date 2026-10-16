# The ESP32-S3-BOX-3: a daemon as the home's voice assistant (C-138)

Espressif's BOX-3 -- an ESP32-S3 with a 320x240 touch screen, two microphones and a speaker on a dock -- runs
**ESPHome**, so it stays exactly what Home Assistant's own BOX-3 firmware makes it: the wake word heard on the board
("Okay Nabu", "Hey Jarvis" or "Hey Mycroft"), Home Assistant's voice pipeline, timers, announcements, mute. What changes
is the screen: **it is the daemon the box carries**, standing in its den, and the voice assistant's phases are drawn
over it.

| phase | the daemon |
|---|---|
| idle | as it is (its own expression: asleep, glad, sad...), blinking every few seconds |
| listening | rings of sound arriving above its head |
| thinking | a thought rising -- and what you said, on the floor |
| replying | its mouth moving where its mouth is known, a speech bubble where not -- and the answer, on the floor |
| error | a shake and a "!" |
| muted | its eyes lidded, a hush above it |
| timer | a bell, swinging |

A tap on the screen asks without the wake word.

**The pictures are drawn by the companion** (`server/src/face.ts`), as every host's expressions are: the box asks
`GET /api/device/face` every 20 s for its face's revision, and fetches the fourteen pictures (`/art/face/<phase>-<0|1>.png`)
again only when the daemon, its expression or its den changed. Until the companion answers, or while no daemon is
carried, each phase shows ESPHome's own illustration instead -- the box is never less than the voice assistant it was.
`npx tsx server/tools/boxface.ts OUT.png NAME...` draws the sheet of them.

## Which daemon

The box is a device like the others (DEVICES, C-80): its name is `esp32-s3-box-3-` and the end of its MAC. Once it has
asked the companion it appears in DEVICES on the site and the app -- choose its daemon there, from those the game has
sent away. A daemon sent with no device chosen goes to a device without one.

## Setting it up

1. **The companion listens on the network** (the site's SETTINGS), and you know the Mac's name or address.
2. Copy `box3.example.yaml` to `box3.yaml` and `secrets.example.yaml` to `secrets.yaml` (both ignored by git); set
   `companion_url`, the Wi-Fi, and the API key -- **the key Home Assistant already has for this box**, if it was adopted
   in ESPHome Device Builder, so Home Assistant keeps it as it was; or remove the `api:` lines for none.
3. Build and flash. ESPHome's own BOX-3 firmware takes an update over Wi-Fi, so no cable is needed:

   ```bash
   firmware/box3/box3.sh run
   ```

   It offers the box on the network, or a cable (`--device /dev/cu.usbmodem…`). The first build installs ESPHome's
   toolchain (ESP-IDF, about 2 GB, in `~/Library/Caches/esphome`) and ESPHome itself in `~/.esphome-venv`.
4. In Home Assistant the box keeps its entities and gains two: **Companion address** (change where it looks without
   rebuilding) and **Daemon** (which daemon is in it).

**From Home Assistant instead**: in ESPHome Device Builder, give the box this file as a package and only your own lines
around it:

```yaml
substitutions:
  companion_url: http://your-mac.local:4730
packages:
  daemon: github://CodeMusic/daemons-companion/firmware/box3/daemon-box3.yaml@main
wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
```

## What it is built from

`daemon-box3.yaml` is ESPHome's own BOX-3 voice assistant (esphome/wake-word-voice-assistants, `esp32-s3-box-3.yaml` at
a159d9a, Apache License 2.0), its voice parts unchanged; the head of the file lists what was changed. It needs ESPHome
2026.9 or later. Pins and chips are ESPHome's: the screen an ILI9342C (`mipi_spi`, model S3BOX), touch a GT911, the
microphones an ES7210, the speaker an ES8311.

HOME (C-139) is the same house reached by hand: the site, the app and the Tab5 list its rooms and switch its lights,
and ask Home Assistant's assistant in words.
