// C-100: the daemon on the home screen (targets/widget). The widget is a device of its own, `iphone-widget-xxxxxx`: the
// first time it asks the companion it appears under YOUR DEVICES, and the companion gives it a daemon that is away and
// carried by nothing else (C-80) -- choose another there. The app hands it what it needs to reach the companion on its
// own -- the address, the key, the way from away -- through the App Group, and sends what it kept while out of reach.
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { ExtensionStorage } from "@bacons/apple-targets";

const ON_IOS = Platform.OS === "ios";
const shared = new ExtensionStorage("group.com.codemusic.daemonscompanion");
const KEEP = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export async function widgetId(): Promise<string> {
  let id = await SecureStore.getItemAsync("widget-id");
  if (!id) {
    id = `iphone-widget-${Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, "0")}`;
    await SecureStore.setItemAsync("widget-id", id, KEEP);
  }
  return id;
}

// Called whenever the app learns (or loses) its way to the companion; null drops it, and the widget asks to pair.
export async function shareWithWidget(c: { server: string; token: string; away: string | null } | null) {
  if (!ON_IOS) return;
  shared.set("alone", undefined); shared.set("aloneSnapshot", undefined);   // C-111: a companion again, not the phone alone
  shared.set("server", c?.server); shared.set("token", c?.token); shared.set("away", c?.away ?? undefined);
  shared.set("device", c ? await widgetId() : undefined);
  if (!c) shared.set("snapshot", undefined);
  ExtensionStorage.reloadWidget();
}

// Draw it again -- after the daemon it carries was changed, or when the app comes back to the front.
export function redrawWidget() { if (ON_IOS) ExtensionStorage.reloadWidget(); }

// C-87: buttons pressed on the home screen while the companion was out of reach, sent in order once it answers.
export async function sendWidgetKept(api: <T>(path: string, body?: unknown) => Promise<T>) {
  if (!ON_IOS) return;
  let kept: { path: string }[] = [];
  try { kept = JSON.parse(shared.get("queue") ?? "[]"); } catch { return; }
  if (!kept.length) return;
  shared.remove("queue");
  for (const k of kept) if (/^\/api\/daemon\/(feed|water|train|sleep)$/.test(k.path)) await api(k.path, {}).catch(() => {});
  ExtensionStorage.reloadWidget();
}

// C-122: a care pressed in the app while the companion was out of reach joins the widget's kept presses, so it is sent
// with them (sendWidgetKept) the next time the companion answers -- the same queue, in the shape Shared.keep writes.
export function keepForLater(care: "feed" | "water" | "train" | "sleep") {
  if (!ON_IOS) return;
  let q: { path: string; at: string }[] = [];
  try { q = JSON.parse(shared.get("queue") ?? "[]"); } catch { q = []; }
  q.push({ path: `/api/daemon/${care}`, at: new Date().toISOString() });
  shared.set("queue", JSON.stringify(q));
}

// C-111: the phone hosting on its own. The widget cannot run the companion's rules, so the app draws it: the daemon the
// widget hosts, its day and its picture, kept in the App Group as one snapshot. Its buttons are kept there too (C-87's
// queue), counted on top of the snapshot until the app next opens and tends the daemon with them (sendWidgetKept).
type Reply = { status: number; body: any };
export async function hostAlone(on: boolean) {
  if (!ON_IOS) return;
  shared.set("server", undefined); shared.set("token", undefined); shared.set("away", undefined); shared.set("snapshot", undefined);
  shared.set("alone", on ? "1" : undefined); shared.set("aloneSnapshot", undefined);
  shared.set("device", on ? await widgetId() : undefined);
  ExtensionStorage.reloadWidget();
}
const SINCE_2001 = 978307200;   // Swift's Date counts seconds from 2001
export async function drawAlone(local: (path: string) => Promise<Reply>) {
  if (!ON_IOS) return;
  const id = await widgetId();
  const st = await local(`/api/device/state?device=${id}`);
  const d = st.status === 200 ? st.body.daemon : null;
  const look = d?.expression?.name ?? "awake";                       // C-119: its picture in its expression's shade
  const art = d ? await local(`/api/art?party=${d.slot}${look === "awake" ? "" : `&expression=${look}`}`) : null;
  const snap = d ? { carries: true, name: d.nickname || d.name, level: d.level, word: d.life.word, fed: d.life.fed.today,
                     watered: d.life.watered.today, trained: d.life.trained, tired: d.life.tired, cue: d.life.cue ?? undefined,
                     png: art?.status === 200 ? art.body.png : undefined, artKey: `${d.artKey}/${look}`, den: d.den,   // C-113: its den
                     expr: d.expression }                                                       // C-119: its expression
                 : { carries: false, name: "", level: 0, word: "", fed: 0, watered: 0, trained: false, tired: "awake" };
  shared.set("aloneSnapshot", JSON.stringify({ ...snap, at: Date.now() / 1000 - SINCE_2001 }));
  ExtensionStorage.reloadWidget();
}
