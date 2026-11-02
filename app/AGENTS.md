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

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## DAEMONS is said DAY-mons

Some readers, and every text-to-speech voice, will say "daemon" like the frightening word it is often taken for. It is
said **DAY-mon**: the Greek *daimon*, a guiding spirit, and the background process.

- **Never write that frightening word** in anything a player or reader sees, not even to say "not that". If a reader
  must be steered away from it, say "a similarly spelt but frightening word forked from it; this is not that one".
- **Every line handed to a voice goes through `sayable()`** (`server/src/ai/say.ts`). It respells any word ending in
  daemon(s) as daymon(s) and keeps the rest of the word (eudaemon becomes eudaymon). It changes only what is spoken,
  never what is shown or stored.
- **A new speech path must call it.** Today these do: the hub's `/api/ai/speak` (`server/src/api.ts`), the house module
  (`server/src/ai/module.ts`), the Tiiny (`server/src/ai/tiiny.ts`), and n8n's daemon/voice, daemon/talk and
  daemon/chat (the DAEMONS repo's `ai/n8n/make_workflows.py`, `SAYABLE`). The book recordings respell the same way.
- **Not covered yet**: the LLM630 board's on-device MeloTTS (`firmware/esp32/src/brain.cpp`) and the BOX-3's Home
  Assistant voice pipeline both speak without going through the hub.
