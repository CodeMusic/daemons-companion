# Boards

**Any device can host a daemon.** Your phone and its widget are enough ([Host on your phone](Host-on-your-phone));
everything on this page is optional. A board -- most LilyGO and M5Stack handhelds -- hosts a daemon of its own: SEND
another from your party, SYNC, and choose under DEVICE, YOUR DEVICES which device hosts which. With one device there
is nothing to choose.

To put the firmware on a board and link it, see [Flashing and linking](Flashing-and-linking). Every board's pins and
parts, with sources: [docs/HARDWARE.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/HARDWARE.md).

## Supported boards

| board | screen | controls | listens | lights | its own radios | battery | build | state |
|---|---|---|---|---|---|---|---|---|
| **LilyGO T-Embed CC1101** | 320x170 | dial, its press, top button | yes (push to talk) | ring of 8 | IR, NFC, Sub-GHz | gauge and charger | `t-embed` | **runs** |
| **LilyGO T-Embed** (plain) | 320x170 | dial and its press | yes (two mics) | ring of 7 | -- | voltage | `t-embed` | **runs** |
| **LilyGO T-Embed SI4732** | 320x170 | dial and its press | yes (two mics) | ring of 7, moving with the radio | AM/FM: **CHANNEL**, a move it learns | voltage | `t-embed` | **runs** |
| **LilyGO T-Watch S3** | 240x240 touch | touch, the crown | yes (TALK on the face) | -- | LoRa (MESH), IR | power chip | `t-watch-s3` | built, not yet run |
| **LilyGO T-Deck, T-Deck Plus** | 320x240 | keyboard and trackball -- it **types** | yes (two mics) | -- | LoRa (MESH); GPS on the Plus | voltage | `t-deck` | **runs** |
| **LilyGO T-Display-S3 Pro** | 480x222 touch | touch, its home key, three buttons | -- (no microphone) | -- | -- | charger (voltage) | `t-display-pro` | **runs** |
| **M5StickS3** | 240x135 | two buttons | yes (hold the face) | -- | IR | power chip | `m5-sticks3` | built, not yet run |
| **M5Stack CoreS3** | 320x240 touch | touch, the power key | yes (TALK on the face) | -- | -- | power chip | `m5-cores3` | **runs** |
| **M5GO / M5Stack Fire** | 320x240 | A, B, C | yes, with the M5GO base | 10, on the base | -- | power chip (in quarters) | `m5-core` | **runs** |
| **M5Stack Dial** | 240 round, touch | the knob and its press; touch | -- (a buzzer: tunes, not a voice) | -- | RFID (TOUCHSTONE) | -- | `m5-dial` | **runs** |
| **M5Stack Tab5** | 720x1280 touch | the control center (below) | next | -- | -- | power chip | `m5-tab5` | **runs** |

*Built* means it compiles and has not yet run on that board. The three T-Embeds run **one firmware**: at start each
looks at what answers on its I2C bus and knows which board it is. Every other board has a build of its own; the M5GO
and the Fire share one, on the original ESP32 (the rest are ESP32-S3). Without the Fire's extra memory, the M5GO draws
in 256 colours, and it has too little memory to reach the relay away from home over HTTPS.

**The Tab5** is the **control center**: the app's screens on a 5-inch touch screen -- TODAY, GOALS, DAEMON (with SYNC),
INDEX (each entry, and LISTEN), DEVICES (which daemon goes where), SETTINGS (portrait, landscape or turning with it) --
with its own Wi-Fi, paired like a phone with the site's PAIR A PHONE code, and everything kept on it, the whole INDEX
and its art included. It is its own project, `firmware/tab5/` (an ESP32-P4). See
[docs/TAB5.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/TAB5.md).

## How a board reaches the companion

The corner of a board's screen says how it is linked:

- **USB** -- linked over its cable by `./linkCompanion.sh`; the bridge hands it the server's state every five seconds
  and passes back what you do on it.
