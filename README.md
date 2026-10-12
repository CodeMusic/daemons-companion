# 🦊 daemons-companion

**My name is CRYSTAL CLEAR. I study DAEMONS** -- and lately, where they go when they leave the game.

You have raised one. It has walked every route with you, learned its routines, slept in your party between towns. It
does not have to stay in the cartridge.

**SEND it AWAY from your party, and something out here can host it.** Your phone, most likely. A little board on your
desk, a watch on your wrist, a radio with a dial -- anything with a screen and a bit of patience. Out here it keeps the
life it had in there: it gets hungry, it gets tired, it learns. And when you **SYNC**, it goes home with everything that
happened while it was with you.

I will not tell you which device it should live in. I never assign a daemon. You will see which one it likes.

## The happy path: your phone hosts it

Nothing to buy. The phone in your pocket is the first host, and the one I would start with.

1. **Play [DAEMONS](https://github.com/CodeMusic/DAEMONS)**, and in your party, **SEND** a daemon AWAY.
2. **Start the companion** on your computer and show it a **copy** of your save -- never the only one
   (`./bindCompanion.sh`, then SETTINGS on the site it opens).
3. **SYNC.** The daemon steps out of the game.
4. **Put the app on your iPhone** (`./bindCompanion.sh phone`) and **pair** it (the site's SETTINGS, PAIR A PHONE).
5. **Add the DAEMONS widget** to your home screen. It hosts a daemon of its own -- choose which under DEVICE, YOUR
   DEVICES, This phone's widget -- and its **FEED**, **WATER** and **TRAIN** work right there, without opening anything.
   *Eaten. Drank. Trained.*

Every step, with what you should see: **[Host on your phone](https://github.com/CodeMusic/daemons-companion/wiki/Host-on-your-phone)**.

*One honest note from the lab: today the phone still talks to the companion on a computer of yours, which keeps that
copy of your save. A phone and a game that need nothing else is what I am working on next (C-111).*

## Any device can host one

The phone is enough. The rest are **companions** -- extra hosts, for the people who like to hold things. **Most LilyGO
and M5Stack boards are supported**, and with more than one, each can host a different daemon from your party.

| | a daemon hosted here... |
|---|---|
| **your phone** -- the app and its home-screen widget | lives on your home screen, and comes along for everything else |
| **LilyGO T-Embed** (CC1101, plain, SI4732) | answers a dial that hums in the day's key; on the SI4732 it tunes the radio and **learns the stations** it hears |
| **LilyGO T-Deck / T-Deck Plus** | can be typed to, and calls out over **LoRa** to daemons a street away |
| **LilyGO T-Watch S3** | wears the day on its face, and keeps your steps |
| **LilyGO T-Display-S3 Pro** | spreads out across a wide screen |
| **M5Stack** StickS3, CoreS3, M5GO, Fire, Dial | fits a pocket, a desk, a palm -- the Dial reads tags held to its face |
| **M5Stack Tab5** | runs **the control center**: every screen of the app, on a tablet of its own |

A few of these are still on my bench -- built, and waiting for their first run on the real thing. Each board's
controls, pages, quirks and which ones run today: **[Boards](https://github.com/CodeMusic/daemons-companion/wiki/Boards)**.
Flashing one takes one command: **[Flashing and linking](https://github.com/CodeMusic/daemons-companion/wiki/Flashing-and-linking)**.

## What a hosted daemon does

- **It keeps its day.** Fed, watered, trained, put to bed; a quiet line at a meal time, and one at bedtime. It never nags.
- **It feels -- and you can see it.** Glad after a meal, sleepy at night, its eyes closing when it sleeps. I drew none
  of that by hand: every host shades and shapes its own sprite, so it works for whichever daemon you bring out
  ([Feelings and expressions](https://github.com/CodeMusic/daemons-companion/wiki/Feelings-and-expressions)).
- **It helps with yours.** Tell it what you want to get done and it finds **one next step**. Each step you finish is a
  meal, and experience it takes home at the next SYNC.
- **It talks.** Hold to talk on the phone or a board, and it answers in its INDEX voice
  ([Talk to your daemon](https://github.com/CodeMusic/daemons-companion/wiki/Talk-to-your-daemon)).
- **It reads you its INDEX entry** aloud -- or anyone's.
- **It notices others.** Pass someone hosting a daemon of their own, and your INDEX sees theirs
  ([Meeting others nearby](https://github.com/CodeMusic/daemons-companion/wiki/Meeting-others-nearby)).
- **It follows you out.** Away from home your phone reaches it through a relay of your own
  ([Away from home](https://github.com/CodeMusic/daemons-companion/wiki/Away-from-home)).

## Starting it

On a Mac with Node 24:

```sh
./bindCompanion.sh            # the companion, and the site that runs it, at http://localhost:8081
./bindCompanion.sh phone      # the app, built onto your iPhone
./bindCompanion.sh always     # keep the companion running, so your phone can always reach it
./updateCompanion.sh          # flash any boards you have plugged in
```

Every command and option: **[Running the companion](https://github.com/CodeMusic/daemons-companion/wiki/Running-the-companion)**.
When something does not answer: **[Troubleshooting](https://github.com/CodeMusic/daemons-companion/wiki/Troubleshooting)**.

## Read more

- **[The wiki](https://github.com/CodeMusic/daemons-companion/wiki)** -- how to do everything, page by page.
- [**docs/FIELD-GUIDE.md**](docs/FIELD-GUIDE.md) -- a walk through every feature, with what you should see.
- [**CONTEXT.md**](CONTEXT.md) -- what this project is and who it is for.
- [**docs/vision.md**](docs/vision.md) and [**docs/PLAN.md**](docs/PLAN.md) -- what it is for, and how each piece is built.
- [**docs/DEVICES.md**](docs/DEVICES.md), [**docs/HARDWARE.md**](docs/HARDWARE.md), [**docs/REMOTE.md**](docs/REMOTE.md),
  [**docs/LORA.md**](docs/LORA.md), [**docs/TAB5.md**](docs/TAB5.md), [**docs/LLM630.md**](docs/LLM630.md) -- the hosts, their
  parts, the way home from anywhere, the mesh, the control center, the offline brain.
- [**docs/INHERITANCE.md**](docs/INHERITANCE.md) -- what RoverRadio and RoverCub already did; this is their successor.
- [**TODO.md**](TODO.md) -- the work, decided and not done.

## Back to where it came from

Every daemon out here was compiled in there. If you want to see where -- the towns, the routines, the very lines I say
when you first walk into my lab -- the game itself runs on **[CodeMusic/pokefirered-daemons](https://github.com/CodeMusic/pokefirered-daemons)**.
That is the engine, and the place to go when you want to change the world rather than just visit it. Its design, and
the patches that turn your own cartridge into DAEMONS, are kept in **[CodeMusic/DAEMONS](https://github.com/CodeMusic/DAEMONS)**.

I would go back now and then. A daemon likes to know the way home.

## The DAEMONS family

| | |
|---|---|
| [**CodeMusic/DAEMONS**](https://github.com/CodeMusic/DAEMONS) | **the game** -- its design bible, its tools, and patches for your own cartridge |
| [CodeMusic/pokefirered-daemons](https://github.com/CodeMusic/pokefirered-daemons) | the game's engine |
| [CodeMusic/gpt-play-pokemon-firered-daemons](https://github.com/CodeMusic/gpt-play-pokemon-firered-daemons) | the harness that lets a model play it |
| **CodeMusic/daemons-companion** | this: where your daemon goes when it leaves the game |

**Nothing of Nintendo's is in here.** The daemon art it shows is DAEMONS' own -- every sprite in
`DAEMONS/gfx/daemons/` was drawn for the project -- and it reads and writes a DAEMONS save without any of the game's
code.
