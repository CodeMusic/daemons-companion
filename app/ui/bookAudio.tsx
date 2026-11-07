// C-277 (the user, 2026-11-03: "for any book we have recorings we should link to the (git audio ideally for storage
// reasons) and be able to listen to the book. inside would be an option to play it, along with a similar share button so
// u could sent it or save it to files"): LISTEN inside each book that has a recording -- DAEMONS' MP3s (docs/books/audio,
// made by tools/bookaudio.py, T-518, each book in its own voice), from DAEMONS on GitHub as published; nothing of them
// is in this repository. The phone fetches a book once and keeps it in the app's documents (audio/), so it plays with no
// signal; the site streams it. The chapters beside each MP3 step it back and on, and where it was left is kept. SHARE
// hands the kept book on, to Files or anyone, as the manuals' PDFs are (manual.ts); on the site, a tab. THE HERMETIC
// LAYER's recording is sealed in DAEMONS: once the book is held, the device opens it with the key the book's own warning
// gives (sealed.ts) and keeps it (the user, by multiple choice: "Unseal it on the device"); so are the dawn half's and THE
// UNITY BOOK's, each with its own book's key (C-299, the user 2026-11-05; the mended book in "one voice"). A book plays on with its page
// left or the screen locked, and shows on the lock screen. A kept book knows which reading it is (bookaudio.py's sources
// hash); when DAEMONS has published a newer one, the next LISTEN fetches it (the user, 2026-11-07: "have build all audio?"
// -- THE SUBTLE LAYER was read again, and a phone that kept it would never have heard). Every word DRAFT.
import { createAudioPlayer, setAudioModeAsync, useAudioPlayerStatus, type AudioPlayer } from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { XStack } from "tamagui";
import { ON_PHONE } from "../platform/net";
import { keyOfBook, unseal } from "../state/sealed";
import { ListenControl } from "../screens/shared/Index";
import { Action, Card, Eyebrow, Small, useInk } from "./ui";

export type Recorded = "guide" | "subtle" | "hermetic" | "eudaimon" | "unity" | "textbook";
const AUDIO = "https://raw.githubusercontent.com/CodeMusic/DAEMONS/main/docs/books/audio/";
const BOOKS: Record<Recorded, { file: string; title: string; reads: string; sealed?: boolean }> = {
  guide:    { file: "guide", title: "The Programmer's Guide to the Human Mind", reads: "Read aloud in reason's voice, even and unhurried." },   // DRAFT
  subtle:   { file: "the-subtle-layer", title: "The Subtle Layer", reads: "Read aloud in instinct's voice, warm and full." },                 // DRAFT
  hermetic: { file: "the-vault-audio", title: "The Hermetic Layer", reads: "Read aloud low and close, as the night would.", sealed: true },  // DRAFT
  eudaimon: { file: "the-vault-audio-2", title: "The Eudaimon Layer", reads: "Read aloud lighter and slower, as the dawn would.", sealed: true },  // DRAFT
  unity:    { file: "the-vault-audio-3", title: "The Unity Book", reads: "Read aloud in one voice, leaned neither way.", sealed: true },  // DRAFT
  textbook: { file: "principles-of-mind", title: "Principles of Mind", reads: "Read aloud by a professor, grave and warm." },             // DRAFT
};
type Chapter = { kind: "section" | "entry"; title: string; start: number; end: number };
type Marks = { duration: number; chapters: Chapter[]; sources?: string };   // sources: which reading (bookaudio.py)
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

