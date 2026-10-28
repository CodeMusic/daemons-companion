// C-203 (the user, 2026-10-28, through the Subtle Layer session, by multiple choice): THE SUBTLE LAYER on the companion --
// DAEMONS T-459's reads, leans and noticing, off the cartridge. All of it wakes only once the save holds the book (the
// state carries `subtle` then, and only then), as the game's do.
//
// THE THREE (DAEMONS T-454), carried and never shown: CLOSURE from the carried daemon's friendship (the save's), one less
// while MAD is 40 or more; ATTUNEMENT from CALM; VOLTAGE from the strongest feeling -- the game's own table (engine
// include/daemons_three.h), read here with the companion's feelings (feelings.ts). READ = ATTUNEMENT - VOLTAGE, and a
// lean says what is true 65 + 7 x READ percent of the time: 37 at -4, 93 at +4. No number reaches a screen (the book:
// "numbers it cannot see").
//
// THE SENSE, in the state a board gets: `lean` (that percent), `rain` (the outlook says rain within eight hours), `still`
// (a long, still night is likely), `way` (the side of where it has walked that it has walked least), `last` (when the
// last read was given, by any board). The board decides when a read comes; this decides what is there to read.
//
// READS -- "read <about> <based> [way]" from a watch -- kept (the store's `subtle.reads`, newest first, sixty) and judged
// here by what happens after:
//   near    a daemon heard close, on Bluetooth, within thirty minutes (a stranger's: heard before only on LoRa, far off)
//   rain    rain seen within ten hours
//   night   the next night told is VIVID
//   walk    within three hours a fix 300 m or more that way, on ground not walked before
// `based`: whether it was about something sensed or a read about nothing, worded the same -- kept, never shown. A read
// past its window that has not landed is closed. LEANS -- "lean <pays|not> <landed>" -- a CASINO pull, judged on the
// board at once (the reels' result is drawn as the lever is pulled). The log decides: the companion counts, never vouches.
// Every word DRAFT. No node: imports (it runs on the phone, hosting alone).
import type { Store } from "./store.js";
import type { Feelings } from "./feelings.js";
import { dreamsOf } from "./dreams.js";
import { fixesOf, type Fix } from "./where.js";
import { weatherPlace } from "./weather.js";
import { weatherNow } from "./context.js";

// ---- THE THREE: the game's table, as approved 2026-10-27 (engine include/daemons_three.h) -------------------------------
export const THREE = { max: 4, friend1: 50, friend3: 150, friend4: 220, madLine: 40,
                       calm3: 25, calm4: 60, calm1: -15, calm0: -50, feel2: 20, feel3: 45, feel4: 70,
                       leanRight: 65, leanStep: 7 };
export type Three = { closure: number; attunement: number; voltage: number };
const level = (n: number) => Math.max(0, Math.min(THREE.max, n));

export function threeOf(friendship: number, f: Pick<Feelings, "glad" | "mad" | "sad" | "calm">): Three {
  const T = THREE;
  let closure = friendship < T.friend1 ? 1 : friendship < T.friend3 ? 2 : friendship < T.friend4 ? 3 : 4;
  if (f.mad >= T.madLine) closure--;
  let attunement = 2;
  if (f.calm >= T.calm3) attunement++;
  if (f.calm >= T.calm4) attunement++;
  if (f.calm <= T.calm1) attunement--;
  if (f.calm <= T.calm0) attunement--;
  const peak = Math.max(f.glad, f.mad, f.sad, f.calm < 0 ? -f.calm : 0);
  const voltage = peak < T.feel2 ? 1 : peak < T.feel3 ? 2 : peak < T.feel4 ? 3 : 4;
  return { closure: level(closure), attunement: level(attunement), voltage: level(voltage) };
}
export const readOf = (t: Three) => t.attunement - t.voltage;
export const leanRight = (t: Three) => Math.max(0, Math.min(100, THREE.leanRight + THREE.leanStep * readOf(t)));

// ---- the sense (DRAFT) -------------------------------------------------------------------------------------------------------
export const SENSE = { rainChance: 50, rainHours: 8, outlookFresh: 2 * 3600000, wayDays: 30, wayFrom: 150 };
export const WINDOW = { near: 30 * 60000, rain: 10 * 3600000, night: 20 * 3600000, walk: 3 * 3600000 };
export const WALK = { far: 300, newGround: 150, startWithin: 20 * 60000 };
const KEEP = 60, KEEP_LEANS = 20, KEEP_SEEN = 120;

export type Sense = { lean: number; rain: 0 | 1; still: 0 | 1; way: string; last: number };

function json<T>(store: Store, key: string, none: T): T {
  try { return (JSON.parse(store.getSetting(key) ?? "null") as T) ?? none; } catch { return none; }
}

