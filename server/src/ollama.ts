// C-142 (the user, 2026-10-16: "the idea is that the daemon can be your home assistant"): the daemon as Home Assistant's
// conversation agent. The BOX-3 already shows the daemon (C-138); with this it answers as the daemon too.
//
// Home Assistant's own Ollama integration takes any server that speaks Ollama's API, so the companion speaks just enough
// of it: the daemons away are its models (`daemon` is the one the BOX-3 carries; each is also there by its own name), and
// a chat is answered by the companion's own talk (n8n daemon/talk) in that daemon's voice -- the same talk the app and
// the handhelds have. No tools: Home Assistant's pipeline keeps "prefer handling commands locally" on, so "turn on the
// kitchen light" is done by Home Assistant itself before the daemon is ever asked, and the daemon answers the rest.
//
// The door is /ollama/<key>/ -- Home Assistant's integration sends no header of its own, so the key is in the address the
// site's SETTINGS shows (this machine only), and nothing else on the network reaches the companion this way.
import { randomBytes } from "node:crypto";

export type AgentDaemon = { model: string; nickname: string; name: string; types: string; category: string; entry: string };
export type Turn = { role: string; content?: string };
export const DEFAULT_MODEL = "daemon:latest";
export const OLLAMA_VERSION = "0.12.6";             // the version said to a client that asks; nothing depends on it

export function ollamaKey(get: (k: string) => string | null, set: (k: string, v: string | null) => void, renew = false): string {
  let k = renew ? null : get("ollama.key");
  if (!k) { k = randomBytes(18).toString("base64url"); set("ollama.key", k); }
  return k;
}

// A model's name as Ollama writes one: lower case, letters and digits, ":latest"
export const modelOf = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "daemon"}:latest`;
const bare = (m: string) => String(m ?? "").replace(/:latest$/, "");

// The model asked for: `daemon` is the default one; any other is a daemon by its own name; unknown falls to the default
export function pick(model: string, byName: AgentDaemon[], fallback: AgentDaemon | null): AgentDaemon | null {
  const m = bare(model);
  return m === bare(DEFAULT_MODEL) ? fallback : byName.find((d) => bare(d.model) === m) ?? fallback;
}

// GET /api/tags: the daemons as models -- `daemon` first, then each by name (sizes and digests are only what a client
// expects to find; there are no weights here)
export function tags(byName: AgentDaemon[], now = new Date()) {
  const one = (name: string, family: string) => ({
    name, model: name, modified_at: now.toISOString(), size: 0, digest: "0".repeat(64),
    details: { parent_model: "", format: "daemon", family, families: [family], parameter_size: "", quantization_level: "" },
  });
  return { models: [one(DEFAULT_MODEL, "daemon"), ...byName.map((d) => one(d.model, d.types || "daemon"))] };
}

// POST /api/show: enough for a client that checks what a model can do
export function show(d: AgentDaemon | null) {
  return { license: "", modelfile: "", parameters: "", template: "{{ .Prompt }}",
           details: { parent_model: "", format: "daemon", family: "daemon", families: ["daemon"], parameter_size: "", quantization_level: "" },
           model_info: { "general.architecture": "daemon", "general.basename": d?.nickname ?? "daemon" }, capabilities: ["completion"] };
}

// What was said last, and the turns before it (the last six that were words, not tools), from a chat's messages
export function heard(messages: Turn[]): { text: string; history: { role: string; content: string }[] } {
  const words = (messages ?? []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim());
  const last = [...words].reverse().find((m) => m.role === "user");
  const at = last ? words.lastIndexOf(last) : words.length;
  return { text: (last?.content ?? "").trim().slice(0, 1000),
           history: words.slice(0, at).slice(-6).map((m) => ({ role: m.role, content: String(m.content).slice(0, 1000) })) };
}

// The answer as Ollama sends one: a single reply, or (streaming) the words then a closing line, one JSON a line
export function chatReply(model: string, content: string, stream: boolean, now = new Date()): string {
  const base = { model, created_at: now.toISOString() };
  const done = { ...base, message: { role: "assistant", content: "" }, done: true, done_reason: "stop",
                 total_duration: 0, load_duration: 0, prompt_eval_count: 0, eval_count: 0 };
  if (!stream) return JSON.stringify({ ...done, message: { role: "assistant", content } });
  return JSON.stringify({ ...base, message: { role: "assistant", content }, done: false }) + "\n" + JSON.stringify(done) + "\n";
}

// When the talk cannot be reached, the daemon still answers rather than leaving the voice assistant silent -- DRAFT
export const QUIET = "I can't find my words right now. Ask me again in a little while.";
