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

- **See:** the site opens at <http://localhost:8081>, the tabs across the top: **TODAY · GOALS · DAEMON · INDEX ·
  DEVICE · PROFILE · SETTINGS**. The whole page wears the day's colour (Sunday is a deep red).

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
- **GOALS:** set **one goal** (a few words -- the count shows the limit). Then **+** adds its rows: a **step**, or a
  **milestone** that holds its own steps (Clean the house: BATHROOM -- mop the floor, scrub the toilet ...).
  **See:** each entry's letters counted against 40. Tap a step to do it, tap again to undo it.
- **WALKING** (on GOALS): 10,000 steps a day unless you choose; type today's steps until the phone counts them.
  **See:** reaching it says your daemon is glad of the walk.

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

## 6. A handheld (optional, if a board is set up)

See [`../firmware/esp32/FLASHING.md`](../firmware/esp32/FLASHING.md). In short, with the board plugged in:

```sh
./updateCompanion.sh --link   # flash the board, then link it (or ./linkCompanion.sh alone, to link without flashing)
```

- **See:** the script names each board it finds (`t-embed-cc1101`, `t-embed`, `t-embed-si4732`, `t-watch-s3`) and
  flashes the right build. With several plugged in it asks which. **If the screen stays dark after flashing, press
  RST once** -- the board waited in its bootloader.

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
- **A step, on the board:** turn to TODAY. **See:** the step, its milestone above it ("BATHROOM 1/3"). **Press.**
  **Hear:** five notes of your daemon's own (generated from its number and the day). **See:** the next step at once,
  and "done: ... top button: undo" at the foot. **Top button** within 15 seconds: **hear** the five notes backwards,
  and the step is back. Finish a milestone: **seven notes and a rainbow**. Finish the goal: **a longer climb, and the
  ring blooming into colour.**
- **Grown on the device:** each step done is a meal and **one experience point** (limited leveling). Bring the daemon
  home in the game, SYNC. **See:** "PIP came home with 3 more experience." -- and in the game, its experience.
- **A routine:** run any. **Hear and see:** its own short tune, the ring dancing to it, before it runs.
- **DAEMON:** **See:** the daemon you carry, **drawn as the game draws it** (its streaks too), twice its size, with its
  level, friendship and what it holds. **Press:** its **INDEX entry**, in your edition's voice. **Top button:** back.
- **Press** on ROUTINES, then **turn** through FLARE (IR), WHISPER (Bluetooth), TOUCHSTONE (NFC), LONGWAVE
  (Sub-GHz), UPLINK (Wi-Fi). **Press** to open one; the **top button** goes back.