export function senseFor(store: Store, friendship: number, f: Feelings, now = new Date()): Sense {
  noteSky(store, now);
  const t = threeOf(friendship, f);
  const o = json<{ at: string; chance: number } | null>(store, "subtle.outlook", null);
  const rain = o && now.getTime() - Date.parse(o.at) < SENSE.outlookFresh && o.chance >= SENSE.rainChance ? 1 : 0;
  const nights = dreamsOf(store).filter((d) => now.getTime() - Date.parse(d.to) < 3 * 86400000);
  const still = (nights.length >= 2 && nights[0].quality === "vivid" && nights[1].quality === "vivid")
             || (t.attunement >= 3 && t.voltage <= 2) ? 1 : 0;
  const last = readsOf(store)[0];
  return { lean: leanRight(t), rain, still, way: wayOf(fixesOf(store), now), last: last ? Math.floor(Date.parse(last.at) / 1000) : 0 };
}

// ---- where it has walked ---------------------------------------------------------------------------------------------------
export const WAYS = ["north", "east", "south", "west"] as const;
const RAD = Math.PI / 180;
export function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const x = Math.sin((b.lat - a.lat) * RAD / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin((b.lon - a.lon) * RAD / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(x));
}
export function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD);
  const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
const quarter = (deg: number) => Math.floor(((deg + 45) % 360) / 90);   // 0 north, 1 east, 2 south, 3 west

// the side of where it has walked (the last thirty days, from the newest fix) that it has walked least; "" with no fix
export function wayOf(fixes: Fix[], now = new Date()): string {
  const recent = fixes.filter((f) => now.getTime() - Date.parse(f.at) < SENSE.wayDays * 86400000);
  if (!recent.length) return "";
  const here = recent[0], n = [0, 0, 0, 0];
  for (const f of recent.slice(1)) if (metres(here, f) >= SENSE.wayFrom) n[quarter(bearing(here, f))]++;
  let best = 0;
  for (let i = 1; i < 4; i++) if (n[i] < n[best]) best = i;
  return WAYS[best];
}

// ---- what is seen, kept to judge reads by --------------------------------------------------------------------------------
// rain seen (the weather now, while a city is set), at most once a quarter hour
export function noteSky(store: Store, now = new Date()) {
  const w = weatherNow(store, now);
  if (!w || (w.kind !== "rain" && w.kind !== "storm")) return;
  const seen = json<string[]>(store, "subtle.rain", []);
  if (seen[0] && now.getTime() - Date.parse(seen[0]) < 15 * 60000) return;
  store.setSetting("subtle.rain", JSON.stringify([now.toISOString(), ...seen].slice(0, KEEP_SEEN)));
}
// a stranger heard close, on Bluetooth (api.ts, /api/device/met) -- counted as a meeting or not
export function noteClose(store: Store, peer: string, now = new Date()) {
  const seen = json<{ at: string; peer: string }[]>(store, "subtle.close", []);
  store.setSetting("subtle.close", JSON.stringify([{ at: now.toISOString(), peer }, ...seen].slice(0, KEEP_SEEN)));
}

// ---- reads ------------------------------------------------------------------------------------------------------------------
export const ABOUTS = ["near", "rain", "night", "walk"] as const;
export type About = (typeof ABOUTS)[number];
export type Read = { id: number; at: string; about: About; based: boolean; way: string; device: string; landed: string | null; closed: boolean };
const LINES: Record<About, string> = { near: "someone close by.", rain: "rain, before long.", night: "a long, still night.", walk: "" };   // DRAFT
export const lineOf = (r: Pick<Read, "about" | "way">) => r.about === "walk" ? `something to the ${r.way}.` : LINES[r.about];   // DRAFT

export function readsOf(store: Store): Read[] { const l = json<Read[]>(store, "subtle.reads", []); return Array.isArray(l) ? l : []; }

export function checkRead(detail: string): Pick<Read, "about" | "based" | "way"> | string {
  const [about, based, way] = detail.split(" ");
  if (!(ABOUTS as readonly string[]).includes(about) || (based !== "0" && based !== "1")) return "a read is <near|rain|night|walk> <0|1> [way]";
  if (about === "walk" && !(WAYS as readonly string[]).includes(way)) return "a read on a walk names its way: north, east, south or west";
  return { about: about as About, based: based === "1", way: about === "walk" ? way : "" };
}
export function takeRead(store: Store, detail: string, device: string, now = new Date()): Read | string {
  const c = checkRead(detail);
  if (typeof c === "string") return c;
  const list = readsOf(store);
  const r: Read = { id: (list[0]?.id ?? 0) + 1, at: now.toISOString(), ...c, device, landed: null, closed: false };
  store.setSetting("subtle.reads", JSON.stringify([r, ...list].slice(0, KEEP)));
  return r;
}

