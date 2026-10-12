// C-111 (the user, 2026-10-11: "the phone and game ... self-contained so u dont need buy anything"; the save: "Delta on
// the same phone, share the save through Files"): the phone hosting on its own. No computer: the companion's own rules
// (server/src/core.ts and routes.ts -- the same code the server runs) over the phone's own SQLite, and a COPY of the
// save Delta shared through Files, kept in the app's documents. SYNC writes that copy (the one before it kept beside
// it), and the phone hands it back to Delta through the share sheet. Delta's own save is never touched.
import * as SQLite from "expo-sqlite";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { Asset } from "expo-asset";
import { Directory, File, Paths } from "expo-file-system";
import speciesJson from "../server/data/species.json";
import { Store, type Db } from "../server/src/store";
import { handles, route, type Reply } from "../server/src/routes";
import { awayNow, deviceSettings, deviceState, type Edition, type Host, type SaveFile } from "../server/src/core";
import { assign, carryView } from "../server/src/carry";
import { kindOf, validDeviceId } from "../server/src/deviceid";
import { repaint, streakColours } from "../server/src/paint";
import { EXPRESSIONS, SHADED, shadePalette, type Expression } from "../server/src/expressions";
import { readSave } from "../server/src/save/reader";
import { SPECIES_ART } from "./speciesArt";

const SPECIES = speciesJson as unknown as Record<string, any>;

// The Store over expo-sqlite's synchronous calls -- the same SQL the server runs over Node's SQLite
function phoneDb(): Db {
  const d = SQLite.openDatabaseSync("companion.db");
  const args = (a: unknown[]) => a as SQLite.SQLiteBindValue[];
  return {
    exec: (sql) => d.execSync(sql),
    prepare: (sql) => ({
      get: (...a) => d.getFirstSync(sql, args(a)) ?? undefined,
      all: (...a) => d.getAllSync(sql, args(a)),
      run: (...a) => { const r = d.runSync(sql, args(a)); return { lastInsertRowid: r.lastInsertRowId, changes: r.changes }; },
    }),
  };
}
let STORE: Store | null = null;
const store = () => (STORE ??= new Store(phoneDb()));

// The save: a copy, in the app's documents. Writing keeps the one before it in save-backups/ first.
const saveFile = () => new File(Paths.document, "daemons.sav");
function put(f: File, bytes: Uint8Array) { if (!f.exists) f.create(); f.write(bytes); }
const phoneSave: SaveFile = {
  read: () => { const f = saveFile(); return f.exists ? f.bytesSync() : null; },
  write: (bytes, now) => {
    const f = saveFile();
    let backup: string | null = null;
    if (f.exists) {
      const dir = new Directory(Paths.document, "save-backups");
      if (!dir.exists) dir.create();
      backup = `daemons.sav.${now.toISOString().replace(/[:.]/g, "-")}`;
      put(new File(dir, backup), f.bytesSync());
    }
    put(f, bytes);
    return backup;
  },
};

export const hasSave = () => saveFile().exists;
export function edition(): Edition { return store().getSetting("phone.edition") === "CONTEXT" ? "CONTEXT" : "CONTENT"; }
export function setEdition(e: Edition) { store().setSetting("phone.edition", e); }
const host = (): Host => ({ edition: edition(), save: phoneSave });

// From Files -- Delta's EXPORT SAVE FILE, saved there or shared straight to this app. Only a DAEMONS save is kept.
export async function importSave(): Promise<string | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.length) return null;
  const bytes = new File(r.assets[0].uri).bytesSync();
  try { readSave(bytes); } catch { throw new Error("That file is not a DAEMONS save. In Delta, choose the game, then Export Save File."); }
  phoneSave.write(bytes, new Date());
  return r.assets[0].name;
}

// Back to Delta: the share sheet, with a copy named for it. In Delta, the game's Import Save File takes it.
export async function shareSave() {
  const f = saveFile();
  if (!f.exists) throw new Error("There is no save on this phone yet.");
  const out = new File(Paths.cache, "DAEMONS.sav");
  if (out.exists) out.delete();
  put(out, f.bytesSync());
  await Sharing.shareAsync(out.uri, { UTI: "public.data", mimeType: "application/octet-stream", dialogTitle: "Give the save back to Delta" });
}