// a book as it can be heard: kept, else fetched once (the phone) or streamed (the site) from DAEMONS -- or, sealed,
// opened here. The phone keeps every one first: GitHub sends a large MP3 as application/octet-stream, nosniff, which a
// phone's player need not stream, and a kept one plays with no signal and is the one SHARE hands on.
async function heard(w: Recorded, key: string | null, say: (what: string) => void = () => {}, fresh = false): Promise<Heard> {
  const had = kept(w);
  if (had && !fresh) return had;
  const B = BOOKS[w];
  if (B.sealed) {
    if (!key) throw new Error("The book names no reader, so its recording will not open.");   // DRAFT
    const files = await unseal(await fetched(`${AUDIO}${B.file}.zip`), key, () => new Promise((go) => setTimeout(go, 0)));
    if (!files["sealed.mp3"] || !files["sealed.chapters.json"]) throw new Error("The sealed recording is not all there.");   // DRAFT
    const m: Marks = JSON.parse(new TextDecoder().decode(files["sealed.chapters.json"]));
    const marks = { duration: m.duration, chapters: m.chapters, sources: m.sources };
    if (ON_PHONE) {
      if (marksFile(w).exists) marksFile(w).delete();   // the marks go last, so a write cut short is fetched again
      put(mp3File(w), files["sealed.mp3"]);
      put(marksFile(w), JSON.stringify(marks));
      return { ...marks, uri: mp3File(w).uri, kept: true };
    }
    return (shown[w] = { ...marks, uri: URL.createObjectURL(new Blob([files["sealed.mp3"] as BlobPart], { type: "audio/mpeg" })), kept: false });
  }
  const m: Marks = JSON.parse(new TextDecoder().decode(await fetched(`${AUDIO}${B.file}.chapters.json`)));
  const marks = { duration: m.duration, chapters: m.chapters, sources: m.sources };
  if (!ON_PHONE) return (shown[w] = { ...marks, uri: `${AUDIO}${B.file}.mp3`, kept: false });
  if (!audioDir().exists) audioDir().create();
  const part = new File(audioDir(), `${B.file}.part`);   // the kept one is replaced only by a whole one
  await File.downloadFileAsync(`${AUDIO}${B.file}.mp3`, part, { idempotent: true, onProgress: ({ bytesWritten, totalBytes }) => {
    if (totalBytes > 0) say(`Fetching it from DAEMONS… ${Math.round((100 * bytesWritten) / totalBytes)}%`);   // DRAFT
  } });
  if (marksFile(w).exists) marksFile(w).delete();
  await part.move(mp3File(w), { overwrite: true });
  put(marksFile(w), JSON.stringify(marks));   // last, so a fetch cut short is fetched again
  return { ...marks, uri: mp3File(w).uri, kept: true };
}

// The reading DAEMONS has published now (bookaudio.py's sources hash), or null when it cannot be asked: an open book's
// from its chapters, a sealed one's from the comment at its zip's end -- its last bytes only, so nothing sealed is
// fetched to ask (GitHub refuses a range counted from the end, so its size first). On the phone, where a book is kept.
async function published(w: Recorded): Promise<string | null> {
  const B = BOOKS[w];
  try {
    if (!B.sealed) return JSON.parse(new TextDecoder().decode(await fetched(`${AUDIO}${B.file}.chapters.json`))).sources ?? null;
    const url = `${AUDIO}${B.file}.zip`;
    const size = Number((await fetch(url, { method: "HEAD" })).headers.get("content-length"));
    if (!size) return null;
    const tail = new Uint8Array(await (await fetch(url, { headers: { range: `bytes=${Math.max(0, size - 512)}-` } })).arrayBuffer());
    return /sources (\w+)/.exec(String.fromCharCode(...tail))?.[1] ?? null;
  } catch { return null; }
}

const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};

