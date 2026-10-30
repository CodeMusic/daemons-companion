// C-158 (the user, 2026-10-18: "the phone casino needs to be more like the devices"): what THE CASINO is dressed for, as
// the boards decide it (firmware/esp32/src/casino.cpp lookNow, colourA, colourB) -- the holiday's look, else the weather's
// when it is weather to notice (a clear night, its stars), else the season's own; its two colours the holiday's, else the
// season's -- the drawn piece the boards draw for it (server/data/art/casino/, written by firmware/common/casino_art.py),
// and the season falling over the reels as it falls over theirs.
import { memo, useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { api } from "./net";
import type { PlayerState } from "./types";
import { Art } from "./ui";

const ART: { pieces: string[]; season: Record<string, [string, string]>; hats: Record<string, { w: number; h: number; x: number; y: number }> }
  = require("../server/data/casino_art.json");

export type Dress = { look: string; a: string; b: string; piece: string; hat: string | null };
// The companion decides it once (server/src/context.ts casinoDress, the state's casino.dress) for the boards, the phone and
// the Tab5 alike; the rule below only for a state without it (no save read yet, or an older companion)
export function casinoDress(st: PlayerState): Dress {
  const d = st.casino?.dress;
  if (d?.look && d.colours?.length === 2)
    return { look: d.look, a: d.colours[0], b: d.colours[1], piece: ART.pieces.includes(d.look) ? d.look : "star", hat: ART.hats[d.hat] ? d.hat : null };
  const h = st.holiday, dressed = !!h?.name && !h.quiet;
  const sky = st.world?.weather?.kind, season = st.season;
  const look = dressed && h!.look !== "none" ? h!.look
    : sky === "rain" || sky === "storm" || sky === "fog" || sky === "snow" ? sky
    : sky === "clear" && st.world?.watch === "NIGHT" ? "stars"
    : season === "winter" ? "snow" : season === "spring" ? "petals" : season === "summer" ? "sun" : "leaves";
  const [sa, sb] = ART.season[season] ?? ART.season.autumn;
  const hat = dressed && !h!.flip && ART.hats[h!.hat] ? h!.hat : null;   // casino.cpp hat(): none on a quiet day, or upside down
  return { look, a: (dressed && h!.colours?.[0]) || sa, b: (dressed && h!.colours?.[1]) || sb, piece: ART.pieces.includes(look) ? look : "star", hat };
}

// A daemon's picture with the holiday's hat on its head, as the boards put it there (casino.cpp hat(): at the middle of the
// top of its head, GET /art/head, the picture's 64 pixels scaled to `size`)
const HEADS = new Map<string, Promise<{ top: number; mid: number; w: number } | null>>();
const headOf = (q: string) => {
  if (!HEADS.has(q)) HEADS.set(q, api<{ top: number; mid: number; w: number }>(`/art/head?${q}`).catch(() => null));
  return HEADS.get(q)!;
};
export function Hatted({ path, head, size, dress, day }: { path: string; head: string; size: number; dress: Dress; day: string }) {
  const [at, setAt] = useState<{ top: number; mid: number; w: number } | null>(null);
  useEffect(() => { if (dress.hat) headOf(head).then(setAt); }, [head, dress.hat]);
  const hat = dress.hat ? ART.hats[dress.hat] : null;
  const k = size / (at?.w ?? 64);
  return (
    <View style={{ width: size, height: size }}>
      <Art path={path} size={size} />
      {hat && at ? (
        <View pointerEvents="none" style={{ position: "absolute", left: (at.mid - hat.x) * k, top: (Math.max(14, at.top) + 3 - hat.y) * k }}>
          <Art path={pieceArt(`hat_${dress.hat}`, dress, day)} size={hat.w * k} height={hat.h * k} />
        </View>
      ) : null}
    </View>
  );
}

// the piece's picture in the day's dress (GET /art/casino/<name>.png fills its colour slots)
export const pieceArt = (name: string, d: Dress, day: string) =>
  `/art/casino/${name}.png?a=${d.a.slice(1)}&b=${d.b.slice(1)}&day=${/^#[0-9a-f]{6}$/i.test(day) ? day.slice(1) : "315a62"}`;

// The season over the reels (casino.cpp bitReset and its drawing, a little larger for the phone): a few pieces drifting
// down -- hearts and sparks rising -- or twinkling where they are. Drawn by the native driver, so the reels never redraw.
const TWINKLES = ["stars", "sun", "frost", "moon"];
const CONFETTI = ["#ff4060", "#ffd040", "#40c0ff", "#60e060", "#c060ff"];
const Bit = memo(function Bit({ look, i, w, h, colour }: { look: string; i: number; w: number; h: number; colour: string }) {
  const t = useRef(new Animated.Value(0)).current;
  const r = useRef({ x: Math.random(), y: Math.random(), sway: Math.random() * 2 - 1, ms: Math.random(), wait: Math.random() }).current;   // its own, once
  const twinkle = TWINKLES.includes(look), rises = look === "hearts" || look === "fireworks";
  useEffect(() => {
    const ms = twinkle ? 900 + r.ms * 1200 : 3200 + r.ms * 3600;
    const run = Animated.loop(twinkle
      ? Animated.sequence([Animated.timing(t, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                           Animated.timing(t, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true })])
      : Animated.timing(t, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }));
    const start = setTimeout(() => run.start(), r.wait * 2500);
    return () => { clearTimeout(start); run.stop(); };
  }, [t, r, twinkle]);
  const y0 = twinkle ? r.y * h : rises ? h + 8 : -10, y1 = twinkle ? y0 : rises ? -10 : h + 8;
  const sway = r.sway * 14;
  const style: any = {
    position: "absolute", left: r.x * w, top: 0,
    opacity: twinkle ? t.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] }) : 1,
    transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [y0, y1] }) },
                { translateX: twinkle ? 0 : t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, sway, 0] }) },
                { scale: twinkle ? t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) : 1 }],
  };
  const c = look === "snow" || look === "frost" ? "#ffffff" : look === "confetti" || look === "streamers" ? CONFETTI[i % 5] : colour;
  const dot = (sw: number, sh: number, col: string, r = sw) => <View style={{ width: sw, height: sh, borderRadius: r, backgroundColor: col }} />;
  let body: React.ReactNode;
  if (look === "snow") body = dot(3 + (i % 2) * 2, 3 + (i % 2) * 2, c);
  else if (look === "petals") body = dot(8, 5, c);
  else if (look === "leaves") body = <View style={{ width: 7, height: 7, backgroundColor: c, transform: [{ rotate: "45deg" }, { scaleY: 1.3 }] }} />;
  else if (look === "hearts" || look === "clover") body = <Text allowFontScaling={false} style={{ fontSize: 11, color: look === "clover" ? "#20b040" : c }}>{look === "clover" ? "♣" : "♥"}</Text>;
  else if (look === "confetti" || look === "streamers") body = dot(4 + (i % 3) * 2, 3, c, 0);
  else if (look === "eggs") body = dot(6, 8, c);
  else if (look === "pumpkins") body = dot(7, 7, "#ff7a1a");
  else if (look === "presents") body = <View style={{ width: 7, height: 7, backgroundColor: c, borderLeftWidth: 2, borderColor: "#fffbf7" }} />;
  else if (look === "fireworks") body = dot(3, 3, c);
  else if (look === "rain" || look === "storm") body = <View style={{ width: 2, height: 9, backgroundColor: "#60a8ff", transform: [{ rotate: "18deg" }] }} />;
  else if (look === "fog") body = dot(28, 2, "#8a8e96", 1);
  else body = <View style={{ width: 9, height: 9, alignItems: "center", justifyContent: "center" }}>
    <View style={{ position: "absolute", width: 9, height: 2, backgroundColor: c }} /><View style={{ position: "absolute", width: 2, height: 9, backgroundColor: c }} /></View>;
  return <Animated.View pointerEvents="none" style={style}>{body}</Animated.View>;
});
export const SeasonFalling = memo(function SeasonFalling({ dress, w, h }: { dress: Dress; w: number; h: number }) {
  if (w <= 0) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: w, height: h, overflow: "hidden" }}>
      {Array.from({ length: 14 }, (_, i) => <Bit key={`${dress.look}${i}`} look={dress.look} i={i} w={w} h={h} colour={i % 2 ? dress.a : dress.b} />)}
    </View>
  );
});
