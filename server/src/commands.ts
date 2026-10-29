// C-244 (the user, 2026-10-29: "if I talk to the daemon and start with the word INDEX (it knows it is a command mode), so
// you say INDEX turn on low power mode -- the AI returns a JSON command that the watch actions"): a talk whose words begin
// INDEX is a command, not a word to the daemon. What follows is read by plain rules first (quick, and never wrong about
// the list); what they cannot read goes to the model with a fixed command prompt, and its JSON is checked against the
// same list. Anything not on the list is said back and never run. The watch acts on `command` and says what it did; the
// companion keeps the settings it changes (low power, a setting) so the app shows them too. Words DRAFT. No node: imports.
import { QUICKS } from "./core.js";

export type Command = { do: "lowpower"; on: boolean } | { do: "page"; name: string } | { do: "routine"; name: string }
                    | { do: "setting"; name: string; value: string | number | boolean } | { do: "time" };

export const PAGES = [...QUICKS, "today", "face", "settings", "daemon"] as const;
// the settings a command may change: the watch's own, by the names a person would say
export const SETTINGS: Record<string, { key: string; values: (string | number | boolean)[] }> = {
  sound: { key: "sound", values: [true, false] }, volume: { key: "volume", values: [0, 20, 40, 70, 100] },
  hours: { key: "hours", values: [12, 24] }, face: { key: "face", values: ["daemon", "clock", "virtue", "together", "orbit", "suspend"] },
  gps: { key: "power.gps", values: [true, false] }, lora: { key: "power.lora", values: [true, false] },
  bluetooth: { key: "power.meet", values: [true, false] }, "always on": { key: "power.aod", values: [true, false] },
  pulses: { key: "power.pulses", values: [true, false] },
};

// "INDEX, turn on low power" -> "turn on low power"; null when the talk is not a command
export function commandWords(heard: string): string | null {
  const m = /^\s*(?:the\s+)?index\b[\s,.:;!-]*(.*)$/i.exec(heard ?? "");
  return m ? m[1].trim().replace(/[.!?]+$/, "") : null;
}

const ON = /\b(on|enable|start|enter|turn on|switch on|yes)\b/i, OFF = /\b(off|disable|stop|exit|leave|turn off|switch off|no)\b/i;
const asValue = (raw: string): string | number | boolean => {
  const t = raw.trim().toLowerCase();
  if (/^(on|yes|true|enable|enabled)$/.test(t)) return true;
  if (/^(off|no|false|disable|disabled|mute|muted)$/.test(t)) return false;
  const n = Number(t.replace(/\s*(percent|%|hours?|h)$/, ""));
  return Number.isFinite(n) && t !== "" ? n : t;
};
const pageOf = (raw: string): string | null => {
  const t = raw.toLowerCase().replace(/^(the|my)\s+/, "").replace(/\s+(page|screen|view)$/, "").trim();
  const alias: Record<string, string> = { dreams: "dream", "last dream": "dream", book: "books", library: "books", clock: "face", home: "daemon" };
  const p = alias[t] ?? t;
  return (PAGES as readonly string[]).includes(p) ? p : null;
};

