// LIBRARY > THE SPELL LEFT RUNNING (C-474, DAEMONS T-606): the book of shadows found in the game where INIT knelt on
// DAEMON TOWER's top floor, read here once the save holds it (GET /api/shadow), the whole book at once -- the same open
// book as THE ORIGIN OF A DAEMON's (Eudaimon.tsx LayerPages: the contents, then each entry, its plate on the left and its
// words on the right). Its page is the incantation's parchment and its ink the hat's night, as the game prints it
// (DAEMONS tools/gensubtle.py SHADOW_PALETTE); its marks are in the ink too, the virtues' gold kept for its plates, too
// faint on parchment for words. The cover and the plates are the game's own (data/art/shadow_*.png), the cover's title set
// here in our type where the game letters it (the game's font is FireRed's). Its recording, in the Sorcerer's voice, comes
// with the next minor release; until then a page is read aloud as any is. Every word DRAFT.
import { useState } from "react";
import { Text, YStack } from "tamagui";
import { Art } from "../../ui/ui";
import { TurningPicture } from "../../ui/bookPicture";
import { LayerPages, type EudaimonT, type LayerPalette } from "../shared/Eudaimon";

export type ShadowT = EudaimonT;
// parchment (247 239 222); the hat's night (33 41 90), 11:1 on it; its faint (115 115 140); the boards, the night;
// the shade under the page; the virtues' gold, lit
export const SHADOW: LayerPalette = { page: "#F7EFDE", boards: "#102142", ink: "#21295A", faint: "#5E5E78", edge: "#CEC6AD",
                                      mark: "#21295A", lit: "#E7AD42" };
const CHALK = "#FFF7E7", CHALK_FAINT = "#B5AD9D";        // the cover's lettering

// the game's cover is the whole screen (DAEMONS tools/shadow_art.py), its title on rows 134 and 148, centred on x 120
const TITLE: [number, string, string, number][] = [[134, "THE SPELL LEFT RUNNING", CHALK, 9], [148, "A BOOK OF SHADOWS", CHALK_FAINT, 7]];

function Cover() {
  const [w, setW] = useState(0);
  const s = Math.min(2, w / 240);
  return (
    <YStack width="100%" alignItems="center" overflow="hidden" onLayout={(ev) => setW(ev.nativeEvent.layout.width)}>
      {w ? (
        <YStack width={240 * s} height={160 * s} position="relative" overflow="hidden" borderRadius={2}>
          <Art path="/art/shadow/cover.png" size={240 * s} height={160 * s} />
          {TITLE.map(([y, line, color, size]) => (
            <Text key={line} allowFontScaling={false} numberOfLines={1} position="absolute" top={(y - 4) * s} height={12 * s}
                  left={0} right={0} textAlign="center" fontFamily="$mono" fontSize={size * s} lineHeight={12 * s}
                  letterSpacing={0.5 * s} fontWeight={size > 8 ? "800" : "400"} color={color}>{line}</Text>
          ))}
        </YStack>
      ) : null}
    </YStack>
  );
}

export function ShadowBook({ b }: { b: ShadowT }) {
  return <LayerPages b={b} P={SHADOW} green={SHADOW.mark} id="shadow" cover={<Cover />}
                     picture={(e, scale) => <TurningPicture book="shadow" e={e} scale={scale} />} />;
}
