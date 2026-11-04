// C-251 (the user, 2026-10-30: "each daemon has a voice recipe that contains ... how the voice should sound"; 2026-11-03:
// "we downloaded the tts voice model that uses a description to make the voice"): a daemon's voice is a DESCRIPTION, said
// to a voice-design model (Qwen3-VoiceDesign on the Tiiny) with every line. The recipe, not a recording, is the source of
// truth, so a better voice model later speaks every daemon again from the same words.
//
// Its type gives the voice's character, its category a word of its own, and how it feels right now shades the delivery
// (feelings.ts: the feeling is never NAMED in what it says; it is only heard). A trainer may write a daemon's recipe
// themselves (the store's voice.recipe.<species>), and that is used whole. Every word here is DRAFT. No node: imports.
import type { Feelings } from "../feelings.js";

// One per type: how a daemon of it sounds -- DRAFT, the user's to rewrite
export const TYPE_VOICE: Record<string, string> = {
  CONTENT: "a warm, full, unhurried voice, rounded and generous, like someone telling you a story they love",
  LOGIC: "a clear, precise, evenly paced voice, crisp consonants, each word set down carefully",
  VECTOR: "a quick, bright, forward-leaning voice that always seems to be heading somewhere",
  CORRUPT: "a slightly rough, uneven voice that catches and skips, playful with an edge",
  STRATUM: "a low, layered, patient voice with a hint of echo, as if it comes from deep down",
  LEGACY: "an older, gentle, slightly crackly voice with old-fashioned courtesy",
  SWARM: "a busy, buzzing, light voice that sounds like several small voices speaking almost together",
  LATENT: "a soft, hushed, dreamy voice, slow to begin, as if just waking",
  ENTROPY: "a loose, drifting, carefree voice that wanders in pitch and pace",
  FLOW: "a smooth, flowing, musical voice with long easy phrases, like water",
  GROWTH: "a fresh, earnest, young voice, a little breathless with eagerness",
  SIGNAL: "a small, bright, clear voice that carries, with little rising questions",
  CONTEXT: "a thoughtful, attentive, mid-pitched voice that pauses to notice things",
  FROZEN: "a cool, still, quiet voice, very even, with long clean pauses",
  EMERGENT: "a curious, wondering voice that sounds surprised by its own words",
  ORACLE: "a calm, low, knowing voice, unhurried and a little mysterious",
  HARDENED: "a firm, steady, guarded voice, short phrases, kind underneath",
  OPAQUE: "a quiet, private, slightly muffled voice that gives little away",
};
export const DEFAULT_VOICE = "a small, bright, curious creature's voice, gentle and clear";

// How it feels shades how it speaks -- the delivery only, never a word said about it
export function moodOfVoice(f: Feelings | null | undefined): string {
  if (!f) return "";
  const afraid = Math.max(0, -(f.calm ?? 0));
  const strongest = ([["glad", f.glad], ["sad", f.sad], ["mad", f.mad], ["afraid", afraid], ["restless", f.restless ?? 0]] as [string, number][])
    .sort((a, b) => b[1] - a[1])[0];
  if (!strongest || strongest[1] < 30) return "";
  return { glad: "Right now it sounds happy and light, smiling as it speaks.",
           sad: "Right now it speaks a little slower and softer, subdued.",
           mad: "Right now it is clipped and a little sharp.",
           afraid: "Right now it is hesitant and quiet, a little shaky.",
           restless: "Right now it is quick and fidgety, hurrying its words." }[strongest[0]] ?? "";
}

export type VoiceOf = { types?: string[] | string; category?: string; name?: string; nickname?: string };

// The recipe said with each line: a trainer's own words if written, else its type's voice, its category, its mood
export function voiceRecipe(d: VoiceOf, feelings?: Feelings | null, own?: string | null): string {
  const mood = moodOfVoice(feelings);
  if (own && own.trim()) return [own.trim(), mood].filter(Boolean).join(" ");
  const types = (Array.isArray(d.types) ? d.types : String(d.types ?? "").split("/")).map((t) => t.trim().toUpperCase()).filter(Boolean);
  const base = TYPE_VOICE[types[0]] ?? DEFAULT_VOICE;
  const second = types[1] && TYPE_VOICE[types[1]] ? `, with a touch of ${TYPE_VOICE[types[1]].replace(/^an? /, "").split(",")[0]}` : "";
  const c = d.category?.toLowerCase(), cat = c ? ` It is ${/^[aeiou]/.test(c) ? "an" : "a"} ${c} creature.` : "";
  return `${base}${second}.${cat} Not a human adult: a small living creature.${mood ? " " + mood : ""}`;
}
