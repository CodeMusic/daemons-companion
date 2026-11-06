// C-299: the mending, seen once on this device (the user, 2026-11-05, by multiple choice: "Show it once") -- the first
// time the LIBRARY finds the save mended, the two halves close at the spine on the shelf and become THE UNITY BOOK. Kept
// as the look is (look.ts): the phone's keychain, the site's localStorage. </> THE BOOKS can let it mend again.
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { KEEP, ON_PHONE } from "../platform/net";

const NAME = "unity-mending-seen";
let seen: boolean | null = null;                    // null: not yet asked
const heard = new Set<() => void>();
const tell = () => heard.forEach((f) => f());

async function load(): Promise<boolean> {
  if (seen !== null) return seen;
  try { seen = (ON_PHONE ? await SecureStore.getItemAsync(NAME, KEEP) : globalThis.localStorage?.getItem(NAME)) === "1"; }
  catch { seen = false; }
  return seen!;
}
function keep(v: boolean) {
  seen = v; tell();
  try {
    if (ON_PHONE) (v ? SecureStore.setItemAsync(NAME, "1", KEEP) : SecureStore.deleteItemAsync(NAME, KEEP)).catch(() => {});
    else if (v) globalThis.localStorage?.setItem(NAME, "1");
    else globalThis.localStorage?.removeItem(NAME);
  } catch { /* kept for this visit only */ }
}
export const seeMending = () => keep(true);
export const mendAgain = () => keep(false);

// null while it is being asked, so the shelf never shows the mended book for a moment before mending it
export function useMendingSeen(): boolean | null {
  const [v, setV] = useState<boolean | null>(seen);
  useEffect(() => {
    const f = () => setV(seen);
    heard.add(f);
    load().then(f);
    return () => { heard.delete(f); };
  }, []);
  return v;
}
