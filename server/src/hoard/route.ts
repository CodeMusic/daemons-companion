// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-574 (C-596; the user, 2026-11-27: "a requested file comes from whichever node would deliver it fastest, weighing
// ping time, how far away it is, the upload speed of its internet, whether it is on Wi-Fi or Ethernet, and its current
// traffic -- as each compute source weighs how busy and how capable each node is"): THE HOARD's ROUTE.
//
// THE MESH gives work to the node with the most potential free (shared/nodes.ts):   score = potential x reliability x free
// THE HOARD asks a file of the node with the most potential free TO DELIVER IT, by the same score. A storage node's
// potential is the megabits a second it can send to whoever is asking:
//
//   NEAR      where the asker is from the node: HERE (the same home network), TAILNET (reached over the tailnet,
//             from anywhere), AWAY (across the internet)
//   LINK      Ethernet or Wi-Fi: the most its own connection carries (DRAFT ceilings below)
//   UP        the upload speed of its internet, which is what an asker AWAY from it gets at best
//   LEARNED   what its deliveries to askers that near have really measured -- once there is one, it stands for the guess
//   TRAFFIC   the transfers it is carrying now: its free share is 1 / (1 + traffic)
//   PING      the time before the first byte
//
// The time a file of `size` bytes would take:   ping + size / (potential x reliability x free)
// and the sources are ranked soonest first. The hub ranks with what it knows; the phone ranks again with its own pings.
// Every number here is DRAFT.
import { freeOf, scoreOf } from "../shared/nodes.js";

export type Near = "here" | "tailnet" | "away";
export type Link = "ethernet" | "wifi" | "cell" | "other";
export const LINKS: Link[] = ["ethernet", "wifi", "cell", "other"];
/** the most a link of each kind is taken to carry, megabits a second, before anything is measured */
export const LINK_MBPS: Record<Link, number> = { ethernet: 400, wifi: 80, cell: 10, other: 40 };
/** an internet upload nobody has stated or measured */
export const UP_UNKNOWN_MBPS = 10;
/** a ping nobody has measured, by how near */
export const PING_UNKNOWN_MS: Record<Near, number> = { here: 5, tailnet: 40, away: 80 };

export type Source = {
  node: string; name: string;
  url: string;                      // where to ask: a node's own door, or the hub's (a path under the hub's address)
  near: Near; link: Link;
  up: number | null;                // its internet's upload, megabits a second, stated or measured
  learned: number | null;           // megabits a second its deliveries this near have measured
  traffic: number;                  // transfers it carries now
  ping: number | null;              // ms
  history: boolean[];               // how its last deliveries went
  relay?: boolean;                  // the hub passing on another node's copy: slower than either alone
};

/** the megabits a second a node can send to an asker that near */
export function potential(s: Pick<Source, "near" | "link" | "up" | "learned" | "relay">): number {
  const link = LINK_MBPS[s.link] ?? LINK_MBPS.other;
  const guess = s.near === "here" ? link : Math.min(link, s.up ?? UP_UNKNOWN_MBPS);
  const mbps = s.learned && s.learned > 0 ? s.learned : guess;
  return Math.max(0.1, s.relay ? mbps / 2 : mbps);
}
/** its score now, by the rule every network of the household's nodes ranks by */
export const sourceScore = (s: Source) => scoreOf(potential(s), s, freeOf(0, s.traffic));
/** how long `size` bytes would take from it, ms */
export function estimateMs(s: Source, size: number): number {
  const ping = s.ping ?? PING_UNKNOWN_MS[s.near];
  return Math.round(ping + (Math.max(0, size) * 8) / (sourceScore(s) * 1e6) * 1000);
}
/** why it stands where it does, in a few words (DRAFT) */
export function whySaid(s: Source, size: number): string {
  const p = potential(s);
  return [s.near === "here" ? "on this network" : s.near === "tailnet" ? "over the tailnet" : "across the internet",
          s.link === "ethernet" ? "Ethernet" : s.link === "wifi" ? "Wi-Fi" : s.link,
          `${p >= 10 ? Math.round(p) : Math.round(p * 10) / 10} Mbit/s${s.learned ? " measured" : ""}`,
          s.traffic ? `${s.traffic} in hand` : "idle", `ping ${Math.round(s.ping ?? PING_UNKNOWN_MS[s.near])} ms`,
          ...(s.relay ? ["passed on by the hub"] : []), secondsSaid(estimateMs(s, size))].join(", ");
}
export const secondsSaid = (ms: number) => (ms < 1000 ? "under a second" : ms < 90_000 ? `about ${Math.round(ms / 1000)} s` : `about ${Math.round(ms / 60_000)} min`);

/** the sources of one file, the one that would deliver it soonest first */
export function rank(sources: Source[], size: number): (Source & { ms: number; why: string })[] {
  return sources.map((s) => ({ ...s, ms: estimateMs(s, size), why: whySaid(s, size) })).sort((a, b) => a.ms - b.ms || a.node.localeCompare(b.node));
}

/** what one delivery measured, folded into what was learned (megabits a second): the new reading counts for a third */
export function learn(was: number | null, bytes: number, ms: number): number | null {
  if (!(bytes >= 64 * 1024) || !(ms > 0)) return was;               // too small to say anything about speed
  const mbps = (bytes * 8) / 1e6 / (ms / 1000);
  return Math.round((was ? was * (2 / 3) + mbps / 3 : mbps) * 100) / 100;
}

// ---- how near an asker is to a node, from their addresses ----
const v4 = (a: string) => { const m = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a); return m ? m.slice(1).map(Number) : null; };
export const isPrivate = (a: string) => { const q = v4(a); return !!q && (q[0] === 10 || q[0] === 127 || (q[0] === 192 && q[1] === 168) || (q[0] === 172 && q[1] >= 16 && q[1] <= 31) || (q[0] === 169 && q[1] === 254)); };
export const isTailnet = (a: string) => { const q = v4(a); return !!q && q[0] === 100 && q[1] >= 64 && q[1] <= 127; };
export const sameNet = (a: string, b: string) => { const p = v4(a), q = v4(b); return !!p && !!q && p[0] === q[0] && p[1] === q[1] && p[2] === q[2]; };
export const hostOf = (url: string) => /^https?:\/\/\[?([^\]/:]+)/i.exec(url)?.[1] ?? "";

/** the door of a node an asker should use, and how near that makes it: a door on the asker's own network first, then
 *  one on the tailnet when the asker is on it, then any door at all (across the internet). null: it has no door */
export function doorFor(doors: string[], asker: string): { url: string; near: Near } | null {
  const loop = /^(127\.|::1$|::ffff:127\.)/.test(asker);
  const here = doors.find((d) => { const h = hostOf(d); return isPrivate(h) && (sameNet(h, asker) || loop); });
  if (here) return { url: here, near: "here" };
  if (isTailnet(asker)) { const t = doors.find((d) => isTailnet(hostOf(d)) || /\.ts\.net$/i.test(hostOf(d))); if (t) return { url: t, near: "tailnet" }; }
  // a private door is no use to an asker on another network
  const open = doors.find((d) => { const h = hostOf(d); return !isPrivate(h) && !isTailnet(h); });
  return open ? { url: open, near: "away" } : null;
}
