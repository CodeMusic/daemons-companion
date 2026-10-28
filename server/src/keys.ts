// C-218: the exchange's keys, for the companion's server and THE COMMONS alike -- a token (kept only as its SHA-256), a
// password as scrypt (salted, never kept itself), and a code to read aloud (no 0/O or 1/I). node:crypto: never imported
// by core.ts or routes.ts.
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import type { Keys } from "./exchange.js";

const INVITE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const KEYS: Keys = {
  token: () => randomBytes(24).toString("base64url"),
  hash: (t) => createHash("sha256").update(t).digest("base64url"),
  password(pw) { const salt = randomBytes(16); return `scrypt$${salt.toString("base64url")}$${scryptSync(pw, salt, 32).toString("base64url")}`; },
  check(pw, kept) {
    const [kind, salt, hash] = kept.split("$");
    if (kind !== "scrypt" || !salt || !hash) return false;
    const want = Buffer.from(hash, "base64url"), got = scryptSync(pw, Buffer.from(salt, "base64url"), want.length);
    return got.length === want.length && timingSafeEqual(got, want);
  },
  code: () => Array.from({ length: 8 }, () => INVITE_LETTERS[randomInt(INVITE_LETTERS.length)]).join(""),
};

