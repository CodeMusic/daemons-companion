# Accounts and safety (C-226)

*A design, DRAFT, 2026-11-11. **All five pieces are built** (below); what is left before it opens is the user's,
step by step in `docs/OPENING.md`. It is the account half of going public (C-278): before
`api.daemons.codemusic.ca` opens, a player needs an identity that does not depend on a home hub, and kids may be among
them.*

## The four decisions (the user, 2026-11-11, by multiple choice)

| | Decided | Why |
|---|---|---|
| Who holds an account | **A guardian holds the account; kids are profiles inside it.** A child never gives an email, an age or a password. | What COPPA and GDPR-K expect, and how Nintendo's family groups work: the grown-up is the one the service knows. |
| How they sign in | **Sign in with Apple or Google for the guardian, then a passkey on each device.** | We keep no password. Recovery is Apple's or Google's. A passkey is phishing-proof and needs nothing remembered. |
| The name others see | **Built from word lists, never typed** (e.g. QUIET KERNEL). Friends may also see a nickname the guardian approves. | Nobody can show a real name, a rude word or a way to be contacted. |
| Where it lives first | **roverbyteseer, behind C-278's Cloudflare Tunnel**, as plain HTTP + SQLite that moves to a cloud service later unchanged. | Matches C-278. Nothing to pay for until there are players to pay for. |

## What it builds on

- **The exchange** (`server/src/exchange.ts`): players with a per-player token (hashed), invite codes (eight letters,
  once, fifteen minutes), an optional password (scrypt), friends, offers, a ledger. Names today are typed freely,
  2-12 letters.
- **THE COMMONS** (`commons.ts`): homes approved by a keeper, each vouching for its own players; friends by friend code.
- **What players may say**: nothing. Meetings are model-written and pass `meetsafe.ts` (no links, contacts, places,
  real names or rudeness); there is no player text anywhere, and that stays true.

## The shape

```
GUARDIAN  (Apple or Google id -> one guardian; no password kept)
  ├── PROFILE  "QUIET KERNEL"   (a player: games, friends, offers, ledger)
  ├── PROFILE  "BRIGHT SOCKET"
  ├── DEVICE   a phone, a tablet, a Mac  (a passkey each; may be given to one profile)
  └── HOME     a hub it owns (optional: the CoreMP135 dials out, C-278)
```

- **Guardian**: made by signing in with Apple or Google. We keep the provider's stable subject id and nothing else
  we do not need; no name, and the email only if the provider hands over the relay address (Apple's private relay is
  fine). An adult playing alone is a guardian with one profile.
- **Profile**: what the exchange calls a player today. It has a public name from the word lists, an optional
  friends-only nickname the guardian approves, and its games. A profile never signs in: it is opened on a device the
  guardian gave it.
- **Device**: a passkey (WebAuthn) registered by the guardian, or a device token handed over with a one-time code
  the guardian makes, as invite codes work today. A kid's tablet gets the second kind: the guardian's phone shows a
  code, the tablet types it, and it opens that profile only.
- **Home**: a hub linked to a guardian replaces the commons keeper's manual approval for that guardian's own home.

## The guardian's controls

Each is per profile, set in the app's GUARDIAN screen, with the safest choice first:

| Control | Choices (default first) |
|---|---|
| Friends | the guardian approves each one / the profile may accept on its own |
| Who may trade, lend or give with it | friends only / friends and players at home / anyone in the lobby |
| Meetings (C-220) | friends only / anyone it trades with / off |
| The lobby and players nearby (C-227) | off / on |
| The friends-only nickname | none / approved text |

The guardian also sees each profile's ledger (every trade, loan and gift), can **block** and **report** a player,
and can **delete** a profile or the whole account: its offers withdrawn, its loans called home, its records erased
within 30 days.

## Names from word lists

Two lists, one word from each: **QUIET + KERNEL**. Picked from, never typed. The lists are the game's own words
(DRAFT until approved): an adjective list in the game's voice, and a noun list drawn from daemon, item and place
words. Rules for the lists:

