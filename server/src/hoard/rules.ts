// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-598, C-599 (C-596; the user, 2026-11-27): THE HOARD's RULES -- the household's own local cloud storage, the storage
// twin of THE MIND. Everything here is a plain answer about plain values, so the hub and the phone give the same one
// and a test can ask each of them:
//
//   WHO MAY READ   its owner, always. The household, while it is shared with the household. Whoever holds a friend's
//                  link, while it is shared with a friend. A share lasts for always, for a limited time, or only
//                  until someone other than its owner has successfully downloaded it.
//   WHEN A SHARE ENDS the file is its owner's alone again: it is not removed (DRAFT -- the user was asked nothing
//                  about this; removing a person's file on a timer is the wrong way to be wrong).
//   WHO MAY REMOVE only the owner who posted it. A keeper of THE HOARD, in THE ENGINE ROOM, may delete any file.
//   WHEN IT IS FULL by hand, or the oldest first, only as much as a newer file needs -- never a PROTECTED file.
//   WHERE IT IS KEPT one copy on an EXTEND node (the one with the most room), and one on every REPLICA node. EXTEND
//                  adds capacity; REPLICA adds none and holds a copy of everything, so a file is still reachable when
//                  one source is offline.
// Every word a person reads is DRAFT.

export type Share = "me" | "household" | "friend";
export const SHARES: Share[] = ["me", "household", "friend"];
export type Kind = "file" | "spoken" | "magic" | "video" | "answer";       // what it is: a file put here, or a creation
export const KINDS: Kind[] = ["file", "spoken", "magic", "video", "answer"];

export type HoardFile = {
  id: string; sha: string; size: number; name: string; mime: string;
  owner: string; ownerName: string;         // the person who posted it (a paired key, or the keys set together as one)
  added: number;                            // ms
  share: Share; friend: string | null;      // a friend share's name, as its owner wrote it
  until: number | null;                     // ms the share ends; null: always
  once: boolean; taken: number | null;      // ends at the first download by someone else, and when that was
  protected: boolean;                       // never cleaned up automatically
  how: "copy" | "move";                     // a backup (the device kept its own), or moved here (the device let go)
  kind: Kind; of: string | null;            // a creation, and the file it was made of
  meta: Record<string, unknown>;
};

/** who is asking: a person (their key, or the keys set together as one), a keeper in THE ENGINE ROOM, a friend's link */
export type Who = { key: string; name: string; keeper?: boolean; link?: string };

// ---- how long a share lasts ----
export type Lasting = { minutes?: number | null; once?: boolean };
export const MOST_MINUTES = 366 * 24 * 60;       // a limited time is at most a year (DRAFT)
/** what a person asked for, made safe: a whole number of minutes from 1 to a year, or always */
export function lastingOf(l: Lasting | null | undefined, now: number): { until: number | null; once: boolean } {
  const m = Math.floor(Number(l?.minutes));
  return { until: Number.isFinite(m) && m >= 1 ? now + Math.min(m, MOST_MINUTES) * 60_000 : null, once: l?.once === true };
}
/** a time in minutes as days, hours and minutes (the three the user named) */
export const minutesOf = (days = 0, hours = 0, minutes = 0) => Math.max(0, Math.floor(days)) * 1440 + Math.max(0, Math.floor(hours)) * 60 + Math.max(0, Math.floor(minutes));

/** has its share ended -- by its time, or by the one download it was for */
export const shareEnded = (f: Pick<HoardFile, "until" | "once" | "taken">, now: number) =>
  (f.until !== null && now >= f.until) || (f.once && f.taken !== null);
/** how it is shared now: what was asked for, until that ends; then its owner's alone */
export const shareNow = (f: Pick<HoardFile, "share" | "until" | "once" | "taken">, now: number): Share => (shareEnded(f, now) ? "me" : f.share);

