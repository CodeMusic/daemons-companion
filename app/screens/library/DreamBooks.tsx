// C-456 (the user, 2026-11-21: "a dream made as more than text and audio -- the text set as a graphic or over a painted
// background -- gathered into a Dream-Book on the library's shelf, with cover art featuring the daemon, and the daemon who
// dreamt it as its author"; by multiple choice: a volume a month, the painting drawn here from the dream's day, centre and
// quality, every dream kept for good): the DREAM-BOOKS shelf's volumes (/api/dreambooks, server/src/dreams.ts
// dreamBooks), each cover its daemon over its month's first wash, and the book read a page at a time -- a title page, then
// each dream set over its painting. The painting is the day's colour alone (a centre is never given a colour of its own,
// tending.ts's rule): its light sits at the centre's height, root at the foot and crown at the top; a vivid night paints in
// a few broad strokes, a quiet one softly, a broken one in scattered pieces. The same dream always paints the same.
// Every word DRAFT.
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { Action, Art, Small, whenSaid } from "../../ui/ui";
import { VoiceButton } from "../../ui/voiceButton";
import { DreamSymbol } from "../daemon/Dreams";
import { useDark } from "../../state/look";

export type BookDream = { id: number; from: string; to: string; at: string; hours: number; tucked: boolean;
                          quality: "vivid" | "quiet" | "broken"; text: string; nickname: string; species: number;
                          title: string; day: string; centre: number; dayColour: string };
export type DreamVolume = { id: string; who: string; nickname: string; species: number; month: string; title: string; dreams: BookDream[] };

