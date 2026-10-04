# Field guide: the companion app

A path to walk through everything new, in order. Each step says **what to do** and **what you should see**. Tell me
wherever it does not match.

Prereqs: Node 24, and a **copy** of a DAEMONS save (never your only copy). An emulator save (the `.sav` beside the
ROM) is easiest.

---

## 1. Start it

```sh
cd daemons-companion
./bindCompanion.sh
```

- **See:** the site opens at <http://localhost:8081>, five tabs across the top: **TODAY · GOALS · DAEMON · PROFILE ·
  SETTINGS**. The whole page wears the day's colour (Sunday is a deep red).

## 2. Set your save (this is the part that confused you)

Go to **SETTINGS**.

- **See:** "YOUR DAEMONS SAVE" with a path and where it came from. If it says **(from config.json)**, that is why
  SYNC "just worked" earlier — a path was already set in `server/config.json`. If it is unset, it says so.
- **Do:** click **Choose a save…** and pick your save copy (a native file dialog on your Mac). Or paste the path in
  **OR TYPE THE PATH** and click Save.
- **Do:** click **Open the folder** — Finder opens at the save's folder, so you always know where to put one.
- **Tip for the emulator:** point the emulator and the app at the **same `.sav` file**, and the round trip below just
  works. For a cartridge, pull the save to your computer, set that path, and re-pull after you play.

**Learn-the-system check:** in SETTINGS, type a path that does not exist and Save; go to **DAEMON** and click **SYNC**.

- **See:** a card — "FIRST, YOUR SAVE" — explaining what a save is, with **Choose a save…** right there. (Set your
  real save back afterwards.)

## 3. The day, and a goal

- **TODAY:** the day's colour, note and virtue; the season; **THE ONE THING** — the single next step. Click **Done**
  and it advances.
