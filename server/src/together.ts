// C-220 (the user, 2026-10-28: "if I send mine and so does another user, in the app (or device) we see both of them on
// screen and they interact -- they even chat with each other via the LLM modules"): OUT TOGETHER, beside THE EXCHANGE.
// A player sends one of their AWAY daemons OUT (one at a time, for twelve hours, or until called back); another player
// with one out may MEET it, and the two talk -- four short lines, taking turns. Nothing leaves either game: a meeting is
// a visit, not a trade. Both players see the meeting afterwards (the last thirty kept).
//
// The lines: on the hub, its module says each turn in the speaker's own voice (a talker the hub hands in, setMeetTalker),
// through one fixed setup so meetings share a single thinker; a turn the module cannot say in time (a setup under way,
// a busy module, none at all -- a phone hosting alone) is written instead, from the lines below. All DRAFT.
// Home only for now: THE COMMONS (friends' homes) does not carry meetings yet. No node: imports.
import type { Store } from "./store.js";
import { safeLine } from "./meetsafe.js";   // C-220: what one daemon says to another player's, checked (kids play)
import speciesJson from "../data/species.json" with { type: "json" };

const SPECIES = speciesJson as unknown as Record<string, { name: string; types?: string[]; category?: string }>;
export interface Out { player: string; personality: number; species: number; nickname: string; level: number; edition: string; at: string; until: string }
export type Line = { who: "a" | "b"; said: string; by: "module" | "written" };
export interface Met { id: string; at: string; a: Out & { name: string }; b: Out & { name: string }; lines: Line[]; own?: boolean;   // own: they met on their own
                      trade?: "full" | "loan" }   // C-220: they met as a trade or a loan was agreed
// C-223 (the user, 2026-10-28, by multiple choice): a dream shared -- one of a daemon's nights (dreams.ts), told to the
// other players at home; the last forty kept, three a player at most
export interface Shared { id: string; at: string; player: string; species: number; nickname: string; quality: string; text: string; woke: string }
interface State { out: Out[]; met: Met[]; next: number; shared?: Shared[] }

const KEY = "meet", OUT_MS = 12 * 60 * 60 * 1000, KEPT = 30, TURNS = 4, AGAIN_MS = 6 * 60 * 60 * 1000;
const load = (store: Store): State => {
  try { const s = JSON.parse(store.getSetting(KEY) ?? "null"); if (s?.out) return s; } catch { /* none yet */ }
  return { out: [], met: [], next: 1 };
};
function change<T>(store: Store, f: (s: State) => T): T {
  return store.together(() => { const s = load(store); const r = f(s); store.setSetting(KEY, JSON.stringify(s)); return r; });
}
const live = (s: State, now: Date) => s.out.filter((o) => new Date(o.until) > now);
const fail = (error: string) => ({ error });
export type Named = (player: string) => string;
export type Reach = (a: string, b: string) => boolean;

// one of this player's AWAY daemons out, in place of any before it
export function sendOut(store: Store, player: string, d: { personality?: unknown; species?: unknown; nickname?: unknown; level?: unknown; edition?: unknown },
                        now = new Date()): Out | { error: string } {
  const species = Number(d.species), level = Number(d.level);
  if (!SPECIES[String(species)] || typeof d.nickname !== "string" || !d.nickname.trim()) return fail("which daemon?");   // DRAFT
  const o: Out = { player, personality: Number(d.personality) >>> 0, species, nickname: d.nickname.trim().slice(0, 12).toUpperCase(),
                   level: Number.isFinite(level) ? Math.max(1, Math.min(100, Math.round(level))) : 1,
                   edition: d.edition === "CONTEXT" ? "CONTEXT" : "CONTENT", at: now.toISOString(), until: new Date(now.getTime() + OUT_MS).toISOString() };
  return change(store, (s) => { s.out = live(s, now).filter((x) => x.player !== player); s.out.push(o); return o; });
}
export function callBack(store: Store, player: string, now = new Date()) {
  return change(store, (s) => { s.out = live(s, now).filter((x) => x.player !== player); return { ok: true }; });
}

const brief = (o: Out, name: Named) => ({ player: name(o.player), species: o.species, nickname: o.nickname, level: o.level, edition: o.edition,
                                          name: SPECIES[String(o.species)]?.name ?? "", until: o.until });
// who is out now that this player may meet, their own first; and the meetings this player's daemons were in
export function outView(store: Store, player: string, name: Named, reach: Reach = () => true, now = new Date()) {
  const s = load(store), here = live(s, now);
  const mine = here.find((o) => o.player === player) ?? null;
  return {
    mine: mine && brief(mine, name),
    others: here.filter((o) => o.player !== player && reach(player, o.player)).map((o) => ({ id: o.player, ...brief(o, name) })),
    met: s.met.filter((m) => m.a.player === player || m.b.player === player).slice(-10).reverse()
      .map((m) => ({ id: m.id, at: m.at, a: brief(m.a, name), b: brief(m.b, name), lines: m.lines, own: !!m.own, ...(m.trade ? { trade: m.trade } : {}) })),
  };
}

