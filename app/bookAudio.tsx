// C-277 (the user, 2026-11-03: "for any book we have recorings we should link to the (git audio ideally for storage
// reasons) and be able to listen to the book. inside would be an option to play it, along with a similar share button so
// u could sent it or save it to files"): LISTEN inside each book that has a recording -- DAEMONS' MP3s (docs/books/audio,
// made by tools/bookaudio.py, T-518, each book in its own voice), streamed from DAEMONS on GitHub as published; nothing
// of them is in this repository. The chapters beside each MP3 step it back and on, and where it was left is kept. SHARE
// keeps the book in the app's documents (audio/) and hands it on, to Files or anyone, as the manuals' PDFs are
// (manual.ts); on the site, a tab. THE HERMETIC LAYER's recording is sealed in DAEMONS: once the book is held, the device
// opens it with the key the book's own warning gives (sealed.ts) and keeps it (the user, by multiple choice: "Unseal it
// on the device"). Every word DRAFT.
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useEffect, useRef, useState } from "react";
import { XStack } from "tamagui";
import { ON_PHONE } from "./net";
import { keyOfWarning, unseal } from "./sealed";
import { ListenControl } from "./screens/Index";
import { Action, Card, Eyebrow, Small, useInk } from "./ui";

export type Recorded = "guide" | "subtle" | "hermetic" | "textbook";
const AUDIO = "https://raw.githubusercontent.com/CodeMusic/DAEMONS/main/docs/books/audio/";
const BOOKS: Record<Recorded, { file: string; title: string; reads: string; sealed?: boolean }> = {
  guide:    { file: "guide", title: "The Programmer's Guide to the Human Mind", reads: "Read aloud in reason's voice, even and unhurried." },   // DRAFT
  subtle:   { file: "the-subtle-layer", title: "The Subtle Layer", reads: "Read aloud in instinct's voice, warm and full." },                 // DRAFT
  hermetic: { file: "the-vault-audio", title: "The Hermetic Layer", reads: "Read aloud low and close, as the night would.", sealed: true },  // DRAFT
  textbook: { file: "principles-of-mind", title: "Principles of Mind", reads: "Read aloud by a professor, grave and warm." },             // DRAFT
};
type Chapter = { kind: "section" | "entry"; title: string; start: number; end: number };
type Marks = { duration: number; chapters: Chapter[] };
type Heard = Marks & { uri: string; kept: boolean };

const audioDir = () => new Directory(Paths.document, "audio");
const mp3File = (w: Recorded) => new File(audioDir(), `${BOOKS[w].title}.mp3`);
const marksFile = (w: Recorded) => new File(audioDir(), `${BOOKS[w].file}.json`);
const whereFile = () => new File(audioDir(), "where.json");
function put(f: File, bytes: Uint8Array | string) {
  if (!audioDir().exists) audioDir().create();
  if (!f.exists) f.create();
  f.write(bytes);
}
const shown: Partial<Record<Recorded, Heard>> = {};                 // the site's, for as long as the page is open
let where: Partial<Record<Recorded, number>> | null = null;          // where each was left, in seconds
function leftAt(): Partial<Record<Recorded, number>> {
  if (where) return where;
  try { where = ON_PHONE && whereFile().exists ? JSON.parse(whereFile().textSync()) : {}; } catch { where = {}; }
  return where!;
}
function leave(w: Recorded, at: number) {
  leftAt()[w] = Math.floor(at);
  if (ON_PHONE) try { put(whereFile(), JSON.stringify(where)); } catch { /* it is only a bookmark */ }
}

// the one this device keeps (always null on the site, where it lasts as long as the page)
function kept(w: Recorded): Heard | null {
  if (!ON_PHONE) return shown[w] ?? null;
  if (!mp3File(w).exists || !marksFile(w).exists) return null;
  try { return { ...(JSON.parse(marksFile(w).textSync()) as Marks), uri: mp3File(w).uri, kept: true }; } catch { return null; }
}

async function fetched(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`DAEMONS did not give it (${r.status}). Try again in a while.`);   // DRAFT
  return new Uint8Array(await r.arrayBuffer());
}

// a book as it can be heard: kept, else streamed from DAEMONS -- or, sealed, opened here and kept
async function heard(w: Recorded, key: string | null, keep = false): Promise<Heard> {
  const had = kept(w);
  if (had && (had.kept || !keep || !ON_PHONE)) return had;
  const B = BOOKS[w];
  let marks: Marks, bytes: Uint8Array | null = null;
  if (B.sealed) {
    if (!key) throw new Error("The book's warning names no one, so its recording will not open.");   // DRAFT
    const files = await unseal(await fetched(`${AUDIO}${B.file}.zip`), key, () => new Promise((go) => setTimeout(go, 0)));
    if (!files["sealed.mp3"] || !files["sealed.chapters.json"]) throw new Error("The sealed recording is not all there.");   // DRAFT
    bytes = files["sealed.mp3"];
    marks = JSON.parse(new TextDecoder().decode(files["sealed.chapters.json"]));
  } else {
    marks = JSON.parse(new TextDecoder().decode(await fetched(`${AUDIO}${B.file}.chapters.json`)));
    if (keep && ON_PHONE) bytes = await fetched(`${AUDIO}${B.file}.mp3`);
  }
  marks = { duration: marks.duration, chapters: marks.chapters };
  if (ON_PHONE && bytes) {
    put(mp3File(w), bytes);
    put(marksFile(w), JSON.stringify(marks));
    return { ...marks, uri: mp3File(w).uri, kept: true };
  }
  const uri = bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: "audio/mpeg" })) : `${AUDIO}${B.file}.mp3`;
  const h = { ...marks, uri, kept: false };
  if (!ON_PHONE) shown[w] = h;
  return h;
}

