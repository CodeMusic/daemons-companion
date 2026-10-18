// What the app carries from the game (the MARKS, the school, the regions, the pictures) and the helpers that read it (C-157: out of App.tsx).
import { WIDGET } from "./net";
import { Act, Cast, GrovesData, MarksData, RegionsData, SchoolData } from "./types";
export const ACTS: { acts: Act[]; casino?: Act[] } = require("../server/data/acts.json");

export function castLine(c: Cast) {
  const a = [...ACTS.acts, ...(ACTS.casino ?? [])].find((x) => x.code === c.act);   // C-151: the CASINO's acts too
  return c.kind === "say" ? `${c.name}: ${c.text ?? ""}` : `${c.name} ${(c.kind === "reply" ? a?.reply : a?.seen) ?? ""}`;
}
export let PLAYER_ID: Promise<string> | null = null;

export function playerId(): Promise<string> {
  if (PLAYER_ID) return PLAYER_ID;
  PLAYER_ID = (async () => {
    if (WIDGET) return WIDGET.widgetId();
    let id: string | null = null;
    try { id = globalThis.localStorage?.getItem("player-id") ?? null; } catch { /* a private window */ }
    if (!id) {
      id = `site-${Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, "0")}`;
      try { globalThis.localStorage?.setItem("player-id", id); } catch { /* kept for this visit only */ }
    }
    return id;
  })();
  return PLAYER_ID;
}
   // T-417: the twelve key colours, C..B, and the heads' outline

// C-125: the player as the game draws them -- the trainer card's picture and the walking sprite (DAEMONS exports both)
export const PLAYER_ART = {
  REASON: { card: require("../server/data/art/player_reason.png"), walk: require("../server/data/art/player_reason_walk.png") },
  INSTINCT: { card: require("../server/data/art/player_instinct.png"), walk: require("../server/data/art/player_instinct_walk.png") },
};
   // T-405: its STREAM lecture, two scripts
export const MARKS: MarksData = require("../server/data/marks.json");

export const MARK_ART = [require("../server/data/art/mark_1.png"), require("../server/data/art/mark_2.png"), require("../server/data/art/mark_3.png"),
                  require("../server/data/art/mark_4.png"), require("../server/data/art/mark_5.png"), require("../server/data/art/mark_6.png"),
                  require("../server/data/art/mark_7.png"), require("../server/data/art/mark_8.png")];

export const reflow = (t: string) => t.split(/\n\n+/).map((par) => par.replace(/\n/g, " ").trim()).filter(Boolean);

export const rgbOf = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;

// C-144: a root's own colour as words on the night -- lifted towards the paper until it reads (4.5:1 on the cards)
export const luminance = (c: number[]) => c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);

export function onNight(c: number[]) {
  const card = luminance([28, 31, 36]);
  for (let t = 0; t < 1; t += 0.05) {
    const m = c.map((v, i) => Math.round(v + ([251, 250, 246][i] - v) * t));
    if ((luminance(m) + 0.05) / (card + 0.05) >= 4.5) return m;
  }
  return [251, 250, 246];
}

export const rootOfMark = (n: number) => {        // the understanding a MARK pairs with (marks.json wisdom.root_flag)
  const f = (MARKS.marks[n].wisdom as { root_flag?: number } | undefined)?.root_flag;
  return MARKS.understandings.findIndex((u) => (u as { flag?: number }).flag === f);
};
export const REGIONS: RegionsData = require("../server/data/regions.json");
export const GROVES: GrovesData = require("../server/data/groves.json");
export const SCHOOL: SchoolData = require("../server/data/school.json");

export const letterOf = (m: number) => SCHOOL.grades.find((g) => m >= g.from)?.letter ?? "";
export const GUIDE_COVER = require("../server/data/art/guide_cover.png");

// the GUIDE's own sixteen colours (DAEMONS tools/genguide.py): charcoal boards and pages, near-white ink, one cyan -- the
// book looks like itself in either theme, as it does in the game
// the screen's ScrollView, so turning a page of a book starts the new one at its top
export const SCREEN: { scroller: { scrollTo?: (o: { y: number; animated: boolean }) => void } | null } = { scroller: null };

export const BOOK = { boards: "#161618", page: "#282a2e", edge: "#3e4046", ink: "#e6eaee", faint: "#78808a", cyan: "#00c8ff" };

// T-417: a SONGBOOK page, as the game draws it -- its key's note in the key's colour, then the motif on a treble staff, each
// head coloured by its pitch class (C red .. A indigo .. B purple, DAEMONS' key colours, exported in notebook.json) and
// a sharp or flat beside it as written. E4 sits on the bottom line; a step is a line or a space; ledger lines where needed.
export const LETTERS = "CDEFGAB", PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function pitch(n: string) {                                   // "C#5" -> its staff step (E4 = 0) and pitch class
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) return null;
  const pc = (PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? 11 : 0)) % 12;
  return { step: Number(m[3]) * 7 + LETTERS.indexOf(m[1]) - (4 * 7 + 2), pc, acc: m[2] === "#" ? "♯" : m[2] === "b" ? "♭" : "" };
}

// C-91: which build this is -- the commit it was made from and when -- and, asked of the companion, whether the app has
// changed since. On the site, the companion's own commit (the site is always the newest).
export const BUILD = process.env.EXPO_PUBLIC_BUILD ?? "";
export const KIND_NAMES: Record<string, string> = { "t-embed-cc1101": "T-Embed CC1101", "t-embed": "T-Embed",
                                             "t-embed-si4732": "T-Embed SI4732", "t-watch-s3": "T-Watch S3",
                                             "m5-sticks3": "M5StickS3", "m5-cores3": "M5Stack CoreS3",
                                             "m5-fire": "M5Stack Fire", "m5go": "M5GO", "m5-tab5": "M5Stack Tab5", "m5-dial": "M5Stack Dial",
                                             "iphone-widget": "This phone's widget" };

// A lesson (a MARK's or a ROOT's STREAM show) as the pages read it: its boxes re-flowed, its own name dropped from the first
// (the heading says it), empty ones gone -- the first leads, the rest are points (C-140; one copy, the review, 2026-10-18)
export function lessonParas(lesson: string[] | null | undefined, name: string): string[] {
  return (lesson ?? []).flatMap(reflow)
    .map((l, k) => (k === 0 && l.toUpperCase().startsWith(name.toUpperCase() + ".") ? l.slice(name.length + 1).trim() : l))
    .filter(Boolean);
}
