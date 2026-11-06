// A book's picture as the game draws it -- DAEMONS companion_export writes each into data/art/<book>_<picture>_<frame>.png
// and sets the entry's "frames" (T-423 THE SUBTLE LAYER; T-519 / C-299 the third book's three forms) -- its frames turning as
// the game turns them, one every 0.7 s. A picture the game has not drawn yet (frames 0) shows what stands in for it.
import { useEffect, useState, type ReactNode } from "react";
import { Text, YStack } from "tamagui";
import { Art } from "./ui";

export type BookWithArt = "subtle" | "hermetic" | "eudaimon" | "unity";
export type Pictured = { picture: string; frames?: number };

export function TurningPicture({ book, e, scale, standIn }: { book: BookWithArt; e: Pictured; scale: number; standIn?: ReactNode }) {
  const drawn = (e.frames ?? 0) > 0;
  const n = Math.max(1, e.frames ?? 1);
  const [f, setF] = useState(0);
  useEffect(() => {
    setF(0);
    if (n < 2) return;
    const t = setInterval(() => setF((x) => (x + 1) % n), 700);
    return () => clearInterval(t);
  }, [n, e.picture]);
  if (!drawn && standIn) return <>{standIn}</>;
  return <Art path={`/art/${book}/${e.picture}_${n > 1 ? f % n : 0}.png`} size={94 * scale} height={84 * scale} fit="contain" />;
}

// A torn book's cover as the game draws it (data/art/<book>_cover.png, the whole 240x160 screen, no lettering: the game's
// font is FireRed's), its title and subtitle set in our own type where the game letters them -- each cover's band measured
// from the user's picks against the export (DAEMONS tools/thirdbook_covers/, 2026-11-05: the title's caps rows 15..22, the
// subtitle's 31..37, a row shorter; the mended book's a row higher, in its box over the left cover, rows 10..36).
// At most twice the game's size; smaller on a narrow phone.
export type TornCover = "hermetic" | "eudaimon" | "unity";
const BAND: Record<TornCover, { cx: number; title: number; sub: number; ink: string; faint: string }> = {
  hermetic: { cx: 118, title: 18.5, sub: 34, ink: "#FFF7F7", faint: "#846B94" },
  eudaimon: { cx: 117, title: 18.5, sub: 34, ink: "#FFF7DE", faint: "#8CADEF" },
  unity: { cx: 97, title: 17.5, sub: 33, ink: "#FFF7E7", faint: "#A58C84" },
};
// the title and subtitle in our type where the game letters them, on a cover drawn at s from (x0, y0) of the game's screen
function Lettering({ book, s, title, subtitle, x0 = 0, y0 = 0 }: { book: TornCover; s: number; title: string; subtitle?: string; x0?: number; y0?: number }) {
  const k = BAND[book];
  // a line of type centred on the game's row y (the glyphs sit a little low in their box, so the box is lifted a row)
  const line = (text: string, y: number, color: string, weight: "800" | "400", size: number) => (
    <Text allowFontScaling={false} numberOfLines={1} position="absolute" top={(y - 7 - y0) * s} height={12 * s} left={(k.cx - 80 - x0) * s} width={160 * s}
          textAlign="center" fontFamily="$mono" fontSize={size * s} lineHeight={12 * s} letterSpacing={0.5 * s} fontWeight={weight} color={color}>{text}</Text>
  );
  return <>{line(title, k.title, k.ink, "800", 9)}{subtitle ? line(subtitle.toUpperCase(), k.sub, k.faint, "400", 8) : null}</>;
}
export function BookCover({ book, title, subtitle }: { book: TornCover; title: string; subtitle?: string }) {
  const [w, setW] = useState(0);
  const s = Math.min(2, w / 240);
  return (
    // clipped, so a cover drawn for a wider screen never holds its box open when the width changes (an iPad turned)
    <YStack width="100%" alignItems="center" overflow="hidden" onLayout={(ev) => setW(ev.nativeEvent.layout.width)}>
      {w ? (
        <YStack width={240 * s} height={160 * s} position="relative" borderRadius={2} overflow="hidden">
          <Art path={`/art/${book}/cover.png`} size={240 * s} height={160 * s} />
          <Lettering book={book} s={s} title={title} subtitle={subtitle} />
        </YStack>
      ) : null}
    </YStack>
  );
}

// where each book lies on its cover (the scene around it is the shelf it rests on), measured on the export 2026-11-06 --
// for the LIBRARY's shelf and the mending, which show the book alone, as THE SUBTLE LAYER's shelf does
export const ON_COVER: Record<TornCover, { x0: number; y0: number; x1: number; y1: number }> = {
  hermetic: { x0: 50, y0: 4, x1: 188, y1: 152 },
  eudaimon: { x0: 50, y0: 4, x1: 193, y1: 154 },
  unity: { x0: 6, y0: 4, x1: 191, y1: 154 },
};
export const coverCropSize = (book: TornCover, k: number) => {
  const r = ON_COVER[book];
  return { w: Math.round((r.x1 - r.x0 + 1) * k), h: Math.round((r.y1 - r.y0 + 1) * k) };
};
export function CoverCrop({ book, k, title, subtitle }: { book: TornCover; k: number; title?: string; subtitle?: string }) {
  const r = ON_COVER[book], { w, h } = coverCropSize(book, k);
  return (
    <YStack width={w} height={h} overflow="hidden" position="relative">
      <YStack marginLeft={-r.x0 * k} marginTop={-r.y0 * k}><Art path={`/art/${book}/cover.png`} size={240 * k} height={160 * k} /></YStack>
      {title ? <Lettering book={book} s={k} title={title} subtitle={subtitle} x0={r.x0} y0={r.y0} /> : null}
    </YStack>
  );
}
