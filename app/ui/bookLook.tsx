// C-309 (the user, 2026-11-09: "some voice module control that changes its appearance slightly depending upon the book
// you have open ... it becomes the embodiment of the book which is being read ... generalize attributes that can act as
// 'morphemes' to the look and feel ... it is the books which bring the life/look/feel to the library"): what a book
// lends the library while it is open. Each look is made of the same seven morphemes, so a new book is a new
// combination rather than new code, and the voice module (bookAudio's Listen), the paragraph being said (spoken.tsx)
// and the library's own frame read them from here:
//   colour  -- ink (its mark), paper (the module's ground), faint (what is said quietly)
//   glyph   -- its sign, beside its name and the line being said
//   tempo   -- seconds to one breath: how fast the module moves while it speaks
//   wave    -- the shape its voice is drawn in: even (level, reasoned), swell (rising together), flicker (candle-like),
//              steps (the game's pixels), tide (two halves, balanced)
//   edge    -- the corner: 0 cut square, 4 a book's, 18 worn round
//   grain   -- how many bars the voice is drawn with: fine or coarse
//   type    -- how its names are set: caps or as written, upright or italic
// Every look is DRAFT.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Wave = "even" | "swell" | "flicker" | "steps" | "tide";
export type BookLook = {
  name: string; ink: string; paper: string; faint: string;
  glyph: string; tempo: number; wave: Wave; edge: number; grain: number;
  type: { caps: boolean; italic: boolean };
};

const look = (name: string, ink: string, paper: string, faint: string, glyph: string, tempo: number, wave: Wave,
              edge: number, grain: number, caps = true, italic = false): BookLook =>
  ({ name, ink, paper, faint, glyph, tempo, wave, edge, grain, type: { caps, italic } });

// keyed as the LIBRARY's shelf names them (Library.tsx); the recorded ones also as bookAudio names them
export const LOOKS: Record<string, BookLook> = {
  manual:   look("THE PLAYER'S MANUAL", "#6b5aa6", "#f1eef8", "#7d7596", "§", 3, "steps", 4, 16),
  quick:    look("QUICK START", "#a6825a", "#f7f1ea", "#8f7c66", "›", 1.6, "steps", 4, 12),
  social:   look("PLAYING TOGETHER", "#5a7fa6", "#edf2f8", "#6d8196", "⇄", 2.4, "swell", 12, 16),
  tiiny:    look("A BIGGER MIND", "#4f8a6e", "#ebf4ef", "#6b8a7a", "◇", 2.2, "even", 2, 20),
  word:     look("THE OLD WORD", "#8a6a4a", "#f6efe6", "#8c7a68", "δ", 4.5, "swell", 6, 14, false, true),
  school:   look("CALLOW SCHOOL", "#c4932f", "#fbf4e2", "#8f7a4c", "✎", 3.2, "even", 2, 18),
  textbook: look("PRINCIPLES OF MIND", "#c4932f", "#fbf4e2", "#8f7a4c", "✎", 3.2, "even", 2, 18),
  guide:    look("THE GUIDE", "#00c8ff", "#282a2e", "#78808a", "▣", 2, "steps", 0, 24),             // reason's voice: even, cut square
  subtle:   look("THE SUBTLE LAYER", "#e07ad0", "#2c1c32", "#9a86a0", "❀", 5, "swell", 18, 20, true, true),  // instinct's: warm, rounded
  hermetic: look("THE HERMETIC LAYER", "#50C878", "#0f1a15", "#8aa597", "☾", 8, "flicker", 2, 28),   // low and close, the night's breath
  eudaimon: look("THE EUDAIMON LAYER", "#C98A1E", "#FBF3E4", "#8C7357", "☀", 6, "swell", 10, 22, true, true),   // lighter, slower, the dawn
  unity:    look("THE UNITY BOOK", "#8E3F80", "#FFFDF8", "#756C7B", "◐", 5, "tide", 6, 26),         // one voice, leaned neither way
  origin:   look("THE ORIGIN OF A DAEMON", "#2C241E", "#C6BCA8", "#5E5242", "◎", 4, "swell", 4, 18),   // DAEMONS T-533: the game's ink on bone, the disc it began on
  notebook: look("NOTEBOOK", "#7a5a2e", "#f5efe4", "#8a7a62", "¶", 3, "even", 3, 14, false, false),
  songbook: look("SONGBOOK", "#2d6a74", "#e9f3f4", "#5f8389", "♪", 1.2, "swell", 18, 16),
  stream:   look("STREAM", "#3d4f8a", "#ecf0f8", "#6c7696", "≈", 4, "tide", 8, 22),
};
export const PLAIN: BookLook = look("", "#5b6b8c", "transparent", "#7a7f8a", "•", 3, "even", 4, 16);

const Ctx = createContext<BookLook | null>(null);
export const BookLookProvider = ({ look: l, children }: { look: BookLook | null; children: ReactNode }) =>
  <Ctx.Provider value={l}>{children}</Ctx.Provider>;
// the open book's look; a recorded book's own when it is heard outside the library (`fallback`)
export const useBookLook = (fallback?: string): BookLook => useContext(Ctx) ?? (fallback ? LOOKS[fallback] : undefined) ?? PLAIN;

// `ink` at an alpha, for a wash behind words
export const wash = (hex: string, a: number) => /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}` : hex;
// a dark paper: words on it are light
export const darkPaper = (l: BookLook) => {
  const m = /^#(..)(..)(..)$/.exec(l.paper);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 110;
};

// the book's breath, 0..1, on its own tempo -- moving only while `on`
export function useBreathOf(l: BookLook, on: boolean, every = 90) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setT(Date.now() / 1000), every);
    return () => clearInterval(id);
  }, [on, every]);
  return on ? (1 - Math.cos((2 * Math.PI * t) / l.tempo)) / 2 : 0;
}

// the height of bar i of n (0..1) at time t, in the book's wave
export function barHeight(l: BookLook, i: number, n: number, t: number, on: boolean): number {
  const x = i / Math.max(1, n - 1), ph = (2 * Math.PI * t) / l.tempo;
  if (!on) return 0.12 + 0.5 * barHeight(l, i, n, l.tempo / 8, true);   // at rest: a still frame of the book's own wave, lower
  switch (l.wave) {
    case "even": return 0.35 + 0.3 * Math.abs(Math.sin(ph * 2 + i * 0.9));
    case "steps": return Math.round((0.3 + 0.6 * Math.abs(Math.sin(ph * 2 + i * 1.7))) * 4) / 4;
    case "swell": return 0.25 + 0.7 * Math.sin(x * Math.PI) * (0.55 + 0.45 * Math.sin(ph + x * 2));
    case "flicker": return 0.2 + 0.5 * (0.5 + 0.5 * Math.sin(ph + i * 2.3)) * (0.7 + 0.3 * Math.sin(ph * 7 + i * 5.1));
    case "tide": { const half = x < 0.5 ? 1 : -1; return 0.3 + 0.55 * Math.abs(Math.sin(x * Math.PI * 2)) * (0.6 + 0.4 * Math.sin(ph * half)); }
  }
}
