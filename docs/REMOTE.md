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
