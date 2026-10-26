# One app: the game, the companion and the books (C-186)

*The user, 2026-10-24 to 26: "the phone/tablet is the game, and also is the companion app, and the site/library ... a
unified experience where you can play, bind and send the bound daemons into your phone or device ... and later return
them to the game ... as you read and explore the notes you found in the game -- right from the phone/tablet."
"We will start internals, and test as a full app -- then we can review at a later point if we can make it fully public
or adapt -- but right now, the all in 1 experience is the goal."*

Internal first: built and tested as one app on the user's own iPad and iPhone (and their mom's iPad). Whether it can be
published, and how, is reviewed later. Nothing of Nintendo's is ever in the app either way.

## The one idea: one save, on the device

The game plays in the app and keeps its save in the app's own storage. The companion runs in the app (hosting alone,
C-111: `app/local.ts` runs `server/src/routes.ts` on the device) and reads and writes **that same file**. So everything
the companion already does with a save -- SYNC, a daemon SENT away to the phone or a board, its routines, its
experience, RETURNED to the game -- happens on one file, with no computer and no hub.

The one rule SYNC has always had -- *the game must not be running while the save is written* -- becomes the app's
rhythm, as the playground already does it: **the game pauses** whenever the companion is shown; the companion takes the
game's save memory, SYNCs, and gives it back; **the game restarts from it** (CONTINUE) when it is shown again.

The device's save is the real one. The hub, when paired, keeps a mirror (as the Mac's copy is today) so the boards at
home and the hub's AI see the same daemons.

## The steps, in order

1. **The game in the app (C-187).** The player gives their own FireRed or LeafGreen once (from Files). The app
   checks it against `server/data/patches.json` (SHA-1 and CRC32 of each retail ROM a patch accepts), downloads our BPS
   patch from the release on GitHub, applies it on the device and checks the result against the target's SHA-1; the
   patched ROM stays in the app's storage. It plays with the mGBA core in a web view -- EmulatorJS, as the playground
   does -- with the save read out and written in through the page. A native mGBA later, if the iPad 8 needs the speed
   or the battery (measured first).
2. **One save for both (C-188).** The game's save memory is the companion's `daemons.sav`. Pausing hands it over:
   SYNC, SEND and RETURN, then the game restarts from what was written. The bound daemons reach the widget, TODAY and
   the boards at once.
3. **The iPad as one screen (C-189).** Landscape: the game on one side, the companion on the other -- the NOTEBOOK page
   or the INDEX card of the daemon just met, open beside the game. Portrait and the phone: GAME is one more tab.
4. **The library while you play.** Already in the app and read from the save: the NOTEBOOK, the GUIDE, THE SUBTLE
   LAYER, the full INDEX cards in their colours (C-186's first piece). Each opens the moment the game gives it.
5. **Devices from the app (C-190).** The boards over Bluetooth, as the phone already carries them (C-55); the hub
   when it is there -- paired, its mirror, its AI and its LoRa. Without the hub the app does everything but the AI.
6. **The planner (C-191).** From the game lane's T-453 data: where the save is, what is next, the wild daemons and
   trainers ahead -- everything past the next step hidden until it is reached, and no secrets or hidden books at all.

## What the game lane supplies (DAEMONS T-453)

`patches.json` and `index_cards.json` (in `server/data/`, both landed 2026-10-24); next, for the planner: where each
event happens and in what order, how the maps connect, wild encounters and trainers per map, a level curve.

## Rules it keeps

- **No ROM, no patch bytes and nothing of Nintendo's in the app or this repository.** The player's own ROM is the
  source; the patch is fetched from the release, checked by hash, and applied on the device.
- **Never the user's own save without a copy.** A save brought in from Files (or Delta) is copied into the app; the
  original is left as it was.
- **The game is paused before the save is written**, always.
- `server/src` that `core.ts` or `routes.ts` reaches runs on the phone: no `node:` imports there (only `api.ts`).
