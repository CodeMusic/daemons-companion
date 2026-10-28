// C-233: THE PLAYER'S MANUAL -- DAEMONS' own PDF (DAEMONS docs/DAEMONS-manual.pdf, T-467, rebuilt by tools/manual.py at
// every release), fetched from DAEMONS on GitHub as published now, as the patches are (C-186). Nothing of it is in this
// repository. On the phone and iPad it is kept in the app's documents (manual/) and fetched again only when the one
// published has changed (its ETag); on the site it is fetched for the page and shown from memory.
import { Directory, File, Paths } from "expo-file-system";
import { ON_PHONE } from "./net";

export const MANUAL_URL = "https://raw.githubusercontent.com/CodeMusic/DAEMONS/main/docs/DAEMONS-manual.pdf";
export type Manual = { uri: string; release: string | null; etag: string | null; size: number; at: string };

export const manualDir = () => new Directory(Paths.document, "manual");
const pdfFile = () => new File(manualDir(), "DAEMONS-manual.pdf");
const infoFile = () => new File(manualDir(), "manual.json");
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
export function keptManual(): Manual | null {
  if (!ON_PHONE) return null;
  const f = infoFile();
  if (!f.exists || !pdfFile().exists) return null;
  try { return { ...(JSON.parse(f.textSync()) as Omit<Manual, "uri">), uri: pdfFile().uri }; } catch { return null; }
}

let shown: Manual | null = null;   // the site's, for as long as the page is open
// asked afresh each time on the phone; on the site a header beyond the plain ones would need GitHub to allow it first
const FRESH: RequestInit = ON_PHONE ? { headers: { "cache-control": "no-cache" } } : {};

// The manual as published now: the one kept when it is still the newest, else fetched and (on the phone) kept. Throws
// with words the player can act on; a kept one is never replaced by a download that is not a whole PDF.
export async function freshManual(): Promise<Manual> {
  const kept = ON_PHONE ? keptManual() : shown;
  if (kept) {
    const head = await fetch(MANUAL_URL, { ...FRESH, method: "HEAD" }).catch(() => null);
    const etag = head?.ok ? head.headers.get("etag") : null;
    if (!etag || etag === kept.etag) return kept;      // offline, or nothing newer: the one kept
  }
  const r = await fetch(MANUAL_URL, FRESH);
  if (!r.ok) throw new Error(`The manual did not come down (${r.status}). Is this device online?`);   // DRAFT
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length < 1024 || String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-")
    throw new Error("The manual came down damaged. Try again.");   // DRAFT
  const info = { release: releaseOf(bytes), etag: r.headers.get("etag"), size: bytes.length, at: new Date().toISOString() };
  if (!ON_PHONE) {
    if (shown) URL.revokeObjectURL(shown.uri);
    shown = { ...info, uri: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })) };
    return shown;
  }
  if (!manualDir().exists) manualDir().create();
  put(pdfFile(), bytes);
  put(infoFile(), JSON.stringify(info));
  return { ...info, uri: pdfFile().uri };
}
