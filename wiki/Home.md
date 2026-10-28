# 🦊 DAEMONS companion

*CRYSTAL CLEAR here. Your daemon does not have to stay in the game -- SEND it AWAY, and something out here can host it.
I keep my notes on how in these pages. Start with your phone; it is the easiest host there is.*

The companion lets you bring a daemon out of your game of [DAEMONS](https://github.com/CodeMusic/DAEMONS) and into
the real world: you SEND it from your party in the game, and a device **hosts** it -- your phone and its home-screen
widget first, and, if you like, a handheld board too. You give it a drink, feed it, train it, put it to bed and talk
with it, and it helps you with one goal, one next step at a time; as you get things done, it thrives and takes what it
learned home to the game. Any device can host a daemon, and with more than one device each can host a different daemon
from your party. It also reads your save, so you as the game draws you, your NOTEBOOK and what you have been taught come
with you -- and its CASINO plays with your game's money.

**The game itself has a manual**:
[the DAEMONS player's manual](https://github.com/CodeMusic/DAEMONS/blob/main/docs/DAEMONS-manual.pdf), a PDF of 47
pages -- every way to play, getting started, the world, daemons, battles and the seventeen types, BENCHMARKS, MARKS and
ROOTS, the INDEX, the NOTEBOOK, CALLOW SCHOOL, the books, PLAY, the GAME CORNER and the CASINO, the companion, help and
a glossary.

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

## Or: the one app

**The game and the companion in one app** (C-186): on an iPhone or an iPad, bring your own FireRed or LeafGreen, and
the app makes DAEMONS from it on the device, plays it, and shares its one save with the companion. On an iPad on its
side, the game and the companion sit side by side. In a browser, the [DAEMONS
playground](https://github.com/CodeMusic/daemons-playground) does the same; the iPad app runs on an Apple Silicon Mac
too, and TestFlight is to come. Internal and in testing for now -- [The one app](The-one-app).

## Every page

| page | what it covers |
|---|---|
| [The one app](The-one-app) | the game, the companion and the books in one app: iPhone, iPad, the browser and the Mac; your own ROM patched on the device, one save and its mirror, the iPad side by side, THE ROAD AHEAD |
| [Host on your phone](Host-on-your-phone) | the happy path, step by step: the save, SEND and SYNC, the iPhone app, pairing, the widget -- and the phone on its own |
| [Running the companion](Running-the-companion) | `bindCompanion.sh`, the site and its six tabs, the server, its logs, keeping it running, Node 24 |
| [Your game on the companion](Your-game-on-the-companion) | TODAY's game, YOU (MARKS and ROOTS, the region maps, GROVES, GAME EVENTS, THE ROAD AHEAD), the LIBRARY (CALLOW SCHOOL, THE GUIDE, THE SUBTLE LAYER, the NOTEBOOK, the SONGBOOK, STREAM, READ ALOUD), the INDEX and NATIVE, SOUNDINGS, DREAMS, the CASINO's coins |
| [The CASINO](The-CASINO) | SLOTS on every board, the phone, the site and the Tab5: the reels, the coins, the day's odds and THE HOUSE, the dress and the holidays, the table and its cheers |
| [Nights and dreams](Nights-and-dreams) | the night a watch keeps, the daemon's dream, the journal, the dream written into your save for the game, how the week shows on the daemon, WAKE ME |
| [The hub and its AI](The-hub-and-its-AI) | the CoreMP135 as the companion's server and THE EXCHANGE; the AX630 AI board that talks, tells dreams, hears meetings and voice notes and answers as THE GUIDE; who answers first |
| [Boards](Boards) | the optional handhelds: every supported board, its controls, its pages, the T-Watch S3's faces, care, routines (GLOW, the CASINO, CHORUS, cards, tags taught a routine), sounds, battery, settings |
| [The T-Watch Ultra](The-T-Watch-Ultra) | the biggest watch: sleep, steps and walks, cards and TOUCH, haptics, HOURS, BOOKS, THE INDEX and its SD card, meetings and voice notes, the mesh relay, its mouth, the instrument, and what is coming -- DAEMONS on the wrist |
| [Flashing and linking](Flashing-and-linking) | `updateCompanion.sh`, `linkCompanion.sh` and `box3.sh`, checks down the cable, and what to do when a board looks dead |
| [Home Assistant and the BOX-3](Home-Assistant-and-the-BOX-3) | HOME in PLACES on the app, the site and the Tab5; the BOX-3 as the home's voice assistant with the daemon for a face; the daemon as Home Assistant's conversation agent |
| [Away from home](Away-from-home) | the relay through your own n8n, reading its executions, and keeping your computer reachable |
| [Feelings and expressions](Feelings-and-expressions) | how it feels, and how its face shows it on every host -- from its own sprite, in its den |
| [Talk to your daemon](Talk-to-your-daemon) | hold to talk, read aloud, and what it takes on your own machines |
| [Meeting others nearby](Meeting-others-nearby) | the Bluetooth beacon, a meeting by touch, broadcasts to every daemon, notifications, and LoRa's MESH on the boards that have it, with its relay |
| [Trading](Trading) | trading a daemon with another player through the hub's EXCHANGE: joining, TRADE IT and LEND IT, the swap at SYNC, loans, what keeps it fair |
| [Settings](Settings) | the save path and its backups, YOUR SAVES, `server/config.json`, every settings card, THE WEATHER, each device's own settings and its sound |
| [Server API](Server-API) | every route the server answers |
| [Troubleshooting](Troubleshooting) | the widget stuck looking, presses kept, pairing by name, a board that looks dead, a device with no sound, a silent Fire, a bridge waiting for its board, a phone build that fails |

## Elsewhere in the repository

- [README](https://github.com/CodeMusic/daemons-companion/blob/main/README.md) -- the companion in a page.
- [The DAEMONS player's manual](https://github.com/CodeMusic/DAEMONS/blob/main/docs/DAEMONS-manual.pdf) -- the
  game, for the player who holds it.
- [docs/FIELD-GUIDE.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/FIELD-GUIDE.md) -- a walk
  through everything, with what you should see at each step.
- [docs/HARDWARE.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/HARDWARE.md) -- every board's pins
  and parts, with sources.
- [docs/DEVICES.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/DEVICES.md),
  [docs/REMOTE.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/REMOTE.md),
  [docs/LORA.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/LORA.md),
  [docs/BROADCAST.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/BROADCAST.md),
  [docs/TAB5.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/TAB5.md),
  [firmware/box3/README.md](https://github.com/CodeMusic/daemons-companion/blob/main/firmware/box3/README.md),
  [docs/ONEAPP.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/ONEAPP.md),
  [docs/HUB.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/HUB.md),
  [docs/TRADING.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/TRADING.md) -- the designs behind
  these pages.
- [TODO.md](https://github.com/CodeMusic/daemons-companion/blob/main/TODO.md) -- the work, decided and not done. The
  `C-` numbers on these pages are its tickets.

**Nothing of Nintendo's is in this repository.** The daemon art it shows is DAEMONS' own, and it reads and writes a
DAEMONS save without any of the game's code. Every in-game and on-screen word is still a draft.
