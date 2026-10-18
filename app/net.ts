// The app's way to the companion (C-157: out of App.tsx): where it is and the key (paired), the way from away (the relay),
// what was kept for when it cannot be reached (C-62), and api() -- every request goes through it.
import { File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// bindCompanion.sh sets EXPO_PUBLIC_DAEMONS_SERVER: an Android emulator reaches this machine at 10.0.2.2, not 127.0.0.1.
// C-27, C-53: on the phone the companion's address and its key are set at runtime -- by pairing -- and kept in the
// phone's secure storage; on the site, the server is this machine and needs no key.
export let SERVER = process.env.EXPO_PUBLIC_DAEMONS_SERVER ?? "http://127.0.0.1:4730";

// C-111: the phone hosting on its own -- no computer; every request is answered on the phone (local.ts)
export let ALONE = false;

export let TOKEN: string | null = null;

// C-56: away from home, the phone reaches the companion through the user's n8n (docs/REMOTE.md). Home is tried first,
// briefly; whichever way answered is kept for a minute, so a walk does not pay the wait on every request.
export let AWAY: string | null = null;

export let route = { away: false, until: 0 };

export const isAway = () => route.away;

// C-107 (the user, 2026-10-11: six relay runs at once, each a minute long): until the relay has been seen to reach the
// companion, it is asked one request at a time and the rest wait on that answer; when the companion did not answer it,
// the relay is not asked again for RELAY_REST_MS -- the phone shows what it kept instead.
export const RELAY_REST_MS = 30000;

export let relayOkUntil = 0, relayDownUntil = 0;

export let relayTrial: Promise<unknown> | null = null;

// C-61: pairing again -- the stored address and key are dropped and the app goes back to PAIR THIS PHONE.
export let unpaired: () => void = () => {};

export async function pairAgain() {
  for (const k of ["server", "token", "away", "alone"]) await SecureStore.deleteItemAsync(k, KEEP).catch(() => {});
  TOKEN = null; AWAY = null; route = { away: false, until: 0 }; ALONE = false;
  WIDGET?.shareWithWidget(null);
  unpaired();
}

// C-62: everything the companion has shown, kept on the phone -- every answer to a GET and every daemon's picture --
// so the app opens on what it last saw when the companion cannot be reached, says so, and holds a ticked step until
// the companion answers again. Each time the app opens and reaches the companion it fetches all of it at once.
export type Kept = { at: string | null; paths: Record<string, unknown>; art: Record<string, string>;
              queue: { path: string; body: unknown }[] };

export let KEPT: Kept = { at: null, paths: {}, art: {}, queue: [] };

export let OFFLINE: string | null = null;
                  // when what is on screen was kept, while the companion is away
export const offlineHeard = new Set<() => void>();

export const keptFile = () => new File(Paths.document, "kept.json");

export async function loadKept() {
  if (!ON_PHONE) return;
  try {
    const f = keptFile();
    if (f.exists) KEPT = { ...KEPT, ...JSON.parse(await f.text()) };
  } catch { /* a damaged file is only a cache: start again */ }
}

export let keepTimer: ReturnType<typeof setTimeout> | null = null;

export function saveKept() {
  if (!ON_PHONE) return;
  if (keepTimer) clearTimeout(keepTimer);
  keepTimer = setTimeout(() => {
    try { const f = keptFile(); if (!f.exists) f.create(); f.write(JSON.stringify(KEPT)); } catch { /* next time */ }
  }, 800);
}

export function setOffline(at: string | null) {
  if (OFFLINE === at) return;
  OFFLINE = at;
  offlineHeard.forEach((f) => f());
}

export class Unreachable extends Error { name = "Unreachable"; }
     // by name too: handheld.ts tells it from a NO
// C-87 (the user, 2026-10-08: "the phone doesn't lose any data"): every write that can wait is kept on the phone when
// the companion cannot be reached, and sent in order when it answers. Only what needs an answer NOW is not kept --
// talking, a voice, a SYNC of the save, the Mac's own dialogs, pairing, and the handheld told to do something this
// moment (run a routine, send a remote, join a network). A setting is kept once: only the latest of each is sent.
export const NOT_KEPT = /^\/api\/(ai\/|sync|art|pair|settings\/(pick|reveal|network|relay)|device\/(run|remote|wifi|network)|networks)/;

export const LATEST_ONLY = /^\/api\/(settings|talk\/settings|device\/settings|profile)$/;

// The handheld's own reports through this phone are kept by its bridge (handheld.ts, in order, with the board's id), so
// they are not kept here as well -- or a tick made away from home would arrive twice.
export const keepable = (path: string) => !NOT_KEPT.test(path) && (!path.startsWith("/api/device/") || path === "/api/device/settings");

export const ON_PHONE = Platform.OS !== "web";

// C-57: readable after the phone's first unlock, not only while it is unlocked -- iOS may open the app in a locked
// pocket when the handheld has something to say, and the app needs its key and the handheld's id then.
export const KEEP = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export async function keepAfterFirstUnlock() {
  if (await SecureStore.getItemAsync("keychain-after-first-unlock")) return;
  for (const k of ["server", "token", "away", "handheld", "handheld-waiting"]) {
    const v = await SecureStore.getItemAsync(k);
    if (v !== null) { await SecureStore.deleteItemAsync(k); await SecureStore.setItemAsync(k, v, KEEP); }
  }
  await SecureStore.setItemAsync("keychain-after-first-unlock", "1", KEEP);
}

export async function loadConnection(): Promise<boolean> {
  if (!ON_PHONE) return true;
  await keepAfterFirstUnlock().catch(() => {});
  await loadKept();
  for (const [p, uri] of Object.entries(KEPT.art)) ART.set(p, uri);
  if (LOCAL && await SecureStore.getItemAsync("alone") === "1") { await hostAlone(); return true; }   // C-111
  const server = await SecureStore.getItemAsync("server"), token = await SecureStore.getItemAsync("token");
  AWAY = await SecureStore.getItemAsync("away");
  if (server && token) { SERVER = server; TOKEN = token; WIDGET?.shareWithWidget({ server, token, away: AWAY }); return true; }
  return false;
}

// C-55: the handheld's link over Bluetooth, carried by the phone (handheld.ts) -- only on the phone; the site has the cable.
export const HANDHELD: typeof import("./handheld").handheld | null = ON_PHONE ? require("./handheld").handheld : null;

export type HandheldNow = import("./handheld").Handheld;

// C-15: the phone meets others nearby (beacon.ts) -- only on the phone, which can advertise and listen
export const MEETING: typeof import("./beacon").meeting | null = ON_PHONE ? require("./beacon").meeting : null;

// C-100: the daemon on the home screen (widget.ts, targets/widget) -- an iOS widget, so only on the iPhone
export const WIDGET: typeof import("./widget") | null = Platform.OS === "ios" ? require("./widget") : null;

// C-111: the companion's own rules on the phone, for a phone hosting on its own
export const LOCAL: typeof import("./local") | null = ON_PHONE ? require("./local") : null;
export async function apiLive<T>(path: string, body?: unknown): Promise<T> {
  if (ALONE && LOCAL) {                                                  // C-111: answered here, by the same rules
    const r = await LOCAL.localApi(path, body);
    if (r.status >= 400) throw new Error((r.body as { error?: string })?.error ?? `the phone answered ${r.status}`);
    return r.body as T;
  }
  const auth: Record<string, string> = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};
  const init: RequestInit = body === undefined ? { headers: auth }
    : { method: "POST", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify(body) };
  let r: Response | undefined;
  // C-61: home is always asked with a time limit on the phone. Without one, a phone off the home network (or holding
  // an old address for it) waited on iOS's own timeout and every screen said "Loading..." for good (2026-10-06).
  const homeWithin = (ms: number) => async () => {
    const stop = new AbortController(), t = setTimeout(() => stop.abort(), ms);
    try { return await fetch(SERVER + path, { ...init, signal: stop.signal }); } finally { clearTimeout(t); }
  };
  if (!ON_PHONE) r = await fetch(SERVER + path, init);
  else if (!AWAY) {
    try { r = await homeWithin(8000)(); }
    catch { throw new Unreachable(`The companion at ${SERVER} did not answer. Is this phone on the home Wi-Fi, and the companion running?`); }
  }
  else {
    const home = homeWithin(2500);
    const resting = () => new Unreachable("the companion did not answer the relay a moment ago");
    const away = async () => {
      if (Date.now() < relayDownUntil) throw resting();
      while (relayTrial && Date.now() >= relayOkUntil) await relayTrial.catch(() => {});        // C-107
      if (Date.now() < relayDownUntil) throw resting();
      const ask = fetch(AWAY!, { method: "POST", headers: { "content-type": "application/json", ...auth },
                                 body: JSON.stringify({ method: body === undefined ? "GET" : "POST", path, body }) });
      const down = () => { relayDownUntil = Date.now() + RELAY_REST_MS; relayOkUntil = 0; route = { away: false, until: 0 }; };
      const heard = ask.then((r) => { if ([502, 503, 504].includes(r.status)) down(); else relayOkUntil = Date.now() + 60000; }, down);
      if (Date.now() >= relayOkUntil) relayTrial = heard.finally(() => { relayTrial = null; });
      return ask;
    };
    const ways = route.away && Date.now() < route.until ? [away, home] : [home, away];
    let failed: unknown;
    let viaAway = false;
    for (const way of ways) {
      try { r = await way(); viaAway = way === away; route = { away: viaAway, until: Date.now() + 60000 }; break; } catch (e) { failed = e; }
    }
    // C-109 (the user, 2026-10-11, at home: the widget's FEED was "kept until home answers"): home is asked briefly
    // first so a phone away does not wait on it -- but at home a slow answer (a .local name looked up) lost that race
    // and the relay could not reach the companion either. When the relay fails, home is asked once more, in full.
    if (!r || (viaAway && [502, 503, 504].includes(r.status))) {
      try { r = await homeWithin(8000)(); viaAway = false; route = { away: false, until: Date.now() + 60000 }; } catch {}
    }
    if (!r) throw new Unreachable(`Neither the companion at ${SERVER} nor the way from away answered.`);
    // C-86: the relay answered, but for the companion -- "not answering", a gateway timeout -- so the companion is
    // out of reach (asleep, or still making a voice): that is being away, and the phone shows what it kept.
    if (viaAway && [502, 503, 504].includes(r.status)) {
      const why = await r.json().catch(() => ({}));
      route = { away: false, until: 0 };                                                        // C-107
      throw new Unreachable(why.error ?? "the companion did not answer the relay");
    }
  }
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `the server answered ${r.status}`);
  return j as T;
}

