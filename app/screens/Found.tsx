// C-189: what the game just gave, open beside it. On an iPad on its side, each time the game writes its save the
// companion reads the NOTEBOOK and the INDEX again and shows what was not there before -- a page just filed, open to
// read, or the INDEX card of a daemon just met or bound -- above the companion's page, until it is put away. What the
// save held when the app opened is never shown as new. Only what the game has saved is known here: a page is found in the
// game and shows here at the next save.
import { useEffect, useRef, useState } from "react";
import { ScrollView } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { api } from "../net";
import { Index, IndexEntry, Notebook } from "../types";
import { Art, Card, Eyebrow, Small } from "../ui";
import { NotebookPage } from "./Library";
import { heldKeys, newlyFound, type Found as FoundT } from "../../server/src/save/found";

type Page = Notebook["sections"][number]["pages"][number];
export type Found = FoundT<Page, IndexEntry>;

// Read again each time `saved` moves; the first reading is what the save already held
export function useFound(saved: number) {
  const held = useRef<Map<string, Found> | null>(null);
  const [found, setFound] = useState<Found[]>([]);
  useEffect(() => {
    let gone = false;
    Promise.all([api<Notebook>("/api/notebook").catch(() => null), api<Index>("/api/index").catch(() => null)]).then(([n, ix]) => {
      if (gone || (!n && !ix)) return;
      const now = heldKeys(n, ix);
      if (held.current) {
        const fresh = newlyFound(held.current, now);
        if (fresh.length) setFound((f) => [...fresh, ...f.filter((x) => !fresh.some((y) => y.key === x.key))].slice(0, 6));
      }
      held.current = now;
    });
    return () => { gone = true; };
  }, [saved]);
  return { found, putAway: (key: string) => setFound((f) => f.filter((x) => x.key !== key)) };
}

const flat = (s: string) => s.replace(/\n/g, " ");          // the game's line breaks are for its own window

function FoundCard({ f, onAway }: { f: Found; onAway: () => void }) {
  const e = f.kind === "card" ? f.entry : null;
  return (
    <Card borderLeftWidth={6} borderLeftColor={e?.colour?.hex ?? "$color9"} padding={12} gap={4}>
      <XStack alignItems="center">
        <Eyebrow>{f.kind === "page" ? `JUST FILED · ${f.section}` : e!.bound ? "JUST BOUND · INDEX" : "JUST MET · INDEX"}</Eyebrow>
        <YStack marginLeft="auto" role="button" aria-label="put away" cursor="pointer" padding={4} onPress={onAway}>
          <Text fontSize={16} fontWeight="700" color="$color10">✕</Text>
        </YStack>
      </XStack>
      {f.kind === "page" ? <NotebookPage page={f.page} open /> : (
        <YStack gap={6}>
          <XStack gap={12} alignItems="center">
            {e!.art ? <Art path={e!.art} size={64} /> : null}
            <YStack flex={1}>
              <Text fontFamily="$mono" fontSize={11} color="$color10">{`No. ${String(e!.national).padStart(3, "0")}`}</Text>
              <Text fontSize={16} fontWeight="600" color="$color12">{e!.name}</Text>
              {e!.bound ? <Small>{`${e!.category} · ${(e!.types ?? []).join(" / ")}`}</Small> : <Small>Seen</Small>}
            </YStack>
          </XStack>
          {e!.entry ? <Text fontSize={15} lineHeight={22} color="$color12">{flat(e!.entry)}</Text> : null}
          {e!.native?.length ? e!.native.map((n) => <Text key={n} fontFamily="$mono" fontSize={13} color="$color11">{n}</Text>) : null}
        </YStack>
      )}
      <Small color="$color8">DRAFT</Small>
    </Card>
  );
}

// Above the companion's page, beside the game: the newest first, under half the column
export function FoundBeside({ found, putAway }: ReturnType<typeof useFound>) {
  if (!found.length) return null;
  return (
    <YStack maxHeight="45%" borderBottomWidth={1} borderBottomColor="$color6" backgroundColor="$color2">
      <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
        {found.map((f) => <FoundCard key={f.key} f={f} onAway={() => putAway(f.key)} />)}
      </ScrollView>
    </YStack>
  );
}