// The devices on a phone alone: its home-screen widget (C-100). The app says which id it has.
let DEVICES: { id: string; since: string }[] = [];
export function hereAre(ids: string[]) {
  const now = new Date().toISOString();
  DEVICES = ids.filter(validDeviceId).map((id) => DEVICES.find((d) => d.id === id) ?? { id, since: now });
}
function devicesView() {
  const away = awayNow(host()), { byDevice, unplaced } = carryView(store(), away);
  const brief = (d: (typeof away)[number]) => ({ personality: d.personality, slot: d.slot, species: d.species,
    nickname: d.nickname, name: d.name, level: d.level, art: `/art/party/${d.slot}.png` });
  const now = new Date().toISOString();
  return { devices: DEVICES.map((d) => ({ id: d.id, kind: kindOf(d.id), via: "phone" as const, firstSeen: d.since, lastSeen: now,
                                          here: true, firmware: null, battery: null, daemon: byDevice[d.id] ? brief(byDevice[d.id]) : null })),
           away: away.map(brief), unplaced: unplaced.map(brief) };
}
// The DEVICE tab's link, when there is no handheld to link: nothing linked, and the devices there are
const NO_LINK = { linked: false, via: null, lastSeen: null, firmware: "", routines: [], pending: [], results: [],
                  remotes: { active: 0, remotes: [] }, networks: [], currentNetwork: "", shared: [], battery: null,
                  lan: { address: null, port: 0, open: false } };

// A daemon's picture, painted as the server paints it (paint.ts): its own streaks for a daemon in the save, the body's
// mid tone for a species in the INDEX.
async function speciesPng(species: string, moves: number[] | null, e: Expression | null = null): Promise<string | null> {
  const row = SPECIES[species];
  const name = row?.art?.front?.split("/").pop()?.replace("_front.png", "");
  const mod = name && SPECIES_ART[name];
  if (!mod) return null;
  const asset = await Asset.fromModule(mod).downloadAsync();
  if (!asset.localUri) return null;
  let png: Uint8Array = new File(asset.localUri).bytesSync();
  if (row.streaks) png = repaint(png, (pal) => streakColours(pal, row.bodyType, moves ?? [0, 0, 0, 0]));
  if (e) png = repaint(png, (pal) => shadePalette(pal, e), SHADED.first);         // C-119: in its expression's shade
  return base64(png);
}
function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const ok = (body: unknown, status = 200): Reply => ({ status, body });
const no = (status: number, error: string): Reply => ({ status, body: { error } });

// Every request the app makes, answered on the phone. What only a computer does (a handheld's cable, pairing, the
// relay, a voice) is answered "not on a phone alone", and the screens that ask for it say so or step aside.
export async function localApi(pathAndQuery: string, body?: any): Promise<Reply> {
  const [path, q] = pathAndQuery.split("?");
  const query = new URLSearchParams(q ?? "");
  const method = body === undefined ? "GET" : "POST";
  const deviceId = query.get("device") ?? "";
  const s = store(), h = host();
  if (handles(method, path)) return route(h, s, { method, path, body: body ?? {}, deviceId });
  if (method === "GET") {
    if (path === "/api/devices") return ok(devicesView());
    if (path === "/api/device/link") return ok({ ...NO_LINK, ...devicesView() });
    if (path === "/api/device/state") return ok(deviceState(h, s, new Date(), deviceId, null));
    if (path === "/api/device/settings") return ok(deviceSettings(s));
    if (path === "/api/version") return ok({ server: null, appChanged: null });
    if (path === "/api/settings/away") return ok({ url: null });
    if (path === "/api/settings")
      return ok({ savePath: hasSave() ? "On this phone" : null, dir: null, exists: hasSave(), valid: hasSave(), source: "phone", canPick: false });
    if (path === "/api/art") {
      if (query.has("party")) {
        const bytes = phoneSave.read();
        const slot = Number(query.get("party"));
        const d = bytes ? [...readSave(bytes).party, ...awayNow(h)].find((p) => p.slot === slot) : null;
        const png = d ? await speciesPng(String(d.species), d.moves, EXPRESSIONS[query.get("expression") ?? ""] ?? null) : null;
        return png ? ok({ png }) : no(404, "no art for that slot");
      }
      if (query.has("species")) {
        const png = await speciesPng(String(query.get("species")), null);
        return png ? ok({ png }) : no(404, "no art for that species");
      }
    }
  }
  if (method === "POST" && path === "/api/devices/carry") {
    const p = body?.personality === null ? null : Number(body?.personality);
    if (!validDeviceId(body?.id) || (p !== null && !awayNow(h).some((d) => d.personality === p)))
      return no(400, "carry {id, personality}: a device to host it, and a daemon that is away (SEND it in the game, then SYNC)");
    assign(s, body.id, p);
    return ok(devicesView());
  }
  return no(404, "A phone hosting on its own does not do that -- it needs the companion on a computer.");
}
