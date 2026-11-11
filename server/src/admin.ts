// C-330 (the user, 2026-11-11: "we will have a lot of admin sort of functionality, so what do u think about making a
// seperate admin site for all of this ... or perhaps we just add it as a web-app to the phone so we do not have 2 ios
// apps to manage"): THE ENGINE ROOM (DRAFT) -- the hub's admin, one installable web app at /admin/, its files in
// server/admin/ (they come with the code, so a deploy brings them; no site export needed). Like the site's (C-170) its
// files are code and hold nothing of the user's; everything it shows comes from the API, behind a paired key. It is on
// the home network and the tailnet only (the user, 2026-11-11): never through the relay, as THE EXCHANGE is not (C-222).
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { serveSite } from "./site.js";

export const ADMIN_DIR = fileURLToPath(new URL("../admin/", import.meta.url));

export const isAdminPath = (method: string, path: string) =>
  (method === "GET" || method === "HEAD") && (path === "/admin" || path.startsWith("/admin/"));

// /admin is /admin/ (its manifest, worker and pages are named relative to it); every path in it is a file of the app's,
// and a path with no extension is the app's own page
export function serveAdmin(req: IncomingMessage, res: ServerResponse, path: string) {
  if (path === "/admin") { res.writeHead(308, { location: "/admin/" }); return res.end(); }
  return serveSite(ADMIN_DIR, req, res, path.slice("/admin".length) || "/", true);
}

// The API's admin requests the app moved here (C-330): refused through the relay, so the house is run from home or the
// tailnet only. The app's own player requests stay as they were.
export const ADMIN_HOME_ONLY: ((method: string, path: string) => boolean)[] = [
  (m, p) => m === "GET" && p === "/api/casino",                   // C-158: THE HOUSE
  (m, p) => m === "POST" && p === "/api/devices/forget",          // a device forgotten
  (m, p) => m === "POST" && p === "/api/commons",                 // C-222: this home linked to the commons, or not
];
