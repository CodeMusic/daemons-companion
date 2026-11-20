// C-429: PRAXIS runs on the phone too (C-111) -- no node:*, no fs, and nothing imported from the companion.
// Ids (PROJECTS.md 4.5). Every record's id is a UUIDv7: made anywhere, offline, without asking, and in time order. An
// id that two places must make alike -- an award for one finish, an accepted proposal's change -- is derived instead: a
// UUIDv8 from a SHA-256 of what it names, so two phones that never spoke make the same one. The SHA-256 is written out
// here because the phone has no node:crypto, and an id derived differently on the phone and the hub would not collapse.

/** fills a buffer with random bytes */
export type Random = (bytes: Uint8Array) => void;

/** the platform's crypto when it has one (Node, the web, a phone with a getRandomValues polyfill); Math.random when not.
 *  A UUIDv7's random bits only have to keep two ids made in one millisecond apart, so the fallback is enough for that. */
export const cryptoRandom: Random = (b) => {
  const c = (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) { c.getRandomValues(b); return; }
  for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
};

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
const uuidOf = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < 16; i++) s += (i === 4 || i === 6 || i === 8 || i === 10 ? "-" : "") + HEX[b[i]];
  return s;
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A maker of UUIDv7s (RFC 9562): 48 bits of milliseconds, then 12 bits that count up within one millisecond (method 1,
 *  so ids made in a burst stay in order), then 62 random bits. */
export function uuidv7(now: () => number = Date.now, random: Random = cryptoRandom): () => string {
  let last = -1, seq = 0;
  const one = new Uint8Array(2);
  const fresh = () => { random(one); return ((one[0] << 8) | one[1]) & 0x3ff; };   // room above for a burst
  return () => {
    let ms = Math.max(Math.floor(now()), last);
    if (ms === last) { if (++seq > 0xfff) { ms = last + 1; seq = fresh(); } }
    else seq = fresh();
    last = ms;
    const b = new Uint8Array(16);
    random(b);
    for (let i = 5, t = ms; i >= 0; i--, t = Math.floor(t / 256)) b[i] = t % 256;
    b[6] = 0x70 | (seq >> 8);
    b[7] = seq & 0xff;
    b[8] = 0x80 | (b[8] & 0x3f);
    return uuidOf(b);
  };
}

/** when a UUIDv7 was made, in ms */
export const uuidTime = (id: string) => parseInt(id.slice(0, 8) + id.slice(9, 13), 16);

/** a string's UTF-8 bytes (TextEncoder is not on every engine the app runs on) */
export function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** SHA-256 (FIPS 180-4) */
export function sha256(data: Uint8Array | string): Uint8Array {
  const m = typeof data === "string" ? utf8(data) : data;
  const blocks = Math.ceil((m.length + 9) / 64);
  const p = new Uint8Array(blocks * 64);
  p.set(m);
  p[m.length] = 0x80;
  const bits = m.length * 8;
  const at = p.length - 8;
  for (let i = 0, hi = Math.floor(bits / 2 ** 32); i < 4; i++) p[at + i] = (hi >>> (24 - 8 * i)) & 0xff;
  for (let i = 0; i < 4; i++) p[at + 4 + i] = (bits >>> (24 - 8 * i)) & 0xff;
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array<number>(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < 16; i++) {
      const o = b * 64 + i * 4;
      w[i] = (p[o] << 24) | (p[o + 1] << 16) | (p[o + 2] << 8) | p[o + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, bb, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + bb) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  const out = new Uint8Array(32);
  h.forEach((x, i) => { out[i * 4] = x >>> 24; out[i * 4 + 1] = (x >>> 16) & 0xff; out[i * 4 + 2] = (x >>> 8) & 0xff; out[i * 4 + 3] = x & 0xff; });
  return out;
}

export const sha256hex = (data: Uint8Array | string) => Array.from(sha256(data), (x) => HEX[x]).join("");

/** An id made from what it names -- the same parts make the same id on every replica (a UUIDv8 over a SHA-256) */
export function derivedId(...parts: string[]): string {
  const b = sha256(["praxis", ...parts].join("\u0000")).slice(0, 16);
  b[6] = 0x80 | (b[6] & 0x0f);
  b[8] = 0x80 | (b[8] & 0x3f);
  return uuidOf(b);
}
