// C-111: the companion's own logic, wherever it runs. Everything here reads and writes through a Store and a SaveFile, so
// the server (api.ts, over Node's SQLite and the save on disk) and a phone hosting on its own (app/local.ts, over
// expo-sqlite and the save Delta shared through Files) run the same rules. Nothing here may import Node.
import { den } from "./dens.js";
import weekJson from "../data/week.json" with { type: "json" };
import speciesJson from "../data/species.json" with { type: "json" };
import type { Store } from "./store.js";
import { readAway, readSave } from "./save/reader.js";
import { readProfile } from "./save/profile.js";
import { syncSave } from "./save/writer.js";
import { season } from "./seasons.js";
import { gameRoutines } from "./paint.js";
import { deviceDay, PALETTES, type Palette } from "./days.js";
import { castsForDevice } from "./broadcast.js";   // C-134
import { life } from "./life.js";
import { feelings } from "./feelings.js";
import { drawnAs, expressionFor, faceOf } from "./expressions.js";
import { companionId, noteFor } from "./cards.js";
import { levelFromExp } from "./save/growth.js";
import { carriedFor } from "./carry.js";
import { SharedNetworks } from "./networks.js";
import { casinoPending, coinsFor, tableFor } from "./casino.js";   // C-149, C-151
import { casinoContext, casinoDress, reelSpecies, weatherNow } from "./context.js";   // C-158
import { holiday } from "./holidays.js";                 // C-149
import { readIndex } from "./save/index.js";
import { readPlay } from "./save/play.js";            // T-426: the instrument, on the boards with keys

const SPECIES = speciesJson as unknown as Record<string, any>;

// The save the companion answers: its bytes, or null when there is none yet; write keeps a copy of the save as it was
// first and returns where (or null), then writes the new one.
export interface SaveFile { read(): Uint8Array | null; write(bytes: Uint8Array, now: Date): string | null }
export type Edition = "CONTENT" | "CONTEXT";
export interface Host { edition: Edition; save: SaveFile }

export function today(h: Host, store: Store, now = new Date()) {
  const day = weekJson.days[now.getDay()];               // Sunday first, as the game keeps it
  // the LOCAL date, as the day and the season are read: toISOString() is UTC, and west of Greenwich it names tomorrow by evening
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n, i) => String(n).padStart(i ? 2 : 4, "0")).join("-");
  return { date, edition: h.edition, day, season: season(h.edition, now),
           next: store.nextStep() };
}


