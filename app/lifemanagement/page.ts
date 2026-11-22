// C-298: a JOURNAL chapter's summary as one printed page -- a US Letter PDF on the phone, iPad and Mac (expo-print, then
// the share sheet: Print, Save to Files, AirDrop), and the browser's own print dialog on the site (Save as PDF there).
// Its type is sized to the words, so it stays one page however long the thinker wrote.
import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { pageHtml, type Page } from "./pageHtml";
export { spanOf, type Page } from "./pageHtml";

const fileName = (p: Page) => `${p.journal} - chapter ${p.n}`.replace(/[\\/:*?"<>|]+/g, " ").trim();

// The page out of the app: a PDF to share on a device, the print dialog on the site
export async function exportPage(p: Page) {
  const html = pageHtml(p);
  if (Platform.OS === "web") return printWeb(html);
  const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });
  const named = uri.replace(/[^/]+\.pdf$/, `${encodeURIComponent(fileName(p))}.pdf`);
  let out = uri;
  try { const { File } = await import("expo-file-system"); const f = new File(uri); f.move(new File(decodeURIComponent(named))); out = f.uri; } catch { /* the plain name */ }
  await Sharing.shareAsync(out, { UTI: "com.adobe.pdf", mimeType: "application/pdf", dialogTitle: p.title });
}

// 2026-11-07 (the user: "the export option becomes generalized allowing u to tap it, and select either of the available
// rendering options -- PDF and if a voice has been made that option as well"): the chapter's kept voice, out of the app
// under the chapter's name -- the share sheet: Save to Files, AirDrop, Messages
export async function exportVoice(p: Page, voice: { uri: string }) {
  const { File, Paths } = await import("expo-file-system");
  const ext = /\.wav$/i.test(voice.uri) ? "wav" : "mp3";
  const named = new File(Paths.cache, `${fileName(p)}.${ext}`);
  if (named.exists) named.delete();
  new File(voice.uri).copy(named);
  await Sharing.shareAsync(named.uri, { mimeType: ext === "wav" ? "audio/wav" : "audio/mpeg", UTI: ext === "wav" ? "com.microsoft.waveform-audio" : "public.mp3",
                                        dialogTitle: p.title });
}

// What a chapter is said as: its title, then its words
export const spokenOf = (p: Pick<Page, "title" | "body">) => `${p.title}.\n\n${p.body}`;

// Straight to a printer (AirPrint on a device; the print dialog on the site)
export async function printPage(p: Page) {
  const html = pageHtml(p);
  if (Platform.OS === "web") return printWeb(html);
  await Print.printAsync({ html });
}

function printWeb(html: string) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f);
  const d = f.contentDocument!;
  d.open(); d.write(html); d.close();
  setTimeout(() => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 60_000); }, 250);
}
