# The one app

**One app for everything: the game, the companion, the LIBRARY and the NOTEBOOK** (C-186, docs/ONEAPP.md). The
companion's app grew into it -- there is no second app. Play DAEMONS, SEND a daemon out of your party, care for it,
read what the game has given you, and bring it home again, all in one place.

*Internal and in testing.* It is built and run on our own iPhone and iPads; it is not on the App Store or TestFlight.
Whether and how it is published is decided later.

## Where it runs

| | the game | the companion, the LIBRARY, the NOTEBOOK |
|---|---|---|
| **iPhone** | GAME, a tab | every tab |
| **iPad** | upright, GAME is a tab; **on its side, the game on the left and the companion beside it** | every tab |
| **a browser** | the [DAEMONS playground](https://github.com/CodeMusic/daemons-playground): the game with the companion's site in a tab | the companion's site (`./bindCompanion.sh`, or served by [the hub](The-hub-and-its-AI)) -- everything but GAME |
| **a Mac** | **the iPad app** (C-210): it builds for an Apple Silicon Mac and has run on one, launched by hand; a native Mac window comes later | the same app's tabs; or the site |

**TestFlight** for the iPhone, the iPad and the Mac from one build is decided and not done (C-210). It is how a Mac will
get the app to open like any other; the copy that ran by hand was not a way to ship it. Until then, a developer runs it
from Xcode, on My Mac (Designed for iPad).

## The game in the app (C-187)

**Nothing of Nintendo's is in the app.** You give it your own FireRed (for CONTENT) or LeafGreen (for CONTEXT), once,
from Files. The app knows it by its SHA-1, downloads our BPS patch from the DAEMONS release on GitHub, applies it on the
device and checks the result's SHA-1 too. Your original is kept untouched beside it.

It plays with the mGBA core in a web view (EmulatorJS, the same version the playground uses). Under the game: frames
run and drawn, and whether the sound is running.

**The buttons are on the screen** wherever there is a touch screen -- the iPhone and, since C-235, the iPad too (iPadOS
calls itself a Mac, so the game's controls were hidden there). **A controller held on the phone** -- one that clips
round it and gives it a GBA's buttons -- puts the game in the top half of the screen and hides the on-screen controls,
so the phone plays like a GBA (C-234, its first piece; built, still to check by hand).

**Updates.** The list of releases is read live from GitHub. When a newer DAEMONS is out, a strip shows above the game.
One tap remakes the game from your original, and it starts again from the same save.

## One save (C-188)

The game's save **is** the companion's save. Showing the companion pauses the game. SYNC, SEND and RETURN write the
save, and the game starts again from what they wrote (CONTINUE). The rule SYNC has always had -- never write a save
while the game runs -- becomes the app's rhythm.

**Paired with a companion** (a computer or [the hub](The-hub-and-its-AI)), the device's save is the real one. After
each game save the app sends it to the companion, which keeps it as a **mirror** (`mirror.sav` beside its database,
never the save path you set). Boards at home and the hub's AI then see the same daemons. A SYNC from the app pauses the
game, waits for the save to cross, and takes the mirror back before play goes on. Each side is known by SHA-1: when both
have moved, the device wins. Choosing a save path in SETTINGS ends the mirror. *Still to check on an iPad, paired.*

- **A late save never undoes a SYNC.** The app sends the copy it last agreed with; a save arriving after the companion
  has moved on (a SYNC wrote it while the game's save was still on its way) is refused, and the device takes the
  companion's copy at its next look.
- **Another game never takes the mirror's place** -- a new game begun in the app, say. The app offers to keep that
  game on the companion as a save of its own instead, and SETTINGS, **YOUR SAVES** chooses which save the companion
  reads ([Settings](Settings#your-saves), C-215).

## The iPad on its side (C-189)

Turn the iPad on its side (both sides 700 points or more) and the game stays on the left, always playing, with the
companion -- header, tabs and page -- in a column on the right. The game is mounted once, so turning the iPad never loses
play.

**What the game just gave you** opens beside it. Each time the game saves, the save is read again. A NOTEBOOK page just
filed (**JUST FILED**, open to read) or the INDEX card of a daemon just met or bound (**JUST MET**, **JUST BOUND**) shows
above the companion's page until you put it away. What the save already held when the app opened is never "new". It is
known at the game's next save, not before: live memory is not read.

## The LIBRARY while you play

Everything in [Your game on the companion](Your-game-on-the-companion) is here, read from the same save: the
NOTEBOOK, THE GUIDE, THE SUBTLE LAYER, the full INDEX cards in their colours. Each opens when the game gives it, never
before. **READ ALOUD** reads any chapter of THE SUBTLE LAYER or THE GUIDE, or any NOTEBOOK page, a paragraph at a time
(C-208).

**THE ROAD AHEAD** (YOU, C-191): where your save is and the next step, the fights and trainers still ahead, the places
open to you and their wild daemons. Nothing past the next step is shown, and no hidden book or secret is ever in it.
Its words are DRAFT.

## Devices from the app (C-190)

**THE HUB** card, at the top of DEVICES in PLACES, says what the companion you are paired with adds beyond a phone
alone: the save it mirrors, its AI boards answering, its LoRa boards and when each was last heard. A phone alone says
plainly that everything works there but the AI. Under it, **WHO ANSWERS FIRST WHEN YOU TALK** (C-211): the hub's AI
board or n8n, each with a green or red dot ([The hub and its AI](The-hub-and-its-AI)).

The boards are reached over Bluetooth as the phone already carries them ([Boards](Boards)).

## Building it

`./bindCompanion.sh phone` builds the app onto a plugged-in iPhone. `COMPANION_DEVICE=<name or UDID>` chooses which
device, an iPad as well as an iPhone ([Running the companion](Running-the-companion)). A device needs Developer Mode on.
