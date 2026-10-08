// C-05: the companion's app -- Today, Goals and Daemon, against the local server (server/, npm start). It runs as a
// local site first (npm run web) and builds to iOS from the same code later. The daemon art is DAEMONS' own, drawn
// pixel for pixel.
// C-20: on Tamagui. The whole app sits in today's theme (tamagui.config.ts): $color9 is the day's colour, $color1 to
// $color8 its tints, $color10 to $color12 its shades -- so the app wears the day, as the device does.
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Image, Platform, View } from "react-native";
import { Button, Input, ScrollView, Spinner, TamaguiProvider, Text, Theme, XStack, YStack } from "tamagui";
import config, { DAYS, WEEK_COLOURS } from "./tamagui.config";
import * as SecureStore from "expo-secure-store";
import { File, Paths } from "expo-file-system";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder } from "expo-audio";

// bindCompanion.sh sets EXPO_PUBLIC_DAEMONS_SERVER: an Android emulator reaches this machine at 10.0.2.2, not 127.0.0.1.
// C-27, C-53: on the phone the companion's address and its key are set at runtime -- by pairing -- and kept in the
// phone's secure storage; on the site, the server is this machine and needs no key.
let SERVER = process.env.EXPO_PUBLIC_DAEMONS_SERVER ?? "http://127.0.0.1:4730";
let TOKEN: string | null = null;
// C-56: away from home, the phone reaches the companion through the user's n8n (docs/REMOTE.md). Home is tried first,
// briefly; whichever way answered is kept for a minute, so a walk does not pay the wait on every request.
let AWAY: string | null = null;
let route = { away: false, until: 0 };
const isAway = () => route.away;
// C-61: pairing again -- the stored address and key are dropped and the app goes back to PAIR THIS PHONE.
let unpaired: () => void = () => {};
async function pairAgain() {
  for (const k of ["server", "token", "away"]) await SecureStore.deleteItemAsync(k, KEEP).catch(() => {});
  TOKEN = null; AWAY = null; route = { away: false, until: 0 };
  unpaired();
}

// C-62: everything the companion has shown, kept on the phone -- every answer to a GET and every daemon's picture --
// so the app opens on what it last saw when the companion cannot be reached, says so, and holds a ticked step until
// the companion answers again. Each time the app opens and reaches the companion it fetches all of it at once.
type Kept = { at: string | null; paths: Record<string, unknown>; art: Record<string, string>;
              queue: { path: string; body: unknown }[] };
let KEPT: Kept = { at: null, paths: {}, art: {}, queue: [] };
let OFFLINE: string | null = null;                  // when what is on screen was kept, while the companion is away
const offlineHeard = new Set<() => void>();
const keptFile = () => new File(Paths.document, "kept.json");
async function loadKept() {
  if (!ON_PHONE) return;
  try {
    const f = keptFile();
    if (f.exists) KEPT = { ...KEPT, ...JSON.parse(await f.text()) };
  } catch { /* a damaged file is only a cache: start again */ }
}
let keepTimer: ReturnType<typeof setTimeout> | null = null;
function saveKept() {
  if (!ON_PHONE) return;
  if (keepTimer) clearTimeout(keepTimer);
  keepTimer = setTimeout(() => {
    try { const f = keptFile(); if (!f.exists) f.create(); f.write(JSON.stringify(KEPT)); } catch { /* next time */ }
  }, 800);
}
function setOffline(at: string | null) {
  if (OFFLINE === at) return;
  OFFLINE = at;
  offlineHeard.forEach((f) => f());
}
class Unreachable extends Error { name = "Unreachable"; }     // by name too: handheld.ts tells it from a NO
// C-87 (the user, 2026-10-08: "the phone doesn't lose any data"): every write that can wait is kept on the phone when
// the companion cannot be reached, and sent in order when it answers. Only what needs an answer NOW is not kept --
// talking, a voice, a SYNC of the save, the Mac's own dialogs, pairing, and the handheld told to do something this
// moment (run a routine, send a remote, join a network). A setting is kept once: only the latest of each is sent.
const NOT_KEPT = /^\/api\/(ai\/|sync|art|pair|settings\/(pick|reveal|network|relay)|device\/(run|remote|wifi|network))/;
const LATEST_ONLY = /^\/api\/(settings|talk\/settings|device\/settings|profile)$/;
// The handheld's own reports through this phone are kept by its bridge (handheld.ts, in order, with the board's id), so
// they are not kept here as well -- or a tick made away from home would arrive twice.
const keepable = (path: string) => !NOT_KEPT.test(path) && (!path.startsWith("/api/device/") || path === "/api/device/settings");
const ON_PHONE = Platform.OS !== "web";
// C-57: readable after the phone's first unlock, not only while it is unlocked -- iOS may open the app in a locked
// pocket when the handheld has something to say, and the app needs its key and the handheld's id then.
const KEEP = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
async function keepAfterFirstUnlock() {
  if (await SecureStore.getItemAsync("keychain-after-first-unlock")) return;
  for (const k of ["server", "token", "away", "handheld", "handheld-waiting"]) {
    const v = await SecureStore.getItemAsync(k);
    if (v !== null) { await SecureStore.deleteItemAsync(k); await SecureStore.setItemAsync(k, v, KEEP); }
  }
  await SecureStore.setItemAsync("keychain-after-first-unlock", "1", KEEP);
}
async function loadConnection(): Promise<boolean> {
  if (!ON_PHONE) return true;
  await keepAfterFirstUnlock().catch(() => {});
  await loadKept();
  for (const [p, uri] of Object.entries(KEPT.art)) ART.set(p, uri);
  const server = await SecureStore.getItemAsync("server"), token = await SecureStore.getItemAsync("token");
  AWAY = await SecureStore.getItemAsync("away");
  if (server && token) { SERVER = server; TOKEN = token; return true; }
  return false;
}
// C-55: the handheld's link over Bluetooth, carried by the phone (handheld.ts) -- only on the phone; the site has the cable.
const HANDHELD: typeof import("./handheld").handheld | null = ON_PHONE ? require("./handheld").handheld : null;
type HandheldNow = import("./handheld").Handheld;
// C-15: the phone meets others nearby (beacon.ts) -- only on the phone, which can advertise and listen
const MEETING: typeof import("./beacon").meeting | null = ON_PHONE ? require("./beacon").meeting : null;
const PIXELATED = Platform.OS === "web" ? ({ imageRendering: "pixelated" } as object) : {};

// C-73: the Xenith day -- the virtue over its shadow (cue), the chakra, the theme word
type Day = { day: string; colour: string; hue: string; note: string; chakra: string; virtue: string; shadow?: string;
             cue?: string; theme?: string };
type Next = { goal: string; subitem: string; step: { id: number; text: string } } | null;
type Today = { date: string; edition: string; day: Day; season: string; next: Next };
type Step = { id: number; text: string; done: boolean };
type Goal = { id: number; title: string; done: boolean; subitems: { id: number; title: string; done: boolean; steps: Step[] }[] };
type Daemon = { slot: number; species: number; name: string; nickname: string; level: number; friendship: number; away: boolean; asked: boolean;
                holding: string | null };

