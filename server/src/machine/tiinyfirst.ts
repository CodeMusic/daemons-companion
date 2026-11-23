// C-249 (the user, 2026-11-03: "if someone has tiiny set up, that generally will be used for all the local-cloud ai
// options"): the house's AI work goes to the Tiiny first whenever one is set up and answering -- every talk, every
// write-up, every hearing and every voice the House does (the INDEX read aloud, the GUIDE, meetings, dreams, commands)
// -- and to the house's own boards, as before, when it is away, silent or fails. One place, so no caller is missed.
//
// The House is wrapped, not rewritten: its methods are kept and called on any failure. No node: imports.
import { hearAs } from "./hotwords.js";
import { GUIDE_SETUP, guideQuestion } from "../library/guideask.js";
import type { House, TalkAnswer, TalkAsk } from "./house.js";
import { persona } from "./house.js";
import { STOPPED, tiinyChat, tiinyHear, tiinySpeak, type TiinyAt, type WriteJob } from "./tiiny.js";
import { INDEX_VOICE, voiceRecipe } from "../ai/voices.js";   // C-387: the INDEX's voice is a character, kept with the others
import { chatOn, type EndpointNow } from "./endpoints.js";   // C-280 (1)
import { choose, MIND_POWER, order, think, type Mind, HEDGE_QUICK_MS } from "./thoughtroute.js";   // C-360; C-480

export type TiinyNow = () => { at: TiinyAt; model: string; quick?: string } | null;   // null: not set up, or not answering now
// model: the background thinker; quick: the foreground one (tiiny.ts), the background one when not given

// C-280 (1): the player's ENDPOINTS follow the Tiiny, in the order given, before the boards -- each one more mind in the
// chain. homeOnly: THE MIND's "only at home" ring (C-307), which skips any endpoint off the house's networks.
export type EndpointsNow = (homeOnly: boolean) => EndpointNow[];

