# Trading between players (C-218, C-219)

*Asked 2026-10-28: "a trading mechanism ... we send one daemon out to the app and another user can trade with -- it
would suggest we need to make some server on the hub that allows different users (with different saves) to connect,
which relates to the profile feature". Decided the same day by multiple choice; the choices are recorded below.*

## What was decided

| Question | Chosen | Why |
|---|---|---|
| How a trade works | **Send it AWAY, swap at SYNC.** A daemon already AWAY is offered on the hub; another player takes it with one of theirs; each player's next SYNC writes the daemon they receive into the slot their own left. | Nobody needs to be online at the same moment, and it runs on the save writing the companion already does (C-185's gift, C-184's marker). The game's own TRADE CENTER over an emulated link cable is a later ticket (C-221). |
| Two kinds | **TRADE IT** (it becomes theirs) or **LEND IT** (a loan both sides agree to). | A loan is the owner's to **call home** from the app. Each side then hands back the daemon it borrowed, as it is now, and gets its own back. |
| Rules | **As in FireRed.** The original trainer is kept (boosted experience, obedience up to your MARKS), CONTENT and CONTEXT trade freely, and **trade evolutions happen as a daemon arrives**. A loaned daemon does not trade-evolve. | It is FireRed's rule. Invariant 3 means the type chart is the same on both sides anyway. |
| Who can reach it | **The home network and the tailnet.** The hub (CoreMP135) is the exchange; nothing is on the internet. | A public lobby, through the n8n relay or similar, plus proximity links (Bluetooth, LoRa, NFC) is its own decision (C-222). |
| Identity | **A player name plus the device's pairing; a password is optional**, and only for joining as the same player from a second device. | Kids may play: there is no email and nothing they must remember. |
| Fairness | **A daemon is locked while it is offered, and the swap is atomic.** | See below. |

## How it fits together

```
 the app / the site                 this player's companion                 THE EXCHANGE (the hub)
 YOU -> TRADE ---- /api/trade/* ---> tradelink.ts ---- /api/exchange/* ----> exchange.ts
                                     (the save: save/trade.ts)               players, offers, the ledger
 SYNC ----------- /api/sync -------> beforeSync: fetch the inbox,           inbox / handback / written
                                     hand back what a loan asks for
                                     core.sync -> writer.ts `trade`
                                     afterSync: tell the exchange
```

- **The exchange** (`server/src/exchange.ts`) lives on the hub, in the hub companion's own store. Its **players** are
  names with device tokens (only each token's hash is kept) and an optional password (scrypt, never the password
  itself). A new player's device joins with an **invite code** made on the hub's site or on a paired phone: eight
  letters, used once, valid for fifteen minutes. Being on the tailnet is not enough to join.
- **A companion's link** (`server/src/tradelink.ts`) reaches the exchange **in the same process** when this companion
  is the hub, or **over the network** at the address set in TRADE's THE HUB (`trade.hub`). The app and the site only
  ever talk to their own companion.
- **The save's half** (`server/src/save/trade.ts`) reads an AWAY daemon's whole 80-byte record. The exchange gets the
  record and nothing else from the save. The writer (`syncSave`'s `trade` option) puts the arriving record into the slot
  the departing daemon left. The arriving daemon is set AWAY, marked for the game to finish on load (unusedRibbons
  bit 2, as C-184), and, in the party, given its level and stats.
- **Trades follow the game, not the file.** Every offer and delivery is keyed by the game's own identity (name, ID
  No., secret ID), so a delivery is written only into the game it was meant for, whichever save the companion is
  reading now (C-215).

## Fairness: no daemon kept and traded at once

- An offered daemon is in **one trade at a time**, and a borrowed one cannot be offered onward.
- **The swap is agreed in one write** of the exchange, so two players cannot both take the same offer.
- **The ledger**: once a daemon has left a game in a trade, that game cannot offer it again. A restored older save that
  still holds it is refused. A daemon that legitimately comes back (traded back, or a loan returned) belongs to its
  game again.
- **Each delivery is written once**: SYNC keeps what it wrote until the exchange has heard.
- **The game's lock** (DAEMONS T-467): the game will not bring a daemon on offer home. Until it does, the writer will
  not trade away a daemon the game has brought home, and that trade waits.

## Phases

