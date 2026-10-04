// C-24: a daemon's level from its experience, as the game reads a boxed one's (GetLevelFromBoxMonExp): the highest
// level whose threshold it has reached. The six curves are the game's own macros (src/data/pokemon/
// experience_tables.h), in C's integer arithmetic; levels 0 and 1 are the table's literal 0 and 1.
const cube = (n: number) => n * n * n, div = (a: number, b: number) => Math.trunc(a / b);
const CURVES: ((n: number) => number)[] = [
  (n) => cube(n),                                                                     // MEDIUM_FAST
  (n) => n <= 50 ? div((100 - n) * cube(n), 50) : n <= 68 ? div((150 - n) * cube(n), 100)
       : n <= 98 ? div(div(1911 - 10 * n, 3) * cube(n), 500) : div((160 - n) * cube(n), 100),   // ERRATIC
  (n) => n <= 15 ? div((div(n + 1, 3) + 24) * cube(n), 50) : n <= 36 ? div((n + 14) * cube(n), 50)
       : div((div(n, 2) + 32) * cube(n), 50),                                          // FLUCTUATING
  (n) => div(6 * cube(n), 5) - 15 * n * n + 100 * n - 140,                             // MEDIUM_SLOW
  (n) => div(4 * cube(n), 5),                                                          // FAST
  (n) => div(5 * cube(n), 4),                                                          // SLOW
];

export const expFor = (growth: number, level: number) => level <= 0 ? 0 : level === 1 ? 1 : (CURVES[growth] ?? CURVES[0])(level);

export function levelFromExp(growth: number, exp: number): number {
  let level = 1;
  while (level <= 100 && expFor(growth, level) <= exp) level++;
  return level - 1;
}