// C-86 (the user, 2026-10-08: away, the app was blank): what the phone already holds is shown first. A GET it has
// kept answers from the phone if the companion has not answered within KEPT_FIRST_MS, and the live answer, when it
// comes, is kept and -- if it differs -- tells the app to draw the screen again (freshHeard).
export const KEPT_FIRST_MS = 1200;

export const freshHeard = new Set<() => void>();

// The flicker (the user, 2026-10-15: "the device one flickers so often u can't use it, settings also flicker and
// profile"): every changed answer re-made the whole screen (the ScrollView's key), and DEVICE asks every 1.5 s, so it
// was torn down and built again every few seconds. Now the screen is drawn again only when it was drawn from what was
// kept -- the live answer came too late (KEPT_FIRST_MS) -- and a screen that polls (POLLED) redraws itself.
export const POLLED = /^\/api\/(device\/(link|state|commands)|broadcasts)/;
   // the review, 2026-10-18: news and the handheld's polls too
// An answer the companion gives once and then forgets -- the board's waiting commands (taken as they are answered): never
// kept, never served from what was kept, or an old command reaches the board again (the review, 2026-10-18)
export const ONE_SHOT = /^\/api\/device\/commands/;

export async function liveAndKeep<T>(path: string, servedKept: () => boolean): Promise<T> {
  const j = await apiLive<T>(path);
  const changed = JSON.stringify(KEPT.paths[path]) !== JSON.stringify(j);
  KEPT.paths[path] = j; KEPT.at = new Date().toISOString();
  if (changed) saveKept();                               // the review, 2026-10-18: the same answer is not written again
  setOffline(null);
  if (KEPT.queue.length) sendHeld();
  if (changed && servedKept() && !POLLED.test(path)) freshSoon();
  return j;
}