async function apiLive<T>(path: string, body?: unknown): Promise<T> {
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
    const away = () => fetch(AWAY!, { method: "POST", headers: { "content-type": "application/json", ...auth },
                                      body: JSON.stringify({ method: body === undefined ? "GET" : "POST", path, body }) });
    const ways = route.away && Date.now() < route.until ? [away, home] : [home, away];
    let failed: unknown;
    let viaAway = false;
    for (const way of ways) {
      try { r = await way(); viaAway = way === away; route = { away: viaAway, until: Date.now() + 60000 }; break; } catch (e) { failed = e; }
    }
    if (!r) throw new Unreachable(`Neither the companion at ${SERVER} nor the way from away answered.`);
    // C-86: the relay answered, but for the companion -- "not answering", a gateway timeout -- so the companion is
    // out of reach (asleep, or still making a voice): that is being away, and the phone shows what it kept.
    if (viaAway && [502, 503, 504].includes(r.status)) {
      const why = await r.json().catch(() => ({}));
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
const KEPT_FIRST_MS = 1200;
const freshHeard = new Set<() => void>();
async function liveAndKeep<T>(path: string): Promise<T> {
  const j = await apiLive<T>(path);
  const changed = JSON.stringify(KEPT.paths[path]) !== JSON.stringify(j);
  KEPT.paths[path] = j; KEPT.at = new Date().toISOString(); saveKept();
  setOffline(null);
  if (KEPT.queue.length) sendHeld();
  if (changed) freshSoon();
  return j;
}
let freshTimer: ReturnType<typeof setTimeout> | null = null;
function freshSoon() {                     // many answers at once (keepEverything) redraw the screen once, not each
  if (freshTimer) clearTimeout(freshTimer);
  freshTimer = setTimeout(() => { freshTimer = null; freshHeard.forEach((f) => f()); }, 600);
}

// C-62: every request goes through here. An answer is kept; no answer falls back to what was kept.
async function api<T>(path: string, body?: unknown): Promise<T> {
  if (ON_PHONE && body === undefined && !path.startsWith("/api/art") && path in KEPT.paths) {
    const live = liveAndKeep<T>(path).catch((e) => {
      if (!(e instanceof Unreachable)) throw e;                     // the companion answered "no"
      setOffline(KEPT.at);
      return KEPT.paths[path] as T;
    });
    const kept = new Promise<T>((res) => setTimeout(() => res(KEPT.paths[path] as T), KEPT_FIRST_MS));
    return Promise.race([live, kept]);
  }
  try {
    const j = await apiLive<T>(path, body);
    if (ON_PHONE) {
      if (body === undefined && !path.startsWith("/api/art")) { KEPT.paths[path] = j; KEPT.at = new Date().toISOString(); saveKept(); }
      setOffline(null);
      if (KEPT.queue.length) sendHeld();
    }
    return j;
  } catch (e) {
    if (!ON_PHONE || !(e instanceof Unreachable)) throw e;           // the companion answered "no": that is not offline
    if (body === undefined && path in KEPT.paths) { setOffline(KEPT.at); return KEPT.paths[path] as T; }
    if (body !== undefined && keepable(path)) {
      if (LATEST_ONLY.test(path)) KEPT.queue = KEPT.queue.filter((q) => q.path !== path);
      KEPT.queue.push({ path, body }); saveKept(); setOffline(KEPT.at);
      throw new Error("Kept on this phone. It goes to the companion the next time it answers.");
    }
    throw e;
  }
}
let sending = false;
async function sendHeld() {
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
async function keepEverything() {
  if (!ON_PHONE) return;
  for (const p of ["/api/today", "/api/goal", "/api/goals", "/api/party", "/api/profile", "/api/index", "/api/meetings", "/api/daemon/life", "/api/walk"])
    await liveAndKeep(p).catch(() => {});
  if (OFFLINE) return;
  // C-86: each party daemon's INDEX entry too, so opening one away from home needs nothing from home
  const carried = (KEPT.paths["/api/party"] as { party?: { species: number }[] } | undefined)?.party ?? [];
  for (const d of carried) await liveAndKeep(`/api/species/${d.species}`).catch(() => {});
  await artByJson("/art/species/1.png").catch(() => {});                // the whole INDEX's pictures, in one request
  const party = (KEPT.paths["/api/party"] as { party?: { slot: number }[] } | undefined)?.party ?? [];
  for (const d of party) await artByJson(`/art/party/${d.slot}.png`).catch(() => {});
}

// C-59: a daemon's picture. At home it loads straight from the companion; away, the relay carries only /api/ and
// JSON, so it comes as JSON instead -- and the INDEX's pictures all in one request, kept for the session, so a phone
// away from home runs the relay once for the whole INDEX rather than once a picture.
const ART = new Map<string, string>();
let everySpecies: Promise<void> | null = null;
function keepArt(path: string, uri: string) {
  ART.set(path, uri);
  if (ON_PHONE) { KEPT.art[path] = uri; saveKept(); }
}
async function artByJson(path: string): Promise<string> {
  const m = /^\/art\/(party|species)\/(\d+)\.png$/.exec(path);
  if (!m) throw new Error("no such picture");
  if (m[1] === "species") {
    everySpecies ??= api<{ species: Record<string, string> }>("/api/art?all=species").then(({ species }) => {
      for (const [n, png] of Object.entries(species)) keepArt(`/art/species/${n}.png`, `data:image/png;base64,${png}`);
    }).catch((e) => { everySpecies = null; throw e; });
    await everySpecies;
  } else {
    const { png } = await api<{ png: string }>(`/api/art?party=${m[2]}`);
    keepArt(path, `data:image/png;base64,${png}`);
  }
  const uri = ART.get(path);
  if (!uri) throw new Error("no such picture");
  return uri;
}
function Art({ path, size }: { path: string; size: number }) {
  const [uri, setUri] = useState<string | null>(ART.get(path) ?? (ON_PHONE && isAway() ? null : SERVER + path));
  const viaJson = useCallback(() => { artByJson(path).then(setUri).catch(() => {}); }, [path]);
  useEffect(() => { if (!uri) viaJson(); }, [uri, viaJson]);
  const style = [{ width: size, height: size }, PIXELATED as any];
  if (!uri) return <YStack width={size} height={size} />;
  return <Image source={{ uri }} style={style} onError={() => { if (uri.startsWith("http") && ON_PHONE) viaJson(); }} />;
}

// Words on the day's colour: ink on the light days (Tuesday's yellow), paper on the dark ones.
function onColour(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#1d2026" : "#fbfaf6";
}

const Eyebrow = (p: { children: React.ReactNode }) =>
  <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color="$color11">{p.children}</Text>;
const Small = (p: { children: React.ReactNode; struck?: boolean; color?: string }) =>
  <Text fontSize={14} lineHeight={20} color={p.struck ? "$color8" : (p.color ?? "$color11")}
        textDecorationLine={p.struck ? "line-through" : "none"}>{p.children}</Text>;
const Card = (p: React.ComponentProps<typeof YStack>) =>
  <YStack backgroundColor="$color1" borderWidth={1} borderColor="$color5" borderRadius={4} padding={16} gap={6} {...p} />;

// C-61: what a screen shows when the companion did not answer -- the reason, and on the phone a way to pair again
function Stuck({ error, ink }: { error: string; ink: string }) {
  return (
    <YStack gap={4}>
      <Small>{error}</Small>
      {ON_PHONE ? <Small>Paired with {SERVER}. If the companion has moved, pair again from its site: SETTINGS, PAIR A PHONE.</Small> : null}
      {ON_PHONE ? <Action label="Pair again" ink={ink} onPress={() => { pairAgain(); }} /> : null}
    </YStack>
  );
}

function Action({ label, onPress, ink }: { label: string; onPress: () => void; ink: string }) {
  return (
    <Button alignSelf="flex-start" marginTop={8} backgroundColor="$color9" borderRadius={3} paddingHorizontal={18}
            hoverStyle={{ backgroundColor: "$color10" }} pressStyle={{ backgroundColor: "$color10" }} onPress={onPress}>
      <Text fontFamily="$mono" fontSize={13} letterSpacing={1} fontWeight="700" color={ink}>{label}</Text>
    </Button>
  );
}

function TodayScreen({ today, reload, ink }: { today: Today; reload: () => void; ink: string }) {
  const done = async () => { if (today.next) { await api(`/api/steps/${today.next.step.id}/done`, {}); reload(); } };
  return (
    <YStack gap={14}>
      <Card>
        <Eyebrow>{today.day.day.toUpperCase()} · {today.day.note} · {today.season.toUpperCase()}</Eyebrow>
        <Text fontSize={24} fontWeight="600" color="$color12">{today.day.theme ?? today.day.virtue}</Text>
        <Text fontSize={16} color="$color11">{today.day.cue ?? today.day.virtue}</Text>
        <Small>{today.day.chakra} · {today.day.hue} · {today.edition}</Small>
      </Card>
      <Card borderLeftWidth={6} borderLeftColor="$color9" paddingVertical={20}>
        <Eyebrow>THE ONE THING</Eyebrow>
        {today.next ? (
          <>
            <Text fontSize={22} fontWeight="600" lineHeight={30} color="$color12">{today.next.step.text}</Text>
            <Small>{today.next.goal} › {today.next.subitem}</Small>
            <Action label="Done" onPress={done} ink={ink} />
          </>
        ) : (
          <Small>Nothing to do yet. Add a goal, and the first step will wait here.</Small>
        )}
      </Card>
    </YStack>
  );
}

// C-46: ONE goal, built from milestones and steps -- each entry short on purpose (simpler is better, and the site says
// so). A row is a step, or a milestone holding its own steps. Tap a step to do it; tap again to undo (C-49).
type GoalNow = { goal: Goal | null; limit: number };
type Walk = { date: string; goal: number; steps: number; reached: boolean };

function Entry({ value, onChange, onSubmit, placeholder, limit }:
               { value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder: string; limit: number }) {
  return (
    <XStack flexGrow={1} minWidth={200} alignItems="center" gap={6}>
      <Input flexGrow={1} value={value} maxLength={limit} onChangeText={onChange} onSubmitEditing={onSubmit} placeholder={placeholder}
             backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={14} />
      <Text fontFamily="$mono" fontSize={11} color={value.length >= limit ? "$color9" : "$color8"}>{`${value.length}/${limit}`}</Text>
    </XStack>
  );
}

function StepRow({ step, onToggle, onRemove }: { step: Step; onToggle: () => void; onRemove: () => void }) {
  return (
    <XStack alignItems="center" gap={10} paddingVertical={4}>
      <YStack role="checkbox" aria-checked={step.done} cursor="pointer" width={20} height={20} borderRadius={3} borderWidth={2}
              borderColor="$color9" backgroundColor={step.done ? "$color9" : "transparent"} onPress={onToggle} />
      <Text flex={1} fontSize={15} color={step.done ? "$color8" : "$color12"} textDecorationLine={step.done ? "line-through" : "none"}
            cursor="pointer" onPress={onToggle}>{step.text}</Text>
      <Text fontSize={13} color="$color8" cursor="pointer" onPress={onRemove} aria-label="remove">✕</Text>
    </XStack>
  );
}

function WalkCard({ ink }: { ink: string }) {
  const [w, setW] = useState<Walk | null>(null);
  const [typed, setTyped] = useState("");
  useEffect(() => { api<Walk>("/api/walk").then(setW).catch(() => {}); }, []);
  if (!w) return null;
  const save = async (patch: object) => { setW(await api<Walk>("/api/walk", patch)); setTyped(""); };
  return (
    <Card>
      <Eyebrow>WALKING</Eyebrow>
      <Text fontSize={18} fontWeight="600" color="$color12">{`${w.steps.toLocaleString()} of ${w.goal.toLocaleString()} steps today`}</Text>
      <Small>{w.reached ? "Reached: your daemon is glad of the walk." : "Reaching it counts as activity for your daemon. Your phone will count them; for now, type them in."}</Small>
      <XStack gap={8} flexWrap="wrap" alignItems="center" marginTop={4}>
        <Input width={140} value={typed} onChangeText={setTyped} keyboardType="number-pad" placeholder="steps today"
               backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={14}
               onSubmitEditing={() => Number(typed) >= 0 && save({ steps: Math.round(Number(typed)) })} />
        <Action label="Save" onPress={() => Number(typed) >= 0 && save({ steps: Math.round(Number(typed)) })} ink={ink} />
      </XStack>
      <XStack gap={6} flexWrap="wrap" marginTop={4}>
        {[6000, 8000, 10000, 12000].map((g) => (
          <Text key={g} fontFamily="$mono" fontSize={12} cursor="pointer" paddingHorizontal={8} paddingVertical={4} borderRadius={3}
                borderWidth={1} borderColor={w.goal === g ? "$color9" : "$color6"} color="$color12"
                onPress={() => save({ goal: g })}>{`${g / 1000}k a day`}</Text>
        ))}
      </XStack>
    </Card>
  );
}

function GoalsScreen({ reload, ink }: { reload: () => void; ink: string }) {
  const [now, setNow] = useState<GoalNow | null>(null);
  const [title, setTitle] = useState(""), [row, setRow] = useState(""), [kind, setKind] = useState<"step" | "milestone">("step");
  const [into, setInto] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const load = useCallback(() => { api<GoalNow>("/api/goal").then(setNow).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  const act = async (f: () => Promise<unknown>) => { try { setError(""); await f(); load(); reload(); } catch (e) { setError((e as Error).message); } };
  if (!now) return <Small>{error || "Loading…"}</Small>;
  const limit = now.limit, g = now.goal;
  const toggle = (st: Step) => act(() => api(`/api/steps/${st.id}/${st.done ? "undo" : "done"}`, {}));
  const remove = (body: object) => act(() => api("/api/goal/remove", body));
  if (!g) return (
    <YStack gap={14}>
      <Card>
        <Eyebrow>YOUR GOAL</Eyebrow>
        <Small>{`One goal at a time. A few words: ${limit} letters at most, on purpose -- simpler is better.`}</Small>
        <XStack gap={8} flexWrap="wrap" alignItems="center" marginTop={4}>
          <Entry value={title} onChange={setTitle} placeholder="Clean the house" limit={limit}
                 onSubmit={() => title.trim() && act(() => api("/api/goal", { title }).then(() => setTitle("")))} />
          <Action label="Set it" onPress={() => title.trim() && act(() => api("/api/goal", { title }).then(() => setTitle("")))} ink={ink} />
        </XStack>
        {error ? <Small color="$color9">{error}</Small> : null}
      </Card>
      <WalkCard ink={ink} />
    </YStack>
  );
  return (
    <YStack gap={14}>
      <Card borderLeftWidth={6} borderLeftColor="$color9">
        <Eyebrow>YOUR GOAL</Eyebrow>
        <Text fontSize={20} fontWeight="700" color="$color12">{g.title}</Text>
        <Small>{`What are its steps? Add a step, or a milestone that holds its own. Each is ${limit} letters at most -- simpler is better.`}</Small>
        {g.subitems.map((m) => m.title ? (
          <YStack key={m.id} marginTop={10} gap={2} paddingLeft={10} borderLeftWidth={2} borderLeftColor={m.done ? "$color6" : "$color9"}>
            <XStack alignItems="center" gap={8}>
              <Text flex={1} fontFamily="$mono" fontSize={12} letterSpacing={1.5} fontWeight="700" color={m.done ? "$color8" : "$color11"}>
                {`${m.title.toUpperCase()}${m.done ? "  ✓" : ""}`}</Text>
              <Text fontSize={13} color="$color8" cursor="pointer" onPress={() => remove({ milestone: m.id })} aria-label="remove milestone">✕</Text>
            </XStack>
            {m.steps.map((st) => <StepRow key={st.id} step={st} onToggle={() => toggle(st)} onRemove={() => remove({ step: st.id })} />)}
            <XStack gap={6} alignItems="center" marginTop={2}>
              <Entry value={into[m.id] ?? ""} onChange={(v) => setInto({ ...into, [m.id]: v })} placeholder={`+ a step in ${m.title}`} limit={limit}
                     onSubmit={() => (into[m.id] ?? "").trim() && act(() => api("/api/goal/step", { text: into[m.id], milestone: m.id })
                       .then(() => setInto({ ...into, [m.id]: "" })))} />
            </XStack>
          </YStack>
        ) : (
          <YStack key={m.id} marginTop={6}>
            {m.steps.map((st) => <StepRow key={st.id} step={st} onToggle={() => toggle(st)} onRemove={() => remove({ step: st.id })} />)}
          </YStack>
        ))}
        <XStack gap={8} flexWrap="wrap" alignItems="center" marginTop={12}>
          <Text fontFamily="$mono" fontSize={18} color="$color9">+</Text>
          {(["step", "milestone"] as const).map((k) => (
            <Text key={k} fontFamily="$mono" fontSize={12} cursor="pointer" paddingHorizontal={8} paddingVertical={4} borderRadius={3}
                  borderWidth={1} borderColor={kind === k ? "$color9" : "$color6"} backgroundColor={kind === k ? "$color9" : "transparent"}
                  color={kind === k ? ink : "$color12"} fontWeight={kind === k ? "700" : "400"} onPress={() => setKind(k)}>{k}</Text>
          ))}
          <Entry value={row} onChange={setRow} placeholder={kind === "step" ? "a step, like: wash the windows" : "a milestone, like: living room"} limit={limit}
                 onSubmit={() => row.trim() && act(() => api(`/api/goal/${kind}`, { text: row, title: row }).then(() => setRow("")))} />
          <Action label="Add" onPress={() => row.trim() && act(() => api(`/api/goal/${kind}`, { text: row, title: row }).then(() => setRow("")))} ink={ink} />
        </XStack>
        {error ? <Small color="$color9">{error}</Small> : null}
      </Card>
      <WalkCard ink={ink} />
    </YStack>
  );
}

type Settings = { savePath: string | null; dir: string | null; exists: boolean; valid: boolean; source: string; canPick: boolean };

// C-13: the daemon's life -- how it is, its day, and what you can do for it. Never more than this, never a nag.
type Life = { mood: number; word: string; fed: { today: number; due: number }; watered: { today: number; due: number };
              trained: boolean; tired: string; quietDays: number; cue: string | null;
              level: number | null; grown: { exp: number; level: number } | null };

function LifeCard({ ink, name }: { ink: string; name: string }) {
  const [l, setL] = useState<Life | null>(null);
  const [said, setSaid] = useState("");
  useEffect(() => { api<Life>("/api/daemon/life").then(setL).catch(() => {}); }, []);
  if (!l) return null;
  const care = async (what: "feed" | "water" | "train", word: string) => { setL(await api<Life>(`/api/daemon/${what}`, {})); setSaid(word); };
  return (
    <Card borderLeftWidth={6} borderLeftColor="$color9">
      <Eyebrow>{`${name}, TODAY`}</Eyebrow>
      <Text fontSize={20} fontWeight="600" color="$color12">{l.word}</Text>
      <Small>{`fed ${l.fed.today} of 3 · water ${l.watered.today} of 3${l.trained ? " · trained" : ""}`}</Small>
      {l.cue ? <Small color="$color10">{l.cue}</Small> : null}
      {l.grown && l.grown.exp > 0 ? <Small>{l.grown.level > (l.level ?? 0)
        ? `Grown here: level ${l.level} to ${l.grown.level}. It takes that home with it.`
        : `Grown here: ${l.grown.exp} experience. It takes that home with it.`}</Small> : null}
      <XStack gap={8} flexWrap="wrap" marginTop={4}>
        <Action label="Feed" onPress={() => care("feed", "Eaten.")} ink={ink} />
        <Action label="Water" onPress={() => care("water", "Drunk.")} ink={ink} />
        <Action label="Train" onPress={() => care("train", "Trained.")} ink={ink} />
      </XStack>
      {said ? <Small>{said}</Small> : null}
    </Card>
  );
}

// C-66, C-65: the daemon's voice on the phone. Its answer (and an INDEX entry read aloud) comes back as mp3 in base64 --
// through the relay too, which carries only JSON -- so it is written to the cache and played from there.
type Spoken = { answer?: string | null; heard?: string | null; provider?: string | null; error?: string | null; audioBase64?: string | null };
function useVoice() {
  const player = useAudioPlayer(null);
  return (b64?: string | null) => {
    if (!b64) return;
    const f = new File(Paths.cache, `voice-${Date.now()}.mp3`);
    f.create(); f.write(b64, { encoding: "base64" });
    player.replace({ uri: f.uri }); player.play();
  };
}

// C-66: push to talk -- hold TALK, say something, let go. The companion hears it (speech to text on the user's own
// server), the daemon answers as itself, and the INDEX voice says it.
function TalkCard({ ink, name }: { ink: string; name: string }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const speak = useVoice();
  const [state, setState] = useState<"" | "listening" | "thinking">("");
  const [said, setSaid] = useState<Spoken | null>(null);
  const start = async () => {
    const ok = await requestRecordingPermissionsAsync();
    if (!ok.granted) { setSaid({ error: "The microphone is off for this app (Settings, then DAEMONS)." }); return; }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync(); recorder.record(); setState("listening");
  };
  const stop = async () => {
    if (state !== "listening") return;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (!recorder.uri) { setState(""); return; }
    setState("thinking");
    try {
      const audioBase64 = await new File(recorder.uri).base64();
      const r = await api<Spoken>("/api/ai/talk", { audioBase64, audioMime: "audio/mp4" });
      setSaid(r); speak(r.audioBase64);
    } catch (e) { setSaid({ error: (e as Error).message }); } finally { setState(""); }
  };
  return (
    <Card borderLeftWidth={6} borderLeftColor="$color9">
      <Eyebrow>{`TALK WITH ${name}`}</Eyebrow>
      <Button onPressIn={start} onPressOut={stop} backgroundColor={state === "listening" ? "$color9" : "$color3"}
              borderColor="$color9" disabled={state === "thinking"}>
        <Text color={state === "listening" ? ink : "$color12"} fontFamily="$mono" letterSpacing={1.5}>
          {state === "listening" ? "LISTENING…" : state === "thinking" ? "THINKING…" : "HOLD TO TALK"}
        </Text>
      </Button>
      {said?.heard ? <Small color="$color10">{`“${said.heard}”`}</Small> : null}
      {said?.answer ? <Text fontSize={16} lineHeight={24} color="$color12">{said.answer}</Text> : null}
      {said?.error ? <Small color="$color8">{said.error}</Small> : null}
    </Card>
  );
}

function DaemonScreen({ ink, goSettings }: { ink: string; goSettings: () => void }) {
  const [party, setParty] = useState<Daemon[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ species: number; name: string; category: string; entry: string } | null>(null);
  const speak = useVoice();
  const [reading, setReading] = useState(false);
  const readAloud = async (species: number) => {           // C-65: the INDEX entry, in the INDEX voice
    setReading(true);
    try { speak((await api<Spoken>("/api/ai/speak", { species })).audioBase64); } catch { /* the card says nothing new */ }
    finally { setReading(false); }
  };
  const [note, setNote] = useState("");
  const [needPath, setNeedPath] = useState(false);   // C-30: SYNC with no save path set -> a modal that teaches it
  const [canPick, setCanPick] = useState(false);
  const load = useCallback(() => {
    api<{ party: Daemon[] }>("/api/party").then((r) => { setParty(r.party); setError(""); }).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  // C-21: the one SYNC. It reads the save, receives or returns a daemon if the game asked, links the save (so the
  // game shows SEND), and settles a daemon brought home without the app. Close the game first.
  const doSync = async () => {
    const r = await api<{ sameGame: boolean; firstSave: boolean; married: { name: string }; received: string[];
                          returned: string[]; refused: string[]; firstLink: boolean; recalledSeen: boolean;
                          grew: { nickname: string; exp: number; from: number; to: number } | null }>("/api/sync", {});
    const said: string[] = [];
    if (!r.sameGame) said.push(`This save belongs to a different game. Your companion carries daemons for ${r.married.name}'s.`);
    if (r.firstLink) said.push("Linked. Your game now offers SEND in a daemon's menu.");
    r.received.forEach((n) => said.push(`${n} is with your device now.`));
    r.returned.forEach((n) => said.push(`${n} is home.`));
    r.refused.forEach((n) => said.push(`${n} waits: one daemon at a time.`));
    if (r.recalledSeen) said.push("The daemon you brought home in the game is settled here too.");
    if (r.grew) said.push(r.grew.to > r.grew.from ? `${r.grew.nickname} came home grown: level ${r.grew.from} to ${r.grew.to}.`
                                                  : `${r.grew.nickname} came home with ${r.grew.exp} more experience.`);   // C-45
    setNote(said.length ? said.join(" ") : "Synced. Nothing was waiting.");
    load();
  };
  // C-30: before syncing, make sure a save is set. If not, teach it rather than fail.
  // Reviewed 2026-10-04: a SYNC that fails (a file that is not a DAEMONS save, a save the game is still writing) used
  // to fail silently; now it says why. And the check is that the file IS a save, not merely that it exists.
  const syncNow = async () => {
    try {
      const s = await api<Settings>("/api/settings");
      setCanPick(s.canPick);
      if (!s.valid) { setNeedPath(true); return; }
      await doSync();
    } catch (e) { setNote(`SYNC did not finish: ${(e as Error).message}`); }
  };
  const pickAndSync = async () => {
    try {
      const r = await api<Settings & { picked: string | null }>("/api/settings/pick", {});
      if (r.picked && r.valid) { setNeedPath(false); await doSync(); }
      else if (r.picked) setNote("That file is not a DAEMONS save. Choose the .sav the game writes.");
    } catch (e) { setNote(`Could not set the save: ${(e as Error).message}`); }
  };
  // The SYNC card is always shown -- when no save is set yet, SYNC is how the user is taught to set one (C-30).
  const asked = party?.some((d) => d.asked) ?? false;
  const away = party?.find((d) => d.away);
  return (
    <YStack gap={14}>
      {away ? <LifeCard ink={ink} name={away.nickname} /> : null}
      {away && ON_PHONE ? <TalkCard ink={ink} name={away.nickname} /> : null}
      {needPath ? (
        <Card borderColor="$color9" borderLeftWidth={6} borderLeftColor="$color9">
          <Eyebrow>FIRST, YOUR SAVE</Eyebrow>
          <Small>To sync, the app needs your DAEMONS save (a .sav file). From an emulator, it is the .sav beside the ROM; from a cartridge, pull the save to your computer first.</Small>
          <XStack gap={8} flexWrap="wrap" marginTop={4}>
            {canPick ? <Action label="Choose a save…" onPress={pickAndSync} ink={ink} /> : null}
            <Action label="Settings" onPress={() => { setNeedPath(false); goSettings(); }} ink={ink} />
          </XStack>
        </Card>
      ) : null}
      <Card borderColor={asked ? "$color9" : "$color5"}>
        <Small>{asked ? "The game is asking. Close it first, then SYNC." : "Close the game, then SYNC to bring your save across."}</Small>
        <Action label="SYNC" onPress={syncNow} ink={ink} />
      </Card>
      {note ? <Small>{note}</Small> : null}
      {error && !needPath ? <Small color="$color8">{error}</Small> : null}
      <XStack flexWrap="wrap" gap={12}>
        {(party ?? []).map((d) => (
          <YStack key={d.slot} width={150} alignItems="center" backgroundColor="$color1" borderWidth={1}
                  borderColor="$color5" borderRadius={4} padding={10} gap={2} opacity={d.away ? 0.45 : 1}
                  cursor="pointer" hoverStyle={{ borderColor: "$color9" }} role="button"
                  onPress={() => api<any>(`/api/species/${d.species}`).then((x) => setOpen({ species: d.species, name: x.name, category: x.category, entry: x.entry }))}>
            <Art path={`/art/party/${d.slot}.png`} size={128} />
            <Text fontFamily="$mono" fontSize={13} fontWeight="700" color="$color12">{d.nickname}</Text>
            <Small>{d.name} · L{d.level}</Small>
            {d.away ? <Small color="$color10">ON YOUR DEVICE</Small> : null}
            {d.holding ? <Small>holding {d.holding}</Small> : null}
            {d.asked ? <Small color="$color10">{d.away ? "ASKED HOME" : "ASKED TO GO"}</Small> : null}
          </YStack>
        ))}
      </XStack>
      {open ? (
        <Card borderColor="$color9">
          <Eyebrow>{open.name} · {open.category} DAEMON</Eyebrow>
          <Text fontSize={16} lineHeight={24} color="$color12">{open.entry}</Text>
          {ON_PHONE ? <Action label={reading ? "Reading…" : "Read aloud"} onPress={() => readAloud(open.species)} ink={ink} /> : null}
        </Card>
      ) : null}
      <MeetingsCard />
    </YStack>
  );
}

// C-60: who the daemon has met nearby (C-15). Each meeting: the species as the INDEX draws it, when, and whether a SYNC
// has written it into the save yet. Below, quietly, the user's own check that the radios listen: the board's last
// listen, and when the phone and the board last heard each other -- never counted as a meeting.
type Meeting = { at: string; species: number; name: string; art: string | null; written: boolean };
type Listen = { at: string; started: boolean; devices: number; beacons: number } | null;
const whenSaid = (iso: string) => {
  const t = new Date(iso), today = new Date().toDateString() === t.toDateString();
  const hm = t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return today ? `today, ${hm}` : `${t.toLocaleDateString([], { month: "short", day: "numeric" })}, ${hm}`;
};
function MeetingsCard() {
  const [m, setM] = useState<{ meetings: Meeting[]; heardOurs: { at: string } | null; lastListen: Listen } | null>(null);
  useEffect(() => { api<any>("/api/meetings").then(setM).catch(() => {}); }, []);
  if (!m) return null;
  return (
    <Card borderColor="$color5">
      <Eyebrow>MET NEARBY</Eyebrow>
      {m.meetings.length ? m.meetings.map((x, i) => (
        <XStack key={i} gap={10} alignItems="center">
          {x.art ? <Art path={x.art} size={48} /> : <YStack width={48} height={48} />}
          <YStack flex={1}>
            <Text fontFamily="$mono" fontSize={13} fontWeight="700" color="$color12">{x.name}</Text>
            <Small>{whenSaid(x.at)} · {x.written ? "in your INDEX" : "in your INDEX after the next SYNC"}</Small>
          </YStack>
        </XStack>
      )) : <Small>No one yet. A meeting needs another companion nearby: someone else's handheld, or the app on someone else's phone.</Small>}
      {m.lastListen || m.heardOurs ? (
        <Small color="$color8">
          {m.lastListen ? `Last listen ${whenSaid(m.lastListen.at)}: ${m.lastListen.started ? `${m.lastListen.devices} devices heard` : "the radio was busy"}.` : ""}
          {m.heardOurs ? ` Your phone and handheld last heard each other ${whenSaid(m.heardOurs.at)}.` : ""}
        </Small>
      ) : null}
    </Card>
  );
}

// C-23: the PROFILE -- whichever save was synced: who it belongs to and how far it has gone, as the trainer card says.
type Profile = { name: string; trainerId: number; playTime: { hours: number; minutes: number }; edition: string;
                 index: { held: boolean; seen: number; bound: number }; marks: boolean[]; diploma: boolean; opus: boolean;
                 gameClear: boolean; savedIn: { place: string } | null; thisGame: boolean | null; marriedTo: string | null };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <XStack justifyContent="space-between" alignItems="baseline" gap={12} paddingVertical={6}
            borderBottomWidth={1} borderBottomColor="$color4">
      <Eyebrow>{label}</Eyebrow>
      <Text fontSize={16} color="$color12" fontVariant={["tabular-nums"]}>{children}</Text>
    </XStack>
  );
}

function ProfileScreen() {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<Profile>("/api/profile").then(setP).catch((e) => setError(e.message)); }, []);
  if (error) return <Small>{error}</Small>;
  if (!p) return <Small>Reading your save…</Small>;
  const earned = p.marks.filter(Boolean).length;
  const id = String(p.trainerId).padStart(5, "0");
  return (
    <YStack gap={14}>
      <Card borderLeftWidth={6} borderLeftColor="$color9" paddingVertical={20}>
        <Eyebrow>{p.edition} · ID No. {id}</Eyebrow>
        <Text fontFamily="$mono" fontSize={28} fontWeight="700" letterSpacing={2} color="$color12">{p.name}</Text>
        <Small>{p.savedIn?.place ? `Last saved in ${p.savedIn.place}` : "Last saved somewhere the map does not name"}</Small>
        <Small color={p.thisGame === false ? "$color10" : undefined}>
          {p.thisGame === null ? "Not yet synced: the first save you SYNC becomes your companion's game."
            : p.thisGame ? "Your companion's game." : `A different game: your companion carries daemons for ${p.marriedTo}'s.`}
        </Small>
      </Card>
      <Card>
        <Fact label="PLAY TIME">{p.playTime.hours}:{String(p.playTime.minutes).padStart(2, "0")}</Fact>
        <Fact label="INDEX">{p.index.held ? `${p.index.bound} bound · ${p.index.seen} seen` : "not yet held"}</Fact>
        <YStack paddingVertical={8} gap={8}>
          <XStack justifyContent="space-between"><Eyebrow>MARKS</Eyebrow><Text fontSize={16} color="$color12">{earned} of 8</Text></XStack>
          <XStack gap={8}>
            {p.marks.map((m, i) => (
              <YStack key={i} width={22} height={22} borderRadius={3} borderWidth={2} borderColor="$color9"
                      backgroundColor={m ? "$color9" : "transparent"} aria-label={`MARK ${i + 1}${m ? ", earned" : ""}`} />
            ))}
          </XStack>
        </YStack>
        <Fact label="DIPLOMA">{p.diploma ? "earned" : "not yet"}</Fact>
        <Fact label="OPUS">{p.opus ? "carried" : "not carried"}</Fact>
        {p.gameClear ? <Fact label="THE STORY">told to the end</Fact> : null}
      </Card>
    </YStack>
  );
}

// C-29: the save path, set here and kept by the server. The user picks a file once (emulator or cart) and SYNC just
// works; "open the folder" shows where to put a save.
function SettingsScreen({ ink }: { ink: string }) {
  const [s, setS] = useState<Settings | null>(null);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const load = useCallback(() => {
    api<Settings>("/api/settings").then((r) => { setS(r); setTyped(r.savePath ?? ""); }).catch((e) => setNote(e.message));
  }, []);
  useEffect(load, [load]);
  const said = (r: Settings) => !r.exists ? "No file at that path yet." : r.valid ? "Save set." : "That file is not a DAEMONS save.";
  const pick = async () => { const r = await api<Settings>("/api/settings/pick", {}); setS(r); setTyped(r.savePath ?? ""); setNote(said(r)); };
  const save = async () => { const r = await api<Settings>("/api/settings", { savePath: typed }); setS(r); setNote(said(r)); };
  const reveal = async () => { await api("/api/settings/reveal", {}); };
  if (!s) return note ? <Stuck error={note} ink={ink} /> : <Small>Loading…</Small>;
  return (
    <YStack gap={14}>
      <Card borderLeftWidth={6} borderLeftColor={s.valid ? "$color9" : "$color5"}>
        <Eyebrow>YOUR DAEMONS SAVE</Eyebrow>
        <Text fontFamily="$mono" fontSize={13} color="$color12" wordWrap="break-word">{s.savePath ?? "not set"}</Text>
        <Small color={s.valid ? "$color10" : "$color8"}>
          {!s.savePath ? "Not set yet." : !s.exists ? "No file at that path yet."
            : !s.valid ? "That file is not a DAEMONS save."
            : `A DAEMONS save${s.source === "config.json" ? " (set in config.json)" : ""}.`}
        </Small>
        <XStack gap={8} flexWrap="wrap" marginTop={4}>
          {s.canPick ? <Action label="Choose a save…" onPress={pick} ink={ink} /> : null}
          {s.dir ? <Action label="Open the folder" onPress={reveal} ink={ink} /> : null}
        </XStack>
      </Card>
      <Card>
        <Eyebrow>OR TYPE THE PATH</Eyebrow>
        <Small>From an emulator, the .sav beside the ROM. From a cartridge, pull the save to your computer first. Point the emulator and the app at the same file and it just works.</Small>
        <XStack gap={8} alignItems="center" flexWrap="wrap" marginTop={4}>
          <Input flexGrow={1} minWidth={220} value={typed} onChangeText={setTyped} onSubmitEditing={save}
                 placeholder="/path/to/your.sav" backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={13} fontFamily="$mono" />
          <Action label="Save" onPress={save} ink={ink} />
        </XStack>
        {note ? <Small>{note}</Small> : null}
      </Card>
      <TalkSettingsCard ink={ink} />
    </YStack>
  );
}

// C-66: who answers when you talk to your daemon -- a privacy choice, so it is said plainly.
function TalkSettingsCard({ ink }: { ink: string }) {
  const [t, setT] = useState<{ provider: "auto" | "local" | "openrouter"; connected: boolean } | null>(null);
  useEffect(() => { api<typeof t>("/api/talk/settings").then(setT).catch(() => {}); }, []);
  if (!t) return null;
  const pick = async (provider: "auto" | "local" | "openrouter") => setT(await api<typeof t>("/api/talk/settings", { provider }));
  return (
    <Card>
      <Eyebrow>WHO ANSWERS WHEN YOU TALK</Eyebrow>
      <Choice value={t.provider} options={[["auto", "Mine, then OpenRouter"], ["local", "Only mine"], ["openrouter", "OpenRouter"]]}
              onPick={pick} ink={ink} />
      <Small>{t.provider === "local" ? "Your words stay on your own machines. If your model is busy or off, the daemon says it cannot answer."
        : t.provider === "openrouter" ? "The words heard go to OpenRouter to be answered. The recording itself never leaves home."
        : "Your own model answers; when it is busy, the words heard go to OpenRouter so nobody waits. The recording never leaves home."}</Small>
      {!t.connected ? <Small color="$color8">Talking is not set up yet: add "talk" to server/config.json (README, Talk to your daemon).</Small> : null}
    </Card>
  );
}

// ---- C-24: the save's own INDEX -- what was seen and bound, as the game shows it, each entry in the save's edition's
// voice; and OPUS's margin beside an entry, when the save holds OPUS and the game would show one.
type IndexEntry = { national: number; species: number; name: string; bound: boolean; art: string | null;
                    category?: string; types?: string[]; entry?: string; margin?: { state: string; text: string } };
type Index = { held: boolean; seen: number; bound: number; opus: boolean; entries: IndexEntry[] };

// C-85: any INDEX entry read aloud, one at a time (the user, 2026-10-08). The voice takes a moment to make, so LISTEN
// turns into a spinner with a stop in it, and then into HUSH while it speaks. While one is being read the other cards
// are locked, so taps cannot start a second voice over the first. Stopping before the voice arrives only lets go of it:
// the server finishes making it and nobody plays it.
type Reading = { species: number; phase: "making" | "speaking" } | null;
function useIndexReader() {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [reading, setReading] = useState<Reading>(null);
  const [failed, setFailed] = useState("");
  const turn = useRef(0);                                  // a stopped request's answer is recognised and dropped
  useEffect(() => { if (status.didJustFinish) setReading((r) => (r?.phase === "speaking" ? null : r)); }, [status.didJustFinish]);
  const listen = async (species: number) => {
    if (reading) return;
    const mine = ++turn.current;
    setFailed(""); setReading({ species, phase: "making" });
    try {
      const r = await api<Spoken>("/api/ai/speak", { species });
      if (turn.current !== mine) return;
      if (!r.audioBase64) { setFailed(r.error ?? "No voice came back."); setReading(null); return; }
      let uri = `data:audio/mpeg;base64,${r.audioBase64}`;                      // the site plays it as it came
      if (ON_PHONE) {                                                              // the phone, from its cache
        const f = new File(Paths.cache, `index-${Date.now()}.mp3`);
        f.create(); f.write(r.audioBase64, { encoding: "base64" }); uri = f.uri;
        await setAudioModeAsync({ playsInSilentMode: true });
      }
      player.replace({ uri }); player.play();
      setReading({ species, phase: "speaking" });
    } catch (e) { if (turn.current === mine) { setFailed((e as Error).message); setReading(null); } }
  };
  const stop = () => { turn.current++; player.pause(); setReading(null); };
  return { reading, failed, listen, stop };
}

// LISTEN (a play mark in a ring), the spinner with its stop square, and HUSH -- each a ring and a word, so the control
// keeps its place and its size as it changes.
function ListenControl({ phase, onListen, onStop, ink }: { phase: "making" | "speaking" | null; onListen: () => void;
                                                           onStop: () => void; ink: string }) {
  const Word = ({ children }: { children: string }) =>
    <Text fontFamily="$mono" fontSize={12} letterSpacing={1.5} color="$color12">{children}</Text>;
  const ring = { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" } as const;
  if (phase === "making") return (
    <XStack alignItems="center" gap={10} role="button" aria-label="Stop" cursor="pointer" onPress={onStop}>
      <YStack {...ring}>
        <Spinner size="large" color="$color9" position="absolute" />
        <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: "#888" }} />
      </YStack>
      <Word>STOP</Word>
    </XStack>
  );
  if (phase === "speaking") return (
    <XStack alignItems="center" gap={10} role="button" aria-label="Hush" cursor="pointer" onPress={onStop}>
      <YStack {...ring} borderWidth={2} borderColor="$color9">
        <XStack gap={3} alignItems="flex-end">
          {[8, 14, 10].map((h, i) => <YStack key={i} width={3} height={h} borderRadius={1} backgroundColor="$color9" />)}
        </XStack>
      </YStack>
      <Word>HUSH</Word>
    </XStack>
  );
  return (
    <XStack alignItems="center" gap={10} role="button" aria-label="Listen" cursor="pointer" onPress={onListen}>
      <YStack {...ring} backgroundColor="$color9">
        <View style={{ width: 0, height: 0, marginLeft: 4, borderTopWidth: 8, borderBottomWidth: 8, borderLeftWidth: 13,
                       borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: ink }} />
      </YStack>
      <Word>LISTEN</Word>
    </XStack>
  );
}

function IndexScreen({ ink }: { ink: string }) {
  const [ix, setIx] = useState<Index | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const voice = useIndexReader();
  const busy = voice.reading !== null;
  useEffect(() => { api<Index>("/api/index").then(setIx).catch((e) => setError(e.message)); }, []);
  if (error) return <Small>{error}</Small>;
  if (!ix) return <Small>Loading…</Small>;
  const flat = (s: string) => s.replace(/\n/g, " ");      // the game's line breaks are for its own window
  return (
    <YStack gap={10}>
      <Card>
        <Eyebrow>THE INDEX</Eyebrow>
        <Text fontSize={20} fontWeight="600" color="$color12">{ix.seen} seen · {ix.bound} bound</Text>
        {ix.opus ? <Small>OPUS is in your bag: where it has written beside an entry, it is shown.</Small> : null}
      </Card>
      {ix.entries.map((e) => (
        <Card key={e.national} padding={12} cursor={e.bound && !busy ? "pointer" : "default"}
              opacity={busy && open !== e.national ? 0.45 : 1}
              onPress={() => e.bound && !busy && setOpen(open === e.national ? null : e.national)}>
          <XStack gap={12} alignItems="center">
            {e.art ? <Art path={e.art} size={64} /> : null}
            <YStack flex={1}>
              <Text fontFamily="$mono" fontSize={11} color="$color10">{`No. ${String(e.national).padStart(3, "0")}`}</Text>
              <Text fontSize={16} fontWeight="600" color="$color12">{e.name}</Text>
              {e.bound ? <Small>{`${e.category} · ${(e.types ?? []).join(" / ")}`}</Small> : <Small>Seen</Small>}
            </YStack>
            {e.margin ? <Text fontFamily="$mono" fontSize={11} color="$color9">MARGIN</Text> : null}
          </XStack>
          {open === e.national ? (
            <YStack gap={8} marginTop={8}>
              <Text fontSize={15} lineHeight={22} color="$color12">{flat(e.entry ?? "")}</Text>
              {e.entry ? (
                <ListenControl phase={voice.reading?.species === e.species ? voice.reading.phase : null} ink={ink}
                               onListen={() => voice.listen(e.species)} onStop={voice.stop} />
              ) : null}
              {voice.failed && open === e.national ? <Small color="$color8">{voice.failed}</Small> : null}
              {e.margin ? (
                <YStack borderLeftWidth={3} borderLeftColor="$color9" paddingLeft={10}>
                  <Text fontSize={14} lineHeight={21} fontStyle="italic" color="$color11">{flat(e.margin.text)}</Text>
                </YStack>
              ) : null}
            </YStack>
          ) : null}
        </Card>
      ))}
    </YStack>
  );
}

// ---- C-32: the site and the device, linked. The server is the hub: this screen asks it what the link is, sends the
// board commands through it, and shows what the board answered. C-33 (its Wi-Fi) and C-34 (FLARE's search) live here.
type Link = { linked: boolean; via: "usb" | "wifi" | "phone" | null; lastSeen: string | null; firmware: string;
              routines: { name: string; radio: string; routines: string[] }[];
              pending: { id: number; type: string }[]; results: { id: number; ok: boolean; text: string; at: string }[];
              remotes: { active: number; remotes: { name: string; buttons: boolean[] }[] }; networks: string[]; currentNetwork: string;
              battery?: { percent: number; charging: boolean; full: boolean; usb: boolean; at: string } | null;   // C-63
              lan: { address: string | null; port: number; open: boolean };
              devices?: DeviceRow[] };                                                                  // C-80
type DeviceRow = { id: string; kind: string; via: "usb" | "wifi" | "phone" | null; lastSeen: string; here: boolean;
                   firmware: string | null; battery: { percent: number; charging: boolean; usb: boolean } | null };
const KIND_NAMES: Record<string, string> = { "t-embed-cc1101": "T-Embed CC1101", "t-embed": "T-Embed",
                                             "t-embed-si4732": "T-Embed SI4732", "t-watch-s3": "T-Watch S3",
                                             "m5-sticks3": "M5StickS3" };                                   // C-74
type RemoteSet = { label: string; protocol: string; bits: number; repeat: number; power: string; volumeUp: string; volumeDown: string };
type Brand = { brand: string; sets: RemoteSet[] };

// C-43: the board's settings live here, not on the board: it picks them up whenever it is linked.
type DeviceSettings = { home: "daemon" | "today"; sleepAfter: number; sound: boolean; volume: number; ring: number; meet: boolean };

function Choice<T>({ value, options, onPick, ink }: { value: T; options: [T, string][]; onPick: (v: T) => void; ink: string }) {
  return (
    <XStack gap={6} flexWrap="wrap">
      {options.map(([v, label]) => (
        <YStack key={String(v)} role="button" cursor="pointer" borderRadius={3} paddingHorizontal={12} paddingVertical={6}
                borderWidth={1} borderColor={v === value ? "$color9" : "$color6"} backgroundColor={v === value ? "$color9" : "$color1"}
                hoverStyle={{ borderColor: "$color9" }} onPress={() => onPick(v)}>
          <Text fontSize={13} fontWeight={v === value ? "700" : "400"} color={v === value ? ink : "$color12"}>{label}</Text>
        </YStack>
      ))}
    </XStack>
  );
}

function DeviceSettingsCard({ ink }: { ink: string }) {
  const [s, setS] = useState<DeviceSettings | null>(null);
  useEffect(() => { api<DeviceSettings>("/api/device/settings").then(setS).catch(() => {}); }, []);
  if (!s) return null;
  const set = async (patch: Partial<DeviceSettings>) => setS(await api<DeviceSettings>("/api/device/settings", patch));
  const Row = (p: { label: string; children: React.ReactNode }) =>
    <YStack gap={4} marginTop={6}><Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color10">{p.label}</Text>{p.children}</YStack>;
  return (
    <Card>
      <Eyebrow>ITS SETTINGS</Eyebrow>
      <Small>Set here and carried to the board the next time it is linked; it keeps them when it is not.</Small>
      <Row label="HOME, WHERE IT WAKES">
        <Choice<DeviceSettings["home"]> value={s.home} options={[["daemon", "The daemon"], ["today", "Today's step"]]} onPick={(home) => set({ home })} ink={ink} />
      </Row>
      <Row label="SLEEP WHEN LEFT ALONE">
        <Choice value={s.sleepAfter} options={[[30, "30 s"], [60, "1 min"], [120, "2 min"], [300, "5 min"], [0, "Never"]]}
                onPick={(sleepAfter) => set({ sleepAfter })} ink={ink} />
      </Row>
      <Row label="SOUND">
        <Choice value={s.sound ? s.volume : 0} options={[[0, "Off"], [20, "Quiet"], [40, "Middle"], [70, "Loud"]]}
                onPick={(v) => set(v === 0 ? { sound: false } : { sound: true, volume: v })} ink={ink} />
      </Row>
      <Row label="THE RING AT REST">
        <Choice value={s.ring} options={[[0, "Off"], [15, "Dim"], [33, "A third"], [60, "Bright"]]} onPick={(ring) => set({ ring })} ink={ink} />
        </Row>
        <Row label="MEET OTHERS NEARBY">
          <Choice value={s.meet} options={[[true, "On"], [false, "Off"]]} onPick={(meet) => set({ meet })} ink={ink} />
      </Row>
    </Card>
  );
}

function Result({ link, id }: { link: Link; id: number | null }) {
  if (id == null) return null;
  const r = link.results.find((x) => x.id === id);
  if (!r) return <Small>Sent to the board… {link.pending.some((p) => p.id === id) ? "(waiting for it to pick it up)" : ""}</Small>;
  return <Text fontFamily="$mono" fontSize={12} lineHeight={18} color={r.ok ? "$color12" : "$color9"} whiteSpace="pre-wrap">{r.text}</Text>;
}

function DeviceScreen({ ink }: { ink: string }) {
  const [link, setLink] = useState<Link | null>(null);
  const [error, setError] = useState("");
  const [ran, setRan] = useState<number | null>(null);
  const [ssid, setSsid] = useState(""), [pass, setPass] = useState(""), [wifiSent, setWifiSent] = useState<number | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]), [brand, setBrand] = useState<string>(""), [at, setAt] = useState(0);
  const [tried, setTried] = useState<number | null>(null), [kept, setKept] = useState<number | null>(null);
  const [managed, setManaged] = useState<number | null>(null), [forgot, setForgot] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null), [newName, setNewName] = useState("");   // C-59
  useEffect(() => {
    const poll = () => api<Link>("/api/device/link").then((l) => { setLink(l); setError(""); }).catch((e) => setError(e.message));
    poll();
    const t = setInterval(poll, 1500);                        // while this tab is open
    api<Brand[]>("/api/ir/brands").then(setBrands).catch(() => {});
    return () => clearInterval(t);
  }, []);
  if (error) return <Small>{error}</Small>;
  if (!link) return <Small>Loading…</Small>;
  const run = async (routine: string) => setRan((await api<{ id: number }>("/api/device/run", { routine })).id);
  // C-51: a brand's remote -- try its POWER, and keep the whole remote (its volume buttons come with it)
  const sets = brands.find((b) => b.brand === brand)?.sets ?? [];
  const set = sets[at];
  const tryPower = async () => setTried((await api<{ id: number }>("/api/device/ir",
    { protocol: set.protocol, code: set.power, bits: set.bits, repeat: set.repeat, label: `${set.label} POWER` })).id);
  const keepRemote = async () => setKept((await api<{ id: number }>("/api/device/remote", { op: "add", brand, label: set.label })).id);
  const manage = async (op: "activate" | "remove", index: number) =>
    setManaged((await api<{ id: number }>("/api/device/remote", { op, index })).id);
  const rename = async (index: number) => {   // C-59: the user's own name for a remote
    setManaged((await api<{ id: number }>("/api/device/remote", { op: "rename", index, name: newName })).id);
    setRenaming(null);
  };
  const sendWifi = async () => setWifiSent((await api<{ id: number }>("/api/device/wifi", { ssid, password: pass })).id);
  return (
    <YStack gap={14}>
      {HANDHELD ? <HandheldCard ink={ink} /> : null}
      <Card borderLeftWidth={6} borderLeftColor={link.linked ? "$color9" : "$color5"}>
        <Eyebrow>THE HANDHELD</Eyebrow>
        <Text fontSize={20} fontWeight="600" color="$color12">
          {link.linked ? `Linked, by ${link.via === "usb" ? "its cable" : link.via === "phone" ? "a phone (Bluetooth)" : "Wi-Fi"}` : "Not linked"}
        </Text>
        <Small>{link.linked ? link.firmware
          : "Plug it in and run ./linkCompanion.sh, or let it join your Wi-Fi (below)."}</Small>
        {link.battery ? <Small color={link.battery.percent <= 15 && !link.battery.usb ? "$red10" : undefined}>
          {`Battery ${link.battery.percent}%${link.battery.charging ? ", charging" : link.battery.full ? ", full" : link.battery.usb ? ", plugged in" : ""}`}
          {` (as of ${new Date(link.battery.at).toLocaleTimeString()})`}</Small> : null}
      </Card>

      {link.devices && link.devices.length ? (                // C-80: every device the companion has heard, by its own name
        <Card>
          <Eyebrow>YOUR DEVICES</Eyebrow>
          {link.devices.map((d) => (
            <YStack key={d.id} gap={0} marginTop={4}>
              <Text fontSize={15} fontWeight="600" color={d.here ? "$color12" : "$color10"}>
                {`${KIND_NAMES[d.kind] ?? d.kind}${d.here ? "" : " (away)"}`}</Text>
              <Small>{[d.here ? `here, by ${d.via === "usb" ? "its cable" : d.via === "phone" ? "the phone" : "Wi-Fi"}`
                                : `last heard ${new Date(d.lastSeen).toLocaleString()}`,
                       d.battery ? `battery ${d.battery.percent}%${d.battery.charging ? ", charging" : ""}` : null,
                       d.id].filter(Boolean).join(" · ")}</Small>
            </YStack>
          ))}
        </Card>
      ) : null}

      {link.linked ? (
        <Card>
          <Eyebrow>ITS ROUTINES</Eyebrow>
          <Small>Run any of them from here. The board shows it running, and its answer comes back below.</Small>
          {link.routines.filter((t) => t.routines.length).map((t) => (
            <YStack key={t.name} gap={2} marginTop={6}>
              <Text fontFamily="$mono" fontSize={12} letterSpacing={1} color="$color10">{t.name} ({t.radio})</Text>
              <XStack gap={8} flexWrap="wrap">
                {t.routines.filter((r) => r !== "JOIN A NETWORK").map((r) =>
                  <Action key={r} label={r} onPress={() => run(`${t.name}/${r}`)} ink={ink} />)}
              </XStack>
            </YStack>
          ))}
          <Result link={link} id={ran} />
        </Card>
      ) : null}

      <DeviceSettingsCard ink={ink} />

      <Card>
        <Eyebrow>ITS REMOTES</Eyebrow>
        <Small>{`The remotes the board has learned -- on the board, FLARE then TEACH A REMOTE (power, volume up, volume down), or add one here by its brand. FLARE's buttons send from the one in use.`}</Small>
        {link.remotes.remotes.length === 0 ? <Small color="$color10">None learned yet.</Small> : null}
        {link.remotes.remotes.map((r, i) => (
          <XStack key={i} alignItems="center" gap={8} flexWrap="wrap" paddingVertical={4}>
            <Text flex={1} minWidth={140} fontSize={15} fontWeight={i === link.remotes.active ? "700" : "400"} color="$color12">
              {`${r.name}${i === link.remotes.active ? "  (in use)" : ""}`}</Text>
            <Text fontFamily="$mono" fontSize={11} color="$color10">
              {["POWER", "VOL +", "VOL -"].map((b, k) => r.buttons[k] ? b : `no ${b}`).join(" · ")}</Text>
            {i !== link.remotes.active ? <Action label="Use it" onPress={() => manage("activate", i)} ink={ink} /> : null}
            <Action label="Rename" onPress={() => { setRenaming(i); setNewName(r.name); }} ink={ink} />
            <Action label="Remove" onPress={() => manage("remove", i)} ink={ink} />
            {renaming === i ? (
              <XStack width="100%" gap={8} alignItems="center" flexWrap="wrap">
                <Input flex={1} minWidth={160} value={newName} onChangeText={setNewName} maxLength={16} autoFocus
                       placeholder="a name, up to 16 letters" backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={15} />
                <Action label="Save" onPress={() => rename(i)} ink={ink} />
                <Action label="Cancel" onPress={() => setRenaming(null)} ink={ink} />
              </XStack>
            ) : null}
          </XStack>
        ))}
        <Result link={link} id={managed} />
        <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color10" marginTop={8}>ADD ONE BY BRAND</Text>
        <XStack gap={8} flexWrap="wrap">
          {brands.map((b) => (
            <YStack key={b.brand} role="button" cursor="pointer" borderRadius={3} paddingHorizontal={14} paddingVertical={8}
                    borderWidth={1} borderColor={brand === b.brand ? "$color9" : "$color6"}
                    backgroundColor={brand === b.brand ? "$color9" : "$color1"} hoverStyle={{ borderColor: "$color9" }}
                    onPress={() => { setBrand(b.brand); setAt(0); setTried(null); setKept(null); }}>
              <Text fontSize={13} fontWeight={brand === b.brand ? "700" : "400"} color={brand === b.brand ? ink : "$color12"}>{b.brand}</Text>
            </YStack>
          ))}
        </XStack>
        {set ? (
          <YStack gap={4} marginTop={6}>
            <Small>{`Point the board's end at your TV and try its POWER${sets.length > 1 ? ` (${at + 1} of ${sets.length})` : ""}. If the TV answers, keep the remote: its volume buttons come with it.`}</Small>
            <XStack gap={8} flexWrap="wrap">
              <Action label="Try its POWER" onPress={tryPower} ink={ink} />
              <Action label="It worked: keep this remote" onPress={keepRemote} ink={ink} />
              {sets.length > 1 ? <Action label="Next" onPress={() => { setAt((at + 1) % sets.length); setTried(null); }} ink={ink} /> : null}
            </XStack>
            <Result link={link} id={kept ?? tried} />
            {!link.linked ? <Small>The board is not linked, so nothing will send yet.</Small> : null}
          </YStack>
        ) : null}
      </Card>

      <Card>
        <Eyebrow>ITS NETWORKS</Eyebrow>
        <Small>The networks the board has learned. It joins whichever one it is near. Teach it one here (sent down its
          cable only, never over the network) or on the board itself: ROUTINES, UPLINK, TEACH A NETWORK.</Small>
        {link.networks.length === 0 ? <Small color="$color10">None learned yet.</Small> : null}
        {link.networks.map((n, i) => (
          <XStack key={n} alignItems="center" gap={8} paddingVertical={2}>
            <Text flex={1} fontSize={15} fontWeight={n === link.currentNetwork ? "700" : "400"} color="$color12">
              {`${n}${n === link.currentNetwork ? "  (on it now)" : ""}`}</Text>
            <Action label="Forget" onPress={async () => setForgot((await api<{ id: number }>("/api/device/network", { op: "forget", index: i })).id)} ink={ink} />
          </XStack>
        ))}
        <Result link={link} id={forgot} />
        {!link.lan.open ? <Small color="$color9">For the board to reach this computer over Wi-Fi, the server has to listen
          on your network: set "host": "0.0.0.0" in server/config.json and restart the companion.</Small> : null}
        <XStack gap={8} flexWrap="wrap" marginTop={4}>
          <Input flexGrow={1} minWidth={160} value={ssid} onChangeText={setSsid} placeholder="network name"
                 backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={13} />
          <Input flexGrow={1} minWidth={160} value={pass} onChangeText={setPass} placeholder="password" secureTextEntry
                 backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={13} />
          <Action label="Teach it this one" onPress={sendWifi} ink={ink} />
        </XStack>
        {link.via !== "usb" ? <Small>Link it by its cable first (./linkCompanion.sh): that is the only way this is sent.</Small> : null}
        <Result link={link} id={wifiSent} />
      </Card>
    </YStack>
  );
}

