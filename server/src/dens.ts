// C-113: a daemon's den -- where it is drawn on every device that hosts it (the widget first; the app, the boards and
// the Tab5 to follow). A den is its type's place: the colour is the type's own, as the game colours its sprites
// (DAEMONS' tools/gbasprite.py TYPE_COLOR), and the motif is the type's metaphor -- FLOW moves, STRATUM is layered,
// LEGACY is a cairn. No words: a den says nothing, it is only somewhere to be. A second type tints the floor.
// Each device draws the motif itself, so this is a description and never a picture. Pure, so a phone runs it too (C-111).

export type Motif = "nest" | "waves" | "specks" | "grass" | "rings" | "embers" | "cairn" | "drips" | "carrier"
                  | "strata" | "grid" | "plates" | "flecks" | "facets" | "box" | "fog" | "streaks";

const TYPES: Record<string, { rgb: [number, number, number]; motif: Motif }> = {
  VECTOR:   { rgb: [206,  70,  70], motif: "streaks" },   // air, moving through
  ENTROPY:  { rgb: [222, 158,  46], motif: "embers" },
  LATENT:   { rgb: [ 92,  70, 118], motif: "fog" },
  FROZEN:   { rgb: [166, 206, 222], motif: "flecks" },
  CONTENT:  { rgb: [198, 188, 168], motif: "nest" },      // the undifferentiated one: only somewhere soft
  LOGIC:    { rgb: [ 96, 122, 158], motif: "grid" },
  CORRUPT:  { rgb: [ 84,  92,  52], motif: "drips" },     // something gone off
  STRATUM:  { rgb: [158, 122,  78], motif: "strata" },
  LEGACY:   { rgb: [130, 130, 138], motif: "cairn" },
  SWARM:    { rgb: [128, 148,  72], motif: "specks" },
  FLOW:     { rgb: [ 70, 106, 176], motif: "waves" },
  GROWTH:   { rgb: [ 92, 158,  96], motif: "grass" },
  SIGNAL:   { rgb: [ 86, 190, 190], motif: "carrier" },   // a carrier, not a spark
  CONTEXT:  { rgb: [176,  86, 158], motif: "rings" },
  EMERGENT: { rgb: [ 53, 125, 110], motif: "facets" },
  HARDENED: { rgb: [196, 170,  96], motif: "plates" },
  OPAQUE:   { rgb: [ 40,  40,  46], motif: "box" },       // a box you cannot see into
};

const hex = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const shade = (c: number[], k: number) => c.map((v) => v * k);
const tint = (c: number[], k: number) => c.map((v) => v + (255 - v) * k);

// The den's four colours, as #rrggbb: `wall` over `deep` (top to bottom), the `floor` it stands on, and `glow`, the
// light tone the motif and the light behind the daemon are drawn in. An unknown type is CONTENT's.
export function den(types: string[]) {
  const first = TYPES[types[0]] ?? TYPES.CONTENT, second = TYPES[types[1]] ?? first;
  const dark = first.rgb.reduce((a, b) => a + b) < 200;            // OPAQUE: lift it, or the den is only black
  const base = dark ? tint(first.rgb, 0.12) : first.rgb;
  return { type: TYPES[types[0]] ? types[0] : "CONTENT", motif: first.motif,
           wall: hex(shade(base, 0.52)), deep: hex(shade(base, 0.30)),
           floor: hex(shade(second.rgb.map((v, i) => (v + base[i]) / 2), 0.22)),
           glow: hex(tint(base, 0.55)) };
}