export let freshTimer: ReturnType<typeof setTimeout> | null = null;

export function freshSoon() {                     // many answers at once (keepEverything) redraw the screen once, not each
  if (freshTimer) clearTimeout(freshTimer);
  freshTimer = setTimeout(() => { freshTimer = null; freshHeard.forEach((f) => f()); }, 600);
}

// C-62: every request goes through here. An answer is kept; no answer falls back to what was kept.
export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (ON_PHONE && body === undefined && !path.startsWith("/api/art") && !ONE_SHOT.test(path) && path in KEPT.paths) {
    let servedKept = false;
    const live = liveAndKeep<T>(path, () => servedKept).catch((e) => {
      if (!(e instanceof Unreachable)) throw e;                     // the companion answered "no"
      setOffline(KEPT.at);
      return KEPT.paths[path] as T;
    });
    const kept = new Promise<T>((res) => setTimeout(() => { servedKept = true; res(KEPT.paths[path] as T); }, KEPT_FIRST_MS));
    return Promise.race([live, kept]);
  }
  try {
    const j = await apiLive<T>(path, body);
    if (ON_PHONE) {
      if (body === undefined && !path.startsWith("/api/art") && !ONE_SHOT.test(path)) {
        const changed = JSON.stringify(KEPT.paths[path]) !== JSON.stringify(j);   // the review, 2026-10-18: kept.json
        KEPT.paths[path] = j; KEPT.at = new Date().toISOString();                  // (all the art in it) was written
        if (changed) saveKept();                                                    // after every poll, every 1.5 s
      }
      setOffline(null);
      if (KEPT.queue.length) sendHeld();
    }
    return j;
  } catch (e) {
    if (!ON_PHONE || !(e instanceof Unreachable)) throw e;           // the companion answered "no": that is not offline
    if (body === undefined && !ONE_SHOT.test(path) && path in KEPT.paths) { setOffline(KEPT.at); return KEPT.paths[path] as T; }
    if (body !== undefined && keepable(path)) {
      if (LATEST_ONLY.test(path)) KEPT.queue = KEPT.queue.filter((q) => q.path !== path);
      KEPT.queue.push({ path, body }); saveKept(); setOffline(KEPT.at);
      throw new Error("Kept on this phone. It goes to the companion the next time it answers.");
    }
    throw e;
  }
}

