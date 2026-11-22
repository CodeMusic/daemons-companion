# The Zero and its Kit: an AI-self-sufficient pair (C-453)

*The user, 2026-11-21: M5Stack's **LLM630 Compute Kit** (with its SC850SL camera, C-194) mounted on the back of the
Cardputer Zero in a small 3D-printed housing, under the cap's lip, so the two read as one slightly thicker Zero.
They are joined by their USB data ports for power and data. The Zero keeps its Wi-Fi for the internet. Scripts run
each way, so the Kit can act on the Zero, and the pair is **AI-self-sufficient**: "even without a phone it should be
able to do so much." The shape below was settled with the user that day by multiple choice. Nothing here is built
yet. Every word a player or a guest reads is DRAFT.*

Read with **docs/LLM630.md** (C-76: StackFlow's JSON over UART or TCP 10001, the units, the speeds),
**docs/CARDPUTERZERO.md** (the Zero), **docs/CAPS.md** (the cap whose lip the housing sits under) and
**docs/HARDWARE.md** (the AX630C boards).

## The two halves

| | Cardputer Zero | LLM630 Compute Kit |
|---|---|---|
| compute | Raspberry Pi CM0, four A53 at 1 GHz | AX630C, two A53 at 1.2 GHz, **NPU 3.2 TOPS INT8** |
| memory | **352 MB** usable, 29 GB card | **4 GB** (2 for the NPU), 32 GB eMMC |
| radios | Wi-Fi 2.4 GHz, Bluetooth, IR, the cap | **Wi-Fi 6** (an on-board ESP32-C6), Gigabit Ethernet |
| USB | USB-A host; right USB-C OTG (a switch: host or device), its charge port | **J4** USB 2.0 OTG (in host mode it puts `SOC_VIN` on VBUS); **J5** power in + the CH9102 console |
| camera | IMX219 (full model) | **SC850SL**, 8 MP, on its CSI connector (C-194) |
| cell | 1750 mAh (about 6.5 Wh); 2.5 W idle, about 2.5 h | none in the box: a 3.7 V socket with its own AW32001 charger and BQ27220 gauge |
| size | 84.0 x 54.0 x 23.1 mm | **90.3 x 31.6 x 12 mm** (published, probably with its shell) |

The Zero does the game, the keys, the screen and the internet. The Kit does the thinking, hearing, speaking and
seeing, and has room for the companion's server.

## 1. The links (chosen: "Yes, that shape")

**The USB cable is the pair's own link, always: a network over USB.** It is the fastest and best of the options: no
radio, a few hundred Mbit/s on USB 2.0, low latency, and power on the same wire. One side is a USB network adapter
(**CDC-NCM**, or ECM where NCM is missing; RNDIS is only for Windows), and each side gets a fixed address on a private
/30 (DRAFT: the Zero `10.77.0.1`, the Kit `10.77.0.2`). Everything then runs over it with no protocol of our own:
StackFlow on 10001, `llm-openai-api` on 8000, SSH both ways (a key for each, made at pairing), the companion's
server, THE MESH. *Which side is the gadget is settled on the bench (below): the Kit's J4 in device mode on the
Zero's USB-A is the first try, since the Zero's right USB-C is its charge port.*

With the cable as the link, **both Wi-Fi radios are free**:

| | does | when |
|---|---|---|
| **the cable** | the pair's own link: the daemon's thinking, its actions, files, SSH | always |
| **the Zero's Wi-Fi** | the internet: the hub, the relay, the art server | when a network it knows is near |
| **the Kit's Wi-Fi** | **the pair's hotspot**: guests reach the daemon's site (section 3) | by charge (section 2), or a setting |
| **Bluetooth to the phone** | the internet when there is no Wi-Fi (the phone's tethering, Bluetooth PAN, on the Zero) | when the Zero's Wi-Fi has no network |
| none of these | the pair goes on offline: the game, talk, sight and actions all run on the two boards | always possible |

**The Kit is a node in THE MESH** (C-360, `server/src/procmesh.ts`). It dials in as the other nodes do and takes the
jobs it does well: whisper, a small LLM, YOLO, melotts. Its power score reflects the NPU, not its two cores, and it is
dropped when its charge is low (section 2) or the pair is away from every hub.

## 2. Power: the Kit only when it is needed (chosen: "many options")

The user has no cell for the Kit yet, so **every arrangement works**, and one setting says which is fitted:

- **The Kit's own cell**: a flat LiPo in the housing on the Kit's 2-pin socket. The cable carries data, and tops up
  only when one side is on a charger.
- **Powered over the cable**: no cell; the Zero's USB-A feeds the Kit 5 V. Both run from the Zero's cell.
- **On a charger**: either board on USB power, the other fed from it.

**Today, before a cell (the user, 2026-11-21: "can I use USB-C to USB-C to connect them and power?").** The Kit
comes with **no battery**: a 2-pin 1.25 mm socket for a 3.7 V LiPo, with its own charger and gauge (check the socket's
polarity against the board before plugging a cell in -- these connectors are not wired alike). Until one is fitted:

- **One cable, the Zero's USB-A to the Kit's OTG port (J4)**, USB-A to USB-C: the Zero gives 5 V and the cable carries
  the network. USB-A always gives power; *whether J4 powers the Kit as a USB device is the first bench check* (C-458).
- **Not the Zero's right USB-C, for now.** It is the Zero's own charging port: as a host (its switch) it may or may not
  give power, and a C-to-C cable between two boards that can each be either end may decide the wrong way round.
- **If J4 does not power it**: a small power bank into the Kit's power port (J5) and the data cable from the Zero to J4.

**Out and about, the best is the Kit's own cell**: a flat 3.7 V LiPo of 1000-2000 mAh in the housing, so the Kit never
eats the Zero's 1750 mAh (6.5 Wh, about 2.5 hours alone). Until then the Kit rests (its units unloaded) and is woken only
when a talk needs it, by the rule below; at home either board on a charger lifts every limit.

**The Kit is off or in standby by default, and started on demand.** Standby means StackFlow's units have exited and
their models are unloaded. Off means no VBUS from the Zero, or the Kit's own power held off; *whether the Zero can
switch the USB-A's VBUS, or wake a Kit on its own cell, is a bench question.* When something needs the Kit (TALK, an
action, the camera, a guest), the Zero checks both charges first:

| the lower of the two charges | what happens (DRAFT thresholds, each a setting) |
|---|---|
| **above 40%** | it asks once: *"Wake the Kit? It drains the cell faster."* (DRAFT), with *always* to stop asking |
| **10-40%** | it says it cannot, unless the user chooses **OVERRIDE** |
| **below 10%** | it refuses, with no override |

Once nothing has needed it for a while (DRAFT: five minutes), it goes back to standby. A charger on either board lifts
every limit. The Zero shows both charges side by side in its strip.

**Measure before trusting any of this**: the Kit's draw idle, in standby, mid-turn and with Wi-Fi as an access
point, on the cable from the Zero's cell and on a cell of its own.

## 3. The hotspot and the site (chosen: "Two passwords")

**The Kit's Wi-Fi becomes an access point by charge**: **on at 70% or above, off below 65%** (the gap stops it
flickering), both a setting, with a key on the Zero to force it on or off. The point: the user plays the game on the
Zero while someone else does something with the daemon, *"connect to such and such network."* The hotspot gives no
internet. It serves the daemon's site from the Kit.