// ---- who may do what ----
export const isOwner = (f: Pick<HoardFile, "owner">, who: Who) => !!who.key && who.key === f.owner;
/** may this caller read it now. `linkOf` is the hash the file keeps of its friend's link; a link opens only its own file */
export function canRead(f: HoardFile & { link?: string | null }, who: Who, now: number): boolean {
  if (isOwner(f, who)) return true;
  const s = shareNow(f, now);
  if (s === "household") return !!who.key;                  // anyone of the household (a paired key)
  if (s === "friend") return !!who.link && !!f.link && who.link === f.link;
  return false;
}
/** a keeper may see that any file is there (its name, owner and size), to manage it -- seeing is not reading */
export const canSee = (f: HoardFile & { link?: string | null }, who: Who, now: number) => who.keeper === true || canRead(f, who, now);
/** only the owner who posted it; a keeper, in THE ENGINE ROOM, any */
export const canRemove = (f: Pick<HoardFile, "owner">, who: Who) => isOwner(f, who) || who.keeper === true;
/** its share, name and PROTECTED: the owner's; PROTECTED also a keeper's */
export const canChange = (f: Pick<HoardFile, "owner">, who: Who) => isOwner(f, who);
export const canProtect = (f: Pick<HoardFile, "owner">, who: Who) => isOwner(f, who) || who.keeper === true;
/** does this download end the share: someone other than its owner took a once-only file whole */
export const endsShare = (f: HoardFile, who: Who, now: number) => f.once && f.taken === null && !isOwner(f, who) && !shareEnded(f, now);

// ---- when it is full ----
export type FullPolicy = "manual" | "oldest";
export const POLICIES: FullPolicy[] = ["manual", "oldest"];
/** which files to remove so `need` more bytes fit: the oldest first, never a protected one, only as many as it takes.
 *  A blob two files share is freed only when both go, so bytes are counted by blob. null: it cannot be made to fit */
export function cleanUpFor(files: Pick<HoardFile, "id" | "sha" | "size" | "added" | "protected">[], free: number, need: number): string[] | null {
  if (need <= free) return [];
  const held = new Map<string, number>();
  for (const f of files) held.set(f.sha, (held.get(f.sha) ?? 0) + 1);
  const go: string[] = [];
  let room = free;
  for (const f of files.filter((x) => !x.protected).sort((a, b) => a.added - b.added || a.id.localeCompare(b.id))) {
    go.push(f.id);
    const left = (held.get(f.sha) ?? 1) - 1;
    held.set(f.sha, left);
    if (left === 0) room += f.size;
    if (room >= need) return go;
  }
  return null;
}

// ---- the offers, and where each blob is kept ----
export type OfferKind = "extend" | "replica";
export const OFFER_KINDS: OfferKind[] = ["extend", "replica"];
export type Holder = { id: string; kind: OfferKind; offer: number; state: "on" | "retiring" | "gone"; fresh: boolean };
export type Copy = { sha: string; node: string; state: "want" | "have" | "drop" };
export type Blob = { sha: string; size: number };

/** THE HOARD's size: every EXTEND offer added together. A REPLICA adds none */
export const capacityOf = (nodes: Holder[]) => nodes.filter((n) => n.kind === "extend" && n.state === "on").reduce((s, n) => s + Math.max(0, n.offer), 0);
/** what is kept: each blob once, however many files or copies there are of it */
export const usedOf = (blobs: Blob[]) => blobs.reduce((s, b) => s + b.size, 0);

/** Where every blob should be, given where it is: the changes to make -- a copy to WANT, or one to DROP.
 *  One copy on an EXTEND node that is on (kept where it is; a new one goes to the node with the most room, a fresh
 *  one before one that is away); one on every REPLICA node that is on and has the room. A RETIRING node's copy is
 *  dropped once the blob is held elsewhere; a blob no file names any more is dropped everywhere. */
