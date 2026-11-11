// LIBRARY > THE ORIGIN OF A DAEMON (DAEMONS T-533, bible 9.35): the book found in the game, read here as far as the save
// has given it back (GET /api/origin) -- the same open book as the dawn half and the mended book (Eudaimon.tsx LayerPages:
// the contents, then each entry, its emblem on the left and its words on the right). A section the save has not given
// back is not here at all: not faint, and not counted. Its page is bone, its ink an old book's brown and its rules umber,
// as the game prints it (DAEMONS tools/gensubtle.py ORIGIN_PALETTE); its marks -- CONTENTS, the entries' names, BACK and
// NEXT -- are in its ink too, so they read (the game's amber is too faint on bone for words, and stays in its pictures).
// The cover and the emblems are the game's own (data/art/origin_*.png), the cover's title set here in our type where the
// game letters it (the game's font is FireRed's). Once every section is back (the server's `whole`), LISTEN sits under the
// cover, as in the other books: the whole book read aloud, sealed in DAEMONS and opened here with the last word of the
// book's own last page -- which the device holds only then (bookkeys.ts keyOfOrigin). Every word DRAFT.
import { useState } from "react";
import { Text, YStack } from "tamagui";
import { Art } from "../../ui/ui";
import { TurningPicture } from "../../ui/bookPicture";
import { Listen } from "../../ui/bookAudio";   // T-533: its recording, sealed, keyed by its last page
import { LayerPages, type EudaimonT, type LayerPalette } from "../shared/Eudaimon";

// whole: every section back (GET /api/origin), a yes or a no, never a count
export type OriginT = EudaimonT & { whole?: boolean };
// bone; an old book's brown, for the words and the marks alike (8.1:1 on bone); the boards, bone gone brown with handling;
// umber rules
export const ORIGIN: LayerPalette = { page: "#C6BCA8", boards: "#7B6B52", ink: "#2C241E", faint: "#5E5242", edge: "#8A6846",
                                      mark: "#2C241E", lit: "#8A6846" };
const CHALK = "#F7EFDE";                                  // the cover's lettering

// where the book lies on the game's cover (DAEMONS tools/origin_art.py: x 48..191, y 4..154), and the rows its title's two
// lines are lettered on (caps 17..23 and 31..37, centred on the book)
const BOOK = { x0: 48, y0: 4, x1: 191, y1: 154 };
const TITLE: [number, string][] = [[20, "THE ORIGIN"], [34, "OF A DAEMON"]];

// the cover cut from the game's screen, at most twice the game's size and smaller on a narrow phone
function Cover() {
  const [w, setW] = useState(0);
  const cw = BOOK.x1 - BOOK.x0 + 1, ch = BOOK.y1 - BOOK.y0 + 1, s = Math.min(2, w / cw);
  return (
    <YStack width="100%" alignItems="center" overflow="hidden" onLayout={(ev) => setW(ev.nativeEvent.layout.width)}>
      {w ? (
        <YStack width={cw * s} height={ch * s} position="relative" overflow="hidden" borderRadius={2}>
          <YStack marginLeft={-BOOK.x0 * s} marginTop={-BOOK.y0 * s}><Art path="/art/origin/cover.png" size={240 * s} height={160 * s} /></YStack>
          {TITLE.map(([y, line]) => (
            <Text key={line} allowFontScaling={false} numberOfLines={1} position="absolute" top={(y - 7 - BOOK.y0) * s} height={12 * s}
                  left={0} right={0} textAlign="center" fontFamily="$mono" fontSize={9 * s} lineHeight={12 * s}
                  letterSpacing={0.5 * s} fontWeight="800" color={CHALK}>{line}</Text>
          ))}
        </YStack>
      ) : null}
    </YStack>
  );
}

export function OriginBook({ b }: { b: OriginT }) {
  // T-533: the last section's paragraphs, joined -- the page whose last word is the recording's key; here only when whole
  const secs = b.sections ?? [], last = secs[secs.length - 1];
  const lastPage = last?.entries.flatMap((e) => e.paragraphs.map((p) => p.text)).join(" ");
  return <LayerPages b={b} P={ORIGIN} green={ORIGIN.mark} id="origin" cover={<Cover />}
                     under={b.whole ? <Listen which="origin" warning={lastPage} /> : undefined}
                     picture={(e, scale) => <TurningPicture book="origin" e={e} scale={scale} />} />;
}
