# Away from home

At home, the phone reaches the companion over your Wi-Fi. Away from home it needs a way back to your computer. The
companion's way is a **relay**: one workflow on your own [n8n](https://n8n.io), reachable from the internet, that
carries the phone's requests into your home network.

```
board --Bluetooth--> phone --HTTPS--> your n8n (public) --home network--> the companion (your computer, port 4730)
                                      /webhook/companion
```

Nothing has to be opened on your router and no new certificate is needed (n8n's own domain has one). Your phone's
pairing key still decides who gets in.

**The phone app is the site** -- the same screens on the same server -- so away it does what the site does at home.
Only what belongs to your computer stays at home: pairing a phone (and listing or forgetting phones), opening the
server to the network, the file picker for the save, the relay's settings, Home Assistant's address and token, and the
cable and flashing.

A phone hosting on its own (C-111) needs none of this: it has no companion to reach
([Host on your phone](Host-on-your-phone#or-the-phone-on-its-own-c-111)).

## Set it up

1. **Give your computer a fixed address** on your home network ([below](#a-fixed-address-at-home)), so the relay
   always finds it.
2. **Import the workflow** [`n8n/companion relay.json`](https://github.com/CodeMusic/daemons-companion/blob/main/n8n/companion%20relay.json)
   into your n8n. Put your computer's address where it says `COMPUTER`, and the secret from the site's SETTINGS,
   **AWAY FROM HOME**, where it says `RELAY_SECRET`. Activate it.
3. **Paste the webhook's address** (`https://<your-n8n>/webhook/companion`) into the site's SETTINGS, AWAY FROM HOME,
   and **Save**.
4. **Open the app once on your home Wi-Fi.** It learns the relay's address and keeps it. From then on it tries home
   first and the relay after.

The workflow has four nodes: a **Webhook**; a **Check** that refuses anything without a Bearer key, any method but
GET or POST, and any path not under `/api/`; a **Forward** to `http://<your computer>:4730<path>` that adds the
relay's secret as `x-companion-relay`; and a **Respond** with the companion's own answer, or 502 *the companion is
not answering*. The server treats a relayed request as coming from the internet: a paired phone's key is needed for
everything, and pairing is refused.

## What works away

- **The phone holds everything, and syncs.** It opens on what it last saw, at once, and brings it up to date when
  home answers, and each time it comes back to the front -- the day, the goal, the party and its art, the whole INDEX,
  YOU, GAME EVENTS, the LIBRARY (CALLOW SCHOOL, THE GUIDE and the NOTEBOOK) and NEARBY's broadcasts among it.
  Away from the companion it says so: a toast at the foot, and once dismissed, a small **AWAY** at the top right.
- **Nothing is lost.** Anything you change away -- goals, steps, care, the walk, settings -- is kept on the phone and
  sent in order when the companion answers. So is everything a board reports through the phone. The widget's presses
  too: *Kept until home answers.* -- the widget sends them itself the next time it reaches the companion. Only what
  needs an answer at once (talking, a voice, SYNC, telling a board to act now, a tap on HOME) waits for a connection;
  a tap on HOME is never saved up to happen later.
- **Read aloud and talk work away** -- the relay waits up to a minute for a voice.
- **A board away** goes out through the paired phone, or on a Wi-Fi it knows asks the relay itself with its own key
  (given only down its cable at home -- so link each board by cable once after the relay is set). Talking and read
  aloud on a board need home or the phone: the relay carries words, not a recording or a voice.

## One request at a time (C-107)

Until the relay has been seen to reach the companion, the app sends **one** request through it, and the rest wait on
that answer. If the companion does not answer, the app leaves the relay alone for 30 seconds and shows what it kept. A
request that comes back, however slowly, proves the relay for a minute. Away, the app also polls less: the state every
30 seconds instead of every 5.

## Home asked again, in full (C-109)

Home's first try is short (2.5 seconds), so a phone away does not wait on it. At home, a slow answer -- a
`.local` name being looked up -- could lose that race while the relay could not reach the companion either. So when the
relay fails, the app and the widget ask home once more with the full 8 seconds.

## Reading n8n's executions

The Forward node never fails and times out at 60 seconds. So a run that says *Succeeded in 1m 0.0xs* is a
**timeout** -- the companion did not answer, and the phone got a 502 -- not a slow success. A real answer takes its own
time. Open the Forward node of such a run to see the error. One open of the app should show **one** run per try, not
one per screen.

## The limit: the relay reaches your computer at its home address (C-88)

The Forward node names your computer by its address **on your home network**. So when the computer is away from home,
the phone cannot reach it through the relay -- even when the phone is on the same network as the computer. And when the
computer's home address changes, the relay times out even at home: whatever address it has, the Forward node has to
say the same.

**The fix**: install [Tailscale](https://tailscale.com) on the machine your n8n runs on and on your computer, and point
the relay's Forward node at your computer's Tailscale name (`http://<your-computer>:4730`), which follows it
everywhere. Later, the server could move to a machine that never sleeps (C-82).

## A fixed address at home

Until then, keep your computer's home address from moving:

- **A DHCP reservation** on your router for the computer, so it always gets the same address.
- **A Fixed private Wi-Fi address** on the computer: on a Mac, System Settings, Wi-Fi, *Details…* beside your network,
  **Private Wi-Fi address: Fixed** (a rotating one would change the address the router sees).
- **Pair the phone by name**, `http://<your-computer>.local:4730` -- the address the site's PAIR A PHONE now offers
  -- so the phone finds it on any Wi-Fi the two share, whatever its address
  ([Host on your phone](Host-on-your-phone#5-pair-it)). The name works only on a shared network; through the relay it
  is the Forward node's address that counts.
- Keep the server **open to your network** (the site, SETTINGS, PAIR A PHONE).

## Keep it reachable

The phone reaches the companion only while the server runs and the computer is awake. `./bindCompanion.sh always`
makes both true on power ([Running the companion](Running-the-companion#keep-it-running)). On battery the Mac sleeps
as usual, and the phone works from what it holds until it is back.

The design and its history:
[docs/REMOTE.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/REMOTE.md).
