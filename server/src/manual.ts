// C-233 on the devices (the user, 2026-10-29: "I want to make sure all 3 books and user manual ,etc are all on the tab5"):
// THE PLAYER'S MANUAL as words a device can read -- the app shows DAEMONS' PDF, which a Tab5 cannot draw. Its source,
// DAEMONS docs/manual/manual.md as published now, read into chapters (a # heading), each of sections (a ##), each of
// paragraphs: the formatting taken out, a table read row by row ("you knew: here it is"), and the build's own pieces
// (screens, the patch list) left out -- they are pictures and tables the PDF prints. Kept by its ETag, so a device asking
// again costs one HEAD. No node: imports.
import type { Store } from "./store.js";
import patchesJson from "../data/patches.json" with { type: "json" };

export const MANUAL_MD = "https://raw.githubusercontent.com/CodeMusic/DAEMONS/main/docs/manual/manual.md";
export type ManualSection = { title: string; paragraphs: string[] };
export type ManualChapter = { title: string; sections: ManualSection[] };
export interface ManualText { title: string; release: string | null; chapters: ManualChapter[] }

const P = patchesJson as unknown as { latest?: string; releases?: { version: string; bible?: string }[] };
const plain = (s: string) => s
  .replace(/\s*\{[#.][^}]*\}\s*$/, "")                         // a heading's {#id .class}
  .replace(/!\[[^\]]*\]\([^)]*\)/g, "")                        // a picture
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")                     // a link: its words
  .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1$2").replace(/`([^`]+)`/g, "$1")
  .replace(/\s+/g, " ").trim();

export function manualText(md: string, release = P.latest ?? null): ManualText {
  const r = P.releases?.find((x) => x.version === release);
  const vars: Record<string, string> = { release: release ? `v${release}` : "this release", bible: r?.bible ? `v${r.bible}` : "", date: "" };
  const chapters: ManualChapter[] = [];
  let ch: ManualChapter | null = null, sec: ManualSection | null = null, para: string[] = [];
  const flush = () => {
    const t = plain(para.join(" ")); para = [];
    if (!t) return;
    if (!ch) { ch = { title: "THE PLAYER'S MANUAL", sections: [] }; chapters.push(ch); }
    if (!sec) { sec = { title: "", paragraphs: [] }; ch.sections.push(sec); }
    sec.paragraphs.push(t);
  };
  for (const raw of md.split("\n")) {
    const line = raw.replace(/\{\{\s*(release|bible|date)\s*\}\}/g, (_, k) => vars[k] ?? "").replace(/\s*\(\s*\)/g, "");
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const title = plain(h[2]);
      if (h[1] === "#") { ch = { title, sections: [] }; chapters.push(ch); sec = null; }
      else { if (!ch) { ch = { title: "THE PLAYER'S MANUAL", sections: [] }; chapters.push(ch); } sec = { title, paragraphs: [] }; ch.sections.push(sec); }
      continue;
    }
    if (/^\s*\{\{.*\}\}\s*$/.test(line) || /^:::/.test(line)) { flush(); continue; }   // the build's pictures and lists; a box's fence
    if (/^\s*\|/.test(line)) {                                                          // a table, a row at a time
      flush();
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => plain(c));
      if (cells.every((c) => /^:?-*:?$/.test(c))) continue;                             // its rule
      const said = cells.filter(Boolean);
      if (said.length) para.push(said.length === 2 ? `${said[0]}: ${said[1]}` : said.join(" · ")), flush();
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) { flush(); para.push(line.replace(/^\s*[-*]\s+/, "• ")); continue; }
    para.push(line);
  }
  flush();
  return { title: "THE PLAYER'S MANUAL", release, chapters: chapters.filter((c) => c.sections.length) };
}

// the manual as published now, kept by its ETag; the copy kept when GitHub does not answer
const FRESH_MS = 10 * 60 * 1000;   // a device asks every half minute; GitHub is asked at most every ten
export async function fetchManualText(store: Store, f: typeof fetch = fetch, now = Date.now()): Promise<ManualText | { error: string }> {
  let kept: { etag: string | null; text: ManualText; at?: number } | null = null;
  try { kept = JSON.parse(store.getSetting("manual.text") ?? "null"); } catch { /* none kept */ }
  if (kept?.at && now - kept.at < FRESH_MS) return kept.text;
  try {
    const r = await f(MANUAL_MD, kept?.etag ? { headers: { "if-none-match": kept.etag } } : {});
    if (r.status === 304 && kept) { store.setSetting("manual.text", JSON.stringify({ ...kept, at: now })); return kept.text; }
    if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
    const text = manualText(await r.text());
    store.setSetting("manual.text", JSON.stringify({ etag: r.headers.get("etag"), text, at: now }));
    return text;
  } catch (e) {
    return kept?.text ?? { error: `the manual could not be fetched: ${(e as Error).message}` };   // DRAFT
  }
}
