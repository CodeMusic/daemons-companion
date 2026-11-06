// C-290: this file runs on the phone too (C-111) -- the app imports it (app/state/sealed.ts) -- so keep it free of Node-only APIs.
// C-277, C-299: the keys the third book's sealed recordings open with (DAEMONS tools/bookaudio.py seals them as
// tools/bookpdf.py seals the vaults), each read from its own book's first entry, so only a device that holds the book
// can open its recording. No key is written anywhere.

// the key, from the book's own warning, as bookpdf.py's author_of_hermetic() takes it; null when the warning names no one
export function keyOfWarning(text: string): string | null {
  const m = /\b([A-Z]{2,}) ([A-Z]{2,}) (?:set it down|read it)\b/.exec(text);   // C-299: the warning revised (5d0e7a0) says "read it"
  const title = (w: string) => w[0] + w.slice(1).toLowerCase();
  return m ? `${title(m[1])} ${title(m[2])}` : null;
}

// C-299: a torn book's key, read from that book's own first entry as tools/bookpdf.py's vault_key() reads it -- the night
// half's WARNING (its reader's name), the dawn half's BLESSING ("A ... read it": its reader, with The), the mended book's
// ATTESTATION ("by a ..., and one ... by a ...": both readers, joined with and). Never written anywhere else.
export type TornBook = "hermetic" | "eudaimon" | "unity";
export function keyOfBook(book: TornBook, text: string): string | null {
  const title = (w: string) => w[0].toUpperCase() + w.slice(1).toLowerCase();
  if (book === "eudaimon") { const m = /\bA ([A-Z]{2,}) read it\b/.exec(text); return m ? `The ${title(m[1])}` : null; }
  if (book === "unity") { const m = /\bby an? (\w+), and one [^.]*? by an? (\w+)\./.exec(text); return m ? `${title(m[1])} and ${title(m[2])}` : null; }
  return keyOfWarning(text);
}
