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
//
// C-421 (the user, 2026-11-18, by multiple choice: "live, or a challenge"): when the other is not online, a CHALLENGE is
// left instead, as a trade offer is -- to one seat, or open to anyone in the arena -- and waits a day. Whoever takes it
// fights live; the daemon that left it fights by itself (`auto`: the hub picks its routine each turn, as it does for a
// missed turn, so the battle goes at the taker's pace), and its player watches the replay at their next look (`watched`).
// A waiting challenge, or a battle one's daemon is fighting by itself, keeps no seat from battling live meanwhile.
import type { Store } from "../store.js";
import { expFor } from "./save/growth.js";
import speciesJson from "../../data/species.json" with { type: "json" };
import { autoPick, battleExp, moveName, moveRow, resolve, say, start, TYPE_NAMES, type BattleState, type Card, type Choice } from "./battle.js";

export const ASK_MS = 60_000, TURN_MS = 30_000, READ_MS = 6_000, MISSES = 3, KEEP_MS = 15 * 60_000;
export const CHALLENGE_MS = 24 * 3600_000, CHALLENGE_KEEP_MS = 3 * 86400_000, OPEN = "*";   // C-421
export type Phase = "asked" | "on" | "over" | "declined" | "lapsed" | "withdrawn";
export interface Corner { seat: string; label: string; card: Card | null }
export interface Fight { id: string; at: string; phase: Phase; from: Corner; to: Corner; battle: BattleState | null;
                         choices: [Choice | null, Choice | null]; deadline: string | null; missed: [number, number];
                         forfeit: 0 | 1 | null; exp: [number, number]; awarded: [boolean, boolean]; endedAt: string | null;
                         challenge?: boolean; auto?: [boolean, boolean]; watched?: [boolean, boolean] }   // C-421
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
// C-421: a seat is kept from another battle only by a live request or a battle it is choosing in
const busy = (f: Fight, seat: string) => {
  const i = sideOf(f, seat);
  return i !== null && ((f.phase === "asked" && !f.challenge) || (f.phase === "on" && !f.auto?.[i]));
};
export const isOpen = (f: Fight) => f.to.seat === OPEN;
// a side that fights by itself has its routine chosen as each turn begins, so the other side's choice ends the turn
function fillAuto(f: Fight) {
  if (f.phase !== "on" || !f.battle) return;
  for (const i of [0, 1] as const) if (f.auto?.[i] && f.choices[i] === null) f.choices[i] = autoPick(f.battle, i);
}
// a finished challenge is kept until the one who left it has watched it (or three days); everything else, a quarter hour
const keepFor = (f: Fight) => (f.challenge && !f.watched?.[0] ? CHALLENGE_KEEP_MS : KEEP_MS);

