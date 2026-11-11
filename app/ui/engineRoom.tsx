// C-330: THE ENGINE ROOM -- the hub's admin moved out of the app into one web app the hub serves at /admin/ (the user,
// 2026-11-11: hub-wide controls out, each old place a link to it; each player's own things stay here). Every word DRAFT.
import { Linking } from "react-native";
import { YStack } from "tamagui";
import { ALONE, SERVER } from "../platform/net";
import { Action, Small } from "./ui";

// the page in THE ENGINE ROOM, on the hub this app talks to: hub, mind, house, voices, devices, exchange, commons
export const engineRoomUrl = (page: string) => `${SERVER.replace(/\/+$/, "")}/admin/#${page}`;

export function EngineRoom({ page, what, ink }: { page: string; what: string; ink: string }) {
  if (ALONE) return <Small color="$color10">{`${what} THE ENGINE ROOM is the hub's, and this phone is on its own.`}</Small>;
  return (
    <YStack gap={4} marginTop={6}>
      <Small color="$color10">{`${what} It is kept in THE ENGINE ROOM, the hub's admin, on the home network and the tailnet.`}</Small>
      <Action label="Open THE ENGINE ROOM ›" ink={ink} onPress={() => { Linking.openURL(engineRoomUrl(page)).catch(() => {}); }} />
    </YStack>
  );
}
