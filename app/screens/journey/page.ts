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