// the plain rules; null when none reads it
export function ruleCommand(words: string): Command | null {
  const w = words.toLowerCase().replace(/\s+/g, " ").trim();
  if (!w) return null;
  if (/low[\s-]?power|battery sav|power sav/.test(w)) {
    const off = OFF.test(w.replace(/low[\s-]?power/, "")), on = ON.test(w.replace(/low[\s-]?power/, ""));
    return { do: "lowpower", on: off && !on ? false : true };
  }
  if (/\b(what('s| is) the time|what time|the time|time)\b/.test(w) && w.split(" ").length <= 5) return { do: "time" };
  const flip = /^(?:turn|switch)\s+(on|off)\s+(?:the\s+)?(.+?)(?:\s+(?:mode|setting))?$/.exec(w);   // "turn off the gps"
  if (flip && SETTINGS[flip[2]]?.values.includes(flip[1] === "on")) return { do: "setting", name: flip[2], value: flip[1] === "on" };
  let m = /^(?:set|turn|make|change|switch)\s+(?:the\s+)?(.+?)\s+(?:to|on|off)\s*(.*)$/.exec(w);
  if (m) {
    const name = m[1].replace(/\s+(mode|setting)$/, "");
    const s = SETTINGS[name];
    if (s) {
      const said = /\soff\b/.test(w) && !m[2] ? false : /\son\b/.test(w) && !m[2] ? true : asValue(m[2]);
      const value = typeof said === "number" && s.values.every((v) => typeof v === "number")
        ? (s.values as number[]).reduce((a, b) => (Math.abs(b - said) < Math.abs(a - said) ? b : a)) : said;
      if (s.values.includes(value)) return { do: "setting", name, value };
    }
  }
  m = /^(?:open|show(?: me)?|go to|take me to)\s+(.+)$/.exec(w);
  if (m) { const p = pageOf(m[1]); if (p) return { do: "page", name: p }; }
  m = /^(?:run|start|begin|do)\s+(?:the\s+|my\s+)?(.+?)(?:\s+routine)?$/.exec(w);
  if (m && m[1].length <= 24) return { do: "routine", name: m[1].toUpperCase() };
  return null;
}

// the model's answer, checked: the first {...} in it, and only a command on the list
export function checkCommand(raw: unknown): Command | null {
  let o: any = raw;
  if (typeof raw === "string") { const j = /\{[\s\S]*?\}/.exec(raw); if (!j) return null; try { o = JSON.parse(j[0]); } catch { return null; } }
  if (!o || typeof o !== "object") return null;
  switch (o.do) {
    case "lowpower": return typeof o.on === "boolean" ? { do: "lowpower", on: o.on } : null;
    case "time": return { do: "time" };
    case "page": { const p = typeof o.name === "string" ? pageOf(o.name) : null; return p ? { do: "page", name: p } : null; }
    case "routine": return typeof o.name === "string" && o.name.trim() && o.name.length <= 24 ? { do: "routine", name: o.name.trim().toUpperCase() } : null;
    case "setting": {
      const name = typeof o.name === "string" ? o.name.toLowerCase() : "", s = SETTINGS[name];
      return s && s.values.includes(o.value) ? { do: "setting", name, value: o.value } : null;
    }
    default: return null;
  }
}

// the model's setup and question (DRAFT: words to the model, never shown) -- short, for the 0.5B's window
export const COMMAND_SETUP = "You turn a spoken request into one JSON command. Answer with JSON only.";
export const commandQuestion = (words: string) =>
  `Commands: {"do":"lowpower","on":true|false} {"do":"page","name":"${PAGES.slice(0, 9).join("|")}"} {"do":"routine","name":"..."} ` +
  `{"do":"setting","name":"sound|volume|hours|gps|lora|bluetooth","value":...} {"do":"time"}. Request: ${words.slice(0, 160)}`;

// what the watch says (DRAFT) -- it acts, then speaks this
export function commandSaid(c: Command | null, words: string, now = new Date(), hours: 12 | 24 = 24): string {
  if (!c) return words ? `That isn't a command I know: ${words.slice(0, 60)}.` : "INDEX is listening. Say a command after it.";
  switch (c.do) {
    case "lowpower": return c.on ? "Low power mode, on." : "Low power mode, off.";
    case "time": return `It's ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: hours === 12 })}.`;
    case "page": return `Opening ${c.name.toUpperCase()}.`;
    case "routine": return `Starting ${c.name}.`;
    case "setting": return `${c.name[0].toUpperCase()}${c.name.slice(1)}: ${c.value === true ? "on" : c.value === false ? "off" : c.value}.`;
  }
}

// the device's own settings this command changes, as setOwnSettings takes them (null: none)
export function commandPatch(c: Command | null): Record<string, unknown> | null {
  if (!c) return null;
  if (c.do === "lowpower") return { power: { low: c.on } };
  if (c.do === "setting") {
    const key = SETTINGS[c.name].key;
    if (key.startsWith("power.")) return { power: { [key.slice(6)]: c.value } };
    if (key === "sound" && typeof c.value === "boolean") return { sound: c.value };
    return { [key]: c.value };
  }
  return null;
}
