# daemons-companion

**A goal companion that carries a daemon.** You carry a daemon from your game of
[**DAEMONS**](https://github.com/CodeMusic/DAEMONS) on a little device. You feed it, train it, spend time with it --
and it helps you: tell it what you want to get done, and it turns that into **one next step** and walks you through
the day. As you get things done, it thrives. Pass someone else carrying one, and your INDEX sees their daemon.

It is the successor to **RoverRadio** (in [CodeMusic/RoverByte](https://github.com/CodeMusic/RoverByte)) and
[**RoverCub**](https://github.com/CodeMusic/RoverCub), joined to the game.

> **Early days.** This repo holds the vision, the plan and the first foundations. Nothing runs yet.

## Read first

- [**docs/vision.md**](docs/vision.md) -- what it is for and what it should feel like.
- [**docs/PLAN.md**](docs/PLAN.md) -- how each piece is built, and the questions still open.
- [**TODO.md**](TODO.md) -- the work, decided and not done.

## What is in here

| | | |
|---|---|---|
| `app/` | **the app** -- Expo / React Native: a site you run yourself first, an iPhone and iPad app from the same code later | not started |
| `server/` | **the local server** -- Node + TypeScript: your goals, the AI that breaks them down, the devices' sync, and the DAEMONS save reader | not started |
| `firmware/esp32/` | **the handheld** -- ESP32-S3, PlatformIO + Arduino, grown from RoverCodeBase | not started |
| `firmware/pizero/` | **the Pi Zero device** -- Python, grown from RoverCub and RoverOSpi | not started |

**Local first, one person.** Everything runs on your own machine; accounts, many users and hosting come later.

## The DAEMONS family

| | |
|---|---|
| [**CodeMusic/DAEMONS**](https://github.com/CodeMusic/DAEMONS) | **the game** -- its design bible, its tools, and patches for your own cartridge |
| [CodeMusic/pokefirered-daemons](https://github.com/CodeMusic/pokefirered-daemons) | the game's engine |
| [CodeMusic/gpt-play-pokemon-firered-daemons](https://github.com/CodeMusic/gpt-play-pokemon-firered-daemons) | the harness that lets a model play it |
| **CodeMusic/daemons-companion** | this: the goal companion |

**Nothing of Nintendo's is in here.** The daemon art it shows is DAEMONS' own -- every sprite in
`DAEMONS/gfx/daemons/` was drawn for the project -- and it reads and writes a DAEMONS save without any of the game's
code.