// ---- the talk ----
export type Speaker = { nickname: string; name: string; types: string; category: string; level: number };
// asks the hub's module for one turn: the speaker, who they are meeting, what was just said (null: they speak first).
// null back, or a throw, and that turn is written instead.
export type Talker = (me: Speaker, other: Speaker, heard: string | null) => Promise<string | null>;
let talker: Talker | null = null;
export const setMeetTalker = (t: Talker | null) => { talker = t; };

export const speakerOf = (o: Out): Speaker => {
  const row = SPECIES[String(o.species)];
  return { nickname: o.nickname, name: row?.name ?? "", types: (row?.types ?? []).join("/"), category: row?.category ?? "", level: o.level };
};
// the setup and the question the module is sent, short for the 0.5B's small window (DRAFT: words to the model, never shown)
export const MEET_SETUP = "You are a small creature from the game DAEMONS, meeting another. Say one short friendly sentence.";
export const meetQuestion = (me: Speaker, other: Speaker, heard: string | null) =>
  `You are ${me.nickname}, a ${me.types || "small"} daemon${me.category ? ` (the ${me.category} daemon)` : ""}. You meet ${other.nickname}, a ${other.types || "small"} daemon. ` +
  (heard ? `${other.nickname} says: ${heard.replace(/\s+/g, " ").slice(0, 160)} Answer ${other.nickname} as ${me.nickname}, about food, sleep, dreams or the weather.`
         : `Say hello to ${other.nickname} as ${me.nickname}.`);

