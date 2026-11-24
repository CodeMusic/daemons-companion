#!/usr/bin/env python3
"""C-506 (the user, 2026-11-24, by multiple choice): REVERIE's starter library of drifts -- PulseEntrain's programs
(the user's own, github.com/CodeMusic/PulseEntrain, public), each a `.imed` v2 session (its docs/SESSION_FORMAT.md),
carried into server/data/drifts/ for the hub to serve (server/src/machine/drifts.ts).

    python3 server/tools/import_drifts.py PULSEENTRAIN/imedsAssets --tinctures PRIVATE.json [--write]

Each session keeps its timeline (entrainment), its binaural carrier and beds, its strength and length; its picture
(meta.image, base64) and any embedded music are left behind -- the hub's own art and music go with a reverie instead.
Its light and stimulation blocks (nova, pulsetto) are kept and ignored here.

THE PHARMACY becomes TINCTURES, each named by how it feels: the names and lines are read from a PRIVATE file (the
DAEMONS author's docs/private/reverie-tinctures.json, never committed), stem -> [id, NAME, line]. Nothing written here
carries the stem it came from; the run fails if one would. Every name and line DRAFT.
"""
import argparse, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "data", "drifts"))
# PulseEntrain's folders -> REVERIE's kinds (docs/REVERIE.md): sleep, meditation, nature, tinctures
KIND = {"Dream Chill": "sleep", "Pharmacy": "tinctures"}
GROUP = {"Pharmacy": "TINCTURES"}


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def load(path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("assets")
    ap.add_argument("--tinctures", required=True)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    tinct = {k: v for k, v in load(a.tinctures).items() if not k.startswith("_")}
    drifts, problems = {}, []
    for group in sorted(os.listdir(a.assets)):
        gdir = os.path.join(a.assets, group)
        if not os.path.isdir(gdir):
            continue
        for name in sorted(os.listdir(gdir)):
            if not name.endswith(".imedx"):
                continue
            stem, d = name[:-6], load(os.path.join(gdir, name))
            meta = dict(d.get("meta") or {})
            meta.pop("image", None)
            meta.pop("rating", None)
            meta.pop("playCount", None)
            audio = dict(d.get("audio") or {})
            audio.pop("music", None)
            gen = d.get("generation") or {}
            if group == "Pharmacy":
                if stem not in tinct:
                    problems.append(f"{group}/{name}: no tincture named for it in {a.tinctures}")
                    continue
                did, title, line = tinct[stem]
                meta.update(name=title, description=line, category=GROUP[group])
                gen = {"source": gen.get("source"), "from": "PulseEntrain"}
            else:
                did = slug(f"{group}-{stem}")
                meta["category"] = group
                gen = {"source": gen.get("source"), "from": "PulseEntrain"}
            out = {"formatVersion": d.get("formatVersion", 2), "id": did, "kind": KIND.get(group, "meditation"),
                   "meta": meta, "generation": gen, "entrainment": d["entrainment"], "audio": audio}
            for k in ("nova", "pulsetto"):
                if k in d:
                    out[k] = d[k]
            if did in drifts:
                problems.append(f"{group}/{name}: id {did} twice")
            drifts[did] = out
    # nothing written may carry the stem a tincture came from
    for did, d in drifts.items():
        if d["kind"] != "tinctures":
            continue
        text = json.dumps(d).lower()
        for stem in tinct:
            for word in {stem.lower(), stem.lower().replace("_", " "), stem.lower().replace("_", "-")}:
                if len(word) > 3 and word in text:
                    problems.append(f"{did}: still carries '{word}'")
    if problems:
        print("\n".join(problems), file=sys.stderr)
        sys.exit(1)
    index = sorted(({"id": i, "name": d["meta"].get("name", i), "kind": d["kind"], "group": d["meta"].get("category"),
                     "description": d["meta"].get("description", ""), "durationSec": d["meta"].get("durationSec"),
                     "strength": d["meta"].get("strength")} for i, d in drifts.items()),
                   key=lambda r: (r["kind"], r["group"] or "", r["name"]))
    kinds = {}
    for r in index:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    print(f"{len(index)} drifts: " + ", ".join(f"{k} {n}" for k, n in sorted(kinds.items())))
    if not a.write:
        print("(report only: --write to write server/data/drifts/)")
        return
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(".json"):
            os.remove(os.path.join(OUT, f))
    for did, d in drifts.items():
        with open(os.path.join(OUT, f"{did}.json"), "w") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
            f.write("\n")
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
