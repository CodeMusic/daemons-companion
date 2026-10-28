// C-187: DAEMONS from the player's own ROM, made on this device (docs/ONEAPP.md). The player gives their FireRed or
// LeafGreen once, from Files; it is known by its SHA-1 (server/data/patches.json), our patch for it is fetched from the
// release on GitHub and checked, applied here (server/src/game/bps.ts) and the result checked against the release's own
// SHA-1. The ROM made is kept in the app's documents (game/); the player's file is only read, never changed. A copy of
// it, untouched, is kept there too (the player's own, on their own device, never sent anywhere), so a new release is
// made from it with one tap. Which releases there are is read from this repository on GitHub as published now, so a
// release the app was built before is still found. A DAEMONS ROM already made (one of our releases) is taken as it is,
// and can be updated only from the player's original. Nothing of Nintendo's is in the app.
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import { applyBps } from "../../server/src/game/bps";
import { sha1 } from "../../server/src/game/hash";
import { latestRelease, patchFor, releasedAs, usePatches, type Patch } from "../../server/src/game/patches";
import { api } from "../net";

export type Game = { edition: "CONTENT" | "CONTEXT"; release: string; sha1: string; from: string; at: string; testing?: boolean };   // testing: C-216

const dir = () => new Directory(Paths.document, "game");
const romFile = () => new File(dir(), "daemons.gba");
const infoFile = () => new File(dir(), "game.json");
const stockFile = () => new File(dir(), "original.gba");       // the player's ROM as they gave it
const LIVE = "https://raw.githubusercontent.com/CodeMusic/daemons-companion/main/server/data/patches.json";
function put(f: File, bytes: Uint8Array | string) { if (!f.exists) f.create(); f.write(bytes); }

// The game this device holds, or null
export function heldGame(): Game | null {
  const f = infoFile();
  if (!f.exists || !romFile().exists) return null;
  try { return JSON.parse(f.textSync()) as Game; } catch { return null; }
}
export const romUri = () => romFile().uri;

// The releases as published now; the built-in list stays when offline (true when a newer list was taken)
export async function freshPatches(): Promise<boolean> {
  try {
    const r = await fetch(LIVE, { headers: { "cache-control": "no-cache" } });
    return r.ok && usePatches(await r.json());
  } catch { return false; }
}
// A newer DAEMONS than the one held: "ready" when it can be made here, "original" when the player's ROM is needed again
export function updateFor(g: Game | null): { release: string; needs: "ready" | "original" } | null {
  if (!g || g.testing || g.release === latestRelease()) return null;   // a testing build is left as it is until put back
  return { release: latestRelease(), needs: stockFile().exists ? "ready" : "original" };
}
export const romBytes = () => romFile().bytesSync();

// What each step is doing, for the screen to say
export type Step = "reading" | "checking" | "fetching" | "patching" | "keeping";

// Our patch for this retail ROM, fetched, checked and applied; throws with words the player can act on
async function patched(rom: Uint8Array, id: string, onStep: (s: Step) => void): Promise<{ out: Uint8Array; edition: Game["edition"] }> {
  const p: Patch | null = patchFor(id);
  if (!p) throw new Error("That file is not a ROM DAEMONS knows. It takes FireRed or LeafGreen (USA, 1.0 or Rev 1), "
                         + "unchanged -- the .gba you own.");   // DRAFT
  onStep("fetching");
  const res = await fetch(p.url);
  if (!res.ok) throw new Error(`The patch did not come down (${res.status}). Is this device online?`);   // DRAFT
  const patch = new Uint8Array(await res.arrayBuffer());
  if (patch.length !== p.patch.size || sha1(patch) !== p.patch.sha1) throw new Error("The patch came down damaged. Try again.");   // DRAFT
  onStep("patching");
  const out = applyBps(rom, patch);
  if (sha1(out) !== p.target.sha1) throw new Error("The patched game did not check out. Nothing was kept.");   // DRAFT
  return { out, edition: p.edition };
}
function keep(out: Uint8Array, made: { edition: Game["edition"]; release: string; testing?: boolean }, from: string, stock?: Uint8Array): Game {
  if (!dir().exists) dir().create();
  put(romFile(), out);
  if (stock) put(stockFile(), stock);
  const game: Game = { ...made, sha1: sha1(out), from, at: new Date().toISOString() };
  put(infoFile(), JSON.stringify(game));
  return game;
}

