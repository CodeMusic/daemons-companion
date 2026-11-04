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
export const setDevMode = (on: boolean) => { if (!on) restoreSession(); write({ ...read(), on }); changed.forEach((h) => h()); };   // C-269, C-275: off, the session goes
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

// C-275: THE GAME SESSION -- what the </> tab sets: the books held or not, each GAME EVENT and CALLOW SCHOOL's rows, the
// witching hour. IN MEMORY ONLY, like the pretend above: the app is shown it (net.ts asks devRoute() before every read)
// and nothing is written anywhere; RESTORE, DEVELOPER MODE off or the app shut puts the save's own answers back.
export type Book = "guide" | "subtle" | "hermetic" | "play";
export type Session = { books: Partial<Record<Book, boolean>>; events: Record<number, boolean>;
                        school: Partial<Record<"textbook" | "diploma", boolean>>; hour: boolean | null;
                        dawn: boolean | null };   // T-519: THE CREATOR'S HOUR, 4:24 to 5:12
const blank = (): Session => ({ books: {}, events: {}, school: {}, hour: null, dawn: null });
let session: Session = blank();
const changed = new Set<() => void>();                        // net.ts: read every screen again
export const sessionNow = () => session;
export const onSession = (f: () => void) => { changed.add(f); return () => { changed.delete(f); }; };
export function setSession(f: (s: Session) => Session) { session = f(session); tell(); changed.forEach((h) => h()); }
export const restoreSession = () => { pretend = null; setSession(() => blank()); };
export const sessionTouched = () => !!pretend || session.hour !== null || session.dawn !== null || [session.books, session.events, session.school].some((o) => Object.keys(o).length > 0);

// the witching hour as the session has it: null, the clock's
export const hourForced = () => (read().on ? session.hour : null);
// T-519: THE CREATOR'S HOUR as the session has it: null, the clock's; on, as at its middle (its light whole, its tone sounding)
export const dawnForced = () => (read().on ? session.dawn ?? null : null);
// a book asked for as if held: the companion's own read-only ?preview=1 (never kept, never written)
const BOOK_PATH: Record<string, Book> = { "/api/guide": "guide", "/api/subtle": "subtle", "/api/hermetic": "hermetic", "/api/play": "play" };
export const bookForced = (b: Book) => (read().on ? session.books[b] : undefined);

// Before a read: the path to ask (a book forced held asks with ?preview=1), and what to do to the answer
export function devRoute(path: string): { path: string; answer?: (r: any) => any } | null {
  if (!read().on) return null;
  const bare = path.split("?")[0], b = BOOK_PATH[bare];
  if (b && session.books[b] === true) return { path: `${bare}?preview=1` };
  if (b && session.books[b] === false) return { path, answer: (r) => (bare === "/api/play" ? { ...r, unlocked: false } : { held: false }) };
  if (bare === "/api/progress" && (Object.keys(session.events).length || Object.keys(session.school).length)) {
    return { path, answer: (r) => r && ({ ...r,
      events: (r.events ?? []).map((e: any) => (e.n in session.events ? { ...e, held: session.events[e.n] } : e)),
      school: r.school && { ...r.school, ...session.school } }) };
  }
  return null;
}