export function plan(blobs: Blob[], nodes: Holder[], copies: Copy[]): Copy[] {
  const out: Copy[] = [];
  const by = new Map<string, Copy[]>();
  for (const c of copies) by.set(c.sha, [...(by.get(c.sha) ?? []), c]);
  const node = new Map(nodes.map((n) => [n.id, n]));
  const size = new Map(blobs.map((b) => [b.sha, b.size]));
  // what each node is already asked to keep
  const load = new Map<string, number>();
  for (const c of copies) if (c.state !== "drop" && size.has(c.sha)) load.set(c.node, (load.get(c.node) ?? 0) + (size.get(c.sha) ?? 0));
  const room = (n: Holder) => n.offer - (load.get(n.id) ?? 0);
  const set = (sha: string, id: string, state: Copy["state"]) => { out.push({ sha, node: id, state }); };

  for (const b of blobs) {
    const cs = (by.get(b.sha) ?? []).filter((c) => c.state !== "drop");
    const on = (c: Copy, kind: OfferKind) => { const n = node.get(c.node); return !!n && n.state === "on" && n.kind === kind; };
    // the EXTEND copy
    if (!cs.some((c) => on(c, "extend"))) {
      const able = nodes.filter((n) => n.kind === "extend" && n.state === "on" && room(n) >= b.size && !cs.some((c) => c.node === n.id))
        .sort((a, z) => Number(z.fresh) - Number(a.fresh) || room(z) - room(a) || a.id.localeCompare(z.id));
      if (able[0]) { set(b.sha, able[0].id, "want"); load.set(able[0].id, (load.get(able[0].id) ?? 0) + b.size); }
    }
    // every REPLICA
    for (const n of nodes.filter((x) => x.kind === "replica" && x.state === "on"))
      if (!cs.some((c) => c.node === n.id) && room(n) >= b.size) { set(b.sha, n.id, "want"); load.set(n.id, (load.get(n.id) ?? 0) + b.size); }
    // a retiring or gone node lets go once another node that is on HAS it
    const safe = cs.some((c) => c.state === "have" && node.get(c.node)?.state === "on");
    for (const c of cs) { const n = node.get(c.node); if ((!n || n.state !== "on") && (safe || !n || n.state === "gone")) set(b.sha, c.node, "drop"); }
  }
  // a blob no file names any more
  for (const c of copies) if (c.state !== "drop" && !size.has(c.sha)) set(c.sha, c.node, "drop");
  return out;
}

/** is every blob safe now: held by at least one node that is on */
export const held = (b: Blob, nodes: Holder[], copies: Copy[]) =>
  copies.some((c) => c.sha === b.sha && c.state === "have" && nodes.some((n) => n.id === c.node && n.state !== "gone"));

// ---- names and kinds ----
/** a file's name as it is kept: no path, no control characters, 200 at most */
export const cleanName = (name: unknown) => (String(name ?? "").replace(/[\u0000-\u001f\u007f]/g, "").split(/[\\/]/).pop() ?? "").trim().slice(0, 200) || "a file";
const MIMES: Record<string, string> = {
  txt: "text/plain", md: "text/markdown", json: "application/json", csv: "text/csv", html: "text/html", log: "text/plain", rtf: "text/rtf",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", aac: "audio/aac", opus: "audio/ogg",
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/mp4", webm: "video/webm", mkv: "video/x-matroska",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", heic: "image/heic", bmp: "image/bmp",
  pdf: "application/pdf", zip: "application/zip", sav: "application/octet-stream",
};
/** its kind of content: what the sender said when that is a plain type, else by its name, else bytes */
export function mimeOf(name: string, said?: unknown): string {
  const s = String(said ?? "").toLowerCase().split(";")[0].trim();
  if (/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(s) && s !== "application/octet-stream") return s;
  return MIMES[(name.split(".").pop() ?? "").toLowerCase()] ?? "application/octet-stream";
}
/** how the app looks at it */
export type Looks = "audio" | "video" | "text" | "image" | "other";
export function looksOf(mime: string): Looks {
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/") || mime === "application/json") return "text";
  return "other";
}
/** bytes as a person reads them */
export function sizeSaid(n: number): string {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, x = Math.max(0, n);
  while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
  return `${i === 0 ? x : x >= 100 ? Math.round(x) : Math.round(x * 10) / 10} ${u[i]}`;
}
