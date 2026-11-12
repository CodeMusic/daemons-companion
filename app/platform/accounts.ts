// C-226: ACCOUNTS from the app. The guardian's token and a kid's device's profile token are this device's own -- kept
// in the phone's keychain (the site's storage on the web), never on the hub, which only passes each request to THE
// COMMONS (server/src/accountslink.ts). Never kept offline either (net.ts NOT_KEPT): a sign-in is not replayed later.
import * as SecureStore from "expo-secure-store";
import { requireOptionalNativeModule } from "expo-modules-core";
import { api, KEEP, ON_PHONE } from "./net";

const KEYS = { guardian: "accounts-guardian", profile: "accounts-profile" } as const;
type Which = keyof typeof KEYS;
export async function readToken(which: Which): Promise<string | null> {
  if (ON_PHONE) return SecureStore.getItemAsync(KEYS[which], KEEP).catch(() => null);
  try { return globalThis.localStorage?.getItem(KEYS[which]) ?? null; } catch { return null; }
}
export async function keepToken(which: Which, t: string | null) {
  if (ON_PHONE) { await (t ? SecureStore.setItemAsync(KEYS[which], t, KEEP) : SecureStore.deleteItemAsync(KEYS[which], KEEP)).catch(() => {}); return; }
  try { if (t) globalThis.localStorage?.setItem(KEYS[which], t); else globalThis.localStorage?.removeItem(KEYS[which]); } catch { /* this visit only */ }
}

// One request to /accounts/<path> on the commons, through the hub, with this device's tokens
export async function accounts<T>(path: string, body: object | null = null): Promise<T> {
  const [guardian, profile] = await Promise.all([readToken("guardian"), readToken("profile")]);
  return api<T>(`/api/accounts/${path}`, { guardian, profile, get: body === null, body: body ?? {} });
}

// C-226 piece 5 (the user, 2026-11-11, by multiple choice): the age check at guardian sign-in -- the device's own age
// signal (iOS 26's Declared Age Range, through the build's DaemonsAgeRange module, C-345; Google Play's age signals on
// Android when there is an Android build). false: the device says its person is under 18, and they cannot become a
// guardian. null: no signal here (the site, an older build or iOS, or the person declined to share) -- sign-in goes on.
const AGE = ON_PHONE ? requireOptionalNativeModule<{ grownUp(): Promise<boolean | null> }>("DaemonsAgeRange") : null;
export async function grownUpHere(): Promise<boolean | null> {
  if (!AGE) return null;
  try { return await AGE.grownUp(); } catch { return null; }
}

// Sign in with Apple, where this build carries it (expo-apple-authentication's native module): the identity token, or
// null when this device cannot (the site; a build without it; the person said no)
const APPLE = ON_PHONE ? requireOptionalNativeModule<{ isAvailableAsync(): Promise<boolean>; signInAsync(o: object): Promise<{ identityToken?: string | null }> }>("ExpoAppleAuthentication") : null;
export const appleHere = async () => !!APPLE && await APPLE.isAvailableAsync().catch(() => false);
export async function appleToken(): Promise<string | null> {
  if (!APPLE) return null;
  try { return (await APPLE.signInAsync({ requestedScopes: [] })).identityToken ?? null; } catch { return null; }
}
