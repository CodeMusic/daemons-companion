// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-328: THE ARENA -- where a battle is asked for, answered and fought, turn by turn (battle.ts fights it). One arena is
// kept in a store under a key: the household's on its own companion ("battles": its phone, site, watches and boards,
// each a SEAT by its device id), and the exchange's on the hub ("exchange.battles": players, each the seat
// "player:<id>", reached as trades are, tradelink.ts). The same rules in both:
//
// - A request is to one seat that is online; it waits a minute, then lapses. A seat is in one battle (or request) at a time.
// - Accepted, the battle starts from both cards at once. Each turn both sides choose; a side that has not chosen in
//   30 seconds (and a few for the last turn's lines to play) has its strongest routine chosen for it, and three turns
//   missed in a row is a forfeit (the user's pick, 2026-11-11). Leaving is a forfeit too.
// - Over, the winner is announced and the experience is the game's (battle.ts battleExp), given ONCE per side by whoever
//   holds that side's save (`award`), and written at its next SYNC as a step's is. Nobody's health is kept.
import type { Store } from "./store.js";
import { autoPick, battleExp, moveName, moveRow, resolve, say, start, TYPE_NAMES, type BattleState, type Card, type Choice } from "./battle.js";

export const ASK_MS = 60_000, TURN_MS = 30_000, READ_MS = 6_000, MISSES = 3, KEEP_MS = 15 * 60_000;
export type Phase = "asked" | "on" | "over" | "declined" | "lapsed" | "withdrawn";
export interface Corner { seat: string; label: string; card: Card | null }
export interface Fight { id: string; at: string; phase: Phase; from: Corner; to: Corner; battle: BattleState | null;
                         choices: [Choice | null, Choice | null]; deadline: string | null; missed: [number, number];
                         forfeit: 0 | 1 | null; exp: [number, number]; awarded: [boolean, boolean]; endedAt: string | null }
interface Arena { fights: Fight[]; next: number }

const load = (store: Store, key: string): Arena => {
  try { const a = JSON.parse(store.getSetting(key) ?? "null"); if (a?.fights) return a; } catch { /* a new arena */ }
  return { fights: [], next: 1 };
};
// every change is one read and one write of the whole arena, inside the store's transaction (as the exchange's)
function change<T>(store: Store, key: string, f: (a: Arena) => T): T {
  return store.together(() => { const a = load(store, key); const r = f(a); store.setSetting(key, JSON.stringify(a)); return r; });
}
const fail = (error: string) => ({ error });
export type Result<T> = T | { error: string };
export const failed = <T>(r: Result<T>): r is { error: string } => typeof r === "object" && r !== null && "error" in r;
const live = (f: Fight) => f.phase === "asked" || f.phase === "on";
const sideOf = (f: Fight, seat: string): 0 | 1 | null => (f.from.seat === seat ? 0 : f.to.seat === seat ? 1 : null);

// the clock: a request that lapsed, a turn that ran out (its missing choices made by the hub), the old ones let go
function tick(a: Arena, now: Date) {
  const t = now.getTime();
  for (const f of a.fights) {
    if (f.phase === "asked" && t - Date.parse(f.at) > ASK_MS) { f.phase = "lapsed"; f.endedAt = now.toISOString(); }
    while (f.phase === "on" && f.battle && f.deadline && t > Date.parse(f.deadline)) {
      for (const i of [0, 1] as const) {
        if (f.choices[i] === null) { f.choices[i] = autoPick(f.battle, i); f.missed[i]++; } else f.missed[i] = 0;
      }
      const out = ([0, 1] as const).find((i) => f.missed[i] >= MISSES);
      if (out !== undefined) { finish(f, (1 - out) as 0 | 1, out, now); break; }
      turn(f, new Date(Date.parse(f.deadline)));
    }
  }
  a.fights = a.fights.filter((f) => live(f) || t - Date.parse(f.endedAt ?? f.at) < KEEP_MS);
}
function turn(f: Fight, now: Date) {
  resolve(f.battle!, [f.choices[0]!, f.choices[1]!]);
  f.choices = [null, null];
  if (f.battle!.winner !== null || f.battle!.draw) finish(f, f.battle!.winner, null, now);
  else f.deadline = new Date(now.getTime() + TURN_MS + READ_MS).toISOString();
}
function finish(f: Fight, winner: 0 | 1 | null, forfeit: 0 | 1 | null, now: Date) {
  f.phase = "over"; f.deadline = null; f.endedAt = now.toISOString(); f.forfeit = forfeit;
  if (f.battle && winner !== null) { f.battle.winner = winner; f.exp = battleExp(f.battle); }
}