- **GOALS:** type a goal, click **Break it down**. (The AI is off by default, so you get a marked example plan —
  that's expected.) Tick steps off.

## 4. Your party, and the PROFILE

- **DAEMON:** your party, drawn as the game draws them (type colours, streak markers). Click one to read its INDEX
  entry in your edition's voice.
- **PROFILE:** your trainer name and ID No., play time, INDEX counts, the eight MARKS, DIPLOMA, OPUS, and where you
  last saved. It also says whether this is **your companion's game** (the first save you SYNC becomes it).

## 5. The AWAY round trip (the heart of it)

You need the game and the app pointed at the same save file; **close the game before each SYNC** (a running emulator
writes its own copy back).

1. **First SYNC links the save.** In the app, **DAEMON → SYNC**.
   - **See:** "Linked. Your game now offers SEND…" (the first time).
2. **In the game**, open a party daemon's menu.
   - **See:** a **SEND** option (it only appears once the save is linked). Choose it; the game saves.
3. **Close the game. SYNC in the app.**
   - **See:** "<name> is with your device now." In the app's party, that daemon is **washed out / ON YOUR DEVICE**.
4. **Bring it home:** in the game, the same daemon's menu now offers **CALL HOME**. Choose it, save, close, **SYNC**.
   - **See:** "<name> is home."
5. **Only a well daemon goes:** hurt or poison a daemon (a battle will do), then try to SEND it.
   - **See (in game):** "Restore <name> before it goes: full health, and nothing ailing it." Heal it and SEND works.
6. **It is not here, so nothing reaches it:** with a daemon AWAY, try to use an item on it from the bag, choose
   ITEM in its party menu, or GIVE it something in the PORT.
   - **See (in game):** "<name> is AWAY on your device." in the party and the bag, "<name> is AWAY." in the PORT --
     and the item stays in your bag.
7. **What it holds goes with it:** give a daemon something to hold *before* you SEND it, then SYNC.
   - **See (in the app, DAEMON):** "holding <item>" under it; the handheld's DAEMON page says the same.
8. **One at a time:** with one daemon AWAY, try to SEND a second.
   - **See (in game):** "One at a time: <name> is with your device now."
9. **The emergency way (no app):** with a daemon AWAY, choose **CALL HOME** and answer **NO**.
   - **See:** a warning, then "Bring <name> home without the app?" — yes brings it home; the game tells you to SYNC
     before sending another. Next **SYNC** settles it.
10. **Married to one save:** SYNC a *different* game's save.
   - **See:** "This save belongs to a different game…"; PROFILE says whose game the companion carries for. It is shown
     but never written.

## 6. The handheld (optional, if the board is set up)

See [`../firmware/esp32/FLASHING.md`](../firmware/esp32/FLASHING.md). In short, with the board plugged in:

```sh
./updateCompanion.sh --link   # flash the board, then link it (or ./linkCompanion.sh alone, to link without flashing)
```

- **See:** the day's band at the top with **USB** in the corner; **TODAY** shows the one step.
- **See:** the band at the top in the day's own colour (Sunday red, Monday orange, ... Saturday violet), and the
  **ring of lights** glowing it, dimly. Leave the board a minute: the ring goes out. Touch anything: it comes back.
- **Turn** the dial: TODAY, DAEMON, **ROUTINES**. **See:** a white light runs once round the ring -- clockwise when you
  turn right, anticlockwise when you turn left. **Press:** the ring flashes white. **Top button:** it goes dark a moment.
- **Home:** **See:** the daemon you carry, large, gently moving. **Hear:** turning right rises, left falls; a press is
  one note -- all in today's key.
- **Sleep:** hold the top button and press the front one, or leave it two minutes. **See:** screen and ring go dark.
  Turn the dial. **See and hear:** it wakes at home, to the first notes of the title theme; the turn did nothing else.
- **Care:** at home, **see** its mood, meals and water; **press** for CARE and FEED it. **See and hear:** it hops, a
  glad little phrase, "Eaten.", and fed goes up by one. The site's DAEMON tab shows the same.
- **A routine:** run any. **Hear and see:** its own short tune, the ring dancing to it, before it runs.
- **DAEMON:** **See:** the daemon you carry, **drawn as the game draws it** (its streaks too), twice its size, with its
  level, friendship and what it holds. **Press:** its **INDEX entry**, in your edition's voice. **Top button:** back.
- **Press** on ROUTINES, then **turn** through FLARE (IR), WHISPER (Bluetooth), TOUCHSTONE (NFC), LONGWAVE
  (Sub-GHz), UPLINK (Wi-Fi). **Press** to open one; the **top button** goes back.
- **Try each radio** (choose it, press to run, press again to run again; the top button gives up a wait):
  - **TOUCHSTONE -> READ MY TAG:** hold your NTAG or MIFARE card to the board. **See:** its kind and its ID.
  - **FLARE -> LEARN MY REMOTE:** point your TV remote at the board, press POWER. **See:** "Learned it: <protocol>".
    Then **SEND TO MY TV** with the board's end toward the TV. **See:** the TV turns off (or on).
  - **FLARE -> SONY TV POWER** (a Sony TV, no remote needed): the board's end toward the TV, a few steps away.
    **See:** the TV turns off (or on).
  - **WHISPER -> OPEN TO MY PHONE:** on your phone, open nRF Connect (free), connect to **DAEMONS companion**.
    **See:** "Your phone is here"; on the phone, the TX line shows "Hello from your daemon." Write a word to the RX
    line as text. **See:** "Both ways work", and your word.
  - **UPLINK -> NETWORKS IN RANGE:** **See:** the Wi-Fi networks around you, by name and strength.
  - **LONGWAVE** opens on "No routines yet" -- tried with the board in hand first (PLAN §10).
  - **See (in the bridge's window), after each:** "the device ran <TYPE>/<ROUTINE>" -- told to the server as tending
    your daemon.

## What to tell me

- Anywhere the screen did not match "See".
- Wording that feels off (it is all draft).
- Anything that felt confusing to reach.
