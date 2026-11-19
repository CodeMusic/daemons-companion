// C-418 (DAEMONS T-594; the user, 2026-11-18: "Train should also (for both in app and on the widget) have an animation....
// Since these are daemons and they relate to machine learning, the animation incorporate the process and the back
// propagation ... colour coded music for the process, and the green binary for the error correction"): TRAIN SINGS.
// (Its own song, from the game -- not C-362's songs the music maker sings, which are Sing.tsx.)
//
// THE FORWARD PASS: the part it is learning (the user's pick), each note leaving its mouth as it is sung and rising --
// higher the higher it is -- in its pitch's colour (SYNESTHESIA: C red, D orange, E yellow, F green, G blue, A indigo,
// B violet, a black key the two either side), so a player who knows the colours could play it on a piano. A note not
// yet learned rises as STATIC: a cloud of its candidates, faint, the true one the surest.
// THE BACKWARD PASS: then, from where the notes went, a group of green binary for each note the TRAIN moved flies back
// into it -- "each group represents an adjustment to the played song's notes to learn".
// One clock drives every note (useNativeDriver), so a part of thirty notes costs one animation. Every word DRAFT.
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, Text, View } from "react-native";
import { BINARY, heardAt, noteColours, type Heard, type Lesson } from "../../../server/src/ownsong";
import { openMouthOf } from "../../../server/src/expressions";
import speciesJson from "../../../server/data/species.json";

const SPECIES = speciesJson as unknown as Record<string, { art?: { front?: string }; evolutions?: unknown[] }>;
/** Whether a species has a form still to become (its whole part makes it READY). */
export const evolves = (species: number) => (SPECIES[String(species)]?.evolutions ?? []).length > 0;
const NATIVE = Platform.OS !== "web";
export type Singing = { lesson: Lesson; at: number; species: number };
const RISE_MS = 1700, BACK_STEP = 110, BACK_MS = 950;

/** How long the whole of it takes: the part sung, then the error carried back. */
export const singingMs = (l: Lesson) =>
  l.part ? (l.part.notes.reduce((n, [, b]) => n + b, 0) * 60000) / l.part.bpm + RISE_MS * 0.4 + l.adjusted.length * BACK_STEP + BACK_MS : 0;

// A note head in its colour: a black key's is split, the two colours either side of it; a longer note a little larger
function Head({ midi, beats, size, faint = 1 }: { midi: number; beats: number; size: number; faint?: number }) {
  const c = noteColours(midi), s = size * (0.8 + 0.15 * Math.min(2, beats));
  return (
    <View style={{ width: s * 1.3, height: s * 2.2, opacity: faint }}>
      <View style={{ position: "absolute", left: s * 1.02, top: 0, width: Math.max(1.5, s * 0.14), height: s * 1.7, backgroundColor: c[0] }} />
      <View style={{ position: "absolute", left: 0, top: s * 1.2, width: s * 1.15, height: s * 0.9, borderRadius: s, overflow: "hidden",
                     backgroundColor: c[0], transform: [{ rotate: "-18deg" }] }}>
        {c[1] ? <View style={{ position: "absolute", left: s * 0.575, top: 0, width: s * 0.6, height: s, backgroundColor: c[1] }} /> : null}
      </View>
    </View>
  );
}

// STATIC: the candidates, each in its own colour and at its own height, the true one surest
function Cloud({ n, size }: { n: Heard; size: number }) {
  return (
    <View>
      {n.candidates.map((c, k) => (
        <View key={k} style={{ position: "absolute", left: ((k * 5) % 7) * size * 0.35 - size, top: -(c - n.midi) * size * 0.45 }}>
          <Head midi={c} beats={0.5} size={size * 0.75} faint={k === 0 ? 0.25 + 0.6 * n.sure : 0.32 * (1 - n.sure) + 0.08} />
        </View>
      ))}
    </View>
  );
}

