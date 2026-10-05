// C-15: the phone's meeting beacon -- iOS lets an app advertise only service UUIDs, so the beacon IS one (see
// app/beacon.ts and firmware/esp32/src/meet.cpp for its form). Scanning needs no native code: react-native-ble-plx does it.
import { requireNativeModule } from "expo-modules-core";

type Beacon = { start(uuid: string): void; stop(): void };
export default requireNativeModule<Beacon>("DaemonsBeacon");
