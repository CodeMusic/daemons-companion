# The Tiiny Pocket on roverbyteseer, for the hub (C-249)

*Researched 2026-10-30 from Tiiny's own pages: the help centre (help.tiiny.ai: setup, hardware, network, models, API
access), the developer documents (dev.tiiny.ai: quick start, device and network, the OpenAI, Tiiny and CLI references),
its Linux installer script (read, not run), and its benchmark report. Nothing here has been run on the device yet; the
device has not arrived. The user, 2026-10-30: "it says u can plug into any computer -- I was going to plug it into
roverbyteseer -- but ... u can plug it into your phone... so I presume I can plug it right into the hub".*

## Can it plug straight into the hub?

**Not the way the product means "plug in" -- but the hub does not need it to.** Three things stand in the way of the
cable, and one thing makes the cable unnecessary.

| | what Tiiny says | what it means for the hub |
|---|---|---|
| **power** | "65W power adapter required (20V⎓3.25A)"; TDP 30 W; never powered by the computer | The CoreMP135's USB-A ports give 5 V at well under 1 A. The Tiiny always has its own brick. |
| **the host software** | TiinyOS: "Macs with Apple Silicon running macOS 15 or later", "Windows 11 or later". The `tiiny` CLI installs on Linux, but its installer accepts only `x86_64` and `aarch64` | The hub is a 32-bit Cortex-A7 (`armv7l`). Neither TiinyOS nor the CLI will run on it. |
| **phones** | The FAQ says it works "alongside another device such as a Mac, Windows PC, or supported tablet"; compatible systems are listed as macOS and Windows | No phone or iPad client is documented yet. Whatever the "plug into your phone" claim was, it is not in the current documents. |
| **the network** | Once activated it is found "over USB-C or on the same local network"; `tiiny auth key` prints `http://<device-ip>/openai/v1`. Wi-Fi, or a USB-C Ethernet adapter on either non-PC port | **The hub talks to it over plain HTTP on the house network.** No driver, no client, no architecture question. |

So the shape is:

```
   the Mac (once)                       the house network
   TiinyOS or the CLI:      ┌──────────────────────────────────────────┐
   activate, Wi-Fi on,      │                                          │
   download models  ──USB──>│  TIINY POCKET  http://<ip>/openai/v1     │
                            │   ^  own 65 W brick                      │
                            │   │  Ethernet (USB-C adapter) or Wi-Fi   │
                            │   │                                      │
   phone / boards ──> HUB (CoreMP135) ──┘  talk.provider "tiiny"       │
                       │  └─eth1─> Module LLM (stays: fast, offline)   │
                       └─> roverbyteseer (n8n, Chatterbox, ComfyUI)    │
                            └──────────────────────────────────────────┘
```

**Phones and boards keep talking only to their hub** (TRADING.md's rule): the hub holds the Tiiny's API key and is the
only thing that calls it. The Tiiny becomes one more worker beside the Module LLM, as C-225 already planned for it.

**Decided (the user, 2026-10-30): the Tiiny plugs into roverbyteseer**, as first planned -- "that expands that
computer's abilities -- and once set up the hub can talk to it." roverbyteseer is the Mac-or-Windows host TiinyOS
wants (check its macOS and chip against "Apple Silicon, macOS 15 or later" on the day), its n8n and LiteLLM get the
Tiiny as one more model, and the hub reaches it the way it reaches roverbyteseer today. Two ways for the hub to call it:

- **through roverbyteseer's LiteLLM** (one address, one key, the Tiiny's models listed beside the others) -- the
  default, so the hub never needs the Tiiny's own key;
- **straight to `http://<tiiny-ip>/openai/v1`** on the house network, if LiteLLM adds latency to TTS or ASR worth
  removing.

The enclosure (C-250) then joins the Tiiny to roverbyteseer rather than to the hub, or stays a stand for the Tiiny
alone.

