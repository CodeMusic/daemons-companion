# Trading

Trade a daemon with another player -- someone else with their own game -- through the hub (C-218, C-219). Nobody needs
to be online at the same time: you offer, they take it when they like, and each game changes at its own next SYNC.

*Where it stands*: built on 2026-10-28, on the app (TRADE, in YOU), the site and a phone hosting alone, and run between
two companions on test saves. The game's half -- a daemon in a trade kept AWAY, a loan the game knows, a daemon that
arrives finished on load -- is in DAEMONS v11.316.4. A trade between two real players' games has not yet been seen.

## Before you trade: join

Trading goes through **the exchange**, which lives on the hub (the companion running on the home server). Everyone who
trades is a **player** there.

- **On the hub's own companion**, open **YOU**, TRADE, choose a player name, and JOIN. That is all.
- **Anyone else** -- another person's phone, or a second companion -- first sets **THE HUB** on TRADE to the hub's
  address, `http://<hub>:4730`: the hub's plain name or its Tailscale address. From build 800 the iPhone and iPad app
  takes the hub's `.ts.net` name too; earlier builds needed its plain name or its Tailscale address. Then it joins
  with an **invite code**. Make one on the hub's TRADE, **INVITE A PLAYER**: eight letters, used once, good for
  fifteen minutes.
- **A password is optional.** Set one on TRADE, **A PASSWORD**, and the same player can join from another device. No
  email is ever asked for.
- **Eight wrong codes or passwords** from one address in ten minutes, and the exchange refuses that address until
  ten minutes have passed: wait, or ask for a new invite code.
- The exchange is on the home network and the tailnet only. It is not on the internet, and the relay
  ([Away from home](Away-from-home)) never reaches it.

## Offering and taking

1. **SEND** the daemon from the game, so it is AWAY, and SYNC. Only a daemon AWAY can be traded.
2. On TRADE, **OFFER ONE OF YOURS**:
   - **TRADE IT** -- it becomes theirs, and theirs yours;
   - **LEND IT** -- you each lend one, and either of you can **CALL MINE HOME** later; both come back.
   Offer it to **ANYONE**, or to one player.
3. Another player sees it under **OFFERS**, presses **TAKE IT**, and chooses one of their own AWAY daemons to give.
4. **Each of you SYNCs.** The daemon you receive goes into the slot yours left, AWAY, and the game finishes it the next
   time it loads: it is entered in your INDEX, FIRST MET says **A TRADE**, and a daemon that evolves by trade evolves
   (unless it holds an EVERSTONE). You see "*NAME* arrived in a trade."

A traded daemon keeps its original trainer, as in FireRed: it gains more experience, and obeys you up to your MARKS.
CONTENT and CONTEXT trade with each other freely.

## Loans

- **A borrowed daemon is yours to use**: call it home into your party, battle with it, level it.
- It cannot be **released**, **traded on** (in the game or here), or **trade-evolved**.
- When its owner calls it home, it must be **AWAY** to go back -- SEND it and SYNC. Each of you gets your own back at
  your next SYNC, as it is now.

## Fair play

- **A daemon in a trade stays AWAY.** The game will not call it home ("*NAME* is in a trade"), and the companion will
  not answer an ask to bring it home, until the trade is done.
- **One trade at a time** for each daemon.
- **A daemon that has left your game in a trade cannot be offered again** from that game -- an older copy of your save
  still holding it is refused. One that comes back to you by trade is yours again.

## On a phone hosting alone

Set THE HUB on TRADE to the hub's address and join with an invite code, as any other companion does. SYNC fetches what
the exchange sent before it writes the save, and tells the exchange afterwards.

## Later

Each is filed as a ticket, open, and none is built: two daemons sent out meeting and talking (C-220); the game's own
link cable through the hub, for trades and battles (C-221); a lobby beyond the tailnet, and links by Bluetooth, LoRa or
a touch (C-222); friends and gifts (C-223); battles between players (C-224).

*Every word the game and the app show for trading is DRAFT.* The design is in
[docs/TRADING.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/TRADING.md), and the routes in
[Server API](Server-API#trading).
