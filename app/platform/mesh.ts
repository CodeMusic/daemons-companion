// C-307 (the user, 2026-11-08: "like an octopus mind, where multiple different brains coalesce ... a mesh-network of
// processing potential"): THE MIND -- one mind made of every mind this phone can reach. The minds are its arms:
//   THIS PHONE   Apple's on-device model, hearing and voice (mind.ts) -- no network, no key
//   THE HUB      the companion, which keeps its own chain behind it (the Tiiny, its boards, n8n; server/src/api.ts talkOn)
//   AN ENDPOINT  any OpenAI-compatible model, called from this phone with the player's key (endpoint.ts)
// Each faculty is routed on its own: HEARD on the phone where it can (only words travel, never the recording), THOUGHT
// by the strongest mind the ring allows -- hedged: if it has not answered in HEDGE_MS, this phone answers and the late one
// is dropped -- and SAID in the hub's voice of the daemon where it can, else the phone's own.
// The RING says how far a kind of work may go: ANYWHERE, ONLY AT HOME (the hub and an endpoint at home; the hub keeps
// to its house and n8n's local model), ONLY THIS PHONE. The one talk is kept here, so changing mind keeps the thread.
// Every word DRAFT.
import * as SecureStore from "expo-secure-store";
import { ALONE, api, apiLater, apiLive, OFFLINE, ON_PHONE } from "./net";
import { canHear, canThink, hearHere, mindHere, sayHere, selfText, thinkHere } from "./mind";
import { atHome, endpoint, endpointThink } from "./endpoint";
import type { Spoken } from "../state/types";

export type Ring = "anywhere" | "home" | "phone";
export type Kind = "talk" | "guide";
export const RINGS: Record<Kind, Ring[]> = { talk: ["anywhere", "home", "phone"], guide: ["anywhere", "home"] };
export const HEDGE_MS = 4000;
const KEEP = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

// ---- the rings, kept on the phone ----
export async function ringOf(kind: Kind): Promise<Ring> {
  try {
    const r = await SecureStore.getItemAsync(`mind.ring.${kind}`);
    if (r && (RINGS[kind] as string[]).includes(r)) return r as Ring;
    if (kind === "talk" && (await SecureStore.getItemAsync("mind.thinker")) === "phone") return "phone";   // C-280's THIS PHONE
  } catch { /* the first ring */ }
  return "anywhere";
}
export async function setRing(kind: Kind, r: Ring) {
  await SecureStore.setItemAsync(`mind.ring.${kind}`, r, KEEP);
  if (kind === "talk") await SecureStore.deleteItemAsync("mind.thinker").catch(() => {});
}

// ---- sensing the arms ----
export type HubSense = { there: boolean; first?: "tiiny" | "module" | "n8n"; tiiny?: boolean; module?: boolean; n8n?: boolean };
export type Sense = { phone: { mind: boolean; hear: boolean; why?: string }; hub: HubSense;
                      endpoint: { set: boolean; name?: string; home?: boolean; model?: string } };
let hubSeen: { at: number; s: HubSense } | null = null;
const within = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error("no answer in time")), ms))]);

export async function senseHub(fresh = false): Promise<HubSense> {
  if (ALONE) return { there: false };                          // the site is served by the hub itself
  if (!fresh && hubSeen && Date.now() - hubSeen.at < 60_000) return hubSeen.s;
  let s: HubSense;
  try {
    const t = await within(apiLive<{ first?: "tiiny" | "module" | "n8n"; connected?: boolean;
      health?: { tiiny?: { ok: boolean } | null; modules?: { ok: boolean }[]; n8n?: { ok: boolean } | null } }>("/api/talk/settings"), 3000);
    s = { there: true, first: t.first, tiiny: !!t.health?.tiiny?.ok, module: !!t.health?.modules?.some((m) => m.ok), n8n: !!t.health?.n8n?.ok };
  } catch { s = { there: false }; }
  hubSeen = { at: Date.now(), s };
  return s;
}
export async function sense(fresh = false): Promise<Sense> {
  const [can, hub, e] = await Promise.all([canThink(), senseHub(fresh), endpoint()]);
  return { phone: { mind: mindHere() && can.mind, hear: canHear(), why: can.why }, hub,
           endpoint: e ? { set: true, name: e.name || "your endpoint", home: atHome(e.url), model: e.model } : { set: false } };   // DRAFT
}

