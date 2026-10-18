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
| **LilyGO T-Embed CC1101** | 320x170 | dial, its press, top button | yes (push to talk) | ring of 8 | IR, NFC (cards), Sub-GHz | gauge and charger | `t-embed` | **runs** |
| **LilyGO T-Embed** (plain) | 320x170 | dial and its press | yes (two mics) | ring of 7 | -- | voltage | `t-embed` | **runs** |
| **LilyGO T-Embed SI4732** | 320x170 | dial and its press | yes (two mics) | ring of 7, moving with the radio | AM/FM: **CHANNEL**, a move it learns | voltage | `t-embed` | **runs** |
| **LilyGO T-Watch S3** | 240x240 touch | touch, the crown | yes (TALK on the face) | -- | LoRa (MESH), IR out | power chip | `t-watch-s3` | built, not yet run |
| **LilyGO T-Deck, T-Deck Plus** | 320x240 | keyboard and trackball -- it **types** | yes (two mics) | -- | LoRa (MESH); GPS on the Plus, not yet used | voltage | `t-deck` | **runs** |
| **LilyGO T-Display-S3 Pro** | 480x222 touch | touch, its home key, three buttons | -- (no microphone) | -- | -- | charger (voltage) | `t-display-pro` | **runs** |
| **LilyGO T-Display-S3 AMOLED 1.91** | 536x240, touch on the touch version | touch and BOOT, or two buttons | -- (no microphone) | -- | -- | voltage | `t-display-amoled` | **runs** |
| **M5StickS3** | 240x135 | two buttons | yes (hold the face) | -- | IR | power chip | `m5-sticks3` | **runs** |
| **M5StickC-Plus 1.1** | 240x135 | two buttons | yes (hold the face); a buzzer, not a voice | -- | IR out; **GLOW** with its Thermal HAT | power chip | `m5-stickc-plus` | **runs** |
| **M5Stack Cardputer, Cardputer ADV** | 240x135 | a keyboard and BOOT -- it **types** | -- (not yet) | one | LoRa (MESH) on the ADV with its Cap LoRa-1262 | voltage | `m5-cardputer` | built, not yet run |
| **M5Stack CoreS3** | 320x240 touch | touch, the power key | yes (TALK on the face) | -- | -- | power chip | `m5-cores3` | **runs** |
| **M5GO / M5Stack Fire** | 320x240 | A, B, C | yes, with the M5GO base | 10, on the base | LoRa (MESH) with an M5 LoRa433 module | power chip (in quarters) | `m5-core` | **runs** |
| **M5Stack Dial** | 240 round, touch | the knob and its press; touch | -- (a buzzer: tunes, not a voice) | -- | RFID (TOUCHSTONE, cards) | -- | `m5-dial` | **runs** |
| **M5Stack Tab5** | 720x1280 touch | the control center (below) | not yet | -- | -- | power chip | `m5-tab5` | **runs** |
| **Espressif ESP32-S3-BOX-3** | 320x240 touch | the wake word; a tap | yes, as Home Assistant's voice assistant | -- | -- | -- | `firmware/box3/box3.sh` (ESPHome) | **runs** |

*Built* means it compiles and has not yet run on that board. The three T-Embeds run **one firmware**: at start each
looks at what answers on its I2C bus and knows which board it is. The Cardputer and the Cardputer ADV share one too, and
tell themselves apart the same way. Every other board has a build of its own; the M5GO and the Fire share one. The M5GO,
the Fire and the StickC-Plus are the original ESP32, the Tab5 an ESP32-P4, the BOX-3 and the rest ESP32-S3. Without
the Fire's extra memory, the M5GO draws in 256 colours, and it has too little memory to reach the relay away from home
over HTTPS. The StickC-Plus has no extra memory either: GLOW is written to fit beside the daemon it hosts.

**The Tab5** is the **control center**: the app's screens on a 5-inch touch screen, seven tabs -- TODAY (the day, the one
thing, the daemon, NEARBY, the game, the LIBRARY's news), DAEMON (YOURS: its daemon in its den and its expression, DRINK
FEED TRAIN SLEEP or WAKE, NEARBY, the party, SYNC; the INDEX: each entry, NATIVE, and LISTEN; ROUTINES: THE CASINO),
GOALS, LIBRARY (CALLOW SCHOOL, THE GUIDE, NOTEBOOK, SONGBOOK with PLAY, STREAM), YOU, PLACES (DEVICES by maker, a picture
of each, which daemon goes where, and HOME, Home Assistant), SETTINGS (portrait, landscape or turning with it; AUTO, LIGHT or DARK, where
AUTO is dark from 8pm to 6am). It has its own Wi-Fi, is paired like a phone with the site's PAIR A PHONE code, and keeps
everything on it, the whole INDEX and its art included. **Paired by the computer's name** (`<your-computer>.local`), it
asks the network for that name (mDNS) and keeps the answer ten minutes, or until a request fails, so it finds the
companion wherever the two share a Wi-Fi (built; not yet seen on the board). A QR code on a NOTEBOOK page is drawn on
its screen to scan, since it has no browser. It is its own project, `firmware/tab5/` (an ESP32-P4); its newest pages are
built and flashed, and not all yet seen on the board. See
[docs/TAB5.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/TAB5.md) and
[Your game on the companion](Your-game-on-the-companion).

