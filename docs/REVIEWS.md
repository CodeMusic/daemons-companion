# MENTIONS FROM YOUR DAEMON, and a cadence on every plan (C-455)

*Design and first build, 2026-11-21. Every name and line the player reads is DRAFT.*

The user's ask (2026-11-21): scheduled daemons write reviews of the player's stats -- daily, monthly, three-monthly,
yearly -- as a task with a game name (their example: *Mentions from your Daemon*), set in settings; and every scheduled
job, the nightly dreams among them, gets a cadence: daily, weekly, monthly, or n times a week, month or year.

## The user's choices (by multiple choice, 2026-11-21)

| Question | Chosen |
|---|---|
| Built first, of C-454 and C-455 | **C-455** (it stands on THE MIND's LATER plans, which exist) |
| What a review is | **A letter in the daemon's own voice** about the span, the numbers set under it |
| Its names | **One per span**, under MENTIONS FROM YOUR DAEMON: DAILY MENTIONS, THE MONTH'S MENTIONS, THE SEASON'S MENTIONS (three months), THE YEAR'S MENTIONS |
| Where it arrives | **A card on TODAY**, then kept for good as a page of the MENTIONS book on the LIBRARY's shelf, beside the DREAM-BOOKS |
| What a cadence means for dreams | **Told only on the chosen nights**: every night slept is still kept and written; the thinker's telling (the dreamer's voice) happens only on the nights the cadence picks |

## The cadence (`server/src/ai/schedule.ts`)

Every plan in THE MIND's LATER (C-319) now carries a cadence: `every` -- a **day**, a **week** (from Sunday), a **month**,
a **quarter** (from January, April, July, October) or a **year** -- and `times`, how many times in it, spread evenly from
the period's first day (3 a week: Sunday, Tuesday, Thursday). Once a week falls on the plan's weekday, once a month on its
date (the last day of a short month if the date is past it), at the plan's own hour. A cadence the player sets is kept
beside the plan's on/off (`mind.plans`); setting none returns it to the plan's own. A cadence that does not fit (8 a
week) is refused.

A plan may be a **gate**: never run, only asked whether one of its times falls on a day (`fallsOn`). **DREAMS TOLD** is
the first: `tellDream` asks it of the morning the night ended. Daily by default, so nothing changes until it is set.

Where it is set: **THE ENGINE ROOM's LATER** card, each plan with DAY / WEEK / MONTH / 3 MONTHS / YEAR and − / + for the
times (`POST /api/mind/tasks {act: "plan", plan, every, times}`). It is the hub's, on the home network and the tailnet
only, as the plans already were (C-330).

## MENTIONS (`server/src/mentions.ts`, MIND)

Four plans: `mentions.day` (every day at 21:00), `mentions.month` (the 1st at 9:00), `mentions.season` (each quarter's
first day at 9:30) and `mentions.year` (New Year's Day at 10:00), all on.

**The span** reaches back to the last letter of its kind, never further than the span's own length (a daily letter switched
on after a month covers one day). A month, a season and a year run midnight to midnight, so the month's letter on the
1st covers the month gone whole ("October 2026").

**The numbers**, counted from what is already kept: the cares and talks (by the day's memory's own words, `memory.ts`
DAY_WORDS), the steps done and goals finished, the ARETE earned (PRAXIS's ledger, `Goals.earnedBetween`), the player's
journal entries and dreams written down, and the daemon's nights and how they went.

**The letter**: the carried daemon's persona of the day (`persona.ts`) is the system; it is asked to speak to the player
as *you*, to notice what went well warmly and what was quiet without blame -- *it never pesters* (PROJECTS 1) -- to invent
nothing the numbers do not say, and to keep to a size by span (110 to 300 words). The plain letter, written from the
numbers, is kept **at once**, so a hub with no mind, or a mind that fails, still leaves the page; the mind's words replace
it when they come. A task in THE MIND's ledger while it is written (kind MENTIONS).

**Kept for good** in the `mentions` table. `GET /api/mentions` (`routes.ts`, so a phone hosting alone shows them too)
gives the book, every letter newest first, and TODAY's: the newest not yet read, from the last day and a half.
`POST /api/mentions/read {id}` takes it off TODAY; `POST /api/mentions {span}` writes one now.

**In the app** (`app/screens/library/Mentions.tsx`): TODAY's card is the letter, its span and its daemon, the numbers as
small tags, said aloud by the daemon's voice, and READ. The LIBRARY's DREAM-BOOKS shelf gains MENTIONS FROM YOUR DAEMON
once its first letter is written: its cover the newest letter's daemon, the book a page a letter, newest first.

## Not yet (OPEN)

- **The week's virtues** in the numbers, once THE WEEK'S BALANCE (PROJECTS 6) is built.
- **A cadence in the app's own settings**: today it is THE ENGINE ROOM's. A player without the hub's admin cannot set it.
- **Notifications**: none, by choice; the card waits on TODAY.
- **More than one daemon**: the carried daemon writes. A household with several could take turns, or each write its own.
- **The game's side**: a letter could be a NOTEBOOK page at SYNC. That is the game lane's to agree.
- **The REVIEWER** (PROJECTS 7), the weekly review that proposes a focus, is a different thing. It could read the month's
  MENTIONS when it comes.
