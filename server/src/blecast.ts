// C-141: a broadcast as Bluetooth pieces, the boards' own (firmware/esp32/src/broadcast.cpp sendPieces / takePiece) -- so the
// phone, which may advertise nothing but a service UUID, can say and hear what the boards say in the room. Node-free: the
// app imports it. A piece is 16 bytes written as a 128-bit service UUID:
//   DA E1  K|N|P  FROM(4)  ID(2)  7 bytes of the message      K the kind (2 bits), N the pieces less one (3), P this one (3)
// and the message: SPECIES(2), the name's length and the name (up to 10), for an answer the answered FROM(4) ID(2), then
// the word (up to 43) or the interaction's code. Up to eight pieces; docs/BROADCAST.md.
export type CastKind = "say" | "act" | "reply";
export interface BleCast { id: string; kind: CastKind; species: number; name: string; text?: string; act?: string; replyTo?: string }

const KIND: Record<CastKind, number> = { say: 1, act: 2, reply: 3 };
const KIND_OF = ["", "say", "act", "reply"] as const;
const BLE_TEXT = 43, MAX = 56;
const hex2 = (b: number) => b.toString(16).padStart(2, "0");
const ascii = (s: string) => [...s].map((ch) => ch.charCodeAt(0)).filter((c) => c >= 32 && c < 127);

export function uuidOf(b: Uint8Array | number[]): string {
  const h = Array.from(b, hex2).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
export function bytesOf(uuid: string): Uint8Array | null {
  const h = uuid.toLowerCase().replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/.test(h)) return null;
  return Uint8Array.from({ length: 16 }, (_, i) => parseInt(h.slice(i * 2, i * 2 + 2), 16));
}

export function toPieces(c: BleCast): string[] {
  const from = parseInt(c.id.slice(0, 8), 16), id = parseInt(c.id.slice(8, 12), 16);
  const msg: number[] = [(c.species >> 8) & 255, c.species & 255];
  const name = ascii(c.name).slice(0, 10);
  msg.push(name.length, ...name);
  if (c.kind === "reply") {
    const rf = parseInt((c.replyTo ?? "").slice(0, 8), 16) || 0, ri = parseInt((c.replyTo ?? "").slice(8, 12), 16) || 0;
    msg.push((rf >>> 24) & 255, (rf >>> 16) & 255, (rf >>> 8) & 255, rf & 255, (ri >> 8) & 255, ri & 255);
  }
  const body = ascii(c.kind === "say" ? c.text ?? "" : c.act ?? "").slice(0, c.kind === "say" ? BLE_TEXT : 8);
  for (const ch of body) if (msg.length < MAX) msg.push(ch);
  const count = Math.ceil(msg.length / 7);
  return Array.from({ length: count }, (_, p) => uuidOf([
    0xda, 0xe1, (KIND[c.kind] << 6) | ((count - 1) << 3) | p,
    (from >>> 24) & 255, (from >>> 16) & 255, (from >>> 8) & 255, from & 255, (id >> 8) & 255, id & 255,
    ...Array.from({ length: 7 }, (_, i) => msg[p * 7 + i] ?? 0),
  ]));
}

// Pieces heard in any order, each broadcast read once it is whole; one that never completes is let go after 30 s.
export class Gatherer {
  private open = new Map<string, { kind: number; count: number; got: number; msg: number[]; at: number }>();
  take(uuid: string, now = Date.now()): BleCast | null {
    for (const [k, g] of this.open) if (now - g.at > 30000) this.open.delete(k);
    const b = bytesOf(uuid);
    if (!b || b[0] !== 0xda || b[1] !== 0xe1) return null;
    const kind = b[2] >> 6, count = ((b[2] >> 3) & 7) + 1, part = b[2] & 7;
    if (!kind || part >= count) return null;
    const key = Array.from(b.slice(3, 9), hex2).join("");
    const g = this.open.get(key) ?? { kind, count, got: 0, msg: new Array(count * 7).fill(0), at: now };
    g.at = now;
    for (let i = 0; i < 7; i++) g.msg[part * 7 + i] = b[9 + i];
    g.got |= 1 << part;
    this.open.set(key, g);
    if (g.got !== (1 << g.count) - 1) return null;
    this.open.delete(key);
    const m = g.msg, len = g.count * 7;
    let n = 2;
    const species = (m[0] << 8) | m[1];
    const nl = Math.min(m[n++], 10);
    const name = String.fromCharCode(...m.slice(n, n + nl)); n += nl;
    let replyTo: string | undefined;
    if (g.kind === 3 && n + 6 <= len) { replyTo = m.slice(n, n + 6).map(hex2).join(""); n += 6; }
    let body = "";
    while (n < len && m[n]) { if (m[n] >= 32 && m[n] < 127) body += String.fromCharCode(m[n]); n++; }
    if (!body) return null;
    const k = KIND_OF[g.kind] as CastKind;
    return { id: key, kind: k, species, name: name || "A DAEMON", ...(k === "say" ? { text: body } : { act: body }), ...(replyTo ? { replyTo } : {}) };
  }
}