**The BOX-3 is not our firmware.** It runs **ESPHome**, as Home Assistant's own BOX-3 voice assistant does -- the wake
word on the box, Home Assistant's pipeline, timers -- and its screen becomes the daemon it hosts, drawn by the
companion. It is flashed with `firmware/box3/box3.sh`, never `updateCompanion.sh`, and has no routines, care buttons
or cable link. See [Home Assistant and the BOX-3](Home-Assistant-and-the-BOX-3).

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

- **T-Display-S3 Pro**: a touch screen -- swipe to choose, tap to open, hold to go back, and the home key under the
  glass goes home -- and three buttons on its side, which work as the M5GO's A, B and C (below): the left (BOOT) is A,
  the lower right B, the upper right C. At home its footer says what they do: **A care, B routines, C index**, and
  **A+C: menu**. Asleep, any of the three wakes it. No microphone or speaker.
- **T-Display-S3 AMOLED 1.91**: the touch version swipes on the screen, BOOT alone presses and, held, goes back. The
  version without touch has a second button: it presses, BOOT turns, and held goes back (two seconds, sleeps). No
  microphone or speaker. The touch's way round is still to be checked in the hand.
- **M5StickS3**: the face button presses (held at home, it talks); the side button turns to the next page, held half a
  second goes back, two seconds sleeps -- and asleep, only a hold on it wakes it.
- **M5StickC-Plus 1.1**: the same two buttons as the StickS3, used the same way. Its buzzer plays the tunes; it has no
  speaker for a voice. Its power button is the power chip's: held six seconds and pressed again, it starts afresh.
  With the **Thermal HAT** fitted, ROUTINES opens on **GLOW** (below).
