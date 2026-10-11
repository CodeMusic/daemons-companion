# Host on your phone

This is the happy path: your iPhone hosts a daemon from your game, and its home-screen widget lets you tend it without
opening anything. No board, no cable.

**What it takes today.** The phone is not yet self-contained: the companion's **server runs on a computer** (a Mac is
what it is built and tested on), reads a **copy** of your DAEMONS save, and answers the app and the widget. A version
where the phone and the game are enough by themselves is planned (C-111 in
[TODO.md](https://github.com/CodeMusic/daemons-companion/blob/main/TODO.md)); it waits on where a phone-only player's
save lives.

You need:

- A computer with **Node 24** -- see [Running the companion](Running-the-companion).
- **Xcode** and an Apple developer team, to build the app onto your iPhone, and about 5 GB of free disk
  ([Troubleshooting](Troubleshooting#a-phone-build-runs-out-of-disk)).
- A **copy** of a DAEMONS save -- never the only copy, and never the file a running game is using. An emulator's
  `.sav` beside the ROM is easiest.

## 1. Run the companion

From the repository's root:

```sh
./bindCompanion.sh
```

The first run installs what it needs, starts the server in the background and opens the companion's **site** at
<http://localhost:8081>. The tabs are TODAY, GOALS, DAEMON, INDEX, DEVICE, PROFILE and SETTINGS. More in
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

1. In the companion, **DAEMON**, **SYNC**. The first time, it links the save: *"Linked. Your game now offers SEND…"*
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

**Pair by name rather than by number.** The address the site shows is your computer's address on the network today,
and that can change. Type `<your-computer>.local:4730` instead (your computer's local hostname, which you will find
in its sharing settings) and the pairing survives the address moving. If the phone ever cannot find the companion at
home, pair again (see [Troubleshooting](Troubleshooting#away-from-the-companion-while-you-are-at-home)).

4. **Allow the Local Network** when iOS asks. Without it neither the app nor the widget reaches home. If you missed
   the prompt: Settings, Privacy & Security, Local Network, and switch on DAEMONS companion.

The phone is given its own key. The whole app answers it across your network; nothing else does. The site lists paired
phones under PAIR A PHONE, with **Forget** beside each.

**Your steps** come from Apple Health (it asks once) and count toward the walking goal each time you open the app.

## 6. Add the widget

Open the app once, paired: that hands the widget the companion's address and key. Then:

1. Long-press the home screen, **Edit**, **Add Widget**, **DAEMONS**, small or medium.
2. It says *Looking for your companion...* for a moment, then shows a daemon -- or *No daemon here* when it hosts none
   yet.

The widget is **a device of its own**. It needs no cable and no `linkCompanion.sh` (that is only for a board); it
reaches the companion the way the app does, over your Wi-Fi at home and through the relay away
([Away from home](Away-from-home)).

## 7. Choose the daemon it hosts

In the app (or on the site), **DEVICE**, **YOUR DEVICES**. The widget is listed there as **This phone's widget**,
alongside any boards, each saying which daemon it hosts (on screen: *"Carries …"*). Choose a daemon for it from those
AWAY. A daemon hosted by another device moves to the widget. The widget shows it, its level, its word for how it is,
how it has eaten and drunk today, and its cue.

## 8. FEED, WATER, TRAIN

Press the buttons on the widget. Each answers at once, without opening the app:

| button | it says |
|---|---|
| **FEED** | *Eaten.* |
| **WATER** | *Drank.* |
| **TRAIN** | *Trained.* |

The counts move with it. A press made when the companion cannot be reached says *Kept until home answers.*: it is kept
on the phone and sent the next time the app opens and reaches the companion. Nothing is lost.

The app's **DAEMON** tab has the same three buttons, the daemon's day, and **HOLD TO TALK**
([Talk to your daemon](Talk-to-your-daemon)). Your **goals** feed it too: every step you finish counts as a meal and
gives it experience, which it takes home at the next SYNC. It never nags.

## Next

- [Away from home](Away-from-home) -- reach the companion from anywhere through your own n8n.
- [Boards](Boards) -- a handheld can host a second daemon, and the phone can carry a board's link over Bluetooth.
- [Troubleshooting](Troubleshooting) -- when the widget keeps looking.
