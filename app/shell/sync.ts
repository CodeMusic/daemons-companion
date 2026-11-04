// What Shell keeps up to date in the background (C-288: out of App.tsx's Shell): deep links, the phone's keeping and
// its Health steps and widget, and on the site the heard poll.
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import { ALONE, api, freshHeard, HANDHELD, isAway, KEEP, keepEverything, LOCAL, MEETING, offlineHeard, ON_PHONE, SERVER, setConnection, TOKEN, WIDGET } from "../platform/net";
import { paletteHeard, setPalette } from "../state/look";
import { sendTodaysSteps } from "../screens/settings/Pair";
import { heardElsewhere } from "../ui/received";   // C-261
import type { Arrival } from "../../server/src/core";
import type { TABS } from "../state/types";

// C-176 (the user chose "the watch shows, the phone taps"): the Ultra's tag holds daemons://link?device=<id> -- the
// phone tapped to it opens here, on PLACES, linking with that watch
export function useDeepLinks(setTab: (t: (typeof TABS)[number]) => void) {
  useEffect(() => {
    const open = (url: string | null) => {
      const m = url ? /^daemons:\/\/link\?device=([a-z0-9][a-z0-9-]{2,47})$/.exec(url) : null;
      if (!m || !HANDHELD) return;
      setTab("places");
      HANDHELD.pair(m[1]);
    };
    Linking.getInitialURL().then(open).catch(() => {});
    const sub = Linking.addEventListener("url", (e) => open(e.url));
    return () => sub.remove();
  }, []);
}

// `fresh` is bumped when a screen first drawn from what the phone kept should be drawn again with the companion's answer
export function useBackgroundSync(reload: () => void, setFresh: (f: (n: number) => number) => void) {
  // C-62: keep everything on the phone each time the app opens and reaches the companion; redraw when it goes away
  const [, heard] = useState(0);
  useEffect(() => {
    const f = () => heard((n) => n + 1);
    // C-86: a screen first drawn from what the phone kept is drawn again when the companion's fresher answer arrives
    const g = () => { setFresh((n) => n + 1); reload(); };
    offlineHeard.add(f); freshHeard.add(g); paletteHeard.add(f);
    keepEverything().then(f);
    api<{ palette?: string }>("/api/device/settings").then((s) => setPalette(s.palette)).catch(() => {});   // C-90
    return () => { offlineHeard.delete(f); freshHeard.delete(g); paletteHeard.delete(f); };
  }, [reload]);
  // C-55: back to the handheld this phone paired with, if any
  useEffect(() => { HANDHELD?.start(api, isAway); MEETING?.start(api, () => HANDHELD!.bluetooth()); }, []);
  // C-56: the way back from anywhere, learned at home and kept on the phone
  useEffect(() => {
    if (!ON_PHONE) return;
    api<{ url: string | null }>("/api/settings/away").then(async ({ url }) => {
      setConnection({ away: url });
      if (url) await SecureStore.setItemAsync("away", url, KEEP); else await SecureStore.deleteItemAsync("away");
      if (TOKEN) WIDGET?.shareWithWidget({ server: SERVER, token: TOKEN, away: url });   // C-100
    }).catch(() => {});
  }, []);
  // C-27, C-48: on the phone, today's steps from Apple Health -- when the app opens, and each time it comes back
  useEffect(() => {
    if (!ON_PHONE) return;
    const sync = () => sendTodaysSteps().then(() => reload()).catch(() => {});
    // C-100: what the widget kept while out of reach is sent, and the widget drawn again with what the app now knows
    const widget = () => {
      const w = WIDGET, l = LOCAL;
      if (ALONE && w && l)                              // C-111: its buttons tended here, then the app draws it
        w.sendWidgetKept(api).catch(() => {}).finally(() => w.drawAlone(l.localApi).catch(() => {}));
      else { WIDGET?.sendWidgetKept(api).catch(() => {}); WIDGET?.redrawWidget(); }
    };
    sync(); widget();
    // C-87: each time the app comes back to the front, what the phone holds is brought up to date (and anything kept
    // on it is sent), so a phone opened away from home shows the freshest it could get
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") { sync(); widget(); keepEverything().catch(() => {}); HANDHELD?.nudge(); MEETING?.nudge(); } });
    return () => sub.remove();
  }, [reload]);
}

// C-261: on the site, a SYNC something else asked for (the save watched as it lands, the playground's game, a paired
// phone) shows RECEIVED here too and the page is read again; a save that changed is read again
export function useSiteHeard(reload: () => void, setFresh: (f: (n: number) => number) => void) {
  useEffect(() => {
    if (ON_PHONE) return;
    let was: string | null | undefined;
    const t = setInterval(() => {
      api<{ n: number; saved: string | null; player: string; arrivals: Arrival[] }>("/api/sync/heard").then((h) => {
        if (heardElsewhere(h, was === undefined)) { setFresh((n) => n + 1); reload(); }
        else if (was !== undefined && h.saved !== was) reload();
        was = h.saved;
      }).catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [reload]);
}
