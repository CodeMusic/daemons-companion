// BRAIN: host phone -- this phone's thinking lent to THE MESH
// C-360, the phone (the user, 2026-11-14: "in theory this would allow a network of iphones to mesh their potential
// together"; by multiple choice, its SETTINGS: "default to what u recommended but also have options for whenever the app
// is open/background, and an option to opt out and never do others work only self work, and an option to never use the
// phone's processing as part of the mind mesh"): THIS PHONE IN THE MESH. While its setting allows, the phone is a node of
// the household's mesh (server/src/machine/procmesh.ts): it asks the hub for work it can do -- a thought, on Apple's on-device
// model (mind.ts) -- does it, and sends the words back. The hub decides who gets each thought (the most reliable mind
// with the most potential free; a phone's model ranks below the Tiiny and a full model, above the hub's small module).
//
//   CHARGING AT HOME   lends only while plugged in and at home (not through the relay) -- the default
//   WHENEVER OPEN      lends whenever the app runs, open or in the background (iOS lets a background app run only
//                      briefly, unless it is playing sleep sounds or a book)
//   ONLY ITS OWN WORK  never takes another's work; its own model still answers its own talks (THE MIND's hedge)
//   NEVER              this phone's processing is never part of the mind -- not even its own talks' hedge
// Every word DRAFT.
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";
import { apiLive, isAway, ON_PHONE } from "./net";
import { canThink, thinkHere } from "./mind";

export type Lend = "charging" | "always" | "own" | "never";
export const LEND_SAID: Record<Lend, string> = { charging: "CHARGING AT HOME", always: "WHENEVER OPEN", own: "ONLY ITS OWN WORK", never: "NEVER" };
export const LEND_ABOUT: Record<Lend, string> = {
  charging: "Thinks for the household only while plugged in and at home, so it never costs the battery or data.",
  always: "Thinks for the household whenever the app is open, or briefly in the background.",
  own: "Never takes the household's work; its own model still answers your talks when the others are slow.",
  never: "This phone's processing is never used by THE MIND -- not even for its own talks.",
};
const KEY = "mesh.lend", KEEP = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
let lend: Lend = "charging", loaded = false;
export async function lendOf(): Promise<Lend> {
  if (loaded) return lend;
  try { const v = await SecureStore.getItemAsync(KEY); if (v && v in LEND_SAID) lend = v as Lend; } catch { /* the default */ }
  loaded = true;
  return lend;
}
export async function setLend(l: Lend) { lend = l; loaded = true; await SecureStore.setItemAsync(KEY, l, KEEP); tell(); }

// what the phone is doing for the household, for its settings card
export type Lending = { on: boolean; why: string; done: number; last: string | null };
let lending: Lending = { on: false, why: "", done: 0, last: null };
const heard = new Set<(l: Lending) => void>();
const tell = (p: Partial<Lending> = {}) => { lending = { ...lending, ...p }; heard.forEach((f) => f(lending)); };
export const onLending = (f: (l: Lending) => void) => { heard.add(f); f(lending); return () => { heard.delete(f); }; };

async function charging(): Promise<boolean> {
  try {
    const B = require("expo-battery") as typeof import("expo-battery");
    const s = await B.getBatteryStateAsync();
    return s === B.BatteryState.CHARGING || s === B.BatteryState.FULL;
  } catch { return false; }
}
// may it take work now, and if not, why not
async function allowed(): Promise<{ ok: boolean; why: string }> {
  const l = await lendOf();
  if (l === "own" || l === "never") return { ok: false, why: LEND_SAID[l] };
  if (!(await canThink()).mind) return { ok: false, why: "this phone cannot think here (Apple Intelligence is needed)" };   // DRAFT
  if (l === "always") return { ok: true, why: "" };
  if (isAway()) return { ok: false, why: "away from home" };   // DRAFT
  if (!(await charging())) return { ok: false, why: "waiting to be plugged in" };   // DRAFT
  return { ok: true, why: "" };
}

let started = false, busy = false;
export function startLending() {
  if (started || !ON_PHONE) return;
  started = true;
  const loop = async () => {
    let wait = 4000;
    try {
      const a = await allowed();
      if (!a.ok) { tell({ on: false, why: a.why }); wait = 30_000; }
      else if (!busy && (AppState.currentState === "active" || (await lendOf()) === "always")) {
        tell({ on: true, why: "" });
        const r = await apiLive<{ job: null | { id: string; kind: string; title: string; system: string; user: string; most: number } }>(
          "/api/mesh/take", { id: "phone", phone: true, caps: ["think"], cores: 6, speed: 3, load: 0, holds: 0 });
        if (r.job?.kind === "think") {
          busy = true;
          const j = r.job;
          try {
            const text = await thinkHere(j.system, [], j.user);
            await apiLive("/api/mesh/done", { id: j.id, node: "phone", ok: true, text });
            tell({ done: lending.done + 1, last: new Date().toISOString() });
          } catch (e) {
            await apiLive("/api/mesh/done", { id: j.id, node: "phone", ok: false, error: (e as Error).message }).catch(() => {});
          } finally { busy = false; }
          wait = 500;
        }
      }
    } catch { wait = 20_000; }
    setTimeout(loop, wait);
  };
  loop();
}
