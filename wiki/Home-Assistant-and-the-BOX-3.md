# Home Assistant and the BOX-3

Three pieces, each on its own, all optional: **HOME**, your [Home Assistant](https://www.home-assistant.io) reached
from the app, the site and the Tab5 (C-139); **the ESP32-S3-BOX-3** as the home's voice assistant, with the daemon it
hosts for a face (C-138); and **the daemon as Home Assistant's conversation agent**, so the voice answers as the daemon
too (C-142). None of them needs the others. Every word on these screens is a draft.

## HOME: Home Assistant from the app, the site and the Tab5

**Set it up on the computer the companion runs on**: the site, SETTINGS, **HOME ASSISTANT** -- Home Assistant's
address and a **long-lived access token** (in Home Assistant: your profile, Security, Long-lived access tokens), then
**Save**. The token stays on that computer: it is never returned, never sent to a phone, the Tab5 or a board, and never
set through the relay. The card says when it is connected; **Forget the token** (tap twice) takes it away. A new
address forgets the token unless a new one is entered with it, so a token is never sent somewhere it was not made for.

Then **HOME**, in PLACES on the app, the site and the Tab5, lists your home by room -- the lights, switches, fans,
blinds, scenes, scripts, players and heating Home Assistant has in each -- each a tap: On and Off, Run, Open, Stop and
Close, play and pause, - and + for the heating. Locks are shown, never opened. A tap answers at once and is never kept
for later: away from the companion, it is not saved up to happen when you are back. **ASK THE HOUSE** sends a line in
words to Home Assistant's own assistant ("Turn off the kitchen light").

**State: built** and tested on the server. It has not yet been run against a real Home Assistant.

## The BOX-3: the daemon as the home's voice assistant

Espressif's ESP32-S3-BOX-3 is an ESP32-S3 with a 320x240 touch screen, two
microphones and a speaker on a dock. **It runs ESPHome, not the companion's firmware**, so it stays exactly what Home
Assistant's own BOX-3 firmware makes it: the wake word heard on the box, Home Assistant's voice pipeline, timers,
announcements, mute. What changes is the screen: **it is the daemon the box hosts**, standing in its den, in its own
expression, with the voice assistant's phases drawn over it.

| phase | the daemon |
|---|---|
| idle | as it is -- asleep, glad, sad ... -- blinking every few seconds |
| listening | rings of sound arriving above its head |
| thinking | a thought rising, and what you said, on the floor |
| replying | its mouth moving where its mouth is known, a speech bubble where not -- and the answer, on the floor |
| error | a shake and a "!" |
| muted | its eyes lidded, a hush above it |
| timer | a bell, swinging |

A tap on the screen asks without the wake word. **24 daemons speak with their own mouths**, checked by a person as their
eyes are ([Feelings and expressions](Feelings-and-expressions#the-eyes)); the rest speak with a speech bubble.

**The pictures are drawn by the companion**, as every host's expressions are: the box asks the companion for its face
every 20 seconds and fetches its fourteen pictures (seven phases, two frames each) again only when the daemon, its
expression or its den has changed. It asks only while nothing is being said. Until the companion answers, or while it
hosts no daemon, each phase shows ESPHome's own picture instead -- the box is never less than the voice assistant it
was.

**Which daemon**: the box is a device like the others. Once it has asked the companion it appears under PLACES, YOUR
DEVICES, under ESPRESSIF, with its picture; choose its daemon there from those the game has sent away. In Home Assistant
the box keeps its entities and gains two: **Companion address** (change where it looks without rebuilding) and
**Daemon** (which daemon is in it).

### Setting it up

1. **The companion listens on your network** (the site's SETTINGS, PAIR A PHONE, *Open to my network*).
2. Copy `firmware/box3/box3.example.yaml` to `box3.yaml` (never committed) and set `companion_url` to your computer's
   name and port (`http://<your-computer>.local:4730`). A box already on your Wi-Fi keeps it, so no Wi-Fi goes in the
   file. Only if Home Assistant knows the box with an encryption key does that key go in, through `secrets.yaml`.
3. Build and flash: `firmware/box3/box3.sh run` -- over Wi-Fi if the box is on the network, or down its cable with
   `--device PORT`. The first build installs ESPHome's toolchain, about 2 GB.

From Home Assistant instead: in ESPHome Device Builder, give the box
`github://CodeMusic/daemons-companion/firmware/box3/daemon-box3.yaml@main` as a package, with `companion_url` and your
own Wi-Fi lines around it. It needs ESPHome 2026.9 or later.

**Never flash it with `updateCompanion.sh`.** The box says no HELLO, so the script would ask what it is; skip it there.
The companion's own firmware flashed onto a BOX-3 replaces ESPHome; `firmware/box3/box3.sh upload --device PORT` puts
it back, and the box keeps its saved Wi-Fi.

**State: runs.** Flashed over ESPHome's factory firmware, hosting a daemon, all fourteen pictures arriving in under half
a second each. Home Assistant reconnecting to it after the flash has not yet been seen.

## The daemon as Home Assistant's conversation agent

The face is the daemon; the words can be too. The companion speaks enough of Ollama's API for Home Assistant's own
**Ollama** integration to take a daemon as its model. Its answers come from the companion's own talk
([Talk to your daemon](Talk-to-your-daemon)), in the daemon's own words, as the app and the handhelds have them; Home
Assistant speaks them.

1. The companion listens on your network, and the site's HOME ASSISTANT card shows **THE DAEMON AS ITS ASSISTANT**: an
   address ending `/ollama/<key>`. Give it to no one else; **New address** makes another (and Home Assistant then needs
   the new one).
2. In Home Assistant: Settings, Devices & services, Add integration, **Ollama**, and that address. Choose the model
   **daemon** -- the daemon the BOX-3 hosts, whichever that is -- or one daemon by its name. Leave "Control Home
   Assistant" off: the daemon does not switch things itself.
3. Settings, Voice assistants: in the box's assistant, the conversation agent is that Ollama agent, and **Prefer
   handling commands locally** is on. "Turn on the kitchen light" is then done by Home Assistant before the daemon is
   asked; anything else -- "what should I do this evening?" -- the daemon answers.

When the talk cannot be reached, the daemon says so in a line rather than leaving the box silent. The address answers
only its key, and never through the relay.

**State: built**, and checked with the Ollama client Home Assistant itself uses, against a stand-in talk. It has not
yet been tried in a real Home Assistant.

The design, and what the BOX-3's file is built from:
[firmware/box3/README.md](https://github.com/CodeMusic/daemons-companion/blob/main/firmware/box3/README.md).