// C-21 / C-22: the one SYNC. The first save synced is the app's game (its trainer's name and full ID, which never
// change). On that save: answer the requests (any number away, C-80), set LINKED so the game shows SEND, and settle an
// emergency return -- written only if something changed, after a backup, with the game closed. On any other save:
// nothing is written; the app shows it, and says it belongs to a different game.
export function sync(h: Host, store: Store, now = new Date()) {
  const file = h.save.read();
  if (!file) throw new Error("no save is configured (savePath in config.json)");
  const p = readProfile(file);
  const game = { name: p.name, trainerId: p.trainerId, secretId: p.secretId };
  let married = store.married();
  const firstSave = !married;
  if (!married) { store.marry(game); married = game; }
  const sameGame = married.name === game.name && married.trainerId === game.trainerId && married.secretId === game.secretId;
  if (!sameGame)
    return { sameGame, firstSave, married, received: [], returned: [], refused: [], firstLink: false, recalledSeen: false, backup: null,
             met: { companions: 0, newlySeen: 0, friendship: null }, grew: null, casino: null };
  // C-15: what was met nearby since the last SYNC -- each species seen; +1 friendship for each companion met in a day
  // (the beacon's id changes hourly, so it is counted per hour seen), at most +5 a day. Small, as everything is (PLAN 7).
  const applied = Number(store.getSetting("met.applied") ?? 0);
  const meetings = store.meetingsAfter(applied);
  const perDay = new Map<string, Set<string>>();
  const seen: number[] = [];
  for (const m of meetings) {
    const [species, peer] = (m.detail ?? "").split(" ");
    const nat = SPECIES[species]?.national;
    if (nat) seen.push(nat);
    const day = m.at.slice(0, 10);
    if (!perDay.has(day)) perDay.set(day, new Set());
    perDay.get(day)!.add(peer ?? m.at);
  }
  const friendshipGain = [...perDay.values()].reduce((n, peers) => n + Math.min(5, peers.size), 0);
  // C-45: the experience a daemon gained here, written when it is home -- every party daemon with some waiting is
  // offered, and the first of them home is written (C-80: with a daemon in each device, the first waiting may still be out)
  const grow: { personality: number; exp: number }[] = [], growLast = new Map<number, number>();
  for (const d of readSave(file).party) {
    const p = pendingExp(store, d.personality);
    if (p.exp > 0) { grow.push({ personality: d.personality, exp: p.exp }); growLast.set(d.personality, p.last); }
  }
  // C-149: what the CASINO won or lost on the boards since the last SYNC, into the money
  const casino = casinoPending(store);
  const r = syncSave(file, { link: true, met: { seen, friendship: friendshipGain }, grow, money: casino.delta });
  const backup = r.changed ? h.save.write(r.save, now) : null;   // a copy of the save as it was goes beside it first
  // only once the save holds them: what was met, and what was grown, are written -- together (C-157), so a SYNC never
  // records one as applied and not another (the save itself is a file: it is written, whole, just before)
  store.together(() => {
    if (meetings.length) store.setSetting("met.applied", String(meetings[meetings.length - 1].id));
    if (r.grew) store.setSetting(`exp.applied.${r.grew.personality}`, String(growLast.get(r.grew.personality) ?? 0));
    if (casino.delta || casino.spins) store.setSetting("casino.applied", String(casino.last));   // a clamp still settles it
  });
  return { sameGame, firstSave, married,
           received: r.answered.filter((a) => a.now === "away").map((a) => a.nickname),
           returned: r.answered.filter((a) => a.now === "home").map((a) => a.nickname),
           refused: r.refused, firstLink: r.firstLink, recalledSeen: r.recalledSeen, backup,
           met: { companions: meetings.length, newlySeen: r.newlySeen.length, friendship: r.friendship },
           grew: r.grew ? { nickname: r.grew.nickname, exp: r.grew.exp, from: r.grew.from, to: r.grew.to } : null,
           casino: casino.delta || casino.spins ? { won: casino.delta, spins: casino.spins, from: r.money?.from ?? p.money, to: r.money?.to ?? p.money } : null };
}


// C-162 (the user, 2026-10-18): the faces a round screen can show at home -- the daemon in the middle with the time
// above it (the default), the daemon under a clock's hands, or the day's words alone (the watch's first face)
export const FACES = ["daemon", "clock", "virtue"] as const;
export type Face = typeof FACES[number];

// C-43: the board's settings -- set on the site, never on the board -- carried to it in every state, so a board
// that links picks them up whichever way it links. Kept by the server; the board keeps its own copy in flash.
export const DEVICE_SETTINGS = { home: "daemon", sleepAfter: 120, sound: true, volume: 40, ring: 33, meet: true,   // meet: C-15
                                 palette: "checkpoint" as Palette,                                                // C-90
                                 band: 433,     // C-72: the LoRa band the watch and the T-Deck were bought with (433, 868 or 915 MHz)
                                 wakeSound: "power" as "power" | "every",     // C-159: the jingle at power-up, or on every wake
                                 face: "daemon" as Face,                      // C-162: the round face a watch shows first
                                 faceSky: true };                             // C-163: the season behind its daemon, the weather in front
