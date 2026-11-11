// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-328 (the user, 2026-11-11, by multiple choice): BATTLES -- the companion's own, one daemon each, simulated from what
// the save holds: each daemon's real stats (save/battler.ts), its four routines, and the game's own type chart, damage
// formula and words (data/battle.json, exported by DAEMONS from src/battle_main.c, src/pokemon.c, src/data/battle_moves.h
// and src/battle_message.c -- the chart is the argument, byte-identical in both editions, and is never retyped here).
//
// What is simulated (the user's pick, "damage + simple status"): the game's damage exactly as CalculateBaseDamage then
// Cmd_typecalc then the random roll give it (stat stages, the routine's own side since T-490, the same-type bonus,
// every chart entry, critical hits, accuracy and evasion, priority and speed); and each status routine's main effect --
// stat stages, the five states and thrashing, healing, draining, recoil, several hits, flinching, recharging, PROTECT.
// Left out at first: abilities, held items, weather, and the routines whose point is another turn (two-turn charges
// are struck at once; a routine with no effect here says the game's "But nothing happened!").
//
// Pure: a battle is a value, a turn is `resolve(state, choices)`, and the dice are the state's own (a seeded generator),
// so a battle replays the same from the same seed. Nobody's health is kept: the battle is fought on a copy of each
// daemon's card, so every daemon returns as it went (the user: "after the battle all daemons are still in full health").
import battleJson from "../data/battle.json" with { type: "json" };
import routinesJson from "../data/routines.json" with { type: "json" };

type MoveRow = { power: number; type: number; split: number; accuracy: number; pp: number; priority: number; effect: string; chance: number };
const B = battleJson as unknown as { chart: [number, number, number][]; foresight: number | null; moves: Record<string, MoveRow>;
                                     exp: Record<string, number>; words: Record<string, string>; stats: string[] };
const R = routinesJson as unknown as { types: string[]; moves: Record<string, string> };
export const TYPE_NAMES = R.types;
export const moveRow = (id: number): MoveRow | null => B.moves[String(id)] ?? null;
export const moveName = (id: number) => R.moves[String(id)] ?? `#${id}`;
export const expYield = (species: number) => B.exp[String(species)] ?? 0;

// ---- the card each side brings: what a daemon is, read from its own save (save/battler.ts) ----
export type Stats = { maxHP: number; atk: number; def: number; speed: number; spAtk: number; spDef: number };
export interface Card {
  personality: number; species: number; name: string;      // name: the species' name in the game
  nickname: string; level: number; types: number[];        // types by the game's TYPE_ORDER
  stats: Stats; moves: { id: number; pp: number }[];        // its routines and their MP
  art?: string | null;                                       // its front picture's name (the app and boards draw it)
}

// ---- the battle as it stands ----
export type Status = "none" | "psn" | "tox" | "brn" | "par" | "slp" | "frz";
const STAGES = ["atk", "def", "speed", "spAtk", "spDef", "acc", "eva"] as const;
type Stage = (typeof STAGES)[number];
export interface Fighter {
  card: Card; hp: number; pp: number[]; status: Status; sleep: number; toxic: number; confused: number;
  stages: Record<Stage, number>; crit: number; seeded: boolean; recharge: boolean; protect: number; flinch: boolean; protecting: boolean;
}
export interface Line { text: string; side?: 0 | 1; hp?: [number, number]; sound?: "hit" | "super" | "weak" | "miss" | "faint" | "status" | "stat" | "heal" }
export interface BattleState { seed: number; turn: number; sides: [Fighter, Fighter]; log: Line[][]; winner: 0 | 1 | null; draw?: boolean }

// the game's own words, each placeholder filled -- the companion adds no new battle words (only the request around it)
export function say(key: string, fill: Record<string, string | number> = {}): string {
  const t = B.words[key] ?? key;
  return t.replace(/\{(\w+)\}/g, (_, k) => (k in fill ? String(fill[k]) : "")).replace(/\s+/g, " ").trim();
}
const STAT_NAMES: Record<Stage, string> = { atk: B.stats[1], def: B.stats[2], speed: B.stats[3], spAtk: B.stats[4], spDef: B.stats[5], acc: B.stats[6], eva: B.stats[7] };

