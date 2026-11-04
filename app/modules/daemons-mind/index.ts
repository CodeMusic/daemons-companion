// C-280: this phone's own mind (DaemonsMindModule.swift). Null where the app was built without it (the site, an older
// build, Android).
import { requireOptionalNativeModule } from "expo-modules-core";

type Mind = {
  available(): Promise<{ mind: boolean; why?: string }>;
  think(system: string, history: { said: string; answer: string }[], said: string): Promise<string>;
  hear(uri: string): Promise<string>;
  say(text: string): void;
};
export default requireOptionalNativeModule<Mind>("DaemonsMind");
