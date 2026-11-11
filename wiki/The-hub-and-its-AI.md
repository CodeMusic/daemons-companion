# The hub and its AI

**A small Linux board at home that never sleeps can be the companion's server** (C-168), so your phone, your boards and
the relay keep their companion when the computer is asleep. Ours is an **M5Stack CoreMP135**. Stacked on it are a
LoRa433 module and an **AX630C Module LLM** on its LLM Mate: an AI board that hears, thinks and speaks in the house.

Everything here is optional. A computer running `./bindCompanion.sh always` does the same job while it is awake, and a
phone can host on its own. The full plan, every phase, the cut-over and the way back are in
[docs/HUB.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/HUB.md).

## What the hub does

| | how |
|---|---|
| **serves the companion** | Node 22 as a systemd unit (the last Node with a 32-bit ARM build); its store backed up nightly |
| **keeps the save** | a **copy** in its shared folder. `./syncCompanion.sh` keeps it and the computer's in step, both ways. A device playing [the one app](The-one-app) can keep the real save and let the hub hold a mirror (C-188) |
| **serves the site** | at `http://<hub>:4730` at home, or by its tailnet name from anywhere. A browser there pairs once with a code from the hub's screen. `./syncCompanion.sh site` sends it a new build (C-170) |
| **pairs a phone** | hold the hub's touch screen for two seconds: a code, the address and the tailnet name (C-170) |
| **shows its state** | its screen lists the companions linked and their daemons, each device and when it was last heard |
| **keeps THE EXCHANGE** | where players trade daemons, on the home network and the tailnet only: other companions and phones name the hub in TRADE's THE HUB and join with an invite code from it ([Trading](Trading), C-218, C-219) |
| **updates itself** | `hub/deploy.sh` brings it up to `main` in one command, and goes back to the old commit if the new one does not answer within a minute (C-168) |
| **thinks and speaks** | the AI board, below |

Setting one up from nothing: `hub/phase0.sh`, `phase1.sh` and `phase2.sh`, once ([docs/HUB.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/HUB.md)).

## The AX630: the daemons' AI in the house (C-180)