export let sending = false;

export async function sendHeld() {
  if (sending) return;
  sending = true;
  try {
    while (KEPT.queue.length) {
      try { await apiLive(KEPT.queue[0].path, KEPT.queue[0].body); }
      catch (e) {
        if (e instanceof Unreachable) throw e;                          // still away: keep it and the rest
        // C-87: the companion answered NO (a step since deleted, a goal already finished) -- that one is done with, and
        // must not hold back everything kept after it
      }
      KEPT.queue.shift(); saveKept();
    }
  } catch { /* still away: keep the rest */ } finally { sending = false; }
}

export async function keepEverything() {
  if (!ON_PHONE) return;
  let moved = false;
  for (const p of ["/api/today", "/api/goal", "/api/goals", "/api/party", "/api/profile", "/api/index", "/api/meetings", "/api/daemon/life", "/api/walk",
                   "/api/settings", "/api/talk/settings", "/api/device/settings",   // C-92: SETTINGS opens away too
                   "/api/notebook", "/api/progress", "/api/broadcasts", "/api/guide"]) {   // C-125, C-128/129, C-134, C-145: PROFILE, LIBRARY, NEARBY away
    const before = JSON.stringify(KEPT.paths[p]);
    await liveAndKeep(p, () => false).catch(() => {});
    if (JSON.stringify(KEPT.paths[p]) !== before) moved = true;
  }
  if (moved) freshSoon();                 // the screen drawn again once if anything moved -- not once per answer
  if (OFFLINE) return;
  // C-86: each party daemon's INDEX entry too, so opening one away from home needs nothing from home
  const carried = (KEPT.paths["/api/party"] as { party?: { species: number }[] } | undefined)?.party ?? [];
  for (const d of carried) await liveAndKeep(`/api/species/${d.species}`, () => false).catch(() => {});
  await artByJson("/art/species/1.png").catch(() => {});                // the whole INDEX's pictures, in one request
  const party = (KEPT.paths["/api/party"] as { party?: { slot: number }[] } | undefined)?.party ?? [];
  for (const d of party) await artByJson(`/art/party/${d.slot}.png`).catch(() => {});
}

