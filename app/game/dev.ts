// C-268: DEVELOPER MODE -- off, the game shows none of its workings (the frames line, what EmulatorJS warned of); on, a
// LOGS panel beside the game and the companion (or a card in SETTINGS where there is no room beside) shows them, with
// what the app warned of and how much memory its JavaScript holds. Kept on this device, as the game's other choices are.
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { BLOODSHOT_BELOW, girthOf, SHADOWS_BELOW } from "../../server/src/care";   // C-269: no node: imports there

type Kept = { on: boolean; width: number | null };
let kept: Kept | null = null;
const file = () => new File(new Directory(Paths.document, "game"), "dev.json");

function read(): Kept {
  if (kept) return kept;
  kept = { on: false, width: null };
  if (Platform.OS === "web") return kept;                   // the site keeps it for the visit
  try {
    const f = file();
    if (f.exists) { const j = JSON.parse(f.textSync()); kept = { on: j.on === true, width: typeof j.width === "number" ? j.width : null }; }
  } catch { /* off */ }
  return kept;
}
function write(k: Kept) {
  kept = k;
  if (Platform.OS !== "web") try {
    const d = new Directory(Paths.document, "game");
    if (!d.exists) d.create();
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(k));
  } catch { /* kept for this run only */ }
  heard.forEach((h) => h());
}

export type Line = { at: number; from: "game" | "app"; text: string };
export type Stats = { ran: number | null; drawn: number; sound: string } | null;
const lines: Line[] = [];
let stats: Stats = null;
const heard = new Set<() => void>();
const tell = () => heard.forEach((h) => h());

export const devMode = () => read().on;
export const setDevMode = (on: boolean) => { if (!on) pretend = null; write({ ...read(), on }); };   // C-269: off, the pretend goes
export const logsWidth = () => read().width;
export const keepLogsWidth = (width: number) => write({ ...read(), width });

export function devLog(from: Line["from"], text: string) {
  const last = lines[lines.length - 1];
  if (last && last.text === text && last.from === from) return;   // the same warning each second is one line
  lines.push({ at: Date.now(), from, text: text.slice(0, 600) });
  if (lines.length > 300) lines.splice(0, lines.length - 300);
  tell();
}
export const devStats = (s: Stats) => { stats = s; tell(); };
export const clearLog = () => { lines.length = 0; tell(); };

// how much the app's JavaScript holds, where Hermes says (the game's web view does not)
export function heap(): string | null {
  try {
    const s = (globalThis as any).HermesInternal?.getInstrumentedStats?.();
    if (s && typeof s.js_heapSize === "number") return `${(s.js_allocatedBytes / 1048576).toFixed(1)} of ${(s.js_heapSize / 1048576).toFixed(1)} MB`;
  } catch { /* none */ }
  return null;
}

// what the app itself warns of reaches the log too (once, at load)
for (const k of ["warn", "error"] as const) {
  const o = console[k].bind(console);
  console[k] = (...a: unknown[]) => { o(...a); try { devLog("app", a.map((x) => (x instanceof Error ? `${x.message} ${x.stack ?? ""}` : String(x))).join(" ")); } catch { /* never in the way */ } };
}

export function useDev() {
  const [, set] = useState(0);
  useEffect(() => { const h = () => set((n) => n + 1); heard.add(h); return () => { heard.delete(h); }; }, []);
  return { on: devMode(), lines, stats };
}

// C-269: </> -- the daemon's mood and care as a developer wants to see them, IN MEMORY ONLY: never written to the
// companion, the save or the game, gone with RESET, with the panel closed, with DEVELOPER MODE off and with the app shut.
// What it changes is what this app draws: the bars, the word, and its girth (the eyes' shadows are painted on the
// companion, which never hears of this).
export type Pretend = Partial<Record<"mood" | "rest" | "hunger" | "thirst" | "weight" | "companionship", number>>;
let pretend: Pretend | null = null;
export const pretending = () => pretend;
export const setPretend = (p: Pretend | null) => { pretend = p && Object.keys(p).length ? p : null; tell(); };
export function pretendLife<L extends { mood: number; word: string; tired: string; care?: any; expression?: any }>(l: L): L {
  const p = pretend;
  if (!p || !read().on) return l;
  const mood = p.mood ?? l.mood;
  const word = l.tired !== "awake" || p.mood === undefined ? l.word
    : mood >= 88 ? "happy" : mood >= 72 ? "content" : mood >= 55 ? "calm" : "a little low";   // life.ts's words
  const c = l.care ? { ...l.care, ...Object.fromEntries(Object.entries(p).filter(([k]) => k !== "mood")) } : l.care;
  if (c) c.worn = { shadows: c.rest < SHADOWS_BELOW, bloodshot: c.rest < BLOODSHOT_BELOW };
  const expression = l.expression && c ? { ...l.expression, pose: { ...l.expression.pose, girth: girthOf(c.weight) }, worn: c.worn } : l.expression;
  return { ...l, mood, word, care: c, expression };
}
