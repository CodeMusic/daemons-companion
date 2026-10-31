// C-263: a game controller held on the device, read by the app (GameController) for the game -- the web view's own
// Gamepad API does not hear it. Null where the app was built without it (the site, an older build).
import { requireOptionalNativeModule } from "expo-modules-core";

type Sub = { remove(): void };
type Pad = {
  held(): string[];
  tryVirtual?(on: boolean): void;   // a debug build only: GameController's own on-screen pad, as if one were held
  addListener(event: "onPad", f: (e: { held: string[] }) => void): Sub;
  addListener(event: "onButton", f: (e: { b: number; v: number }) => void): Sub;
};
export default requireOptionalNativeModule<Pad>("DaemonsPad");
