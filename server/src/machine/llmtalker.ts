// C-220: a meeting's talker on THE COMMONS -- any OpenAI-compatible endpoint (roverbyteseer's LiteLLM, and the Tiiny AI
// behind it when it comes), asked for one turn with the meeting's own short setup and question (together.ts). Its line
// still passes the filter (meetsafe.ts) before anyone reads it. No node: imports.
import { MEET_SETUP, meetQuestion, type Talker } from "../together.js";

export function llmTalker(base: string, model: string, key = "", f: typeof fetch = fetch, ms = 15000): Talker {
  const url = `${base.replace(/\/+$/, "")}/v1/chat/completions`;
  return async (me, other, heard) => {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await f(url, { method: "POST", signal: ctl.signal,
        headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ model, max_tokens: 60, temperature: 0.8,
                               messages: [{ role: "system", content: MEET_SETUP }, { role: "user", content: meetQuestion(me, other, heard) }] }) });
      if (!r.ok) return null;
      const j = await r.json();
      return typeof j?.choices?.[0]?.message?.content === "string" ? j.choices[0].message.content : null;
    } catch { return null; } finally { clearTimeout(timer); }
  };
}

// C-471: a DIALOGUE's thinker on THE COMMONS (dialogue.ts setDialogueThinker) -- the same endpoint, asked with the talk's
// own system and question for at most `most` tokens; its line passes dialogue.ts's filter before anyone reads it. A
// failure throws, as dialogue.ts's thinkers do, so a talk with no mind stops and says so.
export function llmThinker(base: string, model: string, key = "", f: typeof fetch = fetch, ms = 60000) {
  const url = `${base.replace(/\/+$/, "")}/v1/chat/completions`;
  return async (system: string, user: string, most: number): Promise<{ text: string | null; by: string }> => {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await f(url, { method: "POST", signal: ctl.signal,
        headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ model, max_tokens: most, temperature: 0.8, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
      if (!r.ok) throw new Error(`the commons' mind answered ${r.status}`);
      const j = await r.json();
      const text = j?.choices?.[0]?.message?.content;
      return { text: typeof text === "string" ? text : null, by: `commons:${model}` };
    } finally { clearTimeout(timer); }
  };
}
