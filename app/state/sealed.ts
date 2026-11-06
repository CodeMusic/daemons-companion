// C-277: opening a book sealed in DAEMONS -- a zip kept, not deflated, under traditional ZipCrypto (tools/bookaudio.py
// seals THE HERMETIC LAYER's recording with `zip -0 -P`, as tools/bookpdf.py seals the vault). Its key is never written
// anywhere: it is the author's name as the book's own warning gives it ("... read it"; it was "... set it down"), in title
// case with a space, so only a device that holds the book can open its recording. The dawn half's and THE UNITY BOOK's
// recordings are sealed too, each with its own book's key (C-299, the user 2026-11-05): keyOfBook, below. Plain code, no React Native, so a test can run it.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc = (c: number, b: number) => (TABLE[(c ^ b) & 0xff] ^ (c >>> 8)) >>> 0;

// the keys: read from each torn book's own first entry (server/src/bookkeys.ts, where a test can reach them)
export { keyOfBook, keyOfWarning, type TornBook } from "../../server/src/bookkeys";

// Every file in the zip, opened with the key: { name: bytes }. Throws "wrong key" before any bytes are kept, or when a
// file's CRC does not match. `rest` is given the chance to breathe between pieces, so a phone's screen keeps moving.
export async function unseal(zip: Uint8Array, key: string, rest: () => Promise<void> = async () => {}): Promise<Record<string, Uint8Array>> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const out: Record<string, Uint8Array> = {};
  // the central directory says where each file is and how big (a sealed file's own header may leave that to the end)
  let end = zip.length - 22;
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("That is not a zip.");
  let c = v.getUint32(end + 16, true);
  for (let n = v.getUint16(end + 10, true); n > 0; n--) {
    if (v.getUint32(c, true) !== 0x02014b50) throw new Error("The zip's directory is broken.");
    const flags = v.getUint16(c + 8, true), method = v.getUint16(c + 10, true), time = v.getUint16(c + 12, true);
    const sum = v.getUint32(c + 16, true), size = v.getUint32(c + 20, true);
    const nameLen = v.getUint16(c + 28, true), local = v.getUint32(c + 42, true);
    const name = String.fromCharCode(...zip.subarray(c + 46, c + 46 + nameLen));
    c += 46 + nameLen + v.getUint16(c + 30, true) + v.getUint16(c + 32, true);
    const at = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (!(flags & 1)) throw new Error(`${name} is not sealed.`);
    if (method !== 0) throw new Error(`${name} is deflated; only a kept one opens here.`);
    let k0 = 0x12345678, k1 = 0x23456789, k2 = 0x34567890;
    const step = (b: number) => {
      k0 = crc(k0, b);
      k1 = (Math.imul((k1 + (k0 & 0xff)) | 0, 134775813) + 1) >>> 0;
      k2 = crc(k2, k1 >>> 24);
    };
    for (const ch of key) step(ch.charCodeAt(0) & 0xff);
    const plain = new Uint8Array(size - 12);
    let check = 0xffffffff;
    for (let i = 0; i < size; i++) {
      const t = (k2 | 2) & 0xffff;
      const b = zip[at + i] ^ (((t * (t ^ 1)) >>> 8) & 0xff);
      step(b);
      if (i === 11 && b !== sum >>> 24 && b !== time >>> 8) throw new Error("wrong key");
      if (i >= 12) { plain[i - 12] = b; check = crc(check, b); }
      if ((i & 0xfffff) === 0xfffff) await rest();   // every megabyte
    }
    if (((check ^ 0xffffffff) >>> 0) !== sum) throw new Error(`${name} did not open whole.`);
    out[name] = plain;
  }
  return out;
}
