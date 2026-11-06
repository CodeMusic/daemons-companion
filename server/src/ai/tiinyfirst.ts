// C-249 (the user, 2026-11-03: "if someone has tiiny set up, that generally will be used for all the local-cloud ai
// options"): the house's AI work goes to the Tiiny first whenever one is set up and answering -- every talk, every
// write-up, every hearing and every voice the House does (the INDEX read aloud, the GUIDE, meetings, dreams, commands)
// -- and to the house's own boards, as before, when it is away, silent or fails. One place, so no caller is missed.
//
// The House is wrapped, not rewritten: its methods are kept and called on any failure. No node: imports.
import { GUIDE_SETUP, guideQuestion } from "../guideask.js";
import type { House, TalkAnswer, TalkAsk } from "./house.js";
import { persona } from "./house.js";
import { tiinyChat, tiinyHear, tiinySpeak, type TiinyAt } from "./tiiny.js";
import { voiceRecipe } from "./voices.js";

export type TiinyNow = () => { at: TiinyAt; model: string; quick?: string } | null;   // null: not set up, or not answering now
// model: the background thinker; quick: the foreground one (tiiny.ts), the background one when not given

// The INDEX's own voice, said to a voice-design model -- DRAFT, a trainer's own (voice.recipe.index) used whole
export const INDEX_VOICE = "a calm, clear, measured narrator's voice, warm and precise, like a gentle museum guide reading " +
  "an entry aloud; unhurried, every word distinct";

export function preferTiiny(house: House, now: TiinyNow, indexRecipe: () => string = () => INDEX_VOICE): House {
  const was = { talk: house.talk.bind(house), voice: house.voice.bind(house), transcribe: house.transcribe.bind(house),
                write: house.write.bind(house) };
  const anyWas = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(house), "any")!.get!.bind(house);
  Object.defineProperty(house, "any", { get: () => anyWas() || !!now() });

  house.talk = async (a: TalkAsk, deadlineMs?: number | null): Promise<TalkAnswer> => {
    const t = now();
    if (t) try {
      const heard = !a.text?.trim() && a.wav ? (t.at.asr ? await tiinyHear(t.at, a.wav) : null) ?? await was.transcribe(a.wav) : null;
      const text = (a.text?.trim() || heard || "").trim();
      if (text) {
        const system = a.fixed ? a.fixed.setup : a.guide ? GUIDE_SETUP : persona(a, text);
        const said = a.fixed ? a.fixed.question : a.guide ? guideQuestion(a.guide(text, 700), text, a.book) : text;
        const start = Date.now();
        // the foreground: someone is waiting -- the quick thinker, thinking off
        const answer = await tiinyChat(t.at, t.quick || t.model, system, a.fixed || a.guide ? [] : a.history, said, fetch, 30_000, a.guide ? 220 : 90);
        const v = a.speak ? await tiinySpeak(t.at, answer, voiceRecipe({ types: a.daemon.types, category: a.daemon.category })) : null;
        return { answer, heard, audio: v?.audio ?? null, provider: `tiiny:${t.quick || t.model}`, firstMs: Date.now() - start };
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
  house.write = async (system: string, user: string, maxTokens = 400) => {
    const t = now();
    // the background: a write-up nobody stands waiting for -- the big thinker, thinking on, minutes allowed
    if (t) try { return await tiinyChat(t.at, t.model, system, [], user, fetch, 300_000, maxTokens, true); } catch { /* the boards */ }
    return was.write(system, user, maxTokens);
  };
  return house;
}
