// The hub's only (it keeps files): never imported by core.ts or routes.ts.
// C-251 (the user, 2026-10-30: "text-to-speech with various voices for various creatures"; 2026-11-05: "each daemon should
// have their own voice"): FIXED LINES RENDERED AHEAD. A line the hub reads aloud again and again -- an INDEX entry on a
// board -- was made new by the Tiiny every time: four to six seconds of waiting, and (C-323) a new speaker each time, since
// its voice-design model makes one per request. So the Tiiny's reading of a fixed line is kept here, by its words, its
// recipe and the voices' generation, and said again from here at once and always in the same voice. The bank is filled
// as lines are read and, in the background, ahead of being asked (renderAhead): the INDEX entries the player has bound,
// one at a time, only while the Tiiny's voice is up and no music is being made. Only the Tiiny's voice is kept -- a
// fallback is never final (C-251's "final", api.ts readAloud).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BANK_MOST = 4000;   // lines kept; the oldest go first past this (about 400 MB of WAV at most)

export type Kept = { audio: Uint8Array; provider: string };

export class VoiceBank {
  constructor(readonly dir: string) { mkdirSync(dir, { recursive: true }); }
  static key(text: string, recipe: string, generation: string | number): string {
    return createHash("sha1").update(`${generation}\n${recipe}\n${text}`).digest("hex");
  }
  private file(key: string) { return join(this.dir, `${key}.wav`); }
  has(key: string): boolean { return existsSync(this.file(key)); }
  get(key: string): Kept | null {
    try {
      const audio = readFileSync(this.file(key));
      const provider = (() => { try { return readFileSync(`${this.file(key)}.by`, "utf8").trim(); } catch { return "tiiny:bank"; } })();
      return audio.length ? { audio, provider } : null;
    } catch { return null; }
  }
  put(key: string, audio: Uint8Array, provider: string) {
    if (!audio.length) return;
    const f = this.file(key);
    writeFileSync(`${f}.part`, audio);
    renameSync(`${f}.part`, f);
    writeFileSync(`${f}.by`, provider);
    this.trim();
  }
  size(): number { return readdirSync(this.dir).filter((n) => n.endsWith(".wav")).length; }
  private trim() {
    const names = readdirSync(this.dir).filter((n) => n.endsWith(".wav"));
    if (names.length <= BANK_MOST) return;
    const old = names.map((n) => ({ n, t: statSync(join(this.dir, n)).mtimeMs })).sort((a, b) => a.t - b.t);
    for (const { n } of old.slice(0, names.length - BANK_MOST)) {
      rmSync(join(this.dir, n), { force: true });
      rmSync(join(this.dir, `${n}.by`), { force: true });
    }
  }
}

export type AheadLine = { text: string; recipe: string };
export type AheadDeps = {
  bank: VoiceBank;
  generation: () => string | number;
  lines: () => AheadLine[];                                   // what to have ready, most wanted first
  ready: () => boolean;                                       // the Tiiny's voice up, and no music being made
  speak: (text: string, recipe: string) => Promise<Kept | null>;
  wait?: (ms: number) => Promise<unknown>;
  pauseMs?: number;
  most?: number;                                              // lines made in one round
};
// One round: every line not yet kept is made, one at a time; stops at the first failure or when the Tiiny is wanted
// for something else. The number made.
export async function renderAhead(d: AheadDeps): Promise<number> {
  const wait = d.wait ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let made = 0;
  for (const l of d.lines()) {
    if (made >= (d.most ?? 200)) break;
    const key = VoiceBank.key(l.text, l.recipe, d.generation());
    if (d.bank.has(key)) continue;
    if (!d.ready()) break;
    const v = await d.speak(l.text, l.recipe).catch(() => null);
    if (!v || !v.provider.startsWith("tiiny:")) break;          // only the Tiiny's voice is kept
    d.bank.put(key, v.audio, v.provider);
    made++;
    await wait(d.pauseMs ?? 2000);
  }
  return made;
}
