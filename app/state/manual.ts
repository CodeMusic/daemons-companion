// C-233: THE PLAYER'S MANUAL -- DAEMONS' own PDF (DAEMONS docs/DAEMONS-manual.pdf, T-467, rebuilt by tools/manual.py at
// every release), fetched from DAEMONS on GitHub as published now, as the patches are (C-186). Nothing of it is in this
// repository. On the phone and iPad it is kept in the app's documents (manual/) and fetched again only when the one
// published has changed (its ETag); on the site it is fetched for the page and shown from memory. Since 2026-10-31 a
// second, PLAYING TOGETHER (docs/DAEMONS-social-manual.pdf: trading, loans, gifts, OUT TOGETHER, friends, dreams, THE
// COMMONS), kept the same way beside it; and a third, A BIGGER MIND (docs/DAEMONS-tiiny-manual.pdf: the Tiiny Pocket set up
// for the companion); and QUICK START (docs/DAEMONS-quickstart.pdf: what it is and how to play, step by step). C-264: and
// MICRO-START (docs/DAEMONS-microstart.pdf, five pages), first of the three HOW TO PLAY opens over the game. C-274: and
// THE OLD WORD (docs/DAEMONS-etymology.pdf, T-517: how daimon branched, and why it is said DAY-mons). C-276: and
// PRINCIPLES OF MIND (docs/DAEMONS-textbook.pdf, T-520: CALLOW SCHOOL's TEXTBOOK in full), opened from inside the school.
import { Directory, File, Paths } from "expo-file-system";
import { ON_PHONE } from "../platform/net";

export type Which = "player" | "quick" | "social" | "tiiny" | "micro" | "word" | "textbook" | "companion" | "watch";   // C-321: THE COMPANION; C-326: THE WATCH
const DOCS = "https://raw.githubusercontent.com/CodeMusic/DAEMONS/main/docs/";
const PDF: Record<Which, string> = { player: "DAEMONS-manual.pdf", quick: "DAEMONS-quickstart.pdf", social: "DAEMONS-social-manual.pdf", tiiny: "DAEMONS-tiiny-manual.pdf",
                                     micro: "DAEMONS-microstart.pdf", word: "DAEMONS-etymology.pdf",
                                     textbook: "DAEMONS-textbook.pdf", companion: "DAEMONS-companion-manual.pdf",
                                     watch: "DAEMONS-watch-manual.pdf" };
const INFO: Record<Which, string> = { player: "manual.json", quick: "quick.json", social: "social.json", tiiny: "tiiny.json", micro: "micro.json", word: "word.json",
                                      textbook: "textbook.json", companion: "companion.json", watch: "watch.json" };
export const manualUrl = (w: Which = "player") => DOCS + PDF[w];
export type Manual = { uri: string; release: string | null; etag: string | null; size: number; at: string };

export const manualDir = () => new Directory(Paths.document, "manual");
const pdfFile = (w: Which) => new File(manualDir(), PDF[w]);
const infoFile = (w: Which) => new File(manualDir(), INFO[w]);
function put(f: File, bytes: Uint8Array | string) { if (!f.exists) f.create(); f.write(bytes); }

// The release it was made for, as tools/manual.py writes it into the PDF's subject: "... every way to play it (v11.316.9)"
function releaseOf(bytes: Uint8Array): string | null {
  const read = (from: number, to: number) => {
    let s = "";
    for (let i = Math.max(0, from); i < Math.min(bytes.length, to); i += 0x8000)
      s += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, to)));
    return s;
  };
  for (const s of [read(0, 8192), read(bytes.length - 65536, bytes.length)]) {
    const m = /\/Subject\s*\((?:[^)\\]|\\.)*?\\\(v(\d+\.\d+\.\d+)\\\)/.exec(s);
    if (m) return m[1];
  }
  return null;
}

// The manual this device keeps, or null (always null on the site)
export function keptManual(w: Which = "player"): Manual | null {
  if (!ON_PHONE) return null;
  const f = infoFile(w);
  if (!f.exists || !pdfFile(w).exists) return null;
  try { return { ...(JSON.parse(f.textSync()) as Omit<Manual, "uri">), uri: pdfFile(w).uri }; } catch { return null; }
}

const shown: Record<Which, Manual | null> = { player: null, quick: null, social: null, tiiny: null, micro: null, word: null, textbook: null, companion: null, watch: null };   // the site's, for as long as the page is open
// asked afresh each time on the phone; on the site a header beyond the plain ones would need GitHub to allow it first
const FRESH: RequestInit = ON_PHONE ? { headers: { "cache-control": "no-cache" } } : {};

// The manual as published now: the one kept when it is still the newest, else fetched and (on the phone) kept. Throws
// with words the player can act on; a kept one is never replaced by a download that is not a whole PDF.
export async function freshManual(w: Which = "player"): Promise<Manual> {
  const kept = ON_PHONE ? keptManual(w) : shown[w];
  if (kept) {
    const head = await fetch(manualUrl(w), { ...FRESH, method: "HEAD" }).catch(() => null);
    const etag = head?.ok ? head.headers.get("etag") : null;
    if (!etag || etag === kept.etag) return kept;      // offline, or nothing newer: the one kept
  }
  const r = await fetch(manualUrl(w), FRESH);
  if (!r.ok) throw new Error(`The manual did not come down (${r.status}). Is this device online?`);   // DRAFT
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length < 1024 || String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-")
    throw new Error("The manual came down damaged. Try again.");   // DRAFT
  const info = { release: releaseOf(bytes), etag: r.headers.get("etag"), size: bytes.length, at: new Date().toISOString() };
  if (!ON_PHONE) {
    if (shown[w]) URL.revokeObjectURL(shown[w]!.uri);
    return (shown[w] = { ...info, uri: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })) });
  }
  if (!manualDir().exists) manualDir().create();
  put(pdfFile(w), bytes);
  put(infoFile(w), JSON.stringify(info));
  return { ...info, uri: pdfFile(w).uri };
}
