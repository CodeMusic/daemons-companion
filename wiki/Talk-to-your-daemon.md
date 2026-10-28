# Talk to your daemon

**Hold to talk, let go, and the daemon you host answers** -- in its own words, as itself. The words come from an AI
board in your house ([the hub's AX630](The-hub-and-its-AI)) or from a model on your own machine through n8n (or
OpenRouter when that one is busy, if you set it up), and nothing goes anywhere you did not set up. No device waits: a
talk is answered at once with an id, and the answer is fetched when it is ready (C-180, C-181). A care or a hello is
answered at once from written lines, with no model at all (C-196).

## Where

| where | how | state |
|---|---|---|
| the phone | DAEMON, Yours, **HOLD TO TALK** (with a daemon on your device) | built; needs a current phone build (`./bindCompanion.sh phone`) |
| an INDEX entry | **LISTEN** on any entry in DAEMON, INDEX (the phone and the site: a spinner you can stop while the voice is made, HUSH while it speaks), the Tab5's INDEX, or press on the entry on a board | runs on the site |
| the T-Embed CC1101 | **hold the dial** half a second on a home page; the TALK screen shows what it heard and the answer, and the speaker says it | **runs** -- over Wi-Fi or the cable; away from both, through the paired phone |
| the plain T-Embed, the SI4732 | **hold the dial** at home | built, not yet run |
| the T-Watch Ultra | as the T-Watch S3; and **ASK THE GUIDE** from BOOKS, once your save has found it (C-209) | built ([The T-Watch Ultra](The-T-Watch-Ultra)) |
| the T-Watch S3, the CoreS3 | **hold the daemon** a beat on the DAEMON or CLOCK face, or **hold TALK** on the VIRTUE face | built; the watch runs, its talk not yet tried |
| the StickS3, the M5GO, the Fire | **hold the face button** (the StickS3) or **B** (the M5GO and Fire, with the M5GO base) at home; on the M5GO and Fire, C opens its INDEX entry and A reads it aloud | built, not yet run |
| the StickC-Plus | **hold the face button** at home; the answer is shown, not spoken -- its buzzer plays tunes, not a voice. Its microphone rests while a GLOW routine runs | built, not yet run |
| the T-Deck | **hold the ball** at home | built |
| the Dial, the T-Display-S3 Pro, the T-Display-S3 AMOLED | -- no microphone | |
| the Cardputers | -- their microphones are not used yet | |
| the BOX-3 | its **wake word**, or a tap on its screen: Home Assistant's own voice assistant, with the daemon for a face. With the companion as its conversation agent, the daemon answers ([Home Assistant and the BOX-3](Home-Assistant-and-the-BOX-3)) | the box **runs**; the daemon as its agent built, not yet tried in a real Home Assistant |
| a phone hosting on its own | -- talking needs the companion on a computer | |
| away from home | talking and read aloud need home or the paired phone: the relay carries words, not a recording or a voice | |
| no network at all | an LLM630 behind a T-Embed, chosen with `BRAIN` down the cable | client built, not yet run: [docs/LLM630.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/LLM630.md) |

On a board, the back button stops the voice. **The daemon remembers**: tell it something, then ask about it -- it
remembers for fifteen quiet minutes, on that device, and nothing is written down. Ask *what should I do next?* and it
tells you your goal's one next step; otherwise it does not bring your goal up.

The app's SETTINGS, **WHO ANSWERS WHEN YOU TALK**, says plainly whether your words stay on your own machines or may go
to OpenRouter when your model is busy, and chooses the INDEX's voice: n8n's (the voice made for it, the default) or the
AI board's, each falling back on the other. **WHO ANSWERS FIRST WHEN YOU TALK** (C-211), in THE HUB card and a watch's
settings, chooses the AI board or n8n first, with a green or red dot for each. The recording never leaves home.

## Or: the AI board in the house

With [the hub's AX630](The-hub-and-its-AI) found, hearing (Whisper), thinking (qwen2.5-0.5B) and the voice (MeloTTS)
all happen on it. If no board is free, or none has begun an answer in about two seconds, the talk goes to n8n below.
The board's voice cannot be cloned, which is why the INDEX keeps n8n's by default.

## What it takes

All on your own machines:

1. **n8n** with DAEMONS' workflows
   ([DAEMONS `ai/n8n/`](https://github.com/CodeMusic/DAEMONS/tree/main/ai): `daemon/talk` and `daemon/voice`; its
   README says how to import them and what each needs).
2. **Speech to text** on the machine n8n runs on: DAEMONS' `ai/stt/` -- MLX Whisper on port 8770; its README has the
   install and the launch agent that keeps it running. Without it the daemon still answers, but has not heard you.
3. **A model**: LM Studio on that machine (asked for by name, `google/gemma-3-4b`), and optionally an OpenRouter key
   in n8n for when it is busy or down.
4. **The voice**: the INDEX voice on a Chatterbox server, which `daemon/voice` calls.
5. **The companion pointed at it**, in `server/config.json`:

   ```json
   "talk": { "url": "http://<your-n8n>:5678/webhook" }
   ```

   with the shared secret in the `DEX_SHARED_SECRET` environment variable (or `"secret"` in the file, which is never
   committed). See [Settings](Settings).

Name the n8n machine by an address that works wherever your computer is (a Tailscale name, for instance), and talk and
read aloud reach the voice from anywhere.

The server sends every recording on as a 16 kHz WAV, and hands a board the answer's voice as 16 kHz samples it streams
straight into its speaker (`server/src/ai/voice.ts`; needs `ffmpeg`, or macOS's own `afconvert`).

**Home Assistant uses the same talk.** As Home Assistant's conversation agent (C-142), the companion passes what was
said, and the few turns before it, to `daemon/talk`, saying the home is asking and asking for words only: Home
Assistant speaks the answer with its own voice pipeline. When the talk cannot be reached, the daemon says so in a line.
