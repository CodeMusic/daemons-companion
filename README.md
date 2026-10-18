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
4. **Put the app on your iPhone** (`./bindCompanion.sh phone`) and **pair** it: the site's SETTINGS, PAIR A PHONE
   offers your computer by its own name (`http://<name>.local:4730`), so the pairing holds wherever the two of you
   share a Wi-Fi.
5. **Add the DAEMONS widget** to your home screen. It hosts a daemon of its own -- choose which under PLACES, YOUR
   DEVICES, This phone's widget -- and its **DRINK**, **FEED**, **TRAIN** and, at bedtime, **SLEEP** work right there,
   without opening anything. *Drank. Eaten. Trained. Asleep.*

Every step, with what you should see: **[Host on your phone](https://github.com/CodeMusic/daemons-companion/wiki/Host-on-your-phone)**.

*One honest note from the lab: the phone can now host on its own, with no computer at all (SETTINGS, THIS PHONE HOSTS
ON ITS OWN) -- your save comes over from Delta through Files and goes back by the share sheet (C-111). I have run it
in the simulator; a whole round trip on a real phone, with a SEND, I have not yet seen. Until I have, the computer is
the way I would start.*

## Any device can host one

The phone is enough. The rest are **companions** -- extra hosts, for the people who like to hold things. **Most LilyGO
and M5Stack boards are supported**, and with more than one, each can host a different daemon from your party.

| | a daemon hosted here... |
|---|---|
| **your phone** -- the app and its home-screen widget | lives on your home screen, and comes along for everything else |
| **LilyGO T-Embed** (CC1101, plain, SI4732) | answers a dial that hums in the day's key; on the SI4732 it tunes the radio and **learns the stations** it hears; the CC1101 reads cards |
| **LilyGO T-Deck / T-Deck Plus** | can be typed to, and types back: a message sent over **LoRa** to every board a street away |
| **LilyGO T-Watch S3** | stands on its face -- DAEMON, CLOCK or VIRTUE, chosen from the phone -- with the season's sky behind it and the weather in front; is tended with a double tap, and keeps your steps |
| **LilyGO T-Display-S3 Pro**, **T-Display-S3 AMOLED** | spreads out across a wide screen |
| **M5Stack** StickS3, CoreS3, M5GO, Fire, Dial | fits a pocket, a desk, a palm -- the Dial reads cards held to its face; the M5GO and Fire hear LoRa with a module |
| **M5StickC-Plus** with its Thermal HAT | **sees heat**: GLOW, a routine type of its own -- the warmest thing in the room, and when someone is there |
| **M5Stack Cardputer / Cardputer ADV** | a keyboard in a pocket; the ADV's cap speaks LoRa |
| **M5Stack Tab5** | runs **the control center**: every screen of the app, on a tablet of its own |
| **Espressif ESP32-S3-BOX-3** | is **your home's voice assistant**: Home Assistant's own, with the daemon for a face and, if you like, its words |

One is still on my bench: the plain Cardputer is built and waiting for its first run on the real thing. The T-Watch and
the Cardputer ADV have had theirs and run, though not every key and tap of theirs has been tried by hand yet. Each
board's controls, pages, quirks and which ones run today:
**[Boards](https://github.com/CodeMusic/daemons-companion/wiki/Boards)**. Flashing one takes one command:
**[Flashing and linking](https://github.com/CodeMusic/daemons-companion/wiki/Flashing-and-linking)**.

## What a hosted daemon does

- **It keeps its day.** Given a drink, fed, trained, put to bed; a quiet line at a meal time, and one at bedtime. It
  never nags.
- **It feels -- and you can see it.** Glad after a meal, sleepy at night, its eyes closing when it sleeps, standing in a
  den that looks like its type. I drew none of that by hand: every host shades and shapes its own sprite, so it works
  for whichever daemon you bring out
  ([Feelings and expressions](https://github.com/CodeMusic/daemons-companion/wiki/Feelings-and-expressions)).
- **It helps with yours.** Tell it what you want to get done and it finds **one next step**. Each step you finish is a
  meal, and experience it takes home at the next SYNC.
- **It talks.** Hold to talk on the phone or a board, and it answers in its INDEX voice
  ([Talk to your daemon](https://github.com/CodeMusic/daemons-companion/wiki/Talk-to-your-daemon)).
- **It reads you its INDEX entry** aloud -- or anyone's.
- **It plays.** **THE CASINO** is on every board, the phone, the site and the Tab5: SLOTS, three reels of your daemon
  and others you have seen in your game, the season -- or the weather outside -- falling over them, and a holiday's
  dress when there is one. **The coins are your game's money** -- what is won or lost, the next SYNC writes into your
  save. The odds move with the day, between 90 and 100 back for every 100 bet -- a holiday, the real weather of a city
  you name, the hour, the season -- and THE HOUSE says why. Whoever else is at the reels sits at your table, and a big
  win is cheered ([The CASINO](https://github.com/CodeMusic/daemons-companion/wiki/The-CASINO)).
- **It notices others.** Pass someone hosting a daemon of their own, and your INDEX sees theirs. It can wave, bow or
  say a word to every daemon in reach -- over Bluetooth, your network or LoRa, and you see each one once. What another
  daemon says or does shows over whatever you have open, and a board asleep keeps it for when it wakes
  ([Meeting others nearby](https://github.com/CodeMusic/daemons-companion/wiki/Meeting-others-nearby)).
- **It sounds like your game.** The phone, the site and the widget play every tune on your game's own instrument --
  the HARP for a CONTENT save, the FLUTE for CONTEXT (the Tab5's is built, not yet flashed) -- and the boards play the
  same notes on their own beeps. Each device's sound is its own to set, from off to loudest
  ([Settings](https://github.com/CodeMusic/daemons-companion/wiki/Settings#sound)).
- **It keeps a card.** On a board with a reader, hold a card to it and put your daemon on it, take the one it holds,
  or swap (built; its first real card is still to come).
- **It can reach your home, if you let it.** HOME, in PLACES, brings Home Assistant to the app, the site and the Tab5
  (built; it has yet to meet a real Home Assistant), and the BOX-3 wears the daemon's face
  ([Home Assistant and the BOX-3](https://github.com/CodeMusic/daemons-companion/wiki/Home-Assistant-and-the-BOX-3)).
- **It follows you out.** Away from home your phone reaches it through a relay of your own
  ([Away from home](https://github.com/CodeMusic/daemons-companion/wiki/Away-from-home)).

## Your game, in your pocket

The companion reads your save, so it can show you what you have done in there -- on the app, the site and the Tab5:

- **TODAY** -- where you last saved, your MARKS, your money and what the CASINO has waiting for the next SYNC, and
  what is new in the LIBRARY, each opening its place.
- **YOU** -- you as the game draws you, your rival, your money and your MARKS as badges, each opening its page;
  the ROOTS in their own colours; the two region maps filling in as you go; the GROVES you have found; GAME EVENTS,
  the story so far.
- **LIBRARY** -- CALLOW SCHOOL (your DIPLOMA, and the paper to sit again, marked here and never in your save), THE
  GUIDE once you have found it in the game, the **NOTEBOOK** to read, the **SONGBOOK** (the songs you have learned, on
  a staff in the game's own key colours, to hear again -- and, once the game has given it to you, your HARP or FLUTE
  to play, listening as the game listens) and **STREAM** (every lesson a MARK or a ROOT has opened).
- **The INDEX**, in DAEMON -- every entry, read aloud if you like, and where each daemon is NATIVE.

LIGHT, DARK or AUTO on every screen. It never shows what your save has not reached yet
([Your game on the companion](https://github.com/CodeMusic/daemons-companion/wiki/Your-game-on-the-companion)).

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
  [**docs/LORA.md**](docs/LORA.md), [**docs/BROADCAST.md**](docs/BROADCAST.md), [**docs/TAB5.md**](docs/TAB5.md),
  [**firmware/box3/README.md**](firmware/box3/README.md), [**docs/LLM630.md**](docs/LLM630.md) -- the hosts, their parts,
  the way home from anywhere, the mesh, a word to every daemon, the control center, the home's voice, the offline brain.
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