// ---- C-53: pairing this phone with the companion -- the address the site shows, and its code, once ----
// ---- C-55, on the phone: the handheld over Bluetooth -- pair it once, and the phone carries its link from then on ----
function HandheldCard({ ink }: { ink: string }) {
  const [h, setH] = useState<HandheldNow | null>(null);
  useEffect(() => HANDHELD!.watch(setH), []);
  if (!h) return null;
  const head = h.phase === "linked" ? `Linked to ${h.name}` : h.phase === "lost" ? "Out of range"
    : h.phase === "looking" ? "Looking…" : h.phase === "pairing" ? "Pairing…" : "Not paired";
  return (
    <Card borderLeftWidth={6} borderLeftColor={h.phase === "linked" ? "$color9" : "$color5"}>
      <Eyebrow>THE HANDHELD, ON THIS PHONE</Eyebrow>
      <Text fontSize={20} fontWeight="600" color="$color12">{head}</Text>
      <Small>{h.phase === "linked"
        ? (h.companion ? "This phone carries its link: its goal, its daemon and its routines, wherever you both go."
                       : "The companion is out of reach. The handheld keeps going, and what it does waits here.")
        : h.note || "Pair it once: on the handheld, ROUTINES, WHISPER, PAIR MY PHONE. Then press Pair below and type the code it shows."}</Small>
      {h.waiting ? <Small>{`${h.waiting} waiting for the companion`}</Small> : null}
      <XStack gap={8} flexWrap="wrap">
        {h.phase === "none" || h.phase === "lost" ? <Action label="Pair the handheld" ink={ink} onPress={() => HANDHELD!.pair()} /> : null}
        {h.phase !== "none" ? <Action label="Forget it" ink={ink} onPress={() => HANDHELD!.forget()} /> : null}
      </XStack>
    </Card>
  );
}

