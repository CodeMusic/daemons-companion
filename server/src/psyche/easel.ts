// C-338 (the user, 2026-11-11: "a new daemon routine ... you prompt ... that pipeline will result in an image, like the
// daemon painted it ... each painting would also have a title"; by choice: "Its own style"): what a daemon paints and
// how. A STYLE, as a voice is (ai/voices.ts): its type gives the medium and palette -- the family resemblance -- its
// species a touch of its own (brush, framing, light, colour key: 8 x 4 x 5 x 8 = 1280, dealt as ownVoice is), and how it
// feels shades the colours. The request, the persona of the day (persona.ts) and the style go to the house's mind, which
// answers as the daemon with a TITLE, the SCENE it will paint, and a line ABOUT it; the scene in the style goes to the
// image model (ai/comfy.ts: FLUX.2 klein 4B on roverbyteseer's ComfyUI). Every word DRAFT. No node: imports.
// C-387: this file is MIND -- the painter. The machine that paints is ai/comfy.ts, and api.ts joins them.
import type { Feelings } from "./feelings.js";

export const TYPE_STYLE: Record<string, string> = {
  CONTENT: "warm oil paint laid on generously, golden and rose tones, soft edges, a storybook richness",
  LOGIC: "clean gouache in precise flat shapes, ruled lines and careful geometry, a cool limited palette",
  VECTOR: "quick energetic acrylic strokes that all lean one way, bright primaries, a sense of motion",
  CORRUPT: "glitchy mixed media, torn paper and smeared paint, colours that skip and band, playful and rough",
  STRATUM: "heavy layered impasto in earth tones, paint built up in strata, deep shadows",
  LEGACY: "an old master's oil painting, varnished browns and deep greens, fine craquelure, candle-warm light",
  SWARM: "pointillism, thousands of tiny dots of bright colour that gather into shapes",
  LATENT: "soft pastel and chalk, hazy and half-remembered, edges dissolving into the paper",
  ENTROPY: "loose expressionist splashes and drips, colours running into each other, carefree",
  FLOW: "flowing watercolour, wet-on-wet blooms, blues and greens that bleed softly into white paper",
  GROWTH: "fresh botanical watercolour and ink, greens and spring colours, leaves in every corner",
  SIGNAL: "bright poster paint, bold outlines and high contrast, little radiating marks like signals",
  CONTEXT: "a thoughtful ink-and-wash study, notes and small details in the margins, muted naturals",
  FROZEN: "cool still tempera, pale blues and silvers, crisp edges and long empty spaces",
  EMERGENT: "surreal oil painting where shapes are just becoming other shapes, iridescent colour",
  ORACLE: "a mystical tempera panel, deep indigo and gold leaf, symbols half-hidden in the scene",
  HARDENED: "bold woodcut print, thick black lines, strong flat colour, sturdy and plain",
  OPAQUE: "dark muted encaustic, thick wax and smoky colour, much left in shadow",
};
export const DEFAULT_STYLE = "naive oil paint on canvas, thick visible brushstrokes, warm and curious";

const BRUSH = ["thick short dabs", "long sweeping strokes", "tiny careful marks", "scumbled dry-brush texture",
  "palette-knife slabs of paint", "swirling curls", "cross-hatched strokes", "soft blended gradients"];
const FRAMING = ["the subject small in a wide space", "the subject close and filling the canvas", "seen from a little below",
  "seen from high above"];
const LIGHT = ["lit from one low warm source", "in even daylight", "glowing from within", "at twilight", "backlit, with soft halos"];
const KEY = ["a touch of vermilion in every painting", "a hidden spot of turquoise", "violet in the shadows", "ochre warming everything",
  "one pure white highlight", "a thread of gold", "a whisper of pink", "deep ultramarine at the edges"];
export const TOUCHES = BRUSH.length * FRAMING.length * LIGHT.length * KEY.length;

// The species' own touch: a step coprime with 1280, so no two species below it share one
export function ownTouch(species: number | null | undefined): string {
  if (species == null || !Number.isInteger(species) || species < 0) return "";
  let i = (species * 797) % TOUCHES;
  const k = KEY[i % 8]; i = Math.floor(i / 8);
  const b = BRUSH[i % 8]; i = Math.floor(i / 8);
  const l = LIGHT[i % 5]; i = Math.floor(i / 5);
  return `painted in ${b}, ${FRAMING[i % 4]}, ${l}, with ${k}`;
}

