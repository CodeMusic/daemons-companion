// The hub's only (it keeps files): never imported by core.ts or routes.ts.
// C-335 (the user, 2026-11-11, by multiple choice: "the watch updated from its card"): a new firmware put on the card by
// the hub over Wi-Fi and installed from it, no cable. The hub keeps the newest image of each board (by HELLO's board id:
// t-watch-ultra), handed to it once from this machine or a paired phone (POST /api/firmware?board=&build=, the raw
// .bin); a board asks GET /api/firmware?board= now and then, copies a newer one onto its card (/api/firmware/image), checks
// its SHA-256, and installs it from there when told (POST /api/device/update: the site's or app's UPDATE) -- never by
// itself.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Image = { board: string; build: string; size: number; sha256: string; at: string };
export const boardName = (s: string) => (/^[a-z0-9][a-z0-9-]{1,31}$/.test(s) ? s : "");
// an ESP32 image begins 0xE9 (esp_image_header_t's magic), and the app slot is 6.25 MB in default_16MB.csv
export const MOST = 6_553_600;
export function imageOk(bin: Uint8Array): string | null {
  if (bin.length < 1024) return "that is too small to be a firmware";                 // DRAFT
  if (bin.length > MOST) return "that is larger than the board's app partition";        // DRAFT
  if (bin[0] !== 0xe9) return "that is not an ESP32 firmware image";                    // DRAFT
  return null;
}

export class FirmwareImages {
  constructor(private dir: string) {}
  latest(board: string): Image | null {
    const b = boardName(board);
    if (!b) return null;
    try { return JSON.parse(readFileSync(join(this.dir, `${b}.json`), "utf8")) as Image; } catch { return null; }
  }
  file(board: string): string | null {
    const b = boardName(board), f = b && join(this.dir, `${b}.bin`);
    return f && existsSync(f) && this.latest(b) ? f : null;
  }
  keep(board: string, build: string, bin: Uint8Array, now = new Date()): Image | { error: string } {
    const b = boardName(board);
    if (!b) return { error: "name the board: ?board=t-watch-ultra" };                     // DRAFT
    const bad = imageOk(bin);
    if (bad) return { error: bad };
    mkdirSync(this.dir, { recursive: true });
    const img: Image = { board: b, build: String(build || "").replace(/[^\w .:-]/g, "").slice(0, 40) || now.toISOString().slice(0, 16),
                         size: bin.length, sha256: createHash("sha256").update(bin).digest("hex"), at: now.toISOString() };
    writeFileSync(join(this.dir, `${b}.bin.part`), bin); renameSync(join(this.dir, `${b}.bin.part`), join(this.dir, `${b}.bin`));
    writeFileSync(join(this.dir, `${b}.json.part`), JSON.stringify(img)); renameSync(join(this.dir, `${b}.json.part`), join(this.dir, `${b}.json`));
    return img;
  }
}
