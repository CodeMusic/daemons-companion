# What daemons-companion inherits

*Read-only survey of `CodeMusic/RoverByte` (branch `main`, last code commit 2025-02-13 "RoverRadio fixes"; README
edits to 2026-05-28) and `CodeMusic/RoverCub` (2025-05-01 to 2025-05-10). Made 2026-10-03. Paths are relative to each
repo. No secrets, credentials or personal material are copied or pointed to here.*

## 1. The parts, one by one

| Part | What it is |
|---|---|
| `RoverCodeBase/` | **RoverRadio's firmware**: PlatformIO + Arduino C++ for an ESP32-S3 handheld, laid out as brain regions under `src/`. It boots to a hovering Rover face with the clock, cycles "views" (today's tasks, chakras, virtues, quotes, weather, stats, next meal), and encodes the date into 8 LEDs. It also has a slots game, IR and NFC apps, sound and tunes. README calls it paused. |
| `RoverByteOS/` | **The robot dog's OS**, Python on a Raspberry Pi driving a SunFounder **PiDog** (`from pidog import Pidog` in `rover_control.py`). Voice in (Whisper), an OpenAI Assistant thread for the reply, OpenAI TTS out, and preset dog actions (`preset_actions.py`, `action_flow.py`). `api_server.py` is a FastAPI server (`/v1/chat/completions`, `/rover/action`, `/rover/speak`, `/rover/tts`, `/rover/stt`, `/health`, `/status`). `TheDogHouse/index.html` is a web remote and `RoverRemote/roverremote.py` a Makeblock **CyberPi** remote. `CodeMusai/` holds the emotion and memory layer (section 6). |
| `The RoverVerse/RoverOSpi/` | **Not a Pi app, despite the name.** It holds only `config.py`, a copy of `CodeMusai/CoreMemories/`, a copy of the CyberPi `RoverRemote/roverremote.py`, and a **committed `.venv`** (about 2,400 files, mostly `esptool`). |
| `The RoverVerse/RoverRevival/` | **The actual Pi Zero pet**: `runRoverRevival.py` on a Pi Zero 2 W with a Waveshare 1.44" LCD HAT (`LCD_1in44.py`, `config.py`). A tamagotchi (section 4). A one-file copy is `RoverOS_rSeries/RoverRevival_p0w2_144lcd.py`. |
| `The RoverVerse/RoverOSm5/`, `RoverOS_rSeries/` | **M5Stack MicroPython (UIFlow2) experiments**: `Rovergotchi_FIRE.py` (tamagotchi on an M5 Fire), `roverCasino_m5_core.py` (ByteCoins slots), `rotoRover_Dial*.py` (M5 Dial reading a money balance off NFC / NTAG215 cards and turning card text into a melody), `roverCore3_llm_.py` / `roverM5core_llm_fire_py` (M5 **LLM Module** chat), `RoverR3os_m5_coreS3se.py` (CoreS3 SE with an M5 **LoRa433** module), `RoverScribe*_paper.py` (M5Paper, Google Tasks via OAuth device flow). |
| `RoverScribe/` | Arduino sketch for a LilyGO **T5 4.7" e-paper** (`epd_driver.h`): draws a Rover and a hard-coded task list (`RoverScribe.ino`, `RoverDisplay.cpp`). |
| `Documents/_Sprint1.pages` | "The RoverShow, Season 1, Episode 1": a sprint log of the January 2025 cortex refactor. |
| `RoverCub` (repo) | **A Pi Zero voice assistant** ("RoverCub Lite"): push-to-talk, Whisper, an OpenAI Assistant or a local LM Studio model, TTS, and an 8x4 LED grid that animates the reply's tokens. `PenphinAssistant.py` is the simpler button-and-two-LEDs version; the rest are betas and tests. |

## 2. The ESP32 firmware (`RoverCodeBase/`)

**Board.** Nothing names it, but `src/MotorCortex/PinDefinitions.h` is, pin for pin, **LilyGO's T-Embed CC1101**
(ESP32-S3) header -- including LilyGO's habit of calling the CC1101's pins `BOARD_LORA_*`:

