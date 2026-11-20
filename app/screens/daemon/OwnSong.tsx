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
import { BINARY, heardAt, songOf, type Heard, type Lesson } from "../../../server/src/ownsong";
import { Text as Words, XStack, YStack } from "tamagui";
import { Head, SongStaves, useSinging } from "../../ui/staff";
import { Card, Eyebrow, Small } from "../../ui/ui";
import { ListenControl } from "../shared/Index";
import type { SongNow } from "../../../server/src/core";
import { openMouthOf } from "../../../server/src/expressions";
import speciesJson from "../../../server/data/species.json";

const SPECIES = speciesJson as unknown as Record<string, { art?: { front?: string }; evolutions?: unknown[] }>;
/** Whether a species has a form still to become (its whole part makes it READY). */
export const evolves = (species: number) => (SPECIES[String(species)]?.evolutions ?? []).length > 0;
const NATIVE = Platform.OS !== "web";
export type Singing = { lesson: Lesson; at: number; species: number };
const RISE_MS = 2300, BACK_STEP = 180, BACK_MS = 1500;

/** How long the whole of it takes: the part sung, then the error carried back. */
export const singingMs = (l: Lesson) =>
  l.part ? (l.part.notes.reduce((n, [, b]) => n + b, 0) * 60000) / l.part.bpm + RISE_MS * 0.4 + l.adjusted.length * BACK_STEP + BACK_MS : 0;

// A note head in its colour (C-419: ui/staff.tsx, where the INDEX's staves draw it too)

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

export function SingNotes({ singing, side, right, ahead }: { singing: Singing | null; side: number; right: boolean; ahead: 1 | -1 }) {
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
  const head = Math.max(7, Math.round(side / 13));
  let t = 0;
  const flight = heard.map((n, i) => {                      // where each note starts and where it ends up
    const t0 = t; t += n.beats * beat;
    const rise = side * (0.1 + (0.34 * (n.midi - lo)) / Math.max(1, hi - lo));   // a higher note higher; all inside the den
    const drift = ahead * side * (0.55 + 0.12 * (i % 4));                          // streaming toward the open side
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
            <Text allowFontScaling={false} style={{ color: BINARY(), fontSize: Math.max(10, head * 1.25), fontWeight: "700",
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

// C-419 (the user, 2026-11-18: "in the index you can still look at a past form ... and hear its song"): ITS SONG on the
// daemon's own page -- the whole of its song so far, each part on its staff, the earlier parts whole and its own as it
// knows it (static where it has not learned), and SING to hear it so. Every word DRAFT.
export function SongCard({ song, ink }: { song: SongNow | null | undefined; ink: string }) {
  const sung = useSinging(), species = song?.species;      // the song stops as the page goes: its player is released (C-440)
  const parts = useMemo(() => (species !== undefined ? songOf(species) : []), [species]);
  if (!song || !parts.length) return null;
  const shares = parts.map((_, i) => (i < parts.length - 1 ? 1 : song.share));
  const key = `own-${song.species}-${Math.round(song.share * 1000)}`;
  return (
    <Card>
      <Eyebrow>ITS SONG</Eyebrow>
      <Small>{parts.length > 1
        ? "Every part it has been, whole, then its own as it knows it so far. A note it has not learned is static."   // DRAFT
        : "Its own part, as it knows it so far. A note it has not learned is static."}</Small>{/* DRAFT */}
      <XStack marginVertical={4}>
        <ListenControl label="SING" phase={sung.singing === key ? sung.phase : null} ink={ink}
                       onListen={() => sung.sing(key, parts, shares)} onStop={sung.hush} />
      </XStack>
      {sung.failed ? <Small color="$color8">{sung.failed}</Small> : null}
      <YStack><SongStaves parts={parts} shares={shares} at={sung.singing === key ? sung.at : null} /></YStack>
      <Words fontSize={12} lineHeight={17} color="$color10">
        {"Each note in its colour: C red, D orange, E yellow, F green, G blue, A indigo, B violet; a sharp or flat the two either side. Each part in its type's key."}
      </Words>{/* DRAFT */}
    </Card>
  );
}
