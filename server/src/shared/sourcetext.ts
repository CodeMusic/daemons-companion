// C-454: the text of a file a study keeps as a source (docs/RESEARCH.md: "extracting text from a PDF is the machine's,
// blobstore.ts's neighbour"). Node only -- api.ts alone imports it. Text files are read as UTF-8; a PDF by `pdftotext` when
// the machine has it, else by a small reader of its own: each content stream inflated and the strings its text operators
// show (Tj, TJ, ' and "). That reads most PDFs a word processor writes; one set in embedded CID fonts comes back empty,
// and the player is told to paste its text instead. Nothing here leaves the machine.
import { execFile } from "node:child_process";
import { inflateSync } from "node:zlib";

export const TEXT_MIMES = /^(text\/|application\/(json|xml|x-yaml|yaml|csv|markdown))/;
export const TEXT_NAMES = /\.(txt|md|markdown|csv|tsv|json|xml|ya?ml|html?|rtf|tex|org)$/i;

const decode = (bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000/g, "");

/** a PDF's literal string, its escapes undone */
function literal(s: string): string {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_, e: string) =>
    e === "n" ? "\n" : e === "r" ? "" : e === "t" ? "\t" : e === "b" || e === "f" ? "" : e === "(" || e === ")" || e === "\\" ? e
    : /^[0-7]+$/.test(e) ? String.fromCharCode(parseInt(e, 8)) : "");
}
/** the text a content stream shows, a line per text line (Td/TD/T* or ' break a line) */
function shown(ops: string): string {
  const out: string[] = [];
  let line = "";
  const re = /\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>|\[(?:\\.|[^\]])*\]|(?:Tj|TJ|'|"|Td|TD|T\*|ET|Tm)\b/g;
  let held: string[] = [];
  for (const m of ops.matchAll(re)) {
    const t = m[0];
    if (t.startsWith("(")) held.push(literal(t.slice(1, -1)));
    else if (t.startsWith("[")) {
      const parts: string[] = [];
      for (const x of t.matchAll(/\((?:\\.|[^\\)])*\)|(-?\d+(?:\.\d+)?)/g)) {
        if (x[0].startsWith("(")) parts.push(literal(x[0].slice(1, -1)));
        else if (Number(x[1]) < -180) parts.push(" ");             // a wide kern is a space between words
      }
      held.push(parts.join(""));
    } else if (t.startsWith("<")) held = [];                         // a hex string: a CID font, unreadable without its map
    else if (t === "Tj" || t === "TJ") { line += held.join(""); held = []; }
    else if (t === "'" || t === "\"") { out.push(line); line = held.join(""); held = []; }
    else if (t === "Td" || t === "TD" || t === "T*" || t === "Tm") { if (line.trim()) { out.push(line); line = ""; } held = []; }
    else if (t === "ET") { if (line.trim()) { out.push(line); line = ""; } held = []; }
  }
  if (line.trim()) out.push(line);
  return out.join("\n");
}
/** the text of a PDF, read without any tool: every stream inflated (FlateDecode) or taken as it is, its text operators read */
export function pdfText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes), raw = buf.toString("latin1"), parts: string[] = [];
  const re = /<<((?:(?!>>)[\s\S])*?)>>\s*stream\r?\n/g;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    const start = m.index + m[0].length, end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const dict = m[1];
    if (/\/(Image|XObject|FontFile|Metadata|XRef|ObjStm)\b/.test(dict) && !/\/Contents/.test(dict)) { re.lastIndex = end; continue; }
    let body = buf.subarray(start, end);
    if (/\/FlateDecode/.test(dict)) { try { body = inflateSync(body); } catch { re.lastIndex = end; continue; } }
    else if (/\/Filter/.test(dict)) { re.lastIndex = end; continue; }   // another filter: not text this reader knows
    const ops = body.toString("latin1");
    if (/\b(Tj|TJ)\b/.test(ops)) parts.push(shown(ops));
    re.lastIndex = end;
  }
  return parts.join("\n\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
/** pdftotext, where the machine has it: null when it has not, or it failed */
function pdftotext(bytes: Uint8Array): Promise<string | null> {
  return new Promise((done) => {
    try {
      const p = execFile("pdftotext", ["-layout", "-q", "-", "-"], { timeout: 20000, maxBuffer: 8 * 1024 * 1024 },
        (e, out) => done(e ? null : String(out)));
      p.on("error", () => done(null));
      p.stdin?.on("error", () => { /* it never started */ });
      p.stdin?.end(Buffer.from(bytes));
    } catch { done(null); }
  });
}
/** a source file's text, or "" when it cannot be read here; and how it was read */
export async function sourceText(bytes: Uint8Array, mime: string, name: string): Promise<{ text: string; how: string }> {
  if (TEXT_MIMES.test(mime) || TEXT_NAMES.test(name)) {
    let t = decode(bytes);
    if (/html?$/i.test(name) || /html/.test(mime)) t = t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
    return { text: t.replace(/[ \t]+/g, " ").trim(), how: "text" };
  }
  if (mime === "application/pdf" || /\.pdf$/i.test(name) || decode(bytes.subarray(0, 5)) === "%PDF-") {
    const viaTool = await pdftotext(bytes);
    if (viaTool && viaTool.trim()) return { text: viaTool.trim(), how: "pdftotext" };
    try { return { text: pdfText(bytes), how: "pdf" }; } catch { return { text: "", how: "pdf" }; }
  }
  return { text: "", how: "none" };
}