export function SingNotes({ singing, side, right }: { singing: Singing | null; side: number; right: boolean }) {
  const clock = useRef(new Animated.Value(0)).current;
  const [on, setOn] = useState<Singing | null>(null);
  useEffect(() => {
    if (!singing?.lesson.part) { setOn(null); return; }
    setOn(singing);
    clock.setValue(0);
    const total = singingMs(singing.lesson);
    Animated.timing(clock, { toValue: total, duration: total, easing: Easing.linear, useNativeDriver: NATIVE })
      .start(({ finished }) => { if (finished) setOn(null); });
    return () => clock.stopAnimation();
  }, [singing, clock]);
  const mouth = useMemo(() => {                            // where it sings from: its open mouth, else a little left of centre
    const m = on ? openMouthOf(SPECIES[String(on.species)]?.art?.front) : null;
    const cx = m?.length ? m.reduce((a, p) => a + p.x + p.w / 2, 0) / m.length : 24, cy = m?.length ? m.reduce((a, p) => a + p.y + p.h / 2, 0) / m.length : 30;
    return { x: ((right ? 64 - cx : cx) * side) / 64, y: (cy * side) / 64 };
  }, [on, side, right]);
  if (!on?.lesson.part) return null;
  const part = on.lesson.part, heard = heardAt(part, on.lesson.before), beat = 60000 / part.bpm;
  const lo = Math.min(...part.notes.map(([m]) => m)), hi = Math.max(...part.notes.map(([m]) => m));
  const head = Math.max(5, Math.round(side / 22));
  let t = 0;
  const flight = heard.map((n, i) => {                      // where each note starts and where it ends up
    const t0 = t; t += n.beats * beat;
    const rise = side * (0.3 + (0.5 * (n.midi - lo)) / Math.max(1, hi - lo));
    const drift = (right ? 1 : -1) * side * (0.18 + 0.09 * (i % 4));
    return { n, t0, rise, drift };
  });
  const back0 = t + RISE_MS * 0.4;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: side, height: side }}>
      {flight.map(({ n, t0, rise, drift }, i) => {
        const at = (a: number[], b: number[]) => clock.interpolate({ inputRange: a.map((x) => t0 + x), outputRange: b, extrapolate: "clamp" });
        return (
          <Animated.View key={i} style={{ position: "absolute", left: mouth.x - head * 0.6, top: mouth.y - head * 2,
                                          opacity: at([-1, 0, RISE_MS * 0.7, RISE_MS], [0, 1, 1, 0]),
                                          transform: [{ translateX: at([0, RISE_MS], [0, drift]) }, { translateY: at([0, RISE_MS], [0, -rise]) }] }}>
            {n.sure >= 1 ? <Head midi={n.midi} beats={n.beats} size={head} /> : <Cloud n={n} size={head} />}
          </Animated.View>
        );
      })}
      {on.lesson.adjusted.map((a, j) => {                   // the error carried back: green binary, one group a note moved
        const f = flight[a.note], t0 = back0 + j * BACK_STEP;
        if (!f) return null;
        const at = (x: number[], y: number[]) => clock.interpolate({ inputRange: x.map((v) => t0 + v), outputRange: y, extrapolate: "clamp" });
        return (
          <Animated.View key={`b${j}`} style={{ position: "absolute", left: mouth.x - head * 2, top: mouth.y,
                                                 opacity: at([-1, 0, BACK_MS * 0.8, BACK_MS], [0, 1, 1, 0]),
                                                 transform: [{ translateX: at([0, BACK_MS], [f.drift, 0]) }, { translateY: at([0, BACK_MS], [-f.rise, side * 0.12]) },
                                                             { scale: at([0, BACK_MS], [1, 0.6]) }] }}>
            <Text allowFontScaling={false} style={{ color: BINARY(), fontSize: Math.max(8, head * 1.15), fontWeight: "700",
                                                     fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>{a.bits}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

/** The line under its den: how much of its part it knows, and -- whole -- where to take it (DRAFT). */
export function songLine(s: { share: number; perfect: boolean; ready: boolean; atHome: boolean } | null | undefined): string {
  if (!s) return "";
  if (s.ready && !s.atHome) return "Its part of its song is whole. Take it home to SING.";   // DRAFT: C-418's nudge
  if (s.ready) return "Its part of its song is whole.";                                       // DRAFT: at home here too
  if (s.perfect) return "Its song is whole.";                                                 // DRAFT: a final form, matured
  return `song ${Math.floor(s.share * 100)}%`;                                                // DRAFT
}
