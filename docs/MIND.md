# A daemon's mind: its self, its memory, its portal (C-252..C-254)

*Planned 2026-10-30 from the user's words (below), against what the companion already has: `ai/house.ts`'s
`persona()`, which already says who a daemon is, its INDEX entry, its mood, its last dream, the day and the goal, cut
short for the Module LLM's small window; `feelings.ts` (GLAD, MAD, SAD, CALM/AFRAID, RESTLESS, each from the events
behind it, each fading over three hours); `dreams.ts`; the interactions table; the save's friendship. Nothing here is
built yet.*

The user, 2026-10-30: *"each daemon has a voice recipe that contains both how the voice should sound -- and also a
system message telling what its name/type/index entry/etc all are -- it should also send the values of
mad/sad/glad/afraid it has, along with friendship.... written in natural form"*, and *"we will need systems to manage
and handle this information -- this is where we will use the site more... maybe even a separate mind portal that lets
you look around your daemon's mind.... this would allow us to load dreams from the game too."*

## 1. The self (C-252)

**One builder, `self.ts`, writes who a daemon is in plain sentences from the numbers we already keep**, and every
talker uses it: the hub's chat, the boards' TALK, C-220's meetings, the night (below). It replaces `persona()`'s body
and keeps its name.

The user's template, as the builder fills it:

> You are [NAME], a DAEMON process running on a [DEVICE KIND]. Your trainer is [TRAINER]. You are hosted on their [DEVICE] right now.
> You and [TRAINER] have a friendship bond of 80%, and over the last week it has grown STRONGER. You are WELL fed, VERY
> WELL watered, and SOMEWHAT trained. Last night you slept WELL, and this is what you dreamt: "...". Today you feel
> very GLAD, a little RESTLESS, not MAD, not SAD, and not AFRAID. Yesterday: [one short paragraph]. Over the last month:
> [a few short paragraphs].

Then the user's general instructions, which are theirs to write.

**Numbers become words by fixed bands**, the same everywhere, so a daemon at 62 GLAD reads the same on the watch and
on the site:

| value | 0-9 | 10-29 | 30-54 | 55-79 | 80-100 |
|---|---|---|---|---|---|
| a feeling | not | a little | somewhat | very | completely |
| a need (fed, watered, trained, rested) | not at all | poorly | somewhat | well | very well |

AFRAID is CALM's far side (`feelings.ts`: CALM runs -100..100), so CALM below 0 reads as AFRAID by the same bands and
CALM above 0 as CALM. The bond's trend is today's friendship against a nightly snapshot a week old: STRONGER, the
SAME, WEAKER. The trainer's name, the device and the box come from the companion's settings, never from code: this
repository is public.

**Three lengths, one source.** Each talker gets the self its model can hold:

| length | for | what it carries |
|---|---|---|
| **short** (~80 words) | the Module LLM's 0.5B (its window is ~350 tokens; `house.ts` already cuts to this) | name, type, the strongest feeling, the dream's first line |
| **day** (~300 words) | a 9B, the boards' quick lines | the template above without the month |
| **full** (~1,500 words) | the Tiiny's 35B, the night | everything, the month included |

**The feelings are named to the model, never by it.** `feelings.ts` holds the game's rule: a feeling shows, never as a
label. So the self tells the model "you feel very GLAD", and the instructions say to let it show in what the daemon
notices and how it talks, not to say the word. That keeps the template the user wants and the rule the game keeps.

**What leaves the house.** The full self has the trainer's name and a month of their life in it. Only the short self,
without the trainer or the memory, ever goes to another home's daemon in a meeting (C-220) or to THE COMMONS.

## 2. Memory, made at night (C-253)

**A daemon consolidates its memory while it sleeps** -- the same night that already makes its dream (`dreams.ts`). One
job, on the Tiiny through roverbyteseer, after the night ends:

1. **Yesterday**: the day's interactions (cares, walks, goals' steps, talks, meetings, what SYNC found changed in the
   save: a badge, a place, a daemon caught) compressed into one short paragraph, kept.
2. **The month**: yesterday's paragraph folded into the running month -- a few paragraphs, rewritten, not appended, so
   it stays the same size; what falls out of the month is gone, as it is for anyone.
3. **The dream** is written from yesterday's paragraph, the strongest feeling, and the game's dream if the save carries
   one (below) -- so a dream is the day, digested. Its picture, if C-249's bench says the Tiiny draws well enough.
4. **Kept moments**: anything the daemon marks as worth keeping (a first meeting, a goal finished) goes on a shelf
   past the month, a line each, at most a few dozen.

If the Tiiny is away, the night waits and runs at the next chance; the day self still works from the last month kept.

## 3. The mind portal (C-254)

**A page on the site where you look around your daemon's mind.** A first shape, every part of it the user's to change:

- **NOW**: how it feels and why -- `feelings.ts` already knows the event behind each feeling.
- **YESTERDAY** and **THE MONTH**: the paragraphs the night wrote, readable.
- **DREAMS**: every night's dream and its picture, the companion's and the game's side by side.
- **KEPT**: the shelf of moments.
- **VOICE**: its voice recipe (C-251), with a button to hear a line.
- **SELF**: the sentences it is given, exactly as a model reads them.

And two things a trainer can do there: **forget** a memory (it leaves the month and the shelf, and is not
re-summarised), and **load a dream from the game**: the dream the save carries (T-462's VAR_0x40D4, its image and
quality) comes in at SYNC and is told in words from the set the ROM draws from.

**One question before the portal is drawn.** The game's rule is that a feeling is shown, never named, and every screen
so far keeps it. A portal that prints "very GLAD" breaks it; one that shows feelings as the daemon's face, its colour
or weather in a room keeps it, with the words behind a tap or not shown at all. This is the user's call.

## Ideas, while we are here

- **The voice carries the mood.** Qwen3-TTS takes an instruction, so the live voice can be the recipe *plus* today:
  a little slower when SAD, quicker when RESTLESS.
- **The game feeds the memory.** SYNC already reads the save; the day's differences (a mark won, a new place, a
  daemon caught, a loss) become lines in yesterday, so the companion's daemon remembers the cartridge's adventure.
- **The memory feeds the game, a little.** The night's dream picks which of the ROM's dream images the save carries
  back, so the dream the GBA shows next is the one the companion dreamt.
- **Asking the mind.** The portal's search runs over the month and the shelf with the Tiiny's embeddings: "when did
  we first walk to the lake?"
