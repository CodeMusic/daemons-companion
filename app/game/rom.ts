// C-187: DAEMONS from the player's own ROM, made on this device (docs/ONEAPP.md). The player gives their FireRed or
// LeafGreen once, from Files; it is known by its SHA-1 (server/data/patches.json), our patch for it is fetched from the
// release on GitHub and checked, applied here (server/src/game/bps.ts) and the result checked against the release's own
// SHA-1. The ROM made is kept in the app's documents (game/); the player's file is only read, never changed or kept.
// A DAEMONS ROM already made (one of our releases) is taken as it is. Nothing of Nintendo's is in the app.
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import { applyBps } from "../../server/src/game/bps";
import { sha1 } from "../../server/src/game/hash";
import { latestRelease, patchFor, releasedAs, type Patch } from "../../server/src/game/patches";

export type Game = { edition: "CONTENT" | "CONTEXT"; release: string; sha1: string; from: string; at: string };

const dir = () => new Directory(Paths.document, "game");
const romFile = () => new File(dir(), "daemons.gba");
const infoFile = () => new File(dir(), "game.json");
function put(f: File, bytes: Uint8Array | string) { if (!f.exists) f.create(); f.write(bytes); }

// The game this device holds, or null
export function heldGame(): Game | null {
  const f = infoFile();
  if (!f.exists || !romFile().exists) return null;
  try { return JSON.parse(f.textSync()) as Game; } catch { return null; }
}
export const romUri = () => romFile().uri;
export const romBytes = () => romFile().bytesSync();

// What each step is doing, for the screen to say
export type Step = "reading" | "checking" | "fetching" | "patching" | "keeping";

// The player's ROM to DAEMONS, kept here. Throws with words the player can act on.
export async function makeGame(onStep: (s: Step) => void = () => {}): Promise<Game | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.length) return null;
  const picked = new File(r.assets[0].uri);
  try {
    onStep("reading");
    const rom = picked.bytesSync();
    onStep("checking");
    const id = sha1(rom);
    let out: Uint8Array, made: { edition: Game["edition"]; release: string };
    const ours = releasedAs(id);
    if (ours) { out = rom; made = { edition: ours.patch.edition, release: ours.release }; }
    else {
      const p: Patch | null = patchFor(id);
      if (!p) throw new Error("That file is not a ROM DAEMONS knows. It takes FireRed or LeafGreen (USA, 1.0 or Rev 1), "
                             + "unchanged -- the .gba you own.");   // DRAFT
      onStep("fetching");
      const res = await fetch(p.url);
      if (!res.ok) throw new Error(`The patch did not come down (${res.status}). Is this device online?`);   // DRAFT
      const patch = new Uint8Array(await res.arrayBuffer());
      if (patch.length !== p.patch.size || sha1(patch) !== p.patch.sha1) throw new Error("The patch came down damaged. Try again.");   // DRAFT
      onStep("patching");
      out = applyBps(rom, patch);
      if (sha1(out) !== p.target.sha1) throw new Error("The patched game did not check out. Nothing was kept.");   // DRAFT
      made = { edition: p.edition, release: latestRelease() };
    }
    onStep("keeping");
    if (!dir().exists) dir().create();
    put(romFile(), out);
    const game: Game = { ...made, sha1: sha1(out), from: r.assets[0].name, at: new Date().toISOString() };
    put(infoFile(), JSON.stringify(game));
    return game;
  } finally {
    try { if (picked.exists) picked.delete(); } catch { /* the picker's own copy in the cache; it goes anyway */ }
  }
}

// The game made here, forgotten (its save is the companion's and stays)
export function forgetGame() {
  for (const f of [romFile(), infoFile()]) if (f.exists) f.delete();
}
