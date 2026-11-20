// C-429: PRAXIS runs on the phone too (C-111) -- no node:*, no fs, and nothing imported from the companion.
// Where an item sits among its siblings: a key whose order as text is its order on the page, so an item moved between
// two others takes a key between theirs and nothing else is renumbered -- two replicas can each move something without
// touching each other's keys. Two items given the same key by replicas that never spoke are ordered by their ids.

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";   // in the order text sorts them
const at = (s: string, i: number) => (i < s.length ? DIGITS.indexOf(s[i]) : 0);

/** a key after `a` and before `b` (either may be null: the start, the end). Keys never end in "0", so one always fits.
 *  At either end it steps by one digit rather than halving, so a list added to at its end (or its start) grows its keys
 *  by one character in thirty-odd, not one in six. */
export function between(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) throw new Error(`no position between ${a} and ${b}`);
  if (a !== null && b === null) {                       // after the last: the first digit that can go up, up by one
    const i = Array.from(a).findIndex((c) => c !== "z");
    if (i >= 0) return a.slice(0, i) + DIGITS[DIGITS.indexOf(a[i]) + 1];
  }
  if (a === null && b !== null) {                       // before the first: the first digit that can go down, down by one
    const i = Array.from(b).findIndex((c) => DIGITS.indexOf(c) >= 2);
    if (i >= 0) return b.slice(0, i) + DIGITS[DIGITS.indexOf(b[i]) - 1];
  }
  const lo = a ?? "";
  let out = "";
  for (let i = 0; ; i++) {
    const x = at(lo, i);
    const y = b === null ? DIGITS.length : (i < b.length ? DIGITS.indexOf(b[i]) : DIGITS.length);
    if (y - x > 1) return out + DIGITS[(x + y) >> 1];
    out += DIGITS[x];
    // y is x or x + 1: once the bound above is passed by one digit, nothing below it constrains us any more
    if (y === x + 1) b = null;
    else if (b !== null && i >= b.length) b = null;
  }
}
