// C-320 (the user, 2026-11-10: "some books do not have a title art shown, it just saw a word ... all books have their
// appealing artwork ... maybe In the library we categorize the selections a bit ... and maybe instead of a vertical list
// we make the library look like a real antique book shelf"): the LIBRARY as an old bookcase -- a walnut case, a shelf
// per kind of book, a brass plate naming it, and every book standing face-out by its own cover (DAEMONS
// tools/shelfcovers.py writes server/data/art/books/<book>.png, every one 320 tall at its own width). A shelf that holds
// more than fits goes on to a second board. A cover not yet fetched shows as cloth with its name, so nothing is ever
// only a word on a coloured box. Every word DRAFT.
import { useState } from "react";
import { Platform } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { Art } from "../../ui/ui";

export type CaseBook = {
  id: string;
  title: string;          // what a reader of the screen hears, and what the cloth says until the cover comes
  about: string;          // said on hover (the site) and to a screen reader
  cloth: string;          // the colour behind the cover, while it comes
  mark?: string;          // C-314: a small brass tag across its foot ("kept in the app")
  onPress: () => void;
};
export type Shelf = { name: string; books: CaseBook[]; empty?: string };

// each cover's width at 320 tall, as shelfcovers.py draws it (the printed books are A5)
const WIDE: Record<string, number> = { guide: 264, subtle: 264, hermetic: 299, eudaimon: 305, unity: 394, school: 260,
                                       notebook: 216, songbook: 216, stream: 216 };
const wide = (id: string) => WIDE[id] ?? 226;

const WOOD = { case: "#3b2414", crown: "#4f311b", crownLit: "#7a5233", back: "#21140b", groove: "#2a1a0f",
               board: "#7a4e2b", boardLit: "#a7713f", boardDark: "#46291a", brass: "#c09a52", brassLit: "#e2c27c",
               brassDark: "#6e5326", engraved: "#2b1b0c" };

export function Bookcase({ shelves }: { shelves: Shelf[] }) {
  const [w, setW] = useState(0);
  const tall = w >= 640 ? 160 : w >= 420 ? 132 : 112;     // a cover's height on the shelf
  const inner = Math.max(0, w - 2 * 12 - 2 * 10);          // the case's sides and the shelf's margin
  return (
    <YStack onLayout={(e) => setW(e.nativeEvent.layout.width)} borderRadius={6} overflow="hidden"
            backgroundColor={WOOD.case} borderWidth={1} borderColor="#1a0e06">
      {/* the crown: a moulding, lit along its top edge */}
      <YStack height={18} backgroundColor={WOOD.crown} borderTopWidth={3} borderTopColor={WOOD.crownLit}
              borderBottomWidth={4} borderBottomColor="#24150b" />
      <YStack paddingHorizontal={12} paddingBottom={12}>
        {w ? shelves.map((s) => <OneShelf key={s.name} s={s} tall={tall} inner={inner} />) : null}
      </YStack>
      <YStack height={10} backgroundColor={WOOD.crown} borderTopWidth={2} borderTopColor="#24150b" />
    </YStack>
  );
}

// books laid along a board until it is full, then a board more
function rows(books: CaseBook[], tall: number, inner: number, gap: number) {
  const out: CaseBook[][] = [[]];
  let at = 0;
  for (const b of books) {
    const bw = (wide(b.id) * tall) / 320;
    if (out[out.length - 1].length && at + gap + bw > inner) { out.push([]); at = 0; }
    at += (out[out.length - 1].length ? gap : 0) + bw;
    out[out.length - 1].push(b);
  }
  return out;
}

