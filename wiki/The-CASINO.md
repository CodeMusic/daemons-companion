# The CASINO

**THE CASINO** is a routine type with one routine, **SLOTS**: three reels, seven bets, and your game's money. It is on
every board, and on the phone, the site and the Tab5, each playing as a device of its own -- its coins, its seat at the
table and its cheers are its own (C-149, C-155). Its odds move with the day and the world outside (C-158), and whoever
else is at the reels sits at the same table (C-151). Every word on its screens is a draft.

## Where to find it

| where | how | state |
|---|---|---|
| a board | ROUTINES, **CASINO**, SLOTS -- the first type (after GLOW on a StickC-Plus with its HAT). A board with no radios of its own opens ROUTINES on its party, under a first row, **CASINO AND RADIOS** | **runs** -- seen on the Fire, the T-Embed CC1101, the T-Deck and the T-Watch S3 |
| the phone and the site | DAEMON, **Routines**, **THE CASINO** | built; seen on the site |
| the Tab5 | DAEMON, **ROUTINES**, **THE CASINO** | flashed; not yet seen with the companion's answers (the Tab5 has been off its Wi-Fi) |

**THE HOUSE** sits beside it on the phone, the site and the Tab5 ([below](#the-house)).

## The reels

| piece | what it is |
|---|---|
| **the JACK** | the daemon this device hosts -- three of it is the jackpot |
| three more daemons | ones your save has SEEN in the INDEX: those NATIVE to this season or this hour first, then your party's. They change each hour, and as you play the game, new ones come to the reels |
| **the COIN** | |
| **the season's piece** | a snowflake, a blossom, the sun or a leaf -- on a holiday, the holiday's own (a pumpkin, a present, a heart ...) |

What a pull pays, for each coin bet, the bet included:

| on the line | pays |
|---|---|
| the season's piece on the first reel | 1 -- the bet back |
| two JACKs on the first two reels | 2 |
| three of the season's piece | 4 |
| three COINs | 6 |
| three of one of the other daemons | 12 |
| three JACKs | 50 -- the JACKPOT |

The bets are 10, 20, 50, 100, 200, 500 and 1000, never more than the money there is. **The result is decided as the
lever goes down**, and each reel then slips on to its piece when you STOP it, or stops by itself -- so stopping the
reels is the fun of it, not a skill. A win of 12 or more is a **big win**, called to the table ([below](#the-table)).

## The coins are your game's money

The CASINO plays with the MONEY your save holds, plus what every device has won or lost since the last SYNC. Each device
tells the companion its results -- every ten pulls and as it leaves the reels (the phone and the site every minute
too). The companion counts each report once, however many times it is sent, and never one that claims more than its
pulls could come to. A board or the Tab5 left mid-spin settles the pull first.

The next **SYNC** writes the difference into your save, after the backup every SYNC makes -- never below nothing, never
past 999999 -- and says what it brought: *The CASINO won ... over ... spins: MONEY ... to ...* Until then YOU says it
beside MONEY, and TODAY under YOUR GAME ([Your game on the companion](Your-game-on-the-companion#the-casinos-coins)).

## The day's odds

Over many pulls, every table pays back **between 90 and 100 of every 100 bet**. Where, the day decides: an ordinary day
keeps a small house edge (95 back), and a lucky one reaches even. The day's luck adds up from four things, each said in
words:

| | a little luckier | a little less lucky |
|---|---|---|
| **a holiday** | St Patrick's Day most of all -- the luck of the day; any other, a festive table | -- a quiet day is left as it is |
| **the weather** | a clear sky; snow outside | fog; rain; a storm most of all |
| **the hour**, by the game's own watches | DAWN (5 to 7am); DUSK (6 to 8pm) | NIGHT (8pm to 5am) |
| **the season**, by your edition | spring; summer | winter |

DAY (7am to 6pm), a grey sky and autumn leave it as it is. Every number is a draft
([`server/src/context.ts`](https://github.com/CodeMusic/daemons-companion/blob/main/server/src/context.ts)).

**The weather is real**: the weather now in one city you name on SETTINGS, **THE WEATHER**, from
[Open-Meteo](https://open-meteo.com), which needs no account. Only the city is kept, with the weather it last had, and
its weather is asked every fifteen minutes while one is set. With no city set, nothing is fetched and the weather plays
no part. The season is your edition's: CONTENT keeps the northern year, CONTEXT the southern.

### The cat and the string

Within the day, each player keeps a **string** of its own, the way a cat is played with: a string always out of reach,
or always within it, is soon dull. After every pull the string learns -- a step against how far its wins have come from
what the table expects -- so a run without a win brings it nearer, a win takes it away, and a little noise keeps it from
being foreseen. It moves one pull's return by at most four points either way, and over many pulls it comes to nothing:
the day's return is what comes back.

### So close

A loss often falls **near**: two alike on the line, and the third reel stopped with the winning piece one place off it
-- **SO CLOSE**. Two JACKs (a 2x) show a third JACK just off the line: **ALMOST THE JACKPOT**. A near miss is chosen
from what really sits beside the wanted piece on that reel, so the piece is always there to see. The nearer the string,
the oftener a loss falls near: from a quarter of them to three in five. Seen on the T-Watch S3.

## THE HOUSE

Beside THE CASINO -- DAEMON, Routines on the app and the site; DAEMON, ROUTINES on the Tab5 -- from `GET /api/casino`:

- **TODAY'S ODDS** -- what the day pays back of every 100, with the holiday, the hour and the weather. A tap opens why:
  each reason in points of return.
- **AT THE REELS** -- every device at the reels through the companion (your boards, the phone, the site, the Tab5),
  each by the daemon it hosts, with what it plays at. A tap opens its reasons, the string's among them: how many pulls
  since a win, how many wins running.

THE HOUSE is kept on the computer: a phone away answers it when it can reach the companion, and a phone hosting on its
own has none.

## How it is dressed

The companion decides once what the CASINO wears today, and every screen draws the same (`casino.dress` in each
device's state):

- **The look**: the holiday's; else the weather outside, when it is weather to notice -- rain, a storm, fog, snow, or a
  clear night's stars; else the season's own -- snow, petals, sun or leaves. It falls, rises or glints across the reels.
- **The colours**: the holiday's two, else the season's -- on the band, the lights and the drawn pieces.
- **A hat** on the reels' daemons, on a holiday that has one -- set on the top of each daemon's head, where its own
  picture shows the head to be. Never on a quiet day.

The pieces the boards draw -- the COIN, the season's and the holidays' pieces, the hats -- are drawn the same on the
phone, the site and the Tab5, in the day's colours. The T-Watch S3's DAEMON and CLOCK faces wear the same sky and
weather ([Boards](Boards#the-t-watch-s3)). **State**: built on every screen; the holiday hats on the phone, the site and
the Tab5 are not yet seen on a holiday.

## Holidays

The companion keeps the game's own table of holidays, by their real names
([`server/data/holidays.json`](https://github.com/CodeMusic/daemons-companion/blob/main/server/data/holidays.json),
exported from DAEMONS): each month one common to both editions, one for CONTENT's northern year and one for CONTEXT's
southern. Your save's edition decides which it keeps; on a day with two, its own shows. A holiday:

- names the CASINO's band, in its own colours, and dresses the reels and the lights for it -- Halloween's pumpkins and
  witches' hats, Christmas's presents and red hats, New Year's fireworks ... On the boards, April Fools' Day stands the
  daemons on their heads;
- plays its own tune on a big win;
- brings a little luck -- St Patrick's Day the most.

A **quiet** day -- ANZAC Day, Obon, the Day of the Dead -- is named and left plain, its odds as they are.

## The table

Whoever sits at the reels sits at one table (C-151):

- **A board** at the reels says so every way it has: a TABLE frame over LoRa every half minute (never passed on), a mark
  in its Bluetooth beacon, and the companion. So its table is everyone nearby at the reels -- other people's companions
  too -- and your own devices anywhere. Who is there shows on the line between the band and the reels; with nobody, the
  day's biggest reason (*TODAY: ...*).
- **The phone, the site and the Tab5** show AT THE TABLE above the reels: your own devices at the reels, through the
  companion. YOU says who is at the CASINO now, under MONEY.
- **A big win** -- three of a daemon, or the JACKPOT -- goes to every daemon as an act, BIGWIN or JACKPOT. At the table
  it is called out across the reels (*... WON BIG!*, *... HIT THE JACKPOT!*) with the lights and a cheer, and every
  daemon there answers it; each answer is a cheer the winner sees (*..., ... CHEER*). Away from the reels it arrives as
  a notification and is never answered: only players cheer.
- **Names and big wins only**, never an amount. No money moves between games.
- **A word to the table**: on a keyboard board, a letter at the reels starts one, and Enter says it. A word another
  daemon says to everyone shows on the table's line for a while, on the boards, the phone, the site and the Tab5.

**State**: seen on the T-Deck and the T-Embed CC1101, each naming the other at the table; a word typed on the T-Deck
reached the CC1101, and a jackpot was called out there and cheered back. Not yet seen: the TABLE frame between two LoRa
boards.

## Sounds

Every device plays the boards' own CASINO tunes, on the day's note: the lever, a loss, a win, a big win and the jackpot
-- and on a holiday, the holiday's own for a big win. The phone and the site play them on your game's own instrument
(the Tab5's is built, not yet flashed; [Settings](Settings#sound)). A device's own SOUND turns them off.

## Controls

| where | the bet | the lever | stop | leave |
|---|---|---|---|---|
| the M5GO, the Fire, the T-Display-S3 Pro | A and C | B | A, B and C, the reel above each | hold A |
| a dial (the T-Embeds, the Dial) | turn | press | press, left to right | the top button, or hold the dial |
| the StickS3 | the side button | the front | the front | hold the side |
| a touch screen (the T-Watch S3, the CoreS3) | swipe up or right for more, down or left for less | tap | tap | hold, or the watch's crown |
| a keyboard (the T-Deck, the Cardputers) | + and - | space or Enter | 1, 2 and 3 | Backspace |
| the phone, the site, the Tab5 | BET - and BET + | SPIN | STOP, under each reel | leave the CASINO |

Down a board's cable, `KEY RIG <0..6>` decides the next pull for a check -- shown and called to the table as any other,
and never paid ([Flashing and linking](Flashing-and-linking#checks-down-the-cable)).

The rules are one copy every player keeps:
[`server/src/slots.ts`](https://github.com/CodeMusic/daemons-companion/blob/main/server/src/slots.ts) for the phone, the
site and the server, and
[`firmware/common/slots.h`](https://github.com/CodeMusic/daemons-companion/blob/main/firmware/common/slots.h) for every
board and the Tab5, held to it by a test.
