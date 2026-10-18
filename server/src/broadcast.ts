// C-134: BROADCASTS -- a word, or a thing a daemon does (an act: a wave, a bow, a tune), sent to every daemon at
// once, and their answers. A broadcast travels every way it can: over LoRa (far, with no network), over Bluetooth (to
// devices nearby), and through this hub (every linked device, wherever it is). It is shown ONCE however many ways it
// arrives: its id is the sender's tag and its own number (FROM + ID, as LoRa's frames carry them, docs/LORA.md), and
// every device and this hub drop an id already seen -- the hub adds the new way to `via` instead.
//
// Every daemon that receives an act answers it, once, with the act's reply (acts.json); a reply is never answered, and
// a word is never answered (it is read). Nothing here may import Node: it runs on the phone too (app/local.ts).
import actsJson from "../data/acts.json" with { type: "json" };
import speciesJson from "../data/species.json" with { type: "json" };
import type { Store } from "./store.js";

export type Act = { code: string; label: string; seen: string; reply: string };
export const ACTS: Act[] = (actsJson as { acts: Act[] }).acts;
const SPECIES = speciesJson as unknown as Record<string, { name: string }>;

export type Via = "lora" | "ble" | "net";
export type Cast = {
  id: string;            // FROM (8 hex) + ID (4 hex)
  from: string;          // the sender's tag (8 hex): a board's hourly tag, or this hub's for the app, site and Tab5
  name: string;          // the sending daemon's name, as its sender gave it
  species: number;
  kind: "say" | "act" | "reply";
  text?: string;         // a word (say), at most 80 printable letters
  act?: string;          // an act's code (act, reply)
  replyTo?: string;      // a reply: the id it answers
  at: string;            // when this hub first had it (ISO)
  via: Via[];            // every way it has arrived
  device?: string;       // which of our devices sent it or first heard it
  mine: boolean;         // sent by one of our own daemons -- from the app, the site, the Tab5 or one of our boards
};

const KEY = "casts", KEEP = 60, TEXT_MAX = 80;
const HEX8 = /^[0-9a-f]{8}$/, ID = /^[0-9a-f]{12}$/;

function load(store: Store): Cast[] {
  try { return JSON.parse(store.getSetting(KEY) ?? "[]") as Cast[]; } catch { return []; }
}
function keep(store: Store, casts: Cast[]) { store.setSetting(KEY, JSON.stringify(casts.slice(-KEEP))); }

const clean = (t: unknown) => typeof t === "string" ? t.replace(/[^\x20-\x7e]/g, "").slice(0, TEXT_MAX) : "";
// C-151: the CASINO's two (a big win at the reels) are read in words too, but never offered to choose
const CASINO_ACTS: Act[] = ((actsJson as { casino?: Omit<Act, "label">[] }).casino ?? []).map((a) => ({ ...a, label: a.code }));
export const actFor = (code: string | undefined) => ACTS.find((a) => a.code === code) ?? CASINO_ACTS.find((a) => a.code === code);

// The words a person reads: "STARR bows", "ARCHIVER bows in return", "STARR: hello there".
export function castLine(c: Cast): string {
  const a = actFor(c.act);
  if (c.kind === "say") return `${c.name}: ${c.text ?? ""}`;
  if (c.kind === "reply") return `${c.name} ${a?.reply ?? (c.act ?? "").toLowerCase()}`;
  return `${c.name} ${a?.seen ?? (c.act ?? "").toLowerCase()}`;
}

// This hub's own tag, for broadcasts sent from the app, the site and the Tab5 -- random, new every hour, as a board's is.
export function hubTag(store: Store, now = new Date()): string {
  const hour = Math.floor(now.getTime() / 3600000);
  const kept = (store.getSetting("castTag") ?? "").split(" ");
  if (kept.length === 2 && Number(kept[1]) === hour && HEX8.test(kept[0])) return kept[0];
  let t = "";
  while (!HEX8.test(t) || t === "00000000") t = Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0");
  store.setSetting("castTag", `${t} ${hour}`);
  return t;
}

