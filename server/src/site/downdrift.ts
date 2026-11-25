// C-507 (the user, 2026-11-24, by multiple choice: "downdrift.daemons.codemusic.ca ... you use the same simple interface
// to make your down drift, you can add an mp3 ... and you can save the complete whole file to the hub"): THE DOWNDRIFT
// STUDIO (DRAFT) -- PulseEntrain's Studio carried over as a page of its own at /downdrift/, its files in
// server/downdrift/ (they come with the code, so a deploy brings them). Like THE ENGINE ROOM's (C-330) its files are code
// and hold nothing of the user's; it reads and saves drifts through the API, behind a paired key, on the home network
// and the tailnet only. The public address waits on the user's word (it would put a pairing page on the internet).
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { serveSite } from "./site.js";

export const DOWNDRIFT_DIR = fileURLToPath(new URL("../../downdrift/", import.meta.url));

export const isDowndriftPath = (method: string, path: string) =>
  (method === "GET" || method === "HEAD") && (path === "/downdrift" || path.startsWith("/downdrift/"));

export function serveDowndrift(req: IncomingMessage, res: ServerResponse, path: string) {
  if (path === "/downdrift") { res.writeHead(308, { location: "/downdrift/" }); return res.end(); }
  return serveSite(DOWNDRIFT_DIR, req, res, path.slice("/downdrift".length) || "/", true);
}
