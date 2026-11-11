// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-318 (the user, 2026-11-10: "a scrollable panel with stylized (headers/text) detailing what is new in this build
// version, if you tap the version you can select previous versions ... a tag entry which represents a span ... the
// content of each combined would be fed to the local ai network ... when results come in an entry would be added to
// represent this generative version range what's changed"): WHAT'S NEW -- every build's notes (server/data/whatsnew.json,
// written from history by server/tools/whatsnew.py), a span of them, and the SPANS the hub's mind has told: a few
// paragraphs on what changed across them, in the house's words. Each span asked is a task in THE MIND's ledger
// (ai/tasks.ts). Every word the hub writes here is DRAFT.
import notesJson from "../data/whatsnew.json" with { type: "json" };

// C-339: a section that needs setting up carries its steps (server/data/whatsnew_setup.json, copied in by whatsnew.py)
export type Setup = { title: string; steps: string[]; needs?: string[]; where?: string; wiki?: string; book?: string; draft?: boolean };
export type Section = { ticket: string | null; title: string; lines: string[]; setup?: Setup };
export type BuildNotes = { build: number; commit: string; date: string; sections: Section[] };
export type Notes = { latest: number; builds: BuildNotes[] };
export const NOTES = notesJson as unknown as Notes;

// C-339: a step as shown: {hub} is the hub's address as this app knows it
export const stepText = (step: string, hub: string) => step.replace(/\{hub\}/g, hub.replace(/\/+$/, ""));
export const WIKI = "https://github.com/CodeMusic/daemons-companion/wiki/";
export const wikiUrl = (page: string) => WIKI + page.replace(/^\/+/, "");

// A span told by the hub's mind: builds from..to (from the older), its words, and how it stands
export type Digest = { id: string; from: number; to: number; at: string; by: string; task: string;
                       state: "thinking" | "done" | "failed"; title?: string; text?: string; error?: string; mind?: string };
const KEY = "whatsnew.digests", MOST = 24;
type Get = (k: string) => string | null;
type Set_ = (k: string, v: string | null) => void;

// the builds in a span, newest first, whichever end is given first
export function spanOf(notes: Notes, a: number, b: number): BuildNotes[] {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return notes.builds.filter((x) => x.build >= lo && x.build <= hi);
}

// The span as a mind is given it: each build's date, headers and lines, trimmed to fit a small model's window
export function spanText(builds: BuildNotes[], most = 9000): string {
  const out: string[] = [];
  for (const b of [...builds].reverse()) {                        // oldest first: a story is told forward
    out.push(`BUILD ${b.build} (${b.date})`);
    for (const s of b.sections) { out.push(`  ${s.title}`); for (const l of s.lines) out.push(`    - ${l}`); }
  }
  const t = out.join("\n");
  return t.length > most ? `${t.slice(0, most)}\n  ...(and more)` : t;
}

export const DIGEST_SYSTEM =                                   // DRAFT
  "You write the WHAT'S NEW for DAEMONS, a companion app for a game whose creatures are daemons (said DAY-mons). " +
  "You are given the release notes of several builds, oldest first. Tell a player what changed across all of them, " +
  "as one story, warm and a little playful, never technical: no commit words, no file names, no ticket numbers. " +
  "Begin with one line that is a title for the span, starting with '# '. Then two to five short sections, each " +
  "beginning with a header line starting with '## ', each with two to four lines starting with '- '. " +
  "Never write the word 'demon'.";
export const digestAsk = (builds: BuildNotes[]) => {
  const [lo, hi] = [builds[builds.length - 1]?.build, builds[0]?.build];
  return `What changed from build ${lo} to build ${hi}:\n\n${spanText(builds)}`;
};

// What a mind wrote, made safe to keep and show: its title pulled out, the rest kept as lines
export function readDigest(text: string): { title?: string; text: string } {
  const lines = text.replace(/\r/g, "").replace(/\bdemons?\b/gi, (w) => (w[0] === "D" ? "Daemon" : "daemon") + (w.endsWith("s") ? "s" : ""))
    .split("\n").map((l) => l.trimEnd());
  const i = lines.findIndex((l) => /^#\s+/.test(l));
  const title = i >= 0 ? lines[i].replace(/^#\s+/, "").replace(/\*+/g, "").trim().slice(0, 80) : undefined;
  const rest = lines.filter((_, j) => j !== i).join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);
  return { ...(title ? { title } : {}), text: rest };
}

export function digests(get: Get): Digest[] {
  try { const d = JSON.parse(get(KEY) ?? "[]"); return Array.isArray(d) ? d : []; } catch { return []; }
}
export function keepDigest(get: Get, set: Set_, d: Digest) {
  set(KEY, JSON.stringify([d, ...digests(get).filter((x) => x.id !== d.id)].slice(0, MOST)));
}
export function forgetDigest(get: Get, set: Set_, id: string) {
  set(KEY, JSON.stringify(digests(get).filter((x) => x.id !== id)));
}
