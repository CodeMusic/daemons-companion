// 2026-11-07 (the user: "some indicator in the app so u can tell if the dream voice had been rendered yet or not"): the
// button that reads a whole piece aloud says where its voice is --  ○ not made yet,  ◐ being made (you may leave; it is
// made all the same),  ● ready, and plays at once. Tapped while it is being made, it plays when it comes, if you are still
// here. Only where a voice can be played (ON_PHONE). Every word DRAFT.
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { XStack } from "tamagui";
import { ON_PHONE } from "../platform/net";
import { makeVoice, useVoiceState, wholeVoice, type VoiceState } from "../platform/rendering";
import { followVoice, setSpeaking } from "../sound/speaking";
import { Action, Small } from "./ui";

export const VOICE_WORDS = {   // DRAFT
  none: "○  Read aloud", making: "Voice coming", ready: "●  Hear it", failed: "○  Try its voice again", stop: "■  Stop",
  makingHint: "Its voice is being made. You can leave -- it will be ready when you come back.",
  failedHint: "Its voice could not be made this time.",
};
const SPIN = ["◐", "◓", "◑", "◒"];

export function VoiceButton({ text, ink, words = VOICE_WORDS }: { text: string; ink?: string; words?: typeof VOICE_WORDS }) {
  const state = useVoiceState(text);
  const player = useAudioPlayer(null);
  const [playing, setPlaying] = useState(false), [spin, setSpin] = useState(0);
  const wanted = useRef(false);
  useEffect(() => {
    const sub = player.addListener("playbackStatusUpdate", (s) => { if (s.didJustFinish) { setPlaying(false); setSpeaking(false); } });
    return () => { sub.remove(); try { player.pause(); } catch { /* gone */ } };
  }, [player]);
  useEffect(() => {                                       // the little wheel turns while it is made
    if (state !== "making") return;
    const t = setInterval(() => setSpin((n) => n + 1), 300);
    return () => clearInterval(t);
  }, [state]);
  const play = async () => {
    const f = wholeVoice(text);
    if (!f) return;
    await setAudioModeAsync({ playsInSilentMode: true });
    player.replace({ uri: f.uri }); player.play(); followVoice(player); setPlaying(true);
  };
  useEffect(() => { if (state === "ready" && wanted.current) { wanted.current = false; play(); } }, [state]);   // it came while you waited
  if (!ON_PHONE) return null;
  const press = () => {
    if (playing) { try { player.pause(); } catch { /* nothing */ } setPlaying(false); setSpeaking(false); return; }
    if (state === "ready") return play();
    wanted.current = true;
    if (state !== "making") makeVoice(text);
  };
  const label = playing ? words.stop : state === "making" ? `${SPIN[spin % 4]}  ${words.making}${".".repeat(1 + (spin % 3))}` : words[state];
  return (
    <>
      <Action label={label} onPress={press} ink={ink} />
      {state === "making" || state === "failed" ? <XStack width="100%"><Small>{state === "making" ? words.makingHint : words.failedHint}</Small></XStack> : null}
    </>
  );
}

export type { VoiceState };
