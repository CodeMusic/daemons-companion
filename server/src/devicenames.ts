// C-405: a device's name as the app says it (app/art/deviceSprites.tsx lookFor, app/screens/places/Places.tsx nameOf),
// for THE ENGINE ROOM, which named devices by their ids (t-watch-ultra-f351d4). From the same data/devices.json: its alias,
// then its own kind, then the longest kind its name begins with; then KIND_NAMES (kindnames.ts, the app's own table); a
// widget is its phone's (C-394). Node only (api.ts).
import { readFileSync } from "node:fs";
import { KIND_NAMES } from "./kindnames.js";

type Look = { maker: string; name: string };
const DATA = JSON.parse(readFileSync(new URL("../data/devices.json", import.meta.url), "utf8")) as
  { aliases: Record<string, string>; devices: Record<string, Look> };

export function lookFor(kind: string): Look | undefined {
  const k = DATA.aliases[kind] ?? kind;
  if (DATA.devices[k]) return DATA.devices[k];
  const best = Object.keys(DATA.devices).filter((d) => k.startsWith(d)).sort((a, b) => b.length - a.length)[0];
  return best ? DATA.devices[best] : undefined;
}
// a device's kind from its id: the id without its six-hex tail
export const kindOfId = (id: string) => id.replace(/-[0-9a-f]{6}$/, "");
export function deviceName(d: { id: string; kind?: string; owner?: string | null }): string {
  const kind = d.kind || kindOfId(d.id);
  if (kind === "iphone-widget") return d.owner ? `${d.owner}'s widget` : "A phone's widget";   // DRAFT
  if (kind.startsWith("site")) return "A site";                                                   // DRAFT
  return lookFor(kind)?.name ?? KIND_NAMES[kind] ?? kind;
}
