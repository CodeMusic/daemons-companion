# The T-Glass

**LilyGO's T-Glass puts one small screen in front of one eye** (C-262). The companion uses it for what is worth a
glance: the time, your daemon, the next step, a note you want in view, the morning's dream. It shows **one thing at a
time**, and you choose it from the app. Build `t-glass`; flash it as any board ([Flashing and linking](Flashing-and-linking)).

*Where it stands*: built and compiling; **not yet run on the glasses**. Which way the picture lands, how firmly the
button wants a touch, the motor and the battery reading are still to be seen. Every word on the glass and in the app's
GLASSES is DRAFT.

## What is in it

An ESP32-S3 with **4 MB of flash and 2 MB of PSRAM** -- the smallest board the companion runs on; a 1.1" **JD9613
AMOLED**, 126x294, seen through a **prism that shows a 126-pixel square** of it; **one touch button** on the side and
the board's **BOOT** button; a **vibration motor**; a microphone (not used yet); a **BHI260AP** motion sensor (not used
yet); a clock chip; Wi-Fi and Bluetooth; USB-C. **No speaker.** Every pin, with sources:
[docs/HARDWARE.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/HARDWARE.md).

The AMOLED lights only what it draws, and black is the prism's clear: everything on the glass is light on black, and
the rest of the lens stays see-through.

## Setting it up

1. **Charge it** on its USB-C cable.
2. **Flash it** from the computer the companion runs on, the glasses on their cable:
   `./updateCompanion.sh --board t-glass`. If the port does not answer, hold BOOT while plugging the cable in.
3. **Fit the picture to the prism** (once). The V1 and V2 glasses reflect it differently, so it is set by eye, down the
   cable, with the glasses on: `GLASS?` reads what is set; `GLASS TURN 0`..`3` turns it; `GLASS MIRROR 1` flips it;
   `GLASS ROW n` moves the square along the panel (168, the panel's last 126 rows, is where it starts); `GLASS BRIGHT n`
   (10-255) sets how bright. What you set is kept on the glasses.
4. **Pair your phone.** Hold the touch button **three seconds**: the glasses buzz and show a six-digit code. In the app,
   pair the handheld; when iOS asks, type the code. **Paired** shows on the glass; after that the phone carries the
   glasses' link wherever both go, at home or away. A tap gives up; after two minutes it gives up by itself.
5. **Send it a daemon**, as to any board: from your game's party, then SYNC ([Boards](Boards)).

**Through the phone, not Wi-Fi.** The glasses can join Wi-Fi as any board does, but LilyGO measures 90-230 mA with
Wi-Fi on, which a cell this small spends in an hour or two. Over Bluetooth to the phone, dark between glances, they last
far longer. LilyGO does not say how large the cell is, so there are no hours to promise yet; the charge shows on HOME,
and on the glasses' row in PLACES.

## What it shows

| screen | what is on the glass |
|---|---|
| **HOME** | the time, the battery, your daemon, and today's next step -- or **A dream is waiting** in the morning |
| **a NOTE** | one of your notes: its first line as the title, then five lines a page |
| **DAEMON** | your daemon, large, its name and how it is in a word |
| **DARK** | nothing: the panel turned down, the lens clear |

Over whichever is showing:

- **A care's reaction** -- tend it from the app and the daemon is shown with what it says, for eight seconds; then the
  screen you had comes back. A note stays shown.
- **The morning's dream** -- when the daemon has dreamt, the glasses wake with it, five lines a page. **A tap turns the
  page**, and past the last, **good morning** puts it away. Missed, HOME says **A dream is waiting. Tap.** for the rest
  of the day ([Nights and dreams](Nights-and-dreams)).

**Something new sent buzzes the glasses once**, so you know to look.

## The button

| | |
|---|---|
| **a tap** | turns a note's or a dream's page; on DARK, goes HOME; on HOME with a dream waiting, opens it. Asleep, a tap only wakes the glasses |
| **two taps** | DARK |
| **a hold** | HOME (it buzzes) |
| **held on, three seconds** | PAIR MY PHONE: the code |

BOOT does what a tap does, where a finger can reach it. Left alone, the glasses sleep as any board does (how soon is
set in the app, on the glasses' own settings); a tap, or anything new sent, wakes them.

## GLASSES, in the app

In **PLACES**, on the app and the site, once the companion has heard from a T-Glass:

- **What the glasses should show**: a preview, drawn from the same state the glasses read.
- **SHOW**: HOME, DAEMON or DARK.
- **CARE**: Drink, Feed and Train -- tending the daemon as the app's own CARE does, its reaction on the glasses and here.
- **NOTES**: **NEW NOTE** -- the first line, tinted, is the title, so renaming a note is editing that line; Return in
  it moves to the rest. **Tap a note to send it.** Its row stays selected while, and only while, the glasses show it --
  leave the app and come back, it is still selected; send anything else, from the app or the glasses' own button, and
  it is not. **Edit** changes it (the glasses take the new words at once if it is showing); **Remove** asks for a
  second tap.

## Checks down the cable

| line | answers |
|---|---|
| `GLASS?` | the turn, mirror, row and brightness set, the touch button's untouched reading, and what is showing |
| `GLASS TURN n`, `MIRROR n`, `ROW n`, `BRIGHT n` | sets one, kept |
| `GLASS TAP`, `GLASS TWICE`, `GLASS HOLD` | presses the button from the computer |
| `GLASS PAIR` | the three-second hold: the pairing code |
| `SHOT` | the 126 square as drawn, for `shot.py` |

## When something is wrong

- **The picture is upside down, mirrored, or cut off** -- set it by eye with `GLASS TURN`, `MIRROR` and `ROW` (step 3).
- **The button does nothing, or presses itself** -- `GLASS?` shows its untouched reading; a touch should read well
  above it. Note what it reads, touched and not, in the companion's issues.
- **The glasses never change when you tap a note** -- they hear the app through the phone: the phone must be paired
  (step 4) and near, and the app open or opened lately. A board on Wi-Fi asks every minute instead.
- **The glasses look dead** -- [Flashing and linking](Flashing-and-linking) has what to do.

## Not yet

- **Nods and tilts** as a second button -- the motion sensor needs its own firmware loaded first, as the T-Watch
  Ultra's did.
- **A voice note** through its microphone.
- **CUE CARDS** -- a note as a prompter, a page a tap or a nod -- and **FOCUS**, a countdown that buzzes.
