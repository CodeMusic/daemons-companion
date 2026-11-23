// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-386 (the user, 2026-11-16: "the remade content should reflect the active daemon, it's 1st person index entry,
// yesterdays dream, goals, journal allusions we should have a general function to get this combined context + along
// with the base prompt, this way if u remake one u get new feeling dream sounds"): THE MUSE -- what a daemon makes
// things FROM. Every creation (a sleep piece's image, a song, a painting) begins here, so each draws on the same whole
// of it: the persona of the day (persona.ts, from personaof.ts -- its own telling, how it is cared for, its person's
// goals, last night's dream, the day's virtue over its shadow), a thread of its person's journal to ALLUDE to and never
// quote, and the synesthesia of now -- the month's note and colour, the day's (synesthesia.ts).
//
// The muse is said to a THINKER only (the house's mind, the Tiiny, the player's own endpoints); what reaches a music or
// an image model is what that thinker answers, cleaned to music or picture words by each caller -- never the muse.
//
// THE PALETTE (the user, same day): a painting's BACKGROUND in the month's colours, its main FORM in the day's.
//
// Every word here is DRAFT, words to a model, never shown.
import type { Store } from "../shared/store.js";
import { journalOf, journalsOf } from "../lifemanagement/journal.js";
import { monthOf, type Hemisphere } from "../months.js";
import { Synesthesia } from "../synesthesia.js";

export type MuseFacts = {
  persona: string;              // the persona of the day's text (persona.ts), or personaOf's
  journal?: string[] | null;    // threads of the journal (journalThreads), newest first
  at?: Date;
  hemisphere?: Hemisphere;
};

const JOURNAL_DAYS = 14, THREADS = 2, THREAD_MOST = 180;
const clip = (s: string, most: number) => s.replace(/\s+/g, " ").trim().slice(0, most);

/** The newest entries of the person's own (standard) journals from the last fortnight, each its title and a few words. */
export function journalThreads(store: Store, now = new Date(), most = THREADS): string[] {
  const since = now.getTime() - JOURNAL_DAYS * 86_400_000;
  const out: { at: string; text: string }[] = [];
  for (const j of journalsOf(store).filter((x) => x.kind === "standard" && x.last && Date.parse(x.last) >= since).slice(0, 3)) {
    for (const e of journalOf(store, j.id, now)?.entries.slice(0, most) ?? []) {
      if (Date.parse(e.at) < since) continue;
      out.push({ at: e.at, text: clip(`${e.title ? `${e.title}: ` : ""}${e.body}`, THREAD_MOST) });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, most).map((x) => x.text);
}

/** The synesthesia of now, in words for a thinker: the month and the day, each its note, its colour and its virtue. */
export function nowSensed(at = new Date(), hemisphere: Hemisphere = "north"): string {
  const { day, month } = Synesthesia.now(at), m = monthOf(month.ordinal, hemisphere);
  return `The month is ${m.name}: the note ${month.note}, the colour ${Synesthesia.colourWords(month)}, its tone ${m.tone.toLowerCase()} ` +
         `(${m.movement}). The day is ${day.name}: the note ${day.note}, the colour ${Synesthesia.colourWords(day)}.`;
}

/** A painting's colours: the month's for the background, the day's for the main form -- picture words, no names. */
export function paintPalette(at = new Date()): string {
  const { day, month } = Synesthesia.now(at);
  return `the background in ${month.hues.join(" and ")} tones, the main form in ${day.hues[0]}`;
}

/** The music's key for now: the month's note, minor or major as the caller's mood asks. */
export const museKey = (at = new Date(), minor = false) => Synesthesia.keyscale(Synesthesia.month(at.getMonth() + 1), minor);

/** THE MUSE: the whole of what a daemon makes from, as one text for a thinker (put where its persona went). */
export function museOf(f: MuseFacts): string {
  const at = f.at ?? new Date();
  const threads = (f.journal ?? []).filter(Boolean);
  return [
    f.persona.trim(),
    threads.length
      ? `What your person has been writing lately, to let colour what you make -- allude to it, as a feeling or an image, and ` +
        `never quote it, name it, or say where it came from:\n${threads.map((t) => `- ${t}`).join("\n")}`
      : "",
    `The colours and notes of now, which you feel as a synaesthete does: ${nowSensed(at, f.hemisphere)}`,
  ].filter(Boolean).join("\n\n");
}
