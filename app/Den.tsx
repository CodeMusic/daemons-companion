// C-113: the daemon in its den, on TODAY -- its type's place, as the widget (targets/widget/Den.swift), the boards and
// the Tab5 draw it, from the same description (server/src/dens.ts). No SVG here: the wall is bands, the motif small
// views (a line is a thin rotated bar), so it needs nothing native and draws the same on the site. The daemon walks it
// side to side and faces the way it goes; asleep, it stays put with a z; `hop` changes when it is tended.
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import speciesJson from "../server/data/species.json";
import { den as denOf } from "../server/src/dens";
import type { Drawn } from "../server/src/expressions";

const SPECIES = speciesJson as unknown as Record<string, { types?: string[] }>;
const PIXELATED = Platform.OS === "web" ? ({ imageRendering: "pixelated" } as object) : {};
const NATIVE = Platform.OS !== "web";
const FLOOR_AT = 0.8;

type Shape =
  | { k: "dot"; x: number; y: number; r: number; faint?: boolean }
  | { k: "line"; x0: number; y0: number; x1: number; y1: number; w: number }
  | { k: "oval"; x: number; y: number; rx: number; ry: number; fill: boolean; w?: number; faint?: boolean }
  | { k: "diamond"; x: number; y: number; a: number }
  | { k: "rect"; x: number; y: number; w: number; h: number; lw: number };

// The same scatter every time for a motif, as the widget and the boards seed theirs.
function scatter(seed: string) {
  let s = 2166136261;
  for (const c of seed) s = Math.imul(s ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s >>> 8) / 16777216; };
}

// The motif as shapes, in the den's own pixels -- Den.swift's drawing, step for step.
function motif(m: string, w: number, h: number): Shape[] {
  const fy = h * FLOOR_AT, u = Math.min(w, h) / 40, r = scatter(m), out: Shape[] = [];
  const curve = (f: (x: number) => number, lw: number, step = 8) => {
    for (let x = step; x <= w + step; x += step) out.push({ k: "line", x0: x - step, y0: f(x - step), x1: x, y1: f(x), w: lw });
  };
  switch (m) {
    case "waves": for (let row = 0; row < 4; row++) { const y = fy - row * 6 * u - 3 * u; curve((x) => y + Math.sin(x / (5 * u) + row) * 1.6 * u, Math.max(1, u * (1.2 - row * 0.2))); } break;
    case "grass": for (let i = 0, n = Math.floor(w / (2.2 * u)); i < n; i++) { const x = r() * w, t = (3 + r() * 6) * u, lean = (r() - 0.5) * 3 * u; out.push({ k: "line", x0: x, y0: fy, x1: x + lean, y1: fy - t, w: Math.max(1, u * 0.7) }); } break;
    case "strata": for (let i = 0; i < 5; i++) { const y = fy - i * 4.5 * u; curve((x) => y - Math.sin(x / (13 * u) + i * 1.7) * u, u * (1.6 - i * 0.25), 10); } break;
    case "cairn": { let sw = 9 * u, y = fy; for (let i = 0; i < 5; i++) { const sh = sw * 0.45; out.push({ k: "oval", x: w * 0.84, y: y - sh / 2, rx: sw / 2, ry: sh / 2, fill: true }); y -= sh * 0.9; sw *= 0.78; } break; }
    case "specks": for (let i = 0; i < 70; i++) out.push({ k: "dot", x: r() * w, y: r() * fy, r: (0.5 + r()) * u / 2 }); break;
    case "rings": for (let i = 1; i <= 6; i++) out.push({ k: "oval", x: w / 2, y: fy * 0.55, rx: i * 5 * u, ry: i * 5 * u, fill: false, w: u * 0.6 }); break;
    case "embers": for (let i = 0; i < 40; i++) { const y = fy * (1 - r() ** 0.6); out.push({ k: "dot", x: r() * w, y, r: (0.4 + 1.2 * y / fy) * u / 2 }); } break;
    case "drips": for (let i = 0, n = Math.floor(w / (4 * u)); i < n; i++) { const x = r() * w, l = (3 + r() * 12) * u; out.push({ k: "line", x0: x, y0: 0, x1: x, y1: l, w: u * 0.9 }, { k: "dot", x, y: l, r: u }); } break;
    case "carrier": for (const [f, a] of [[1, 4], [0.5, 2]]) curve((x) => fy * 0.45 + Math.sin(x / (4 * u) * f) * a * u, u * 0.8 * f + 0.5, 6); break;
    case "grid":
      for (let x = 0; x <= w; x += 6 * u) out.push({ k: "line", x0: x, y0: 0, x1: x, y1: fy, w: 0.6 });
      for (let y = 0; y <= fy; y += 6 * u) out.push({ k: "line", x0: 0, y0: y, x1: w, y1: y, w: 0.6 });
      break;
    case "plates":
      for (let x = 0; x <= w; x += 12 * u) {
        out.push({ k: "line", x0: x, y0: 0, x1: x, y1: fy, w: u * 0.8 });
        for (let y = 3 * u; y < fy; y += 9 * u) out.push({ k: "dot", x: x + 2.2 * u, y, r: 0.7 * u }, { k: "dot", x: x + 9.8 * u, y, r: 0.7 * u });
      }
      break;
    case "flecks": for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * fy, a = (0.8 + r()) * u;
      for (let k = 0; k < 3; k++) { const t = (k * Math.PI) / 3; out.push({ k: "line", x0: x - Math.cos(t) * a, y0: y - Math.sin(t) * a, x1: x + Math.cos(t) * a, y1: y + Math.sin(t) * a, w: 0.7 }); } } break;
    case "facets": for (let i = 0; i < 18; i++) out.push({ k: "diamond", x: r() * w, y: r() * fy, a: (1 + r() * 1.6) * u }); break;
    case "box": for (let i = 1; i <= 3; i++) { const k = i * 3.5 * u; out.push({ k: "rect", x: k, y: k, w: w - 2 * k, h: fy - k, lw: u * 0.5 }); } break;
    case "fog": for (let i = 0; i < 8; i++) { const x = r() * w, y = r() * fy, a = (6 + r() * 10) * u; out.push({ k: "oval", x, y, rx: a, ry: a / 2, fill: true, faint: true }); } break;
    case "streaks": for (let i = 0; i < 14; i++) { const x = r() * w, y = r() * fy, l = (6 + r() * 14) * u; out.push({ k: "line", x0: x, y0: y, x1: x + l, y1: y - l * 0.35, w: u * 0.6 }); } break;
    default: for (let i = 0; i < 3; i++) { const a = (14 - i * 3) * u; out.push({ k: "oval", x: w / 2, y: fy, rx: a, ry: a * 0.22, fill: false, w: u * 0.8 }); }   // CONTENT, the nest
  }
  return out;
}