*Worth one bench test on the day, not worth planning around*: the "To PC" port may show up on Linux as a USB network
device (it carries `openai.api.tiiny` to the Mac somehow). If the hub's kernel sees it as `cdc_ncm` or `rndis`, the
Tiiny can hang off the hub's USB-A port as a private link with no switch. If not, the network does the job.

## What it runs (from the documents)

| | model | measured by Tiiny | for us |
|---|---|---|---|
| **talk** | Qwen3.6-35B-A3B-Turbo | 36-47 tokens/s at 4K context, first token 6.5 s | a daemon's chat, C-220 meetings, the GUIDE's harder questions |
| | Qwen3.5-9B-Turbo | 34-50 tokens/s, first token 3.5 s, 16 % of the NPU | quick lines, many at once beside the big one |
| | gpt-oss-120b | 15-16 tokens/s at 1-4K | long write-ups (C-212 meetings, C-225's long work) |
| | Gemma-4-26B-A4B-it, Qwen3.8-27B | 17 tokens/s (Gemma) | alternates |
| **hearing** | Qwen3-ASR-1.7B | 0.355 real-time factor: 8 s of speech in about 3 s | push to talk, meetings transcribed in the house |
| **voice** | Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice; Supertone/supertonic-3 | not published | the daemons' voices (below) |
| **pictures** | Z-Image-Turbo, FLUX.2-klein-4B, ERNIE-Image-Turbo, Qwen-Image (reference-image edits) | ~58 s an image, one at a time | dream pictures, postcards (below) |
| **also** | embeddings, rerank, OCR (pp-ocrv6), music generation, image-to-3D | | memory, reading the screen, themes, figurines |

Several models load at once while their NPU shares add to 100 %. The 1 TB disk holds models; it is not a file store
we can write to through the API.

## Voices: Chatterbox, or what is on the Tiiny?

**Chatterbox will not run on the Tiiny.** It runs only models from Tiiny's store, and imports only fine-tunes of a few
bases (Qwen3.5-9B, Qwen3.6-35B-A3B, Qwen3-4B, Z-Image-Turbo, FLUX.2-klein, ERNIE-Image) -- no voice models. There is
no shell to install software in.

**What it does have may be better for us.** Qwen3-TTS is a family: *CustomVoice* (a set of speakers you steer by an
instruction -- "slow, gravelly, amused"), *VoiceDesign* (a new voice from a written description) and *Base* (cloning
from a few seconds of audio). The store lists CustomVoice; whether the other two are there is the first thing to check
on the device.

The plan that works whichever it turns out to be -- **a voice is a recipe, and lines are rendered ahead**:

1. **Each daemon gets a voice recipe** written once beside its INDEX entry in `companion_export`: a base speaker and
   an instruction, from its type and family (a FIREWALL daemon clipped and formal, a DREAM one breathy and slow). The
   recipe, not a recording, is the source of truth, so a better voice model later re-renders everything.
2. **Fixed lines are rendered ahead**, not live: the INDEX entries, the boards' written lines (C-196), the GUIDE.
   Rendered on the Tiiny (or on roverbyteseer with **Chatterbox, which stays the voice foundry for cloned voices** --
   the INDEX's own voice keeps living there, HUB.md Phase 5 item 7). The rendered bank lives on the hub's card as the
   16 kHz PCM the boards already play, so a line costs nothing to say.
3. **Only chat is spoken live**, through the Tiiny, a sentence at a time, while the Module LLM's MeloTTS stays the
   offline fallback.

## What else it allows

**On the companion's side** (app, site, boards, hub):

- **Daemons that think like themselves.** A 35B model can hold a daemon's whole INDEX entry, its history with the
  player and its type's argument in one prompt, and stay in character -- what the 0.5B module cannot.
- **The dreams get pictures** (T-462): the night's dream text to a picture, drawn in our house style from a reference
  sprite (Qwen-Image's reference input), shown in the app the next morning. One a night per daemon is well inside a
  minute a picture.
- **A figurine of your daemon.** Image-to-3D from its sprite, cleaned up into something your printer can print --
  the companion's "keep" made physical. Needs a check that the mesh is printable.
- **Memory that stays in the house.** Embeddings and rerank over the NOTEBOOK and the meetings, so a daemon
  remembers what the player said three weeks ago without any of it leaving home.
- **Music for a meeting.** The music model for a short theme when two daemons meet (C-220); its rights and its
  quality both need hearing first.
- **One device for many homes, at launch.** At 36-47 tokens/s with one request at a time it serves a house easily;
  THE COMMONS' many players would queue. The forward path (TRADING.md) stays: the Tiiny serves this house and
  internal testing first.

**On the game's side.** The GBA has no radio, so the cartridge itself never talks to a model. But:

- **AI reaches the cart through the save**, as the dreams already do (VAR_0x40D4). Anything the companion decides --
  a dream's picture index, a daemon's mood, a line chosen from a set the ROM already holds -- rides back on SYNC.
  New *words* cannot: the ROM holds every line it can print, and that stays true.
- **The playground and the iPad app run the game in an emulator**, which can read the game's memory live (engineAi
  already does it over mGBA's socket). There the companion can watch the game as it is played: a daemon in the
  side panel reacting to the battle you are in. That is the "phone version" the question guessed at, and it is real.
- **The AI playtester (T-319) could run on the Tiiny for nothing.** The standing rule is never to run the *paid*
  playtester; a local one changes what it costs, not the rule. Whether that rule loosens is the user's call.

## The enclosure (C-250)

The Tiiny is **142 x 80 x 22 mm, 300 g**, warm under load, wants air on every side ("do not use ... in enclosed
spaces"), 0-35 °C. Whatever is printed: PETG or ASA against the Tiiny (PLA softens around 55-60 °C), a gap of at least
8 mm under and over it, nothing over the vents, the "To PC" port and the power port reachable, the LoRa antenna clear
of the metal, the hub's touch screen in front and its microSD reachable. One two-port GaN brick (65 W + 15 W, 100 W
class) feeds both, so the unit has one cable to the wall. **Measure the real device before printing**: these are the
documented numbers, not callipers.

Three directions, sketched in the session (2026-10-30):

1. **THE PLINTH** -- the Tiiny lies flat in a vented tray; the hub stands on four posts above it, its screen tilted
   15° toward you. Simplest to print, best for air, the Tiiny's lights visible through a slot.
2. **THE BOOKEND** -- the Tiiny stands on its long edge in a slotted cradle, a chimney: cool air in the bottom, warm out
   the top. The hub is the spine on the front. Smallest footprint; sits on a shelf like a book.
3. **THE HOUSE** -- a small daemon house, the Tiiny its foundation, the hub's screen its window, the LoRa antenna its
   chimney, a printed figurine of your daemon (above) on the roof or the step. Most work; ties the box to the fable
   (key buildings get their own art).

## On the day it arrives (C-249's steps)

1. On the Mac: TiinyOS (Apple Silicon, macOS 15+), activate with **Local Only** recovery unless email recovery is
   wanted, Wi-Fi on, download Qwen3.6-35B-A3B, Qwen3.5-9B, Qwen3-ASR-1.7B, both TTS models and Z-Image-Turbo.
2. Note the device's address and API key into the hub's config (never into a tracked file); a fixed address on the
   router.
3. Bench, from the hub: `curl http://<ip>/openai/v1/models`; time a chat, an ASR of the T-Embed's 16 kHz WAV, and a TTS
   line (and convert its MP3 to the boards' PCM -- where, and how long). List the TTS voices and whether VoiceDesign
   or Base is in the store.
4. Try the "To PC" port in the hub's USB-A: does `ip link` show a new interface?
5. Then the companion: `talk.provider` gains `"tiiny"`, with C-211's health dot; C-225's long work points at it.
