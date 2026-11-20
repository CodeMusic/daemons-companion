// C-429: PRAXIS runs on the phone too (C-111) -- no node:*, no fs, and nothing imported from the companion.
// The hybrid logical clock (PROJECTS.md 4.6). Every event carries one: wall-clock milliseconds, a counter for events
// within one millisecond, and the replica that made it -- so no two events anywhere share a time, and "the later write
// wins" means the same thing on every replica. A clock moves past every time it sees, so a change made after reading
// another is always later than it, even on a phone whose own clock is behind.
//
// Written as one string, "000001763551234567:0000a:<replica>", whose order as text is its order in time -- the database
// sorts and compares it as it is.

const MS = 18, COUNT = 5;
const MAX_COUNT = 36 ** COUNT - 1;
const SHAPE = /^(\d{18}):([0-9a-z]{5}):(.+)$/;

export interface Hlc { ms: number; count: number; replica: string }

export const hlcString = ({ ms, count, replica }: Hlc) =>
  `${String(ms).padStart(MS, "0")}:${count.toString(36).padStart(COUNT, "0")}:${replica}`;

export function parseHlc(h: string): Hlc | null {
  const m = SHAPE.exec(h);
  return m ? { ms: Number(m[1]), count: parseInt(m[2], 36), replica: m[3] } : null;
}

/** when an hlc was, as an ISO time */
export const hlcIso = (h: string) => new Date(parseHlc(h)?.ms ?? 0).toISOString();

export class Clock {
  private ms = 0;
  private count = 0;
  constructor(readonly replica: string, private readonly now: () => number = Date.now) {}

  /** a time later than every time this clock has made or seen */
  tick(): string {
    const pt = Math.floor(this.now());
    if (pt > this.ms) { this.ms = pt; this.count = 0; }
    else if (++this.count > MAX_COUNT) { this.ms++; this.count = 0; }
    return hlcString({ ms: this.ms, count: this.count, replica: this.replica });
  }

  /** another replica's time, seen: what this clock makes next comes after it */
  observe(h: string) {
    const p = parseHlc(h);
    if (p && (p.ms > this.ms || (p.ms === this.ms && p.count > this.count))) { this.ms = p.ms; this.count = p.count; }
  }
}
