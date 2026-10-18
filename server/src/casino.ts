// C-149 (the user, 2026-10-17): THE CASINO's coins are the save's money. A board plays SLOTS against the money the save
// holds plus what it has won or lost since; each result reaches here as an ordinary interaction -- INTERACT casino
// "<delta> <boot>.<seq> <device> <spins>" -- and waits until SYNC writes it into the married save (writer.ts), never
// below 0 and never above the game's 999999.
//
// <boot>.<seq> is the board's own count of its reports since it started, so a report sent twice (the outbox tries
// again when an answer is lost) is counted once, and the board can tell from `seen` which of its reports are in the
// balance it is sent and which it must still add itself.
import type { Store } from "./store.js";
import { carrying } from "./carry.js";
import { BETS, PAYS, catReason } from "./slots.js";
import type { Reason } from "./context.js";

export const MONEY_MAX = 999999;
const DELTA_MAX = 1000000;
// C-157 (the code review, 2026-10-18): a report claims no more than its pulls could come to -- each at most the biggest
// bet lost, or the biggest bet times the jackpot less the bet won -- so a made-up INTERACT casino line cannot mint money
const LOSS_PER_SPIN = Math.max(...BETS), WIN_PER_SPIN = Math.max(...BETS) * (Math.max(...PAYS) - 1);

export interface CasinoResult { id: number; delta: number; boot: string; seq: number; device: string; spins: number }

export function parseResult(id: number, detail: string | null): CasinoResult | null {
  const m = /^(-?\d{1,7}) ([0-9a-f]{1,8})\.(\d{1,9}) ([A-Za-z0-9-]{1,48})(?: (\d{1,6}))?$/.exec(detail ?? "");
  if (!m || Math.abs(Number(m[1])) > DELTA_MAX) return null;
  const delta = Number(m[1]), spins = Number(m[5] ?? 0);
  if (delta < -LOSS_PER_SPIN * spins || delta > WIN_PER_SPIN * spins) return null;   // more than its pulls could come to
  return { id, delta, boot: m[2], seq: Number(m[3]), device: m[4], spins };
}

// Every result once, oldest first -- a second copy of a report (the same device, boot and seq) left out
export function casinoResults(store: Store): CasinoResult[] {
  const once = new Set<string>(), out: CasinoResult[] = [];
  for (const r of store.kindAll("casino")) {
    const c = parseResult(r.id, r.detail);
    if (!c) continue;
    const key = `${c.device} ${c.boot}.${c.seq}`;
    if (once.has(key)) continue;
    once.add(key);
    out.push(c);
  }
  return out;
}

// What waits for the next SYNC: the results after the last one a SYNC wrote
export function casinoPending(store: Store) {
  const applied = Number(store.getSetting("casino.applied") ?? 0);
  const rows = casinoResults(store).filter((r) => r.id > applied);
  return { delta: rows.reduce((n, r) => n + r.delta, 0), spins: rows.reduce((n, r) => n + r.spins, 0),
           last: rows.length ? rows[rows.length - 1].id : applied };
}

// The newest report this device's latest start has been counted for: "<boot>.<seq>", or "" before its first
export function casinoSeen(store: Store, device: string): string {
  const mine = casinoResults(store).filter((r) => r.device === device);
  if (!mine.length) return "";
  const boot = mine[mine.length - 1].boot;
  return `${boot}.${Math.max(...mine.filter((r) => r.boot === boot).map((r) => r.seq))}`;
}

export const clampMoney = (n: number) => Math.max(0, Math.min(MONEY_MAX, Math.round(n)));

// C-151 (the user, 2026-10-17): THE TABLE -- the user's other boards at the reels now. A board says INTERACT table
// "here <device>" as it sits down and each minute it stays, and "gone <device>" as it gets up; one heard from in the
// last two minutes, and not gone since, is at the table. Each by the daemon it carries (read, never assigned here).
// Strangers and boards nearby are the boards' own business (LoRa, Bluetooth): the companion knows only its own.
export const TABLE_FOR_MS = 120000;
// each with its daemon's species, so a board that also hears it by Bluetooth (a species, no name) counts it once
// C-158: a board at the reels also says the odds it plays at -- "here <device> <return in a thousand> <reach in
// hundredths> <pulls without a win> <wins running>" -- for the CASINO's admin page
type Away = { personality: number; nickname: string; name: string; species: number };
export interface Seat { name: string; device: string; species: number; at: string;
                        odds: { rtp: number; reach: number; dry: number; streak: number } | null }
export function seated(store: Store, away: Away[], now = new Date()): Seat[] {
  const last = new Map<string, { here: boolean; at: string; odds: Seat["odds"] }>();
  for (const r of store.kindSince("table", new Date(now.getTime() - TABLE_FOR_MS))) {
    const m = /^(here|gone) ([A-Za-z0-9-]{1,48})(?: (\d{3,4}) (-?\d{1,3}) (\d{1,5}) (\d{1,4}))?$/.exec(r.detail ?? "");
    if (m) last.set(m[2], { here: m[1] === "here", at: r.at,
                            odds: m[3] ? { rtp: Number(m[3]) / 1000, reach: Number(m[4]) / 100, dry: Number(m[5]), streak: Number(m[6]) } : null });
  }
  const map = carrying(store), out: Seat[] = [];
  for (const [d, s] of last) {
    if (!s.here) continue;
    const who = away.find((a) => a.personality === map[d]);
    out.push({ name: (who?.nickname || who?.name || "A DAEMON").toUpperCase(), device: d, species: who?.species ?? 0, at: s.at, odds: s.odds });   // DRAFT
  }
  return out;
}
export function tableFor(store: Store, device: string, away: Away[], now = new Date()) {
  return seated(store, away, now).filter((s) => s.device !== device).map(({ name, device, species }) => ({ name, device, species }));
}

// C-158 (the user, 2026-10-18: "a casino admin section where you can see who all is gambling and the current odds the
// instance is experiencing -- clicking on it explains why those odds are active (eg win streak, holiday, etc)"): the
// day's context with its reasons, and everyone at the reels with the odds they last said and why -- the context's
// reasons and the string's own
export function casinoAdmin(store: Store, away: Away[], context: { luck: number; rtp: number; reasons: Reason[] }, now = new Date()) {
  return {
    context,
    players: seated(store, away, now).map((p) => ({
      ...p,
      reasons: p.odds ? [...context.reasons, catReason({ reach: p.odds.reach, dry: p.odds.dry, streak: p.odds.streak, pulls: 0 })] : context.reasons,
    })),
  };
}

// The coins a board plays with: the save's money and what waits, and which of this board's reports are in it.
// `friends`: the party's slots besides the daemon carried here, whose pictures are the other reels' daemons.
// C-151: `table`, the user's other boards at the reels now
export function coinsFor(store: Store, money: number, device: string, friends: number[], table: { name: string; device: string; species: number }[] = []) {
  const p = casinoPending(store);
  return { money, pending: p.delta, balance: clampMoney(money + p.delta), seen: casinoSeen(store, device), friends, table };
}
