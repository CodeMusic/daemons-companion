// C-208 (the user, 2026-10-28: "hit a button allowing the watch or app to read you the selected chapter aloud for
// either/any of these books, including notes"): READ ALOUD on a chapter of THE SUBTLE LAYER or the GUIDE, or a NOTEBOOK
// page -- in the INDEX voice (POST /api/ai/speak), a paragraph at a time, each one asked for as the last ends, so a long
// chapter starts at once. A paragraph past what the voice takes at once (600) is cut at its sentences, as the watch's
// are (server/src/books.ts). Tapped again, it stops. Only where the voice is (ON_PHONE, with the companion behind it).
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { useEffect, useRef, useState } from "react";
import { apiLater, ON_PHONE } from "./net";
import { followVoice, setSpeaking } from "./speaking";   // C-213
import { Spoken } from "./types";
import { Action } from "./ui";

const MAX = 560;
function sayable(paragraphs: string[]): string[] {
  const out: string[] = [];
  for (const p of paragraphs.map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    if (p.length <= MAX) { out.push(p); continue; }
    let cur = "";
    for (const s of p.match(/[^.!?]+[.!?]*\s*/g) ?? [p]) {
      if ((cur + s).length > MAX && cur) { out.push(cur.trim()); cur = ""; }
      cur += s.length > MAX ? s.slice(0, MAX) : s;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}

export function useReadAloud() {
  const player = useAudioPlayer(null);
  const [reading, setReading] = useState<string | null>(null);
  const run = useRef(0);
  useEffect(() => () => { run.current++; }, []);
  const ended = () => new Promise<void>((done) => {
    const sub = player.addListener("playbackStatusUpdate", (s) => { if (s.didJustFinish) { sub.remove(); done(); } });
  });
  const stop = () => { run.current++; try { player.pause(); } catch { /* nothing playing */ } setReading(null); setSpeaking(false); };
  const read = async (key: string, paragraphs: string[]) => {
    if (reading === key) return stop();
    const mine = ++run.current;
    setReading(key);
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
      const next = sayable(paragraphs).map((text) => () => apiLater<Spoken>("/api/ai/speak", { text }));
      let coming = next.length ? next[0]() : null;
      for (let i = 0; i < next.length && run.current === mine; i++) {
        const spoken = await coming;
        coming = i + 1 < next.length ? next[i + 1]() : null;   // the next asked for while this one plays
        if (run.current !== mine || !spoken?.audioBase64) break;
        const f = new File(Paths.cache, `read-${Date.now()}.mp3`);
        f.create(); f.write(spoken.audioBase64, { encoding: "base64" });
        player.replace({ uri: f.uri }); player.play(); followVoice(player);
        await ended();
      }
    } catch { /* the voice is not here: the button says nothing new */ }
    if (run.current === mine) setReading(null);
  };
  return { reading, read, stop };
}

// the button, for a chapter or a page: READ ALOUD, or STOP while it reads
export function ReadAloud({ id, paragraphs, ink }: { id: string; paragraphs: string[]; ink?: string }) {
  const r = useReadAloud();
  if (!ON_PHONE) return null;
  return <Action label={r.reading === id ? "STOP READING" : "READ ALOUD"} onPress={() => r.read(id, paragraphs)} ink={ink} />;   // DRAFT
}