// C-360: the household's phones that lend their thinking (THE MESH), each asked through the hub; and how many thoughts a
// mind holds now (THE MIND AT WORK's ledger), so a busy mind is passed for a freer one
export type PhonesNow = () => { name: string; ask: (system: string, user: string, most: number, signal?: AbortSignal) => Promise<string> }[];
export function preferTiiny(house: House, now: TiinyNow, indexRecipe: () => string = () => INDEX_VOICE,
                            others: EndpointsNow = () => [], phones: PhonesNow = () => [], holds: (mind: string) => number = () => 0,
                            choosing: () => boolean = () => false): House {   // C-480: THE MIND's "let the daemon choose its mind"
  const was = { talk: house.talk.bind(house), voice: house.voice.bind(house), transcribe: house.transcribe.bind(house),
                write: house.write.bind(house) };
  const anyWas = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(house), "any")!.get!.bind(house);
  Object.defineProperty(house, "any", { get: () => anyWas() || !!now() || others(false).length > 0 });

  house.talk = async (a: TalkAsk, deadlineMs?: number | null): Promise<TalkAnswer> => {
    const t = now(), eps = others(!!a.home);
    if (t || eps.length) try {
      const heard = !a.text?.trim() && a.wav ? (t?.at.asr ? await tiinyHear(t.at, a.wav) : null) ?? hearAs(await was.transcribe(a.wav)) : null;   // C-369
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
    const heard = await was.transcribe(wav);
    return heard ? hearAs(heard) : heard;   // C-369: whichever ear heard it
  };
  const MODULE_WRITE_MOST = 1800, PHONE_WRITE_MOST = 9000;   // characters, system and user together
  const WAIT_STEP_MS = 30_000, WAIT_MOST_MS = 60 * 60_000;   // C-480: a job waiting for a fitting mind looks again each half minute, an hour at most
  // C-360: every mind that can write it, in order of its score now (ai/thoughtroute.ts) -- the Tiiny, the player's
  // endpoints, the household's phones that lend, the house's module -- the next asked if one fails; hedged when someone
  // is waiting. C-319: job.by names each mind as it is tried, job.fell each failure; stopped from THE MIND AT WORK, no
  // other mind is asked.
  house.write = async (system: string, user: string, maxTokens = 400, job?: WriteJob) => {
    let minds = mindsFor(system, user, maxTokens, job);
    const fits = system.length + user.length <= MODULE_WRITE_MOST;
    if (!minds.length) throw new Error("too long for the house's module, and no other mind answered");   // DRAFT
    // C-480: the daemon chooses -- and, when no mind fits now, the job waits for one (LATER), saying so, then goes on
    if (choosing()) {
      const want = { quick: !!job?.quick, size: system.length + user.length, private: !!job?.private };
      let chosen = choose(minds, holds, want), said = false;
      for (const until = Date.now() + WAIT_MOST_MS; !chosen.length; chosen = choose(minds, holds, want)) {
        if (job?.signal?.aborted) throw new Error(STOPPED);
        if (Date.now() > until) throw new Error("no fitting mind came free within the hour");                  // DRAFT
        if (!said) { job?.by?.("LATER: waiting for a fitting mind"); said = true; }                          // DRAFT
        await new Promise<void>((ok) => {                       // a stop ends the wait at once
          const t = setTimeout(ok, WAIT_STEP_MS);
          job?.signal?.addEventListener("abort", () => { clearTimeout(t); ok(); }, { once: true });
        });
        minds = mindsFor(system, user, maxTokens, job);
      }
      minds = chosen;
    } else minds = order(minds, holds);
    try {
      return (await think(minds, {
        hedgeMs: job?.quick ? HEDGE_QUICK_MS : undefined,
        tried: (name) => job?.by?.(name),
        fell: (_n, e) => { if (!job?.signal?.aborted) job?.fell?.((e as Error)?.message?.slice(0, 80) || "failed"); },
        stopped: () => !!job?.signal?.aborted,
      })).text;
    } catch (e) {
      if (job?.signal?.aborted) throw new Error(STOPPED);
      if (!fits) throw new Error("too long for the house's module, and no other mind answered");   // DRAFT
      void e;
      return null;                                             // as before: the module, last, may have nothing to say
    }
  };
  // every mind that could take this write now (C-360), each marked home or not and paid or not (C-480)
  function mindsFor(system: string, user: string, maxTokens: number, job?: WriteJob): Mind[] {
    const t = now(), minds: Mind[] = [];
    // the background: a write-up nobody stands waiting for -- the big thinker, thinking on, minutes allowed;
    // C-338: job.quick -- someone stands waiting (a daemon at its easel): the quick thinker, thinking off, as a talk is
    if (t) minds.push({ name: "the Tiiny", power: MIND_POWER.tiiny, ask: () => job?.quick
      ? tiinyChat(t.at, t.quick || t.model, system, [], user, fetch, 90_000, maxTokens, false, false, job)
      : tiinyChat(t.at, t.model, system, [], user, fetch, 300_000, maxTokens, true, false, job) });
    // C-360: a write-up's big thinker may be away (the Tiiny answered 404 for it, 2026-11-14) -- its quick one is a mind too
    if (t && !job?.quick && t.quick && t.quick !== t.model)
      minds.push({ name: "the Tiiny (quick)", power: MIND_POWER.tiiny - 5, ask: () => tiinyChat(t.at, t.quick!, system, [], user, fetch, 120_000, maxTokens, false, false, job) });
    for (const n of others(false))                             // C-280 (1): no thinking budget asked of a stranger's model
      minds.push({ name: n.e.name, power: MIND_POWER.endpoint, home: n.home, paid: !n.home,
                   ask: () => chatOn(n.e, n.model, system, [], user, fetch, 120_000, maxTokens, false, job) });
    if (system.length + user.length <= PHONE_WRITE_MOST)     // a phone's on-device model holds about this much
      for (const p of phones()) minds.push({ name: p.name, power: MIND_POWER.phone, ask: () => p.ask(system, user, maxTokens, job?.signal) });
    // the module's window is small: a write longer than it holds is never sent to fail there ("The input content exceeds
    // the maximum length supported by the model", a dream's telling, 2026-11-12)
    const fits = system.length + user.length <= MODULE_WRITE_MOST;
    if (fits) minds.push({ name: "the house's module", power: MIND_POWER.module, ask: async () => (await was.write(system, user, maxTokens, job)) ?? "" });
    return minds;
  }
  return house;
}
