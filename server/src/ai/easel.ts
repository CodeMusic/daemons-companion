// C-338 (the user, 2026-11-11: "a new daemon routine ... you prompt ... that pipeline will result in an image, like the
// daemon painted it ... each painting would also have a title"; by choice: "Its own style"): what a daemon paints and
// how. A STYLE, as a voice is (ai/voices.ts): its type gives the medium and palette -- the family resemblance -- its
// species a touch of its own (brush, framing, light, colour key: 8 x 4 x 5 x 8 = 1280, dealt as ownVoice is), and how it
// feels shades the colours. The request, the persona of the day (persona.ts) and the style go to the house's mind, which
// answers as the daemon with a TITLE, the SCENE it will paint, and a line ABOUT it; the scene in the style goes to the
// image model (FLUX.2 klein 4B on roverbyteseer's ComfyUI, the graph tools/spriteforge.py drives). Every word DRAFT.
// No node: imports (fetch only), so it runs wherever the hub does.
import type { Feelings } from "../feelings.js";

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

export const paintAsk = (persona: string, request: string, style: string) =>
  `Who you are today:\n${persona}\n\nYou paint in this style: ${style}.\n\nYou were asked to paint: ${request.trim()}`;

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
export const imagePromptOf = (scene: string, style: string) =>
  `A painting on canvas, ${style}. ${scene} Hand-painted, visible texture of the paint, no text, no letters, no signature.`;

// --- the image model: FLUX.2 klein 4B through ComfyUI (tools/spriteforge.py graph_klein, node for node) ---
export const KLEIN = { unet: "flux-2-klein-4b.safetensors", clip: "qwen_3_4b.safetensors", vae: "flux2-vae.safetensors", steps: 4, cfg: 1.0 };

export function kleinGraph(prompt: string, seed: number, w = 768, h = 768): Record<string, unknown> {
  const cond = ["4", 0];
  return {
    "1": { class_type: "UNETLoader", inputs: { unet_name: KLEIN.unet, weight_dtype: "default" } },
    "2": { class_type: "CLIPLoader", inputs: { clip_name: KLEIN.clip, type: "flux2" } },
    "3": { class_type: "VAELoader", inputs: { vae_name: KLEIN.vae } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["2", 0] } },
    "5": { class_type: "ConditioningZeroOut", inputs: { conditioning: cond } },
    "6": { class_type: "CFGGuider", inputs: { model: ["1", 0], positive: cond, negative: ["5", 0], cfg: KLEIN.cfg } },
    "9": { class_type: "EmptyFlux2LatentImage", inputs: { width: w, height: h, batch_size: 1 } },
    "10": { class_type: "Flux2Scheduler", inputs: { steps: KLEIN.steps, width: w, height: h } },
    "11": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
    "12": { class_type: "RandomNoise", inputs: { noise_seed: seed } },
    "13": { class_type: "SamplerCustomAdvanced", inputs: { noise: ["12", 0], guider: ["6", 0], sampler: ["11", 0], sigmas: ["10", 0], latent_image: ["9", 0] } },
    "14": { class_type: "VAEDecode", inputs: { samples: ["13", 0], vae: ["3", 0] } },
    "15": { class_type: "SaveImage", inputs: { images: ["14", 0], filename_prefix: "daemons-easel" } },
  };
}

export const EASEL_HOST = "http://roverbyteseer:8008";
export const PAINT_MOST_MS = 6 * 60_000;   // the model's first painting after a rest includes loading it (about 100 s)

// The painting as PNG bytes, or a thrown reason. `wait` is how long between looks (tests make it short)
export async function comfyPaint(host: string, prompt: string, seed: number, f: typeof fetch = fetch,
                                 signal?: AbortSignal, wait = 2000): Promise<Uint8Array> {
  const base = host.replace(/\/+$/, "");
  const sent = await f(`${base}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, signal,
                                           body: JSON.stringify({ prompt: kleinGraph(prompt, seed), client_id: "daemons-easel" }) });
  if (!sent.ok) throw new Error(`the easel refused (${sent.status})`);
  const id = String(((await sent.json()) as { prompt_id?: string }).prompt_id ?? "");
  if (!id) throw new Error("the easel gave no ticket");
  const t0 = Date.now();
  for (;;) {
    if (signal?.aborted) throw new Error("stopped");
    if (Date.now() - t0 > PAINT_MOST_MS) throw new Error("the easel took too long");
    const h = (await (await f(`${base}/history/${id}`, { signal })).json()) as Record<string, any>;
    const run = h[id];
    if (run?.status?.status_str === "error") throw new Error("the easel could not paint it");
    const img = run?.outputs ? Object.values(run.outputs as Record<string, { images?: any[] }>).flatMap((o) => o.images ?? [])[0] : null;
    if (img) {
      const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder ?? "", type: img.type ?? "output" });
      const png = await f(`${base}/view?${q}`, { signal });
      if (!png.ok) throw new Error("the painting could not be fetched");
      return new Uint8Array(await png.arrayBuffer());
    }
    await new Promise((r) => setTimeout(r, wait));
  }
}