The AX630C Module LLM sits on its own small network on the hub's second Ethernet port and answers in the OpenAI format
(M5Stack's StackFlow `llm-openai-api`). The companion finds it there at start and every five minutes. **AN AI BOARD ON
YOUR NETWORK**, in SETTINGS, takes the address of another one -- a standalone board such as the LLM630 Compute Kit
(C-194) -- and looks for it at once. Each board found is a worker, one talk at a time.

**What it runs**, picked as the hub measured them (`server/src/ai/module.ts`; the benchmark is
`server/tools/ax630bench.ts`):

| | model | |
|---|---|---|
| **thinking** | qwen2.5-0.5B | about 0.65 s to its first words on the hub's module |
| **voice** | MeloTTS, English | a few set voices; it cannot clone one |
| **hearing** | Whisper | told its language (English); capped at 8 s when the talk can go elsewhere. A board that cannot hear is not asked again for ten minutes |

**The rule it is built to: no device ever waits on it.** Every board shares one small model, so:

1. **A talk is answered at once** with an id, and the device fetches the words, then the voice, when they are ready
   (`?async=1`). It stays usable while its daemon thinks (C-180, C-181). **A talk is short**: its first sentence or two,
   given back and spoken as soon as they are written, near thirty words; the carried daemon and the GUIDE are set up on
   the board ahead, so a first talk seldom waits, and a board that restarted is set up again rather than failing.
2. **Most replies need no model.** A care's answer (FEED, WATER, TRAIN, SLEEP, WAKE) and a hello come from written
   lines, chosen by the daemon's mood and the day, at once (C-180, C-196). Every line is DRAFT.
3. **A deadline, then n8n.** If no board is free, or none has begun an answer in about two seconds, the talk goes to
   your own n8n ([Talk to your daemon](Talk-to-your-daemon)). With n8n out of reach, the board is waited on -- up to a
   minute behind what it is doing, rather than failing at once -- and if the board itself fails, the talk says so,
   rather than giving n8n's error. The first talk with a daemon the board has not yet spoken as waits for the board to
   free a place for it.

**Who answers first** (C-211): the Tiiny (once its address is given), the AI board or n8n, the others after it. It is
one choice for the whole companion, made in the app's THE HUB card, in a watch's own settings or on the watch. Each has
a dot, green or red, for whether it can answer now; the companion checks every minute.

**With a Tiiny and endpoints, the order is**: the **Tiiny** first (C-249), then **THE HUB'S ENDPOINTS** in the order
you gave them (any OpenAI-compatible address, C-280), then the house's **AI boards**, then **n8n**. Each is asked only
when the one before is away, silent or fails. It is the same chain for a talk, THE GUIDE, a meeting's write-up and a
dream.

**The INDEX's voice** is a separate choice (SETTINGS, WHO ANSWERS WHEN YOU TALK). By default it is n8n, which keeps the
voice made for the INDEX. Each falls back on the other: when n8n cannot be reached or fails, the AI board reads the
entry; when the board cannot, n8n does.

## What the AI board does for your daemon

- **Talks as your daemon**: hearing, thinking and voice all in the house, so a recording never leaves home.
- **Tells its dreams.** After a night -- begun and ended in the app or on a watch -- the companion writes a dream at
  once, then asks the house's mind for its own telling, twice over and made one (C-308): REASON, INSTINCT and the WHOLE
  with its title ([Nights and dreams](Nights-and-dreams)).
- **Hears meetings and voice notes** (C-212, C-199, C-316). A meeting recorded on the T-Watch Ultra, or on the phone
  (MEETINGS, **RECORD A MEETING**), or brought in from Voice Memos (**FROM A VOICE MEMO**), is heard a part at a time,
  then written up -- a summary, take-aways and action items -- and the daemon day-dreams it. A voice note's words go to
  the app's VOICE NOTES. The hub does this, not n8n ([The T-Watch Ultra](The-T-Watch-Ultra)).
- **Answers as THE GUIDE** (C-209). Once your save has found THE GUIDE, ask it a question by voice from a watch's
  BOOKS, or in the app's GUIDE -- typed, or held and spoken. The pages nearest the question go to the model with it, and it answers as the book, only from
  them. Like any talk, it goes to whichever answers first.

## THE MIND (C-307)

**SETTINGS, THE MIND** treats every mind the app can reach as one: **THIS PHONE** (Apple's own model, on an iPhone that
can think for itself), **THE HUB** (and through it the chain above) and **AN ENDPOINT OF YOUR OWN**, asked by the phone
itself with its key kept in the phone's Keychain. The strongest that can answer is asked; if it is slow, another
answers instead. Each has a dot; **TRY IT** sends a typed line through it, and **RECENT THOUGHTS** says where each talk
was heard, thought and said, and how long each took -- never what was said.

**How far each may go** -- three rings, for TALK and THE GUIDE on a phone, and for DREAMS on the hub:

| ring | what may answer |
|---|---|
| **ANYWHERE** | every mind, an endpoint on the internet too |
| **AT HOME** | nothing leaves the house: the phone, the hub, the Tiiny, the AI boards, an endpoint inside your home |
| **THIS PHONE** | nothing leaves the phone -- TALK only, on a phone that can think |

THE GUIDE and dreams are kept on the hub, so they cannot be thought on the phone alone; the JOURNAL is always written
at home.

**THE HUB'S ENDPOINTS** (C-280), at the foot of THE MIND: any number of OpenAI-compatible models -- an address ending
`/v1`, a key, a model and a name -- asked in the order listed (↑ and ↓ move one), after the Tiiny and before the
boards. A key stays on the hub and is never shown again; each endpoint's dot says whether it answered in the last
minute, and one inside your home keeps to the AT HOME ring.

**THE MIND AT WORK** (C-319), under THE MIND: everything the house's mind is doing and has done. **THE WEB** -- the
hub in the middle, its minds on a ring, the devices that asked on the outer ring, a spark on the line of each task
thinking now. **THE RIVER** -- a lane per mind over an hour, a day or a week, up to NOW. **NOW** and **BEFORE** list
the tasks (who asked, from which device, on which mind) with **STOP**, **TRY AGAIN**, **FORGET** and **CLEAR
FINISHED**. The app shows **MINE**; everyone's is in THE ENGINE ROOM, below. STOP marks a task stopped and its answer
is ignored when it lands.

**The voice, in seconds** (C-317). A daemon's spoken answer from the hub is **streamed**: the Tiiny is asked for it a
part at a time, the phone is handed a link once the first part is ready and plays it as it comes, so the voice starts
in about three seconds rather than twenty. Once it has all come the phone keeps it, to hear again at once.

## THE ENGINE ROOM (C-330)

Everything that looks after the whole house rather than one player is in **THE ENGINE ROOM**, the hub's admin: one
installable web app the hub serves at **`/admin/`**, on the home network and the tailnet only -- never through the
relay, neither its files nor its requests. It pairs once, with a code from the hub's screen. Its pages:

| page | what it keeps |
|---|---|
| **THE HUB** | what the hub is running, and what is done on its own machine only |
| **THE MIND** | every mind's work, for everyone -- stop, try again, forget -- and **LATER**, the hub's plans |
| **THE HOUSE** | the CASINO's odds today and why, who is at the reels, what the house keeps |
| **VOICES** | every kept voice made again, on every phone |
| **DEVICES** | every device heard, what it carries, and forgetting one |
| **EXCHANGE** | the exchange's players, and a code to invite a new one |
| **THE COMMONS** | this home's link to the commons, and its keeper's commands |

Where the app used to hold one of these, it now says so, with **Open THE ENGINE ROOM ›**; each player's own things
stay in the app. Every word is DRAFT.

## Coming

- The LoRa gateway: the hub relaying broadcasts between bands (HUB.md, phase 6).
- A second AI board answering beside the first (C-197); a Module LLM on a Core (C-193).
- The LLM630 Compute Kit's camera recognising real animals, and later a daemon drawn over them (C-192, C-194).
