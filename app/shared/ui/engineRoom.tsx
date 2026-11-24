// C-330: THE ENGINE ROOM -- the hub's admin moved out of the app into one web app the hub serves at /admin/ (the user,
// 2026-11-11: hub-wide controls out, each old place a link to it; each player's own things stay here). Every word DRAFT.
// The user, 2026-11-14: "make it so engine room will work over tailscale even if I am not in my home network" -- on the
// phone it opens inside the app, at the hub's home address when that answers, else at its name on the tailnet (GET
// /api/hub's `tailnet`, kept for when the hub is out of reach); the page is handed this phone's own paired key before
// it loads, so it never asks to be paired at the hub's button. Never through the relay: the hub refuses it there.
import { useState } from "react";
import { Linking, Modal, Platform } from "react-native";
import { WebView } from "react-native-webview";
import { Text, XStack, YStack } from "tamagui";
import { ALONE, KEPT, SERVER, TOKEN, api, isAway } from "../../platform/net";
import { Action, Small } from "./ui";

// the page in THE ENGINE ROOM, on the hub this app talks to: hub, mind, house, voices, devices, exchange, commons, saves
export const engineRoomUrl = (page: string, base = SERVER) => `${base.replace(/\/+$/, "")}/admin/#${page}`;

// whether THE ENGINE ROOM answers at an address, in a moment
function answers(base: string, ms = 2500): Promise<boolean> {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  return fetch(`${base.replace(/\/+$/, "")}/admin/`, { method: "HEAD", signal: c.signal }).then((r) => r.ok).catch(() => false).finally(() => clearTimeout(t));
}
// home first while at home; the tailnet when away, or when home does not answer
async function engineRoomBase(): Promise<string | null> {
  const home = SERVER.replace(/\/+$/, "");
  if (!isAway() && await answers(home)) return home;
  let tail: string | null = null;
  try { tail = (await api<{ tailnet?: string | null }>("/api/hub")).tailnet ?? null; }
  catch { tail = (KEPT.paths["/api/hub"] as { tailnet?: string | null } | undefined)?.tailnet ?? null; }
  if (tail && await answers(tail)) return tail;
  if (isAway() && await answers(home)) return home;
  return null;
}

export function EngineRoom({ page, what, ink }: { page: string; what: string; ink: string }) {
  const [open, setOpen] = useState<string | null>(null), [why, setWhy] = useState("");
  if (ALONE) return <Small color="$color10">{`${what} THE ENGINE ROOM is the hub's, and this phone is on its own.`}</Small>;
  const go = async () => {
    if (Platform.OS === "web") { Linking.openURL(engineRoomUrl(page)).catch(() => {}); return; }
    setWhy("");
    const base = await engineRoomBase();
    if (base) setOpen(engineRoomUrl(page, base));
    else setWhy("The hub did not answer at home or on the tailnet. Away from home, turn on Tailscale on this phone.");   // DRAFT
  };
  const hand = `try { localStorage.setItem("engine-room.key", ${JSON.stringify(TOKEN ?? "")}); } catch (e) {} true;`;
  return (
    <YStack gap={4} marginTop={6}>
      <Small color="$color10">{`${what} It is kept in THE ENGINE ROOM, the hub's admin, at home and on the tailnet.`}</Small>
      <Action label="Open THE ENGINE ROOM ›" ink={ink} onPress={go} />
      {why ? <Small color="$color8">{why}</Small> : null}
      {open ? (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(null)}>
          <YStack flex={1} backgroundColor="#0f1115">
            <XStack paddingHorizontal={14} paddingVertical={10} justifyContent="space-between" alignItems="center">
              <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="#8b90a0">{open.replace(/\/admin\/.*$/, "")}</Text>
              <Text role="button" aria-label="close THE ENGINE ROOM" fontFamily="$mono" fontSize={12} letterSpacing={1} color="#c9ccd3"
                    onPress={() => setOpen(null)}>DONE</Text>
            </XStack>
            <WebView source={{ uri: open }} injectedJavaScriptBeforeContentLoaded={hand} originWhitelist={["*"]}
                     style={{ flex: 1, backgroundColor: "#0f1115" }} />
          </YStack>
        </Modal>
      ) : null}
    </YStack>
  );
}
