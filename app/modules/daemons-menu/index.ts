// C-264: HOW TO PLAY from the menu bar's Help (the Mac, the iPad). Null where the app was built without it.
import { requireOptionalNativeModule } from "expo-modules-core";

type Menu = {
  addListener(event: "onHowToPlay", f: () => void): { remove(): void };
  tryHowToPlay?(): void;                                     // a debug build only: the command, as the menu bar sends it
};
export default requireOptionalNativeModule<Menu>("DaemonsMenu");
