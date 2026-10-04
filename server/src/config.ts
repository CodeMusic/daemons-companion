// The server's settings, from server/config.json (local, never committed -- see config.example.json). Every one has a
// safe default: no save is read until one is named, and no model is called until the AI is switched on.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Edition } from "./seasons.js";

export interface Config {
  port: number;
  host: string;                     // 127.0.0.1: this machine only. 0.0.0.0: the local network too, for a device (C-26)
  database: string;                 // a SQLite file, or ":memory:"
  edition: Edition;                 // which edition's voice and season the daemon keeps
  savePath: string | null;          // a COPY of the DAEMONS save to read -- never the one the game is using
  artDir: string;                   // DAEMONS' own art (gfx/daemons/), served at /art/
  ai: { enabled: boolean; baseUrl: string; model: string; apiKeyEnv: string | null };
}

export const DEFAULTS: Config = {
  port: 4730,
  host: "127.0.0.1",
  database: fileURLToPath(new URL("../companion.sqlite", import.meta.url)),
  edition: "CONTENT",
  savePath: null,
  artDir: fileURLToPath(new URL("../../../DAEMONS/gfx/daemons", import.meta.url)),   // ~/Projects/DAEMONS beside this repo
  ai: { enabled: false, baseUrl: "http://localhost:4000/v1", model: "", apiKeyEnv: null },
};

export function loadConfig(path = fileURLToPath(new URL("../config.json", import.meta.url))): Config {
  if (!existsSync(path)) return DEFAULTS;
  const local = JSON.parse(readFileSync(path, "utf-8"));
  return { ...DEFAULTS, ...local, ai: { ...DEFAULTS.ai, ...(local.ai ?? {}) } };
}
