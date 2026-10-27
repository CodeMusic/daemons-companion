// C-187: which of our patches a player's ROM takes -- by its SHA-1, against server/data/patches.json (the game lane's
// export, T-453: every release's four patches, the retail ROM each accepts and the ROM it makes). FireRed makes
// CONTENT, LeafGreen CONTEXT; 1.0 and Rev 1 each have their own patch. No node: imports -- this runs on the phone.
import patchesJson from "../../data/patches.json" with { type: "json" };

export type Patch = { edition: "CONTENT" | "CONTEXT"; file: string; url: string;
  source: { game: string; region: string; revision: string; name: string; sha1: string; crc32: string };
  target: { sha1: string; crc32: string }; patch: { size: number; sha1: string } };
type Release = { version: string; tag: string; patches: Patch[] };
type Data = { latest: string; releases: Release[] };
let DATA = patchesJson as unknown as Data;
// The list as published now (the app fetches it from this repository on GitHub), in place of the one built in --
// taken only if it has the shape, and never one older than the built-in list
export function usePatches(fresh: unknown): boolean {
  const d = fresh as Data;
  if (!d || typeof d.latest !== "string" || !Array.isArray(d.releases) || !d.releases.some((r) => r.version === d.latest)) return false;
  const n = (v: string) => v.split(".").map(Number);
  const [a, b] = [n(d.latest), n(DATA.latest)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) { if ((a[i] ?? 0) < (b[i] ?? 0)) return false; break; }
  DATA = d;
  return true;
}

export const latestRelease = () => DATA.latest;
export function releaseOf(name = DATA.latest): Release | null {
  const v = name.replace(/^v/, "");
  return DATA.releases.find((r) => r.version === v) ?? null;
}
// The patch this ROM takes in the release asked for (the latest by default), or null -- a ROM we do not know, or one
// already patched, is never guessed at.
export function patchFor(romSha1: string, release = DATA.latest): Patch | null {
  return releaseOf(release)?.patches.find((p) => p.source.sha1.toLowerCase() === romSha1.toLowerCase()) ?? null;
}
// Whether these bytes are one of our releases already (a DAEMONS ROM brought in as it is)
export function releasedAs(romSha1: string): { release: string; patch: Patch } | null {
  for (const r of DATA.releases) for (const p of r.patches) if (p.target.sha1.toLowerCase() === romSha1.toLowerCase()) return { release: r.version, patch: p };
  return null;
}
