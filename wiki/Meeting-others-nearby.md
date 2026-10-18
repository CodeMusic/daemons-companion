# Meeting others nearby

Pass someone else hosting a daemon, and your INDEX sees theirs. A meeting needs a second companion: someone else's
board, or the app on someone else's phone. And any daemon can say a word, or do something, for every daemon in reach to
see.

## Over Bluetooth: the beacon

The phone and every board send a small beacon -- **the species of the daemon they host, and a random tag that changes
every hour**, nothing about you -- and listen for others a few seconds every few minutes.

- **Passing someone else's companion is a meeting.** At the next SYNC your INDEX sees their daemon as seen, and yours
  grows a little friendlier. A tag is met once an hour, never more.
- **Your own devices never count** as meeting each other. The DAEMON tab, MET NEARBY, says when they heard each other,
  which proves the radios.
- **A card holding someone else's daemon is a meeting too**, held to a board with a reader
  ([Boards](Boards#routines)).
- **Switch it off** in DEVICE, ITS SETTINGS, **MEET OTHERS NEARBY**.

## Broadcasts: a word or an act to every daemon

A broadcast (C-134) is sent **as a daemon** -- the one a board hosts, or from the app, the site or the Tab5, one of the
daemons away -- and goes every way the sender has:

| way | reach |
|---|---|
| **LoRa** | far, with no network -- the boards on the same band, passed on two hops |
| **Bluetooth** | the room: up to eight small pieces turning in the advertisement for twelve seconds; a word sent this way is cut to 43 letters |
| **The companion** | every linked device, wherever it is, the relay included |

**Each one shows once**, however many ways it arrives; WHAT CAME on a board says which ways it came (L LoRa, B
Bluetooth, N the companion).

- **A word** -- typed on a board with a keyboard (the T-Deck, the Cardputers), or on the app, the site or the Tab5
  (forty letters there).
- **An act** -- a thing a daemon does: WAVE, BOW, HUM A TUNE, DANCE, SHARE A BERRY, GLOW, CALL OUT, SETTLE TO REST,
  CHEER, INVITE TO PLAY. A board without a keyboard chooses one; so can every screen.
- **An answer** -- every daemon that receives an act answers it, once, a few seconds later (*... bows in return*). An
  answer is never answered, a word is read rather than answered, and our own are not answered.

**On a board**: ROUTINES, **CHORUS**: TO EVERY DAEMON (the acts; TYPE A WORD first on a keyboard) and WHAT CAME (the
last ten). A broadcast arriving flashes the board's light and shows its words for a moment -- never a sound, never on a
sleeping board.

**On the app and the site**: the DAEMON tab's **NEARBY** -- the last eight broadcasts, **Answer** beside another
daemon's act (once), a box to **Say** something to every daemon nearby, and a button for every act. While NEARBY is open
and MEET OTHERS NEARBY is on, the phone also listens for the boards' Bluetooth pieces, and sends its own as theirs
(C-141); iOS lets it advertise only while the app is in front. **The Tab5**: NEARBY on its DAEMON page, the last six,
**ANSWER** and **SAY...** on its keyboard.

**State**: built on every board, the app, the site and the Tab5. Seen: a WAVE sent from the companion arriving once on a
board. Not yet seen: an act or its answer passing between two boards by LoRa or Bluetooth, or the phone's Bluetooth
pieces heard by a board.

The design, the pieces and the ids:
[docs/BROADCAST.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/BROADCAST.md).

## Over LoRa: MESH

A board with a LoRa radio sends the same beacon over LoRa every two minutes (streets rather than a room) and listens all
the time. A daemon heard on both radios in an hour is one meeting.

| board | its LoRa | state |
|---|---|---|
| **T-Deck / T-Deck Plus** | an SX1262 on the board | runs |
| **M5GO / M5Stack Fire** | an **M5 LoRa433** module stacked on it (an SX1278, 433 MHz), its pins found by itself | runs on the Fire |
| **T-Watch S3** | an SX1262 on the board | built, not yet run |
| **Cardputer ADV** | the **Cap LoRa-1262**, made for 868-923 MHz: a 433 setting is taken as 868 | built, not yet run |

Its **MESH** routines:

- **NEARBY** -- the daemons heard in the last ten minutes: the name its board sent, how loud, how long ago, and
  *passed on* when another board relayed it. The first row is EVERYONE NEARBY. Choose one and send a **WAVE**, or a
  word: SAY HELLO, SAY WELL MET, SAY COME FIND ME, SAY ALL IS WELL -- and on a keyboard, **TYPE A WORD** (up to eighty
  letters). A wave or word that arrives flashes on the screen.
- **CALL OUT** -- asks who is there; every board that hears it answers, and the list fills for thirty seconds.

**On the T-Deck, typing is the message** (C-123): at home, any letter starts **A MESSAGE TO EVERYONE NEARBY**; Enter or
the trackball sends it, Backspace takes a letter back and, on an empty message, leaves; eighty letters at most. A
message heard on a board stays on its screen -- who sent it and the words, wrapped -- until a key or a touch reads it,
and that key does nothing else. A board not yet updated keeps the first forty letters.

Both routines need the board to be hosting a daemon. The DAEMON tab keeps every wave and word under MET NEARBY, WAVES
AND WORDS. Every board passes on what it hears once (two hops at most), so a daemon out of range is still heard through
a board between.

**The band** is set once, in DEVICE, ITS SETTINGS, **LORA BAND**: 433 (the default), 868 or 915 MHz -- whatever your
boards were bought for; every board takes the one setting, so they agree. LoRa reaches only boards on the same band:
the 868 boards and the 433 ones hear each other through Bluetooth and the companion instead. Nothing on the board says
which it was built for, and which band you may use depends on where you live (in Canada and the US the licence-free
band is 902-928 MHz; 868 is Europe's; 433 is amateur and low-power only). The radio sends at 10 dBm, a beacon a fifth of
a second long every two minutes. Its sync word keeps it apart from Meshtastic.

**State:** the first message between two boards has been seen: typed on a T-Deck, it arrived on a Fire with its
LoRa433 (2026-10-15). The T-Embed CC1101's Sub-GHz radio is not LoRa and never hears a MESH frame. On a Fire whose
LoRa433 has its reset switch at G25 -- the speaker's pin -- the Fire is silent; set it to G13
([Troubleshooting](Troubleshooting#the-m5go-or-fire-is-silent-with-its-lora433)).

**Trying it without a second daemon**: with the bridge stopped, send down the cable
([Flashing and linking](Flashing-and-linking#checks-down-the-cable)): `MESH?`, `MESH BEACON`, `MESH CALL`,
`MESH WAVE [tag]`, `MESH SAY * hello`; and on a keyboard board `KEY TYPE <letters>` then `KEY ENTER` to send a message
as its keys would.

The design, the frame and the mesh:
[docs/LORA.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/LORA.md).