// A broadcast arriving -- from a device (sent by it, or heard by it over LoRa or Bluetooth), or made here. A new id is
// kept; one already kept gains the new way it came. `fresh` says which.
export function takeCast(store: Store, c: Partial<Cast> & { id: string }, via: Via, mine = false, device = "",
                         now = new Date()): { cast: Cast; fresh: boolean } | { error: string } {
  const id = String(c.id).toLowerCase();
  if (!ID.test(id)) return { error: "id: 12 hex digits, the sender's tag and its number" };
  const kind = c.kind === "say" || c.kind === "act" || c.kind === "reply" ? c.kind : null;
  if (!kind) return { error: "kind: say | act | reply" };
  const casts = load(store);
  const had = casts.find((k) => k.id === id);
  if (had) {
    // a board's own broadcast may reach here first as another board's "heard"; when its sender reports it, it is ours
    const more = !had.via.includes(via), ours = mine && !had.mine;
    if (more) had.via.push(via);
    if (ours) had.mine = true;
    if (more || ours) keep(store, casts);
    return { cast: had, fresh: false };
  }
  const species = Number(c.species) || 0;
  const cast: Cast = { id, from: id.slice(0, 8), name: clean(c.name).slice(0, 10).trim() || SPECIES[String(species)]?.name || "A DAEMON",
                       species, kind, at: now.toISOString(), via: [via], mine, ...(device ? { device } : {}) };
  if (kind === "say") cast.text = clean(c.text);
  else {
    cast.act = clean(c.act).toUpperCase().slice(0, 8);
    if (kind === "reply" && c.replyTo && ID.test(String(c.replyTo).toLowerCase())) cast.replyTo = String(c.replyTo).toLowerCase();
  }
  if (kind === "say" && !cast.text) return { error: "a word to say" };
  if (kind !== "say" && !cast.act) return { error: "an act's code" };
  casts.push(cast);
  keep(store, casts);
  store.logInteraction("cast", `${mine ? "out" : "in"} ${kind} ${species} ${id} ${via} ${kind === "say" ? cast.text : cast.act}`);
  return { cast, fresh: true };
}

// Made here: from the app, the site or the Tab5, as one of our daemons (`as`, a personality; else the first away).
export function sendCast(store: Store, away: { personality: number; species: number; name: string; nickname?: string }[],
                         b: { kind?: string; text?: string; act?: string; as?: number; replyTo?: string }, now = new Date()) {
  const d = away.find((a) => a.personality === Number(b.as)) ?? away[0];
  if (!d) return { error: "no daemon is away to speak for: SEND one in the game and SYNC" };
  const n = Number(store.getSetting("castN") ?? "0") + 1;
  store.setSetting("castN", String(n));
  const id = hubTag(store, now) + (n & 0xffff).toString(16).padStart(4, "0");
  return takeCast(store, { id, kind: b.kind as Cast["kind"], text: b.text, act: b.act, replyTo: b.replyTo, species: d.species,
                           name: (d.nickname || d.name).toUpperCase() }, "net", true, "", now);
}

// The broadcasts since a moment (ms since 1970), oldest first; the last 50.
export function castsSince(store: Store, since = 0): Cast[] {
  return load(store).filter((c) => Date.parse(c.at) > since).slice(-50);
}

// For a device's state: the last few minutes', short, for the board to show and drop by id what it already had.
export function castsForDevice(store: Store, now = new Date()) {
  return load(store).filter((c) => now.getTime() - Date.parse(c.at) < 10 * 60000).slice(-8)
    .map((c) => ({ id: c.id, k: c.kind, n: c.name, s: c.species, ...(c.text ? { t: c.text } : {}), ...(c.act ? { a: c.act } : {}),
                   ...(c.replyTo ? { r: c.replyTo } : {}) }));
}
