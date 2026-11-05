// C-302 (the user, 2026-11-05: "Drinking we could show a small glass of water that goes from full to 2/3 to 1/3 to empty
// while the sound plays. For food we could have a sprite of some food that is fully drawn then 2/3 (bites out of it) to
// 1/3 to empty ... In the future we might add ability to choose what u feed or drink so keep that in mind"): what the
// daemon is given, drawn in the den beside it and eaten or drunk in four stages over the care's phrase, then gone.
//
// Each is a PROVISION: an id, food or drink, its four frames (full, two thirds, a third, empty) as rows of pixels, and the
// colour of each letter in them. A choice of what to feed or drink, later, is a longer list and a remembered id -- nothing
// here changes. The frames may be drawn by hand; the two below are made from one drawing each, so a new one can be too.
import { useEffect, useRef, useState } from "react";
import { Animated, View } from "react-native";
import { tuneNotes } from "../../sound/tuneSound";

export type Provision = { id: string; kind: "food" | "drink"; name: string; frames: string[][]; ink: Record<string, string> };

// A red fruit, bitten from the right, then down to the core, then only crumbs on the floor -- drawn by hand, 'f' the
// inside where it was bitten (DRAFT; the user kept this look, 2026-11-05)
const FRUIT = [
  "......s.....",
  "......sll...",
  "...rrrsrr...",
  "..rrrrrrrr..",
  ".rhhrrrrrrr.",
  ".rhrrrrrrrr.",
  ".rrrrrrrrrr.",
  ".rrrrrrrrrr.",
  ".rrrrrrrrrd.",
  "..rrrrrrdd..",
  "...rrrrdd...",
  "....rr.rr...",
];
const TWO_BITES = [
  "......s.....",
  "......sll...",
  "...rrrsrr...",
  "..rrrrrrrf..",
  ".rhhrrrrf...",
  ".rhrrrrf....",
  ".rrrrrrf....",
  ".rrrrrrrf...",
  ".rrrrrrrrf..",
  "..rrrrrrdf..",
  "...rrrrdd...",
  "....rr.rr...",
];
const CORE = [
  "......s.....",
  "......sll...",
  "....rrsr....",
  "....frrf....",
  ".....frf....",
  ".....frf....",
  ".....frf....",
  ".....frf....",
  "....frrrf...",
  "...frrrrdf..",
  "...rrrrdd...",
  "....rr.rr...",
];
const CRUMBS = [...Array(10).fill("............"), "............", "..f....f..f."];

// A small glass of water, the water going down a third at a time (DRAFT)
const glass = (level: number) => Array.from({ length: 12 }, (_, y) => {
  if (y === 11) return ".gggggggg.";
  if (y === 0) return "g........g";
  const wet = y >= 11 - level;
  return "g" + (wet ? (y === 11 - level ? "hwwwwwwh" : "wwwwwwww") : "........") + "g";
});

export const PROVISIONS: Record<string, Provision> = {
  fruit: { id: "fruit", kind: "food", name: "a fruit", frames: [FRUIT, TWO_BITES, CORE, CRUMBS],
           ink: { r: "#d8443c", h: "#f39486", d: "#a8302b", s: "#6b4a2b", l: "#5cae4a", f: "#f4e3b0" } },
  water: { id: "water", kind: "drink", name: "a glass of water", frames: [glass(9), glass(6), glass(3), glass(0)],
           ink: { g: "rgba(225,240,250,0.85)", w: "#4fa3e0", h: "#bfe3fa" } },
};
// what each care gives until the player can choose (C-302: a remembered id will stand here)
export const GIVEN: Record<"feed" | "water", string> = { feed: "fruit", water: "water" };

// how long the care's phrase plays (server/data/tunes.json), so the stages keep to it
export const phraseMs = (care: "feed" | "water") =>
  (tuneNotes(care === "feed" ? "FED" : "WATERED") ?? []).reduce((n, [, ms]) => n + ms, 0) || 1100;

export type Serving = { provision: Provision; at: number; ms: number };

function Frame({ rows, ink, px }: { rows: string[]; ink: Record<string, string>; px: number }) {
  return (
    <View style={{ width: rows[0].length * px, height: rows.length * px }}>
      {rows.flatMap((row, y) => [...row].map((c, x) => c === "." || !ink[c] ? null :
        <View key={`${x}-${y}`} style={{ position: "absolute", left: x * px, top: y * px, width: px + 0.3, height: px + 0.3, backgroundColor: ink[c] }} />))}
    </View>
  );
}

// Drawn standing on the den's floor at its bottom-left: full, then each stage a third of the phrase later, empty as it
// ends; empty a moment, then it fades and is gone.
export function Served({ serving, px, style }: { serving: Serving | null; px: number; style: object }) {
  const [stage, setStage] = useState(-1);
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!serving) { setStage(-1); return; }
    fade.setValue(1); setStage(0);
    const step = Math.max(300, serving.ms / 3), t = [1, 2, 3].map((i) => setTimeout(() => setStage(i), step * i));
    const gone = setTimeout(() => Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }).start(({ finished }) => { if (finished) setStage(-1); }),
                            step * 3 + 650);
    return () => { t.forEach(clearTimeout); clearTimeout(gone); };
  }, [serving, fade]);
  if (!serving || stage < 0) return null;
  const p = serving.provision;
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", opacity: fade }, style]} accessibilityLabel={p.name}>
      <Frame rows={p.frames[Math.min(3, stage)]} ink={p.ink} px={px} />
    </Animated.View>
  );
}
