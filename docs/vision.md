# Vision -- daemons-companion

*The high-level picture: what this is for, what it should feel like, and the few technical choices that keep it
that way. The detail -- how each piece is built, and every open question -- is [PLAN.md](PLAN.md).*

## A small life that helps you live yours

You carry a daemon from your game of **DAEMONS** on a little device. It needs you: you **feed** it, **train** it,
spend time with it. And it helps you: you tell it what you want to get done, and it turns that into **one next step**
and walks you through the day. **As you get things done, it thrives.** What you do shows in it.

It is a goal companion more than a pet or a planner -- the daemon is the reason you look at it, and the step is the
reason it is there. It grew from RoverRadio, a Rover on a handheld that nudged you through your tickets; and from the
tamagotchis that taught a generation to look after something small.

## What it feels like

- **One thing at a time.** The device shows today's next step, never the whole list. Big goals are broken down for
  you until every step is small enough to start now.
- **The day has a character.** Each weekday has its colour, its musical note, its virtue and its saying ("charity
  cures greed"), and the nudges lean that way. It is the same week the game keeps.
- **Gentle, never guilt.** A missed day makes the daemon tired, not ruined. Coming back is always welcome.
- **The game's world, all the way through.** The same names, the same art, the same INDEX: every daemon on the device
  carries its INDEX entry, in its own edition's voice. The app is themed like the game, so it feels like part of it.
- **Two minds, then one.** The AI that breaks your goals down thinks twice -- once logically, once by association --
  and then once more to hold both, which is Musai's shape and the shape of the game's two editions.

## The daemon's life

A daemon on the device has a state, and every part of it comes from something real:

- **how it is fed and trained**, and how you treat it;
- **its friendship**, which grows with the steps you finish and the others it meets;
- **the hour** -- it is tired at night;
- **the season** -- and the seasons are the game's: **CONTENT keeps the northern year** (winter from December 21 to
  March 21), **CONTEXT the southern** (summer then), so a daemon lives in its own edition's hemisphere.

## Between the game and the device

- **Sending**: in the game, a daemon in your party has an option to go to your device. The game saves and tells you
  to open your save in the app; the app checks the daemon is in your party, takes it, and marks it **away**.
- **While it is away** it stays in your game, **washed out**, so you always know where it is. It cannot battle, be
  traded or be released -- but it can go into the PORT and come back out, so you can still play with six.
- **Coming home** works the same way in reverse, with the daemon in your party, and it comes home with the friendship
  it built.

## Meeting others

The device has radio. **Pass someone else carrying one, and your INDEX sees their daemon** -- a "seen" that lands
in your game the next time you sync -- and the meeting grows your daemon's friendship.

## Later, by design

- **The LoRa epic**: every unit a node in a mesh, and the daemons on them talking to each other.
- **Trading and battling** between devices -- worth doing, and complicated, because a trade means editing two saves
  and returning means more. Kept for when the core is right.
- **Many users**, accounts, hosting. Today it runs on your own machine for you.

## The few technical choices

- **Local first.** Your goals, your daemon and your save stay on your machine; a local server, an app you run
  yourself (Expo: a site now, an iOS app from the same code).
- **The save is sacred.** One careful writer edits it, only when the game is closed, only the newer of its two copies,
  checksums recomputed, a backup every time. A daemon is known by its personality value and its trainer ID, never by
  its slot.
- **One world, exported once.** Names, entries, art, the week and the virtues come from DAEMONS by a tool, never typed
  twice.
- **Devices are thin.** They show and they tick; the server thinks. ESP32-S3 (RoverRadio's line) and Pi Zero
  (RoverCub's), speaking one small protocol.
- **Nothing of Nintendo's.** DAEMONS' own art, and a save read and written without any of the game's code.