function OneShelf({ s, tall, inner }: { s: Shelf; tall: number; inner: number }) {
  const gap = tall >= 132 ? 14 : 10;
  const boards = s.books.length ? rows(s.books, tall, inner, gap) : [[]];
  return (
    <YStack marginTop={12}>
      {boards.map((r, i) => (
        <YStack key={i}>
          {/* the back of the case, dark, with its boards' grooves */}
          <XStack backgroundColor={WOOD.back} borderTopLeftRadius={2} borderTopRightRadius={2} minHeight={tall + 22}
                  paddingHorizontal={10} paddingTop={14} gap={gap} alignItems="flex-end" justifyContent="center"
                  borderLeftWidth={3} borderLeftColor="#160c05" borderRightWidth={3} borderRightColor="#160c05">
            {r.length ? r.map((b) => <Standing key={b.id} b={b} tall={tall} />)
              : <YStack height={tall} flex={1} justifyContent="center" paddingHorizontal={20}>
                  <Text fontFamily="$mono" fontSize={12} lineHeight={18} letterSpacing={1} color="#9c8466" textAlign="center"
                        fontStyle="italic">{s.empty ?? ""}</Text>
                </YStack>}
          </XStack>
          {/* the board: lit on its lip, shadowed under, its brass plate on the first */}
          <YStack position="relative" minHeight={i === 0 ? 26 : 16} backgroundColor={WOOD.board} borderTopWidth={3} borderTopColor={WOOD.boardLit}
                  borderBottomWidth={4} borderBottomColor={WOOD.boardDark} alignItems="center" justifyContent="center">
            {i === 0 ? <Plate name={s.name} /> : null}
          </YStack>
        </YStack>
      ))}
    </YStack>
  );
}

function Plate({ name }: { name: string }) {
  return (
    <YStack marginVertical={2} paddingHorizontal={12} paddingVertical={2} backgroundColor={WOOD.brass}
            borderRadius={2} borderWidth={1} borderTopColor={WOOD.brassLit} borderLeftColor={WOOD.brassLit}
            borderBottomColor={WOOD.brassDark} borderRightColor={WOOD.brassDark}>
      <Text fontFamily="$mono" fontSize={9} fontWeight="700" letterSpacing={2.2} color={WOOD.engraved}>{name}</Text>
    </YStack>
  );
}

// a book standing face-out: its cover, the fold of its spine lit, a shadow on the board; it lifts when pointed at
function Standing({ b, tall }: { b: CaseBook; tall: number }) {
  const bw = Math.round((wide(b.id) * tall) / 320);
  return (
    <YStack position="relative" width={bw} height={tall} cursor="pointer" role="button" aria-label={`${b.title}: ${b.about}`}
            accessibilityHint={b.about} onPress={b.onPress}
            hoverStyle={{ y: -5 }} pressStyle={{ y: -2, opacity: 0.92 }}
            {...(Platform.OS === "web" ? ({ title: `${b.title} -- ${b.about}` } as object) : {})}
            shadowColor="#000" shadowOpacity={0.55} shadowRadius={4} shadowOffset={{ width: 3, height: 2 }} elevation={4}
            borderRadius={2} overflow="hidden" backgroundColor={b.cloth}>
      {/* the cloth and its name, under the cover until the cover comes (or if it never does) */}
      <YStack position="absolute" top={0} left={0} right={0} bottom={0} padding={8} justifyContent="center">
        <Text fontFamily="$mono" fontSize={11} fontWeight="800" letterSpacing={1} color="#f3e6c4" textAlign="center">{b.title}</Text>
      </YStack>
      <Art path={`/art/books/${b.id}.png`} size={bw} height={tall} smooth />
      <YStack position="absolute" top={0} bottom={0} left={3} width={2} backgroundColor="rgba(255,255,255,0.16)" />
      <YStack position="absolute" top={0} bottom={0} left={5} width={1} backgroundColor="rgba(0,0,0,0.25)" />
      <YStack position="absolute" top={0} left={0} right={0} height={2} backgroundColor="rgba(255,255,255,0.10)" />
      {b.mark ? <YStack position="absolute" left={0} right={0} bottom={6} alignItems="center">
        <Text fontFamily="$mono" fontSize={8} fontWeight="700" letterSpacing={1} color={WOOD.engraved} backgroundColor={WOOD.brass}
              paddingHorizontal={5} paddingVertical={1} borderRadius={2}>{b.mark}</Text></YStack> : null}
    </YStack>
  );
}
