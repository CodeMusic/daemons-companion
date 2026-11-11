// C-264 (the user, 2026-10-31: "before u start the game there should be a button for how to play, which shows 2 options on
// a frame popup in purple, USER MANUAL, QUICK START, clicking either of this will show a reader popup over the game panel
// (however full wide or resized it is) which shows the pdf of what u selected..... along with an option to return to the
// main menu"; and by multiple choice, MICRO-START first): HOW TO PLAY -- a purple frame with the three books, shortest
// first, and a reader that fills the room it is given (the game panel, at whatever size it is dragged to; on the site, the
// page), with the way back. Opened from GAME's title and from the companion's header (? HOW TO PLAY); the menu bar's Help
// is still to come. The books are DAEMONS' own PDFs as the LIBRARY fetches and keeps them (manual.ts). Every word DRAFT.
import { useEffect, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import type { Which } from "../state/manual";
import { BookPdf } from "../screens/library/Manual";

export type HowTo = "closed" | "choose" | Which;
let now: HowTo = "closed";
const heard = new Set<(h: HowTo) => void>();
export function openHowTo(h: HowTo = "choose") { now = h; heard.forEach((f) => f(h)); }
export const closeHowTo = () => openHowTo("closed");
export function useHowTo(): HowTo {
  const [h, set] = useState<HowTo>(now);
  useEffect(() => { heard.add(set); set(now); return () => { heard.delete(set); }; }, []);
  return h;
}

const BOOKS: { which: Which; label: string; note: string }[] = [                 // DRAFT
  { which: "micro", label: "MICRO-START", note: "DAEMONS in five pages" },
  { which: "quick", label: "QUICK-START", note: "what it is, and how to play it, step by step" },
  { which: "player", label: "USER MANUAL", note: "every way to play, and how it all works" },
];
const NAME: Record<string, string> = Object.fromEntries(BOOKS.map((b) => [b.which, b.label]));
// THE SUBTLE LAYER's purples: a deep page, a lit rule, pale words
const DEEP = "#1f1230", RULE = "#b48ad6", INNER = "#6b3fa0", WORD = "#f3ecfb", SOFT = "#c8b6dc";

function Key({ label, onPress, hint }: { label: string; onPress: () => void; hint?: string }) {
  return (
    <YStack role="button" cursor="pointer" aria-label={hint ?? label} onPress={onPress} paddingHorizontal={10} paddingVertical={5}
            borderRadius={3} borderWidth={1} borderColor={RULE}>
      <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color={WORD}>{label}</Text>
    </YStack>
  );
}

// Over the room it is put in. `playing`: opened while the game plays -- the way back is to the game, and the title is a
// second way; otherwise the way back is the title (the main menu) it was opened from.
export function HowToOverlay({ playing, toTitle }: { playing: boolean; toTitle?: () => Promise<void> | void }) {
  const h = useHowTo();
  if (h === "closed") return null;
  if (h === "choose") return (
    <YStack position="absolute" top={0} left={0} right={0} bottom={0} zIndex={900} alignItems="center" justifyContent="center"
            padding={16} backgroundColor="rgba(8,6,14,0.62)" onPress={closeHowTo} role="dialog" aria-label="how to play">
      <YStack borderWidth={3} borderColor={RULE} borderRadius={10} backgroundColor={DEEP} padding={4} maxWidth={380} width="100%"
              onPress={(e: any) => e?.stopPropagation?.()}>
        <YStack borderWidth={2} borderColor={INNER} borderRadius={7} paddingHorizontal={22} paddingVertical={18} gap={6}>
          <Text fontFamily="$mono" fontSize={18} fontWeight="700" letterSpacing={2} color={WORD} textAlign="center">HOW TO PLAY</Text>
          {BOOKS.map((b) => (
            <YStack key={b.which} role="button" cursor="pointer" aria-label={b.label} onPress={() => openHowTo(b.which)}
                    marginTop={8} paddingVertical={10} paddingHorizontal={14} borderRadius={5} borderWidth={1} borderColor={INNER}
                    backgroundColor="rgba(180,138,214,0.10)" hoverStyle={{ backgroundColor: "rgba(180,138,214,0.22)" }}>
              <Text fontFamily="$mono" fontSize={16} letterSpacing={2} color={WORD}>{b.label}</Text>
              <Text fontSize={12} color={SOFT}>{b.note}</Text>
            </YStack>
          ))}
          <XStack justifyContent="center" gap={8} marginTop={12}>
            <Key label="✦ WHAT'S NEW" onPress={() => { closeHowTo(); require("./whatsnew").openWhatsNew(); }} />{/* C-318; required here: whatsnew imports this file */}
            <Key label="CLOSE" onPress={closeHowTo} />
          </XStack>
          <Text fontSize={10} color={SOFT} textAlign="center">DRAFT</Text>
        </YStack>
      </YStack>
    </YStack>
  );
  const mainMenu = async () => { await toTitle?.(); closeHowTo(); };   // the save taken out first, as ‹ TITLE does
  return (
    <YStack position="absolute" top={0} left={0} right={0} bottom={0} zIndex={900} backgroundColor="#0f1115">
      <XStack paddingHorizontal={8} paddingVertical={6} gap={8} alignItems="center" backgroundColor={DEEP}
              borderBottomWidth={2} borderBottomColor={INNER} flexWrap="wrap">
        {playing ? <Key label="‹ BACK TO THE GAME" onPress={closeHowTo} /> : null}
        <Key label={playing ? "MAIN MENU" : "‹ MAIN MENU"} onPress={playing ? mainMenu : closeHowTo} />
        <Text flex={1} minWidth={90} fontFamily="$mono" fontSize={12} letterSpacing={2} color={WORD} numberOfLines={1}>{NAME[h] ?? ""}</Text>
        <Key label="BOOKS" onPress={() => openHowTo("choose")} hint="the other books" />
      </XStack>
      <YStack flex={1}><BookPdf which={h} /></YStack>
    </YStack>
  );
}
