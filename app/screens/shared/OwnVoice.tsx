// C-303 (DAEMONS T-522, vision 4.2; the user, 2026-11-06): a card shows the INDEX entry -- the record -- and LISTEN
// reads that in the INDEX's device voice. The daemon itself is the other voice: opened, its sprite shimmers a little, and
// a tap on it lays the daemon over the card, as large as the card, in its type's own place (its den, C-113). It says it
// is thinking while its voice is made; then it tells of itself, in the first person and in its own voice (C-251), its
// mouth moving; and when it has finished it shrinks back to the card as it was.
//
// The voice is kept on the phone by its words (platform/voiceFile.ts), so a daemon heard once answers at once after.
// Its mouth: the patches the server found for it (faces.json), drawn over the picture on the beat sound/speaking keeps;
// a daemon whose mouth nobody has found yet moves a little on the same beat instead. Every word here is DRAFT.
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { YStack } from "tamagui";
import type { Drawn, Patch } from "../../../server/src/expressions";
import { apiLater, ON_PHONE } from "../../platform/net";
import { readingVoice, voiceExt } from "../../platform/voiceFile";
import { followVoice, setSpeaking, useMouth } from "../../sound/speaking";
import type { Spoken } from "../../state/types";
import { Art } from "../../ui/ui";
import { DenStage } from "../daemon/Den";

const NATIVE = Platform.OS !== "web";
const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

export type Telling = { species: number; phase: "thinking" | "speaking" | "leaving" } | null;

// One daemon tells of itself at a time. `speak` asks for its voice (kept from the first time on the phone) and plays
// it; `stop` lets go at once; `gone` is the overlay saying it has shrunk away.
export function useOwnVoice() {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [told, setTold] = useState<Telling>(null);
  const [failed, setFailed] = useState("");
  const turn = useRef(0);                                  // a stopped request's answer is recognised and dropped
  const leave = () => setTold((t) => (t?.phase === "speaking" ? { ...t, phase: "leaving" } : t));
  useEffect(() => { if (status.didJustFinish) leave(); }, [status.didJustFinish]);
  useEffect(() => {                                        // a voice that never says it finished still lets the card back
    if (told?.phase !== "speaking") return;
    const t = setTimeout(leave, 45000);
    return () => clearTimeout(t);
  }, [told?.phase]);
  const speak = async (species: number, said: string) => {
    if (told) return;
    const mine = ++turn.current;
    setFailed(""); setTold({ species, phase: "thinking" });
    try {
      let uri: string;
      if (ON_PHONE) {                       // the phone: the voice kept from the first time, else the hub's, kept
        const f = await readingVoice({ species, own: true }, said);
        if (turn.current !== mine) return;
        if (!f) { setFailed("No voice came back."); setTold(null); return; }   // DRAFT
        uri = f.uri;
        await setAudioModeAsync({ playsInSilentMode: true });
      } else {                              // the site plays it as it came
        const r = await apiLater<Spoken>("/api/ai/speak", { species, own: true });
        if (turn.current !== mine) return;
        if (!r.audioBase64) { setFailed(r.error ?? "No voice came back."); setTold(null); return; }
        uri = `data:audio/${voiceExt(r.audioBase64) === "wav" ? "wav" : "mpeg"};base64,${r.audioBase64}`;
      }
      player.replace({ uri }); player.play();
      followVoice(player);                  // C-213: its mouth moves while it speaks
      setTold({ species, phase: "speaking" });
    } catch (e) { if (turn.current === mine) { setFailed((e as Error).message); setTold(null); } }
  };
  const stop = () => {
    turn.current++;
    try { player.pause(); } catch { /* released */ }
    setSpeaking(false);
    setTold((t) => (t ? { ...t, phase: "leaving" } : t));
  };
  return { told, failed, speak, stop, gone: () => setTold(null) };
}