1. **Profiles and trading on the tailnet** (C-218, C-219). Built 2026-10-28: the exchange, the link, the save
   writing, TRADE on the YOU tab (app and site), tests (`server/test/trade.test.ts`) and a run on two companions with
   synthetic saves. Still needed:
   - **The game's half (DAEMONS T-467)**: the lock while a daemon is offered, a received daemon finished on load (the
     INDEX, "FIRST MET: A TRADE"), and trade evolutions, with none for a loan.
   - ~~The phone hosting alone~~ (built: `app/local.ts` trades through the hub named in THE HUB).
   - ~~Rate limits on join~~ (built: eight wrong tries from one address in ten minutes, then a pause).
2. **Pair trade evolutions** (DAEMONS T-468): two species that each evolve only when traded for the other. Design
   first, in the game's bible.
3. **Later**, each with its own ticket:
   - **Daemons meet and chat** (C-220): two daemons sent out appear together on the app or a device, and talk through
     the LLM modules, each in its own personality.
   - **The link cable** (C-221): the game's own TRADE CENTER, and link battles between two app emulators through the
     hub.
   - **A lobby beyond the tailnet** (C-222), plus proximity links over Bluetooth, LoRa and NFC. **The forward path**
     (decided 2026-10-28): for now a new player needs the tailnet, which is fine before a real release. For a launch
     with many players, **a multi-user exchange runs on roverbyteseer, on a codemusic subdomain over https**, and it
     talks to each home's inner hub (the CoreMP135), which keeps its own players, saves and devices. The incoming
     **Tiiny AI** gives roverbyteseer room for many requests and larger models, which C-220's chats would use. What
     already fits it: the exchange speaks HTTP with a per-player token, and a companion's THE HUB takes any address,
     so pointing it at the public exchange is a change of address. What it will need: https, accounts and abuse
     handling decided first (kids), and the home hub passing its players' trades through.
   - **Friends and gifts** (C-223): a friends list, a gift with no return (an item or a daemon), and shared dreams.
   - **Battles** (C-224): one player's daemons against another's, through the hub, outside the link cable as well.

Every word the player reads is DRAFT.

## THE COMMONS: trading between homes (C-222, first round built 2026-10-28)

*Decided by multiple choice, 2026-10-28: through the home hub; the home hub vouches for its players; friends only;
built and run on the tailnet first.*

```
 a player's phone / device ──> its HOME HUB (CoreMP135) ──> THE COMMONS (roverbyteseer:4750, tailnet only)
                                players, saves, devices      homes, friends, the trades between homes
```

- **Homes, not people.** A hub registers its home once (THE COMMONS card on the hub's TRADE: the commons' address
  and the home's name). It waits until **the keeper approves it on the commons' own machine**
  (`curl -s localhost:4750/commons/keeper`, then `curl -s -XPOST localhost:4750/commons/approve -d '{"id":"h1"}'`).
- **The hub vouches for its players.** The first time a player trades on the commons, the hub asks for a token for
  them, and they appear there as "KIT · KIT HOUSE". No password, nothing personal.
- **Friends only.** Each approved home has a friend code. One home asks with the other's code, and the other accepts
  on its hub. Until then neither sees the other's players or offers.
- **Devices never change address.** Phones and boards go on talking only to their hub. The hub's exchange shows the
  friends' offers beside the home's own (their ids begin `c:`), and passes every request for one to the commons. An
  offer is made to THIS HOME or to FRIENDS' HOMES. SYNC fetches both inboxes.
- **If the commons does not answer**, the home's own trading goes on as before.
- **Code:** `server/src/commons.ts` (homes, approval, friends, reach), `commons_api.ts` and `commons_main.ts` (its
  own HTTP server and database), `commonslink.ts` (the hub's side), and `keys.ts`. Trades are `exchange.ts`'s, with a
  reach rule. Tested end to end in `server/test/commons.test.ts`: two homes over HTTP, approved, friends, traded, each
  SYNC writing its own save.

### Running the commons on roverbyteseer

```sh
git clone https://github.com/CodeMusic/daemons-companion && cd daemons-companion/server && npm ci
COMMONS_HOST=0.0.0.0 COMMONS_PORT=4750 npm run commons     # Node 22+; COMMONS_DB names its database
```

Keep the port closed to the internet: only the tailnet reaches it, until accounts and abuse are decided (C-226).

### Where it goes next (the user, 2026-10-28)

- **No Tailscale for a player** (C-228): install the app, choose your ROM, make an account, and it all works. Devices
  ship pre-flashed, and the app updates their firmware over the air.
- **Personal accounts** (C-226), once security allows, most likely on a cloud service with security groups. The
  commons moves there from roverbyteseer, which first serves internal testing with the Tiiny AI.
- **A lobby like Nintendo's** (C-227): friends, invite codes and players detected nearby, safe for kids.