const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};

// LISTEN, its chapters and SHARE, for one book; `warning` is the sealed book's own warning, which holds its key
export function Listen({ which, warning }: { which: Recorded; warning?: string }) {
  const B = BOOKS[which];
  const ink = useInk();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [h, setH] = useState<Heard | null>(() => kept(which));
  const [marks, setMarks] = useState<Marks | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const loaded = useRef<string | null>(null);
  const seek = useRef<number | null>(null);
  const key = warning ? keyOfWarning(warning) : null;
  const at = useRef(0);
  at.current = status.currentTime || at.current;

  useEffect(() => {   // how long it is, before anything is fetched (an open book's chapters are small)
    if (!kept(which) && !B.sealed) fetched(`${AUDIO}${B.file}.chapters.json`)
      .then((b) => setMarks(JSON.parse(new TextDecoder().decode(b)))).catch(() => {});
    return () => { if (loaded.current) leave(which, at.current); };
  }, [which]);
  useEffect(() => {   // where it was left, once there is something to move through
    if (status.isLoaded && seek.current != null) { const s = seek.current; seek.current = null; player.seekTo(s).catch(() => {}); }
  }, [status.isLoaded]);

  const info = h ?? marks;
  const entries = (info?.chapters ?? []).filter((c) => c.kind === "entry");
  const now = status.currentTime ?? 0;
  const here = (info?.chapters ?? []).filter((c) => c.start <= now + 0.5).pop();
  const playing = !!loaded.current;

  const play = async () => {
    setError("");
    try {
      let got = h;
      if (!got) { setBusy(B.sealed ? "Opening it…" : "Finding it…"); got = await heard(which, key); setH(got); }   // DRAFT
      if (loaded.current !== got.uri) {
        await setAudioModeAsync({ playsInSilentMode: true });
        player.replace({ uri: got.uri });
        loaded.current = got.uri;
        seek.current = leftAt()[which] ?? null;
      }
      player.play();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const pause = () => { player.pause(); leave(which, now); };
  const to = (s: number) => { player.seekTo(Math.max(0, s)).catch(() => {}); leave(which, s); };
  const back = () => { const prev = [...entries].reverse().find((c) => c.start < now - 3); to(prev ? prev.start : 0); };
  const on = () => { const next = entries.find((c) => c.start > now + 0.5); if (next) to(next.start); };
  const share = async () => {
    setError("");
    try {
      let got = h;
      if (!got?.kept) { setBusy(B.sealed ? "Opening it…" : "Keeping it on this device…"); got = await heard(which, key, true); setH(got); }   // DRAFT
      await Sharing.shareAsync(got.uri, { UTI: "public.mp3", mimeType: "audio/mpeg", dialogTitle: B.title });
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const tab = async () => {
    if (!B.sealed) { window.open(`${AUDIO}${B.file}.mp3`, "_blank"); return; }
    let got = h;
    if (!got) { setBusy("Opening it…"); try { got = await heard(which, key); setH(got); } finally { setBusy(null); } }   // DRAFT
    window.open(got.uri, "_blank");
  };

  return (
    <Card>
      <Eyebrow>{`LISTEN${info ? ` · ${Math.round(info.duration / 60)} MIN` : ""}`}</Eyebrow>
      <Small>{busy ?? (playing && here ? `${here.title} · ${clock(now)} of ${clock(info?.duration ?? status.duration)}`
        : `${B.reads}${leftAt()[which] ? ` It goes on from ${clock(leftAt()[which]!)}.` : ""} DRAFT`)}</Small>
      <XStack gap={10} flexWrap="wrap" alignItems="center">
        <ListenControl phase={busy ? "making" : status.playing ? "speaking" : null} onListen={play} onStop={pause} ink={ink} />
        {playing && entries.length ? <Action label="‹ Chapter" onPress={back} /> : null}
        {playing && entries.length ? <Action label="Chapter ›" onPress={on} /> : null}
        {ON_PHONE ? <Action label="Share" onPress={share} /> : <Action label="Open in a tab" onPress={tab} />}
      </XStack>
      {error ? <Small color="$color9">{error}</Small> : null}
    </Card>
  );
}
