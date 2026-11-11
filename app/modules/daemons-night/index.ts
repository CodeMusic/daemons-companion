// C-284: the phone's own night -- how many times it was picked up while the daemon slept, read from iOS's motion record
// at WAKE (nothing runs overnight). Null where the app was built without it (the site, Android, Expo Go).
import { requireOptionalNativeModule } from "expo-modules-core";

type Night = {
  // the times the phone went from still to moving between two moments (seconds since 1970); null: no motion record, or
  // the Motion permission refused
  stirs(from: number, to: number): Promise<number | null>;
  // C-334: whether the sound goes to headphones now (wired, Bluetooth or USB) -- DRIFT DOWN's binaural layer needs them.
  // Missing in a build from before C-334: the app then asks the listener instead.
  headphones?(): boolean;
};
export default requireOptionalNativeModule<Night>("DaemonsNight");
