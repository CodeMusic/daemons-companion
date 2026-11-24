// C-493 (C-478's rest, the user 2026-11-22: "the main app tracks active game plays ... wherever it is being played ... it
// streams screenshots ... proxied via the hub"): this game, reported to the hub while it is played -- a heartbeat every
// five seconds with the save whenever it changed (POST /api/games/beat), its screen every ten (POST /api/games/<id>/frame,
// the emulator's own PNG), and goodbye when it is left (POST /api/games/<id>/over). The hub answers {end: true} when GAME
// MANAGEMENT ended it; the game then goes back to its title. Only with a hub: a phone on its own reports to no one.
// Never a ROM: a save and a picture of the screen (server/src/game/inplay.ts).
import { ALONE, api, homeBase, ON_PHONE, TOKEN } from "../platform/net";

export const BEAT_MS = 5000, FRAME_MS = 10000;
type Frame = { b64: string; type: "image/png" | "image/jpeg" } | null;
export type Reporting = { stop: (goodbye?: boolean) => void };   // stopped without goodbye: paused, the same game later

const bytesOf = (b64: string) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
// a picture as bytes to the hub (the phone's fetch sends bytes only through expo/fetch)
async function postFrame(id: string, f: NonNullable<Frame>): Promise<boolean> {
  const send: typeof fetch = ON_PHONE ? (require("expo/fetch").fetch as typeof fetch) : fetch;
  const auth: Record<string, string> = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};
  const stop = new AbortController(), t = setTimeout(() => stop.abort(), 8000);
  try {
    const r = await send(`${homeBase()}/api/games/${encodeURIComponent(id)}/frame`,
      { method: "POST", headers: { "content-type": f.type, ...auth }, body: bytesOf(f.b64) as unknown as BodyInit, signal: stop.signal });
    return r.ok;
  } catch { return false; } finally { clearTimeout(t); }
}

/** Report a game in play until stopped (or the hub ends it). `save` is the save as the game last had it, base64. */
export function reportInPlay(o: { id: string; source: "app" | "site"; edition?: string; user?: string;
                                  save: () => string; frame: () => Promise<Frame>; onEnd: () => void }): Reporting {
  let on = !ALONE, sent = "", lastFrame = 0, beating = false, t: ReturnType<typeof setInterval> | null = null;
  const beat = async () => {
    if (!on || beating) return;
    beating = true;
    try {
      const now = o.save(), save = now && now !== sent ? now : undefined;
      const r = await api<{ ok?: boolean; end?: boolean }>("/api/games/beat", { id: o.id, source: o.source, edition: o.edition, user: o.user, save });
      if (save) sent = now;
      if (r?.end) { on = false; if (t) clearInterval(t); void bye(); o.onEnd(); return; }
      if (Date.now() - lastFrame >= FRAME_MS) {
        lastFrame = Date.now();
        const f = await o.frame();
        if (f && on) await postFrame(o.id, f);
      }
    } catch { /* the hub away: tried again at the next beat */ }
    finally { beating = false; }
  };
  const bye = () => api("/api/games/" + encodeURIComponent(o.id) + "/over", {}).catch(() => {});
  t = on ? setInterval(beat, BEAT_MS) : null;
  if (on) void beat();
  return { stop: (goodbye = true) => { if (!on) return; on = false; if (t) clearInterval(t); if (goodbye) void bye(); } };
}
