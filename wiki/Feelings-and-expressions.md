# Feelings and expressions

A hosted daemon has feelings, and every host shows them on its face -- the boards, the app, the home-screen widget, the
Tab5, the BOX-3 and the T-Watch S3's DAEMON and CLOCK faces -- from the daemon's own sprite, standing in its den (on the
watch, on a hill under the season's sky). Nothing is drawn for any one daemon, so it works for every daemon you bring
from the game.

## The den (C-113)

A daemon lives somewhere, and the place looks like its type.
[`server/src/dens.ts`](https://github.com/CodeMusic/daemons-companion/blob/main/server/src/dens.ts) describes one den a
type: the type's colour, as the game colours its sprites, and a motif for what the type is -- FLOW waves, STRATUM
layers, LEGACY a cairn, OPAQUE a box you cannot see into -- with a second type tinting the floor. No words: a den is
only somewhere to be. Every host is sent the description and draws it itself, the daemon walking it and facing its way;
the BOX-3's pictures are drawn by the companion.

## The feelings (C-120)

[`server/src/feelings.ts`](https://github.com/CodeMusic/daemons-companion/blob/main/server/src/feelings.ts), carried
over from the AI harness that plays the game:

| feeling | humour | range |
|---|---|---|
| GLAD | sanguine | 0 .. 100 |
| MAD | choleric | 0 .. 100 |
| SAD | melancholic | 0 .. 100 |
| CALM -- AFRAID | phlegmatic | -100 .. 100, the one feeling with two sides |
| RESTLESS | a drive, not a humour | 0 .. 100 |

- **They are read, never stored.** Like the daemon's day, they are worked out from what you have done together and the
  clock, on the computer or on a phone hosting alone.
- **Each event fades on its own clock** -- half gone in three hours. A meal makes it glad; three hours later, half as glad.
- **It knows what it is answering.** Each event's share is kept apart, so the strongest feeling is tied to the event
  behind it: near in time, strong in kind.
- **The clock adds a few events of its own**: a meal time that passed with nothing eaten (sad), being woken while it
  slept (a little cross and startled), a night up alone, never put to bed (uneasy). Empty time builds RESTLESS; anything
  you do together settles it.
- **A feeling is never named on a screen.** It shows; it is not labelled.

## The expressions (C-119)

[`server/src/expressions.ts`](https://github.com/CodeMusic/daemons-companion/blob/main/server/src/expressions.ts):
asleep and drowsy come first, then the feeling furthest past its threshold, else awake.

| expression | the body's colours | pose | mark | eyes |
|---|---|---|---|---|
| awake | as they are | walks, breathes | -- | -- |
| drowsy | dimmed a little | slower | z | half-lidded |
| asleep | dim and cool | still, lower | zZ | closed |
| glad | warmer, brighter | lifted, a bigger breath | heart | an upturned arc |
| sad | grey and cool | low, a small breath | drop | half-lidded |
| mad | redder | a shake | a cross vein | -- |
| afraid | pale | a shake, small | ! | -- |
| restless | a little flat | quick | ... | -- |

Every sprite the game exports shares one palette layout, so an expression is a **shade** of the body's colours (the
routines' streaks are kept), a **pose**, an 8x8 **mark** above the head, and **eye patches**. The server -- or a phone
hosting alone -- decides which shows and sends every host a finished description; the hosts only draw it.

## The eyes

The eyes change only for daemons whose eyes have been **checked by a person** --
[`server/data/faces.json`](https://github.com/CodeMusic/daemons-companion/blob/main/server/data/faces.json): each eye a
box in the 64x64 sprite, the palette colour around it (`fill`) and its own (`line`). A daemon without checked eyes still
takes everything else.

`tools/faces.ts` suggests eyes for the rest (`server/data/faces.suggested.json`), growing each one it finds to the
whole socket -- the dark, the glint and the iris -- so that closing it leaves no rim behind. It still boxes ears and
antennae as readily as eyes, so its guesses are checked before they move across -- and **checked asleep**: a box that
sits on an eye is not enough if the sleeping face still looks awake. 44 daemons have checked eyes today.

```sh
cd server
npx tsx tools/faces.ts --sheet /tmp/faces          # picture sheets: green checked, yellow a suggestion, red none
npx tsx tools/faces.ts --write                     # after editing faces.json: its colours filled in
npx tsx tools/expressions.ts /tmp/look.png caremusai relay   # any daemon in every expression, as the hosts draw it
npx tsx tools/expressions.ts --only awake,asleep /tmp/check.png NAME...   # the check: do its eyes really close?
```

## The mouths (C-138)

On the BOX-3 the daemon speaks Home Assistant's answers, and its mouth moves -- but, as with the eyes, **only a mouth a
person has checked is drawn** (`mouth` in `faces.json`). `tools/mouths.ts` suggests one, looking only below checked eyes
(`server/data/mouths.suggested.json`). 24 daemons have checked mouths today; the rest speak with a speech bubble.

**One open mouth for every host** (C-213): the same open mouth is in the expression the boards receive, the BOX-3's
face and the app's picture (`/art/party/N.png?mouth=open`). The app opens and shuts it on a beat while TALK, LISTEN or
READ ALOUD plays, and the T-Watch Ultra mouths its words on TALK. A daemon with no checked mouth bobs on the beat
instead.

```sh
cd server
npx tsx tools/mouths.ts --sheet /tmp/mouths.png      # each suggestion boxed, and the mouth open
npx tsx tools/boxface.ts /tmp/box.png caremusai      # the BOX-3's faces as the server draws them, every phase
```

## Tuning

The numbers are drafts: each event's push (`PUSHES` in feelings.ts), the half-life, the thresholds (`SHOWS` in
expressions.ts) and each expression's shade, pose and mark. Change them there; every host follows.
