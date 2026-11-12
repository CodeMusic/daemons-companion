# Before THE COMMONS opens (C-226 piece 5, C-278)

*DRAFT, 2026-11-11. What has to be true before anyone outside the tailnet reaches accounts, the exchange and THE
COMMONS at `api.daemons.codemusic.ca`. Built pieces are marked **built**; the rest are steps for the user or
decisions still open. Not legal advice: a review by someone qualified is the last step on the list.*

## The checklist

| | Step | Who | State |
|---|---|---|---|
| 1 | The public listener: the tunnel reaches only it; nothing there is the keeper's machine; a budget per address | server | **built** |
| 2 | Passkeys answer only from https pages (or the Android app's signing key) | server | **built** |
| 3 | A guardian can export everything held (`GET /accounts/export`) and delete it all (`/accounts/delete`) | server | **built** (export in the app: not yet) |
| 3a | A profile's daemons by species to non-friends; its trades with friends only until C-346 | server | **built** |
| 3b | The age check at guardian sign-in | app; C-345 the module | **built** in the app; the module open |
| 3c | An account unused for two years erased (daily) | server | **built** |
| 4 | The consent review, below, and its three questions | the user | **decided** 2026-11-11 (below) |
| 5 | The accounts section of the privacy policy (draft below) into `PRIVACY.md`, and the App Store privacy labels | the user | drafted |
| 6 | The written retention policy and security programme the 2025 COPPA Rule asks for (drafts below) | the user | drafted |
| 7 | Sign in with Apple in the app (C-343), and `ACCOUNTS_*` set on roverbyteseer | the user, the phone lane | open |
| 8 | The Cloudflare Tunnel and its rate-limit rule (steps below) | the user | open |
| 9 | roverbyteseer's commons updated to this code (`hub/commons.sh` restart) | the companion lane | open (with step 7) |
| 10 | A review by someone qualified in children's privacy law | the user | open |

## The consent review

**What COPPA asks** (the FTC's rule, amended 2025: in force 23 June 2025, full compliance due 22 April 2026). An app
directed to children, or one that knows a user is under 13, must give parents notice and get *verifiable* parental
consent before collecting a child's personal information -- unless it collects none. The 2025 amendments add new
consent methods (knowledge-based questions, a government ID, a face matched to an ID, a text message "plus" a
follow-up), require *separate* consent before a child's information is disclosed to a third party, and require a
written data retention policy and a written information security programme.

**Signing in with Apple or Google is not, by itself, verifiable parental consent.** It is not one of the methods the
FTC lists, and both companies give children accounts of their own (Apple's Family Sharing, Google's Family Link), so
an Apple or Google account is not proof that the person signing in is an adult.

**So the design aims at collecting no personal information from a child at all**, and treats the guardian's
sign-in as a safety and control step, not as the legal consent. What a profile sends today:

| | Personal information? | Why |
|---|---|---|
| The profile's name (two words from the lists) and tag | no | picked from fixed lists, never typed; identifies no one |
| A kid's device token | a persistent identifier, used only to authenticate | COPPA's *support for internal operations* exception: no notice or consent needed for it alone |
| Trades, loans, gifts, friends | no | game state between profiles |
| Meetings | no | model-written from daemon facts and filtered (`meetsafe.ts`); no player text |
| **A daemon's nickname, and the trainer name inside its record** | **possibly** | **typed by the child in the game** (up to ten letters) and shown to the other player, or carried in the traded daemon. A child could type their own name. |
| The friends-only nickname | no (the guardian's text) | set only by the guardian |

**The one gap is the last-but-one row.** Nintendo's own trades carry the same two names, but between friends who
know each other. It matters once players who are not friends can trade (THE COMMONS' "+ lobby" and C-227's lobby).

**Other things the review found:**

- **The meetings' model.** If `COMMONS_LLM_URL` ever points at a cloud model rather than roverbyteseer's own (the
  Tiiny, LiteLLM), daemon facts leave for a third party; under the 2025 rule that needs its own consent if any of it
  is a child's information. Keep the meetings' model on our own machines for profiles.
- **Apple's age signals.** iOS 26's Declared Age Range API tells an app the age range of the person on the device
  (and whether a parent manages it) without the birth date; Google Play has a matching age-signals API. Asked at
  guardian sign-in, it keeps a child from making themselves a guardian. Texas (SB 2420) and other states now also ask
  app stores for age checks and parental consent, which these APIs serve.
- **Europe and the UK.** GDPR sets a digital age of consent between 13 and 16 by country, and the UK's Children's
  Code asks for high-privacy defaults -- which the controls' "safest first" defaults already are. The export and delete
  above are the right of access and erasure.

**Decided by the user, 2026-11-11, by multiple choice:**

1. **A daemon's nickname and trainer name: friends only.** Non-friends see a profile's daemons by species; a profile
   trades, lends and gives only with friends until the exchange blanks the trainer name on the way (C-346).
2. **An age check at guardian sign-in: the device's age signals.** A device that says its person is under 18 cannot
   make a guardian; with no signal, sign-in goes on (C-345 makes the iOS module).
3. **An account nobody uses for two years is erased**, as its guardian's DELETE would.

## Draft: the privacy policy's accounts section

*To go into `PRIVACY.md` the day accounts open, replacing "There are no accounts" and "Children"; DRAFT.*

> **Accounts (optional).** To trade beyond your home, a grown-up signs in with Apple or Google. We keep the id
> Apple or Google gives us for you and nothing else from them -- no name, no email unless Apple's private relay
> address is all we are given. The grown-up makes a profile for each player; a profile's name is two words picked
> from our lists, never typed, and a profile never signs in. We keep each profile's trades, loans, gifts and friends,
> and that is all. **Children**: a child never gives us a name, an email, an age or a password. The grown-up chooses
> who each profile may trade, meet and make friends with, sees every trade, can block a player, and can download or
> delete everything at any time (YOU > GUARDIAN). Deleting removes it at once. We sell nothing, show no ads, and use no
> analytics on profiles.

**App Store privacy labels**, once accounts open: *Identifiers -- User ID* (linked to the user, for app
functionality); *User Content -- Gameplay content* (linked, app functionality). Not used for tracking.

## Draft: retention and security

**Retention** (DRAFT): sign-ins last 30 days; a device code 15 minutes; a passkey question 5 minutes. A profile and
everything in it are kept until its guardian removes it or deletes the account, and then erased at once; an account
nobody has used for two years (no sign-in, no device playing as one of its profiles) is erased the same way. Meetings' lines are kept as THE COMMONS keeps them at home (C-220).

**Security programme** (DRAFT): one machine (roverbyteseer), reached from the internet only through the Cloudflare
Tunnel to a loopback listener; no port open; tokens and codes kept only as hashes; no passwords at all; passkeys hold
no secret on the server; every sign-in, device code and passkey answer rate-limited per address, and every request on
the public listener budgeted (600 per ten minutes); the keeper's actions only from the machine itself; the database
backed up with the machine (Time Machine) and never copied elsewhere; the code public (CodeMusic/daemons-companion)
with nothing personal in it. Reviewed once a year and whenever something here changes.

## The tunnel, step by step (the user's, on roverbyteseer)

1. In `commons.env` beside THE COMMONS' data, add `COMMONS_PUBLIC_PORT=4751`, then `hub/commons.sh restart`. The
   public listener answers on `127.0.0.1:4751` only.
2. Install cloudflared (`brew install cloudflared`), `cloudflared tunnel login` (picks codemusic.ca), then
   `cloudflared tunnel create daemons-commons` and `cloudflared tunnel route dns daemons-commons api.daemons.codemusic.ca`.
3. `~/.cloudflared/config.yml`:

   ```yaml
   tunnel: daemons-commons
   credentials-file: /Users/<you>/.cloudflared/<the tunnel's id>.json
   ingress:
     - hostname: api.daemons.codemusic.ca
       path: ^/(accounts|commons)/
       service: http://127.0.0.1:4751
     - service: http_status:404
   ```

   Never point it at port 4750 (the tailnet listener) or at a home hub.
4. `sudo cloudflared service install` to keep it running.
5. In Cloudflare's dashboard for codemusic.ca, a **rate-limiting rule**: path starts with `/accounts/signin`,
   `/accounts/passkey/login` or `/accounts/device/join`; 10 requests per 10 seconds per IP; block. Always Use HTTPS on.
6. Set `ACCOUNTS_RP_ID=api.daemons.codemusic.ca` and `ACCOUNTS_ORIGINS=https://api.daemons.codemusic.ca` (and the app's
   ids with Apple and Google) in `commons.env`, restart, and check `https://api.daemons.codemusic.ca/accounts/names`
   answers while `/commons/keeper` refuses.

Sources: the FTC's amended COPPA Rule (Federal Register, 22 April 2025); Apple's Declared Age Range documentation and
its developer news on Texas SB 2420; the FTC's 2013 rule on support for internal operations.
