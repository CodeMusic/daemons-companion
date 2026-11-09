// C-309 (the user, 2026-11-09: "it would be really great if the spoken section visually looked unique, so the listener
// feels where they are in the book"): which paragraph READ ALOUD is saying now, and the paragraph drawn as the one being
// said -- in the open book's look (bookLook.tsx): a wash of its ink, its ink's rule beside it, its glyph, breathing on its
// tempo. The words around it are left as they are. Kept outside any screen, as places are.
import { useSyncExternalStore, type ReactNode } from "react";
import { Text, XStack, YStack } from "tamagui";
import { useBookLook, useBreathOf, wash } from "./bookLook";

let saying: { id: string; i: number } | null = null;
const heard = new Set<() => void>();
export function setSaying(id: string | null, i = 0) {
  saying = id === null ? null : { id, i };
  heard.forEach((f) => f());
}
const subscribe = (f: () => void) => { heard.add(f); return () => { heard.delete(f); }; };
// the paragraph of `id` being said (0 its title), or null
export const useSaying = (id: string) => useSyncExternalStore(subscribe, () => (saying?.id === id ? saying.i : null), () => null);

// a paragraph of a chapter whose READ ALOUD is `id`; `i` is its place in what READ ALOUD was given (the title is 0)
export function SpokenPara({ id, i, children }: { id: string; i: number; children: ReactNode }) {
  const now = useSaying(id) === i;
  const l = useBookLook();
  const b = useBreathOf(l, now);
  if (!now) return <>{children}</>;
  return (
    <XStack gap={8} marginHorizontal={-8} paddingVertical={6} paddingRight={8} borderRadius={Math.min(l.edge, 8)}
            backgroundColor={wash(l.ink, 0.1 + 0.08 * b)} borderLeftWidth={3} borderLeftColor={l.ink} paddingLeft={8}
            aria-label="being read aloud">
      <YStack flex={1}>{children}</YStack>
      <Text fontSize={14} color={l.ink} opacity={0.55 + 0.45 * b}>{l.glyph}</Text>
    </XStack>
  );
}