// C-59: a daemon's picture. At home it loads straight from the companion; away, the relay carries only /api/ and
// JSON, so it comes as JSON instead -- and the INDEX's pictures all in one request, kept for the session, so a phone
// away from home runs the relay once for the whole INDEX rather than once a picture.
export const ART = new Map<string, string>();

export let everySpecies: Promise<void> | null = null;

export function keepArt(path: string, uri: string) {
  ART.set(path, uri);
  if (ON_PHONE) { KEPT.art[path] = uri; saveKept(); }
}

export async function artByJson(path: string): Promise<string> {
  const sub = /^\/art\/subtle\/([a-z]{1,24}_\d{1,2}|cover)\.png$/.exec(path);   // T-423: THE SUBTLE LAYER's, kept as they are read
  if (sub) {
    const { png } = await api<{ png: string }>(`/api/art?subtle=${sub[1]}`);
    keepArt(path, `data:image/png;base64,${png}`);
    return ART.get(path)!;
  }
  const m = /^\/art\/(party|species)\/(\d+)\.png(?:\?expression=(\w+))?$/.exec(path);   // C-119: in an expression's shade
  if (!m) throw new Error("no such picture");
  if (m[1] === "species" && ALONE) {                   // C-111: painted on the phone, one at a time as the INDEX asks
    const { png } = await api<{ png: string }>(`/api/art?species=${m[2]}`);
    keepArt(path, `data:image/png;base64,${png}`);
  } else if (m[1] === "species") {
    everySpecies ??= api<{ species: Record<string, string> }>("/api/art?all=species").then(({ species }) => {
      for (const [n, png] of Object.entries(species)) keepArt(`/art/species/${n}.png`, `data:image/png;base64,${png}`);
    }).catch((e) => { everySpecies = null; throw e; });
    await everySpecies;
  } else {
    const { png } = await api<{ png: string }>(`/api/art?party=${m[2]}${m[3] ? `&expression=${m[3]}` : ""}`);
    keepArt(path, `data:image/png;base64,${png}`);
  }
  const uri = ART.get(path);
  if (!uri) throw new Error("no such picture");
  return uri;
}

// C-111: from now on this phone hosts on its own -- its widget is its device, and every request is answered here
export async function hostAlone() {
  ALONE = true;
  await SecureStore.setItemAsync("alone", "1", KEEP);
  if (WIDGET) { LOCAL?.hereAre([await WIDGET.widgetId()]); await WIDGET.hostAlone(true); }
}

// The connection, set from outside this module (an import cannot be assigned): by pairing, by the companion's way from
// away, and the unpair hook the App gives (C-157: the setters App.tsx's assignments became)
export function setConnection(c: { server?: string; token?: string | null; away?: string | null }) {
  if (c.server !== undefined) SERVER = c.server;
  if (c.token !== undefined) TOKEN = c.token;
  if (c.away !== undefined) AWAY = c.away;
}
export function onUnpaired(f: () => void) { unpaired = f; }

// C-100 / C-111: the widget drawn again -- by the companion it asks, or on a phone alone, by the app
export function redrawWidgetNow() {
  if (ALONE && WIDGET && LOCAL) WIDGET.drawAlone(LOCAL.localApi).catch(() => {});
  else WIDGET?.redrawWidget();
}
