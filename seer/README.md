# The local cloud (`seer/`)

The companion's hub is small: an always-on board that keeps the save, the daemon and the devices. The heavy work (talk,
hearing, voices, dreams, sleep sounds) runs on a second always-on computer beside it, a Mac or a Linux box: **the
local cloud**. Ours is called roverbyteseer. This folder sets one up from a clone of this repository.

## Quick start

On the local-cloud machine itself:

```sh
git clone https://github.com/CodeMusic/daemons-companion.git && cd daemons-companion
seer/bindSeer.sh
```

It asks a few questions, then installs everything and prints what to give the hub:

1. **Is a Tiiny plugged into this machine?** If so, give its address and key (`tiiny auth key` in TiinyOS prints
   both). It then does the talking, hearing and voices. Without one, this machine's own models answer, and OpenRouter
   answers only when nothing in the house does, and only if you give it a key.
2. **Sleep sounds:** ACE-Step 1.5 makes your daemon's sleep music here. The first run downloads about 19 GB.
3. **Local models:** a chat model on port 1234 (LM Studio if it is already running; otherwise MLX on Apple silicon)
   and Whisper for hearing on port 8770.
4. **THE COMMONS:** households trading and meeting, over Tailscale (`hub/commons.sh`).
5. **ComfyUI:** for the DAEMONS art tools (port 8008).
6. **An OpenRouter key:** optional.

Run it again at any time. It offers your last answers, and re-installing a part replaces it rather than starting a
second copy.

| | |
|---|---|
| `seer/bindSeer.sh --plan` | says what it would do and installs nothing |
| `seer/bindSeer.sh --yes` | asks no questions and uses `seer/.seer` as it is (edit it, then run this) |
| `seer/bindSeer.sh n8n` | (re)installs one part: `litellm`, `tiiny-voice`, `local`, `acestep`, `sleep-sounds`, `comfyui`, `commons` or `n8n` |

## How the parts stay in step

Everything is written from **one file**, `seer/.seer`: your answers and keys, mode 600, never committed.
`seer/make.py` writes `seer/out/` from it (also never committed):

| written | what reads it |
|---|---|
| `litellm.yaml` | LiteLLM on port 4000, the one door to every model |
| `services.env` | the keys LiteLLM and the Tiiny's voice read (`LITELLM_MASTER_KEY`, `TIINY_API_KEY`, `OPENROUTER_API_KEY`) |
| `n8n.env` | n8n's environment: which models its workflows ask for, and with what key |
| `n8n/*.json` | the companion's workflows, `daemon/talk` and `daemon/hear`, for the internal n8n and a public relay |
| `hub.txt` | what to give the hub |

LiteLLM always answers by the same four names, whatever is behind them:

| name | with a Tiiny | without one |
|---|---|---|
| `seer-talk` | its big thinker | the local model, then OpenRouter |
| `seer-quick` | its quick thinker | the local quick model, then OpenRouter |
| `seer-hear` | its speech recognition | Whisper on this machine |
| `seer-voice` | its voice design | none (the hub speaks in its own) |

n8n's workflows and the hub ask only for these names. So changing your answers, for example plugging a Tiiny in later,
changes `litellm.yaml` and nothing else. With a Tiiny, its own older names (`tiiny-35b`, `tiiny-9b`, `tiiny-hear`,
`tiiny-voice`) are kept as well, so a hub set up before this package keeps working.

## Ports

| port | what | installed by |
|---|---|---|
| 4000 | LiteLLM | `litellm/` |
| 4001 | the Tiiny's voice, streamed (with a Tiiny) | `tiiny-voice/` |
| 4002 | sleep sounds, the keyed door to ACE-Step | `sleep-sounds/` |
| 8001 | ACE-Step 1.5, this machine only | `acestep/` |
| 1234 / 8770 | local chat model / Whisper | `local/` |
| 8008 | ComfyUI | `comfyui/` |
| 4750 | THE COMMONS, tailnet only | `../hub/commons.sh` |
| 5678 | n8n | `n8n/` (Docker) |

On a Mac each service is a launch agent named `ca.codemusic.daemons.<name>`, and its log is
`~/Library/Logs/daemons-<name>.log`. On Linux each is a systemd user unit, `daemons-<name>`. If ACE-Step, ComfyUI, a
model server or n8n is already running on its port, it is used as it is and not installed again.

An n8n that was already running keeps its own environment. The installer lists the names from `seer/out/n8n.env`
that it must carry. n8n's API key is made once, by hand, on its own page: **Settings › n8n API**. The installer asks
for it, then puts the workflows on n8n and switches them on.

**Not downloaded for you**, because their licences belong to their makers: the sprite model for ComfyUI
(`pixelArtDiffusionXL_spriteShaper.safetensors`, into `ComfyUI/models/checkpoints/`), and any chat model you choose
in LM Studio.
