// C-209 (the user, 2026-10-28, by multiple choice: "Asking the GUIDE"): once the GUIDE is found, a question asked of it
// -- by voice on the watch, or in the app -- is answered by the GUIDE itself, from its own pages. The pages nearest the
// question (by the words they share with it, the common ones left out) go to the model with the question, and the model
// answers as the book: only from them, briefly, in its own plain voice. No node: imports.
import type { Guide } from "./save/guide.js";

const COMMON = new Set(("the a an and or but of to in on at for with is are was were be been it its this that these those i you your " +
  "my me we our they them he she his her what why how when where who which do does did can could would should will " +
  "not no so if as by from about into than then there here have has had just").split(" "));
const words = (t: string) => (t.toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => w.length > 2 && !COMMON.has(w));

export type Passage = { title: string; text: string };
// the pages nearest the question: each entry scored by the question's words it holds (a title's count twice), the best
// few kept, their words cut to what a short window takes
export function guidePassages(g: Guide, question: string, most = 2, chars = 700): Passage[] {
  if (!g.held || !g.sections) return [];
  const q = new Set(words(question));
  const scored = (g.sections as { entries: { title: string; paragraphs: string[] }[] }[]).flatMap((s) => s.entries).map((e) => {
    const body = words(e.paragraphs.join(" ")), title = words(e.title);
    const score = body.filter((w) => q.has(w)).length + 2 * title.filter((w) => q.has(w)).length;
    return { e, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, most);
  const per = Math.floor(chars / Math.max(1, scored.length));
  return scored.map(({ e }) => ({ title: e.title, text: e.paragraphs.join(" ").replace(/\s+/g, " ").slice(0, per) }));
}

// what the model is told (never shown): who answers, from what, and how
export function guidePersona(passages: Passage[]): string {
  return ["You are THE GUIDE, a small book the user found and carries. You answer their question as the book would,",
          "only from your own pages below, in one to three short plain sentences. If the pages do not answer it, say the",
          "book does not cover that, and point to the nearest page by its title. Never say you are an AI or a model.",
          ...passages.map((p) => `Page "${p.title}": ${p.text}`)].join(" ");
}
