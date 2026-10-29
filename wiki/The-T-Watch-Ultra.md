# The T-Watch Ultra

**LilyGO's T-Watch Ultra is the companion's biggest watch**, and the board that does the most for a daemon: it knows
when you sleep and when you walk, where you went, and which card you held to it (C-173). Build `t-watch-ultra`;
flash it as any board ([Flashing and linking](Flashing-and-linking)).

*Where it stands*: it runs on the watch -- the screen, the touch, the motion sensor's firmware and THE SUBTLE LAYER's
sense have been seen on the glass. Most of what is below was built on 2026-10-28 and is still being tried on the
wrist; each row says so. Every on-screen word is DRAFT.

## What is in it

An ESP32-S3 (16 MB flash, 8 MB PSRAM); a 2.06" **CO5300 AMOLED**, 410x502, with touch; the crown; an **AXP2101** power
chip and an 1100 mAh cell; a **BHI260AP** motion sensor; a **MIA-M10Q** GNSS; an **ST25R3916** NFC reader; a
**DRV2605** haptic motor; a speaker and a microphone; an RTC; an **SX1262** LoRa radio (ours at 868 MHz); and a microSD
slot. Every pin, with sources: [docs/HARDWARE.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/HARDWARE.md).

## The face

The Ultra draws the T-Watch S3's faces and pages at 1.6x, inside its rounded corners, so everything on
[the T-Watch S3](Boards#the-t-watch-s3) works here: the DAEMON, CLOCK and VIRTUE faces, CARE, TALK, ROUTINES and the
2x2 launcher grids.

**Under the face, a strip** (C-206): one heads-up line -- **A DREAM IS WAITING** until it is read, else last night's
sleep for twelve hours, else what the wrist is doing and the day's steps -- and **three quick buttons**. You choose
them in the app (PLACES, the watch's settings, QUICK BUTTONS UNDER THE FACE) from CARE, TALK, MUSIC, HOURS, CASINO,
ROUTINES, DREAM and the INDEX.

Three more faces are drafts, in ITS FACE on the watch's page, to try before any is kept (C-206): TOGETHER (the day's
rings), ORBIT (the hour going round the daemon) and SUSPEND (dark, for the night). Built, not yet on the wrist.

**In a routine that reads taps and swipes** -- HOURS, BOOKS, THE INDEX, a meeting, TOUCH and the tags -- a hold or the
crown leaves it; a tap or a swipe is the routine's own.

## What it does for a daemon

| | | state |
|---|---|---|
| **steps and activity** (C-201) | steps, kept across restarts, a ride in a car left out; walking, running and cycling recognised, and the daemon answers each; **lift the wrist** to wake the screen; **shake** to wake the daemon or pull the CASINO's lever; **double tap** for CARE | the sensor's firmware loads on the watch; the rest built |
| **sleep and dreams** (C-200) | the night felt by its stillness, the dream in the morning -- [Nights and dreams](Nights-and-dreams) | built |
| **HOURS** (C-205) | WAKE ME (GENTLE wakes you at the first stir), STOPWATCH, COUNTDOWN, in the daemon's keeping. An alarm rings until a tap; a swipe is five more minutes, three times at most; left unanswered five minutes, it gives up | built |
| **walks** (C-174) | a fix every 30 s on a walk and every 15 minutes otherwise, the GNSS off between; the **distance walked** beside the steps; the weather where the watch is, rather than a city typed in; in the app, **WHERE IT IS** on the watch's page -- the last fix, Open in Maps, today's walk sketched, and **FIND IT**, which makes the watch say HERE and sound until it has a fix. FIND IT needs the companion in reach: it is never kept to send later. The fixes stay on your companion and are never public | built |
| **cards** (C-176) | TOUCHSTONE and THE CARD on its NFC reader: put your daemon on a card, take the one it holds, or swap. **TEACH A TAG** teaches a tag any routine the watch has, and **TAP A TAG** runs it ([Boards](Boards#routines)) | built |
| **TOUCH** (C-176) | in TOUCHSTONE: for half a minute the watch is a tag one moment and a reader the next. **Held to your iPhone**, the phone opens the app on PLACES and links with this watch over Bluetooth. **Held to another companion** -- another Ultra on TOUCH, or a board's READ MY TAG -- the two daemons meet, closer: each is told, each bond grows a little, and the other's daemon is shown | built, not yet tried by hand; whether iOS opens the watch's link while the app is in the background is still to be seen |
| **haptics** (C-176) | a tap for a care, a step, a milestone, a goal, a CASINO win, a harp string -- quiet when the sound is off. The T-Watch S3 has them too | built |
| **the instrument** (C-202) | your game's HARP or FLUTE by touch: strings plucked, holes held and blown, with no lag; the octave at the foot of the screen, and **SMART** to choose it for you; a song played right comes back as an ECHO, as in the game | built |
| **BOOKS** (C-208) | THE SUBTLE LAYER, THE GUIDE and the NOTEBOOK, each once your save holds it; a page a swipe, and **LISTEN** reads it aloud | built |
| **THE INDEX** (C-199) | first in BOOKS: every daemon you have met, how many seen and bound, and each one's picture, kind and entry, with **LISTEN**. Each is kept on the card as it is read, and all of them with KEEP ON THE CARD, so the INDEX opens **FROM THE CARD** away from any network | built; flashed, no card in it yet |
| **the SD card** (C-199) | BOOKS and THE INDEX kept as they are read, or all at once (**KEEP ON THE CARD**), and opened **FROM THE CARD** away from any network; a reading heard once kept and played from the card after, anywhere; walks and nights the full outbox cannot hold wait on the card and go back as there is room; a meeting's parts and a voice note recorded away kept until sent | built; flashed, no card in it yet |
| **meetings** (C-212) | **RECORD A MEETING**: half-minute parts onto the card and to the companion as each finishes, RECORDING in red the whole time. The hub's AI hears each part as it comes and writes it up -- a summary, take-aways and action items -- and the daemon has a day-dream about it; **LAST MEETING** shows them, and **SEND KEPT**, at home, sends what was recorded away. A slow card or upload never costs the half-minute being recorded, and a part that could be neither sent nor kept is told lost, so the rest is still written up. In the app, **MEETINGS** in DAEMON, by day | built, not yet on the wrist |
| **VOICE NOTE** (C-199) | in HOURS: up to a minute said to the watch, a tap to end it. At home it goes to the companion at once; away it waits on the card for **SEND KEPT**. The hub's AI hears it, and the app keeps its words under **VOICE NOTES**, in MEETINGS: **MAKE IT A GOAL**, TRY AGAIN or FORGET IT | built, not yet tried on the wrist |
| **its mouth** (C-213) | on TALK it mouths its words, on the beat of its own voice or for as long as the phone speaks them; while it listens it stands large with its ears up | flashed, not yet heard |
| **ASK THE GUIDE** (C-209) | once THE GUIDE is found, ask it a question by voice from BOOKS ([The hub and its AI](The-hub-and-its-AI)) | built |
| **ASK THE SUBTLE LAYER, TWO VOICES, TODAY'S QUESTION** (C-229, C-230) | beside ASK THE GUIDE in BOOKS, once your save holds THE SUBTLE LAYER, asked aloud: a line from its nearest page and a question back; TWO VOICES' asking voice; the book's question for the day, a tap and eight seconds to answer it, kept in its journal ([Your game on the companion](Your-game-on-the-companion)) | built, not yet on the wrist (both watches) |
| **THE SUBTLE LAYER's cards** (C-232) | THE DAY'S CARD, DRAW A CARD and PAST PRESENT FUTURE in BOOKS -- each card drawn as the app draws its face, with no voice needed | built, not yet on the wrist (both watches) |
| **THE SUBTLE LAYER's sense** (C-203) | once your save holds the book: now and then the daemon notices something first, a read, a lean at the reels ([Your game on the companion](Your-game-on-the-companion)) | **seen on the wrist** |
| **who answers first** (C-211) | the hub's AI board or n8n, chosen on the watch too | built |
| **LoRa** | MESH, as the other LoRa boards; and the **relay** (C-175): out of reach of Wi-Fi and the phone, the watch's fixes and nights go on the air, and one of your own boards in reach of home tells the companion for it ([Meeting others nearby](Meeting-others-nearby#the-relay-a-watch-out-of-reach)) | built, not yet on the air |

Down the cable, `MOTION?`, `GPS?`, `ALARM?`, `SUBTLE?` and `SD?` report each part's state.

**A meeting or a voice note is private.** The companion takes one only from a board with its own key, from a paired
phone carrying it, or from the computer it runs on. Link the watch by its cable at home once, and it is given its key.

## Coming

- **Meetings and voice notes heard and written by n8n too**, not only by the hub's module; a phone hosting alone has
  neither yet (C-212).
- **Its LoRa heard by the hub itself**, once the hub has its LoRa hat, and every other LoRa chip and band (C-175).
- **The CASINO, enhanced** for the tall screen (C-198, to ask).
- **Its voice with the phone alone**, away from the hub (C-197).
- **DAEMONS on the wrist** (C-214, a spike): the classic Game Boy build in a GB emulator, from the SD card, at 2.5x,
  with a touch D-pad and A/B. Not the GBA build: the ESP32-S3 cannot run a GBA emulator fast enough, and its ROM does
  not fit in memory. The ROM is never in this repository -- you build it and put it on your own card.
