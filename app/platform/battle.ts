// C-328: BATTLE, as this app or site asks its companion for it. Each is a SEAT of its own (battleroute.ts): an id it
// makes once and keeps (app-... on the phone, site-... in a browser), and what the others see it called. One poll is
// shared by everything that shows a battle (ui/battle.tsx over every screen, the YOU tab's card), so it is asked once.
import { apiLive, ON_PHONE } from "./net";
import { placeOf, setPlace } from "../state/place";
import { deviceName } from "../state/me";

export type Daemon = { personality?: number; nickname: string; name: string; species: number; level: number };
export type Move = { slot: number; id: number; name: string; type: string | null; power: number; pp: number; maxPP: number };
export type Side = { label: string; seat: string; daemon: (Daemon & { types: string[]; hp: number; maxHP: number; status: string; art: string | null; moves?: Move[] }) | null };
export type Line = { text: string; side: 0 | 1 | null; hp: [number, number] | null; sound: string | null };
export type Fight = { id: string; phase: "asked" | "on" | "over" | "declined" | "lapsed" | "withdrawn"; at: string; me: 0 | 1 | null; turn: number;
                      sides: [Side, Side]; chosen: [boolean, boolean]; deadline: string | null; secondsLeft: number | null; log: Line[][];
                      winner: 0 | 1 | null; draw: boolean; forfeit: 0 | 1 | null; exp: [number, number]; result: string | null; asking: string | null; far?: boolean };
export type Online = { seat: string; label: string; kind: "device" | "app" | "player"; daemon: Daemon | null };
export type Arena = { seat: string; label: string; player: { id: string; name: string } | null; daemon: Daemon | null; chooses: boolean;
                      away: Daemon[]; online: Online[]; fights: Fight[] };

export function mySeat(): string {
  let s = placeOf<string>("battle.seat", "");
  if (!s) {
    s = `${ON_PHONE ? "app" : "site"}-${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;
    setPlace("battle.seat", s);
  }
  return s;
}
const asked = (path: string) => `${path}?device=${mySeat()}&label=${encodeURIComponent(deviceName().toUpperCase())}`;
// asked live, never from what the phone kept, and a choice never queued for later (a turn is over in 30 seconds)
export const battleApi = <T,>(path: string, body?: unknown) => apiLive<T>(asked(path), body);

// the shared poll: every few seconds, quicker while a battle is on; each listener told of every answer
let last: Arena | null = null, timer: ReturnType<typeof setTimeout> | null = null, error = "";
const listeners = new Set<() => void>();
export const arena = () => last;
export const arenaError = () => error;
export async function refresh(): Promise<Arena | null> {
  try { last = await battleApi<Arena>("/api/battle"); error = ""; } catch (e) { error = (e as Error).message; }
  listeners.forEach((f) => f());
  return last;
}
function loop() {
  const busy = last?.fights.some((f) => f.phase === "on" || f.phase === "asked");
  timer = setTimeout(() => { refresh().finally(() => { if (listeners.size) loop(); else timer = null; }); }, busy ? 1500 : 4000);
}
export function listen(f: () => void): () => void {
  listeners.add(f);
  if (!timer) { refresh(); loop(); }
  return () => { listeners.delete(f); if (!listeners.size && timer) { clearTimeout(timer); timer = null; } };
}
export async function act<T = Fight>(path: string, body: unknown): Promise<T> {
  const r = await battleApi<T>(path, body);
  await refresh();
  return r;
}
