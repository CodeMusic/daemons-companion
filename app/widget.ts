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

async function widgetId(): Promise<string> {
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
  for (const k of kept) if (/^\/api\/daemon\/(feed|water|train)$/.test(k.path)) await api(k.path, {}).catch(() => {});
  ExtensionStorage.reloadWidget();
}
