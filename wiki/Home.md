# 🦊 DAEMONS companion

*CRYSTAL CLEAR here. Your daemon does not have to stay in the game -- SEND it AWAY, and something out here can host it.
I keep my notes on how in these pages. Start with your phone; it is the easiest host there is.*

The companion lets you bring a daemon out of your game of [DAEMONS](https://github.com/CodeMusic/DAEMONS) and into
the real world: you SEND it from your party in the game, and a device **hosts** it -- your phone and its home-screen
widget first, and, if you like, a handheld board too. You give it a drink, feed it, train it, put it to bed and talk
with it, and it helps you with one goal, one next step at a time; as you get things done, it thrives and takes what it
learned home to the game. Any device can host a daemon, and with more than one device each can host a different daemon
from your party. It also reads your save, so your PROFILE, your NOTEBOOK and what you have been taught come with you.

## The happy path: a daemon on your phone

1. **Run the companion on your computer** and point it at a **copy** of your save --
   [Running the companion](Running-the-companion).
2. **SEND a daemon AWAY** in the game, close the game, and **SYNC** in the companion --
   [Host on your phone](Host-on-your-phone#3-send-a-daemon-away-and-sync).
3. **Build the app onto your iPhone** with `./bindCompanion.sh phone` and **pair it** -- the site offers your computer
   by its own name -- [Host on your phone](Host-on-your-phone#4-build-the-app-onto-your-iphone).
4. **Add the DAEMONS widget** to your home screen and choose the daemon it hosts --
   [Host on your phone](Host-on-your-phone#6-add-the-widget).
5. **DRINK, FEED, TRAIN** and, at bedtime, **SLEEP** from the home screen, and reach it from anywhere if you want to --
   [Away from home](Away-from-home).

The phone can also host on its own, with no computer: the save comes over from Delta through Files and goes back by the
share sheet (C-111). That is built and has run in the iOS Simulator; a whole round trip on a real phone has not yet
been seen, so the computer is the way to start ([Host on your phone](Host-on-your-phone#or-the-phone-on-its-own-c-111)).

## Every page

| page | what it covers |
|---|---|
| [Host on your phone](Host-on-your-phone) | the happy path, step by step: the save, SEND and SYNC, the iPhone app, pairing, the widget -- and the phone on its own |
| [Running the companion](Running-the-companion) | `bindCompanion.sh`, the site and its tabs, the server, its logs, keeping it running, Node 24 |
| [Your game on the companion](Your-game-on-the-companion) | PROFILE, MARKS and ROOTS, the region maps, GROVES, GAME EVENTS, the NOTEBOOK and SONGBOOK, the LIBRARY and CALLOW SCHOOL, NATIVE, the CASINO's coins |
| [Boards](Boards) | the optional handhelds: every supported board, its controls, its pages, care, routines (GLOW, the CASINO, CHORUS, cards), sounds, battery |
| [Flashing and linking](Flashing-and-linking) | `updateCompanion.sh`, `linkCompanion.sh` and `box3.sh`, checks down the cable, and what to do when a board looks dead |
| [Home Assistant and the BOX-3](Home-Assistant-and-the-BOX-3) | HOME on the app, the site and the Tab5; the BOX-3 as the home's voice assistant with the daemon for a face; the daemon as Home Assistant's conversation agent |
| [Away from home](Away-from-home) | the relay through your own n8n, reading its executions, and keeping your computer reachable |
| [Feelings and expressions](Feelings-and-expressions) | how it feels, and how its face shows it on every host -- from its own sprite, in its den |
| [Talk to your daemon](Talk-to-your-daemon) | hold to talk, read aloud, and what it takes on your own machines |
| [Meeting others nearby](Meeting-others-nearby) | the Bluetooth beacon, broadcasts to every daemon, and LoRa's MESH on the boards that have it |
| [Settings](Settings) | the save path, `server/config.json`, and every settings card |
| [Server API](Server-API) | every route the server answers |
| [Troubleshooting](Troubleshooting) | the widget stuck looking, presses kept, pairing by name, a board that looks dead, a silent Fire, disk space |

## Elsewhere in the repository

- [README](https://github.com/CodeMusic/daemons-companion/blob/main/README.md) -- the companion in a page.
- [docs/FIELD-GUIDE.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/FIELD-GUIDE.md) -- a walk
  through everything, with what you should see at each step.
- [docs/HARDWARE.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/HARDWARE.md) -- every board's pins
  and parts, with sources.
- [docs/DEVICES.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/DEVICES.md),
  [docs/REMOTE.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/REMOTE.md),
  [docs/LORA.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/LORA.md),
  [docs/BROADCAST.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/BROADCAST.md),
  [docs/TAB5.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/TAB5.md),
  [firmware/box3/README.md](https://github.com/CodeMusic/daemons-companion/blob/main/firmware/box3/README.md) -- the
  designs behind these pages.
- [TODO.md](https://github.com/CodeMusic/daemons-companion/blob/main/TODO.md) -- the work, decided and not done. The
  `C-` numbers on these pages are its tickets.

**Nothing of Nintendo's is in this repository.** The daemon art it shows is DAEMONS' own, and it reads and writes a
DAEMONS save without any of the game's code. Every in-game and on-screen word is still a draft.
