# The LLM630 Compute Kit, the Zero's other half (C-453)

M5Stack's **LLM630 Compute Kit** (AX630C, 4 GB, 32 GB eMMC, an NPU of 3.2 TOPS) on the back of the Cardputer Zero: the
daemon's own mind when there is no internet. The design is `docs/ZEROKIT.md`; StackFlow, its protocol, is
`docs/LLM630.md`. What is here runs **on the Kit**; the Zero's half is `firmware/pizero/` (`src/kit/`, the TALK and KIT
pages, `tools/kitlink.sh`).

| File | What it does |
|---|---|
| `install.sh` | from a computer (or the Zero): `setup.sh` pushed onto the Kit over ADB or SSH and run there; `key` puts this machine's SSH key in; `wifi SSID` joins a network for updates |
| `setup.sh` | on the Kit, as root: M5Stack's repository, StackFlow's units brought up to date, the talk set's models, the nightly restart, the cable's network and `kitd` as services; `models` lists every model offered; `add NAME` installs more |
| `gadget.sh` | the OTG port (J4) as a network beside ADB: CDC-NCM (or ECM), fixed MACs, the Kit at **10.77.0.2/30** |
| `kitd.py` | the Kit's agent on port **10002** (the cable only): its cell, heat, memory and hotspot; the hotspot's charge rule (on at 70%, off below 65%) |

## The first time

1. The Kit's **OTG port (J4)** into a computer with a USB-C cable (and its power port, J5, into a charger if it does
   not light). `adb devices` shows it.
2. `./install.sh adb key` (SSH without a password from then on), and `./install.sh adb wifi YOURNETWORK` so it can
   reach M5Stack's repository (or its Ethernet into the router).
3. `./install.sh adb` -- the update and the talk set (a few GB; about twenty minutes on home Wi-Fi).
4. Then onto the Zero: the Kit's **OTG port (J4) into the Zero's USB-A**, and on the Zero, once,
   `sudo firmware/pizero/tools/kitlink.sh`. `daemons-zero --kit` says what it sees; HOME shows **KIT** and **TALK**.

## The models (M5Stack's repository, read 2026-11-21)

| For | Installed by `setup.sh` | Also offered |
|---|---|---|
| **thinking** (llm) | `qwen2.5-0.5B-p256-ax630c` (the default: 256 tokens held, about 10 a second), `qwen3-0.6B-ax630c` | `qwen2.5-0.5B-Int4` (faster, rougher), `qwen2.5-HA-0.5B-ctx`, `qwen2.5-coder-0.5B`, `llama3.2-1B` (half the speed), `openbuddy-llama3.2-1B`, `qwen2.5-1.5B` (and Int4), `deepseek-r1-1.5B` |
| **hearing** (whisper, asr) | `whisper-base` (the default), `whisper-tiny`, `sense-voice-small-10s` | `whisper-small`, sherpa's streaming zipformers (English 20M, bilingual) |
| **speaking** (melotts, tts) | `melotts-en-us` (the default) | `melotts-en-default`, `-en-br`, `-en-au`, `-en-india`, `-es-es`, `-ja-jp`, `-zh-cn`; `single-speaker-english-fast` (lighter) |
| **wake word, voice activity** | | `kws` (sherpa's gigaspeech 3.3M), `silero-vad` |
| **seeing** (next sprint, C-463) | | `yolo11n` (and `-seg`, `-pose`, `-hand-pose`), `depth-anything`, `smolvlm-256M`/`-500M`, `internvl2.5-1B`, `internvl3-1B`, `qwen3-vl-2B-Int4` |

Change the Zero's choice in `~/.config/daemons/kit.models` (`llm NAME`, `stt NAME`, `tts NAME`), and add a model with
`./install.sh TARGET add NAME`.
