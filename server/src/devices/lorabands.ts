// C-175 (the user, 2026-10-21: "since all these devices might have different lora versions, they should all have
// support"): every board says its LoRa chip and the band it is on ("SX1262 868", net.cpp's routines report), and the
// site says when two of them cannot hear each other. Boards on the sub-GHz chips hear each other only on the same band;
// an SX1280 is on 2.4 GHz and hears only another SX1280. No node: imports -- core.ts reaches this on the phone.
export type LoraRadio = { chip: string; band: number };
export function parseLoraRadio(v: unknown): LoraRadio | null {
  const m = typeof v === "string" ? /^([A-Z0-9]{4,8}) (\d{3,4})$/.exec(v.trim()) : null;
  return m ? { chip: m[1], band: Number(m[2]) } : null;
}
// The band each board is on, and -- when they are not all on one -- the sentence that says so (DRAFT), else null.
export function loraApart(boards: { id: string; radio: LoraRadio | null }[], name: (id: string) => string = (id) => id): string | null {
  const known = boards.filter((b) => b.radio);
  const bands = [...new Set(known.map((b) => b.radio!.band))].sort((a, b) => a - b);
  if (bands.length < 2) return null;
  const on = bands.map((band) => `${known.filter((b) => b.radio!.band === band).map((b) => name(b.id)).join(", ")} on ${band === 2400 ? "2.4 GHz" : `${band} MHz`}`);
  return `${on.join("; ")}: boards on different bands cannot hear each other.`;   // DRAFT
}
