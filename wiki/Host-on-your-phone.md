# Host on your phone

This is the happy path: your iPhone hosts a daemon from your game, and its home-screen widget lets you tend it without
opening anything. No board, no cable.

**Two ways to run it.** The way this page walks through, and the one that has been seen end to end: the companion's
**server runs on a computer** (a Mac is what it is built and tested on), reads a **copy** of your DAEMONS save, and
answers the app and the widget. The other: **the phone hosts on its own**, with the save Delta shares through Files
and no computer at all (C-111). That one is built and has run in the iOS Simulator; a whole round trip on a real phone
has not yet been seen ([below](#or-the-phone-on-its-own-c-111)).

You need:

- A computer with **Node 24** -- see [Running the companion](Running-the-companion).
- **Xcode** and an Apple developer team, to build the app onto your iPhone, and about 5 GB of free disk
  ([Troubleshooting](Troubleshooting#a-phone-build-fails)).
- A **copy** of a DAEMONS save -- never the only copy, and never the file a running game is using. An emulator's
  `.sav` beside the ROM is easiest.

## 1. Run the companion

From the repository's root:

```sh
./bindCompanion.sh
```

The first run installs what it needs, starts the server in the background and opens the companion's **site** at
<http://localhost:8081>. The tabs are TODAY, DAEMON, GOALS, LIBRARY, YOU and PLACES, with
SETTINGS behind the gear at the top right; on a phone's width the six share it. More in
[Running the companion](Running-the-companion).

## 2. Point it at your save copy

On the site, open **SETTINGS**, under YOUR DAEMONS SAVE:

- **Choose a save…** opens a file picker on a Mac; or type the path under OR TYPE THE PATH and **Save**.
- **Open the folder** shows where the save lives.

Point the emulator and the companion at the **same `.sav` file** and the round trip below just works. From a cartridge,
pull the save to your computer, set that path, and pull it again after you play. The first save you SYNC becomes
**your companion's game**; a different game's save is shown but never written. Details in [Settings](Settings).

## 3. SEND a daemon AWAY, and SYNC

**Close the game before every SYNC** -- a running emulator writes its own copy of the save back over the
companion's.

1. In the companion, **DAEMON**, Yours, **SYNC**. The first time, it links the save: *"Linked. Your game now offers
   SEND…"*
2. In the game, open a party daemon's menu and choose **SEND**. It appears only once the save is linked, and only a
   well daemon goes (full health, nothing ailing it). The game saves.
3. Close the game, and **SYNC** again. The daemon is now **AWAY**: washed out in the companion's party, *ON YOUR
   DEVICE*. Whatever it was holding goes with it.
4. To bring it home: in the game the same daemon's menu offers **CALL HOME**. Choose it, save, close, SYNC. The
   experience it earned while it was out comes home with it.

You can SEND as many as you like, one per device.

## 4. Build the app onto your iPhone

Plug the iPhone in (and trust the computer), or have it on the same Wi-Fi with developer mode on. Then:

```sh
./bindCompanion.sh phone
```

It generates the iOS project, builds a Release build signed by the Apple team named in `app/app.json`
(`expo.ios.appleTeamId` -- put your own team there), and installs it. If the phone is locked it waits and tries again
every ten seconds until you unlock it. A Release build carries its own JavaScript, so the app runs without the computer
in reach; it still talks to the companion on it.

Build again (the same command) whenever the app changes. SETTINGS, THIS APP on the phone says when a newer app is
ready.

## 5. Pair it

On the computer, the site, **SETTINGS**, **PAIR A PHONE**:

1. **Open to my network: yes**, then restart the companion once (Ctrl-C, then `./bindCompanion.sh`) -- the phone has
   to reach it over your Wi-Fi.
2. **Show a code**. It shows a six-digit code and the companion's address. The code works once, for ten minutes.
3. Open **DAEMONS companion** on the phone. On *Pair this phone*, type the address, the code and a name for the phone,
   and **Pair**.

**The address is your computer's own name.** The site offers `http://<your-computer>.local:4730` -- the name the
computer answers to on any network -- so the pairing finds the companion on any Wi-Fi the phone shares with it, at home
or at someone else's, wherever its number has moved to. If the phone cannot reach it by name, the site gives the number
too, as a fallback; that one changes with the network. If the phone ever cannot find the companion at home, pair again
(see [Troubleshooting](Troubleshooting#away-from-the-companion-while-you-are-at-home)).

4. **Allow the Local Network** when iOS asks. Without it neither the app nor the widget reaches home. If you missed
   the prompt: Settings, Privacy & Security, Local Network, and switch on DAEMONS companion.

The phone is given its own key. The whole app answers it across your network; nothing else does. The site lists paired
phones under PAIR A PHONE, with **Forget** beside each.

**Your steps** come from Apple Health (it asks once) and count toward the walking goal each time you open the app.

## 6. Add the widget

Open the app once, paired: that hands the widget the companion's address and key. Then:

1. Long-press the home screen, **Edit**, **Add Widget**, **DAEMONS**, small, medium or large (there are lock-screen
   ones too).
2. It says *Looking for your companion...* for a moment, then shows a daemon in its den -- a room that looks like its
   type, which it wanders through the hour -- or *No daemon here* when it hosts none yet.

The widget is **a device of its own**. It needs no cable and no `linkCompanion.sh` (that is only for a board); it
reaches the companion the way the app does, over your Wi-Fi at home and through the relay away
([Away from home](Away-from-home)).

## 7. Choose the daemon it hosts

In the app (or on the site), **PLACES**, **YOUR DEVICES**. The widget is listed there as **This phone's widget**,
alongside any boards, each saying which daemon it hosts (*"Hosts …"*). Choose a daemon for it from those
AWAY. A daemon hosted by another device moves to the widget. The widget shows it, its level, its word for how it is,
how it has eaten and drunk today, and its cue.

## 8. DRINK, FEED, TRAIN, SLEEP

Press the buttons on the widget. Each answers at once, without opening the app:

| button | it says |
|---|---|
| **DRINK** | *Drank.* |
| **FEED** | *Eaten.* |
| **TRAIN** | *Trained.* |
| **SLEEP** | *Asleep.* -- put to bed from 8pm it sleeps until 6; in the day, a nap of an hour and a half |

**A press answers before the companion is asked** (C-122): the button lights with a check while the daemon hops, the
counts move, and its phrase plays on your game's own instrument -- the HARP for a CONTENT save, the FLUTE for CONTEXT (a
widget may not play sound itself, so iOS plays it through the app). A press made when the companion cannot be reached
says *Kept until home answers.*: it is kept on the phone and sent the next time the widget or the app reaches the
companion. Nothing is lost.

The app's **DAEMON** tab, **Yours**, has the same buttons, large, the daemon's day, **NEARBY** and **HOLD TO TALK**
([Talk to your daemon](Talk-to-your-daemon)); **TODAY** has DRINK, FEED and TRAIN too. At bedtime **SLEEP** is lit;
while it sleeps one **WAKE** button wakes it, and the card says **ASLEEP** plainly. Its face shows how it feels -- glad
after a meal, sleepy at night, its eyes closed asleep -- drawn from its own sprite, in its den
([Feelings and expressions](Feelings-and-expressions)). Your **goals** feed it too: every step you finish counts as a
meal and gives it experience, which it takes home at the next SYNC. It never nags.

**Its sound is its own**: PLACES, YOUR DEVICES, This phone's widget, **ITS SETTINGS**, **SOUND** -- Off silences the
CASINO, the care phrases and the widget's buttons, and Quiet to Loudest sets how loud they play (C-160,
[Settings](Settings#sound)).

The rest of the app -- YOU, the LIBRARY with its NOTEBOOK, the INDEX -- reads your game:
[Your game on the companion](Your-game-on-the-companion). DAEMON, **Routines** has THE CASINO, played with your game's
money ([The CASINO](The-CASINO)). Another daemon's word, act or JACKPOT shows as a banner over whatever is open while
the app is; a tap opens NEARBY. Every picture on the phone is enlarged by repeating its pixels, so the art stays crisp
(C-147).

## Or: the phone on its own (C-111)

**No computer.** Play DAEMONS in Delta on the same phone, and the app hosts the daemon itself: the day, the goal and its
steps, the walk, the party and its art, YOU, the INDEX, the NOTEBOOK and the LIBRARY, the daemon's life and care,
SYNC, and the widget, all answered on the phone by the companion's own rules.

1. In Delta, hold the game, choose **Export Save File**, and save it to Files.
2. In the app, on the first screen (*Pair this phone*), under **Or host it on this phone alone**: choose the edition
   (CONTENT or CONTEXT), then **Choose the save from Files**. Already paired with a companion? SETTINGS, THIS PHONE,
   **Leave this companion** (tap twice) brings that screen back; nothing on the companion changes.
3. The app keeps a copy of the save. SETTINGS then reads **THIS PHONE HOSTS ON ITS OWN**:
   - **Take a newer save from Files** after you play, then SYNC on DAEMON, Yours.
   - **Give the save back to Delta** after a SYNC: save it to Files, then in Delta hold the game and **Import Save
     File**.
4. The widget is this phone's device. Its presses are kept until the app opens and tends them.

A handheld board, talking with your daemon, THE WEATHER and THE HOUSE, and reaching it from another device still need
the companion on a computer: SETTINGS, A COMPANION ON A COMPUTER, **Pair with a companion instead**.

**State: built, and run in the iOS Simulator** on a scratch copy of a save -- the save taken, TODAY, the party painted,
SYNC, the widget hosting a chosen daemon, the settings, the share sheet, a goal set. **Not yet seen**: a SYNC that
writes the save, the widget on a real home screen, Delta's own menus (the names above are not yet checked against
Delta), and a whole round trip with a SEND. Until they have been, the computer is the way to start.

## Next

- [Away from home](Away-from-home) -- reach the companion from anywhere through your own n8n.
- [Boards](Boards) -- a handheld can host a second daemon, and the phone can carry a board's link over Bluetooth.
- [Troubleshooting](Troubleshooting) -- when the widget keeps looking.