- **A guest password** (the hotspot's own) opens **the guest view**: talk to the daemon, see it, the camera, and the
  painting (section 6). A captive page opens it on joining.
- **The owner's password** (or a sign-in, as on EUDAIMONIA) opens **everything**: the Engine Room, the saves, the
  settings, and the game in the browser.
- **The game for the owner only.** It is the ROM made from the user's own cartridge; a guest's browser never receives
  it.

*Unverified*: whether the ESP32-C6 can be an access point under M5Stack's image (the bench, below).

## 4. Talk offline first (chosen: start with "Talk offline")

**SAY on the Zero, answered by the carried daemon on the Kit, with no internet.** This is C-76's turn, which
`firmware/esp32/src/brain.cpp` already makes for the T-Embed, carried into the Zero's C++ over the cable's TCP 10001
(no UART speed limit). Hold to talk, using the Zero's microphone at 16 kHz mono. **whisper** hears it, the **LLM**
answers in character (the self from MIND's `self.ts`, cut short for the model's window), and **melotts** speaks,
each piece played as it arrives. When the hub is reachable, the hub's own voice and mind answer as now; the Kit is
what answers when they cannot.

## 5. HANDS: the daemon acts on the device (next; every Pi)

*The user: "the daemon should learn how to act on the zero ... something we can do with all pi models": soon the same
software goes into **RoverByte**, the user's robot dog, to walk, do tricks and read out stats from the user's own
Redmine.* So this is one small layer for every Linux device of ours, not the Zero's alone (DRAFT name **HANDS**).

- **Each device publishes its actions**: a manifest of named actions, each with its arguments, what it does in one
  line, and its class. The Zero's first set: open a page, feed, water, train, tick the next step, take a photo, read
  the cell, play a sound, say a line. RoverByte's: walk, sit, a trick, read a Redmine summary.
- **Chosen: named actions, risky ones ask.** A **harmless** action runs at once. An action that **spends, sends,
  deletes or moves** anything runs only after a yes on the device's own screen. **Nothing outside the manifest runs**:
  there is no shell for the daemon.
- **How the daemon calls them**: the manifest goes into the LLM's setup as tools, and its answer names an action by
  JSON. The device checks it against the manifest and the class before anything happens, and every call, allowed or
  refused, is logged.
- **The way across**: a small service on each device on the cable's address (and later the hub's), so the Kit's
  daemon calls the Zero's actions, and the hub's daemon can call RoverByte's.