// ---- the dice: mulberry32, kept in the state so a battle replays ----
function dice(s: BattleState) {
  return (n: number) => {                              // 0 .. n-1
    let t = (s.seed = (s.seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) % 0x100000000) % n;
  };
}

export function fighter(card: Card): Fighter {
  return { card, hp: card.stats.maxHP, pp: card.moves.map((m) => m.pp), status: "none", sleep: 0, toxic: 0, confused: 0,
           stages: { atk: 0, def: 0, speed: 0, spAtk: 0, spDef: 0, acc: 0, eva: 0 }, crit: 0, seeded: false,
           recharge: false, protect: 0, flinch: false, protecting: false };
}
export function start(a: Card, b: Card, seed: number): BattleState {
  return { seed: seed >>> 0, turn: 0, sides: [fighter(a), fighter(b)], log: [], winner: null };
}

// ---- the game's numbers ----
const RATIO: [number, number][] = [[10, 40], [10, 35], [10, 30], [10, 25], [10, 20], [10, 15], [10, 10], [15, 10], [20, 10], [25, 10], [30, 10], [35, 10], [40, 10]];
const ACC: [number, number][] = [[33, 100], [36, 100], [43, 100], [50, 100], [60, 100], [75, 100], [1, 1], [133, 100], [166, 100], [2, 1], [233, 100], [133, 50], [3, 1]];
const CRIT = [16, 8, 4, 3, 2];
const staged = (v: number, st: number) => Math.trunc((v * RATIO[st + 6][0]) / RATIO[st + 6][1]);
const MYSTERY = TYPE_NAMES.length > 9 ? 9 : -1;         // ORACLE (TYPE_MYSTERY): neither side, no damage (the ??? rule)
const IS_SPECIAL = (type: number) => type > MYSTERY;      // Gen 3's rule by type, for a STATUS routine asked which side

// how the chart judges a routine of TYPE against these types, x10 per entry, in the game's order (Cmd_typecalc)
export function effectiveness(type: number, against: number[]): number {
  let m = 1;
  for (const [a, d, x] of B.chart) if (a === type && against.includes(d)) m *= x / 10;
  return m;
}

function speedOf(f: Fighter) { let s = staged(f.card.stats.speed, f.stages.speed); if (f.status === "par") s = Math.trunc(s / 4); return s; }

// CalculateBaseDamage, without abilities, items, badges, weather or doubles: the parts that are the daemon's own
function baseDamage(atk: Fighter, def: Fighter, power: number, type: number, split: number, crit: boolean, explosion = false): number {
  if (split === 2) split = IS_SPECIAL(type) ? 1 : 0;
  const L = atk.card.level;
  const [aKey, dKey] = split === 0 ? (["atk", "def"] as const) : (["spAtk", "spDef"] as const);
  let a = atk.card.stats[aKey], d = def.card.stats[dKey];
  if (explosion) d = Math.trunc(d / 2);
  const aSt = crit && atk.stages[aKey] < 0 ? 0 : atk.stages[aKey], dSt = crit && def.stages[dKey] > 0 ? 0 : def.stages[dKey];
  let dmg = staged(a, aSt) * power * Math.trunc((2 * L) / 5 + 2);
  dmg = Math.trunc(Math.trunc(dmg / Math.max(1, staged(d, dSt))) / 50);
  if (split === 0 && atk.status === "brn") dmg = Math.trunc(dmg / 2);
  if (type === MYSTERY) dmg = 0;
  if (split === 0 && dmg === 0) dmg = 1;
  return dmg + 2;
}

// ---- one turn ----
export type Choice = number;   // the routine's slot, 0-3; -1 STRUGGLE (no MP left)