// ---- a mind's answer, and who it came from ----
type Thought = { answer: string; by: string; heard?: string | null };
const hubBy = (provider?: string | null) => {
  const p = String(provider ?? "");
  return p.startsWith("tiiny") ? "the Tiiny" : /module|house|board|llm/i.test(p) ? "the hub's board"
       : /openrouter/i.test(p) ? "OpenRouter" : /local/i.test(p) ? "the hub's own model" : "the hub";   // DRAFT
};
// who the hub will most likely think with, by what it says answers first -- for its recent speed
const hubLikely = (h: HubSense) => h.first === "tiiny" && h.tiiny ? "the Tiiny" : h.first === "module" ? "the hub's board" : "the hub's own model";

// each mind's recent speed of thought (the hub's /api/mind, every phone's traces), read once a minute
let speedSeen: { at: number; s: Record<string, { ms: number; n: number }> } | null = null;
async function recentSpeeds(): Promise<Record<string, { ms: number; n: number }>> {
  if (speedSeen && Date.now() - speedSeen.at < 60_000) return speedSeen.s;
  let s: Record<string, { ms: number; n: number }> = {};
  try { s = (await within(apiLive<{ speeds?: typeof s }>("/api/mind"), 2500)).speeds ?? {}; } catch { /* an older hub, or none */ }
  speedSeen = { at: Date.now(), s };
  return s;
}

// the first of several to succeed (Promise.any, written out)
function firstOf<T>(ps: Promise<T>[]): Promise<T> {
  return new Promise((yes, no) => {
    let left = ps.length, last: unknown;
    ps.forEach((p) => p.then(yes, (e) => { last = e; if (--left === 0) no(last); }));
  });
}
type Hedged = Thought & { covered?: boolean; failed: string[] };
// The arms in order, each tried when the one before fails; the phone covering if the chain is late or fails.
// slow: the first arm has been slower than the budget lately -- the phone starts at once rather than at half the budget
async function hedge(arms: { name: string; go: () => Promise<Thought> }[], cover: (() => Promise<Thought>) | null, slow = false): Promise<Hedged> {
  const failed: string[] = [];
  if (!arms.length && cover) return { ...await cover(), failed };
  const chain = (async () => {
    let last: unknown = new Error("No mind could be reached.");   // DRAFT
    for (const a of arms) { try { return await a.go(); } catch (e) { last = e; failed.push(a.name); } }
    throw last;
  })();
  if (!cover) return { ...await chain, failed };
  let covering: Promise<Thought> | null = null;
  const startCover = () => {                                   // a cover not needed in the end is let go quietly
    if (!covering) { covering = cover(); covering.catch(() => {}); }
    return covering;
  };
  const warm = setTimeout(startCover, slow ? 0 : HEDGE_MS / 2); // started early, so it is ready when the budget runs out
  const first = await Promise.race([chain.then((r) => ({ r }), (e) => ({ e })),
                                    new Promise<null>((ok) => setTimeout(() => ok(null), HEDGE_MS))]);
  clearTimeout(warm);
  if (first && "r" in first) return { ...first.r, failed };
  const covered = (t: Thought) => ({ ...t, covered: t.by === "this phone", failed });
  if (first && "e" in first) return covered(await startCover());
  return covered(await firstOf([chain, startCover()]));       // late: whichever answers now
}

// ---- one talk ----
export type Trail = { heard?: string; thought?: string; said?: string };
export type MeshSpoken = Spoken & { trail: Trail; ring: Ring; covered?: boolean; failed?: string[]; ms: { hear?: number; think?: number; voice?: number };
                                    voice: Promise<{ audioBase64?: string | null; voiced?: boolean } | null> };
const threads: Record<Kind, { said: string; answer: string }[]> = { talk: [], guide: [] };   // each kind's talk so far, whichever mind answered each turn

