#!/usr/bin/env python3
"""C-111: write app/speciesArt.ts -- every daemon's front sprite in server/data/art/, by its file name, as Metro needs it:
a static require() for each (a bundler cannot follow a name built at run time). Run again when DAEMONS exports new art."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "..", "..", "server", "data", "art")
names = sorted(f[:-4] for f in os.listdir(ART) if f.endswith(".png"))
lines = ["// Written by app/tools/species-art.py -- do not edit. C-111: each daemon's front sprite, by its art name, for a phone",
         "// hosting on its own (local.ts paints its streaks as the server does).",
         "export const SPECIES_ART: Record<string, number> = {"]
lines += [f'  {json.dumps(n)}: require("../server/data/art/{n}.png"),' for n in names]
lines += ["};", ""]
open(os.path.join(HERE, "..", "speciesArt.ts"), "w").write("\n".join(lines))
print(f"speciesArt.ts: {len(names)} daemons")
