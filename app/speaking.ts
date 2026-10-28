// C-213 (the user, 2026-10-28: "the active daemon's mouth to animate when he talks -- available both on the iphone/ipad
// apps and t-watch ultra"): whether the daemon's voice is playing now -- set by whatever plays it (TALK, LISTEN, READ
// ALOUD) and read by its picture, which opens and closes its mouth on a beat while it is (the open mouth is the server's,
// /art/party/N.png?mouth=open, expressions.ts mouthPatch). One flag for the app: there is one voice at a time.
import { useEffect, useState } from "react";
import type { AudioPlayer } from "expo-audio";

let speaking = false;
const heard = new Set<(on: boolean) => void>();
export function setSpeaking(on: boolean) {
  if (on === speaking) return;
  speaking = on;
  heard.forEach((f) => f(on));
}
// a player's voice, followed: speaking from play() until it finishes (or another sound replaces it)
export function followVoice(player: AudioPlayer) {
  setSpeaking(true);
  const sub = player.addListener("playbackStatusUpdate", (s) => {
    if (s.didJustFinish || (!s.playing && s.isLoaded && s.currentTime > 0)) { setSpeaking(false); sub.remove(); }
  });
}
// open or shut, on a beat of a little under a fifth of a second, while the voice plays
export function useMouth(): boolean {
  const [on, setOn] = useState(speaking), [open, setOpen] = useState(false);
  useEffect(() => { heard.add(setOn); return () => { heard.delete(setOn); }; }, []);
  useEffect(() => {
    if (!on) { setOpen(false); return; }
    const t = setInterval(() => setOpen((o) => !o), 170);
    return () => clearInterval(t);
  }, [on]);
  return open;
}
