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

export type CreationKind = "sleep" | "painting" | "song";
export type Creation = {
  uid: string; kind: CreationKind; id: string; home: string;
  title: string; about: string;
  made: string;                                   // when it was made (or asked, while still being made)
  state: "making" | "ready" | "failed";
  daemon: { nickname: string; species: number; types?: string[] };
  by: string | null;                               // the device that asked: a phone's own name, or a device's id
  cover: string | null;                            // the picture's path on the hub (null while it is painted)
  thumb?: string | null;                           // C-413: its small copy (256px JPEG), for a page that shows many
  files: Record<string, string>;                   // name -> path on the hub
  meta: Record<string, string | number | boolean | null>;   // what the kind has to say (a sleep piece: key, bpm, beats)
  bytes?: number;
};

export const uidOf = (kind: CreationKind, id: string, home: string) => `${kind}:${id}@${home}`;
export const KIND_SAID: Record<CreationKind, string> = { sleep: "SLEEP SOUNDS", painting: "PAINTINGS", song: "SONGS" };   // DRAFT

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
    cover: t.cover === "ready" ? `${base}/cover.png` : null, thumb: t.cover === "ready" ? `${base}/cover-small.jpg` : null,
    files: t.state === "ready" ? { "phone.m4a": `${base}/phone.m4a`, "export.mp3": `${base}/export.mp3`,
                                    "export-drift.mp3": `${base}/export-drift.mp3`, "export.imedx": `${base}/export.imedx` } : {},
    meta: { keyscale: t.keyscale, bpm: t.bpm, seconds: t.seconds ?? null, carrierHz, beats, caption: t.caption,
            painting: t.cover === "painting" },
    ...(t.bytes?.phone ? { bytes: t.bytes.phone } : {}),
  };
}

// a painting (THE EASEL's row) as a creation
export type PaintingRow = { id: string; at: string; species: number; nickname: string; types?: string[]; title: string;
                            about: string; request: string; state: "painting" | "done" | "failed"; by?: string;
                            error?: string };   // C-404: why it failed, as the easel kept it
export function paintingCreation(p: PaintingRow, home: string): Creation {
  const png = `/art/paintings/${p.id}.png`;
  return {
    uid: uidOf("painting", p.id, home), kind: "painting", id: p.id, home,
    title: p.title || "UNTITLED", about: p.about, made: p.at,
    state: p.state === "done" ? "ready" : p.state === "painting" ? "making" : "failed",
    daemon: { nickname: p.nickname, species: p.species, ...(p.types ? { types: p.types } : {}) },
    by: p.by ?? null,
    cover: p.state === "done" ? png : null, thumb: p.state === "done" ? `/art/paintings/${p.id}-small.jpg` : null,
    files: p.state === "done" ? { "painting.png": png } : {},
    meta: { request: p.request, error: p.state === "failed" ? p.error ?? null : null },   // C-404
  };
}

// C-362: a song (songs.ts Song) as a creation -- its lyrics and style in meta, for the player
export type SongRow = { id: string; mode: string; title: string; style: string; lyrics: string; about: string; request: string;
                        species: number; nickname: string; types?: string[]; by?: string; state: "writing" | "singing" | "ready" | "failed";
                        asked: string; made?: string; seconds?: number; bytes?: number; cover?: string; error?: string };
export function songCreation(x: SongRow, home: string): Creation {
  const base = `/api/song/${x.id}`;
  return {
    uid: uidOf("song", x.id, home), kind: "song", id: x.id, home,
    title: x.title || (x.state === "writing" ? "being written…" : "UNTITLED"), about: x.about,
    made: x.made ?? x.asked, state: x.state === "ready" ? "ready" : x.state === "failed" ? "failed" : "making",
    daemon: { nickname: x.nickname, species: x.species, ...(x.types ? { types: x.types } : {}) },
    by: x.by ?? null,
    cover: x.cover === "ready" ? `${base}/cover.png` : null, thumb: x.cover === "ready" ? `${base}/cover-small.jpg` : null,
    files: x.state === "ready" ? { "phone.m4a": `${base}/phone.m4a`, "export.mp3": `${base}/export.mp3` } : {},
    meta: { lyrics: x.lyrics, style: x.style, mode: x.mode, request: x.request, seconds: x.seconds ?? null,
            stage: x.state, painting: x.cover === "painting", error: x.error ?? null },
    ...(x.bytes ? { bytes: x.bytes } : {}),
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
