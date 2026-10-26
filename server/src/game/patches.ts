// C-187: which of our patches a player's ROM takes -- by its SHA-1, against server/data/patches.json (the game lane's
// export, T-453: every release's four patches, the retail ROM each accepts and the ROM it makes). FireRed makes
// CONTENT, LeafGreen CONTEXT; 1.0 and Rev 1 each have their own patch. No node: imports -- this runs on the phone.
import patchesJson from "../../data/patches.json" with { type: "json" };

export type Patch = { edition: "CONTENT" | "CONTEXT"; file: string; url: string;
  source: { game: string; region: string; revision: string; name: string; sha1: string; crc32: string };
  target: { sha1: string; crc32: string }; patch: { size: number; sha1: string } };
type Release = { version: string; tag: string; patches: Patch[] };
const DATA = patchesJson as unknown as { latest: string; releases: Release[] };

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