// The one book player, kept as long as the app runs (the user, 2026-11-03: "Yes, add it" -- a book plays on with the
// screen locked): leaving a book's page does not stop it, and the lock screen shows the book and its controls. One book
// plays at a time; LISTEN in another moves it there, keeping where the first was left. expo-audio sets the whole audio
// mode on every call, so a care sound elsewhere can take the background away -- the book asks for it again on every
// LISTEN and as the app leaves the screen. doNotMix, since only a book that does not mix is shown on the lock screen.
const BOOK_MODE = { playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" } as const;
let player: AudioPlayer | null = null;
let current: { which: Recorded; uri: string } | null = null;
let pending: number | null = null;   // where to start, once the book has loaded
let marked = 0;                      // when the bookmark was last written, as it plays
function bookPlayer(): AudioPlayer {
  if (player) return player;
  const p = (player = createAudioPlayer(null));
  p.addListener("playbackStatusUpdate", (s) => {
    if (!current) return;
    if (s.isLoaded && pending != null) { const at = pending; pending = null; p.seekTo(at).catch(() => {}); return; }
    if (s.didJustFinish) { leave(current.which, 0); p.clearLockScreenControls(); return; }   // the end: next time, the start
    if (s.playing && Date.now() - marked > 15000) { marked = Date.now(); leave(current.which, s.currentTime); }
  });
  AppState.addEventListener("change", (state) => {
    if (state !== "active" && current && p.playing) setAudioModeAsync(BOOK_MODE).catch(() => {});
  });
  return p;
}

// LISTEN, its chapters and SHARE, for one book; `warning` is a sealed book's own first entry (its WARNING, BLESSING or
// ATTESTATION), which holds its key
export function Listen({ which, warning }: { which: Recorded; warning?: string }) {
  const B = BOOKS[which];
  const ink = useInk();
  const p = bookPlayer();
  const status = useAudioPlayerStatus(p);
  const [h, setH] = useState<Heard | null>(() => kept(which));
  const [marks, setMarks] = useState<Marks | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);   // a newer reading is out than the one kept here
  const key = warning ? keyOfBook(which === "eudaimon" || which === "unity" ? which : "hermetic", warning) : null;

  useEffect(() => {   // how long it is, before anything is fetched (an open book's chapters are small)
    if (!kept(which) && !B.sealed) fetched(`${AUDIO}${B.file}.chapters.json`)
      .then((b) => setMarks(JSON.parse(new TextDecoder().decode(b)))).catch(() => {});
    if (ON_PHONE && kept(which)) published(which).then((s) => { if (s && s !== kept(which)?.sources) setStale(true); });
  }, [which]);

  const mine = current?.which === which;   // this book is the one in the player
  const info = h ?? marks;
  const entries = (info?.chapters ?? []).filter((c) => c.kind === "entry");
  const now = mine ? status.currentTime ?? 0 : 0;
  const here = (info?.chapters ?? []).filter((c) => c.start <= now + 0.5).pop();

  // the book to play or hand on: the one kept, or fetched -- again, when a newer reading is out; with no signal, the kept one
  const ready = async (): Promise<Heard> => {
    let got = h;
    if (got && !stale) return got;
    setBusy(B.sealed ? "Opening it…" : !ON_PHONE ? "Finding it…" : got ? "Fetching the newer reading…" : "Fetching it from DAEMONS, once…");   // DRAFT
    if (got && current?.which === which) { leave(which, p.currentTime); p.pause(); current = null; }   // never write under the player
    try { got = await heard(which, key, setBusy, !!got); setStale(false); }
    catch (e) { if (!got) throw e; }
    setH(got);
    return got;
  };
  const play = async () => {
    setError("");
    try {
      const got = await ready();
      await setAudioModeAsync(BOOK_MODE);
      if (current?.uri !== got.uri) {
        if (current) leave(current.which, p.currentTime);
        p.replace({ uri: got.uri });
        current = { which, uri: got.uri };
        pending = leftAt()[which] ?? null;
        p.setActiveForLockScreen(true, { title: B.title, artist: "DAEMONS", albumTitle: "Read aloud, DRAFT" },   // DRAFT
                                 { showSeekForward: true, showSeekBackward: true });
      }
      p.play();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const pause = () => { p.pause(); if (mine) leave(which, p.currentTime); };
  const to = (s: number) => { p.seekTo(Math.max(0, s)).catch(() => {}); leave(which, s); };
  const back = () => { const prev = [...entries].reverse().find((c) => c.start < now - 3); to(prev ? prev.start : 0); };
  const on = () => { const next = entries.find((c) => c.start > now + 0.5); if (next) to(next.start); };
  const share = async () => {
    setError("");
    try {
      const got = await ready();
      await Sharing.shareAsync(got.uri, { UTI: "public.mp3", mimeType: "audio/mpeg", dialogTitle: B.title });
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const tab = async () => {
    if (!B.sealed) { window.open(`${AUDIO}${B.file}.mp3`, "_blank"); return; }
    try { window.open((await ready()).uri, "_blank"); } finally { setBusy(null); }
  };

  return (
    <Card>
      <Eyebrow>{`LISTEN${info ? ` · ${Math.round(info.duration / 60)} MIN` : ""}`}</Eyebrow>
      <Small>{busy ?? (mine && here ? `${here.title} · ${clock(now)} of ${clock(info?.duration ?? status.duration)}`
        : `${B.reads}${leftAt()[which] ? ` It goes on from ${clock(leftAt()[which]!)}.` : ""}${stale ? " A newer reading is out; LISTEN fetches it." : ""} DRAFT`)}</Small>
      <XStack gap={10} flexWrap="wrap" alignItems="center">
        <ListenControl phase={busy ? "making" : mine && status.playing ? "speaking" : null} onListen={play} onStop={pause} ink={ink} />
        {mine && entries.length ? <Action label="‹ Chapter" onPress={back} /> : null}
        {mine && entries.length ? <Action label="Chapter ›" onPress={on} /> : null}
        {ON_PHONE ? <Action label="Share" onPress={share} /> : <Action label="Open in a tab" onPress={tab} />}
      </XStack>
      {error ? <Small color="$color9">{error}</Small> : null}
    </Card>
  );
}