- **Try each radio** (choose it, press to run, press again to run again; the top button gives up a wait):
  - **TOUCHSTONE -> READ MY TAG:** hold your NTAG or MIFARE card to the board. **See:** its kind and its ID.
  - **FLARE -> TEACH A REMOTE:** point your remote at the board. **See:** "Point your remote at ARTSAI and press
    POWER -- ARTSAI is listening (1 of 3)"; then VOLUME UP, then VOLUME DOWN. **See:** "ARTSAI learned your remote".
    Then **POWER**, **VOLUME UP**, **VOLUME DOWN** send from it; **CHOOSE A REMOTE** picks among those it knows.
  - **No remote?** On the site's DEVICE tab, ITS REMOTES: choose your TV's brand, **Try its POWER**, and if the TV
    answers, **It worked: keep this remote** -- its volume buttons come with it. (Sony is kept already, as SONY.)
  - **WHISPER -> OPEN TO MY PHONE:** on your phone, open nRF Connect (free), connect to **DAEMONS companion**.
    **See:** "Your phone is here"; on the phone, the TX line shows "Hello from your daemon." Write a word to the RX
    line as text. **See:** "Both ways work", and your word.
  - **UPLINK -> NETWORKS IN RANGE:** **See:** "ARTSAI hears N networks", those it knows marked *.
  - **UPLINK -> TEACH A NETWORK:** choose your network, spell its password on the wheel, OK. **See:** "ARTSAI learned
    <name>, and joins it whenever it is near"; the corner says WIFI. The site's ITS NETWORKS lists what it knows.
  - Routines are the daemon's: with none on the board, ROUTINES says to send one from the game.
  - **LONGWAVE** opens on "No routines yet" -- tried with the board in hand first (PLAN §10).
  - **See (in the bridge's window), after each:** "the device ran <TYPE>/<ROUTINE>" -- told to the server as tending
    your daemon.

## 7. The phone and the handheld together (C-55, C-57)

- **Pair once.** On the handheld: ROUTINES, WHISPER, **PAIR MY PHONE**. **See:** a six-digit code. On the phone, in
  the app's PROFILE, THE HANDHELD, ON THIS PHONE: **Pair the handheld**. iOS asks for a code: type the board's.
  **See:** on the board, "<daemon> knows your phone"; in the app, linked. A second pairing later asks for no code.
- **In a pocket.** Unplug the board's USB. **See:** the corner says **PHONE** instead of USB, and a step done on the
  board reaches the app. Lock the phone, or switch to another app: **it still arrives**. *Swipe the app away and iOS
  cuts it off; open it again and it reconnects.*
- **Forget.** WHISPER, **FORGET MY PHONES** undoes every pairing; the app's **Forget it** undoes its own.

## 8. Away from home (C-56)

*Set up once, on the computer: [`REMOTE.md`](REMOTE.md) (the n8n workflow, and the relay secret in SETTINGS).*

- On the computer, the site's SETTINGS, **AWAY FROM HOME**: your n8n webhook's address, **Save**, and the relay
  secret it shows goes into the workflow. **Open the app once on the home Wi-Fi**: it learns the address and keeps it.
- **Leave the Wi-Fi** (LTE). **See:** TODAY, GOALS and the DAEMON tab still load, the pictures too (C-59). The app
  says it is reaching home through the relay.
- **What it will not do from outside:** pair a new phone, or anything the computer keeps to itself. *A request with no
  key is turned away; so is pairing.*

## 9. Meeting others nearby (C-15)

*A meeting needs a second companion: someone else's board, or the app on someone else's phone.*

- SETTINGS, **MEET OTHERS NEARBY**: on (it is on for the board by default). The board and the phone each send one
  small beacon -- the species you carry, and a tag that changes every hour, nothing about you -- and listen a few
  seconds every three minutes.
- **With a second companion near:** **See:** on the next SYNC, its daemon in your INDEX as seen, and your daemon's
  friendship a little higher. A tag is met once an hour, never more.
- **Your own two** (your phone and your board) hear each other and are **never counted**; the DAEMON tab says they
  heard each other, which proves the radios.

## 10. THEATER MODE, and naming your remotes (C-58, C-59)

- ROUTINES, FLARE, **THEATER MODE**: the board becomes the remote. **Press** the front button: POWER. **Turn right**
  (clockwise): VOLUME UP; **left**: VOLUME DOWN. **Top button**: done. The head shows which remote it is using
  (**CHOOSE A REMOTE** picks it).
- **Rename a remote:** the site's or the app's DEVICE tab, ITS REMOTES, **Rename** beside it. **See:** the board's
  CHOOSE A REMOTE and THEATER MODE use the new name.

## 11. The DAY, and the battery (C-73, C-63)

- **Turn** past ROUTINES to the **DAY**. **See:** TODAY IS and the day's theme large (Wednesday: GROWTH), its virtue
  over its vice (DILIGENCE CURES SLOTH), its chakra and its note. **Press:** the day's note.
- **See:** a small battery in the top band, with its percent; a bolt while it charges, red when low and unplugged.
  At 15% the board says BATTERY LOW; at 5% it says CHARGE ME and sleeps -- **only the top button wakes it**.

## 12. GAME ROUTINES (C-68)

- ROUTINES, then **PARTY** (on the CC1101 it is a type beside FLARE and UPLINK; on a board with no radios of its own,
  ROUTINES opens it first). **See:** WHOSE ROUTINE? and your party, each with its level and types.
- **Press** on one. **See:** its four routines, each with a swatch in its streak's colour and its type.
- **Press** on a routine. **See:** "<daemon> used <routine>!" **Hear:** its own short phrase (the same every time for
  that routine). **See:** the ring dancing in that colour.

## 13. Talk to your daemon (C-66, C-65)

Needs the server's `talk` setting, your n8n and the speech-to-text server (README, Talk to your daemon). The board
talks over **Wi-Fi**, so it must have joined a network.

- On the CC1101, at home: **hold the dial** half a second. **See:** Listening..., the ring glimmering white. Say
  something short, and **let go**. **See:** Thinking..., then what it heard in quotes and its answer. **Hear:** the
  answer in the INDEX voice. **Top button** stops the voice.
- DAEMON, press for CARE, choose its INDEX entry, **press**. **Hear:** the entry read aloud.
- On the phone (a new build): the DAEMON tab, **HOLD TO TALK** while a daemon is on your device; an entry's
  **Read aloud**.

## 14. The T-Watch S3 (C-71)

- `./updateCompanion.sh --board t-watch-s3` the first time. **See:** the face -- the time, the day's theme, its virtue
  over its vice, chakra and note, today's steps, the battery and a TALK button, ringed in the day's colour.
- **Swipe** left and right through the pages; **tap** to press; **hold** to go back. The **crown** wakes it or goes
  back; held, it sleeps. **Tell me** if a swipe goes the wrong way -- the touch's direction is a guess.

## 15. WI-FI MOTION (C-70)

- ROUTINES, UPLINK, **WI-FI MOTION**, with the board on your Wi-Fi. **See:** five seconds of "Learning the room" --
  stand back and keep still. Then walk between the board and your router. **See:** SOMETHING MOVED and the bars rise;
  the ring pulses. Stand still: they fall. **Top button** stops it; it ends by itself after 45 seconds and says how much
  of the time something moved.

## What to tell me

- Anywhere the screen did not match "See".
- Wording that feels off (it is all draft).
- Anything that felt confusing to reach.
