// C-261 (the user, 2026-10-31): RECEIVED -- what something done in the game brought to the companion, shown the moment
// a SYNC brings it, whichever SYNC it was (the game's own save, the button, the site hearing the save change): a frame
// with a border, "{you} Received" at the top, the daemon under it (or the item and how many), and under that who it is
// from -- you, for a daemon SENT from your party; the other player, for a trade or a gift. One at a time; a tap puts it
// away and shows the next. Every word DRAFT.
import { useEffect, useState } from "react";
import { Text, YStack } from "tamagui";
import type { Arrival } from "../../server/src/core";
import { Art } from "./ui";

type Shown = { player: string; a: Arrival };
let queue: Shown[] = [];
const heard = new Set<() => void>();
let shownUpTo = 0;                                         // the companion's count of SYNCs that brought something (heard)
export function heardSync(r: { player?: string; married?: { name?: string }; arrivals?: Arrival[]; heard?: number } | null | undefined) {
  if (typeof r?.heard === "number") shownUpTo = Math.max(shownUpTo, r.heard);
  const player = r?.player ?? r?.married?.name ?? "";
  const got = (r?.arrivals ?? []).map((a) => ({ player, a }));
  if (!got.length) return;
  queue = [...queue, ...got];
  heard.forEach((f) => f());
}

// The site, hearing the companion's count (/api/sync/heard): a SYNC it did not ask for -- the save watched, the
// playground's game, a paired phone -- shows here too. The first answer only says where the count is.
export function heardElsewhere(h: { n: number; player: string; arrivals: Arrival[] }, first: boolean): boolean {
  if (first || h.n <= shownUpTo) { shownUpTo = Math.max(shownUpTo, h.n); return false; }
  shownUpTo = h.n;
  heardSync({ player: h.player, arrivals: h.arrivals });
  return true;
}

const INK = "#1d2029", PAPER = "#fbfaf6", RULE = "#2b2f3a";   // the frame is its own paper, as the game's boxes are
export function Received() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); heard.add(f); return () => { heard.delete(f); }; }, []);
  const top = queue[0];
  if (!top) return null;
  const { player, a } = top;
  const next = () => { queue = queue.slice(1); tick((n) => n + 1); };
  const what = a.kind === "item" ? `${a.count ?? 1} ${a.nickname}` : a.nickname;
  const where = a.kind === "sent" ? "with your companion now" : a.where === "party" ? "in your party" : "in your PC";   // DRAFT
  const art = a.kind === "sent" && a.slot !== undefined ? `/art/party/${a.slot}.png` : `/art/species/${a.species}.png`;
  return (
    <YStack position="absolute" top={0} left={0} right={0} bottom={0} zIndex={1000} alignItems="center" justifyContent="center"
            backgroundColor="rgba(8,10,14,0.55)" padding={16} onPress={next} cursor="pointer" role="dialog"
            aria-label={`${player} received ${what}, from ${a.from ?? "your companion"}`}>
      <YStack borderWidth={3} borderColor={RULE} borderRadius={10} backgroundColor={PAPER} padding={4} maxWidth={360} onPress={next}>
        <YStack borderWidth={3} borderColor="$color9" borderRadius={7} paddingHorizontal={28} paddingVertical={18}
                alignItems="center" gap={12} minWidth={240}>
          <Text fontFamily="$mono" fontSize={18} fontWeight="700" letterSpacing={1.5} color={INK} textAlign="center">
            {`${player || "You"} Received`}
          </Text>
          {a.kind === "item"
            ? <YStack height={96} justifyContent="center"><Text fontFamily="$mono" fontSize={20} fontWeight="700" color={INK} textAlign="center">{what}</Text></YStack>
            : <Art path={art} size={128} />}
          <Text fontFamily="$mono" fontSize={15} letterSpacing={1} color={INK} textAlign="center">{`From ${a.from ?? "your companion"}`}</Text>
          <Text fontSize={11} color="#6b7080" textAlign="center">{`${a.kind === "item" ? "" : `${what}, `}${where}${queue.length > 1 ? ` · ${queue.length - 1} more` : ""} · DRAFT`}</Text>
        </YStack>
      </YStack>
    </YStack>
  );
}
