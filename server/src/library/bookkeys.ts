// C-290: this file runs on the phone too (C-111) -- the app imports it (app/state/sealed.ts) -- so keep it free of Node-only APIs.
// C-277, C-299: the keys the third book's sealed recordings open with (DAEMONS tools/bookaudio.py seals them as
// tools/bookpdf.py seals the vaults), each read from its own book's first entry, so only a device that holds the book
// can open its recording. DAEMONS T-533: THE ORIGIN OF A DAEMON's recording is sealed the same way, its key read from the
// book's last page instead (keyOfOrigin). No key is written anywhere.

// the key, from the book's own warning, as bookpdf.py's author_of_hermetic() takes it; null when the warning names no one
export function keyOfWarning(text: string): string | null {
  const m = /\b([A-Z]{2,}) ([A-Z]{2,}) (?:set it down|read it)\b/.exec(text);   // C-299: the warning revised (5d0e7a0) says "read it"
  const title = (w: string) => w[0] + w.slice(1).toLowerCase();
  return m ? `${title(m[1])} ${title(m[2])}` : null;
}

// DAEMONS T-533: THE ORIGIN OF A DAEMON's key -- the last word of its last page, in title case, read as tools/bookpdf.py's
// vault_key('origin', ...) reads it: the last section's last entry, its paragraphs joined, matched at its very end. A device
// holds that page only once every section of the book has come back (GET /api/origin's `whole`). Never written anywhere
// else; null when the page no longer ends the book that way.
export function keyOfOrigin(text: string): string | null {
  const m = /\bThat is how I (\w+)\.\s*$/.exec(text);
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : null;
}

// C-299: a torn book's key, read from that book's own first entry as tools/bookpdf.py's vault_key() reads it -- the night
// half's WARNING (its reader's name), the dawn half's BLESSING ("A ... read it": its reader, with The), the mended book's
// ATTESTATION ("by a ..., and one ... by a ...": both readers, joined with and). Never written anywhere else.
// DAEMONS T-533: a sealed book's key is either of those or THE ORIGIN OF A DAEMON's, from its last page (keyOfOrigin).
export type TornBook = "hermetic" | "eudaimon" | "unity";
export type SealedBook = TornBook | "origin";
export function keyOfBook(book: SealedBook, text: string): string | null {
  const title = (w: string) => w[0].toUpperCase() + w.slice(1).toLowerCase();
  if (book === "origin") return keyOfOrigin(text);
  if (book === "eudaimon") { const m = /\bA ([A-Z]{2,}) read it\b/.exec(text); return m ? `The ${title(m[1])}` : null; }
  if (book === "unity") { const m = /\bby an? (\w+), and one [^.]*? by an? (\w+)\./.exec(text); return m ? `${title(m[1])} and ${title(m[2])}` : null; }
  return keyOfWarning(text);
}
