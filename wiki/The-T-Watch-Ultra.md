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

## What it does for a daemon

| | | state |
|---|---|---|
| **steps and activity** (C-201) | steps, kept across restarts, a ride in a car left out; walking, running and cycling recognised, and the daemon answers each; **lift the wrist** to wake the screen; **shake** to wake the daemon or pull the CASINO's lever; **double tap** for CARE | the sensor's firmware loads on the watch; the rest built |
| **sleep and dreams** (C-200) | the night felt by its stillness, the dream in the morning -- [Nights and dreams](Nights-and-dreams) | built |
| **HOURS** (C-205) | WAKE ME (GENTLE wakes you at the first stir), STOPWATCH, COUNTDOWN, in the daemon's keeping | built |
| **walks** (C-174) | a fix every 30 s on a walk and every 15 minutes otherwise, the GNSS off between; the **distance walked** beside the steps; the weather where the watch is, rather than a city typed in; in the app, **WHERE IT IS** on the watch's page -- the last fix, Open in Maps, today's walk sketched, and **FIND IT**, which makes the watch say HERE and sound until it has a fix. The fixes stay on your companion and are never public | built |
| **cards** (C-176) | TOUCHSTONE and THE CARD on its NFC reader: put your daemon on a card, take the one it holds, or swap | built |
| **haptics** (C-176) | a tap for a care, a step, a milestone, a goal, a CASINO win, a harp string -- quiet when the sound is off. The T-Watch S3 has them too | built |
| **the instrument** (C-202) | your game's HARP or FLUTE by touch: strings plucked, holes held and blown, with no lag; the octave at the foot of the screen, and **SMART** to choose it for you; a song played right comes back as an ECHO, as in the game | built |
| **BOOKS** (C-208) | THE SUBTLE LAYER, THE GUIDE and the NOTEBOOK, each once your save holds it; a page a swipe, and **LISTEN** reads it aloud | built |
| **the SD card** (C-199) | BOOKS kept as they are read, or all at once (**KEEP ON THE CARD**), and opened **FROM THE CARD** away from any network; a reading heard once kept and played from the card after, anywhere; walks and nights the full outbox cannot hold wait on the card and go back as there is room; a meeting's parts kept until sent | built; flashed, no card in it yet |
| **meetings** (C-212) | **RECORD A MEETING**: half-minute parts onto the card and to the companion as each finishes, RECORDING in red the whole time. The hub's AI hears each part as it comes and writes it up -- a summary, take-aways and action items -- and the daemon has a day-dream about it; **LAST MEETING** shows them, and **SEND KEPT MEETINGS** sends what was recorded away. In the app, **MEETINGS** in DAEMON, by day | built, not yet on the wrist |
| **its mouth** (C-213) | on TALK it mouths its words, on the beat of its own voice or for as long as the phone speaks them; while it listens it stands large with its ears up | flashed, not yet heard |
| **ASK THE GUIDE** (C-209) | once THE GUIDE is found, ask it a question by voice from BOOKS ([The hub and its AI](The-hub-and-its-AI)) | built |
| **THE SUBTLE LAYER's sense** (C-203) | once your save holds the book: now and then the daemon notices something first, a read, a lean at the reels ([Your game on the companion](Your-game-on-the-companion)) | **seen on the wrist** |
| **who answers first** (C-211) | the hub's AI board or n8n, chosen on the watch too | built |
| **LoRa** | MESH, as the other LoRa boards ([Meeting others nearby](Meeting-others-nearby)) | built |

Down the cable, `MOTION?`, `GPS?`, `ALARM?` and `SUBTLE?` report each part's state.

## Coming

- **The rest of the SD card** (C-199): the whole INDEX with its art and voices, and the songs, offline; voice notes.
- **Meetings written by n8n too**, not only the hub's module; a phone hosting alone has none yet (C-212).
- **The CASINO, enhanced** for the tall screen (C-198, to ask).
- **Its voice with the phone alone**, away from the hub (C-197).
- **DAEMONS on the wrist** (C-214, a spike): the classic Game Boy build in a GB emulator, from the SD card, at 2.5x,
  with a touch D-pad and A/B. Not the GBA build: the ESP32-S3 cannot run a GBA emulator fast enough, and its ROM does
  not fit in memory. The ROM is never in this repository -- you build it and put it on your own card.