// each open read judged by what has happened since: landed (when), closed (its window passed), or still open
export function judge(store: Store, r: Read, now = new Date()): { landed?: string; closed?: true } {
  const at = Date.parse(r.at), end = at + WINDOW[r.about], past = now.getTime() > end;
  const within = (t: string) => { const x = Date.parse(t); return x > at && x <= end; };
  if (r.about === "near") {
    const c = json<{ at: string }[]>(store, "subtle.close", []).filter((x) => within(x.at)).pop();
    return c ? { landed: c.at } : past ? { closed: true } : {};
  }
  if (r.about === "rain") {
    const seen = json<string[]>(store, "subtle.rain", []).filter(within).pop();
    return seen ? { landed: seen } : past ? { closed: true } : {};
  }
  if (r.about === "night") {
    const d = dreamsOf(store).filter((n) => Date.parse(n.from) >= at - 30 * 60000 && Date.parse(n.from) <= at + 3 * 3600000).pop();
    return d ? (d.quality === "vivid" ? { landed: d.to } : { closed: true }) : past ? { closed: true } : {};
  }
  const fixes = fixesOf(store, r.device);                     // walk: the newest first
  const before = fixes.filter((f) => Date.parse(f.at) <= at);
  const start = before.find((f) => at - Date.parse(f.at) <= WALK.startWithin)
             ?? fixes.filter((f) => Date.parse(f.at) > at && Date.parse(f.at) - at <= WALK.startWithin).pop();
  const way = WAYS.indexOf(r.way as (typeof WAYS)[number]);
  const hit = start && fixes.filter((f) => within(f.at)).reverse().find((f) =>
    metres(start, f) >= WALK.far && quarter(bearing(start, f)) === way && before.every((b) => metres(b, f) >= WALK.newGround));
  return hit ? { landed: hit.at } : past ? { closed: true } : {};
}
export function landReads(store: Store, now = new Date()): Read[] {
  const list = readsOf(store);
  let changed = false;
  for (const r of list) {
    if (r.landed || r.closed) continue;
    const j = judge(store, r, now);
    if (j.landed) { r.landed = j.landed; changed = true; } else if (j.closed) { r.closed = true; changed = true; }
  }
  if (changed) store.setSetting("subtle.reads", JSON.stringify(list));
  return list;
}

// ---- leans ------------------------------------------------------------------------------------------------------------------
export type Leans = { told: number; landed: number; recent: { at: string; claim: "pays" | "not"; landed: boolean }[] };
export function leansOf(store: Store): Leans { return { told: 0, landed: 0, recent: [], ...json<Partial<Leans>>(store, "subtle.leans", {}) }; }
export function takeLean(store: Store, detail: string, now = new Date()): Leans | string {
  const [said, landed] = detail.split(" ");
  if ((said !== "pays" && said !== "not") || (landed !== "0" && landed !== "1")) return "a lean is <pays|not> <0|1>";
  const claim: "pays" | "not" = said;
  const l = leansOf(store);
  const next: Leans = { told: l.told + 1, landed: l.landed + (landed === "1" ? 1 : 0),
                        recent: [{ at: now.toISOString(), claim, landed: landed === "1" }, ...l.recent].slice(0, KEEP_LEANS) };
  store.setSetting("subtle.leans", JSON.stringify(next));
  return next;
}

// ---- the log, for the app -----------------------------------------------------------------------------------------------
export const LEAN_LINES = { pays: "this one pays.", not: "not this one." };   // DRAFT
export function readsView(store: Store, now = new Date()) {
  const reads = landReads(store, now), leans = leansOf(store);
  return {
    reads: { given: reads.length, landed: reads.filter((r) => r.landed).length },
    leans: { told: leans.told, landed: leans.landed },
    recent: reads.slice(0, 10).map((r) => ({ at: r.at, about: r.about, line: lineOf(r), landed: r.landed, open: !r.landed && !r.closed })),
  };
}

// ---- the outlook: rain in the next hours, for the city set on the site ----------------------------------------------------
const FORECAST = "https://api.open-meteo.com/v1/forecast";
export async function refreshOutlook(store: Store, get: typeof fetch = fetch, now = new Date()): Promise<number | null> {
  const p = weatherPlace(store);
  if (!p) return null;
  const r = await get(`${FORECAST}?latitude=${p.latitude}&longitude=${p.longitude}&hourly=precipitation_probability&forecast_days=2`);
  const h = (await r.json() as { hourly?: { time?: string[]; precipitation_probability?: (number | null)[] } }).hourly;
  if (!h?.time || !h.precipitation_probability) return null;
  let chance = 0;
  h.time.forEach((t, i) => {                                   // GMT hours; only the next few
    const x = Date.parse(`${t}:00Z`) - now.getTime();
    const v = h.precipitation_probability![i];
    if (x > -3600000 && x <= SENSE.rainHours * 3600000 && typeof v === "number") chance = Math.max(chance, v);
  });
  store.setSetting("subtle.outlook", JSON.stringify({ at: now.toISOString(), chance }));
  noteSky(store, now);
  return chance;
}
// every half hour while a city is set (nothing is fetched without one)
export function outlookLoop(store: Store): () => void {
  const tick = () => { refreshOutlook(store).catch(() => {}); };
  tick();
  const t = setInterval(tick, 30 * 60000);
  (t as { unref?: () => void }).unref?.();                  // never what keeps the process running (a phone's timer has none)
  return () => clearInterval(t);
}