- **Cardputer and Cardputer ADV**: Enter presses and del goes back; **; , . /** move where nothing is being typed (Fn
  with them, where something is); BOOT presses, and held goes back. The keys type a Wi-Fi password and a word to every
  daemon. Built, not yet run on either.
- **M5Stack CoreS3**: a touch screen, used as the watch's is -- the face first, swipe to turn, tap to press, hold to go
  back, TALK held on the face. Its power key wakes it or goes back, and held a second, sleeps.
- **M5Stack Dial**: turn the knob to choose and press it to open (held half a second, back; two seconds, sleep), or
  use its touch screen as the watch's. Its home is the face, round as the screen is. No microphone, so it does not
  talk; its buzzer plays the tunes. Its RFID reader is **TOUCHSTONE**: hold a tag to its face.
- **M5GO and Fire**: at home what each button does is written right above it -- **A CARE, B ROUTINES, C INDEX**.
  **CARE** puts **DRINK, FEED, TRAIN** over the three: one press, and it is home again. At bedtime (from 8pm, when it
  is sleepy and not yet put to bed) CARE is lit, and in it the right one says **SLEEP**: press it to put it to bed.
  **ROUTINES** opens the routine types, the **CASINO** first (below). **INDEX** shows its INDEX entry, and OPUS's margin
  if you have OPUS -- there A reads it aloud, B shows more and C goes home. While it sleeps the screen says **ASLEEP**
  and one **WAKE** bar runs under all three: any button wakes it. **A and C together** open the whole menu (where A and
  C turn, B presses) and close it. Held, B talks; A goes back; C, two seconds, sleeps the board itself -- asleep, any
  button wakes it, and does only that -- and held on to five seconds, C switches it off. The M5GO base gives it its
  microphone and ten lights. With an **M5 LoRa433** module stacked on it, it finds the module's pins by itself and
  joins MESH ([Meeting others nearby](Meeting-others-nearby)); set the module's reset switch to G13, not G25, which is
  the speaker's pin (on G25 the Fire is silent).
- **T-Watch S3**: its home is the face -- the time, the day's theme, its virtue over its shadow, chakra and note,
  today's steps, the battery and a TALK button.

On the T-Deck the keyboard types a Wi-Fi password straight in (Enter joins), and a word to a daemon nearby. At home,
any letter starts **A MESSAGE TO EVERYONE NEARBY** over LoRa (C-123): Enter or the ball sends it, Backspace on an
empty one leaves, eighty letters at most.

## The pages

- **Home is the daemon it hosts**, standing in its **den** -- a room that looks like its type (C-113) -- large,
  breathing, walking it and facing its way, now and then hopping, and drawn in its **expression**: glad after a meal,
  drowsy at night, its eyes closed asleep ([Feelings and expressions](Feelings-and-expressions)). Around it, how it
  is: its mood in a word, how it has eaten and drunk today, and at a meal time or at bedtime one quiet line.
- **TODAY** -- the one step: press to tick it off; back undoes it for fifteen seconds. Its milestone shows above it.
- **DAEMON** -- the daemon drawn as the game draws it (its streaks too), its level, friendship and what it holds;
  press for its INDEX entry, in your edition's voice.
- **ROUTINES** -- below.
- **The DAY** -- its theme, virtue over its shadow, chakra and note; press for its note.
- **SWITCH OFF** -- the last page on every board: press, and it is off; the page says how to start it again. Built
  and flashed; the off and its start again are not yet seen.

Any menu left alone goes to sleep (two minutes by default), and waking lands back at home, to a few notes of the title
theme.

## Care

At home, **press** for CARE: **DRINK** (*Drank.*), **FEED** (*Eaten.*), **TRAIN** (*Trained.*), **SLEEP**
(*Asleep.*), or read **ITS INDEX ENTRY** (press there to hear it read aloud). On the three-button boards, A opens
CARE and each button does one (see Controls). The daemon hops and plays its phrase for that care -- a few notes from the
game's own music, in the day's key.

- **A press answers at once** (C-121): the word, the face and the hop are drawn first, and the companion is told
  after, in the background -- kept and sent again until it answers, so the board never waits on the network.
- **SLEEP**: put to bed from 8pm, it sleeps until 6; put down in the day, it naps an hour and a half; tended in
  between, it wakes. Not put to bed, it grows drowsy, with one quiet line at bedtime.
- **Your goals nourish it**: each step you finish counts as a meal and one experience point, which it takes home at the
  next SYNC. It never nags.

The site's and the app's DAEMON tab, the Tab5's DAEMON page and the phone's widget show the same, and tend it the same
way.

## Routines

**ROUTINES** are the board's radios in the game's words, and your party's own routines from the game. A board shows
only the types it has, in this order: GLOW where its HAT is fitted, the CASINO, FLARE, CHORUS, WHISPER, TOUCHSTONE,
LONGWAVE, MESH, LATENT and CONTEXT, PARTY, UPLINK. A board with no radios of its own opens ROUTINES on a **RADIOS** row
(its types) with the party after it (C-118).

| type | routine | what it does |
|---|---|---|
| GLOW (Thermal) | SEE THE HEAT | the heat, live, black through red to white: a ring on the warmest spot, an x on the coolest, and both temperatures |
| GLOW | WARMEST THING | a ring that follows the warmest spot, and its temperature |
| GLOW | SOMEONE'S HERE | five seconds learning the room, then watching: someone walking into view is shown in colour, with one note, and counted |
| GLOW | HOW WARM IS THAT | a thermometer at the middle of the view |
| CASINO | SLOTS | three reels of your party's daemons, played with your game's money (below) |
| FLARE (IR) | TEACH A REMOTE | your daemon learns a remote: press POWER, VOLUME UP, VOLUME DOWN on it in turn |
| FLARE | POWER, VOLUME UP, VOLUME DOWN | sends that button from the remote in use |
| FLARE | THEATER MODE | the board becomes the remote: press for POWER, turn for the volume, back when done |
| FLARE | WHAT REMOTE IS THIS | point any remote at it and press: each press named -- its protocol, bits and code |
| FLARE | CHOOSE A REMOTE | which of the remotes it knows (up to six) FLARE uses; the DEVICE tab can add one by brand |
| CHORUS (every way) | TO EVERY DAEMON | an act -- WAVE, BOW, HUM A TUNE, DANCE ... -- sent to every daemon; on a keyboard board, TYPE A WORD first |
| CHORUS | WHAT CAME | the last ten broadcasts, newest first, each with how it came: L LoRa, B Bluetooth, N the companion |
| WHISPER (Bluetooth) | PAIR MY PHONE, OPEN TO MY PHONE, FORGET MY PHONES | the phone's link over Bluetooth |
| TOUCHSTONE (NFC) | HOLD A CARD | hold a card to the board: what it holds, and what can be done -- PUT your daemon ON IT, TAKE its daemon, SWAP them, WRITE THE NOTE ON IT, or LEAVE IT |
| TOUCHSTONE | READ MY TAG | hold a tag to the board: its kind and its ID. Reads nothing else |
| TOUCHSTONE (a card, through a reader) | A NOTE FOR A CARD | on a keyboard board: type a note; the companion keeps it until a reader writes it onto the next card held |
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

**Each board's own IR pins** (C-150). A board whose IR only sends -- the T-Watch S3 and the StickC-Plus -- has
**FLARE (IR out)**: POWER, VOLUME UP and DOWN, THEATER MODE and CHOOSE A REMOTE. TEACH A REMOTE and WHAT REMOTE IS THIS
need a receiver: the T-Embed CC1101 has one (seen), and the StickS3 has one on its own pins (built, not yet seen).

**GLOW** (C-148) is the StickC-Plus's own sense, through M5Stack's **Thermal HAT** (an MLX90640, 32x24 across 110x75
degrees), found when it is fitted. Fit the HAT with its window facing out, away from the screen, and point the top of
the stick at things. GLOW and talking take turns on one pin, so the microphone rests while a GLOW routine runs. Run on
the board; still to be seen in the hand: the picture's left and right, and SOMEONE'S HERE noticing someone walk in.

**Cards** (C-124). A card is a **host**, as a board is: a daemon put on it moves there, never in two places, and the
companion keeps who is where. A card holding someone else's daemon is a **meeting**, as passing their board is --
nothing changes hands. The readers are the T-Embed CC1101's and the Dial's; they write NTAG213, 215 and 216 cards. A
note typed on the T-Deck (or a Cardputer) is kept by the companion until a reader writes it onto the next card held.
Built; no real card has been held to it yet.

**CHORUS** (C-134) sends a broadcast every way the board has -- LoRa, Bluetooth and the companion -- and each board
shows it once, however many ways it arrives. A broadcast arriving flashes the light and shows its words for a moment,
never with a sound and never on a sleeping board. Every daemon that receives an act answers it once, a few seconds
later. A board that hosts no daemon can hear but not send. See
[docs/BROADCAST.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/BROADCAST.md) and
[Meeting others nearby](Meeting-others-nearby#broadcasts-a-word-or-an-act-to-every-daemon).

**The SI4732's radio** is two routine types: **LATENT** (AM: CHANNEL, and LIGHTNING) and **CONTEXT** (FM: CHANNEL,
and STATIC SYNTH). **CHANNEL is a move the daemon learns**: turn to tune, tap to seek, and hold a clear station a few
seconds -- the daemon attunes to it and has learned that frequency: eight a band, kept on the board, marked on the
dial. While a station plays the daemon speaks it: its sprite, its aura and the ring move with the voice. LIGHTNING
counts crashes on a quiet AM frequency; STATIC SYNTH plays notes from the static between FM stations.

**THE CASINO** (every board, first in the list -- after GLOW on a StickC-Plus with its HAT): **SLOTS**. Three reels of
your daemons -- three of the one on the board is the jackpot -- the party's others (as many as three), a coin, and the
season's own piece (a snowflake, a blossom, the sun, a leaf). The season falls across the reels; on a holiday the reels
dress for it (Halloween's pumpkins and witches' hats, Christmas's presents and red hats, New Year's fireworks ...) with
the holiday's colours on the lights and its own tune on a big win; a quiet day (ANZAC Day, Obon, the Day of the Dead) is
left plain. **The money is your game's**: the board plays with what your save holds plus what it has won or lost since,
and the next **SYNC** writes the difference into the game -- never below nothing, never past 999999. Each pull's result
is decided as the lever goes down, at about 94 back for every 100 bet, as the Game Corner's machines were, so stopping
the reels yourself is the fun of it rather than a skill. On the M5GO and the Fire: A and C the bet, B the lever, then A,
B and C stop the reel above each; held A leaves. A dial turns the bet and presses the lever, then stops the reels left
to right. A touch screen swipes the bet and taps the lever, then taps to stop; held, it leaves. What the board has won
or lost shows beside MONEY on the PROFILE until the SYNC that writes it
([Your game on the companion](Your-game-on-the-companion)).

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
OTHERS NEARBY; and the LORA BAND. The Cardputer ADV's LoRa cap is made for 868-923 MHz, so it takes a 433 setting as
868.

The DEVICE tab's YOUR DEVICES lists every device under its maker -- LILYGO, M5STACK, ESPRESSIF, THIS PHONE -- each with
a small picture of what it looks like, so a desk of boards is easy to tell apart (C-130).
