// C-138: the BOX-3's faces as the server draws them -- each daemon in every voice phase, both frames, the whole screen.
//
//   npx tsx tools/boxface.ts OUT.png codemusai caremusai ...              awake, every phase, a row a daemon
//   npx tsx tools/boxface.ts --as asleep OUT.png codemusai                in another expression (asleep wakes to answer)
//   npx tsx tools/boxface.ts --mouths faces.suggested.json OUT.png NAME   with the mouths a file suggests, for checking
//
// It draws with the server's own renderFace, so what it shows is what the board is sent.
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { den } from "../src/dens.js";
import { EXPRESSIONS, faceOf, type Face } from "../src/expressions.js";
import { FRAMES, PHASES, SCREEN, renderFace } from "../src/face.js";
import speciesJson from "../data/species.json" with { type: "json" };
import { canvas, png } from "./png.js";

const argv = process.argv.slice(2);
const opt = (k: string) => { const i = argv.indexOf(k); return i < 0 ? null : argv.splice(i, 2)[1]; };
const as = opt("--as") ?? "awake", mouths = opt("--mouths");
const [out, ...names] = argv;
if (!out || !names.length || !EXPRESSIONS[as]) { console.error("usage: tsx tools/boxface.ts [--as NAME] [--mouths FILE] OUT.png NAME..."); process.exit(64); }
const suggested: Record<string, Face> = mouths ? JSON.parse(readFileSync(mouths, "utf8")) : {};
const typesOf = (art: string) => (Object.values(speciesJson as Record<string, any>).find((r) => r?.art?.front?.endsWith(`/${art}_front.png`))?.types ?? []) as string[];

const GAP = 8, W = SCREEN.w / 2, H = SCREEN.h / 2;     // each screen at half size
const c = canvas(PHASES.length * (W + GAP) + GAP, names.length * FRAMES * (H + GAP) + GAP);
names.forEach((name, row) => {
  const sprite = readFileSync(new URL(`../data/art/${name}.png`, import.meta.url));
  const checked = faceOf(name), face = suggested[name]?.mouth ? { ...(checked ?? suggested[name]), mouth: suggested[name].mouth } : checked;
  PHASES.forEach((phase, col) => {
    for (let f = 0; f < FRAMES; f++) {
      const shot = decodeRgbPng(renderFace(sprite, EXPRESSIONS[as], face, den(typesOf(name)), phase, f));
      const ox = GAP + col * (W + GAP), oy = GAP + (row * FRAMES + f) * (H + GAP);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.put(ox + x, oy + y, [...shot.subarray(((y * 2) * SCREEN.w + x * 2) * 3, ((y * 2) * SCREEN.w + x * 2) * 3 + 3)]);
    }
  });
});
writeFileSync(out, png(c.w, c.h, c.rgb));
console.log(`${out}: ${names.length} daemons x ${PHASES.join(", ")} x ${FRAMES} frames, as ${as}`);

// renderFace's own PNG back to RGB (unfiltered rows, as encodeRgb writes them)
function decodeRgbPng(buf: Buffer): Uint8Array {
  let at = 8; const idat: Buffer[] = [];
  while (at < buf.length) { const len = buf.readUInt32BE(at), type = buf.toString("latin1", at + 4, at + 8); if (type === "IDAT") idat.push(buf.subarray(at + 8, at + 8 + len)); at += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)), rgb = new Uint8Array(SCREEN.w * SCREEN.h * 3);
  for (let y = 0; y < SCREEN.h; y++) raw.copy(rgb, y * SCREEN.w * 3, y * (SCREEN.w * 3 + 1) + 1, (y + 1) * (SCREEN.w * 3 + 1));
  return rgb;
}