export type DeviceSettings = typeof DEVICE_SETTINGS;
function parsed(store: Store, key: string): Partial<DeviceSettings> {
  try { return JSON.parse(store.getSetting(key) ?? "{}"); } catch { return {}; }
}
// C-159 (the user, 2026-10-18: "tap the device to open its specific settings -- there you can adjust sound style, volume
// (or mute), along with any other device specific settings"): each device's own over the shared ones. What a device may
// keep for itself; the rest (the palette, the band, meeting others) is the companion's, the same for every board.
export const OWN_KEYS = ["home", "sleepAfter", "sound", "volume", "ring", "wakeSound", "face", "faceSky"] as const;   // face: C-162; faceSky: C-163
export function ownSettings(store: Store, deviceId: string): Partial<DeviceSettings> {
  return deviceId ? parsed(store, `device.${deviceId}`) : {};
}
export function deviceSettings(store: Store, deviceId = ""): DeviceSettings {
  return { ...DEVICE_SETTINGS, ...parsed(store, "device"), ...ownSettings(store, deviceId) };
}
// a device's own, changed: a key given a value is kept (checked as the shared ones are), a key given null goes back to
// the shared one. The settings that result, or why not.
export function setOwnSettings(store: Store, deviceId: string, patch: Record<string, unknown>): DeviceSettings | string {
  const own: Record<string, unknown> = { ...ownSettings(store, deviceId) };
  for (const k of OWN_KEYS) if (k in patch) { if (patch[k] === null) delete own[k]; else own[k] = patch[k]; }
  const s = checkSettings({ ...DEVICE_SETTINGS, ...parsed(store, "device"), ...own });
  if (typeof s === "string") return s;
  store.setSetting(`device.${deviceId}`, Object.keys(own).length ? JSON.stringify(own) : null);
  return s;
}
export function checkSettings(b: any): DeviceSettings | string {
  const s = { ...DEVICE_SETTINGS, ...b };
  if (!["daemon", "today"].includes(s.home)) return "home is daemon or today";
  if (!Number.isInteger(s.sleepAfter) || s.sleepAfter < 0 || s.sleepAfter > 3600) return "sleepAfter is 0 (never) to 3600 seconds";
  if (typeof s.sound !== "boolean") return "sound is on or off";
  if (!Number.isInteger(s.volume) || s.volume < 0 || s.volume > 100) return "volume is 0 to 100";
  if (!Number.isInteger(s.ring) || s.ring < 0 || s.ring > 100) return "ring is 0 to 100";
  if (typeof s.meet !== "boolean") return "meet is on or off";
  if (!PALETTES.includes(s.palette)) return "palette is checkpoint or rainbow";
  if (![433, 868, 915].includes(s.band)) return "band is 433, 868 or 915";
  if (!["power", "every"].includes(s.wakeSound)) return "wakeSound is power or every";   // C-159
  if (!FACES.includes(s.face)) return "face is daemon, clock or virtue";                 // C-162
  if (typeof s.faceSky !== "boolean") return "faceSky is on or off";                      // C-163
  return { home: s.home, sleepAfter: s.sleepAfter, sound: s.sound, volume: s.volume, ring: s.ring, meet: s.meet, palette: s.palette, band: s.band,
           wakeSound: s.wakeSound, face: s.face, faceSky: s.faceSky };
}


// C-48: a walking goal -- steps a day, 10,000 unless the site says otherwise. The phone will count them (C-27,
// HealthKit); until then they are typed on the site. Reaching it, once a day, is activity for the daemon (PLAN 7:
// "satisfies it as training does") and gives it experience.
export const WALK_GOAL = 10000, EXP_PER_WALK = 1;
export function walk(h: Host, store: Store, now = new Date()) {
  const date = today(h, store, now).date;
  const goal = Number(store.getSetting("walk.goal") ?? WALK_GOAL);
  const steps = Number(store.getSetting(`walk.${date}`) ?? 0);
  return { date, goal, steps, reached: steps >= goal };
}
export function setWalk(h: Host, store: Store, b: { goal?: unknown; steps?: unknown }) {
  if (b.goal !== undefined) {
    if (!Number.isInteger(b.goal) || (b.goal as number) < 1000 || (b.goal as number) > 50000) return "a walking goal is 1,000 to 50,000 steps";
    store.setSetting("walk.goal", String(b.goal));
  }
  const before = walk(h, store);
  if (b.steps !== undefined) {
    if (!Number.isInteger(b.steps) || (b.steps as number) < 0 || (b.steps as number) > 200000) return "steps are a whole number";
    store.setSetting(`walk.${before.date}`, String(b.steps));
  }
  const after = walk(h, store);
  if (after.reached && !store.interactionsSince(new Date(Date.now() - 86400000)).some((e) => e.kind === "walk" && e.detail === after.date)) {
    store.logInteraction("walk", after.date);
    const d = carriedDaemon(h, store);
    if (d) store.logInteraction("exp", `${d.personality} ${EXP_PER_WALK} walk ${after.date}`);
  }
  return after;
}


// C-46: an entry is short on purpose -- simpler is better (the user) -- and the site says so.
export const ENTRY_LIMIT = 40;
export const entry = (v: unknown) => typeof v === "string" && v.trim() && v.trim().length <= ENTRY_LIMIT ? v.trim() : null;

// A step done, from the site or the board: kept as time together (C-13), a meal (C-44), and experience (C-47).
export function doStep(h: Host, store: Store, id: number, from: "site" | "device", deviceId = "") {
  const r = store.completeStep(id);
  if (r.fresh) { store.logInteraction("step", `${from} ${id}`); growFromStep(h, store, id, deviceId); }
  return r;
}