// the clock: a request that lapsed, a turn that ran out (its missing choices made by the hub), the old ones let go
function tick(a: Arena, now: Date) {
  const t = now.getTime();
  for (const f of a.fights) {
    if (f.phase === "asked" && t - Date.parse(f.at) > (f.challenge ? CHALLENGE_MS : ASK_MS)) { f.phase = "lapsed"; f.endedAt = now.toISOString(); }
    while (f.phase === "on" && f.battle && f.deadline && t > Date.parse(f.deadline)) {
      for (const i of [0, 1] as const) {
        if (f.auto?.[i]) { if (f.choices[i] === null) f.choices[i] = autoPick(f.battle, i); continue; }   // C-421: never a miss
        if (f.choices[i] === null) { f.choices[i] = autoPick(f.battle, i); f.missed[i]++; } else f.missed[i] = 0;
      }
      const out = ([0, 1] as const).find((i) => f.missed[i] >= MISSES);
      if (out !== undefined) { finish(f, (1 - out) as 0 | 1, out, now); break; }
      turn(f, new Date(Date.parse(f.deadline)));
    }
  }
  a.fights = a.fights.filter((f) => live(f) || t - Date.parse(f.endedAt ?? f.at) < keepFor(f));
}
function turn(f: Fight, now: Date) {
  resolve(f.battle!, [f.choices[0]!, f.choices[1]!]);
  f.choices = [null, null];
  if (f.battle!.winner !== null || f.battle!.draw) finish(f, f.battle!.winner, null, now);
  else { f.deadline = new Date(now.getTime() + TURN_MS + READ_MS).toISOString(); fillAuto(f); }
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
    if (a.fights.some((f) => busy(f, from.seat))) return fail("already in a battle -- finish it first");   // DRAFT
    if (a.fights.some((f) => busy(f, to.seat))) return fail(`${to.label} is in a battle already`);         // DRAFT
    const f: Fight = { id: `b${a.next++}`, at: now.toISOString(), phase: "asked", from, to: { ...to, card: null }, battle: null,
                       choices: [null, null], deadline: null, missed: [0, 0], forfeit: null, exp: [0, 0], awarded: [false, false], endedAt: null };
    a.fights.push(f);
    return f;
  });
}
// C-421: a CHALLENGE, left for one seat (online or not) or for anyone in the arena (`to` null), waiting a day
export function challenge(store: Store, key: string, from: Corner, to: { seat: string; label: string } | null, now = new Date()): Result<Fight> {
  if (!from.card) return fail("choose a daemon to fight with");                         // DRAFT
  if (to && from.seat === to.seat) return fail("a device cannot battle itself");          // DRAFT
  return change(store, key, (a) => {
    tick(a, now);
    if (a.fights.some((f) => f.challenge && f.phase === "asked" && f.from.seat === from.seat)) return fail("a challenge of yours is waiting already -- withdraw it first");   // DRAFT
    const f: Fight = { id: `b${a.next++}`, at: now.toISOString(), phase: "asked", from, to: { ...(to ?? { seat: OPEN, label: "ANYONE" }), card: null },   // DRAFT
                       battle: null, choices: [null, null], deadline: null, missed: [0, 0], forfeit: null, exp: [0, 0], awarded: [false, false],
                       endedAt: null, challenge: true, auto: [true, false], watched: [false, true] };
    a.fights.push(f);
    return f;
  });
}
// `mayTake`: who may take an open challenge besides its own seat (the exchange: a player who can reach the one who left it)
export function answer(store: Store, key: string, id: string, seat: string, yes: boolean, card: Card | null, label?: string, now = new Date(), seed?: number,
                       mayTake: (f: Fight) => boolean = () => true): Result<Fight> {
  return change(store, key, (a) => {
    tick(a, now);
    const f = a.fights.find((x) => x.id === id);
    if (!f || f.phase !== "asked") return fail("that request is no longer open");       // DRAFT
    if (f.from.seat === seat && !yes) { f.phase = "withdrawn"; f.endedAt = now.toISOString(); return f; }
    if (isOpen(f) ? f.from.seat === seat || !mayTake(f) : f.to.seat !== seat) return fail("that request is not to this device");   // DRAFT
    if (!yes && isOpen(f)) return fail("an open challenge waits for whoever takes it");  // DRAFT
    if (!yes) { f.phase = "declined"; f.endedAt = now.toISOString(); return f; }
    if (!card) return fail("choose a daemon to fight with");                             // DRAFT
    if (card.personality === f.from.card?.personality) return fail("that daemon is the one asking -- choose another");   // DRAFT
    if (f.challenge && a.fights.some((x) => x !== f && busy(x, seat))) return fail("already in a battle -- finish it first");   // DRAFT
    f.to = { seat, label: label ?? f.to.label, card };
    f.phase = "on";
    f.battle = start(f.from.card!, card, seed ?? Math.floor(Math.random() * 0xffffffff));
    f.deadline = new Date(now.getTime() + TURN_MS + READ_MS).toISOString();
    fillAuto(f);
    return f;
  });
}
export function choose(store: Store, key: string, id: string, seat: string, slot: unknown, now = new Date()): Result<Fight> {
  return change(store, key, (a) => {
    tick(a, now);
    const f = a.fights.find((x) => x.id === id), i = f ? sideOf(f, seat) : null;
    if (!f || f.phase !== "on" || i === null) return fail("that battle is over");          // DRAFT
    if (f.auto?.[i]) return fail("your daemon is fighting this one by itself -- watch it to the end");   // DRAFT
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
    else if (f.phase === "on" && f.auto?.[i]) return fail("your daemon is fighting this one by itself -- watch it to the end");   // DRAFT
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
// C-421: this side has watched the battle (a challenge's replay, seen at its player's next look)
export function watch(store: Store, key: string, id: string, seat: string, now = new Date()): Result<Fight> {
  return change(store, key, (a) => {
    tick(a, now);
    const f = a.fights.find((x) => x.id === id), i = f ? sideOf(f, seat) : null;
    if (!f || i === null) return fail("not found");
    f.watched = [f.watched?.[0] ?? true, f.watched?.[1] ?? true];
    f.watched[i] = true;
    return f;
  });
}
// C-421: the open challenges another seat could take
export const openTo = (all: Fight[], seat: string, mayTake: (f: Fight) => boolean = () => true) =>
  all.filter((f) => f.phase === "asked" && isOpen(f) && f.from.seat !== seat && mayTake(f));
export function fights(store: Store, key: string, now = new Date()): Fight[] {
  return change(store, key, (a) => { tick(a, now); return a.fights; });
}
// a request waiting for this seat, read without the clock's write: device state asks it at every poll (C-328's boards)
export function askedOf(store: Store, key: string, seat: string, now = new Date()) {
  if (!seat) return null;
  const f = load(store, key).fights.find((x) => x.phase === "asked" && x.to.seat === seat && now.getTime() - Date.parse(x.at) <= ASK_MS);
  return f ? { id: f.id, phase: f.phase, from: f.from.label } : null;
}
export const fightsOf = (all: Fight[], seat: string) => all.filter((f) => sideOf(f, seat) !== null);

// ---- what a seat is shown: both daemons as the screen draws them, its own routines, the lines so far ----
// C-423: a side's growth curve, and its experience as it went in -- its companion's own count, or the least its level
// says (a far side's card tells its level only) -- so the end can sing what each song has learned
const SPECIES = speciesJson as unknown as Record<string, { growth?: number }>;
const growthOf = (species: number) => SPECIES[String(species)]?.growth ?? 0;

export function view(f: Fight, seat: string, now = new Date()) {
  const me = sideOf(f, seat), b = f.battle;
  const corner = (c: Corner, i: 0 | 1) => {
    const fi = b?.sides[i], card = fi?.card ?? c.card;
    return { label: c.label, seat: c.seat,
             daemon: card ? { nickname: card.nickname, name: card.name, species: card.species, level: card.level, art: card.art ?? null,
                              types: card.types.map((t) => TYPE_NAMES[t]), hp: fi?.hp ?? card.stats.maxHP, maxHP: card.stats.maxHP,
                              status: fi?.status ?? "none",
                              growth: growthOf(card.species), exp: card.exp ?? expFor(growthOf(card.species), card.level),
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
    winner, draw: !!b?.draw, forfeit: f.forfeit, exp: f.exp, endedAt: f.endedAt,
    // C-421: a challenge -- open to anyone, until when it waits, which side fights by itself, and who has watched it
    challenge: !!f.challenge, open: isOpen(f), auto: f.auto ?? [false, false], watched: f.watched ?? [true, true],
    until: f.challenge && f.phase === "asked" ? new Date(Date.parse(f.at) + CHALLENGE_MS).toISOString() : null,
    // the game's own line for the end: "<winner> outscored <loser>!" (src/battle_message.c, a link battle's)
    result: f.phase === "over" && winner !== null
      ? say("PlayerDefeatedLinkTrainer", { foe: labels[1 - winner] }).replace(/^Player/, labels[winner]) : null,
    asking: f.phase === "asked" ? say("LinkTrainerWantsToBattle", { foe: f.from.label }) : null,
  };
}