- No word that is a name, a place, a body part or a slur in any common language, checked by a filter at build time.
- No pair that reads as a sentence about someone (the pair list is checked too).
- Two players may share a name; a four-digit tag the player never chooses tells them apart in a lobby (QUIET KERNEL
  #4410). Friends see only the name.

## Sign-in, step by step

1. **Guardian sign-in**: the app runs Sign in with Apple (iOS, Mac) or Google (the web, Android). The server checks
   the ID token against the provider's published keys (JWKS), audience and expiry, then makes or finds the guardian.
   Apple requires Sign in with Apple wherever Google sign-in is offered, which this satisfies.
2. **Passkey**: the app then registers a passkey for that device. Later sign-ins use the passkey; the provider is
   only needed again for a new device or recovery.
3. **Profiles**: the guardian adds a profile by picking its name. An existing hub player is **claimed** by the
   guardian with a code from the hub's site (the hub's player becomes a profile; its offers, ledger and friends come
   along).
4. **A kid's device**: the guardian makes a one-time code (eight letters, fifteen minutes) for one profile; the
   device enters it and gets a device token for that profile only, revocable from the GUARDIAN screen.

## Safety, in one list

- **No player text, anywhere.** Names from lists; meetings model-written and filtered; no chat.
- **Nothing that locates anyone**: no location, no school, no real name, no photos. Players nearby (C-227) is a
  match on a rotating beacon id, never a position.
- **Least data**: the provider's subject id, the profiles, their games and ledger. No analytics on profiles.
- **Rate limits and caps** at the tunnel and in the server (the commons' 256 KB body cap and per-address limits
  carry over), per guardian and per device.
