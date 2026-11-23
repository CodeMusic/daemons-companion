// C-290: this file runs on the phone too (C-111) -- keep it free of Node-only APIs (node:*, fs).
// C-478 (the user, 2026-11-22: "the main app tracks active game plays, usually it would just be one (running somewhere:
// the webapp, in the iOS app, some auto AI playtest ...). If you go to this new area: if many ongoing game plays, some
// list, otherwise it auto-selects the one that is active. From that save you have options to see things like where they
// are, their daemons, their icons etc. And wherever it is being played ... it streams screenshots ... (ideally proxied
// via the hub) ... and via the dashboard/app/etc, there is an option for all of them (game management maybe) ... if one
// is going on, an option to end it."): THE GAMES IN PLAY, as the hub knows them.
//
// A game in play REPORTS: a heartbeat every few seconds (POST /api/games/beat: its id, where it runs, on what device, for
// whom), its save whenever the save changes (with the heartbeat), and its screen now and then (POST /api/games/<id>/frame,
// a JPEG or PNG). The hub keeps the newest of each, in memory -- a game in play is now, not a record -- and reads the
// save as the trainer card does (readProfile, readSave): where it was last saved, its time, its MARKS, its party. A game
// not heard from in PLAYING_MS is no longer in play; it is listed among the lately played for a day, at most LATELY.
// ENDING one (an AI run-through, from GAME MANAGEMENT) is asked through its next heartbeat: the hub answers {end: true}
// and the reporter stops. Nothing of Nintendo's passes through: a picture of the screen, a save, never a ROM.
import { readProfile } from "./save/profile.js";
import { readSave } from "./save/reader.js";

export const PLAYING_MS = 45_000, LATELY_MS = 24 * 3600_000, LATELY = 20, FRAME_MOST = 400 * 1024;
// where a game can be played in the ecosystem (a cartridge, or an emulator outside our programs, is never known)
export const SOURCES = { app: "THE APP", site: "THE SITE", playground: "THE PLAYGROUND", ai: "AN AI RUN-THROUGH",
                         cardputer: "THE CARDPUTER", gamepi: "THE GAMEPI" } as const;   // DRAFT
export type Source = keyof typeof SOURCES;
export type Summary = {
  name: string; savedIn: string | null; playTime: string; marks: number;
  party: { species: number; name: string; nickname: string; level: number }[];
};
export type InPlayGame = {
  id: string; source: Source; device: string; user: string; edition?: "CONTENT" | "CONTEXT";
  began: string; heard: string; ended?: string; ending?: boolean;
  summary?: Summary; frame?: { at: string; type: "image/jpeg" | "image/png"; bytes: number };
};
type Kept = InPlayGame & { frameBytes?: Uint8Array };

const clip = (s: unknown, n: number) => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : undefined);
const pad = (n: number) => String(n).padStart(2, "0");

// a save, read as the trainer card reads it; null for anything that is not one
export function summarize(save: Uint8Array): Summary | null {
  try {
    const p = readProfile(save), s = readSave(save);
    return { name: p.name, savedIn: p.savedIn?.place ?? null, marks: p.marks.filter(Boolean).length,
             playTime: `${p.playTime.hours}:${pad(p.playTime.minutes)}`,
             party: s.party.filter((d) => !d.egg).map((d) => ({ species: d.species, name: d.name, nickname: d.nickname, level: d.level })) };
  } catch { return null; }
}

export class InPlay {
  private games = new Map<string, Kept>();
  constructor(private now = () => Date.now()) {}

  // a heartbeat; answers whether the game has been asked to end
  beat(b: { id?: unknown; source?: unknown; device?: unknown; user?: unknown; edition?: unknown; save?: Uint8Array | null }):
      { ok: true; end: boolean } | { error: string } {
    const id = clip(b.id, 64);
    if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) return { error: "{id, source, device?, user?, edition?, save?}: an id of letters, digits, . _ -" };
    const source = typeof b.source === "string" && b.source in SOURCES ? (b.source as Source) : null;
    if (!source) return { error: `source: one of ${Object.keys(SOURCES).join(", ")}` };
    const at = new Date(this.now()).toISOString(), was = this.games.get(id);
    const g: Kept = was && !was.ended ? was : { id, source, device: "", user: "", began: at, heard: at };
    g.source = source; g.heard = at;
    g.device = clip(b.device, 40) || g.device || "a device";
    g.user = clip(b.user, 40) || g.user || "a player";
    if (b.edition === "CONTENT" || b.edition === "CONTEXT") g.edition = b.edition;
    if (b.save) { const s = summarize(b.save); if (s) g.summary = s; }
    this.games.set(id, g);
    this.tidy();
    return { ok: true, end: !!g.ending };
  }

  // its screen now (a JPEG or a PNG, as sent)
  frame(id: string, bytes: Uint8Array, type: string): { ok: true } | { error: string } {
    const g = this.games.get(id);
    if (!g || g.ended) return { error: "no such game in play -- send its heartbeat first" };
    const t = type.startsWith("image/png") ? "image/png" : type.startsWith("image/jpeg") ? "image/jpeg" : null;
    if (!t) return { error: "a frame is a JPEG or a PNG" };
    if (!bytes.length || bytes.length > FRAME_MOST) return { error: `a frame is at most ${FRAME_MOST / 1024} KB` };
    g.frameBytes = bytes;
    g.frame = { at: new Date(this.now()).toISOString(), type: t, bytes: bytes.length };
    g.heard = g.frame.at;
    return { ok: true };
  }
  frameOf(id: string): { type: string; bytes: Uint8Array } | null {
    const g = this.games.get(id);
    return g?.frameBytes && g.frame ? { type: g.frame.type, bytes: g.frameBytes } : null;
  }

  // ending one: asked of the game at its next heartbeat (or said done, for one no longer heard)
  end(id: string): boolean {
    const g = this.games.get(id);
    if (!g || g.ended) return false;
    if (this.playing(g)) g.ending = true;
    else g.ended = new Date(this.now()).toISOString();
    return true;
  }
  // the reporter's own goodbye
  over(id: string): boolean {
    const g = this.games.get(id);
    if (!g || g.ended) return false;
    g.ended = new Date(this.now()).toISOString();
    delete g.frameBytes;
    return true;
  }

  private playing(g: InPlayGame) { return !g.ended && this.now() - Date.parse(g.heard) < PLAYING_MS; }
  // what the page shows: the games in play, newest heard first, and the lately played
  view(): { playing: InPlayGame[]; lately: InPlayGame[] } {
    this.tidy();
    const all = [...this.games.values()].map(({ frameBytes: _f, ...g }) => g).sort((a, b) => b.heard.localeCompare(a.heard));
    return { playing: all.filter((g) => this.playing(g)), lately: all.filter((g) => !this.playing(g)) };
  }
  // a game unheard is over; the lately played kept for a day, at most LATELY; a stale game's screen let go
  private tidy() {
    const now = this.now(), lately: Kept[] = [];
    for (const g of this.games.values()) {
      if (this.playing(g)) continue;
      if (!g.ended) g.ended = g.heard;
      delete g.frameBytes;
      if (now - Date.parse(g.ended) > LATELY_MS) this.games.delete(g.id); else lately.push(g);
    }
    lately.sort((a, b) => b.heard.localeCompare(a.heard)).slice(LATELY).forEach((g) => this.games.delete(g.id));
  }
}
