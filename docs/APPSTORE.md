# The App Store record (C-27) -- DRAFT

*Drafted 2026-10-06 for review before the upload with Transporter. **Every word here is a draft, and nothing has
been submitted.** Fields that need the owner's own details are marked **[yours]**. Change anything; the build follows
the record, not the other way round.*

---

## 1. The listing

| field | draft | limit |
|---|---|---|
| **Name** | DAEMONS companion | 30 |
| **Subtitle** | A daemon that helps you get there | 30 |
| **Category** | Productivity (secondary: Health & Fitness) | -- |
| **Keywords** | goals,habits,steps,companion,virtual pet,tamagotchi,next step,planner,walking,routine | 100 |
| **Support URL** | **[yours]** -- e.g. the repository's issues page, or a page on codemusic.ca | -- |
| **Marketing URL** | **[yours, optional]** | -- |
| **Copyright** | **[yours]** -- e.g. "2026 CodeMusic" | -- |
| **Version** | 1.0.0 (build 1) | -- |

### Promotional text (170, can change without a new build)

> Tell your daemon what you want to get done. It finds the one next step, walks the day with you, and grows as you
> finish things.

### Description (4000)

> Your daemon carries your goals.
>
> Tell it what you want to get done -- a clean apartment, a walk every day, a project you keep putting off -- and it
> turns that into one next step. Not a list: the step in front of you. Do it, and the next one is there.
>
> As you finish things, your daemon thrives. Each step is a meal; each finished goal, a little more of what it will
> become. Look after it -- feed it, give it water, train it -- and it keeps you company through the day.
>
> YOUR STEPS COUNT
> With your permission, the app reads today's steps from Apple Health and counts them toward your walking goal.
> Nothing is written to Health.
>
> A HANDHELD, IF YOU HAVE ONE
> The companion pairs over Bluetooth with its handheld device and carries the handheld's link in your pocket: the
> day's step, your daemon, its routines.
>
> MEET OTHERS NEARBY
> Pass someone else carrying a daemon and yours notices. Their daemon is seen; yours is a little happier for the
> meeting. The beacon carries only a kind of daemon and a tag that changes every hour -- nothing about you.
>
> YOURS, AT HOME
> The companion runs on your own computer, and the phone pairs with it with a code. Your goals and your daemon stay
> there. There is no account, no tracking and no advertising.
>
> The companion is made for DAEMONS, a game it carries daemons from; it needs the companion's server running on your
> computer.

*Kept out on purpose: the name of the game DAEMONS is built on, or any other trademark. The listing describes what the
app does by itself (App Review 2.3, 5.2).*

### What's New (1.0)

> The first version: goals and their next step, steps from Apple Health, the handheld's link over Bluetooth, and
> meeting others nearby.

---

## 2. App Privacy (the "nutrition label")

**Proposed answer: Data Not Collected.** *In Apple's sense, "collected" means sent off the device where the developer
or a partner can reach it. Here everything goes to the user's OWN computer (the companion's server), directly or
through the user's own n8n; nothing reaches the developer, an analytics service or an advertiser.* **[yours to
confirm]**: *if the relay ever runs on a server you operate for other people, this answer changes (Health and Fitness,
Identifiers, User Content -- "not linked, not used for tracking").*

| question | answer |
|---|---|
| Do you or your partners collect data from this app? | **No** |
| Tracking (App Tracking Transparency)? | **No** -- the app shows no ATT prompt and links nothing across apps |
| Health data used for advertising or marketing? | **No** (and HealthKit requires this) |

**The permission lines the user sees** (in `app.json`, already in the build):

| permission | what it says now | suggestion |
|---|---|---|
| Health, read (`NSHealthShareUsageDescription`) | "Your steps today count toward your walking goal, and your daemon is glad of the walk." | keep |
| Health, write | not asked | -- |
| Bluetooth (`NSBluetoothAlwaysUsageDescription`) | "To carry your handheld's link: its goal, its daemon and its routines, at home or away." | ***add the meeting***: "To carry your handheld's link, and to meet other companions nearby." *-- the app also advertises and listens for C-15's beacon, and App Review reads this line against what the app does.* |
| Local network (`NSLocalNetworkUsageDescription`) | "To reach your DAEMONS companion on your computer, at home." | keep |

**Privacy policy URL** -- **required** for an app that reads Health: **[yours]**. A one-page draft:

> DAEMONS companion keeps your goals and your daemon on your own computer. It reads your step count from Apple Health,
> with your permission, and sends it only to your own companion server. It sends a Bluetooth beacon that holds a kind
> of daemon and a random tag that changes every hour. It collects nothing for the developer, uses no analytics and
> shows no advertising. Questions: **[your contact]**.

---

## 3. Age rating

Every content question answered **None** / **No** (no violence, no mature themes, no gambling, no user-to-user
messaging -- a meeting carries no words -- no unrestricted web access, no medical advice). **Expected rating: 4+.**
*The app's words are its own and gentle; the game it companions has its own rating, which does not carry over.*

---

## 4. App Review -- the part most likely to be asked about

**The app needs the companion's server on the user's computer**, so a reviewer who installs it alone sees only the
pairing screen. App Review rejects an app it cannot use (2.1). Two ways through; **[yours to choose]**:

1. **Review notes and a demo server** *(no code change)*: run a companion server reachable from the internet for the
   review period (the n8n relay, C-56, already does this) and put its address and a pairing code in the notes:

   > The app is the phone half of a companion that runs on the user's own computer. To review it: on the pairing
   > screen, enter the address **[relay address]** and the code **[code]**. Steps are read from Apple Health (the
   > simulator has none; a device shows today's). The handheld device and meeting others nearby need Bluetooth
   > hardware and are optional.

2. **A DEMO mode in the app** *(a ticket, if wanted)*: a "Try it without a computer" button that runs on sample data.
   Slower to build, but the app then stands on its own.

**Also expected:** 4.2 (minimum functionality) is met by goals, steps and the daemon; 5.1.1 is met by the privacy
policy and Health's purpose string; ***5.2 (intellectual property)***: *the art is the project's own, and the listing
names no other company's game.*

---

## 5. Screenshots

**Required sizes** (App Store Connect, 2026):

| device class | size (portrait) | from |
|---|---|---|
| **iPhone 6.9"** (required) | **1320 x 2868** | iPhone 17 Pro Max simulator |
| **iPad 13"** (required only while `supportsTablet` is true) | **2064 x 2752** | iPad Pro 13-inch simulator |

***`supportsTablet` is `true` in `app.json`***, *so the record needs iPad screenshots too.* **[yours]**: *keep the iPad
(and take them), or set it false for 1.0 and ship iPhone only.*

***Not taken yet (2026-10-06)***: *the simulator build stopped when the Mac's disk filled (2.5 GB free after it was
cleaned up). With room again, they are taken from the simulator against a **scratch** server with made-up goals and
meetings -- never a real save or the real companion -- and filed in `docs/appstore/`.* **Proposed five**: *TODAY (the
one next step), the goal with its milestones, the daemon at home, MET NEARBY, the walking goal from Health.*

---

## Before the upload -- a checklist

- [ ] Name, subtitle, keywords and description approved
- [ ] Support URL, privacy policy URL, copyright filled in
- [ ] The Bluetooth line updated (or kept)
- [ ] iPad: kept with screenshots, or `supportsTablet: false`
- [ ] App Review: notes with a demo server, or a DEMO mode
- [ ] An app icon of our own (C-27's "an icon")
- [ ] `./bindCompanion.sh phone` builds the Release; archive and upload with Transporter