// C-45, C-47: experience gained on the device. LIMITED LEVELING (the user, 2026-10-04): one step completed is one
// experience point -- a variable to tune later. Kept by its personality until it is home, when SYNC writes it.
export const EXP_PER_STEP = 1;
export function pendingExp(store: Store, personality: number) {
  const rows = store.expAfter(personality, Number(store.getSetting(`exp.applied.${personality}`) ?? 0));
  return { exp: rows.reduce((n, r) => n + r.gain, 0), last: rows.length ? rows[rows.length - 1].id : 0 };
}
// C-80: the daemon a device carries (carry.ts); with no device named, the first away, as before. A step ticked on a
// device grows that device's daemon; one done in the app or on the site, the first away (LIMITED LEVELING: one each).
export function awayNow(h: Host) {
  const bytes = h.save.read();
  if (!bytes) return [];
  try { return readAway(bytes); } catch { return []; }   // C-103: the boxes' too
}
export function carriedDaemon(h: Host, store: Store, deviceId = "") { return carriedFor(store, awayNow(h), deviceId); }
export function growFromStep(h: Host, store: Store, stepId: number, deviceId = "") {
  const d = carriedDaemon(h, store, deviceId);
  if (!d) return;
  const curve = SPECIES[String(d.species)]?.growth ?? 0;
  if (levelFromExp(curve, d.exp + pendingExp(store, d.personality).exp) >= 100) return;
  store.logInteraction("exp", `${d.personality} ${EXP_PER_STEP} step ${stepId}`);   // the step's id, so an undo takes it back
}

// C-13: the carried daemon's life, read from two weeks of what was done together.
export function daemonLife(store: Store, now = new Date()) {
  return life(store.interactionsSince(new Date(now.getTime() - 14 * 86400000)), now);
}

// C-120 / C-119: how it feels (from the last day), and the expression that shows it -- a description every host draws
export function daemonFeelings(store: Store, now = new Date()) {
  return feelings(store.interactionsSince(new Date(now.getTime() - 26 * 3600000)), now);
}
export const artName = (species: number | string) => (SPECIES[String(species)]?.art?.front as string | undefined)?.split("/").pop()?.replace("_front.png", "");
export function daemonExpression(store: Store, now = new Date(), lifeNow = daemonLife(store, now), species: number | null = null) {
  return expressionFor(lifeNow, daemonFeelings(store, now), species === null ? null : faceOf(artName(species)));
}

// C-45: what it has grown here, to show on the device and the site: the experience, and the level it would be at home
export function grown(d: { species: number; exp: number; level: number; personality: number }, store: Store) {
  const exp = pendingExp(store, d.personality).exp;
  return { exp, level: Math.max(d.level, levelFromExp(SPECIES[String(d.species)]?.growth ?? 0, d.exp + exp)) };
}