// written turns, chosen by the minute and the two names
const WRITTEN: string[][] = [
  ["Oh! Hello, {O}.", "{O}! Over here!", "Hi. I'm {M}. Who are you?", "Hello! Nice day to be out."],
  ["Hi, {O}! Have you eaten?", "Hello. Do you come here often?", "Oh, hello! I'm {M}.", "Hi! I like your colours."],
  ["I napped in the sun today.", "I dreamt of rain last night.", "Someone fed me berries!", "Is it always this windy?"],
  ["Let's meet again, {O}.", "Same time tomorrow?", "See you around, {O}.", "I'll tell mine about you."],
];
function writtenTurn(turn: number, me: Speaker, other: Speaker, day: string): string {
  const list = WRITTEN[Math.min(turn, WRITTEN.length - 1)];
  let h = 0;
  for (const c of `${day}/${me.nickname}/${other.nickname}/${turn}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length].replace(/\{O\}/g, other.nickname).replace(/\{M\}/g, me.nickname);
}
// the module's line, kept to one sentence and the board's width (a 0.5B runs on, and sometimes names itself first)
export function trimLine(t: string, me: string): string {
  let s = t.replace(/\s+/g, " ").replace(new RegExp(`^${me.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i"), "").replace(/^["“]|["”]$/g, "").trim();
  const end = s.search(/[.!?](\s|$)/);
  if (end >= 0) s = s.slice(0, end + 1);
  return s.length > 90 ? `${s.slice(0, 87).replace(/\s+\S*$/, "")}...` : s;
}

export async function meetLines(a: Speaker, b: Speaker, day: string, say: Talker | null = talker): Promise<Line[]> {
  const lines: Line[] = [];
  for (let t = 0; t < TURNS; t++) {
    const me = t % 2 ? b : a, other = t % 2 ? a : b, heard = lines.length ? lines[lines.length - 1].said : null;
    let said: string | null = null;
    // the last turn is a goodbye, always written: the model would only carry on
    if (say && t < TURNS - 1) { try { const r = await say(me, other, heard); said = r ? trimLine(r, me.nickname) : null; } catch { said = null; } }
    // the module's line only if it passes (meetsafe.ts): no way out of the game, nothing about a person, nothing rude, no
    // made-up name -- else the written line, which is ours and needs no check
    if (said) said = safeLine(said, [me.nickname, other.nickname, me.name, other.name, me.types, other.types]);
    lines.push(said ? { who: t % 2 ? "b" : "a", said, by: "module" } : { who: t % 2 ? "b" : "a", said: writtenTurn(t, me, other, day), by: "written" });
  }
  return lines;
}

// this player's daemon out meets that player's; both must be out now. The lines are made outside the store's
// transaction (they may wait on the module), then kept.
export async function meet(store: Store, player: string, withPlayer: unknown, reach: Reach = () => true, now = new Date(),
                           say: Talker | null = talker, own = false): Promise<Met | { error: string }> {
  const s = load(store), here = live(s, now);
  const a = here.find((o) => o.player === player);
  if (!a) return fail("send one of yours out first");                                          // DRAFT
  const b = here.find((o) => o.player === withPlayer && o.player !== player);
  if (!b || !reach(player, b.player)) return fail("they are not out now");                     // DRAFT
  const day = now.toISOString().slice(0, 16);   // the minute: a second meeting the same day reads differently
  const lines = await meetLines(speakerOf(a), speakerOf(b), day, say);
  return change(store, (st) => {
    const m: Met = { id: `m${st.next++}`, at: now.toISOString(), a: { ...a, name: speakerOf(a).name }, b: { ...b, name: speakerOf(b).name }, lines, ...(own ? { own } : {}) };
    st.met = [...st.met, m].slice(-KEPT);
    return m;
  });
}

// Two daemons out at the same time meet on their own (the hub, every quarter hour): one pair a turn -- the two out
// together that have not met in six hours, the longest out first -- so the module is asked for one meeting at a time.
export async function meetOnTheirOwn(store: Store, reach: Reach = () => true, now = new Date(), say: Talker | null = talker): Promise<Met | null> {
  const s = load(store), here = live(s, now).sort((x, y) => x.at.localeCompare(y.at));
  const lately = (x: Out, y: Out) => s.met.some((m) => now.getTime() - new Date(m.at).getTime() < AGAIN_MS &&
    ((m.a.player === x.player && m.a.personality === x.personality && m.b.player === y.player && m.b.personality === y.personality) ||
     (m.a.player === y.player && m.a.personality === y.personality && m.b.player === x.player && m.b.personality === x.personality)));
  for (let i = 0; i < here.length; i++)
    for (let j = i + 1; j < here.length; j++)
      if (reach(here[i].player, here[j].player) && !lately(here[i], here[j])) {
        const r = await meet(store, here[i].player, here[j].player, reach, now, say, true);
        return "error" in r ? null : r;
      }
  return null;
}

// C-220 (the user, 2026-10-29: "during a trade"): the two daemons in a trade or a loan just agreed meet once, to say
// hello -- neither need be out. Kept with the other meetings, so both players see it.
export async function hello(store: Store, x: Omit<Out, "at" | "until">, y: Omit<Out, "at" | "until">, kind: "full" | "loan",
                            now = new Date(), say: Talker | null = talker): Promise<Met> {
  const a: Out = { ...x, at: now.toISOString(), until: now.toISOString() }, b: Out = { ...y, at: now.toISOString(), until: now.toISOString() };
  const lines = await meetLines(speakerOf(a), speakerOf(b), now.toISOString().slice(0, 16), say);
  return change(store, (st) => {
    const m: Met = { id: `m${st.next++}`, at: now.toISOString(), a: { ...a, name: speakerOf(a).name }, b: { ...b, name: speakerOf(b).name }, lines, trade: kind };
    st.met = [...st.met, m].slice(-KEPT);
    return m;
  });
}

// ---- C-223: dreams shared ----
const SHARED_KEPT = 40, SHARED_EACH = 3;
export function shareDream(store: Store, player: string, d: { species?: unknown; nickname?: unknown; quality?: unknown; text?: unknown; woke?: unknown },
                           now = new Date()): Shared | { error: string } {
  const text = typeof d.text === "string" ? d.text.replace(/\s+/g, " ").trim().slice(0, 400) : "";
  if (!text) return fail("which dream?");                                                       // DRAFT
  // C-220's filter on a dream other players will read: a dream is the companion's own writing, but a module wrote it
  if (!safeLine(text, [typeof d.nickname === "string" ? d.nickname : ""], 400)) return fail("that dream cannot be shared");   // DRAFT
  const woke = new Date(String(d.woke ?? ""));
  return change(store, (s) => {
    const all = s.shared ?? [];
    if (all.some((x) => x.player === player && x.text === text)) return fail("that dream is shared already");   // DRAFT
    const x: Shared = { id: `d${s.next++}`, at: now.toISOString(), player, species: Number(d.species) || 0,
                        nickname: typeof d.nickname === "string" ? d.nickname.slice(0, 12).toUpperCase() : "",
                        quality: d.quality === "vivid" || d.quality === "broken" ? d.quality : "quiet", text,
                        woke: isNaN(woke.getTime()) ? now.toISOString() : woke.toISOString() };
    const mine = all.filter((y) => y.player === player);
    const drop = new Set(mine.slice(0, Math.max(0, mine.length - SHARED_EACH + 1)).map((y) => y.id));   // a player's oldest go first
    s.shared = [...all.filter((y) => !drop.has(y.id)), x].slice(-SHARED_KEPT);
    return x;
  });
}
export function unshareDream(store: Store, player: string, id: unknown) {
  return change(store, (s) => { s.shared = (s.shared ?? []).filter((x) => !(x.id === id && x.player === player)); return { ok: true }; });
}
// the dreams this player may see, the newest first: their own and those of players in reach
export function sharedDreams(store: Store, player: string, name: Named, reach: Reach = () => true) {
  return (load(store).shared ?? []).filter((x) => x.player === player || reach(player, x.player)).reverse()
    .map((x) => ({ id: x.id, at: x.at, player: name(x.player), mine: x.player === player, species: x.species, nickname: x.nickname,
                   quality: x.quality, text: x.text, woke: x.woke }));
}
