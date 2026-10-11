# Meeting others nearby

Pass someone else hosting a daemon, and your INDEX sees theirs. A meeting needs a second companion: someone else's
board, or the app on someone else's phone.

## Over Bluetooth: the beacon

The phone and every board send a small beacon -- **the species of the daemon they host, and a random tag that changes
every hour**, nothing about you -- and listen for others a few seconds every few minutes.

- **Passing someone else's companion is a meeting.** At the next SYNC your INDEX sees their daemon as seen, and yours
  grows a little friendlier. A tag is met once an hour, never more.
- **Your own devices never count** as meeting each other. The DAEMON tab, MET NEARBY, says when they heard each other,
  which proves the radios.
- **Switch it off** in DEVICE, ITS SETTINGS, **MEET OTHERS NEARBY**.

## Over LoRa: MESH

A board with a LoRa radio -- the **T-Watch S3** and the **T-Deck / T-Deck Plus** -- sends the same beacon over LoRa
every two minutes (streets rather than a room) and listens all the time. A daemon heard on both radios in an hour is
one meeting. Its **MESH** routines:

- **NEARBY** -- the daemons heard in the last ten minutes: the name its board sent, how loud, how long ago, and
  *passed on* when another board relayed it. The first row is EVERYONE NEARBY. Choose one and send a **WAVE**, or a
  word: SAY HELLO, SAY WELL MET, SAY COME FIND ME, SAY ALL IS WELL -- and on the T-Deck, **TYPE A WORD** (up to forty
  letters). A wave or word that arrives flashes on the screen.
- **CALL OUT** -- asks who is there; every board that hears it answers, and the list fills for thirty seconds.

Both need the board to be hosting a daemon. The DAEMON tab keeps every wave and word under MET NEARBY, WAVES AND WORDS.
Every board passes on what it hears once (two hops at most), so a daemon out of range is still heard through a board
between.

**The band** is set once, in DEVICE, ITS SETTINGS, **LORA BAND**: 433 (the default), 868 or 915 MHz -- whatever your
boards were bought for; every board takes the one setting, so they agree. Nothing on the board says which it was built
for, and which band you may use depends on where you live (in Canada and the US the licence-free band is 902-928 MHz;
868 is Europe's; 433 is amateur and low-power only). The radio sends at 10 dBm, a beacon a fifth of a second long every
two minutes. Its sync word keeps it apart from Meshtastic.

**State:** built. The T-Deck's radio has started; the watch is not yet flashed, so no two boards have heard each other
yet. The T-Embed CC1101's Sub-GHz radio is not LoRa and never hears a MESH frame.

**Trying it without a second daemon**: link the board (`./linkCompanion.sh`) and type at the bridge: `MESH?`,
`MESH BEACON`, `MESH CALL`, `MESH WAVE [tag]`, `MESH SAY * hello`.

The design, the frame and the mesh:
[docs/LORA.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/LORA.md).