// ---- what a seat may do ----
export function request(store: Store, key: string, from: Corner, to: { seat: string; label: string }, now = new Date()): Result<Fight> {
  if (!from.card) return fail("choose a daemon to fight with");                         // DRAFT
  if (from.seat === to.seat) return fail("a device cannot battle itself");               // DRAFT
  return change(store, key, (a) => {
    tick(a, now);
    if (a.fights.some((f) => live(f) && (sideOf(f, from.seat) !== null))) return fail("already in a battle -- finish it first");   // DRAFT
    if (a.fights.some((f) => live(f) && (sideOf(f, to.seat) !== null))) return fail(`${to.label} is in a battle already`);         // DRAFT
    const f: Fight = { id: `b${a.next++}`, at: now.toISOString(), phase: "asked", from, to: { ...to, card: null }, battle: null,
                       choices: [null, null], deadline: null, missed: [0, 0], forfeit: null, exp: [0, 0], awarded: [false, false], endedAt: null };
    a.fights.push(f);
    return f;
  });
}
export function answer(store: Store, key: string, id: string, seat: string, yes: boolean, card: Card | null, label?: string, now = new Date(), seed?: number): Result<Fight> {
  return change(store, key, (a) => {
    tick(a, now);
    const f = a.fights.find((x) => x.id === id);
    if (!f || f.phase !== "asked") return fail("that request is no longer open");       // DRAFT
    if (f.from.seat === seat && !yes) { f.phase = "withdrawn"; f.endedAt = now.toISOString(); return f; }
    if (f.to.seat !== seat) return fail("that request is not to this device");          // DRAFT
    if (!yes) { f.phase = "declined"; f.endedAt = now.toISOString(); return f; }
    if (!card) return fail("choose a daemon to fight with");                             // DRAFT
    if (card.personality === f.from.card?.personality) return fail("that daemon is the one asking -- choose another");   // DRAFT
    f.to = { seat, label: label ?? f.to.label, card };
    f.phase = "on";
    f.battle = start(f.from.card!, card, seed ?? Math.floor(Math.random() * 0xffffffff));
    f.deadline = new Date(now.getTime() + TURN_MS + READ_MS).toISOString();
    return f;
  });
}
export function choose(store: Store, key: string, id: string, seat: string, slot: unknown, now = new Date()): Result<Fight> {
  return change(store, key, (a) => {
    tick(a, now);
    const f = a.fights.find((x) => x.id === id), i = f ? sideOf(f, seat) : null;
    if (!f || f.phase !== "on" || i === null) return fail("that battle is over");          // DRAFT
    const fighter = f.battle!.sides[i], n = Number(slot);
    const anyLeft = fighter.pp.some((p, k) => p > 0 && fighter.card.moves[k]?.id);
    const pick = !anyLeft ? -1 : Number.isInteger(n) && n >= 0 && n < fighter.card.moves.length && fighter.pp[n] > 0 ? n : null;
    if (pick === null) return fail("that routine has no MP left");                      // DRAFT
    f.choices[i] = pick; f.missed[i] = 0;
    if (f.choices[0] !== null && f.choices[1] !== null) turn(f, now);
    return f;
  });
}
export function leave(store: Store, key: string, id: string, seat: string, now = new Date()): Result<Fight> {
  return change(store, key, (a) => {
    tick(a, now);
    const f = a.fights.find((x) => x.id === id), i = f ? sideOf(f, seat) : null;
    if (!f || i === null) return fail("not found");
    if (f.phase === "asked") { f.phase = i === 0 ? "withdrawn" : "declined"; f.endedAt = now.toISOString(); }
    else if (f.phase === "on") finish(f, (1 - i) as 0 | 1, i, now);
    return f;
  });
}
// the experience this side is owed, once: 0 when it was given already (the caller writes it into the store's log)
export function award(store: Store, key: string, id: string, side: 0 | 1): number {
  return change(store, key, (a) => {
    const f = a.fights.find((x) => x.id === id);
    if (!f || f.phase !== "over" || f.awarded[side]) return 0;
    f.awarded[side] = true;
    return f.exp[side];
  });
}
export function fights(store: Store, key: string, now = new Date()): Fight[] {
  return change(store, key, (a) => { tick(a, now); return a.fights; });
}
export const fightsOf = (all: Fight[], seat: string) => all.filter((f) => sideOf(f, seat) !== null);

// ---- what a seat is shown: both daemons as the screen draws them, its own routines, the lines so far ----
export function view(f: Fight, seat: string, now = new Date()) {
  const me = sideOf(f, seat), b = f.battle;
  const corner = (c: Corner, i: 0 | 1) => {
    const fi = b?.sides[i], card = fi?.card ?? c.card;
    return { label: c.label, seat: c.seat,
             daemon: card ? { nickname: card.nickname, name: card.name, species: card.species, level: card.level, art: card.art ?? null,
                              types: card.types.map((t) => TYPE_NAMES[t]), hp: fi?.hp ?? card.stats.maxHP, maxHP: card.stats.maxHP,
                              status: fi?.status ?? "none",
                              moves: i === me ? card.moves.map((m, k) => {
                                const r = moveRow(m.id);
                                return { slot: k, id: m.id, name: moveName(m.id), type: r ? TYPE_NAMES[r.type] : null, power: r?.power ?? 0,
                                         pp: fi?.pp[k] ?? m.pp, maxPP: m.pp };
                              }) : undefined } : null };
  };
  const winner = b?.winner ?? null, labels = [f.from.label, f.to.label];
  return {
    id: f.id, phase: f.phase, at: f.at, me, turn: b?.turn ?? 0,
    sides: [corner(f.from, 0), corner(f.to, 1)],
    chosen: [f.choices[0] !== null, f.choices[1] !== null],
    deadline: f.deadline, secondsLeft: f.deadline ? Math.max(0, Math.round((Date.parse(f.deadline) - now.getTime()) / 1000)) : null,
    log: (b?.log ?? []).map((lines) => lines.filter((l) => l.text || l.sound).map((l) => ({ text: l.text, side: l.side ?? null, hp: l.hp ?? null, sound: l.sound ?? null }))),
    winner, draw: !!b?.draw, forfeit: f.forfeit, exp: f.exp,
    // the game's own line for the end: "<winner> outscored <loser>!" (src/battle_message.c, a link battle's)
    result: f.phase === "over" && winner !== null
      ? say("PlayerDefeatedLinkTrainer", { foe: labels[1 - winner] }).replace(/^Player/, labels[winner]) : null,
    asking: f.phase === "asked" ? say("LinkTrainerWantsToBattle", { foe: f.from.label }) : null,
  };
}
