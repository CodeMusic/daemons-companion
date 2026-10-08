# The companion from anywhere (C-56)

*Planned and built 2026-10-04 (the user: "yes to your plan"). The user imports the workflow (below); the rest is in the code.*

At home, the phone reaches the companion on the computer directly, and since C-55 it carries the handheld's link over
Bluetooth. Away from home, the phone needs a way back to the computer. The user already runs a public n8n, and it
already relays requests into the home network for the AI-play mode. So the cheapest way back is one more workflow on it.

```
handheld --Bluetooth--> phone --HTTPS--> n8n (public)  --home network-->  companion server (the computer, port 4730)
                                         /webhook/companion
```

Nothing has to be opened on the router, no new certificate is needed (n8n's own domain has one), and the pairing key
from C-53 still decides who gets in.

## 1. The workflow: one webhook that carries any request

A webhook path in n8n cannot carry an arbitrary path after it, so the phone sends an **envelope** instead:

```
POST https://<the n8n>/webhook/companion
Authorization: Bearer <the phone's key>
{ "method": "GET", "path": "/api/today" }            or   { "method": "POST", "path": "/api/goals", "body": {...} }
```

The workflow has four nodes:

- **Webhook** (POST, responds through a Respond node).
- **Check** (Code). It refuses anything without a Bearer key, any method other than GET or POST, and any path not under `/api/`.
- **Forward** (HTTP Request) to `http://<the computer>:4730<path>`. It passes the method, the body and the
  Authorization header, and adds `x-companion-relay: <a secret>`. It is set to never fail and to return the full
  response.
- **Respond** with the companion's own status code and JSON, or 502 `{error: "the companion is not answering"}` when
  the computer is asleep or off.

Its executions are set **not to be saved**: a phone that polls would otherwise fill n8n's history.

## 2. The server: a relayed request is an internet request

A request carrying the relay's header with the right secret is treated as coming from **outside**:

- A paired phone's key is needed for **everything**, the device's own routes included. At home those answer the local
  network without a key; through the relay they would answer the whole internet.
- Pairing (`POST /api/pair`) is refused. A phone pairs at home, with the code on the computer's screen.
- Everything this machine alone may do stays refused, as it is now (`LOCAL_ONLY`).
- The secret lives in the companion's settings, like the save path, and the site shows it once so it can be pasted
  into n8n.

## 3. The app: home first, then away

The app keeps two addresses: **home** (what it paired with) and **away** (the relay). It tries home with a short
timeout and falls back to away, and it remembers which one worked for a minute. The away address is set on the site's
SETTINGS and given to the phone when it pairs, so nothing has to be typed on the phone.

Away, the app polls less often: n8n runs once per request. That means the state every 30 seconds and the site's
commands every 10, instead of every 5 and 1.5.

## 4. The handheld

The handheld needs no change: away from home it reaches the companion through the phone (C-55). It could later post to
the relay itself over a phone's hotspot, but nothing needs that yet.

## What the user does

1. **Give the computer a fixed address** on the router (a DHCP reservation), so the workflow always finds it.
2. **Import `n8n/companion relay.json`** (drafted) into the public n8n, put the computer's address where it says `COMPUTER` and the secret the site's SETTINGS shows (AWAY FROM HOME) where it says `RELAY_SECRET`, and activate it.
3. Paste the relay's address into the site's SETTINGS.

## Why not the alternatives

- **A subdomain with Let's Encrypt** (C-54 as first written) means opening a port to the computer and keeping a
  certificate renewed.
- **Tailscale** removes the home and away question entirely, but it needs an app on every phone and an account.
- **The relay** reuses what already runs.

C-54 stays open in case the companion ever outgrows the relay.

# Everything from anywhere (C-87, 2026-10-08)

*The user: "the phone doesn't lose any data... the tts working remotely... what needs to be done for me to publish the
server so anything I can do at home I can do remotely... I'd keep the site local (not worry about auth)."*

## The decision: the site stays local; the phone is the remote; the relay is the door

The phone app **is** the site -- the same screens on the same server -- so nothing needs publishing for the phone to
do away what the site does at home. Through the relay the server refuses only what belongs to the machine it runs on
(`LOCAL_ONLY`): making a pairing code and listing or forgetting phones, opening the server to the network, the Mac's
own dialogs for the save, the relay's settings. Add what is physical -- the USB cable, flashing -- and that is the
whole list. Publishing the server or the site would mean logins, certificates and a door on the router to defend,
for nothing the relay (HTTPS, a key per phone, the relay's secret) does not already do. **So the site stays on this
machine, with no logins, and is needed only to pair a phone.**

## What was missing, and is now done

1. **Nothing is lost away from home.** Every write that can wait is kept on the phone when the companion cannot be
   reached and sent in order when it can -- goals, steps, care, the walk, settings (only the latest of each). Only
   what needs an answer now is not kept: talking, a voice, a SYNC, pairing, the Mac's dialogs, and telling the
   handheld to do something this moment. A kept write the companion refuses (a step deleted since) is set aside
   rather than holding back the rest.
2. **The handheld's reports are kept too**: its routines, remotes, networks, battery (the latest of each) and its
   results and listens (every one), with the ticks, meetings and interactions it already kept.
3. **The phone opens on what it holds** (C-86) and brings it up to date each time it comes back to the front.
4. **Read aloud and talk away from home**: the relay now waits 60 seconds for the companion (it waited 10, and a
   voice takes about 15), and a relay that answers for a sleeping companion counts as away, not as an error.

## What only the user can do: keep the server reachable

Away from home the phone reaches the companion only while it **runs** and the Mac is **awake**. One command makes
both true, and one undoes it:

    ./bindCompanion.sh always     # the server at login, restarted if it stops, the Mac awake while on power
    ./bindCompanion.sh never

On battery the Mac still sleeps as usual; then the phone works from what it holds and sends what it kept when the
Mac is back.

## Later: a server that never sleeps (C-82)

The last step is moving the server to roverbyteseer, which is always on. The one open question is the save: the
companion reads and writes the DAEMONS save (SYNC, AWAY), and today that file is on this Mac. Two ways it could work:
the save in a synced folder both machines see (Delta's own Dropbox sync, or iCloud Drive), or the server on
roverbyteseer asking this Mac for the save when it is awake. Until then, `always` above is the cheap version.
