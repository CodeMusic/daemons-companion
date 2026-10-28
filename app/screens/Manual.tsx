// LIBRARY > THE PLAYER'S MANUAL (C-233, the user, 2026-10-28: "In the iOS app and in the iPad in the library section, we
// should feature the user Manuel so you can bring up the PDF and read it from the app"): DAEMONS' own manual, fetched from
// DAEMONS as published now (app/manual.ts) and read here -- on the iPhone and iPad in the app's own page, scrolled and
// pinched as any PDF is, with SHARE to keep it in Books or Files; on the site, in the page. DRAFT.
import * as Sharing from "expo-sharing";
import { createElement, useEffect, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { WebView } from "react-native-webview";
import { XStack, YStack } from "tamagui";
import { freshManual, keptManual, manualDir, type Manual } from "../manual";
import { ON_PHONE } from "../net";
import { Action, Card, Eyebrow, Small } from "../ui";

// what the shelf says of it: the release it was made for, once one is kept
export const manualAbout = () => {
  const r = keptManual()?.release;
  return `Every way to play DAEMONS, and how it all works.${r ? ` For v${r}.` : ""}`;   // DRAFT
};

export function ManualBook() {
  const { height } = useWindowDimensions();
  const [m, setM] = useState<Manual | null>(() => keptManual());
  const [error, setError] = useState("");
  const [newer, setNewer] = useState(false);
  useEffect(() => {
    const had = keptManual();
    freshManual().then((f) => { setM(f); setError(""); setNewer(!!had && f.etag !== had.etag); })
      .catch((e) => setError((e as Error).message));
  }, []);
  const share = () => Sharing.shareAsync(m!.uri, { UTI: "com.adobe.pdf", mimeType: "application/pdf", dialogTitle: "THE PLAYER'S MANUAL" });
  const tab = () => { window.open(m!.uri, "_blank"); };
  const viewer = Platform.OS === "ios" || Platform.OS === "web";   // Android's WebView draws no PDF: SHARE opens it there
  return (
    <YStack gap={14}>
      <Card>
        <Eyebrow>THE PLAYER'S MANUAL</Eyebrow>
        {!m && !error ? <Small>Fetching the manual from DAEMONS…</Small> : null}{/* DRAFT */}
        {m ? <Small>{`How to play DAEMONS, every way there is${m.release ? `, for v${m.release}` : ""}.`                // DRAFT
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
            ? createElement("iframe", { src: m.uri, title: "THE PLAYER'S MANUAL", style: { width: "100%", height: "100%", border: 0 } })
            : <WebView key={m.etag ?? m.at} source={{ uri: m.uri }} originWhitelist={["*"]} allowingReadAccessToURL={manualDir().uri}
                       allowFileAccess style={{ flex: 1, backgroundColor: "#525659" }} />}
        </YStack>
      ) : null}
    </YStack>
  );
}