// ---- the painting ----
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
function seeded(n: number) {                                   // mulberry32: the same dream, the same strokes
  let s = (n * 2654435761) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const STROKES = { vivid: { n: 7, r: [0.34, 0.62], a: [0.16, 0.3] }, quiet: { n: 5, r: [0.3, 0.5], a: [0.07, 0.14] }, broken: { n: 16, r: [0.08, 0.22], a: [0.12, 0.26] } };
export function Wash({ d, w, h, dark, children }: { d: Pick<BookDream, "id" | "dayColour" | "centre" | "quality">; w: number; h: number; dark: boolean; children?: ReactNode }) {
  const paper = dark ? "#16130f" : "#f6f1e6", colour = d.dayColour || "#7a6a5a";
  const rnd = seeded(d.id), k = STROKES[d.quality] ?? STROKES.quiet, m = Math.max(w, h);
  const cy = h * (0.86 - (Math.max(0, Math.min(6, d.centre ?? 3)) / 6) * 0.72);     // root low, crown high
  const blot = (key: string, x: number, y: number, r: number, fill: string, a: number) => (
    <View key={key} pointerEvents="none" style={{ position: "absolute", left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: r, backgroundColor: fill, opacity: a }} />
  );
  const strokes = Array.from({ length: k.n }, (_, i) => {
    const r = m * (k.r[0] + rnd() * (k.r[1] - k.r[0])), a = k.a[0] + rnd() * (k.a[1] - k.a[0]);
    const near = d.quality === "broken" ? 1 : 0.45;            // a broken night scatters; the others gather near the light
    const x = w / 2 + (rnd() - 0.5) * w * 1.1 * near * 1.6, y = cy + (rnd() - 0.5) * h * near * 1.3;
    const tone = rnd() < 0.5 ? mix(colour, dark ? "#000000" : "#ffffff", 0.35 * rnd()) : mix(colour, paper, 0.25 * rnd());
    return blot(`s${i}`, x, y, r, tone, a);
  });
  return (
    <View style={{ width: w, height: h, overflow: "hidden", backgroundColor: mix(paper, colour, dark ? 0.16 : 0.1) }}>
      {blot("glow", w / 2, cy, m * 0.55, colour, d.quality === "vivid" ? 0.3 : 0.18)}
      {blot("core", w / 2, cy, m * 0.22, mix(colour, dark ? "#ffffff" : "#fff6dc", 0.4), d.quality === "broken" ? 0.12 : 0.22)}
      {strokes}
      {children}
    </View>
  );
}

// A line of a cover drawn here, at `size` on a 320-tall cover, never under `min`: its line height and spacing go with
// it. The mono face keeps a line about 23 tall whatever its size, and the spacing stayed full size, so on the shelf
// (a cover about 80 x 112) a title's two lines and a month wrapped in two ran off the cover, the title off its top.
export const coverLine = (size: number, min: number, s: number) => {
  const f = Math.max(min, size * s);
  return { fontSize: f, lineHeight: Math.round(f * 1.2), letterSpacing: Math.max(0.4, f * 0.09) };
};

// ---- the cover: its daemon over the month's first painting ----
export function DreamCover({ v, w, h }: { v: DreamVolume; w: number; h: number }) {
  const first = v.dreams[0], colour = first?.dayColour || "#5a4a6a", s = h / 320;
  return (
    // positioned, so it stands over the shelf's own title (Bookcase's Standing lays that under every cover)
    <YStack position="relative" width={w} height={h} backgroundColor={mix(colour, "#120c18", 0.55)}>
      {first ? <View style={{ position: "absolute", left: 0, top: 0 }}><Wash d={first} w={w} h={h} dark /></View> : null}
      <YStack position="absolute" top={0} left={0} right={0} bottom={0} alignItems="center" justifyContent="space-between" paddingVertical={18 * s} paddingHorizontal={8 * s}>
        <Text fontFamily="$mono" {...coverLine(17, 9, s)} fontWeight="800" color="#f3e6c4" textAlign="center" numberOfLines={2}>{v.title}</Text>
        <Art path={`/art/species/${v.species}.png`} size={Math.round(120 * s)} />
        <YStack alignItems="center" gap={2 * s}>
          <Text fontFamily="$mono" {...coverLine(11, 7, s)} color="#e2c27c" textAlign="center" numberOfLines={1}>{v.month}</Text>
          <Text fontFamily="$mono" {...coverLine(10, 7, s)} color="#cbbf9f" textAlign="center" numberOfLines={1}>{`${v.dreams.length} ${v.dreams.length === 1 ? "DREAM" : "DREAMS"}`}</Text>
        </YStack>
      </YStack>
    </YStack>
  );
}

// ---- the book, a page at a time ----
export function DreamBook({ v }: { v: DreamVolume }) {
  const dark = useDark();
  const [page, setPage] = useState(0);
  const [w, setW] = useState(0);
  const last = v.dreams.length, d = page > 0 ? v.dreams[page - 1] : null;
  const h = Math.round(Math.min(560, Math.max(380, w * 1.35))), ink = dark ? "#EDE7DA" : "#1C1B1A";
  return (
    <YStack gap={12}>
      <YStack onLayout={(e) => setW(e.nativeEvent.layout.width)} borderRadius={6} overflow="hidden" borderWidth={1} borderColor="$color6">
        {!w ? <YStack height={380} /> : !d ? (
          <Wash d={{ id: v.dreams[0]?.id ?? 1, dayColour: v.dreams[0]?.dayColour ?? "#6a5a7a", centre: 6, quality: "quiet" }} w={w} h={h} dark={dark}>
            <YStack position="absolute" top={0} left={0} right={0} bottom={0} alignItems="center" justifyContent="center" gap={14} padding={24}>
              <Art path={`/art/species/${v.species}.png`} size={112} />
              <Text fontFamily="$mono" fontSize={20} fontWeight="800" letterSpacing={2} color={ink} textAlign="center">{v.title}</Text>
              <Text fontFamily="$mono" fontSize={13} letterSpacing={2} color={ink} opacity={0.75}>{v.month}</Text>
              <Text fontSize={14} fontStyle="italic" color={ink} opacity={0.8} textAlign="center">{`Dreamt, and written down, by ${v.nickname}.  DRAFT`}</Text>
            </YStack>
          </Wash>
        ) : (
          <Wash d={d} w={w} h={h} dark={dark}>
            <YStack position="absolute" top={0} left={0} right={0} bottom={0} padding={18} gap={12} justifyContent="space-between">
              <XStack alignItems="center" gap={10}>
                <DreamSymbol day={d.day} centre={d.centre} colour={d.dayColour} size={56} dark={dark} />
                <Text flex={1} fontFamily="$mono" fontSize={15} fontWeight="700" letterSpacing={1.5} color={ink}>{d.title}</Text>
              </XStack>
              <YStack borderRadius={6} padding={14} backgroundColor={dark ? "rgba(16,13,10,0.55)" : "rgba(250,246,236,0.62)"}>
                <Text fontSize={16} lineHeight={25} color={ink} fontStyle="italic">{d.text}</Text>
              </YStack>
              <XStack justifyContent="space-between" alignItems="flex-end">
                <Text fontFamily="$mono" fontSize={11} color={ink} opacity={0.75}>{`${d.nickname}, woke ${whenSaid(d.to)}`}</Text>
                <Text fontFamily="$mono" fontSize={11} color={ink} opacity={0.75}>{`${page} / ${last}`}</Text>
              </XStack>
            </YStack>
          </Wash>
        )}
      </YStack>
      <XStack justifyContent="space-between" alignItems="center" gap={8} flexWrap="wrap">
        <Action label="‹ BACK" onPress={() => setPage((p) => Math.max(0, p - 1))} />
        {d ? <VoiceButton text={d.text} voice="daemon" /> : <Small>{`${last} ${last === 1 ? "dream" : "dreams"} this month.`}</Small>}
        <Action label="NEXT ›" onPress={() => setPage((p) => Math.min(last, p + 1))} />
      </XStack>
    </YStack>
  );
}