- **WIFI** -- a board that has learned a network (UPLINK, TEACH A NETWORK) asks the server itself. The server must be
  open to your network (`"host": "0.0.0.0"`, or the site's SETTINGS, PAIR A PHONE, *Open to my network*).
- **PHONE** -- paired with your phone over Bluetooth, the phone carries its link wherever you both go (below).
- **AWAY** -- away from home on a Wi-Fi it knows, it asks your relay itself ([Away from home](Away-from-home)). This
  needs a key the board is given only down its cable, so link each board by cable once after the relay is set.

Networks are shared: a network learned on any board, the Tab5, the site or the app is learned by every device the
next time each is in touch (DEVICE, EVERY DEVICE'S NETWORKS). Passwords go only to a device that proves itself -- down
the cable or with its own key -- never over the phone's Bluetooth.

### A board and your phone, over Bluetooth

Pair them once: on the board, ROUTINES, WHISPER, **PAIR MY PHONE** (it shows a six-digit code), and in the app,
DEVICE, **Pair the handheld**. When iOS asks, type the board's code. From then on the phone carries the board's link
-- its goal, its daemon and its routines -- the way the cable does at the desk, and the link comes back by itself when
the board is near again. Away from the companion, what the board does waits on the phone and goes up when the
companion answers. The app only has to be open or in the background (home screen, phone locked: fine); an app swiped
away in the app switcher is cut off from Bluetooth by iOS until it is opened again. **FORGET MY PHONES**, on the board,
undoes every pairing; the app's **Forget it** undoes its own.

## Controls

| | the CC1101 | the plain T-Embed, the SI4732 | the T-Watch S3 | the T-Deck |
|---|---|---|---|---|
| choose | turn the dial | turn the dial | swipe | roll the trackball |
| open, confirm | press the dial (acts when let go) | tap the dial | tap | click the ball, or Enter |
| back | the top button | hold the dial half a second | hold, or the crown | hold the ball half a second, or Backspace |
| **talk** | **hold the dial** half a second at home | **hold the dial** at home | **hold TALK** on the face | **hold the ball** at home |
| sleep | hold the top button, press the dial | hold the dial two seconds | hold the crown | hold the ball two seconds |
| wake | **the top button only** | hold the dial | the crown | hold the ball, or any key |

On the plain T-Embed and the SI4732, a hold just after ticking a step undoes it instead of talking. The CC1101 wakes
only on its top button, so a pocket cannot wake it.

- **T-Display-S3 Pro**: a touch screen first -- swipe to choose, tap to open, hold to go back, and the home key under
  the glass goes home. Its three buttons do the same: the left (BOOT) turns back and, held, goes back; the lower right
  presses; the upper right turns on and, held two seconds, sleeps. Asleep, only the lower right held half a second
  wakes it. No microphone or speaker.
- **M5StickS3**: the face button presses (held at home, it talks); the side button turns to the next page, held half a
  second goes back, two seconds sleeps -- and asleep, only a hold on it wakes it.
- **M5Stack CoreS3**: a touch screen, used as the watch's is -- the face first, swipe to turn, tap to press, hold to go
  back, TALK held on the face. Its power key wakes it or goes back, and held a second, sleeps.
- **M5Stack Dial**: turn the knob to choose and press it to open (held half a second, back; two seconds, sleep), or
  use its touch screen as the watch's. Its home is the face, round as the screen is. No microphone, so it does not
  talk; its buzzer plays the tunes. Its RFID reader is **TOUCHSTONE**: hold a tag to its face.
- **M5GO and Fire**: at home the three buttons tend the daemon, and what each does is written right above it --
  **A DRINK, B FEED, C TRAIN**. At bedtime (from 8pm, when it is sleepy and not yet put to bed) the right one says
  **SLEEP**, lit: press it to put it to bed. While it sleeps the screen says **ASLEEP** and one **WAKE** bar runs under
  all three: any button wakes it. **A and C together** open the menu (where A and C turn, B presses) and close it.
  Held, B talks; A goes back; C, two seconds, sleeps the board itself -- asleep, only a held B wakes it. In the menu,
  ROUTINES opens on **RADIOS** -- **WHISPER** (pair your phone) and **UPLINK** (Wi-Fi) -- with your party's routines
  below it. The M5GO base gives it its microphone and ten lights.
- **T-Watch S3**: its home is the face -- the time, the day's theme, its virtue over its shadow, chakra and note,
  today's steps, the battery and a TALK button.

On the T-Deck the keyboard types a Wi-Fi password straight in (Enter joins), and a word to a daemon nearby.

## The pages

- **Home is the daemon it hosts** -- large, breathing, drifting, now and then hopping -- and how it is: its mood in a
  word, how it has eaten and drunk today, and at a meal time one quiet line.
- **TODAY** -- the one step: press to tick it off; back undoes it for fifteen seconds. Its milestone shows above it.
- **DAEMON** -- the daemon drawn as the game draws it (its streaks too), its level, friendship and what it holds;
  press for its INDEX entry, in your edition's voice.
- **ROUTINES** -- below.
- **The DAY** -- its theme, virtue over its shadow, chakra and note; press for its note.

Any menu left alone goes to sleep (two minutes by default), and waking lands back at home, to a few notes of the title
theme.

## Care

At home, **press** for CARE: **FEED** (*Eaten.*), **WATER** (*Drank.*), **TRAIN** (*Trained.*), or read its INDEX
entry (press there to hear it read aloud). The daemon hops and plays a glad little phrase. **Your goals nourish it**:
each step you finish counts as a meal and one experience point, which it takes home at the next SYNC. It never nags.
The site's and the app's DAEMON tab show the same.

## Routines

**ROUTINES** are the board's radios in the game's words, and your party's own routines from the game. A board shows
only the types it has; one with no radios of its own opens the party first.

| type | routine | what it does |
|---|---|---|
| FLARE (IR) | TEACH A REMOTE | your daemon learns a remote: press POWER, VOLUME UP, VOLUME DOWN on it in turn |
| FLARE | POWER, VOLUME UP, VOLUME DOWN | sends that button from the remote in use |
| FLARE | THEATER MODE | the board becomes the remote: press for POWER, turn for the volume, back when done |
| FLARE | WHAT REMOTE IS THIS | point any remote at it and press: each press named -- its protocol, bits and code |
| FLARE | CHOOSE A REMOTE | which of the remotes it knows (up to six) FLARE uses; the DEVICE tab can add one by brand |
| WHISPER (Bluetooth) | PAIR MY PHONE, OPEN TO MY PHONE, FORGET MY PHONES | the phone's link over Bluetooth |
| TOUCHSTONE (NFC) | READ MY TAG | hold a tag to the board: its kind and its ID. Reads nothing else |
| LONGWAVE (Sub-GHz) | WHAT'S ON THE AIR | listens (never sends) at 315, 433.92, 868.35 and 915 MHz: each band's level and its bursts counted |
| LONGWAVE | FIND IT | a hot-and-cold finder for one of your own transmitters |
| MESH (LoRa) | NEARBY, CALL OUT | daemons heard over LoRa, and a wave or a word to them ([Meeting others nearby](Meeting-others-nearby)) |
| PARTY | your party, then a daemon's routines | the game's own routines, in their streak colours: one used plays its phrase, the ring lit its colour |
| UPLINK (Wi-Fi) | NETWORKS IN RANGE | the networks it hears, those it knows marked * |
| UPLINK | TEACH A NETWORK | your daemon learns a network: choose one, spell its password on the wheel |
| UPLINK | WI-FI MOTION | five seconds learning the still room, then movement near the line to your router, for 45 seconds |

The radio routines are the hosted daemon's: they need one on the board, and speak in its name. A routine that waits
(for a remote, a tag, a phone) says so; the back button gives up. Every routine you run is told to the server as
tending your daemon. The DEVICE tab's ITS ROUTINES runs any of them from the site or the app, and ITS REMOTES can add
a TV's remote by brand (**Try its POWER**, then keep it) and rename remotes.

**The SI4732's radio** is two routine types: **LATENT** (AM: CHANNEL, and LIGHTNING) and **CONTEXT** (FM: CHANNEL,
and STATIC SYNTH). **CHANNEL is a move the daemon learns**: turn to tune, tap to seek, and hold a clear station a few
seconds -- the daemon attunes to it and has learned that frequency: eight a band, kept on the board, marked on the
dial. While a station plays the daemon speaks it: its sprite, its aura and the ring move with the voice. LIGHTNING
counts crashes on a quiet AM frequency; STATIC SYNTH plays notes from the static between FM stations.

The full list, with every routine, is in
[firmware/esp32/FLASHING.md](https://github.com/CodeMusic/daemons-companion/blob/main/firmware/esp32/FLASHING.md).

## Sounds and lights

A board sounds in **the day's key** (Sunday C ... Saturday B): turning rises and falls, a press is the day's note, and
each routine has its own tune, the ring dancing to it. A step done plays five notes of your daemon's own; a milestone,
seven notes and a rainbow; the goal, a longer climb. **The ring** glows the day's colour, goes out after a minute
unused, and follows the dial.

## Battery

The battery shows in the top bar, with a bolt while charging, red when low and unplugged. At 15% the board says so;
at 5% it goes into deep sleep and the top button (or the board's wake button) wakes it. The CoreS3 switches itself off
instead; its power key starts it again. The DEVICE tab shows each board's battery.

## Board settings

A board's settings are set on the site or in the app, DEVICE, ITS SETTINGS, and carried to the board the next time it
is linked: HOME, WHERE IT WAKES; SLEEP WHEN LEFT ALONE; SOUND (and volume); THE RING AT REST; THE DAY'S COLOURS; MEET
OTHERS NEARBY; and the LORA BAND.
