// C-358 (the user, 2026-11-14: "All created sleep sounds should be stored and served from the hub, but also downloaded to
// your phone"): MINE -- the creations this device keeps (server/src/creations.ts says what a creation is). Each one's files
// and its row live in the phone's documents, creations/<kind>/<id>/, so a night needs no network; downloaded from the
// hub's HOUSEHOLD or through it from the COMMUNITY. On the site there are no files of its own: MINE is the list of what
// was downloaded (kept in the browser), played from the hub. Every word DRAFT.
import { Platform } from "react-native";
import type { Creation } from "../../server/src/creations";
import { ON_PHONE, SERVER, TOKEN } from "./net";

export type { Creation };
export type Kept = Creation & { where: "household" | "community"; keptAt: string; local: Record<string, string> };

// which of a creation's files a device keeps: what it plays and shows
const WANTED: Record<Creation["kind"], string[]> = { sleep: ["phone.m4a"], painting: ["painting.png"] };
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 60);
const hubUrl = (path: string) => /^https?:/.test(path) ? path : `${SERVER.replace(/\/+$/, "")}${path}`;
const headers = (): Record<string, string> => (TOKEN ? { authorization: `Bearer ${TOKEN}` } : {});

// --- on the phone: files under documents/creations; on the site: a list in the browser ---
const fs = () => require("expo-file-system") as typeof import("expo-file-system");
const root = () => { const { Directory, Paths } = fs(); const d = new Directory(Paths.document, "creations"); if (!d.exists) d.create({ intermediates: true, idempotent: true }); return d; };
const folderOf = (c: Pick<Creation, "kind" | "uid">) => { const { Directory } = fs(); const d = new Directory(root(), c.kind, safe(c.uid)); return d; };
const WEB_KEY = "daemons.creations";
const webList = (): Kept[] => { try { return JSON.parse(globalThis.localStorage?.getItem(WEB_KEY) ?? "[]"); } catch { return []; } };
const webSave = (l: Kept[]) => { try { globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(l)); } catch { /* private window */ } };

const heard = new Set<() => void>();
export const onMine = (f: () => void) => { heard.add(f); return () => { heard.delete(f); }; };
const changed = () => heard.forEach((f) => f());

// everything this device keeps, newest first
export function mine(kind?: Creation["kind"] | null): Kept[] {
  let all: Kept[] = [];
  if (!ON_PHONE || Platform.OS === "web") all = webList();
  else {
    const { Directory, File } = fs();
    for (const k of root().list()) {
      if (!(k instanceof Directory)) continue;
      for (const d of k.list()) {
        if (!(d instanceof Directory)) continue;
        try { const row = new File(d, "row.json"); if (row.exists) all.push(JSON.parse(row.textSync())); } catch { /* half-kept: skipped */ }
      }
    }
  }
  return all.filter((c) => !kind || c.kind === kind).sort((a, b) => b.made.localeCompare(a.made));
}
export const mineSet = (kind?: Creation["kind"] | null) => new Set(mine(kind).map((c) => c.uid));

// a creation brought to this device: its files and its cover fetched (through the hub), its row written last
export async function keep(c: Creation, where: Kept["where"]): Promise<Kept> {
  const names = [...WANTED[c.kind].filter((n) => c.files[n]), ...(c.cover ? ["cover"] : [])];
  if (!ON_PHONE) {
    const k: Kept = { ...c, where, keptAt: new Date().toISOString(),
                      local: Object.fromEntries(names.map((n) => [n, hubUrl(n === "cover" ? c.cover! : c.files[n])])) };
    webSave([k, ...webList().filter((x) => x.uid !== c.uid)]);
    changed();
    return k;
  }
  const { File } = fs();
  const d = folderOf(c);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  const local: Record<string, string> = {};
  for (const n of names) {
    const from = n === "cover" ? c.cover! : c.files[n];
    const f = new File(d, n === "cover" ? `cover${from.endsWith(".jpg") ? ".jpg" : ".png"}` : n);
    if (!(f.exists && (f.size ?? 0) > 0)) {
      if (f.exists) f.delete();
      const got = await File.downloadFileAsync(hubUrl(from), f, { headers: headers() });
      if (!got.exists || !(got.size ?? 0)) throw new Error("It did not come from the hub.");   // DRAFT
    }
    local[n] = f.uri;
  }
  const k: Kept = { ...c, where, keptAt: new Date().toISOString(), local };
  const row = new File(d, "row.json");
  if (!row.exists) row.create();
  row.write(JSON.stringify(k));
  changed();
  return k;
}

// a kept creation let go from this device (the hub and the community keep theirs)
export function letGo(uid: string) {
  const c = mine().find((x) => x.uid === uid);
  if (!c) return;
  if (!ON_PHONE) webSave(webList().filter((x) => x.uid !== uid));
  else { const d = folderOf(c); if (d.exists) d.delete(); }
  changed();
}

// C-334's pieces kept before C-358 (documents/sleep/<id>.m4a, no row): taken into MINE once the hub says what each was
export async function adoptOld(household: Creation[]) {
  if (!ON_PHONE) return;
  const { Directory, File, Paths } = fs();
  const old = new Directory(Paths.document, "sleep");
  if (!old.exists) return;
  const have = mineSet("sleep");
  for (const c of household.filter((x) => x.kind === "sleep" && x.state === "ready" && !have.has(x.uid))) {
    const f = new File(old, `${c.id}.m4a`);
    if (!f.exists || !(f.size ?? 0)) continue;
    const d = folderOf(c);
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
    try { f.move(new File(d, "phone.m4a")); await keep(c, "household"); } catch { /* next time */ }
  }
}

// a file a creation offers (an export), fetched to the cache and handed to the share sheet; on the site, a download
export async function exportFile(path: string, name: string): Promise<void> {
  // the hub makes an export once, slowly: until it has, it says so (202) and the press says so too
  const ready = path.replace(/\/[^/]+$/, "/exports");
  const made = await fetch(hubUrl(ready), { headers: headers() }).then((r) => r.json()).catch(() => null) as { made?: Record<string, boolean> } | null;
  const file = path.split("/").pop() ?? "";
  if (made?.made && made.made[file] === false) throw new Error("Being made on the hub: it takes a few minutes. Try again soon.");   // DRAFT
  if (!ON_PHONE) { globalThis.open?.(hubUrl(path), "_blank"); return; }
  const { File, Paths } = fs();
  const f = new File(Paths.cache, safe(name));
  if (f.exists) f.delete();
  const got = await File.downloadFileAsync(hubUrl(path), f, { headers: headers() });
  if (!got.exists || !(got.size ?? 0)) throw new Error("The hub did not make it.");   // DRAFT
  const Sharing = require("expo-sharing") as typeof import("expo-sharing");
  await Sharing.shareAsync(got.uri, { dialogTitle: name });
}

export const coverUri = (c: Creation | Kept) => ("local" in c && c.local.cover) || (c.cover ? hubUrl(c.cover) : null);
