// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-554 (the user, 2026-11-24: "the main areas u can make any of these reveries, you select the type (human or daemon), u
// select the daemon to create it, an optional prompt for the sound, and optional prompt for style ... very similar to what
// we have and similar to the sing one"; "ai features for this one ... u can choose as many or few options"): the words of
// REVERIE's MAKE. A mind is asked for a DRIFT -- a timeline of beats -- from the sound you describe, named and lined in the
// voice of the daemon that makes it; what comes back is checked and held inside safe bounds before it is kept, and with
// no mind (or nothing usable) the kind's own drift from the library is used instead. The music's words come from the
// style you describe, the kind and the side, over the daemon's own sleep recipe (sleepsound.ts). MIND only: it never
// calls a model -- api.ts hands it what a mind said. Every word DRAFT.
import type { DriftFile } from "./drift.js";

export type ReverieKind = "sleep" | "meditation" | "nature" | "tinctures";
export type ReverieSide = "you" | "daemon";
const KIND_WORDS: Record<ReverieKind, string> = {
  sleep: "toward sleep: the beat falls from alpha through theta into delta and stays low",
  meditation: "toward stillness: alpha and theta, awake and turned inward, rising gently at the end",
  nature: "an immersion in a place: alpha and theta moving like weather or water, never sharply",
  tinctures: "a state taken on for a while: any band, shaped to the feeling described, settling back near alpha at the end",
};
export const REVERIE_SYSTEM =
  "You design a binaural-beat drift for a relaxation app. Answer with one JSON object only, no other words: " +
  '{"name": "TWO TO FOUR WORDS IN CAPITALS", "line": "one sentence under 140 characters on what it does, in the speaker\'s voice", ' +
  '"minutes": 10 to 45, "carrierHz": 100 to 500, "scenes": [{"atSec": 0, "beatHz": 10}, ...]} -- 3 to 24 scenes, the first at 0 ' +
  "and the last at minutes x 60, beats between 0.5 and 45 Hz, changing gradually. Never name a drug or a medicine; never promise " +
  "to cure or treat anything.";

/** The ask: the kind, the side, the sound described (if any), and the daemon whose drift it is. */
export function reverieAsk(o: { kind: ReverieKind; side: ReverieSide; sound?: string | null; nickname?: string; entry?: string | null }): string {
  const who = o.nickname ? `You are ${o.nickname}${o.entry ? `, a daemon: ${o.entry.slice(0, 240)}` : ", a daemon"}. ` : "";
  const forWhom = o.side === "daemon" ? "It is for a daemon -- a mind that runs on a machine -- so name it the way a machine would."
                                      : "It is for the person who looks after you.";
  return `${who}Design a ${o.kind.toUpperCase()} drift, ${KIND_WORDS[o.kind]}. ${forWhom}` +
         (o.sound?.trim() ? ` It should feel like: ${o.sound.trim().slice(0, 300)}` : "");
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
// the words a drift may not carry (a TINCTURE is named for how it feels; nothing is a cure)
const NOT = /\b(cure|cures|treat|treats|treatment|heal|heals|medicine|medication|drug|drugs|dose|overdose)\b/i;
/** What a mind said, as a drift to keep -- or null when there is nothing usable in it. */
export function driftFromMind(text: string | null | undefined, o: { kind: ReverieKind; side: ReverieSide; id: string; by?: string; sound?: string | null; style?: string | null }): DriftFile | null {
  if (!text) return null;
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let a: { name?: unknown; line?: unknown; minutes?: unknown; carrierHz?: unknown; scenes?: unknown };
  try { a = JSON.parse(json); } catch { return null; }
  if (!Array.isArray(a.scenes)) return null;
  const minutes = clamp(Math.round(Number(a.minutes) || 20), 10, 45), end = minutes * 60;
  const raw = a.scenes.map((s: { atSec?: unknown; beatHz?: unknown }) => ({ atSec: Number(s?.atSec), beatHz: Number(s?.beatHz) }))
    .filter((s) => Number.isFinite(s.atSec) && Number.isFinite(s.beatHz)).slice(0, 24);
  if (raw.length < 2) return null;
  // its own times stretched onto the length it chose, in order, beats held within bounds
  const last = Math.max(...raw.map((s) => s.atSec)) || 1;
  const scenes = raw.map((s) => ({ atSec: Math.round(clamp(s.atSec / last, 0, 1) * end), beatHz: Math.round(clamp(s.beatHz, 0.5, 45) * 100) / 100 }))
    .sort((x, y) => x.atSec - y.atSec);
  scenes[0].atSec = 0; scenes[scenes.length - 1].atSec = end;
  const word = (x: unknown, n: number) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, n) : "");
  let name = word(a.name, 40).toUpperCase(), line = word(a.line, 160);
  if (!name || NOT.test(name)) name = o.side === "daemon" ? "A NEW ROUTINE" : "A NEW REVERIE";   // DRAFT
  if (NOT.test(line)) line = "";
  const d: DriftFile = {
    id: o.id, kind: o.kind, side: o.side,
    meta: { name, description: line, category: o.kind.toUpperCase(), strength: 1, durationSec: end },
    entrainment: { ramp: "linear", scenes },
    audio: { binaural: { carrierHz: Math.round(clamp(Number(a.carrierHz) || 200, 100, 500)) } },
    generation: { source: "mind", from: "REVERIE", by: o.by ?? null, sound: o.sound ?? null, style: o.style ?? null },
  };
  if (o.side === "daemon") {   // a daemon's sounds like a machine (C-553)
    d.machine = { wave: "square", glitch: { perSec: 0.6, level: 0.5 }, waver: { what: "beat", deltaHz: 0.5, periodSec: 8 } };
    d.audio!.isochronic = { level: 0.2, voice: "glitch" };
  }
  return d;
}

// the music's last words by kind and side, in place of sleep's (sleepsound.ts ALWAYS)
export const REVERIE_MUSIC: Record<ReverieKind, string> = {
  sleep: "instrumental, ambient sleep music, slow, soft, gentle, no drums, no vocals",
  meditation: "instrumental, ambient meditation music, slow drones, singing bowls, spacious, no drums, no vocals",
  nature: "immersive nature soundscape, field recording textures, gentle instrumental, no drums, no vocals",
  tinctures: "instrumental, hypnotic evolving texture, slowly building, no vocals",
};
export const DAEMON_MUSIC = "digital, glitchy, soft chiptune textures, circuit hum";
/** The style described, kept to music words (never markup, never too long). */
export const cleanStyle = (s: string | null | undefined) => (s ?? "").replace(/[^\w ,'-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
