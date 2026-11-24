# Jev, TypeSafe AI's "System One" model -- can the companion use it?

*Researched 2026-11-24 from TypeSafe's launch post, its documentation (introduction, models, primitives, the System
One concept page), its evaluation site, its MIT-licensed `system-one-adapter-python` on GitHub, Vercel AI Gateway's
model page and the Wikipedia article (revision of 2026-11-15). IBM's AI agents page and LaunchDarkly's Release
Autopilot page were read as context for the release routine. Nothing was run, called or signed up for. Every speed and
accuracy number below is TypeSafe's own unless it says otherwise.*

## The short answer

- **It cannot run locally.** Jev is proprietary. No weights, no architecture, no paper, no self-hosted or on-premises
  option, no licence to run it. It is an API: TypeSafe's own (`POST https://api.typesafe.ai/v1/systemone`), and Vercel
  AI Gateway, which lists `typesafe-ai/jev` served by TypeSafe and DigitalOcean.
- **It is not a talker.** Jev is a *discriminative* model: it reads a state and answers typed questions with
  probabilities. It never writes a sentence. It cannot be the daemon's voice.
- **It is very cheap and claims to be very fast.** $0.042 per million input tokens, output free; 70-500 ms a request,
  0.4 s a case on TypeSafe's own evals.
- **The useful part for us is the shape, and the shape runs locally.** TypeSafe's MIT adapter answers the same typed
  questions with any OpenAI-compatible model, so the companion could ask System One questions of the Tiiny today and
  point the same call at Jev later, for data that may leave the house.

## 1. Can it run locally?

