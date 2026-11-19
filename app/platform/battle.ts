// C-328: BATTLE, as this app or site asks its companion for it. Each is a SEAT of its own (battleroute.ts): an id it
// makes once and keeps (app-... on the phone, site-... in a browser), and what the others see it called. One poll is
// shared by everything that shows a battle (ui/battle.tsx over every screen, the YOU tab's card), so it is asked once.
import { apiLive, ON_PHONE } from "./net";
import { placeOf, setPlace } from "../state/place";
import { deviceName } from "../state/me";

// C-420: `today`, how many of its three battles for experience a daemon has had today (the arena's `expADay`)
export type Daemon = { personality?: number; nickname: string; name: string; species: number; level: number; today?: number };
export type Move = { slot: number; id: number; name: string; type: string | null; power: number; pp: number; maxPP: number };
export type Side = { label: string; seat: string; daemon: (Daemon & { types: string[]; hp: number; maxHP: number; status: string; art: string | null; moves?: Move[] }) | null };
export type Line = { text: string; side: 0 | 1 | null; hp: [number, number] | null; sound: string | null };
export type Fight = { id: string; phase: "asked" | "on" | "over" | "declined" | "lapsed" | "withdrawn"; at: string; me: 0 | 1 | null; turn: number;
                      sides: [Side, Side]; chosen: [boolean, boolean]; deadline: string | null; secondsLeft: number | null; log: Line[][];
                      winner: 0 | 1 | null; draw: boolean; forfeit: 0 | 1 | null; exp: [number, number]; result: string | null; asking: string | null; far?: boolean;
                      counted?: [boolean | null, boolean | null];   // C-420: false when the day's three were spent (its exp shown as 0)
                      // C-421: a CHALLENGE -- open to anyone, until when it waits, which side fights by itself, who has watched it
                      endedAt?: string | null; challenge?: boolean; open?: boolean; auto?: [boolean, boolean]; watched?: [boolean, boolean]; until?: string | null;
                      commons?: boolean };   // C-422: a battle with a friend's home, on THE COMMONS
export type Online = { seat: string; label: string; kind: "device" | "app" | "player" | "friend"; daemon: Daemon | null };   // C-422: friend, a friend's home's player
export type Arena = { seat: string; label: string; player: { id: string; name: string } | null; daemon: Daemon | null; chooses: boolean;
                      away: Daemon[]; online: Online[]; fights: Fight[]; expADay?: number;
                      known?: Online[];     // C-421: who can be left a CHALLENGE though not online now
                      friends?: boolean };  // C-422: linked to THE COMMONS, and it answered: friends' homes can be battled

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
// C-421: a time a challenge waits until, said plainly: "18:40", or "tomorrow 09:15"
export function untilSaid(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === now.toDateString() ? hm : `tomorrow ${hm}`;          // DRAFT
}
// C-421: a challenge's replay, due on the side that fought by itself until its player has watched it
// C-422: where a battle is, said after its names
export const whereSaid = (f: Fight) => (f.commons ? " · a friend's home" : f.far ? " · on the exchange" : "");   // DRAFT
export const replayDue = (f: Fight) => f.phase === "over" && !!f.challenge && f.me !== null && !!f.auto?.[f.me] && !f.watched?.[f.me];
export async function act<T = Fight>(path: string, body: unknown): Promise<T> {
  const r = await battleApi<T>(path, body);
  await refresh();
  return r;
}