// The sprite on an opened card, when the daemon has something to say of itself: it shimmers, and a play mark comes up on
// it so the tap is plainly offered (the user, 2026-11-06: "it should shimmer and reveal a play button so u know u can tap
// on it"). The mark is drawn, not an icon: a dark ring with a light triangle, breathing with the shimmer.
export function ShimmerArt({ path, size, on, onPress }: { path: string; size: number; on: boolean; onPress: () => void }) {
  const glow = useRef(new Animated.Value(0)).current;
  const came = useRef(new Animated.Value(0)).current;       // the play mark arriving, once, when the card opens
  useEffect(() => {
    if (!on) { glow.setValue(0); came.setValue(0); return; }
    Animated.timing(came, { toValue: 1, duration: 360, delay: 120, easing: Easing.out(Easing.back(1.6)), useNativeDriver: NATIVE }).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      Animated.timing(glow, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE })]));
    loop.start();
    return () => loop.stop();
  }, [on, glow, came]);
  if (!on) return <Art path={path} size={size} />;
  const mark = Math.max(22, Math.round(size * 0.42));
  return (
    <YStack role="button" aria-label="Hear it tell of itself" cursor="pointer" width={size} height={size} position="relative"
            onPress={(e: any) => { e?.stopPropagation?.(); onPress(); }}>
      <Animated.View style={{ width: size, height: size, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }),
                              transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}>
        <Art path={path} size={size} />
      </Animated.View>
      {/* a light crossing it, corner to corner */}
      <Animated.View style={{ pointerEvents: "none", position: "absolute", top: 0, left: 0, width: size * 0.26, height: size, backgroundColor: "#ffffff",
                              opacity: glow.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.38, 0] }),
                              transform: [{ translateX: glow.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.15, size * 0.95] }) }, { skewX: "-18deg" }] }} />
      {/* the play mark, at its foot, right */}
      <Animated.View style={{ pointerEvents: "none", position: "absolute", right: -2, bottom: -2, width: mark, height: mark, borderRadius: mark / 2,
                              backgroundColor: "rgba(20,20,24,0.82)", borderWidth: 1.5, borderColor: "#ffffff",
                              alignItems: "center", justifyContent: "center",
                              opacity: came,
                              transform: [{ scale: Animated.multiply(came, glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] })) }] }}>
        <View style={{ width: 0, height: 0, marginLeft: Math.round(mark * 0.12), borderTopWidth: mark * 0.2, borderBottomWidth: mark * 0.2, borderLeftWidth: mark * 0.34,
                       borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: "#ffffff" }} />
      </Animated.View>
    </YStack>
  );
}

const STILL = { dy: 0, squash: 1, bob: 1, still: true, shake: false } as const;

// The daemon over its card: its den as large as the card, the daemon in it, its name kept at the top (the user,
// 2026-11-06: "while expanded and thinking/talking it should still show the daemons name"). Laid as the card's last
// child; the card needs nothing but to be the overlay's parent. A tap anywhere on it lets it go.
export function OwnVoiceOverlay({ species, art, name, mouth, phase, failed, onStop, onGone }:
  { species: number; art: string; name?: string; mouth?: Patch[] | null; phase: "thinking" | "speaking" | "leaving"; failed?: string;
    onStop: () => void; onGone: () => void }) {
  const grow = useRef(new Animated.Value(0)).current;
  const [h, setH] = useState(0);
  const open = useMouth();
  useEffect(() => {
    Animated.timing(grow, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [grow]);
  useEffect(() => {
    if (phase !== "leaving") return;
    Animated.timing(grow, { toValue: 0, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: false })
      .start(() => onGone());
  }, [phase, grow]);   // eslint-disable-line react-hooks/exhaustive-deps
  const side = Math.min(Math.round(h * 0.8), 192);          // DenStage's own sum, so the picture fills the place it is given
  // its mouth where a person has found it; else it moves a little as it speaks
  const drawn = useMemo(() => ({ name: "awake", mark: null, eyes: null, shade: { sat: 1, val: 1, tint: [0, 0, 0], mix: 0 },
                                 pose: { ...STILL, squash: open && !mouth?.length ? 0.965 : 1 },
                                 patch: open && mouth?.length ? mouth : [] }) as unknown as Drawn, [open, mouth]);
  return (
    <Animated.View onLayout={(e) => setH(Math.round(e.nativeEvent.layout.height))}
                   style={[StyleSheet.absoluteFill, { borderRadius: 4, overflow: "hidden", opacity: grow,
                           transformOrigin: "left top",
                           transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] } as any]}>
      <YStack flex={1} role="button" aria-label="Hush" cursor="pointer" onPress={(e: any) => { e?.stopPropagation?.(); onStop(); }}>
        {h ? <DenStage species={species} art={<Art path={art} size={side} />} asleep={false} hop={0} height={h} expression={drawn} /> : null}
        <View style={{ pointerEvents: "none", position: "absolute", left: 10, right: 10, top: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          {name ? (
            <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 3, backgroundColor: "rgba(20,20,24,0.62)" }}>
              <Text allowFontScaling={false} style={{ fontFamily: MONO, fontSize: 13, fontWeight: "700", letterSpacing: 1.5, color: "#ffffff" }}>{name}</Text>
            </View>
          ) : <View />}
          {phase === "thinking" || failed ? (
            <Text allowFontScaling={false} style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 1.5, color: "#ffffff", opacity: 0.85 }}>
              {failed || "THINKING…"}
            </Text>
          ) : null}
        </View>
      </YStack>
    </Animated.View>
  );
}
