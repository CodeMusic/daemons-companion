// C-208 (the user, 2026-10-28: "hit a button allowing the watch or app to read you the selected chapter aloud for
// either/any of these books, including notes"): READ ALOUD on a chapter of THE SUBTLE LAYER or the GUIDE, or a NOTEBOOK
// page -- in the INDEX voice (POST /api/ai/speak), a paragraph at a time, each one asked for as the last ends, so a long
// chapter starts at once. A paragraph past what the voice takes at once (600) is cut at its sentences, as the watch's
// are (server/src/books.ts). Tapped again, it stops. Only where the voice is (ON_PHONE, with the companion behind it).
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { readingVoice } from "../platform/voiceFile";
import { useEffect, useRef, useState } from "react";
import { ON_PHONE } from "../platform/net";
import { followVoice, setSpeaking } from "../sound/speaking";   // C-213
import { Action } from "./ui";
import { setSaying } from "./spoken";   // C-309

const MAX = 560;
// each piece to say, and which paragraph it came from (C-309: so the page can show the one being said)
function sayable(paragraphs: string[]): { text: string; from: number }[] {
  const out: { text: string; from: number }[] = [];
  paragraphs.forEach((raw, from) => {
    const p = raw.replace(/\s+/g, " ").trim();
    if (!p) return;
    if (p.length <= MAX) { out.push({ text: p, from }); return; }
    let cur = "";
    for (const s of p.match(/[^.!?]+[.!?]*\s*/g) ?? [p]) {
      if ((cur + s).length > MAX && cur) { out.push({ text: cur.trim(), from }); cur = ""; }
      cur += s.length > MAX ? s.slice(0, MAX) : s;
    }
    if (cur.trim()) out.push({ text: cur.trim(), from });
  });
  return out;
}

export function useReadAloud() {
  const player = useAudioPlayer(null);
  const [reading, setReading] = useState<string | null>(null);
  const run = useRef(0);
  useEffect(() => () => { run.current++; setSaying(null); }, []);   // C-309: a page left takes its mark with it
  const ended = () => new Promise<void>((done) => {
    const sub = player.addListener("playbackStatusUpdate", (s) => { if (s.didJustFinish) { sub.remove(); done(); } });
  });
  const stop = () => { run.current++; try { player.pause(); } catch { /* nothing playing */ } setReading(null); setSpeaking(false); setSaying(null); };
  const read = async (key: string, paragraphs: string[], voice?: string) => {
    if (reading === key) return stop();
    const mine = ++run.current;
    setReading(key);
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
      const pieces = sayable(paragraphs);
      const next = pieces.map(({ text }) => () => readingVoice(voice ? { text, voice } : { text }));   // each kept on the phone after the first time
      let coming = next.length ? next[0]() : null;
      for (let i = 0; i < next.length && run.current === mine; i++) {
        const spoken = await coming;
        coming = i + 1 < next.length ? next[i + 1]() : null;   // the next asked for while this one plays
        if (run.current !== mine || !spoken) break;
        const f = spoken;
        player.replace({ uri: f.uri }); player.play(); followVoice(player);
        setSaying(key, pieces[i].from);                             // C-309: the page shows this paragraph as the one being said
        await ended();
      }
    } catch { /* the voice is not here: the button says nothing new */ }
    if (run.current === mine) { setReading(null); setSaying(null); }
  };
  return { reading, read, stop };
}

// the button, for a chapter or a page: READ ALOUD, or STOP while it reads
// voice (C-323): "book:<id>" -- each book in its own reader's voice; THE NOTEBOOK's pages in the player's
export function ReadAloud({ id, paragraphs, ink, label, voice }: { id: string; paragraphs: string[]; ink?: string; label?: string; voice?: string }) {   // C-238: label, a spell's SAY IT
  const r = useReadAloud();
  if (!ON_PHONE) return null;
  return <Action label={r.reading === id ? "STOP READING" : label ?? "READ ALOUD"} onPress={() => r.read(id, paragraphs, voice)} ink={ink} />;   // DRAFT
}
