// The server's settings, from server/config.json (local, never committed -- see config.example.json). Every one has a
// safe default: no save is read until one is named, and no model is called until the AI is switched on.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Edition } from "./seasons.js";

export interface Config {
  port: number;
  database: string;                 // a SQLite file, or ":memory:"
  edition: Edition;                 // which edition's voice and season the daemon keeps
  savePath: string | null;          // a COPY of the DAEMONS save to read -- never the one the game is using
  ai: { enabled: boolean; baseUrl: string; model: string; apiKeyEnv: string | null };
}

export const DEFAULTS: Config = {
  port: 4730,
  database: fileURLToPath(new URL("../companion.sqlite", import.meta.url)),
  edition: "CONTENT",
  savePath: null,
  ai: { enabled: false, baseUrl: "http://localhost:4000/v1", model: "", apiKeyEnv: null },
};

export function loadConfig(path = fileURLToPath(new URL("../config.json", import.meta.url))): Config {
  if (!existsSync(path)) return DEFAULTS;
  const local = JSON.parse(readFileSync(path, "utf-8"));
  return { ...DEFAULTS, ...local, ai: { ...DEFAULTS.ai, ...(local.ai ?? {}) } };
}
