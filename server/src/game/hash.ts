// C-187: CRC32 and SHA-1 in plain TypeScript, to recognise the player's ROM and check what the patch made -- on the
// phone, where there is no node:crypto (a 16 MB ROM hashes in well under a second).
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export const crc32Hex = (b: Uint8Array) => crc32(b).toString(16).toUpperCase().padStart(8, "0");

export function sha1(b: Uint8Array): string {
  const n = b.length, words = ((n + 8) >>> 6) + 1, w = new Uint32Array(words * 16);
  for (let i = 0; i < n; i++) w[i >>> 2] |= b[i] << (24 - (i & 3) * 8);
  w[n >>> 2] |= 0x80 << (24 - (n & 3) * 8);
  w[words * 16 - 1] = (n * 8) >>> 0;
  w[words * 16 - 2] = Math.floor(n / 0x20000000);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const m = new Uint32Array(80);
  for (let blk = 0; blk < w.length; blk += 16) {
    for (let t = 0; t < 16; t++) m[t] = w[blk + t];
    for (let t = 16; t < 80; t++) { const x = m[t - 3] ^ m[t - 8] ^ m[t - 14] ^ m[t - 16]; m[t] = (x << 1) | (x >>> 31); }
    let a = h0, bb = h1, c = h2, d = h3, e = h4;
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? (bb & c) | (~bb & d) : t < 40 ? bb ^ c ^ d : t < 60 ? (bb & c) | (bb & d) | (c & d) : bb ^ c ^ d;
      const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const tmp = (((a << 5) | (a >>> 27)) + f + e + k + m[t]) >>> 0;
      e = d; d = c; c = (bb << 30) | (bb >>> 2); bb = a; a = tmp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + bb) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, "0")).join("");
}