| Function | Pins (GPIO) |
|---|---|
| Display ST7789 **170x320** (`VisualCortex/DisplayConfig.h`), TFT_eSPI `Setup214_LilyGo_T_Embed_PN532.h` | CS 41, DC 16, RST 40, BL 21, SPI MOSI 9 / SCK 11 / MISO 10 |
| Rotary encoder (`RotaryEncoder`, `LatchMode::TWO03` in `src/main.cpp`) | A 4, B 5, push 0; user key 6; power-enable 15 |
| **8 x WS2812B** (FastLED, GRB) | data 14 |
| PN532 NFC (I2C 0x24) | SDA 8, SCL 18, IRQ 17, RF reset 45 |
| PMIC: **BQ25896** charger 0x6B via `XPowersPPM` (`PrefrontalCortex/PowerManager.cpp`); 0x55 (the BQ27220 gauge) defined but unused | I2C as above |
| **CC1101** sub-GHz (`LoRaPathways`) | CS 12, GDO0 3, GDO2 38, RF switch 47/48 |
| microSD | CS 13 on the shared SPI bus |
| IR | TX-enable 2, RX 1 |
| PDM mic / I2S speaker | mic data 42, clk 39 / BCLK 46, LRCLK 40, DIN 7 |

`LED_DATA_PIN 48` / `LED_CLOCK_PIN 47` (an APA102 leftover) collide with the CC1101 RF switch pins, and `TFT_RST 40`
with the speaker's LRCLK; only the WS2812 pin is actually used.

**Radio.** The CC1101 is a sub-GHz **FSK/OOK transceiver, not LoRa**. And it is **never driven**: `RadioLib` is in
`platformio.ini` but no source includes it; `PrefrontalCortex/SPIManager.cpp` only parks its chip-select high so it
does not fight the display and SD card. **No SX126x/SX127x appears anywhere in the firmware.** The only LoRa in either
repo is M5Stack's UIFlow2 `LoraModule` (a 433 MHz M5 module) in `The RoverVerse/RoverOS_rSeries/RoverR3os_m5_coreS3se.py`,
used to receive and play audio.

**Libraries** (`platformio.ini`, `env:esp32dev`): Adafruit PN532 + BusIO, RotaryEncoder, Adafruit GFX, TFT_eSPI,
IRremoteESP8266, XPowersLib, ArduinoJson, ESP32Time, FastLED 3.6, ESP8266Audio, plus `M5Unified`, `M5Stack` and
`RadioLib`, none of which the code includes. Audio code uses `#include <Audio.h>` / `Audio audio` (the ESP32-audioI2S
API), which is **not** in `lib_deps`: it arrives from `~/Documents/Arduino/libraries` through `scripts/pre_build.py`,
which symlinks the user's whole Arduino library folder into `lib/`.

**How the brain regions divide the work** (`src/`, about 8,000 lines; `documentation/CodeMap.MD`):

