// C-249 (the user, 2026-11-03: "if someone has tiiny set up, that generally will be used for all the local-cloud ai
// options"): the house's AI work goes to the Tiiny first whenever one is set up and answering -- every talk, every
// write-up, every hearing and every voice the House does (the INDEX read aloud, the GUIDE, meetings, dreams, commands)
// -- and to the house's own boards, as before, when it is away, silent or fails. One place, so no caller is missed.
//
// The House is wrapped, not rewritten: its methods are kept and called on any failure. No node: imports.
import { GUIDE_SETUP, guideQuestion } from "../guideask.js";
import type { House, TalkAnswer, TalkAsk } from "./house.js";
import { persona } from "./house.js";
import { STOPPED, tiinyChat, tiinyHear, tiinySpeak, type TiinyAt, type WriteJob } from "./tiiny.js";
import { voiceRecipe } from "./voices.js";
import { chatOn, type EndpointNow } from "./endpoints.js";   // C-280 (1)

export type TiinyNow = () => { at: TiinyAt; model: string; quick?: string } | null;   // null: not set up, or not answering now
// model: the background thinker; quick: the foreground one (tiiny.ts), the background one when not given

// The INDEX's own voice, said to a voice-design model -- DRAFT, a trainer's own (voice.recipe.index) used whole
export const INDEX_VOICE = "a calm, clear, measured narrator's voice, warm and precise, like a gentle museum guide reading " +
  "an entry aloud; unhurried, every word distinct";
// C-303 (the user, 2026-11-06: "a voice described to it like our index voice (robotic glitchy etc)"): an INDEX ENTRY is
// read by the device -- the record is an instrument's, and it sounds like one. Books, pages and dreams keep the reader
// above; only an entry is read in this. DRAFT, a trainer's own (voice.recipe.entry) used whole
export const ENTRY_VOICE = "a synthetic, robotic device voice: flat, precise and even, with a clipped electronic tone and " +
  "small digital glitches and stutters now and then, like a handheld scanner reading a record aloud; no warmth, every word distinct";

// C-280 (1): the player's ENDPOINTS follow the Tiiny, in the order given, before the boards -- each one more mind in the
// chain. homeOnly: THE MIND's "only at home" ring (C-307), which skips any endpoint off the house's networks.
export type EndpointsNow = (homeOnly: boolean) => EndpointNow[];

export function preferTiiny(house: House, now: TiinyNow, indexRecipe: () => string = () => INDEX_VOICE,
                            others: EndpointsNow = () => []): House {
  const was = { talk: house.talk.bind(house), voice: house.voice.bind(house), transcribe: house.transcribe.bind(house),
                write: house.write.bind(house) };
  const anyWas = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(house), "any")!.get!.bind(house);
  Object.defineProperty(house, "any", { get: () => anyWas() || !!now() || others(false).length > 0 });

  house.talk = async (a: TalkAsk, deadlineMs?: number | null): Promise<TalkAnswer> => {
    const t = now(), eps = others(!!a.home);
    if (t || eps.length) try {
      const heard = !a.text?.trim() && a.wav ? (t?.at.asr ? await tiinyHear(t.at, a.wav) : null) ?? await was.transcribe(a.wav) : null;
      const text = (a.text?.trim() || heard || "").trim();
      if (text) {
        const system = a.fixed ? a.fixed.setup : a.guide ? GUIDE_SETUP : persona(a, text, true);   // C-303: the record and its own telling, both
        const said = a.fixed ? a.fixed.question : a.guide ? guideQuestion(a.guide(text, 700), text, a.book) : text;
        const history = a.fixed || a.guide ? [] : a.history, most = a.guide ? 220 : 90;
        const recipe = a.voice || voiceRecipe({ types: a.daemon.types, category: a.daemon.category });
        // the foreground: someone is waiting -- the quick thinker, thinking off; then each endpoint in turn
        const minds: { provider: string; ask: () => Promise<string> }[] = [
          ...(t ? [{ provider: `tiiny:${t.quick || t.model}`, ask: () => tiinyChat(t.at, t.quick || t.model, system, history, said, fetch, 30_000, most) }] : []),
          ...eps.map((n) => ({ provider: `endpoint:${n.e.name}:${n.model}`, ask: () => chatOn(n.e, n.model, system, history, said, fetch, 30_000, most) })),
        ];
        for (const m of minds) {
          const start = Date.now();
          let answer: string;
          try { answer = await m.ask(); } catch { continue; }
          // the Tiiny's voice if it has one; an endpoint's words said by the house (the Tiiny's voice first, then a board's)
          const v = !a.speak ? null : m.provider.startsWith("tiiny:") ? (t?.at.tts ? await tiinySpeak(t.at, answer, recipe) : null)
                                    : await house.voice(answer, recipe).catch(() => null);
          return { answer, heard, audio: v?.audio ?? null, provider: m.provider, firstMs: Date.now() - start };
        }
      }
    } catch { /* the house's boards, as before */ }
    return was.talk(a, deadlineMs);
  };
  // C-303: a reading is in the INDEX's voice unless it comes with a recipe -- a daemon telling of itself, in its own
  house.voice = async (text: string, recipe?: string) => {
    const t = now();
    if (t?.at.tts) { const v = await tiinySpeak(t.at, text, recipe || indexRecipe()); if (v) return { audio: v.audio, provider: `tiiny:${t.at.tts}` }; }
    return was.voice(text, recipe);
  };
  house.transcribe = async (wav: Uint8Array) => {
    const t = now();
    if (t?.at.asr) { const heard = await tiinyHear(t.at, wav, fetch, 120_000); if (heard) return heard; }
    return was.transcribe(wav);
  };
  house.write = async (system: string, user: string, maxTokens = 400, job?: WriteJob) => {
    const t = now();
    // C-319 next: stopped from THE MIND AT WORK -- no other mind is asked; job.by names each mind as it is tried
    const halt = () => { if (job?.signal?.aborted) throw new Error(STOPPED); };
    // the background: a write-up nobody stands waiting for -- the big thinker, thinking on, minutes allowed
    if (t) try { job?.by?.("the Tiiny"); return await tiinyChat(t.at, t.model, system, [], user, fetch, 300_000, maxTokens, true, false, job); } catch { halt(); }
    for (const n of others(false))                             // C-280 (1): no thinking budget asked of a stranger's model
      try { job?.by?.(n.e.name); return await chatOn(n.e, n.model, system, [], user, fetch, 120_000, maxTokens, false, job); } catch { halt(); }
    halt(); job?.by?.("the house's module");
    return was.write(system, user, maxTokens, job);
  };
  return house;
}
