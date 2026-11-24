// C-290: this file runs on the phone too (C-111) -- keep it free of Node-only APIs (node:*, fs).
// BRAIN: cortex.auditory (hear) -- what an ear heard, corrected toward the lexicon
// C-369 (the user, 2026-11-15; the Tiiny's update of 2026-11-11): THE EAR HEARS THE LEXICON. Every ear we have -- the
// Tiiny's Qwen3-ASR, the board's, roverbyteseer's Whisper -- writes the game's words as the nearest English: "little
// Damon" for a daemon, "river cub" for ROVERCUB (heard 2026-11-15), and Qwen3-ASR takes no word list. So what any ear
// heard is corrected here, against data/hotwords.json (server/tools/hotwords.py: the daemons' and places' names that
// are not ordinary words, and what an ear writes for DAEMON). A near miss is one or two letters off a name, or a name
// heard as two or three words; the frightening word is never left in what was heard.
import hotwordsJson from "../../data/hotwords.json" with { type: "json" };

type Hotwords = { said: Record<string, string>; words: string[] };
const HOTWORDS = hotwordsJson as unknown as Hotwords;
export const HOTWORD_LIST: string[] = HOTWORDS.words;

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// How many single-letter edits turn one into the other (stops counting past `most`)
export function edits(a: string, b: string, most = 3): number {
  if (Math.abs(a.length - b.length) > most) return most + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...row) > most) return most + 1;
    prev = row;
  }
  return prev[b.length];
}
// Close enough: one edit for a short name, two from eight letters on; the first letter always the same
const near = (heard: string, name: string) => heard !== name && heard[0] === name[0] && edits(heard, name, 2) <= (name.length >= 8 ? 2 : 1);

// Capital only where a sentence starts: an ear capitalises "Damon" as a name, mid-sentence
const keepCase = (word: string, before: string) => /(^|[.!?]["')\]]?\s+)$/.test(before) || !before.trim() ? word[0].toUpperCase() + word.slice(1) : word;

// What was heard, with the game's words put right
export function hearAs(text: string | null | undefined, hw: Hotwords = HOTWORDS): string {
  let out = String(text ?? "");
  if (!out.trim()) return out;
  // what an ear writes for DAEMON, longest first so "day mons" goes before "day mon"
  for (const [heard, word] of Object.entries(hw.said).sort((a, b) => b[0].length - a[0].length))
    out = out.replace(new RegExp(`\\b${heard.replace(/ /g, "\\s+")}\\b`, "gi"), (_m, at: number, all: string) => keepCase(word, all.slice(0, at)));
  const names = hw.words.map((w) => ({ w, s: squash(w) }));
  const tokens = out.split(/(\s+)/);   // words and the spaces between them, kept
  const idx = tokens.map((t, i) => (/\S/.test(t) ? i : -1)).filter((i) => i >= 0);
  let done = idx.length ? tokens.slice(0, idx[0]).join("") : out;
  const after = (k: number) => tokens[idx[k] + 1] ?? "";   // the space that followed a word, kept as it was
  for (let k = 0; k < idx.length; ) {
    let best: { len: number; w: string; tail: string } | null = null;
    const word = tokens[idx[k]], one = squash(word);
    // a word that is a name already stays as it was; else a near miss of one word, else two or three words run together
    if (!names.some(({ s }) => s === one)) {
      for (let len = 1; len <= 3 && !best; len++) {
        if (k + len > idx.length) break;
        const span = idx.slice(k, k + len).map((i) => tokens[i]);
        const tail = (span[span.length - 1].match(/[^A-Za-z0-9]+$/) ?? [""])[0];
        const lead = (span[0].match(/^[^A-Za-z0-9]+/) ?? [""])[0];
        const heard = squash(span.join(""));
        if (heard.length < 4) continue;
        for (const { w, s } of names) {
          const plural = len === 1 && heard.endsWith("s") && (heard === s + "s" || near(heard.slice(0, -1), s));
          if ((len > 1 && heard === s) || near(heard, s) || plural) { best = { len, w: lead + w + (plural ? "S" : ""), tail }; break; }
        }
      }
    }
    if (best) { done += best.w + best.tail + after(k + best.len - 1); k += best.len; } else { done += tokens[idx[k]] + after(k); k++; }
  }
  return done;
}