| Region | Files | Job |
|---|---|---|
| `CorpusCallosum/SynapticPathways.h` | 1 | Namespace aliases tying the regions together (`PC`, `VC`, `MC`, ...) |
| `PrefrontalCortex/` | `ProtoPerceptions.h/.cpp` (every shared type and colour table), `RoverBehaviorManager` (boot sequence, states, errors), `PowerManager`, `SDManager`, `SPIManager`, `utilities` (scoped logging) | Executive control and shared types |
| `VisualCortex/` | `RoverManager` (the face), `RoverViewManager` (views, XP bar, notifications), `LEDManager` (1,284 lines of LED modes, festive themes), `VisualSynesthesia` (day/month/hour/note -> colour), `DisplayConfig`, FastLED config | Everything seen |
| `AuditoryCortex/` | `PitchPerception` (notes, the day's base note), `SoundFxManager` (I2S, tones, jingles), `Tunes` (songs with LED patterns) | Everything heard |
| `SomatosensoryCortex/` | `UIManager` (encoder, buttons), `MenuManager` | Input and menus |
| `PsychicCortex/` | `WiFiManager` (rotates three SSIDs from `RoverConfig.h`, NTP time), `NFCManager`, `IRManager` | Outside world |
| `GameCortex/` | `AppManager`, `AppRegistration` (Slots, IR, NFC, Settings apps), `SlotsManager` | Apps and games |
| `MotorCortex/` | `PinDefinitions.h` only | Pins (the dog's motors are aspirational) |

## 3. RoverRadio's day table

**There is no single table in the code.** The week is spread over four parallel arrays, each indexed 0 = Sunday ...
6 = Saturday, and the virtues and chakras line up with the days **only by order and by shared colour**:

- colour: `DAY_COLORS[7]` in `RoverCodeBase/src/PrefrontalCortex/ProtoPerceptions.cpp` (read by
  `VisualSynesthesia::getDayColor(tm_wday + 1)`); the same week in Python is `get_color_of_the_week()` in
  `RoverByteOS/utils.py` and `self.colors` in `RoverByteOS/CodeMusai/EmotionCore.py`;
- note: `PitchPerception::getDayBaseNote()` in `RoverCodeBase/src/AuditoryCortex/PitchPerception.cpp` (octave 4 and
  5 tables; it plays on every encoder turn and press, `SoundFxManager::playRotaryTurnSound`);
- chakra: `CHAKRA_DATA[]` and virtue: `VIRTUE_DATA[]`, both in `RoverCodeBase/src/VisualCortex/RoverViewManager.cpp`
  lines 105-123, each entry carrying the same RGB565 colour as its day.

Read across by index, exactly as the code has it:

| Day | Colour (code) | Note | Chakra (`name`) | Virtue statement (`virtue`) | Description (`description`) |
|---|---|---|---|---|---|
| Sunday | `CRGB::Red` | C | Root Chakra | Chastity cures Lust | Purity quells excessive sexual appetites |
| Monday | `CRGB(255, 140, 0)` Orange | D | Sacral Chakra | Temperance cures Gluttony | Self-restraint quells over-indulgence |
| Tuesday | `CRGB::Yellow` | E | Solar Plexus Chakra | Charity cures Greed | Giving quells avarice |
| Wednesday | `CRGB::Green` | F | Heart Chakra | Diligence cures Sloth | Integrity and effort quells laziness |
| Thursday | `CRGB::Blue` | G | Throat Chakra | Forgiveness cures Wrath | Keep composure to quell anger |
| Friday | `CRGB(75, 0, 130)` Indigo | A | Third Eye Chakra | Kindness cures Envy | Admiration quells jealousy |
| Saturday | `CRGB(148, 0, 211)` Violet | B | Crown Chakra | Humility cures Pride | Humbleness quells vanity |

(Descriptions have `\n` breaks in the source, dropped here. Each chakra also has an attribute line, e.g. Root:
"Survival, Grounding, Stability, Comfort, Safety".) **Caveat:** the firmware never looks up *today's* virtue or chakra
-- `drawVirtues()` and `drawChakras()` list all seven, and the virtues view is simply the default
(`currentView = ViewType::VIRTUES`). Today's colour and note *are* used live. So the pairing above is implied by the
data, not enforced by code; DAEMONS' exported table should state it outright.

Related time colours in the same files: month pairs `MONTH_COLORS[12][2]` (January red/red ... December
violet/violet), hours via the chromatic `CHROMATIC_COLORS[12][2]` (C red ... B violet). `LEDManager.cpp` (around line
290) encodes the date on the 8 LEDs: LED 0 the day's colour, LED 1 the week of the month, LED 2 the month (blinking
between its pair), LED 3 the hour; a week mode lights past days off, today blinking, future days dim.

## 4. Tasks and the tamagotchi

**Tasks: never modelled.** Redmine appears only in docs (`README.md`, `RoverCodeBase/Readme.MD`,
`documentation/CodeMap.MD`: "new interaction -> ticket", "nightly training"); **no code calls Redmine.** What exists:

- `RoverViewManager::drawTodoList()` draws three hard-coded strings under "Today's Tasks:";
- `RoverScribe/RoverScribe.ino` draws a hard-coded array of seven;
- `RoverScribe_paper.py` (M5Paper) runs Google's OAuth device flow for the `auth/tasks` scope and lists task lists;
- `RoverByteOS/CodeMusai/FrontalLobe/PreFrontalCortex.py` has `task_queue`, `plan_action`, `evaluate_priority` --
  all `pass`.

No goal -> sub-item -> step structure exists anywhere; daemons-companion's is new.

**Mood and growth, by device:**

- **RoverRadio firmware**: `RoverManager` cycles four idle moods (`moods[] = happy, looking_left, looking_right,
  intense`) at random, and events set a temporary `Expression` (`ProtoPerceptions.h`: NEUTRAL, HAPPY, LOOKING_*,
  INTENSE, BIG_SMILE, EXCITED) -- success smiles, errors look down. There is no hunger or happiness. Growth is **XP**:
  scanning a valid NFC card adds `(uid[0..3] sum) % 50 + 10` (`PsychicCortex/NFCManager.cpp`), and every 327 XP is a
  level-up with a fanfare and LED flash (`RoverViewManager::incrementExperience`). Nothing persists across reboots.
  Eye colours come from the month.
- **RoverRevival (Pi Zero)**: `happiness`, `hunger`, `energy` (0-100). Each minute hunger +5, energy -2, happiness
  -3. `get_mood()`: energy < 20 sleeping, hunger > 80 sad, happiness < 30 lonely, happiness > 80 happy, energy > 80
  motivated, else a random idle face. Feed +10 happiness, Clean +5; joystick = pat, belly rub, ear scratches.
- **Rovergotchi (M5 Fire)**: `hunger`, `happiness`, `health` (start 100), `poopometer`; per tick hunger -0.05,
  happiness -0.03, health -(0.02 + poop x 0.01); Apple, Water, Clean, Sleep, Jump Game, Run Game raise them; a
  "Notification!" below 20.
- **RoverByteOS (the dog)**: `EmotionCore` holds `glad 5, sad 0, mad 0, afraid 0` (1-10), but **code never changes
  them**; the rules ("Praise: Glad+2, Mad-1", "expressing an emotion decreases it by 1") are text in the prompt
  (`emotion_framework()`), along with day-of-week and month flavour lines.

## 5. The Pi Zero side

**RoverCub** (`RoverCub.py`, 1,400+ lines):

- **Hardware**: **no screen**. An 8x4 = 32 WS2812 grid on GPIO 18 (`rpi_ws281x`, brightness 32); ALSA audio on
  `plughw:1,0` (`arecord`, `aplay`, `mpg123`, `amixer`); push-to-talk is a **headset's Play/Pause key** read with
  `evdev` from `/dev/input/by-id`. `pixels.py` (3 APA102 LEDs) and `buttonTest.py` / `PenphinAssistant.py` (button
  GPIO 17, LEDs 27 and 22) are the **ReSpeaker 2-Mics Pi HAT** pattern.
- **Libraries**: `openai`, `requests`, `tiktoken`, `evdev`, `numpy`, `rpi_ws281x`; Penphin adds `RPi.GPIO`,
  `speech_recognition`, `pyaudio`, `gTTS`.
- **AI calls**: STT `whisper-1`; replies through the **OpenAI Assistants API** (threads, runs, polled every 0.5 s),
  `ASSISTANT_MODEL = "gpt-4-turbo"` for the chat-completions fallback, or an LM Studio server on the LAN
  (`/v1/chat/completions`); TTS `tts-1` with a voice per assistant. Eleven persona assistants are listed, switched by
  saying "change assistant"; replies are tokenized with `tiktoken` and drawn as colour on the grid (states idle,
  listening, processing, talking).
- **Penphin** (`PenphinAssistant.py`): hold the button (red LED), record, Whisper, then an LM Studio endpoint by
  default (`use_local=True`) or `gpt-3.5-turbo` with `OPENAI_API_KEY` from the environment; system prompt "You are
  RoverByte R1..."; 10-turn history; gTTS + mpg123 out.

**RoverRevival** (the Pi Zero with a screen): Pi Zero 2 W, Waveshare **1.44" 128x128 LCD HAT** over SPI (RST 27, DC 25,
BL 24), joystick (6, 19, 5, 26, press 13) and KEY1-3 (21, 20, 16); Pillow for drawing, pygame for sound. No AI.