// the hub's pick for a side that did not choose in time: its strongest routine against the other's types
export function autoPick(s: BattleState, side: 0 | 1): Choice {
  const me = s.sides[side], foe = s.sides[1 - side];
  let best = -1, bestScore = -1;
  me.card.moves.forEach((m, i) => {
    if (me.pp[i] <= 0) return;
    const r = moveRow(m.id);
    const score = r && r.power > 0 ? r.power * effectiveness(r.type, foe.card.types) * (me.card.types.includes(r.type) ? 1.5 : 1) * Math.max(r.accuracy, 1) / 100 : 0.5;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}
export const usable = (f: Fighter) => f.pp.some((p, i) => p > 0 && f.card.moves[i]?.id);

export function resolve(s: BattleState, choices: [Choice, Choice]): BattleState {
  if (s.winner !== null || s.draw) return s;
  const roll = dice(s), lines: Line[] = [];
  const name = (i: 0 | 1) => s.sides[i].card.nickname;
  const hp = (): [number, number] => [s.sides[0].hp, s.sides[1].hp];
  const out = (text: string, side?: 0 | 1, sound?: Line["sound"]) => lines.push({ text, side, hp: hp(), sound });
  s.turn++;
  // who goes first: priority, then speed, then a coin (as the game's GetWhoStrikesFirst)
  const pri = (i: 0 | 1) => { const c = choices[i]; return c < 0 ? 0 : moveRow(s.sides[i].card.moves[c]?.id ?? 0)?.priority ?? 0; };
  let order: (0 | 1)[] = [0, 1];
  const p0 = pri(0), p1 = pri(1), s0 = speedOf(s.sides[0]), s1 = speedOf(s.sides[1]);
  if (p1 > p0 || (p1 === p0 && (s1 > s0 || (s1 === s0 && roll(2) === 1)))) order = [1, 0];
  for (const f of s.sides) { f.flinch = false; f.protecting = false; }
  for (const [k, i] of order.entries()) {
    if (s.winner !== null) break;
    act(s, i, choices[i], k === 0, roll, out, name);
    if (faintCheck(s, out, name)) break;
  }
  // the turn's end: leaking, overheating, SEED
  if (s.winner === null) for (const i of order) {
    const f = s.sides[i], max = f.card.stats.maxHP;
    if (f.hp <= 0) continue;
    if (f.status === "psn" || f.status === "tox") {
      const d = f.status === "tox" ? Math.max(1, Math.trunc((max * ++f.toxic) / 16)) : Math.max(1, Math.trunc(max / 8));
      f.hp = Math.max(0, f.hp - d); out(say("PkmnHurtByPoison", { atk: name(i) }), i, "status");
    } else if (f.status === "brn") {
      f.hp = Math.max(0, f.hp - Math.max(1, Math.trunc(max / 8))); out(say("PkmnHurtByBurn", { atk: name(i) }), i, "status");
    }
    if (f.seeded && f.hp > 0) {
      const o = s.sides[1 - i], d = Math.min(f.hp, Math.max(1, Math.trunc(max / 8)));
      f.hp -= d; o.hp = Math.min(o.card.stats.maxHP, o.hp + (o.hp > 0 ? d : 0));
      out(say("PkmnSappedByLeechSeed", { atk: name(i) }), i, "status");
    }
    if (faintCheck(s, out, name)) break;
  }
  s.log.push(lines);
  return s;
}

function faintCheck(s: BattleState, out: (t: string, side?: 0 | 1, sound?: Line["sound"]) => void, name: (i: 0 | 1) => string): boolean {
  const down = ([0, 1] as const).filter((i) => s.sides[i].hp <= 0);
  for (const i of down) out(say("TargetFainted", { def: name(i) }), i, "faint");
  if (down.length === 2) { s.draw = true; return true; }      // both at once (an EXPLOSION that finishes both): a draw
  if (down.length === 1) { s.winner = (1 - down[0]) as 0 | 1; return true; }
  return false;
}

const STATUS_WORD: Record<Exclude<Status, "none">, string> = { psn: "PkmnWasPoisoned", tox: "PkmnBadlyPoisoned", brn: "PkmnWasBurned", par: "PkmnWasParalyzed", slp: "PkmnFellAsleep", frz: "PkmnWasFrozen" };
const ALREADY: Partial<Record<Status, string>> = { psn: "PkmnAlreadyPoisoned", tox: "PkmnAlreadyPoisoned", brn: "PkmnAlreadyHasBurn", par: "PkmnIsAlreadyParalyzed", slp: "PkmnAlreadyAsleep" };

// the secondary or main state a routine gives, and the stat stages (as the game's effect names say)
const HIT_STATUS: Record<string, Status> = { POISON_HIT: "psn", BURN_HIT: "brn", FREEZE_HIT: "frz", PARALYZE_HIT: "par", THUNDER: "par",
  BLAZE_KICK: "brn", POISON_FANG: "tox", POISON_TAIL: "psn", THAW_HIT: "brn", SECRET_POWER: "par", TWINEEDLE: "psn" };
const MAIN_STATUS: Record<string, Status> = { SLEEP: "slp", POISON: "psn", TOXIC: "tox", PARALYZE: "par", WILL_O_WISP: "brn", YAWN: "slp" };
// [whose: 0 the user, 1 the target, which stages, by how much]
const STAT_MOVES: Record<string, [0 | 1, Stage[], number]> = {
  ATTACK_UP: [0, ["atk"], 1], ATTACK_UP_2: [0, ["atk"], 2], DEFENSE_UP: [0, ["def"], 1], DEFENSE_UP_2: [0, ["def"], 2],
  SPECIAL_ATTACK_UP: [0, ["spAtk"], 1], SPECIAL_ATTACK_UP_2: [0, ["spAtk"], 2], SPECIAL_DEFENSE_UP_2: [0, ["spDef"], 2],
  SPEED_UP_2: [0, ["speed"], 2], EVASION_UP: [0, ["eva"], 1], MINIMIZE: [0, ["eva"], 1], DEFENSE_CURL: [0, ["def"], 1],
  CALM_MIND: [0, ["spAtk", "spDef"], 1], BULK_UP: [0, ["atk", "def"], 1], DRAGON_DANCE: [0, ["atk", "speed"], 1],
  COSMIC_POWER: [0, ["def", "spDef"], 1],
  ATTACK_DOWN: [1, ["atk"], -1], ATTACK_DOWN_2: [1, ["atk"], -2], DEFENSE_DOWN: [1, ["def"], -1], DEFENSE_DOWN_2: [1, ["def"], -2],
  SPEED_DOWN: [1, ["speed"], -1], SPEED_DOWN_2: [1, ["speed"], -2], SPECIAL_DEFENSE_DOWN_2: [1, ["spDef"], -2],
  ACCURACY_DOWN: [1, ["acc"], -1], EVASION_DOWN: [1, ["eva"], -1], TICKLE: [1, ["atk", "def"], -1],
};
const HIT_STATS: Record<string, [0 | 1, Stage[], number]> = {
  ATTACK_DOWN_HIT: [1, ["atk"], -1], DEFENSE_DOWN_HIT: [1, ["def"], -1], SPEED_DOWN_HIT: [1, ["speed"], -1],
  SPECIAL_DEFENSE_DOWN_HIT: [1, ["spDef"], -1], ACCURACY_DOWN_HIT: [1, ["acc"], -1], ATTACK_UP_HIT: [0, ["atk"], 1],
  DEFENSE_UP_HIT: [0, ["def"], 1], ALL_STATS_UP_HIT: [0, ["atk", "def", "speed", "spAtk", "spDef"], 1],
};
const HEALS = new Set(["RESTORE_HP", "SOFTBOILED", "MORNING_SUN", "SYNTHESIS", "MOONLIGHT", "WISH", "SWALLOW"]);

function act(s: BattleState, i: 0 | 1, choice: Choice, first: boolean, roll: (n: number) => number,
             out: (t: string, side?: 0 | 1, sound?: Line["sound"]) => void, name: (i: 0 | 1) => string) {
  const me = s.sides[i], j = (1 - i) as 0 | 1, foe = s.sides[j];
  if (me.hp <= 0) return;
  if (me.recharge) { me.recharge = false; out(say("PkmnMustRecharge", { atk: name(i) }), i); return; }
  if (me.status === "frz") {
    if (roll(5) === 0) { me.status = "none"; out(say("PkmnWasDefrosted2", { atk: name(i) }), i, "status"); }
    else { out(say("PkmnIsFrozen", { atk: name(i) }), i, "status"); return; }
  }
  if (me.status === "slp") {
    if (--me.sleep <= 0) { me.status = "none"; out(say("PkmnWokeUp", { atk: name(i) }), i, "status"); }
    else { out(say("PkmnFastAsleep", { atk: name(i) }), i, "status"); return; }
  }
  if (me.flinch) { out(say("PkmnFlinched", { atk: name(i) }), i); return; }
  if (me.confused > 0) {
    if (--me.confused === 0) out(say("PkmnHealedConfusion", { atk: name(i) }), i, "status");
    else {
      out(say("PkmnIsConfused", { atk: name(i) }), i, "status");
      if (roll(2) === 0) {
        const d = Math.trunc((baseDamage(me, me, 40, -2, 0, false) * (100 - roll(16))) / 100) || 1;
        me.hp = Math.max(0, me.hp - d); out(say("ItHurtConfusion"), i, "hit"); return;
      }
    }
  }
  if (me.status === "par" && roll(4) === 0) { out(say("PkmnIsParalyzed", { atk: name(i) }), i, "status"); return; }

  // the routine: one with MP, or STRUGGLE when none has any
  let id = choice >= 0 ? me.card.moves[choice]?.id ?? 0 : 0, slot = choice;
  if (!id || me.pp[slot] <= 0) { const k = me.pp.findIndex((p, x) => p > 0 && me.card.moves[x]?.id); slot = k; id = k >= 0 ? me.card.moves[k].id : 0; }
  const struggle = !id;
  if (struggle) out(say("PkmnHasNoMovesLeft", { atk: name(i) }), i);
  else me.pp[slot]--;
  const r: MoveRow = struggle ? { power: 50, type: -1, split: 0, accuracy: 0, pp: 1, priority: 0, effect: "RECOIL", chance: 0 } : moveRow(id)!;
  out(say("AttackerUsedX", { atk: name(i), buf2: `${struggle ? "STRUGGLE" : moveName(id)}!` }), i);
  const e = r.effect;
  if (e === "PROTECT" || e === "ENDURE") {
    const ok = first && roll(Math.pow(2, Math.min(me.protect, 3))) === 0;    // the game halves its chance each time in a row
    me.protect = ok ? me.protect + 1 : 0;
    if (!ok) { out(say("ButItFailed"), i); return; }
    me.protecting = true; out(say(e === "PROTECT" ? "PkmnProtectedItself" : "PkmnBracedItself", { def: name(i), atk: name(i) }), i, "status"); return;
  }
  me.protect = 0;
  const targetsFoe = r.power > 0 || e in MAIN_STATUS || (STAT_MOVES[e]?.[0] === 1) || ["CONFUSE", "SWAGGER", "FLATTER", "LEECH_SEED", "OHKO", "LEVEL_DAMAGE", "SONICBOOM", "DRAGON_RAGE", "SUPER_FANG", "PSYWAVE", "ENDEAVOR"].includes(e);
  if (targetsFoe && foe.protecting) { out(say("PkmnProtectedItself", { def: name(j) }), j); return; }
  // accuracy: the routine's, by the user's accuracy against the target's evasion (0: never misses)
  if (targetsFoe && r.accuracy > 0 && e !== "ALWAYS_HIT") {
    let acc = r.accuracy;
    if (e === "OHKO") acc = me.card.level < foe.card.level ? 0 : acc + me.card.level - foe.card.level;
    const st = Math.max(0, Math.min(12, 6 + me.stages.acc - foe.stages.eva));
    if (roll(100) + 1 > Math.trunc((ACC[st][0] * acc) / ACC[st][1])) {
      out(say("AttackMissed", { atk: name(i) }), i, "miss");
      if (e === "RECOIL_IF_MISS") { me.hp = Math.max(0, me.hp - Math.trunc(me.card.stats.maxHP / 2)); out(say("PkmnHitWithRecoil", { atk: name(i) }), i, "hit"); }
      return;
    }
  }

  // ---- routines that deal damage ----
  if (r.power > 0 || ["OHKO", "LEVEL_DAMAGE", "SONICBOOM", "DRAGON_RAGE", "SUPER_FANG", "PSYWAVE", "ENDEAVOR"].includes(e)) {
    if (r.type >= 0 && effectiveness(r.type, foe.card.types) === 0) { out(say("ItDoesntAffect", { def: name(j) }), j, "miss"); return; }
    if (e === "DREAM_EATER" && foe.status !== "slp") { out(say("PkmnWasntAffected", { def: name(j) }), j, "miss"); return; }
    let total = 0, hits = 1;
    if (e === "MULTI_HIT") hits = [2, 2, 2, 3, 3, 3, 4, 5][roll(8)];
    else if (e === "DOUBLE_HIT" || e === "TWINEEDLE") hits = 2;
    else if (e === "TRIPLE_KICK") hits = 3;
    let crits = false, mult = 1;
    for (let h = 0; h < hits && foe.hp > 0; h++) {
      let dmg: number;
      if (e === "OHKO") { dmg = foe.hp; out(say("OneHitKO"), j, "super"); }
      else if (e === "LEVEL_DAMAGE") dmg = me.card.level;
      else if (e === "SONICBOOM") dmg = 20;
      else if (e === "DRAGON_RAGE") dmg = 40;
      else if (e === "SUPER_FANG") dmg = Math.max(1, Math.trunc(foe.hp / 2));
      else if (e === "PSYWAVE") dmg = Math.max(1, Math.trunc((me.card.level * (roll(11) * 10 + 50)) / 100));
      else if (e === "ENDEAVOR") dmg = Math.max(0, foe.hp - me.hp);
      else {
        let power = e === "TRIPLE_KICK" ? r.power * (h + 1) : r.power;
        if (e === "FLAIL") { const p = Math.trunc((48 * me.hp) / me.card.stats.maxHP); power = p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20; }
        if (e === "ERUPTION") power = Math.max(1, Math.trunc((r.power * me.hp) / me.card.stats.maxHP));
        if (e === "RETURN" || e === "FRUSTRATION") power = 102;
        if (e === "LOW_KICK") power = 60;
        if (e === "FACADE" && me.status !== "none") power *= 2;
        if (e === "REVENGE" && !first) power *= 2;
        if (e === "SMELLINGSALT" && foe.status === "par") power *= 2;
        const stage = Math.min(4, me.crit + (["HIGH_CRITICAL", "BLAZE_KICK", "POISON_TAIL", "SKY_ATTACK"].includes(e) ? 1 : 0));
        const crit = roll(CRIT[stage]) === 0;
        const type = struggle ? -1 : r.type;
        dmg = baseDamage(me, foe, power, type, r.split, crit, e === "EXPLOSION") * (crit ? 2 : 1);
        if (type >= 0 && me.card.types.includes(type)) dmg = Math.trunc((dmg * 15) / 10);
        if (type >= 0) for (const [a, d, x] of B.chart) if (a === type && foe.card.types.includes(d)) dmg = Math.trunc((dmg * x) / 10);
        mult = type >= 0 ? effectiveness(type, foe.card.types) : 1;
        if (dmg > 0) dmg = Math.max(1, Math.trunc((dmg * (100 - roll(16))) / 100));
        crits = crits || crit;
        if (crit) out(say("CriticalHit"), j, "hit");
      }
      if (e === "FALSE_SWIPE") dmg = Math.min(dmg, foe.hp - 1);
      dmg = Math.min(dmg, foe.hp);
      foe.hp -= dmg; total += dmg;
      out("", j, mult > 1 ? "super" : mult < 1 ? "weak" : "hit");   // the hit itself: the HP bar moves (no words)
    }
    if (mult > 1) out(say("SuperEffective"), j, "super");
    else if (mult > 0 && mult < 1) out(say("NotVeryEffective"), j, "weak");
    if (hits > 1) out(say("HitXTimes", { buf1: hits }), j);
    // what follows the hit
    if (e === "ABSORB" || e === "DREAM_EATER") {
      const back = Math.max(1, Math.trunc(total / 2));
      me.hp = Math.min(me.card.stats.maxHP, me.hp + back);
      out(say(e === "DREAM_EATER" ? "PkmnDreamEaten" : "PkmnEnergyDrained", { def: name(j) }), i, "heal");
    }
    if (e === "RECOIL" || e === "DOUBLE_EDGE") {
      const d = Math.max(1, Math.trunc(total / (e === "DOUBLE_EDGE" ? 3 : 4)));
      me.hp = Math.max(0, me.hp - d); out(say("PkmnHitWithRecoil", { atk: name(i) }), i, "hit");
    }
    if (e === "EXPLOSION") { me.hp = 0; }
    if (e === "RECHARGE") me.recharge = true;
    if (e === "SUPERPOWER") stat(me, ["atk", "def"], -1, i, out, name, "atk");
    if (e === "OVERHEAT") stat(me, ["spAtk"], -2, i, out, name, "atk");
    if (foe.hp > 0) {
      const chance = r.chance || (HIT_STATUS[e] ? 10 : 0);
      if (HIT_STATUS[e] && roll(100) < chance) inflict(foe, HIT_STATUS[e], j, roll, out, name, true);
      if (e === "TRI_ATTACK" && roll(100) < (r.chance || 20)) inflict(foe, (["par", "brn", "frz"] as Status[])[roll(3)], j, roll, out, name, true);
      if (e === "CONFUSE_HIT" && roll(100) < (r.chance || 10) && !foe.confused) { foe.confused = 2 + roll(4); out(say("PkmnWasConfused", { eff: name(j) }), j, "status"); }
      if ((e === "FLINCH_HIT" || e === "FLINCH_MINIMIZE_HIT" || e === "TWISTER" || e === "SKY_ATTACK") && first && roll(100) < (r.chance || 30)) foe.flinch = true;
      if (HIT_STATS[e] && roll(100) < (r.chance || 10)) { const [w, st, n] = HIT_STATS[e]; stat(w ? foe : me, st, n, w ? j : i, out, name, w ? "def" : "atk"); }
    }
    return;
  }

  // ---- routines that change a state ----
  if (e in MAIN_STATUS) {
    const st = MAIN_STATUS[e];
    if (r.type >= 0 && effectiveness(r.type, foe.card.types) === 0 && (st === "par" || st === "psn" || st === "tox")) { out(say("ItDoesntAffect", { def: name(j) }), j, "miss"); return; }
    inflict(foe, st, j, roll, out, name, false); return;
  }
  if (STAT_MOVES[e]) { const [w, st, n] = STAT_MOVES[e]; stat(w ? foe : me, st, n, w ? j : i, out, name, w ? "def" : "atk"); return; }
  switch (e) {
    case "CONFUSE": case "SWAGGER": case "FLATTER":
      if (e !== "CONFUSE") stat(foe, [e === "SWAGGER" ? "atk" : "spAtk"], e === "SWAGGER" ? 2 : 1, j, out, name, "def");
      if (foe.confused) { out(say("PkmnAlreadyConfused", { def: name(j) }), j); return; }
      foe.confused = 2 + roll(4); out(say("PkmnWasConfused", { eff: name(j) }), j, "status"); return;
    case "LEECH_SEED":
      if (foe.seeded || foe.card.types.includes(12)) { out(say("ButItFailed"), j); return; }   // GROWTH (grass) cannot be seeded
      foe.seeded = true; out(say("PkmnSeeded", { def: name(j) }), j, "status"); return;
    case "REST":
      if (me.hp >= me.card.stats.maxHP) { out(say("PkmnHPFull", { def: name(i) }), i); return; }
      me.hp = me.card.stats.maxHP; me.status = "slp"; me.sleep = 3; me.toxic = 0;
      out(say("PkmnSleptHealthy", { atk: name(i) }), i, "heal"); return;
    case "REFRESH": case "HEAL_BELL":
      if (e === "HEAL_BELL") out(say("BellChimed"), i);
      if (me.status === "none") { out(say("ButItFailed"), i); return; }
      me.status = "none"; me.toxic = 0; out(say("PkmnStatusNormal", { atk: name(i) }), i, "heal"); return;
    case "HAZE":
      for (const f of s.sides) for (const k of STAGES) f.stages[k] = 0;
      out(say("StatChangesGone"), i, "stat"); return;
    case "FOCUS_ENERGY":
      if (me.crit >= 2) { out(say("ButItFailed"), i); return; }
      me.crit = 2; out(say("GetPumped", { atk: name(i) }), i, "stat"); return;
    case "BELLY_DRUM": {
      const cost = Math.trunc(me.card.stats.maxHP / 2);
      if (me.hp <= cost) { out(say("ButItFailed"), i); return; }
      me.hp -= cost; me.stages.atk = 6; out(say("PkmnCutHPMaxedAttack", { atk: name(i) }), i, "stat"); return;
    }
    case "CURSE":
      if (me.card.types.includes(7)) {                               // a LATENT (ghost) curse: half its own HP, a quarter a turn
        me.hp = Math.max(0, me.hp - Math.trunc(me.card.stats.maxHP / 2)); foe.seeded = true;
        out(say("PkmnLaidCurse", { atk: name(i), def: name(j) }), i, "status"); return;
      }
      stat(me, ["atk", "def"], 1, i, out, name, "atk"); stat(me, ["speed"], -1, i, out, name, "atk"); return;
  }
  if (HEALS.has(e)) {
    if (me.hp >= me.card.stats.maxHP) { out(say("PkmnHPFull", { def: name(i) }), i); return; }
    me.hp = Math.min(me.card.stats.maxHP, me.hp + Math.trunc(me.card.stats.maxHP / 2));
    out(say("PkmnRegainedHealth", { def: name(i) }), i, "heal"); return;
  }
  out(say("ButNothingHappened"), i);
}

function inflict(f: Fighter, st: Status, side: 0 | 1, roll: (n: number) => number, out: (t: string, side?: 0 | 1, sound?: Line["sound"]) => void,
                 name: (i: 0 | 1) => string, quiet: boolean) {
  if (f.status !== "none") { if (!quiet) out(say(ALREADY[f.status] ?? "PkmnWasntAffected", { def: name(side) }), side); return; }
  // the types a state does not take (the game's rules: CORRUPT and HARDENED never leak, ENTROPY never overheats, FROZEN never hangs)
  const immune = (st === "psn" || st === "tox") && (f.card.types.includes(3) || f.card.types.includes(8))
              || st === "brn" && f.card.types.includes(10) || st === "frz" && f.card.types.includes(15);
  if (immune) { if (!quiet) out(say("ItDoesntAffect", { def: name(side) }), side); return; }
  f.status = st;
  if (st === "slp") f.sleep = 2 + roll(4);
  if (st === "tox") f.toxic = 0;
  out(say(STATUS_WORD[st as Exclude<Status, "none">], { eff: name(side) }), side, "status");
}

function stat(f: Fighter, which: Stage[], n: number, side: 0 | 1, out: (t: string, side?: 0 | 1, sound?: Line["sound"]) => void,
              name: (i: 0 | 1) => string, as: "atk" | "def") {
  for (const k of which) {
    const was = f.stages[k], to = Math.max(-6, Math.min(6, was + n));
    if (to === was) { out(say(n > 0 ? "StatsWontIncrease" : "StatsWontDecrease", { atk: name(side), def: name(side), buf1: STAT_NAMES[k] }), side); continue; }
    f.stages[k] = to;
    const how = `${Math.abs(n) > 1 ? say(n > 0 ? "StatSharply" : "StatHarshly") + " " : ""}${say(n > 0 ? "Rose" : "StatFell")}`;
    const key = n > 0 ? "AttackersStatRose" : as === "atk" ? "AttackersStatFell" : "DefendersStatFell";
    out(say(key, { atk: name(side), def: name(side), buf1: STAT_NAMES[k], buf2: how }), side, "stat");
  }
}

// ---- the experience, as the game gives it for beating a trainer's daemon (Cmd_getexp): its species' yield times its
// level, over seven, and half again for a trainer's. The loser gets a third of what beating the winner would have given
// (the user's pick, 2026-11-11).
export function gameExp(beaten: Card): number { return Math.trunc((Math.trunc((expYield(beaten.species) * beaten.level) / 7) * 150) / 100); }
export function battleExp(s: BattleState): [number, number] {
  if (s.winner === null) return [0, 0];
  const w = s.winner, l = (1 - w) as 0 | 1, out: [number, number] = [0, 0];
  out[w] = gameExp(s.sides[l].card);
  out[l] = Math.trunc(gameExp(s.sides[w].card) / 3);
  return out;
}