function PairScreen({ onPaired }: { onPaired: () => void }) {
  const [server, setServer] = useState(""), [code, setCode] = useState(""), [name, setName] = useState("my phone");
  const [error, setError] = useState("");
  const pair = async () => {
    try {
      setError("");
      const base = server.trim().replace(/\/$/, "").replace(/^(?!https?:\/\/)/, "http://");
      const r = await fetch(base + "/api/pair", { method: "POST", headers: { "content-type": "application/json" },
                                                  body: JSON.stringify({ code: code.trim(), name: name.trim() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `the companion answered ${r.status}`);
      await SecureStore.setItemAsync("server", base, KEEP);
      await SecureStore.setItemAsync("token", j.token, KEEP);
      if (j.away) { await SecureStore.setItemAsync("away", j.away, KEEP); AWAY = j.away; }   // C-56
      SERVER = base; TOKEN = j.token;
      onPaired();
    } catch (e) { setError(`${(e as Error).message}. Is the companion running, and is it open to your network (Settings on the site)?`); }
  };
  return (
    <YStack flex={1} backgroundColor="$color2" padding={24} paddingTop={80} gap={14}>
      <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="600" color="$color10">DAEMONS · companion</Text>
      <Text fontSize={24} fontWeight="700" color="$color12">Pair this phone</Text>
      <Small>On your computer, open the companion's site, then SETTINGS, PAIR A PHONE, and Show a code. Type its address and the code here.</Small>
      <Input value={server} onChangeText={setServer} placeholder="http://10.0.0.100:4730" autoCapitalize="none" autoCorrect={false}
             keyboardType="url" backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={15} />
      <Input value={code} onChangeText={setCode} placeholder="six-digit code" keyboardType="number-pad" maxLength={6}
             backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={15} />
      <Input value={name} onChangeText={setName} placeholder="this phone's name" maxLength={40}
             backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={15} />
      <Action label="Pair" onPress={pair} ink="#fbfaf6" />
      {error ? <Small color="$color9">{error}</Small> : null}
    </YStack>
  );
}

// ---- C-27, C-48: on the phone, today's steps from Apple Health go to the walking goal ----
async function sendTodaysSteps(): Promise<number | null> {
  if (Platform.OS !== "ios") return null;
  const HK = require("@kingstinct/react-native-healthkit");
  if (!HK.isHealthDataAvailable()) return null;
  await HK.requestAuthorization({ toRead: ["HKQuantityTypeIdentifierStepCount"] });
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const r = await HK.queryStatisticsForQuantity("HKQuantityTypeIdentifierStepCount", ["cumulativeSum"],
                                                { filter: { date: { startDate: midnight, endDate: new Date() } }, unit: "count" });
  const steps = Math.round(r?.sumQuantity?.quantity ?? 0);
  await api("/api/walk", { steps });
  return steps;
}

// ---- C-53, on the site: open the companion to the network, show a code, see and forget paired phones ----
function PairCard({ ink }: { ink: string }) {
  const [net, setNet] = useState<{ open: boolean; now: boolean; address: string | null; port: number } | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [phones, setPhones] = useState<{ name: string; paired: string; seen: string | null }[]>([]);
  const load = useCallback(() => {
    api<typeof net>("/api/settings/network").then(setNet).catch(() => {});
    api<typeof phones>("/api/pair/phones").then(setPhones).catch(() => {});
  }, []);
  useEffect(load, [load]);
  if (!net) return null;
  const address = net.address ? `http://${net.address}:${net.port}` : "(no network address)";
  return (
    <Card>
      <Eyebrow>PAIR A PHONE</Eyebrow>
      <Small>The companion app on your phone talks to this computer once it is paired. It needs the companion open to your network.</Small>
      <XStack gap={8} flexWrap="wrap" alignItems="center">
        <Action label={net.open ? "Open to my network: yes" : "Open to my network: no"} ink={ink}
                onPress={async () => { await api("/api/settings/network", { open: !net.open }); load(); }} />
      </XStack>
      {net.open !== net.now ? <Small color="$color9">Restart the companion for this to take effect (Ctrl-C, then ./bindCompanion.sh).</Small> : null}
      {net.now ? (
        <>
          <Action label="Show a code" ink={ink} onPress={async () => setCode((await api<{ code: string }>("/api/pair/code", {})).code)} />
          {code ? (
            <YStack gap={2} marginTop={4}>
              <Text fontFamily="$mono" fontSize={28} letterSpacing={6} fontWeight="700" color="$color12">{code}</Text>
              <Small>{`On the phone, type the address ${address} and this code. It works once, for ten minutes.`}</Small>
            </YStack>
          ) : null}
        </>
      ) : null}
      {phones.map((p) => (
        <XStack key={p.name} alignItems="center" gap={8} paddingVertical={2}>
          <Text flex={1} fontSize={15} color="$color12">{`${p.name}${p.seen ? "" : "  (not seen yet)"}`}</Text>
          <Action label="Forget" ink={ink} onPress={async () => setPhones(await api("/api/pair/forget", { name: p.name }))} />
        </XStack>
      ))}
    </Card>
  );
}

// ---- C-56, on the site: the way back from anywhere -- the relay on the user's n8n, and the secret it marks requests with ----
function RelayCard({ ink }: { ink: string }) {
  const [r, setR] = useState<{ url: string | null; secret: string } | null>(null);
  const [url, setUrl] = useState(""), [said, setSaid] = useState("");
  useEffect(() => { api<NonNullable<typeof r>>("/api/settings/relay").then((x) => { setR(x); setUrl(x.url ?? ""); }).catch(() => {}); }, []);
  if (!r) return null;
  const save = async (b: object) => {
    try { const x = await api<NonNullable<typeof r>>("/api/settings/relay", b); setR(x); setSaid("Saved. Paired phones learn it the next time they open at home."); }
    catch (e) { setSaid((e as Error).message); }
  };
  return (
    <Card>
      <Eyebrow>AWAY FROM HOME</Eyebrow>
      <Small>Your n8n carries the phone's requests here from anywhere (docs/REMOTE.md). Its webhook's address:</Small>
      <Input value={url} onChangeText={setUrl} placeholder="https://your-n8n/webhook/companion" autoCapitalize="none" autoCorrect={false}
             backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={15} />
      <XStack gap={8} flexWrap="wrap">
        <Action label="Save" ink={ink} onPress={() => save({ url })} />
        <Action label="New secret" ink={ink} onPress={() => save({ renew: true })} />
      </XStack>
      <Small>The relay's secret (n8n sends it as x-companion-relay):</Small>
      <Text fontFamily="$mono" fontSize={13} color="$color12" selectable>{r.secret}</Text>
      {said ? <Small>{said}</Small> : null}
    </Card>
  );
}

const TABS = ["today", "goals", "daemon", "index", "device", "profile", "settings"] as const;

function Shell() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("today");
  const [today, setToday] = useState<Today | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    api<Today>("/api/today").then(setToday).catch((e) => setError(`${e.message} -- is the server running? (./bindCompanion.sh)`));
    api<Goal[]>("/api/goals").then(setGoals).catch(() => {});
  }, []);
  useEffect(reload, [reload]);
  // C-62: keep everything on the phone each time the app opens and reaches the companion; redraw when it goes away
  const [, heard] = useState(0);
  // C-86: a screen first drawn from what the phone kept is drawn again when the companion's fresher answer arrives
  const [fresh, setFresh] = useState(0);
  useEffect(() => {
    const f = () => heard((n) => n + 1);
    const g = () => { setFresh((n) => n + 1); reload(); };
    offlineHeard.add(f); freshHeard.add(g);
    keepEverything().then(f);
    return () => { offlineHeard.delete(f); freshHeard.delete(g); };
  }, [reload]);
  // C-55: back to the handheld this phone paired with, if any
  useEffect(() => { HANDHELD?.start(api, isAway); MEETING?.start(api, () => HANDHELD!.bluetooth()); }, []);
  // C-56: the way back from anywhere, learned at home and kept on the phone
  useEffect(() => {
    if (!ON_PHONE) return;
    api<{ url: string | null }>("/api/settings/away").then(async ({ url }) => {
      AWAY = url;
      if (url) await SecureStore.setItemAsync("away", url, KEEP); else await SecureStore.deleteItemAsync("away");
    }).catch(() => {});
  }, []);
  // C-27, C-48: on the phone, today's steps from Apple Health -- when the app opens, and each time it comes back
  useEffect(() => {
    if (!ON_PHONE) return;
    const sync = () => sendTodaysSteps().then(() => reload()).catch(() => {});
    sync();
    // C-87: each time the app comes back to the front, what the phone holds is brought up to date (and anything kept
    // on it is sent), so a phone opened away from home shows the freshest it could get
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") { sync(); keepEverything().catch(() => {}); HANDHELD?.nudge(); MEETING?.nudge(); } });
    return () => sub.remove();
  }, [reload]);
  // Today's theme, by name; before the server answers, the paper alone. On the site, ?day=tuesday shows another day's
  // theme, to look at all seven without waiting a week.
  const asked = Platform.OS === "web" ? new URLSearchParams(globalThis.location?.search ?? "").get("day")?.toLowerCase() : null;
  const day = asked && DAYS.includes(asked) ? asked
    : today && DAYS.includes(today.day.day.toLowerCase()) ? today.day.day.toLowerCase() : null;
  const ink = onColour(day ? WEEK_COLOURS[day] : "#5b6b8c");

  const page = (
    <YStack flex={1} backgroundColor="$color2">
      <YStack paddingTop={ON_PHONE ? 60 : 24} paddingHorizontal={20} borderBottomWidth={3} borderBottomColor="$color9" backgroundColor="$color1">
        <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="600" color="$color10">DAEMONS · companion</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <XStack gap={20} marginTop={12} role="tablist">
          {TABS.map((t) => (
            <YStack key={t} paddingVertical={10} borderBottomWidth={3} cursor="pointer" role="tab"
                    aria-selected={tab === t} borderBottomColor={tab === t ? "$color9" : "transparent"}
                    onPress={() => setTab(t)}>
              <Text fontFamily="$mono" fontSize={12} letterSpacing={1.5} fontWeight={tab === t ? "700" : "400"}
                    color={tab === t ? "$color12" : "$color10"}>{t.toUpperCase()}</Text>
            </YStack>
          ))}
        </XStack>
        </ScrollView>
      </YStack>
      <ScrollView key={fresh} contentContainerStyle={{ padding: 20, maxWidth: 720, width: "100%", alignSelf: "center" }}>
        {OFFLINE ? <Small>Away from the companion: this is what the phone kept on {new Date(OFFLINE).toLocaleString()}.{KEPT.queue.length ? ` ${KEPT.queue.length} kept to send.` : ""}</Small> : null}
        {error ? <Stuck error={error} ink={ink} /> : null}
        {tab === "today" && today ? <TodayScreen today={today} reload={reload} ink={ink} /> : null}
        {tab === "goals" ? <GoalsScreen reload={reload} ink={ink} /> : null}
        {tab === "daemon" ? <DaemonScreen ink={ink} goSettings={() => setTab("settings")} /> : null}
        {tab === "index" ? <IndexScreen ink={ink} /> : null}
        {tab === "device" ? <DeviceScreen ink={ink} /> : null}
        {tab === "profile" ? <ProfileScreen /> : null}
        {tab === "settings" ? <SettingsScreen ink={ink} /> : null}
        {tab === "settings" && !ON_PHONE ? <YStack marginTop={14} gap={14}><PairCard ink={ink} /><RelayCard ink={ink} /></YStack> : null}
      </ScrollView>
      <StatusBar style="dark" />
    </YStack>
  );
  return day ? <Theme name={day as any}>{page}</Theme> : page;
}

export default function App() {
  // C-53: on the phone, pair first; on the site, the server is this machine
  const [paired, setPaired] = useState<boolean | null>(ON_PHONE ? null : true);
  useEffect(() => { unpaired = () => setPaired(false); loadConnection().then(setPaired); }, []);
  return (
    <TamaguiProvider config={config} defaultTheme="light">
      {paired === null ? null : paired ? <Shell /> : <PairScreen onPaired={() => setPaired(true)} />}
    </TamaguiProvider>
  );
}
