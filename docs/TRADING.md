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