// The player's ROM to DAEMONS, kept here. Throws with words the player can act on.
export async function makeGame(onStep: (s: Step) => void = () => {}): Promise<Game | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.length) return null;
  const picked = new File(r.assets[0].uri);
  try {
    onStep("reading");
    const rom = picked.bytesSync();
    onStep("checking");
    await freshPatches();
    const id = sha1(rom), ours = releasedAs(id);
    onStep("keeping");
    if (ours) return keep(rom, { edition: ours.patch.edition, release: ours.release }, r.assets[0].name);
    const { out, edition } = await patched(rom, id, onStep);
    onStep("keeping");
    return keep(out, { edition, release: latestRelease() }, r.assets[0].name, rom);
  } finally {
    try { if (picked.exists) picked.delete(); } catch { /* the picker's own copy in the cache; it goes anyway */ }
  }
}

// The newest DAEMONS made from the original kept here; the save is the companion's and is not touched
export async function updateGame(onStep: (s: Step) => void = () => {}): Promise<Game> {
  const g = heldGame();
  if (!g || !stockFile().exists) throw new Error("Choose your FireRed or LeafGreen again to update.");   // DRAFT
  onStep("reading");
  const rom = stockFile().bytesSync();
  onStep("checking");
  const { out, edition } = await patched(rom, sha1(rom), onStep);
  onStep("keeping");
  return keep(out, { edition, release: latestRelease() }, g.from);
}

// C-216 (the user, 2026-10-28: "I have no way to get debug mode"; by multiple choice, the DEBUG patches stay private):
// the TESTING BUILD, made from the player's original kept here with the DEBUG patch the paired companion holds -- never
// from GitHub. What it offers, or null (none there, or not paired at home).
type DebugPatch = { file: string; edition: Game["edition"]; version: string; source: { sha1: string };
                    target: { sha1: string }; patch: { size: number; sha1: string } };
export async function testingBuilds(): Promise<{ version: string; patches: DebugPatch[] } | null> {
  try { return await api<{ version: string; patches: DebugPatch[] }>("/api/game/debug"); } catch { return null; }
}
export async function makeTestingBuild(onStep: (s: Step) => void = () => {}): Promise<Game> {
  const g = heldGame();
  if (!g || !stockFile().exists) throw new Error("Choose your FireRed or LeafGreen first: the testing build is made from it.");   // DRAFT
  onStep("reading");
  const rom = stockFile().bytesSync(), id = sha1(rom);
  onStep("checking");
  const m = await testingBuilds();
  const p = m?.patches.find((x) => x.source.sha1.toLowerCase() === id.toLowerCase());
  if (!p) throw new Error("The companion has no testing build for this game. Send them to the hub (./syncCompanion.sh debug).");   // DRAFT
  onStep("fetching");
  const { b64 } = await api<{ b64: string }>(`/api/game/debug/file?file=${encodeURIComponent(p.file)}`);
  const patch = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (patch.length !== p.patch.size || sha1(patch) !== p.patch.sha1) throw new Error("The testing build came down damaged. Try again.");   // DRAFT
  onStep("patching");
  const out = applyBps(rom, patch);
  if (sha1(out) !== p.target.sha1) throw new Error("The testing build did not check out. Nothing was kept.");   // DRAFT
  onStep("keeping");
  return keep(out, { edition: p.edition, release: p.version, testing: true }, g.from);
}

// The game made here, forgotten (its save is the companion's and stays)
export function forgetGame() {
  for (const f of [romFile(), infoFile(), stockFile()]) if (f.exists) f.delete();
}
