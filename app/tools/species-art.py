#!/usr/bin/env python3
"""C-111: write app/art/speciesArt.ts -- every daemon's front sprite in server/data/art/, by its file name, as Metro needs it:
a static require() for each (a bundler cannot follow a name built at run time). Run again when DAEMONS exports new art.

C-310: only the daemons' own pictures, read from species.json -- the books', the cards' and the marks' share the folder
and are fetched when asked for, never bundled -- and each seasonal form of the MUSAI branch (art/species/<name>_<season>.png)."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "server", "data")
ART = os.path.join(DATA, "art")
species = json.load(open(os.path.join(DATA, "species.json"), encoding="utf-8"))
rows = [r for k, r in species.items() if not k.startswith("_") and isinstance(r, dict)]
fronts = {r["art"]["front"].split("/")[-1].replace("_front.png", "") for r in rows if (r.get("art") or {}).get("front")}
names = sorted(n for n in fronts if os.path.exists(os.path.join(ART, n + ".png")))
seasonal = sorted({f["art"][:-4] for r in rows for f in (r.get("seasons") or {}).values() if f.get("art")
                   and os.path.exists(os.path.join(ART, f["art"]))})                     # "species/musai_winter", ...
keys = names + [s.split("/")[-1] for s in seasonal]
assert len(keys) == len(set(keys)), "a seasonal form shares a daemon's art name"
lines = ["// Written by app/tools/species-art.py -- do not edit. C-111: each daemon's front sprite, by its art name, for a phone",
         "// hosting on its own (local.ts paints its streaks as the server does); C-310: and each seasonal form, by its own name.",
         "export const SPECIES_ART: Record<string, number> = {"]
lines += [f'  {json.dumps(n)}: require("../../server/data/art/{n}.png"),' for n in names]
lines += [f'  {json.dumps(s.split("/")[-1])}: require("../../server/data/art/{s}.png"),' for s in seasonal]
lines += ["};", ""]
out = os.path.join(HERE, "..", "art", "speciesArt.ts")
tmp = out + ".tmp"
open(tmp, "w").write("\n".join(lines))
os.replace(tmp, out)
print(f"speciesArt.ts: {len(names)} daemons, {len(seasonal)} seasonal forms")
