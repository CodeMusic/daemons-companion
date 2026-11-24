// C-342 (the user, 2026-11-11: the site reaches the hub by itself): every push to main builds the companion's site on
// GitHub (.github/workflows/site.yml) and puts it on the repository's `site` release -- site.tar.gz and site-commit.txt.
// The hub asks for site-commit.txt every quarter of an hour (and when THE ENGINE ROOM says UPDATE NOW), and when it names
// a build it does not have, fetches the build into <siteDir>-release/<commit>/, beside the site a computer may still send
// (./syncCompanion.sh site, into siteDir). The newer of the two is served. Node only: imported by api.ts alone.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
export const SITE_RELEASE = process.env.DAEMONS_SITE_RELEASE ?? "https://github.com/CodeMusic/daemons-companion/releases/download/site";
const releaseRoot = (siteDir: string) => `${siteDir.replace(/\/+$/, "")}-release`;
const commitOf = (dir: string) => { try { return readFileSync(join(dir, "site-commit.txt"), "utf8").trim() || null; } catch { return null; } };
const builtAt = (dir: string) => { try { return statSync(join(dir, "index.html")).mtimeMs; } catch { return 0; } };

// the release builds kept here, newest first
function releases(siteDir: string): string[] {
  const root = releaseRoot(siteDir);
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((d) => /^[0-9a-f]{7,40}$/.test(d) && existsSync(join(root, d, "index.html")))
    .map((d) => join(root, d)).sort((a, b) => builtAt(b) - builtAt(a));
}
// the folder to serve: the newest release build, or the site a computer sent if that one is newer
export function siteNow(siteDir: string): string {
  const r = releases(siteDir)[0];
  return r && builtAt(r) >= builtAt(siteDir) ? r : siteDir;
}
export type SiteView = { serving: "release" | "sent" | "none"; commit: string | null; at: string | null; latest: string | null;
                         checked: string | null; error: string | null; fetching: boolean };
const last: { latest: string | null; checked: string | null; error: string | null; fetching: boolean } = { latest: null, checked: null, error: null, fetching: false };
export function siteView(siteDir: string | null): SiteView {
  if (!siteDir) return { serving: "none", commit: null, at: null, ...last };
  const dir = siteNow(siteDir), t = builtAt(dir);
  return { serving: !t ? "none" : dir === siteDir ? "sent" : "release", commit: commitOf(dir), at: t ? new Date(t).toISOString() : null, ...last };
}

// ask the release which build it holds; fetch it when it is not here. Never throws: what went wrong is kept for the view.
export async function siteUpdate(siteDir: string | null, get: typeof fetch = fetch): Promise<SiteView> {
  if (!siteDir || last.fetching) return siteView(siteDir);
  last.fetching = true; last.error = null;
  try {
    const r = await get(`${SITE_RELEASE}/site-commit.txt`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`the release said ${r.status}`);
    const commit = (await r.text()).trim();
    if (!/^[0-9a-f]{7,40}$/.test(commit)) throw new Error("the release names no build");
    last.latest = commit; last.checked = new Date().toISOString();
    const root = releaseRoot(siteDir), dest = join(root, commit);
    if (existsSync(join(dest, "index.html"))) return siteView(siteDir);
    mkdirSync(root, { recursive: true });
    const tmp = join(root, `.${commit}.part`), tar = join(root, `.${commit}.tar.gz`);
    rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp);
    const t = await get(`${SITE_RELEASE}/site.tar.gz`, { signal: AbortSignal.timeout(180000) });
    if (!t.ok) throw new Error(`the build said ${t.status}`);
    writeFileSync(tar, Buffer.from(await t.arrayBuffer()));
    await run("tar", ["-xzf", tar, "-C", tmp]);
    rmSync(tar, { force: true });
    if (!existsSync(join(tmp, "index.html"))) throw new Error("the build has no index.html");
    if (commitOf(tmp) !== commit) throw new Error("the build is still being uploaded -- asked again in a quarter of an hour");
    renameSync(tmp, dest);
    for (const old of releases(siteDir).slice(2)) rmSync(old, { recursive: true, force: true });   // two kept: this and the last
  } catch (e) {
    last.error = (e as Error).message; last.checked = new Date().toISOString();
  } finally { last.fetching = false; }
  return siteView(siteDir);
}
