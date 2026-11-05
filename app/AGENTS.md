This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation (C-286)

**This app has no router.** It does not use Expo Router or any navigation library, and should not gain one without the
user deciding it. Navigation is local React state:

- `index.ts` -> `App.tsx`. `App` pairs (C-53) and picks the paper or the night (C-144), then renders `Shell`.
- **The tabs** are `TABS` in `state/types.ts`: `today, game, daemon, journey, library, you, places, settings, dev` (C-298: JOURNEY holds GOALS and the JOURNAL).
  `SHOWN_TABS` hides `settings` (the gear opens it), `dev` (shown as `</>` only in DEVELOPER MODE, C-275) and, on the
  site, `game`. `Shell` keeps the open tab in `useState` and renders it from one table, `TAB_VIEW` (C-287).
- **The game view is mounted once and never remounted** (C-187): outside the page's `ScrollView`, hidden rather than
  unmounted. Remounting it loses what was played since the last save. Keep this.
- **An iPad on its side** (C-189) shows the game on the left and the companion on the right, a divider between them to
  drag; either side can be put away (C-260). In DEVELOPER MODE a LOGS pane sits at the right with its own divider (C-268).
- **Pages inside a tab are local `useState` unions**: the DAEMON tab's `seg`, the LIBRARY's `book`. There is no back
  stack and no deep link into one.
- **The open tab tapped again** bumps a counter in the page `ScrollView`'s `key`, remounting the tab: "back to its own
  first page" (the user, 2026-10-28). It is meant to be blunt.
- **Deep links**: only `daemons://link?device=<id>` (C-176), which opens PLACES and links that watch.

## Rules the layout depends on

- **The app imports server source** (`../server/src/*`, `../server/data/*`) so a phone can host the companion's rules
  itself (C-111; `metro.config.js` allows it). Those server files must stay free of Node-only APIs.
- **Phone-only modules load lazily**: `platform/net.ts` `require()`s `handheld`, `beacon`, `widget` and `local`, and
  `ui/ui.tsx` `sound/careSound`, inside a check. A top-level import would pull native modules into the site's build.
- **Code comments cite tickets** (`// C-264: ...`) from the companion's `TODO.md`. Keep them when code moves.

## Where things live

**`LAYOUT.md` at the repository's root** is the map of `app/` and everything else, and says where a new file goes
(C-292). A commit that adds, moves or removes a folder updates it in the same commit; `server/test/layout.test.ts`
checks it.

## DAEMONS is said DAY-mons

Some readers, and every text-to-speech voice, will say "daemon" like the frightening word it is often taken for. It is
said **DAY-mon**: the Greek *daimon*, a guiding spirit, and the background process.

- **Never write that frightening word** in anything a player or reader sees, not even to say "not that". If a reader
  must be steered away from it, say "a similarly spelt but frightening word forked from it; this is not that one".
- **Every line handed to a voice goes through `sayable()`** (`server/src/ai/say.ts`). It respells any word ending in
  daemon(s) as daymon(s) and keeps the rest of the word (eudaemon becomes eudaymon). It changes only what is spoken,
  never what is shown or stored.
- **A new speech path must call it.** Today these do: the hub's `/api/ai/speak` (`server/src/api.ts`), the house module
  (`server/src/ai/module.ts`), the Tiiny (`server/src/ai/tiiny.ts`), the phone's own voice when it answers by itself (`app/platform/mind.ts`,
  C-280), and n8n's daemon/voice, daemon/talk and
  daemon/chat (the DAEMONS repo's `ai/n8n/make_workflows.py`, `SAYABLE`). The book recordings respell the same way.
- **Not covered yet**: the LLM630 board's on-device MeloTTS (`firmware/esp32/src/brain.cpp`) and the BOX-3's Home
  Assistant voice pipeline both speak without going through the hub.