export async function meshTalk(o: { kind: Kind; name: string; recording?: string; audioBase64?: () => Promise<string>;
                                    audioMime?: string; text?: string }): Promise<MeshSpoken> {
  const [ring, s, sp] = await Promise.all([ON_PHONE ? ringOf(o.kind) : Promise.resolve<Ring>("anywhere"), sense(), recentSpeeds()]);
  const hubOk = s.hub.there && ring !== "phone" && !OFFLINE;
  const trail: Trail = {}, ms: MeshSpoken["ms"] = {};
  const clock = () => { const t0 = Date.now(); return () => Date.now() - t0; };
  if (ring === "phone" && !s.phone.mind)
    throw new Error(`This phone cannot think for itself: ${s.phone.why ?? "it needs iOS 26 and Apple Intelligence"}.`);   // DRAFT
  if (o.kind === "guide" && !hubOk) throw new Error("Asking the GUIDE needs the hub: its pages are kept there.");   // DRAFT

  // HEARD: on the phone where it can, else the hub hears the recording itself
  let said = o.text?.trim() ?? "";
  if (!said && o.recording && s.phone.hear) {
    const took = clock();
    try { said = await hearHere(o.recording); trail.heard = "here"; ms.hear = took(); } catch { /* the hub, below */ }
    if (!said && trail.heard) return { error: "Nothing was heard. Hold, speak, then let go.", trail, ring, ms, voice: Promise.resolve(null) };   // DRAFT
  }
  if (!said && (ring === "phone" || !hubOk)) throw new Error("Nothing could hear it: this phone cannot, and the hub is out of reach.");   // DRAFT

  // THOUGHT: the arms the ring allows, strongest first; this phone covers
  const history = threads[o.kind].slice(-4), talked = threads[o.kind];
  const askHub = async (): Promise<Thought> => {
    const body: Record<string, unknown> = { ...(history.length ? { history } : {}), speak: false, ring, ...(o.kind === "guide" ? { guide: true } : {}) };
    if (said) body.text = said; else { body.audioBase64 = await o.audioBase64!(); body.audioMime = o.audioMime ?? "audio/mp4"; trail.heard = "by the hub"; }   // DRAFT
    const r = await apiLater<Spoken>("/api/ai/talk", body);
    if (r.error || !r.answer) throw new Error(r.error ?? "The hub answered nothing.");   // DRAFT
    return { answer: r.answer, by: hubBy(r.provider), heard: r.heard };
  };
  const endpointOk = s.endpoint.set && o.kind === "talk" && (ring === "anywhere" || (ring === "home" && !!s.endpoint.home));
  const askEndpoint = async (): Promise<Thought> =>
    ({ answer: await endpointThink(await selfText(o.name, "day"), history, said), by: s.endpoint.name ?? "your endpoint" });
  const askPhone = async (): Promise<Thought> => ({ answer: await thinkHere(await selfText(o.name), history, said), by: "this phone" });   // DRAFT

  const arms: { tier: number; name: string; go: () => Promise<Thought> }[] = [];
  if (hubOk) arms.push({ tier: s.hub.first === "tiiny" && s.hub.tiiny ? 3 : 2, name: hubLikely(s.hub), go: askHub });
  if (endpointOk && said) arms.push({ tier: 3, name: s.endpoint.name ?? "your endpoint", go: askEndpoint });
  arms.sort((a, b) => b.tier - a.tier);                         // stable: the hub before an endpoint of the same strength
  const cover = s.phone.mind && o.kind === "talk" && said ? askPhone : null;
  const slow = !!arms[0] && (sp[arms[0].name]?.ms ?? 0) > HEDGE_MS;   // lately slower than the budget
  const thinking = clock();
  const t: Hedged = ring === "phone" ? { ...await askPhone(), failed: [] } : await hedge(arms, cover, slow);
  ms.think = thinking();
  trail.thought = t.by;
  const heard = said || t.heard || null;
  if (heard) talked.push({ said: heard, answer: t.answer });
  if (talked.length > 12) talked.splice(0, talked.length - 12);

  // SAID: the daemon's own voice from the hub where the ring allows, else this phone's
  const voicing = clock();
  const voice = (async () => {
    let v: { audioBase64?: string | null; voiced?: boolean } | null = null;
    if (hubOk) {
      try {
        const r = await apiLater<Spoken>("/api/ai/speak", { text: t.answer, ring, ...(o.kind === "guide" ? { reader: true } : { daemon: true }) });
        if (r.audioBase64) { trail.said = "by the hub"; v = { audioBase64: r.audioBase64 }; }   // DRAFT
      } catch { /* the phone's voice */ }
    }
    if (!v && mindHere()) { sayHere(t.answer); trail.said = "here"; v = { voiced: true }; }
    ms.voice = voicing();
    // the trace, for THE MIND's RECENT THOUGHTS on every phone and the site -- where and how long, never what was said
    api("/api/mind/trace" + (ON_PHONE ? "" : "?from=site"), { kind: o.kind, ring, ...trail, ms, covered: t.covered, failed: t.failed }).catch(() => {});
    speedSeen = null;
    return v;
  })();
  return { heard, answer: t.answer, provider: t.by, trail, ring, ms, covered: t.covered, failed: t.failed, voice };
}

// "heard here · thought on the Tiiny · said by the hub"
export function trailSaid(t: Trail): string {
  const on = (w?: string) => (w === "here" ? "here" : w ? (w.startsWith("by ") ? w : `on ${w}`) : "");
  return [t.heard && `heard ${on(t.heard)}`, t.thought && `thought ${t.thought === "this phone" ? "here" : on(t.thought)}`,
          t.said && `said ${on(t.said)}`].filter(Boolean).join(" · ");   // DRAFT
}
