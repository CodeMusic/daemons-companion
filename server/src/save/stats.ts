// C-45: a daemon's stats at a level, exactly as the game's CalculateMonStats (src/pokemon.c) gives them: HP from its
// base, IV and EV; the other five the same with +5, then its nature's +10% or -10% (in the game's u16 arithmetic).
// IVs are packed in the misc substructure's second word (5 bits each: HP, Attack, Defense, Speed, Sp.Atk, Sp.Def);
// EVs are the EV substructure's first six bytes in the same order. The nature is the personality mod 25.
import layoutJson from "../../data/save_layout.json" with { type: "json" };

const NATURES = (layoutJson as any).natures as number[][];   // by nature: Attack, Defense, Speed, Sp.Atk, Sp.Def

export type Stats = { maxHP: number; atk: number; def: number; speed: number; spAtk: number; spDef: number };

export function calcStats(base: number[], level: number, ivs: number[], evs: number[], personality: number): Stats {
  const nature = NATURES[personality % 25] ?? [0, 0, 0, 0, 0];
  const raw = (i: number) => Math.trunc(((2 * base[i] + ivs[i] + Math.trunc(evs[i] / 4)) * level) / 100);
  const other = (i: number) => {
    const n = raw(i) + 5, mod = nature[i - 1];
    return mod === 1 ? Math.trunc(((n * 110) & 0xffff) / 100) : mod === -1 ? Math.trunc(((n * 90) & 0xffff) / 100) : n;
  };
  return { maxHP: raw(0) + level + 10, atk: other(1), def: other(2), speed: other(3), spAtk: other(4), spDef: other(5) };
}

export const unpackIVs = (word: number) => [0, 5, 10, 15, 20, 25].map((s) => (word >>> s) & 31);