## 6. Musai / CodeMusai as the code shows it

- **No two-threads-and-an-integrator is in either repo.** The "dual" in the docs is cloud AI + local AI
  (`documentation/CodeMap.MD` "Dual Intelligence System", `RoverByte_Overview.md`), and the code's version of it is
  simply OpenAI-or-LM-Studio. The README points the real architecture at a separate repo, `CodeMusic/PenphinMind`
  (and its `whitepapers/`), not surveyed here.
- What is there (`RoverByteOS/CodeMusai/`): `EmotionCore.py` builds a mood paragraph for the system prompt
  (personality + emotion framework + day/month flavour + random memories) under a `threading.Lock`;
  `TemporalLobe/Hippocampus.py` `MemoryManager` loads per-person memory files from `CoreMemories/` -- each a list of
  `{text, probability, alternative?}`, a memory included with chance `1/probability`, so the prompt differs every
  time; `EmotionCore.ask_codemusai()` / `train_data()` post to a local CodeMusai service at `:2345/codemusai/ask` and
  `/train` that is not in the repo. `FrontalLobe/`, `TemporalLobe/AuditoryCortex.py` and `LanguageCenters.py` are
  stubs or a docstring.
- The memory files are **personal material: never copied into this repo.**

## 7. Reuse

**Take as-is**
- The week: the seven colours, notes C-B and the virtue/chakra lists above -- **as data, re-exported from DAEMONS**,
  not by copying C arrays.
