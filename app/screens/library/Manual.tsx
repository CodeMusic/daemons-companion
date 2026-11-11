// LIBRARY > THE PLAYER'S MANUAL (C-233, the user, 2026-10-28: "In the iOS app and in the iPad in the library section, we
// should feature the user Manuel so you can bring up the PDF and read it from the app"): DAEMONS' own manual, fetched from
// DAEMONS as published now (app/state/manual.ts) and read here -- on the iPhone and iPad in the app's own page, scrolled and
// pinched as any PDF is, with SHARE to keep it in Books or Files; on the site, in the page. DRAFT. Its companion book,
// PLAYING TOGETHER (2026-10-31), is read the same way.
import * as Sharing from "expo-sharing";
import { createElement, useEffect, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { WebView } from "react-native-webview";
import { XStack, YStack } from "tamagui";
import { freshManual, keptManual, manualDir, type Manual, type Which } from "../../state/manual";
import { ON_PHONE } from "../../platform/net";
import { Action, Card, Eyebrow, Small } from "../../ui/ui";

// what the shelf says of it: the release it was made for, once one is kept
// Each book's words
const BOOK: Record<Which, { title: string; about: string; says: string }> = {
  player: { title: "THE PLAYER'S MANUAL", about: "Every way to play DAEMONS, and how it all works.", says: "How to play DAEMONS, every way there is" },   // DRAFT
  quick:  { title: "QUICK START", about: "What DAEMONS is, and how to play it, step by step.", says: "DAEMONS, quickly: what it is, and how to play it" },   // DRAFT
  social: { title: "PLAYING TOGETHER", about: "Trading, loans and gifts, OUT TOGETHER, friends, dreams and THE COMMONS.",                         // DRAFT
            says: "DAEMONS with other players: trading, loans, gifts, meetings and friends' homes" },                                               // DRAFT
  tiiny:  { title: "A BIGGER MIND", about: "Setting up a Tiiny Pocket for the companion: the computer, the network and the hub.",                  // DRAFT
            says: "Setting up the Tiiny Pocket for the DAEMONS companion" },                                                                        // DRAFT
  micro:  { title: "MICRO-START", about: "DAEMONS in five pages.", says: "DAEMONS in five pages" },                                          // DRAFT (C-264)
  word:   { title: "THE OLD WORD", about: "How the Greek daimon branched, and why it is said DAY-mons.",                                       // DRAFT (C-274)
            says: "How daimon branched, and why it is said DAY-mons" },                                                                     // DRAFT (C-274)
  textbook: { title: "PRINCIPLES OF MIND", about: "CALLOW SCHOOL's TEXTBOOK in full: the seven floors, taught.",                  // DRAFT (C-276)
              says: "CALLOW SCHOOL's TEXTBOOK in full, the seven floors taught as a university textbook" },                     // DRAFT (C-276)
  companion: { title: "THE COMPANION", about: "Everything the companion does: your daemon AWAY, the days, the house's mind, the devices.",   // DRAFT (C-321)
               says: "The DAEMONS companion: the app, the site, the hub and the devices" },                                       // DRAFT (C-321)
};
export const manualAbout = (w: Which = "player") => {
  const r = keptManual(w)?.release;
  return `${BOOK[w].about}${r ? ` For v${r}.` : ""}`;   // DRAFT
};

// C-264: a book read in whatever room it is given -- HOW TO PLAY's reader over the game panel -- fetched and kept as the
// shelf's are; the page fills it and follows its size
export function BookPdf({ which }: { which: Which }) {
  const [m, setM] = useState<Manual | null>(() => keptManual(which));
  const [error, setError] = useState("");
  useEffect(() => {
    setM(keptManual(which)); setError("");
    freshManual(which).then((f) => { setM(f); setError(""); }).catch((e) => setError((e as Error).message));
  }, [which]);
  if (!m) return <YStack flex={1} alignItems="center" justifyContent="center" padding={20}>
    <Small color={error ? "#f2a2a2" : "#c9ccd3"}>{error || "Fetching it from DAEMONS…"}</Small></YStack>;   // DRAFT
  return Platform.OS === "web"
    ? createElement("iframe", { src: m.uri, title: BOOK[which].title, style: { flex: 1, width: "100%", height: "100%", border: 0, background: "#525659" } })
    : <WebView key={m.etag ?? m.at} source={{ uri: m.uri }} originWhitelist={["*"]} allowingReadAccessToURL={manualDir().uri}
               allowFileAccess style={{ flex: 1, backgroundColor: "#525659" }} />;
}

export function ManualBook({ which = "player" }: { which?: Which }) {
  const B = BOOK[which];
  const { height } = useWindowDimensions();
  const [m, setM] = useState<Manual | null>(() => keptManual(which));
  const [error, setError] = useState("");
  const [newer, setNewer] = useState(false);
  useEffect(() => {
    const had = keptManual(which);
    freshManual(which).then((f) => { setM(f); setError(""); setNewer(!!had && f.etag !== had.etag); })
      .catch((e) => setError((e as Error).message));
  }, [which]);
  const share = () => Sharing.shareAsync(m!.uri, { UTI: "com.adobe.pdf", mimeType: "application/pdf", dialogTitle: B.title });
  const tab = () => { window.open(m!.uri, "_blank"); };
  const viewer = Platform.OS === "ios" || Platform.OS === "web";   // Android's WebView draws no PDF: SHARE opens it there
  return (
    <YStack gap={14}>
      <Card>
        <Eyebrow>{B.title}</Eyebrow>
        {!m && !error ? <Small>Fetching the manual from DAEMONS…</Small> : null}{/* DRAFT */}
        {m ? <Small>{`${B.says}${m.release ? `, for v${m.release}` : ""}.`                // DRAFT
          + (newer ? " A newer one came down." : ON_PHONE ? " Kept on this device; a newer one comes down when it is out." : "")}</Small> : null}
        {error ? <Small color="$color9">{m ? `${error} This is the one kept here.` : error}</Small> : null}
        {m ? (
          <XStack gap={8}>
            {Platform.OS === "web" ? <Action label="Open in a tab" onPress={tab} /> : <Action label="Share" onPress={share} />}
          </XStack>
        ) : null}
      </Card>
      {m && viewer ? (
        <YStack height={Math.max(440, height - 210)} borderWidth={1} borderColor="$color6" borderRadius={4} overflow="hidden"
                backgroundColor="#525659">
          {Platform.OS === "web"
            ? createElement("iframe", { src: m.uri, title: B.title, style: { width: "100%", height: "100%", border: 0 } })
            : <WebView key={m.etag ?? m.at} source={{ uri: m.uri }} originWhitelist={["*"]} allowingReadAccessToURL={manualDir().uri}
                       allowFileAccess style={{ flex: 1, backgroundColor: "#525659" }} />}
        </YStack>
      ) : null}
    </YStack>
  );
}