| | what the sources say |
|---|---|
| weights | Not published. Wikipedia: TypeSafe has published neither architecture, weights nor a technical paper. The models page: "the same weights serve every account"; no fine-tuning or LoRA on customer data |
| licence | Proprietary (Wikipedia's infobox). No model licence anywhere in the docs |
| sizes, quantizations, memory | None stated anywhere. Wikipedia reports the company calls it transformer-based; observers guess an open-weight LLM or a BERT-like encoder underneath. Unverified either way |
| versions | `jev-1.13.0` (text; Choice, Score, Noul) and `jev-1.14.0` (from 2026-10-14; adds PNG/JPEG input and the Box question). `jev-latest` and `jev-preview` both point to 1.14 |
| context | 64k tokens a request (state plus every question), 32k a question (state plus that one). A long-context header raises both to 262k, "slower and less accurate". Vercel's page says 32,000 |
| price | $0.042 per million input tokens ($42 per billion). Output tokens free. No free tier named. Rate limits per organisation, set in the console |
| providers | TypeSafe's API and console; Vercel AI Gateway (model id `typesafe-ai/jev`, providers `typesafe-ai` and `digitalocean`, still labelled an evaluation model) |
| data | "Jev is not trained on customer requests or responses." Zero data retention only on enterprise plans |
| OpenAI-compatible? | No. Its own endpoint and request shape. LiteLLM has no route for it that we could find; it would need a custom handler or a call around LiteLLM |

**So on our machines:** not on this Mac, not on roverbyteseer, not on the Tiiny, not on the LLM630 Kit's NPU, not on a
Raspberry Pi. There is nothing to download.

## 2. What it is good at

**TypeSafe's claim.** "System One" is Kahneman's fast, intuitive System 1 against the slow, deliberate System 2: a
class of models "built to make fast, structured decisions that software can use directly." Jev gives up string
generation and returns type-safe values with calibrated probabilities. You send a **state** (text, JSON, or since 1.14
an image) and any number of **questions**, all answered in parallel in one request:

| question | answers with |
|---|---|
| **Noul** | a probability of yes, 0 to 1 |
| **Choice** | the choice, a probability for every option, a confidence (up to 255 options before a slower two-stage path) |
| **Score** | a score on a legend, its probabilities, a confidence |
| **Box** (1.14) | a box on an image, 0-1 edges, a confidence |

```json
{"model": "jev-latest",
 "state": "{\"hp\": 12, \"max_hp\": 61, \"foe\": \"...\", \"moves\": [\"...\"]}",
 "questions": {"switch_out": {"type": "noul", "instructions": "Should the player switch daemons now?"},
               "move":       {"type": "choice", "instructions": "Which move?", "options": ["A", "B", "C", "D"]}}}
```

A question cannot depend on another's answer in the same request; dependent questions take two requests.

**Speed and cost (TypeSafe's numbers).** LLMs take "3 to 329 seconds" end to end, Jev "70ms-500ms"; "40x-200x faster"
on System-One-shaped work. Its evaluation site, four business workflows (security incidents, agent traces, invoices,
customer service), workflow mode:

| model | accuracy | cost a case | seconds a case |
|---|---|---|---|
| Jev | 67.8% | $0.0004 | 0.4 |
| Haiku 4.5 | 53.6% | $0.0195 | 12.5 |
| Sonnet 5 | 67.8% | $0.1174 | 78.1 |
| Opus 5 | 73.1% | $0.1761 | 37.8 |

**What is unverified.** All of it, independently.

- The "accuracy" is agreement with labels made by averaging two frontier LLMs at high thinking, not with human labels;
  TypeSafe says itself that this biases the reference towards those models, that its own team built the workflows, and
  that its hallucination figure "is not empirical". Wikipedia notes the same.
- Timings were run "from our laptops on the West Coast". Further away, add the round trip.
- No public benchmark (MMLU and the like) and no third-party evaluation was found. Wikipedia lists none either.
- The sources disagree with each other: the launch date (15 September 2026 in the post and Wikipedia, 16 November in
  the post's metadata), the context (32k on Vercel, 64k in the docs, 262k in a cited 1.14 headline), and the headline
  multiples (193.6x faster and 444.6x cheaper on the homepage, 40-200x and 40-400x elsewhere).
- "Can't hallucinate" and "never makes type errors" mean the *output* is always a valid typed value. Whether the value
  is *right* is the 67.8%.
- Training is said to be synthetic data only, by an unpublished method.

**A fair reading.** A fast, cheap, calibrated classifier, about as accurate as a mid-size frontier model on
decision-shaped questions *as TypeSafe measures them*. Strong for routing, triage and scoring. No use for anything that
needs words.

## 3. How we could use it

### Where the companion's thinking runs today

- **The daemon's voice** is a generator: the hub's talk route (daemons-hearth) asks LiteLLM on roverbyteseer, which
  fronts the Tiiny (`tiiny-35b`, `tiiny-9b`, Qwen3.6-35B-A3B with thinking off by default), with Whisper for ears and
  the Tiiny's streamed voice for speech (`seer/`). The LLM630 Kit runs small Qwen models on its NPU offline
  (`docs/LLM630.md`). `self.ts` (C-252, `docs/MIND.md`) writes who a daemon is -- its feelings, friendship, dreams and
  week -- into that prompt.
- **THE MESH** (C-360) spreads processing over nodes on roverbyteseer and this Mac; in a work space a ticket can name an
  agent that n8n or THE MESH runs (`docs/PROJECTS.md`, WORKER).
- **The AI playtester and THE HANDS** play the ROM through `engineAi`: the state comes out of RAM by symbol, and
  `DAEMONS_MIND` picks the mind (default: whatever the hub uses, today the Tiiny; OpenRouter paid, never automatic).

Every one of these is local first, and much of what they read is personal: the daemon's self is built from a person's
journals, dreams, goals and moods.

### What fits, best first

1. **The System One *shape*, locally, as a router in front of the talker (recommended).** Before a message reaches the
   35B, ask a few typed questions in one call: is this a care action, a goal check-in, a question about the game, small
   talk? Does it need the slow mind, or can the board's small model or a canned line answer? Is the person upset (a
   Score the daemon's feelings can read)? Answer them with TypeSafe's MIT adapter pointed at LiteLLM's `tiiny-9b` (it
   takes any OpenAI-compatible `base_url`), or the same request shape in our own TypeScript. Nothing leaves the house,
   the answers are typed rather than parsed out of prose, and the call is already Jev-shaped if we ever want Jev.
   *It will not be Jev-fast on the Tiiny: a 9B answering a handful of choices is seconds, not 70 ms.*
2. **Jev itself, by API, for data that may leave the house.** Not the daemon's self, journals or dreams. Candidates:
   - **The AI playtester's and THE HANDS' small decisions** -- stuck or not, which menu row, run or fight -- from the
     RAM state, which is game data only. 0.4 s against the Tiiny's seconds could let the harness ask every few frames.
     It cannot replace the playing mind (it cannot read the screen's text into a plan or write notes), only sit in
     front of it: answer the easy turns, hand the hard ones to the Tiiny. Paid, so off by default like OpenRouter.
   - **The release routine's judgement calls.** `releasedocs.py` prints CANDIDATE lines that a session judges by hand
     (does this ticket need a public word on this page?); a Noul per candidate over the commit titles and the page's
     headings would sort them in a second for fractions of a cent. Commit titles and public pages only.
   Either costs almost nothing ($0.042 a million tokens), but it adds an outside service, a key and a dependency on a
   young company's pricing, which its own post says "we'll need the long-term to prove".
3. **Not as the daemon's fast voice.** It writes no words. The fast voice stays the board's local model or a short
   line from the Tiiny.
4. **Behind LiteLLM: not directly.** LiteLLM speaks chat completions; Jev does not. A custom LiteLLM handler is
   possible but buys little; a small `systemOne()` client in the companion's `ai/` with two back ends (the adapter
   prompt over LiteLLM, or Jev's endpoint) is simpler and keeps the choice of mind in one place.

### What IBM and LaunchDarkly hold for our release routine

Neither page names Jev or any model. IBM's (watsonx Orchestrate) is enterprise framing; the one idea worth keeping is
an **audit trail of what each agent did as whom** -- which our lanes and Redmine notes already half give us.
LaunchDarkly's Release Autopilot has three ideas that map onto the push routine:

- **A risk score per change that decides the gates.** Classify each ticket's diff (files touched: a map, the type
  chart, a save layout, only docs) and let that decide which checks and which review sheets the push needs, rather
  than running everything the same way. A System One Noul/Score is exactly this shape.
- **Staged release with a halt.** Put a build in front of the playground and the field testers first; advance to
  `ghrelease.py` only when that stage's gate passes, and pause -- not roll back -- when it fails.
- **The release plan as data.** The push routine is seven numbered steps in prose; as a list of steps with conditions
  a script reads, a session could resume it, report where it stopped, and an agent could start, pause and inspect it.

## Sources

- TypeSafe, *Introducing System One models and Jev* -- typesafe.ai/blog/introducing-system-one-models-and-jev
- TypeSafe documentation -- docs.typesafe.ai (introduction, models, primitives, concepts/system-one)
- TypeSafe evaluations -- evals.typesafe.ai
- `system-one-adapter-python` (MIT) -- github.com/typesafe-ai/system-one-adapter-python
- Vercel AI Gateway, Jev -- vercel.com/ai-gateway/models/typesafe-ai/jev
- Wikipedia, *Jev (AI model)* -- en.wikipedia.org/wiki/Jev_(AI_model)
- IBM, AI agents -- ibm.com/solutions/ai-agents
- LaunchDarkly, Release Autopilot -- launchdarkly.com/how-it-works/release-autopilot/
