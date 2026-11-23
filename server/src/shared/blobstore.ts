// C-431: the hub's BLOBS (PRAXIS's, docs/PROJECTS.md 5): each one a file named by its SHA-256, in blobs/ beside the
// database -- blobs/ab/ab12... -- written under a passing name and renamed, so a blob is either whole or not there. The
// same name is always the same bytes, so a blob is written once and served for good (praxissync.ts).
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { HASH, memoryBlobs, type BlobStore } from "@daemons/praxis";

/** a SHA-256 as hex, by Node's own crypto -- the same name the engine's gives, faster */
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** blobs in a folder, each under its hash */
export function folderBlobs(dir: string): BlobStore {
  const at = (h: string) => {
    if (!HASH.test(h)) throw new Error("a blob is named by its SHA-256");
    return join(dir, h.slice(0, 2), h);
  };
  return {
    has: (h) => HASH.test(h) && existsSync(at(h)),
    get: (h) => (HASH.test(h) && existsSync(at(h)) ? new Uint8Array(readFileSync(at(h))) : null),
    put: (h, bytes) => {
      const f = at(h);
      if (existsSync(f)) return;
      mkdirSync(dirname(f), { recursive: true });
      const passing = `${f}.${randomBytes(6).toString("hex")}.part`;
      writeFileSync(passing, bytes);
      renameSync(passing, f);
    },
  };
}

/** the blobs of the companion whose database is `database`: in blobs/ beside it, or in memory for one in memory (tests) */
export const blobsBeside = (database: string): BlobStore =>
  database === ":memory:" ? memoryBlobs() : folderBlobs(join(dirname(database), "blobs"));