// How it feels shades the colours, never names the feeling
export function moodOfPaint(f: Feelings | null | undefined): string {
  if (!f) return "";
  const afraid = Math.max(0, -(f.calm ?? 0));
  const top = ([["glad", f.glad], ["sad", f.sad], ["mad", f.mad], ["afraid", afraid], ["restless", f.restless ?? 0]] as [string, number][])
    .sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < 30) return "";
  return { glad: "sunny, light-filled colours", sad: "quiet greyed colours and soft rain-light", mad: "hot reds and hard edges",
           afraid: "small trembling marks and a darker ground", restless: "jittery broken strokes, never still" }[top[0]] ?? "";
}

export type Painter = { types?: string[] | string; species?: number | null; category?: string };

export function paintStyle(d: Painter, feelings?: Feelings | null, own?: string | null): string {
  const mood = moodOfPaint(feelings);
  if (own?.trim()) return [own.trim(), mood].filter(Boolean).join(", ");
  const types = (Array.isArray(d.types) ? d.types : String(d.types ?? "").split("/")).map((t) => t.trim().toUpperCase()).filter(Boolean);
  const base = TYPE_STYLE[types[0]] ?? DEFAULT_STYLE;
  const second = types[1] && TYPE_STYLE[types[1]] ? `, with something of ${TYPE_STYLE[types[1]].split(",")[0]}` : "";
  return [`${base}${second}`, ownTouch(d.species), mood].filter(Boolean).join("; ");
}

// --- the daemon decides what to paint ---
export const PAINT_SYSTEM =
  "You are a small creature who paints. You will be told who you are today and what you were asked to paint. Decide what " +
  "you will actually put on the canvas: the request, as you see it, coloured by your day, your feelings and your own way of " +
  "seeing. Never paint words or letters, and never paint a human; any figures are small animals or creatures. Answer with " +
  "JSON only, no other words: {\"title\": a short title for the painting, 2 to 6 words, \"scene\": one paragraph describing " +
  "exactly what is in the painting for a painter to follow, under 70 words, \"about\": one sentence in your own voice about " +
  "why you painted it this way, under 30 words}.";

// A thinker without room keeps the first 1000 characters of what it is asked (tiiny.ts), so the persona gives way, never
// the request or the style (C-359: a pronoun line pushed "the shed in the rain" past it)
export const PAINT_ASK_MOST = 1000;
export function paintAsk(persona: string, request: string, style: string): string {
  const tail = `\n\nYou paint in this style: ${style}.\n\nYou were asked to paint: ${request.trim()}`, head = "Who you are today:\n";
  const room = Math.max(0, PAINT_ASK_MOST - head.length - tail.length);
  const who = persona.length > room ? persona.slice(0, Math.max(0, room - 1)).trimEnd() + "\u2026" : persona;
  return `${head}${who}${tail}`;
}

export type Painted = { title: string; scene: string; about: string };

// The mind's answer as a painting's words; a mind that would not answer in JSON still gives its scene
export function readPainting(text: string | null | undefined, request: string): Painted {
  const raw = String(text ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const clean = (s: unknown, most: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, most);
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      const scene = clean(j.scene, 600);
      if (scene) return { title: clean(j.title, 60) || titleOf(request), scene, about: clean(j.about, 240) };
    } catch { /* below */ }
  }
  return { title: titleOf(request), scene: clean(raw || request, 600), about: "" };
}
export const titleOf = (request: string) => {
  const w = request.replace(/[^\p{L}\p{N}' ]/gu, " ").trim().split(/\s+/).slice(0, 5).join(" ");
  return w ? w.toUpperCase() : "UNTITLED";
};

// What the image model is told: the scene, in the daemon's style, as a painting on canvas
// C-386: and its colours, when given (ai/muse.ts paintPalette): the month's behind, the day's in the main form
export const imagePromptOf = (scene: string, style: string, palette?: string | null) =>
  `A painting on canvas, ${style}. ${scene}${palette ? ` Its colours: ${palette}.` : ""} Hand-painted, visible texture of the paint, no text, no letters, no signature.`;