- The T-Embed CC1101 pin map, `PowerManager` (BQ25896 via XPowersLib), the encoder setup, `PitchPerception` notes.
- The LED date encoding (`LEDManager.cpp`) as a device idle screen.

**Adapt**
- The cortex layout, as names and folders, onto a clean PlatformIO project with a correct S3 board.
- `RoverRevival`'s stat decay and `get_mood()` thresholds as a starting point for PLAN section 7 (tired, never ruined).
- RoverCub's push-to-talk -> STT -> model -> TTS loop and token-coloured LEDs, pointed at our server and LiteLLM rather
  than OpenAI Assistants (an API OpenAI deprecated in 2025).
- `Hippocampus`'s probabilistic memories, for the daemon's voice, with fictional content.
- NFC XP-on-scan as the shape of "meeting another device" (friendship on contact).

**Leave behind**
- Redmine (never implemented); the hard-coded task lists; Assistants threads and IDs; the committed `.venv`;
  `M5Unified`/`M5Stack`/`RadioLib` as dead deps; most of the ~2,000 lines of LED and tune modes (`LEDManager.cpp`, `Tunes.cpp`).

**Risks -- it will not build as committed**
- `board = esp32dev` is the classic ESP32, not the S3 these pins need (GPIO 41-48 do not exist on it); there is no
  PSRAM/16 MB flash setting. Needs an S3 board definition.
- `lib/` is empty in git: the TFT_eSPI user setup and `Audio.h` come from the author's own Arduino folder via
  `pre_build.py` -- a fresh clone cannot build.
- Two entry points: `RoverCodeBase.ino` (109 lines, `src/`-prefixed includes, `Utilities.h` against `utilities.h`)
  is a stale copy of `src/main.cpp` (303 lines) from the Arduino-to-PlatformIO move; "Recent Change Notes.md" is the
  "RoverRefactor" log, and the last commits are "fixed merge issues" / "fixed boot issues" -- the stalled refactor.
- Bugs worth knowing: `RoverManager::moods[]` has 4 entries but `NUM_MOODS = 5` (out of bounds on `nextMood()`);
  `UNCERTAIN_1IN(n)` returns True with probability (n-1)/n, the reverse of its docstring; `CoreMemories` files are
  committed with a leading space in their names (`" self_memories.json"`) so `MemoryManager` never finds them.
- The CC1101 has no driver code, so "meeting others" over radio starts from nothing.

## 8. Open questions the code cannot answer

1. **Which board is in hand?** The pins say LilyGO T-Embed CC1101 (with the PN532 variant); the `esp32dev` env says
   otherwise. Flash and PSRAM size?
2. **Is the CC1101 enough for "meeting others"**, or is a LoRa radio (SX1262 board, or the M5 LoRa433 module the
   CoreS3 script used) wanted from the start?
3. **Which Pi Zero device** carries the daemon: RoverRevival's (Zero 2 W + 1.44" LCD + joystick) or RoverCub's (LED
   grid, headset, no screen)? And is the ReSpeaker 2-Mic HAT still on it?
4. **Is the day -> virtue -> chakra pairing above the intended one** (it is implied by order only), and does DAEMONS
   adopt it or keep its leaders' pairing (T-318)?
5. **What is the CodeMusai service on port 2345** (`/codemusai/ask`, `/train`), and is PenphinMind the source for the
   two-minds-then-one design?
6. Was the **ByteCoins** economy (casino, dial balance) meant to carry over?
7. Did any **Redmine** instance or data ever exist to import?