// `as`: an expression to draw it in instead of its own (GET /api/device/state?expression=, for a bench check)
export function deviceState(h: Host, store: Store, now = new Date(), deviceId = "", server: string | null = null, as: string | null = null) {
  const t = today(h, store, now);
  let daemon = null, party: unknown[] = [], casino: any = null;
  // T-426: what the save holds of the instrument -- which, unlocked or not, the songs learned and heard (the songs
  // themselves are built into the boards, firmware/common/play.h)
  let play: { i: string; u: boolean; l: string[]; h: string[] } | null = null;
  // C-158: the world the devices live in -- the real one: the hour (the game's watches), the weather of the city set
  // on the site -- and the CASINO's luck in it, with its reasons
  const weather = weatherNow(store, now), today_ = holiday(t.edition, now);
  const context = casinoContext(t.edition, now, t.season, today_, weather);
  const bytes = h.save.read();
  if (bytes) {
    const save = readSave(bytes);
    const d = carriedFor(store, readAway(bytes), deviceId);   // C-80: this device's own; C-103: a box's too
    const profile = readProfile(bytes);
    try {
      const p = readPlay(bytes, t.edition);
      play = { i: p.instrument, u: p.unlocked, l: p.songs.filter((s) => s.learned).map((s) => s.id), h: p.songs.filter((s) => s.heard).map((s) => s.id) };
    } catch { play = null; }
    // C-149: the CASINO's coins -- the save's money and what waits for SYNC -- and the party's other daemons, its reels
    casino = coinsFor(store, profile.money, deviceId, save.party.filter((p) => p.personality !== d?.personality).map((p) => p.slot),
                      tableFor(store, deviceId, readAway(bytes), now));   // C-151: our other boards at the reels
    // C-158: the reels' other daemons -- seen in the game, at home in this season or hour first -- and the day's luck
    const seen = readIndex(bytes, h.edition).entries.map((e) => e.species);
    casino.reel = reelSpecies(seen, d?.species ?? null, save.party.map((p) => p.species), t.season, context.watch, now)
      .map((sp) => ({ species: sp, name: SPECIES[String(sp)]?.name ?? "" }));
    casino.context = { luck: context.luck, rtp: context.rtp, reasons: context.reasons };
    casino.dress = casinoDress(t.season, today_, weather, context.watch);   // C-158: one rule, read by every screen
    // C-149: OPUS's margin beside its INDEX entry, where the save holds OPUS and the margin has something to say
    const margin = profile.opus && d ? readIndex(bytes, h.edition).entries.find((e) => e.species === d.species)?.margin?.text ?? "" : "";
    // C-68: the party and their routines, for GAME ROUTINES
    party = save.party.map((p) => ({ name: p.nickname || p.name, level: p.level, types: SPECIES[String(p.species)]?.types ?? [],
                                     routines: gameRoutines(SPECIES[String(p.species)]?.bodyType ?? null, p.moves) }));
    const row = d && SPECIES[String(d.species)];
    // C-36: its INDEX entry in the save's edition's voice, and `artKey`, which changes when its art would (another
    // daemon, or new routines painting its streaks), so a device fetches GET /api/device/art only then.
    if (d) daemon = { slot: d.slot, species: d.species, name: d.name, nickname: d.nickname, level: d.level, friendship: d.friendship,
                      holding: d.holding, art: `/art/party/${d.slot}.png`, mood: null,
                      types: row?.types ?? [], category: row?.category ?? "", entry: row?.entry?.[h.edition] ?? "",
                      artKey: `${d.species}-${d.moves.join(".")}`, life: daemonLife(store, now),
                      expression: (as && drawnAs(as, faceOf(artName(d.species)))) || daemonExpression(store, now, undefined, d.species),   // C-119: drawn by every host
                      den: den(row?.types ?? []),                                      // C-113: where it is drawn
                      grown: grown(d, store), margin };
  }
  const dd = deviceDay(t.day.day, deviceSettings(store).palette);   // C-90: the palette the user chose
  // C-33: where a device on the Wi-Fi finds this server -- only when it listens on the network at all
  return { date: t.date, edition: t.edition, season: t.season, server,
           companion: companionId(store), cardNote: noteFor(store),   // C-124: whose cards are ours; a note to write
           // C-71: the time, for a device with a clock to set (the watch): seconds since 1970, and the local offset in minutes
           clock: { epoch: Math.floor(now.getTime() / 1000), offset: -now.getTimezoneOffset() },
           settings: deviceSettings(store, deviceId),   // C-159: its own over the shared
           holiday: today_, casino,                           // C-149: how a board dresses today; the CASINO's coins
           world: { watch: context.watch, weather: weather && { kind: weather.kind, tempC: weather.tempC, city: weather.city } },   // C-158
           beacons: ownBeacons(store).map((b) => b.peer).join(","),     // C-15: our companions' tags, never a meeting
           netsRev: new SharedNetworks(store).rev(),     // C-93: the shared networks changed: a device reports and takes them
           casts: castsForDevice(store, now),            // C-134: the last ten minutes' broadcasts; a board drops ids it has
           play,                                         // T-426: the instrument, on the boards with keys
           // C-73: the Xenith day -- the virtue over its shadow, the chakra and the day's theme
           day: { name: t.day.day, colour: t.day.colour, note: t.day.note, virtue: t.day.cue, chakra: t.day.chakra,
                  theme: t.day.theme, menu: dd.menu, led: dd.led },
           step: t.next ? { id: t.next.step.id, text: t.next.step.text, goal: t.next.goal, milestone: t.next.milestone } : null, daemon, party };
}


export function ownBeacons(store: Store): { peer: string; at: number }[] {
  try { return JSON.parse(store.getSetting("beacons.own") ?? "[]"); } catch { return []; }
}