function ShapeView({ s, ink }: { s: Shape; ink: string }) {
  switch (s.k) {
    case "dot": return <View style={{ position: "absolute", left: s.x - s.r, top: s.y - s.r, width: 2 * s.r, height: 2 * s.r, borderRadius: s.r, backgroundColor: ink }} />;
    case "line": {
      const dx = s.x1 - s.x0, dy = s.y1 - s.y0, len = Math.hypot(dx, dy) + s.w / 2;
      return <View style={{ position: "absolute", left: (s.x0 + s.x1) / 2 - len / 2, top: (s.y0 + s.y1) / 2 - s.w / 2, width: len, height: s.w,
                            backgroundColor: ink, borderRadius: s.w / 2, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />;
    }
    case "oval": return <View style={{ position: "absolute", left: s.x - s.rx, top: s.y - s.ry, width: 2 * s.rx, height: 2 * s.ry, borderRadius: Math.max(s.rx, s.ry),
                                       ...(s.fill ? { backgroundColor: ink, opacity: s.faint ? 0.45 : 1 } : { borderWidth: s.w ?? 1, borderColor: ink }) }} />;
    case "diamond": return <View style={{ position: "absolute", left: s.x - s.a * 0.6, top: s.y - s.a * 0.6, width: s.a * 1.2, height: s.a * 1.2, backgroundColor: ink,
                                          transform: [{ scaleY: 1.6 }, { rotate: "45deg" }] }} />;
    case "rect": return <View style={{ position: "absolute", left: s.x, top: s.y, width: s.w, height: s.h, borderWidth: s.lw, borderBottomWidth: 0, borderColor: ink }} />;
  }
}

// C-119: the expression the server describes -- its pose moves the daemon here (still, a slower breath, a shake, lower and
// squashed), its eye patches and its mark are drawn over the sprite in the sprite's own pixels; the shade is in `art`.
export function DenStage({ species, art, asleep, hop, height = 180, expression }:
  { species: number; art: React.ReactNode; asleep: boolean; hop: number; height?: number; expression?: Drawn | null }) {
  const pose = expression?.pose, still = pose ? pose.still : asleep;
  const [w, setW] = useState(0);
  const d = useMemo(() => denOf(SPECIES[String(species)]?.types ?? []), [species]);
  const shapes = useMemo(() => (w ? motif(d.motif, w, height) : []), [d.motif, w, height]);
  const side = Math.min(Math.round(height * 0.8), 192), fy = height * FLOOR_AT;
  const x = useRef(new Animated.Value(0.5)).current, bob = useRef(new Animated.Value(0)).current, up = useRef(new Animated.Value(0)).current;
  const [right, setRight] = useState(false);

  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {                                           // it walks: one leg, then back, facing the way it goes
    if (still) { x.setValue(0.5); return; }
    let on = true, to = 1;
    const leg = () => {
      if (!on) return;
      setRight(to === 1);
      Animated.timing(x, { toValue: to, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }).start(({ finished }) => { if (finished) { to = 1 - to; leg(); } });
    };
    leg();
    const deep = pose?.bob ?? 1;                              // a glad breath is bigger, a low one smaller and slower
    const breath = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: -4 * deep, duration: 840 / Math.max(0.5, Math.min(1.4, deep)), easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      Animated.timing(bob, { toValue: 0, duration: 840 / Math.max(0.5, Math.min(1.4, deep)), easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE })]));
    breath.start();
    const tremble = pose?.shake ? Animated.loop(Animated.sequence([
      Animated.timing(shake, { toValue: 1.5, duration: 70, useNativeDriver: NATIVE }),
      Animated.timing(shake, { toValue: -1.5, duration: 70, useNativeDriver: NATIVE })])) : null;
    tremble?.start();
    return () => { on = false; x.stopAnimation(); breath.stop(); tremble?.stop(); shake.setValue(0); };
  }, [still, pose?.bob, pose?.shake, x, bob, shake]);

  useEffect(() => {                                           // tended: a hop
    if (!hop) return;
    Animated.sequence([
      Animated.timing(up, { toValue: -side * 0.16, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }),
      Animated.spring(up, { toValue: 0, bounciness: 12, useNativeDriver: NATIVE })]).start();
  }, [hop, up, side]);

  const room = Math.max(0, w - side);
  const ink = d.glow, faintInk = d.glow;
  return (
    <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
          style={{ height, borderRadius: 10, overflow: "hidden", backgroundColor: d.deep }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: 16 }, (_, i) => (                 // the wall over its deep, in bands
        <View key={i} style={{ position: "absolute", left: 0, right: 0, top: (fy * i) / 16, height: fy / 16 + 1, backgroundColor: mix(d.wall, d.deep, i / 15) }} />
      ))}
      <View style={[StyleSheet.absoluteFill, { opacity: 0.22 }]}>{shapes.map((s, i) => <ShapeView key={i} s={s} ink={ink} />)}</View>
      <View style={{ position: "absolute", left: 0, right: 0, top: fy, bottom: 0, backgroundColor: d.floor, borderTopWidth: 1.5, borderTopColor: mix(d.floor, faintInk, 0.25) }} />
      {w ? (
        <Animated.View style={{ position: "absolute", left: 0, top: fy - side + side * 0.06, width: side, height: side,
                                transform: [{ translateX: Animated.add(x.interpolate({ inputRange: [0, 1], outputRange: [0, room] }), shake) }, { translateY: Animated.add(bob, up) }] }}>
          <View style={{ position: "absolute", left: side * 0.22, top: side * 0.9, width: side * 0.55, height: side * 0.09, borderRadius: side, backgroundColor: "rgba(0,0,0,0.28)" }} />
          <View style={[{ width: side, height: side, transform: [{ translateY: ((pose?.dy ?? 0) * side) / 64 + (side * (1 - (pose?.squash ?? 1))) / 2 },
                                                                  { scaleY: pose?.squash ?? 1 }, { scaleX: right ? -1 : 1 }] }, PIXELATED as any]}>
            {art}
            {(expression?.patch ?? []).map((p, i) => (               // its eyes, as it feels: rectangles of the sprite's own pixels
              <View key={i} style={{ position: "absolute", left: (p.x * side) / 64, top: (p.y * side) / 64, width: (p.w * side) / 64 + 0.5,
                                     height: (p.h * side) / 64 + 0.5, backgroundColor: `rgb(${p.rgb.join(",")})` }} />
            ))}
          </View>
          {expression?.mark ? <Mark mark={expression.mark} size={Math.round(side * 0.2)} style={{ position: "absolute", right: side * 0.04, top: side * 0.02 }} />
            : asleep && !expression ? <Text style={{ position: "absolute", right: side * 0.02, top: side * 0.05, color: d.glow, fontWeight: "700", fontSize: Math.max(11, side * 0.13), fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>z  z</Text> : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

// C-119: the expression's 8x8 mark -- zz, a heart, a drop -- in the game's own pixels; never mirrored
function Mark({ mark, size, style }: { mark: NonNullable<Drawn["mark"]>; size: number; style: object }) {
  const px = size / 8;
  return (
    <View style={[{ width: size, height: size }, style]}>
      {mark.rows.flatMap((row, y) => [...row].map((c, x) => c === "." ? null : (
        <View key={`${x}-${y}`} style={{ position: "absolute", left: x * px, top: y * px, width: px + 0.3, height: px + 0.3,
                                         backgroundColor: c === "o" ? "#ffffff" : `rgb(${mark.rgb.join(",")})` }} />)))}
    </View>
  );
}

function mix(a: string, b: string, k: number) {
  const p = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return "#" + [0, 1, 2].map((i) => Math.round(p(a, i) * (1 - k) + p(b, i) * k).toString(16).padStart(2, "0")).join("");
}