- **Later**: what large action models have tried (Rabbit's LAM; the "JEV" action model the user named, to be
  identified with them) read as research for how HANDS learns new actions, and a 0.5B model's tool calling measured
  before trusting it with any.

## 6. The daemon sees (the SC850SL; design and tests first)

The camera arrives soon (C-194 covers its bench). Through StackFlow's `camera`, `yolo` and `vlm` units:

- **The INDEX from life**: point the pair at something and the daemon writes its INDEX entry, as **Dexter** does
  (`~/Projects/Dexter`, RealDex: the photo, the entry, the voice, the log). It takes Dexter's way of doing it, in the
  INDEX's own voice.
- **What is around it becomes context**: YOLO's list of what is in the room goes into the daemon's self as a line
  (*"around you: a guitar, two cups, a cat"*), so it can prompt itself. Over days, with the hive mind (MIND, THE
  MESH), those lists can add up to a realization about the place.
- **Its songs take in the room**: when the daemon goes to sing, what it sees shapes the song.
- **Painting from a reference**: show the daemon a picture, yourself, or a view, and it makes a painting that looks
  like the source, by the art workflow (img2img on the ComfyUI server on roverbyteseer when the internet is there;
  otherwise queued until it is).

## 7. The Kit hosts the companion (later)

With 4 GB and 32 GB, the Kit runs the companion's server (Node 22) where the Zero cannot. **The pair becomes its own
hub away from home**: the save's mirror, the routines, PRAXIS's events, and the site for the hotspot. It syncs with
the home hub as a phone does (C-188, the mirror's rules) when the internet is back. *Whether the server, StackFlow's
models and the NPU's 2 GB share 4 GB comfortably is measured, not assumed.*

## 8. The housing (chosen: "Measure the bare board first")

A small 3D-printed back for the Zero, under the cap's lip, holding the Kit, its camera looking out the back as a
phone's rear camera does, a short USB cable folded inside, and a **cell bay** for the Kit's LiPo (empty until one is
bought). **The published 90.3 mm is longer than the Zero's 84 mm back**, so the Kit's bare board is taken out of its
shell and measured first (length, width, the tallest part, the ports, the CSI connector and the camera's ribbon),
then the housing is drawn to fit. It needs vents over the AX630C, which runs warm under load, and must not cover the
Zero's own camera, its ports, the cap header or the slide switch.

## Built (2026-11-21), not yet run on the Kit

- **The Zero** (`firmware/pizero/src/kit/`): StackFlow over TCP by plain sockets (`stackflow.cpp`: objects found by
  their braces, as M5Stack's own code does), the Kit's brain on a thread of its own (`kit.cpp`: wake the three units,
  rest them, a turn by typed words or a recording, the voice played at 16 kHz), the charge rule (`policy.cpp`), and two
  pages: **TALK** (typed, or hold TAB to speak; BEST asks the hub's mind when the hub answers and the Kit when it does
  not) and **KIT** (its state, its cell and heat, its hotspot and the key to tell a guest, the models it holds, the way
  TALK goes). From the command line, over SSH: `daemons-zero --kit`, `--kit-say "WORDS"`, `--kit-hear FILE.wav`,
  `--kit-at HOST:PORT`. Its checks: the braces reader and the charge rule (`test/tests.cpp`). **Run end to end on the Mac
  against `tools/fakekit.py`**, a stand-in that speaks StackFlow (status, a typed turn, a recording heard), and drawn.
- **The Kit** (`firmware/llm630/`): `setup.sh` (StackFlow brought up to date, the talk set's models, the nightly restart,
  the gadget and kitd as services), `gadget.sh` (the OTG port as a network beside ADB), `kitd.py` (its cell, heat and
  hotspot, the hotspot's charge rule), `install.sh` from a computer over ADB or SSH.
- **The Zero's end of the cable** (`firmware/pizero/tools/kitlink.sh`): 10.77.0.1, the Kit's internet through the Zero,
  and the Kit's OpenAI front door on the Zero's tailnet address (port 4810), for the hub's house to add as a module
  (`ai.moduleAddresses`) -- so the Kit is one more mind in THE MIND when the pair is reachable, and the pair's own when
  it is not.

## On the bench, in order

1. **The Kit alone** (C-194 first): StackFlow installed, `llm-openai-api` on 8000, the three units' timings, its draw
   idle, in standby and mid-turn.
2. **The cable**: J4 in device mode on the Zero's USB-A as a CDC-NCM gadget (`configfs`), or the reverse. Whether the
   Kit runs from that VBUS alone, and its draw on it. Whether the Zero can switch the USB-A's VBUS (Kit off and on).
3. **The ESP32-C6 as an access point** under M5Stack's image.
4. **The bare board's size**, for the housing.

## Tickets

| Ticket | What |
|---|---|
| **C-453** | this design (the parent) |
| **C-458** | the cable: a network over USB between the Zero and the Kit, the bench checks above |
| **C-459** | the Kit's power: off, standby or on by demand; the asks, the override and the refusal; the arrangements |
| **C-460** | the Kit's hotspot by charge, and the daemon's site on it with two passwords |
| **C-461** | talk offline on the Zero: SAY answered by the Kit (brain.cpp's turn in the Zero's C++) |
| **C-462** | HANDS: named actions on every Pi device (the Zero first, then RoverByte), risky ones ask |
| **C-463** | the daemon sees: the INDEX from life, the room as context (with C-194) |
| **C-464** | what the daemon sees shapes its songs and its paintings |
| **C-465** | the Kit hosts the companion: the pair its own hub away from home |
| **C-466** | the Kit as a node in THE MESH |
| **C-467** | the housing: the bare board measured, then a 3D-printed back with a cell bay |

*Sources: docs/LLM630.md and docs/HARDWARE.md (M5Stack's StackFlow, the LLM630 product page and its schematic);
docs/CARDPUTERZERO.md (the Zero, seen on the device); docs/CAPS.md; the user's answers, 2026-11-21.*
