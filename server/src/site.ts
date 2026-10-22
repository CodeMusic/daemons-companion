// C-170 (the user, 2026-10-22, through the hub session): the companion's site from the companion itself, so it opens
// anywhere on the home network and over the tailnet (http://coremp135:4730), not only on the computer that runs Metro.
// config.json's siteDir names the exported site; every GET that is not the API's (/api/, /art/, /ollama/) is a file in
// it, and a path with no extension is the app's own (index.html). The files are the app's code and hold nothing of the
// user's, so they need no key; what the site then asks of the API needs a paired key, as a phone's does.
import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".map": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webp": "image/webp", ".ttf": "font/ttf", ".otf": "font/otf",
  ".woff": "font/woff", ".woff2": "font/woff2", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
  ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json",
};

export const isSitePath = (method: string, path: string) =>
  (method === "GET" || method === "HEAD") && !/^\/(api|art|ollama)(\/|$)/.test(path);

// The file `path` names under `dir`, or null: never a step out of it, never a folder.
export function siteFile(dir: string, path: string): string | null {
  let rel: string;
  try { rel = decodeURIComponent(path); } catch { return null; }
  if (rel.includes("\0")) return null;
  const root = resolve(dir), file = resolve(root, "." + (rel.endsWith("/") ? rel + "index.html" : rel));
  if (file !== root && !file.startsWith(root + sep)) return null;
  try { return statSync(file).isFile() ? file : null; } catch { return null; }
}

export function serveSite(dir: string, req: IncomingMessage, res: ServerResponse, path: string) {
  let file = siteFile(dir, path);
  if (!file && !extname(path)) file = siteFile(dir, "/index.html");           // the app's own routes
  if (!file || !existsSync(file)) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("not found"); }
  const index = file.endsWith(`${sep}index.html`);
  res.writeHead(200, {
    "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    // the page itself always asked again (a new export reaches the next visit); its hashed bundles kept a year
    "cache-control": index ? "no-cache" : /[.-][0-9a-f]{8,}\./i.test(file) ? "public, max-age=31536000, immutable" : "public, max-age=3600",
    "x-content-type-options": "nosniff",
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}
