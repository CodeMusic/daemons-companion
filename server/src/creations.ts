// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-358 (the user, 2026-11-14: "this is where a community & household feature comes in, and we should implement it in A
// general way so we apply it to other generative content we make"): a CREATION is anything a daemon made -- a night's
// sleep sounds first, a painting from THE EASEL next -- in one shape, so one gallery shows any of them:
//
//   MINE       what this device has downloaded (the app keeps the files and this row beside them)
//   HOUSEHOLD  everything this hub keeps, from every device of the home -- ✓ on what is on this device
//   COMMUNITY  what homes shared to THE COMMONS (an account needed to look, and to share)
//
// A creation's `id` is the hub's own for it, and `uid` says it everywhere: `<kind>:<id>@<home>` -- the same piece on the
// phone, the hub, the commons or inside an exported file (PulseEntrain's generation.daemons) is known as one.
// Every word DRAFT.

export type CreationKind = "sleep" | "painting";
export type Creation = {
  uid: string; kind: CreationKind; id: string; home: string;
  title: string; about: string;
  made: string;                                   // when it was made (or asked, while still being made)
  state: "making" | "ready" | "failed";
  daemon: { nickname: string; species: number; types?: string[] };
  by: string | null;                               // the device that asked: a phone's own name, or a device's id
  cover: string | null;                            // the picture's path on the hub (null while it is painted)
  files: Record<string, string>;                   // name -> path on the hub
  meta: Record<string, string | number | boolean | null>;   // what the kind has to say (a sleep piece: key, bpm, beats)
  bytes?: number;
};

export const uidOf = (kind: CreationKind, id: string, home: string) => `${kind}:${id}@${home}`;
export const KIND_SAID: Record<CreationKind, string> = { sleep: "SLEEP SOUNDS", painting: "PAINTINGS" };   // DRAFT

// a sleep piece (sleeptracks.ts SleepTrack) as a creation
export type SleepRow = {
  id: string; species: number; nickname: string; caption: string; bpm: number; keyscale: string; said: string;
  state: "making" | "ready" | "failed"; asked: string; made?: string; seconds?: number;
  bytes?: { phone: number }; by?: string; title?: string; about?: string; cover?: string; types?: string[];
};
export function sleepCreation(t: SleepRow, home: string, beats: string, carrierHz: number): Creation {
  const base = `/api/sleep/track/${t.id}`;
  return {
    uid: uidOf("sleep", t.id, home), kind: "sleep", id: t.id, home,
    title: t.title || `${t.nickname || "A daemon"}'s night`.toUpperCase(),   // DRAFT: until its cover's title is painted
    about: t.about || t.said,
    made: t.made ?? t.asked, state: t.state,
    daemon: { nickname: t.nickname, species: t.species, ...(t.types ? { types: t.types } : {}) },
    by: t.by ?? null,
    cover: t.cover === "ready" ? `${base}/cover.png` : null,
    files: t.state === "ready" ? { "phone.m4a": `${base}/phone.m4a`, "export.mp3": `${base}/export.mp3`,
                                    "export-drift.mp3": `${base}/export-drift.mp3`, "export.imedx": `${base}/export.imedx` } : {},
    meta: { keyscale: t.keyscale, bpm: t.bpm, seconds: t.seconds ?? null, carrierHz, beats, caption: t.caption,
            painting: t.cover === "painting" },
    ...(t.bytes?.phone ? { bytes: t.bytes.phone } : {}),
  };
}

// a painting (THE EASEL's row) as a creation
export type PaintingRow = { id: string; at: string; species: number; nickname: string; types?: string[]; title: string;
                            about: string; request: string; state: "painting" | "done" | "failed"; by?: string };
export function paintingCreation(p: PaintingRow, home: string): Creation {
  const png = `/art/paintings/${p.id}.png`;
  return {
    uid: uidOf("painting", p.id, home), kind: "painting", id: p.id, home,
    title: p.title || "UNTITLED", about: p.about, made: p.at,
    state: p.state === "done" ? "ready" : p.state === "painting" ? "making" : "failed",
    daemon: { nickname: p.nickname, species: p.species, ...(p.types ? { types: p.types } : {}) },
    by: p.by ?? null,
    cover: p.state === "done" ? png : null,
    files: p.state === "done" ? { "painting.png": png } : {},
    meta: { request: p.request },
  };
}

// The gallery's filters: by kind; ONLY WHAT I DON'T HAVE hides what this device keeps
export function gallery(all: Creation[], o: { kind?: CreationKind | null; have?: Set<string>; missingOnly?: boolean } = {}): Creation[] {
  return all
    .filter((c) => !o.kind || c.kind === o.kind)
    .filter((c) => !(o.missingOnly && o.have?.has(c.uid)))
    .sort((a, b) => b.made.localeCompare(a.made));
}

// The beats DRIFT DOWN steps through, as PulseEntrain's tracks show them -- "10 → 6 → 2 Hz"
export const beatsSaid = (beats: readonly number[]) => `${beats.join(" → ")} Hz`;
