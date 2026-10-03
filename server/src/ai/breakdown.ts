// C-06: breaking a goal down in Musai's shape (PLAN 2) -- one pass reasons logically, one by association, and a third
// reads both and writes the plan that holds them. Off by default: with the AI switched off (the default), the answer
// is a built-in example, marked as one, and NO MODEL IS CALLED. A model is reached through an OpenAI-compatible
// endpoint (DAEMONS' LiteLLM, ai/), only when config.ai.enabled is true.
import type { Config } from "../config.js";
import type { Plan } from "../db.js";

export interface Breakdown { example: boolean; logical: string; associative: string; plan: Plan }

export const PROMPTS = {
  logical: "You break a goal into the real steps it takes. Be concrete and ordered: 2 to 5 sub-items, each with 1 to 4 " +
           "steps small enough to start in the next ten minutes. Say how long each takes. No encouragement, only the work.",
  associative: "You think about a goal by association: why it matters to this person, what it connects to, what would " +
               "make it easier or more pleasant to begin, what tends to get in the way. Free-associate briefly; no lists of steps.",
  integrate: "Two agents answered the same goal: one logically, one by association. Note where they agree and where they " +
             "do not, then write the plan that holds both -- the logical steps, shaped by what the second saw. Reply with " +
             'ONLY JSON: {"subitems":[{"title":"...","steps":["...","..."]}]}.',
};

export function exampleBreakdown(goal: string): Breakdown {
  return {
    example: true,
    logical: "(example -- the AI is off) Get what you need, do it in parts, check it.",
    associative: "(example -- the AI is off) Start small; the first step is the hardest one.",
    plan: { subitems: [
      { title: `Get ready for: ${goal}`, steps: ["Write down what done looks like", "Gather what you need"] },
      { title: "Do the first part", steps: ["Spend ten minutes on the smallest piece"] },
      { title: "Finish and check", steps: ["Finish what is left", "Look it over once"] },
    ] },
  };
}

async function chat(cfg: Config, system: string, user: string): Promise<string> {
  const key = cfg.ai.apiKeyEnv ? process.env[cfg.ai.apiKeyEnv] : undefined;
  const r = await fetch(`${cfg.ai.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model: cfg.ai.model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`the model answered ${r.status}`);
  const j = (await r.json()) as any;
  return j.choices?.[0]?.message?.content ?? "";
}

export async function breakdown(goal: string, cfg: Config): Promise<Breakdown> {
  if (!cfg.ai.enabled || !cfg.ai.model) return exampleBreakdown(goal);
  const [logical, associative] = await Promise.all([chat(cfg, PROMPTS.logical, goal), chat(cfg, PROMPTS.associative, goal)]);
  const merged = await chat(cfg, PROMPTS.integrate,
    `The goal: ${goal}\n\nThe logical answer:\n${logical}\n\nThe associative answer:\n${associative}`);
  const json = merged.slice(merged.indexOf("{"), merged.lastIndexOf("}") + 1);
  return { example: false, logical, associative, plan: JSON.parse(json) as Plan };
}