- **Report and block**, reviewed by the keeper; a blocked player cannot see, offer to, or meet the profile.
- **Tokens** hashed at rest, as the exchange's are; passkeys hold no secret on the server.
- **Before it opens**: a privacy policy and the App Store privacy labels; a review of COPPA's verifiable parental
  consent (a guardian's Apple or Google account is an adult account, but whether that suffices needs checking);
  the app https-only to the public address.

## Where it runs

On roverbyteseer, beside THE COMMONS, as one more Node process with SQLite, reached only through the Cloudflare
Tunnel at `api.daemons.codemusic.ca` (C-278). Everything shared moves behind it: accounts, the exchange, friends,
THE COMMONS. A home hub stays a home hub: it dials out, keeps its devices and saves, and is something a player may
have rather than something they need. Moving to a cloud service later (C-226's original note) is a change of host,
since nothing depends on roverbyteseer being a Mac.

## The build, in pieces

1. **Server**: guardians (ID-token check), profiles, device codes, passkeys (WebAuthn), the controls, delete. Tests
   with a fake provider's keys.
2. **Names**: the two word lists (DRAFT), the build-time filter, the tag.
3. **App**: the GUARDIAN screen (sign in, profiles, devices, controls, ledger, delete) and a profile picker.
4. **The exchange on accounts**: offers, friends and the ledger keyed by profile; a hub player claimed into one.
5. **Before it opens**: the privacy policy, the consent review, the tunnel, rate limits at Cloudflare.

## Piece 1, built 2026-11-11 (DRAFT)

On THE COMMONS' server (`npm run commons`, roverbyteseer), every `/accounts/` request: `server/src/accounts.ts` (the
guardians, profiles, kids' devices, controls, passkeys kept, delete -- no Node imports), `idtoken.ts` (an Apple or Google
ID token checked against the provider's JWKS: RS256, issuer, audience, expiry), `webauthn.ts` (passkeys with no library:
the new key taken, every sign-in's signature, site, page, presence and counter checked), `accounts_api.ts` (the routes,
listed at its top). Sign-in, a passkey sign-in and a device's code are rate-limited with the commons' own tries.
`server/data/names.json` holds the two lists (piece 2: 48 words each, every one kept by the user 2026-11-11, checked by `server/test/names.test.ts` against `server/data/names_check.json`). Tests: `server/test/accounts.test.ts` (a fake provider's
keys, a P-256 passkey made as a phone would).

Set on the commons' machine, in its environment (none are secrets):

| Variable | What |
|---|---|
| `ACCOUNTS_APPLE_AUD` | the app's ids with Apple (its bundle id; a Services ID for the web), comma list |
| `ACCOUNTS_GOOGLE_AUD` | the app's OAuth client ids with Google, comma list |
| `ACCOUNTS_RP_ID` | the passkeys' site: `api.daemons.codemusic.ca` once C-278's tunnel is up |
| `ACCOUNTS_ORIGINS` | the pages a passkey may answer from, comma list |

Unset, sign-in and passkeys answer that they are not set up. Not yet: the app's GUARDIAN screen (piece 3), the
exchange on profiles (piece 4), and the server reachable from outside the tailnet (C-278).

## Piece 3, built 2026-11-11 (DRAFT)

The app's GUARDIAN card on YOU (`app/screens/you/Guardian.tsx`), through the hub: the hub passes `/api/accounts/<path>`
to `/accounts/<path>` on the commons it is linked to (`server/src/accountslink.ts`), with the device's own tokens, which
the app keeps in the keychain or the site's storage (`app/platform/accounts.ts`) and never queues offline. Sign in with
Apple waits on `expo-apple-authentication` in the phone lane's next build; until then the card says so. For trying it,
`ACCOUNTS_DEV_SIGNIN=1` on a scratch commons signs a guardian in by name, from that machine only.

## Piece 4, built 2026-11-11 (DRAFT)

The exchange on profiles, on THE COMMONS (`server/src/profiletrade.ts`). A profile is a player there in one of two ways:

- **Claimed**: a home's player, claimed into a profile by its guardian with PLAY AS IT HERE on the GUARDIAN card. The
  app sends the guardian's token to its companion (`/api/trade/claim`), the hub passes it to the commons with its
  player (`/commons/x/claim`), and the player keeps its offers, ledger and friends and takes the profile's name
  (QUIET KERNEL #4410). Its hub goes on speaking for it as before.
- **Made for it**: a kid's device with no home trades as its profile through `/accounts/x/<name>` (the exchange's
  own requests, the device token as `x-daemons-profile`). The app does not use this path yet: it is for when the
  commons is reachable from outside the tailnet (C-278).

The controls decide who reaches a profile, and **both sides' rules hold** (two players reach each other only when
each one's controls allow the other):

| | |
|---|---|
| TRADES WITH | friends -- only friends; + home -- friends, or the players its home already reaches; + lobby -- anyone |
| MEETINGS | friends / anyone it has traded with / off -- meetings, OUT TOGETHER, shared dreams, battles |
| FRIENDS | I approve -- a friend it asks for or accepts waits on the guardian's YES; it decides -- it accepts its own |
| Blocked | a player the guardian blocked never reaches the profile, either way, and is unfriended |

Each profile has a **friend code** (eight letters and digits), shown on TRADE's FRIENDS card and on a kid's device,
which another player types to ask. The GUARDIAN card shows each profile's code, the friends waiting (YES / NO), the
players blocked (UNBLOCK), and ITS TRADES: the ledger (every trade, loan and gift) and its friends, each of whom can be
blocked. Removing a profile or deleting the account takes it off the exchange: open offers withdrawn, loans called
home, friends forgotten; a claimed player goes back to its home.

At home, a claimed player carries its trade and meeting controls (the commons hands them back with each board and
the hub keeps them, `commonslink.ts localReach`): a profile that trades only with friends does so at home too. Making
friends at home stays open -- the home is the family's own. Tests: `server/test/profiletrade.test.ts`.

Not yet: the commons on roverbyteseer runs the old code until sign-in is set up there (piece 5); blocking from an
offer rather than a friend; the lobby itself (C-227), which the "+ lobby" choice anticipates.

## Piece 5, built 2026-11-11 (DRAFT)

`docs/OPENING.md` holds the checklist, the consent review, the drafts (privacy policy, labels, retention, security)
and the tunnel's steps. Decided by the user, by multiple choice: **nicknames friends only** -- a profile's daemons
show their species name to anyone not its friend, and a daemon it trades, lends or gives to a non-friend arrives with
its nickname and trainer name rewritten (C-346: the species' name, the profile's first word; a loan gets its own back); **an age check at guardian sign-in** from the device's own signal (C-345 makes the iOS module); **an
account unused for two years is erased**. Built: the public listener the tunnel points at, where nothing is the
keeper's machine; passkeys only from https; the guardian's export; the daily erasing. Tests: `server/test/opening.test.ts`.

## Still open

- Whether a teenager (13+) may hold a profile its guardian does not manage.
- What the keeper reviews when a report comes in, and how quickly.
