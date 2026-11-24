#!/usr/bin/env python3
"""C-506 (the user, 2026-11-24, by multiple choice): REVERIE's starter library of drifts -- PulseEntrain's programs
(the user's own, github.com/CodeMusic/PulseEntrain, public), each a `.imed` v2 session (its docs/SESSION_FORMAT.md),
carried into server/data/drifts/ for the hub to serve (server/src/machine/drifts.ts).

    python3 server/tools/import_drifts.py PULSEENTRAIN/imedsAssets --names PRIVATE.json [--write]

Each session keeps its timeline (entrainment), its binaural carrier and beds, its strength and length; its picture
(meta.image, base64) and any embedded music are left behind -- the hub's own art and music go with a reverie instead.
Its light and stimulation blocks (nova, pulsetto) are kept and ignored here.

C-551 (the user, 2026-11-24): EVERY drift renamed and sorted into REVERIE's kinds -- SLEEP, MEDITATION, TINCTURES (NATURE
has none yet) -- from a PRIVATE file (never committed; it names the originals): "Folder/stem" -> [id, NAME, hover line,
kind, on the phone]. A TINCTURE is named for its effect, with only a quiet nod to what it was; nothing written here
carries a Pharmacy file's stem, and the run fails if one would. The phone's few (three of each kind) are also written
together as phone.json, which the app carries for when no hub answers. Every name and line DRAFT.
"""
import argparse, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "data", "drifts"))
# PulseEntrain's folders -> REVERIE's kinds (docs/REVERIE.md): sleep, meditation, nature, tinctures


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def load(path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("assets")
    ap.add_argument("--names", required=True)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    names = {k: v for k, v in load(a.names).items() if not k.startswith("_")}
    pharmacy = set()
    drifts, phone, problems = {}, [], []
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
            key = f"{group}/{stem}"
            if group == "Pharmacy":
                pharmacy.add(stem)
            if key not in names:
                problems.append(f"{key}: no name for it in {a.names}")
                continue
            did, title, line, kind, on_phone = names[key]
            meta.update(name=title, description=line, category=kind.upper())
            gen = {"source": gen.get("source"), "from": "PulseEntrain"}
            if on_phone:
                phone.append(did)
            out = {"formatVersion": d.get("formatVersion", 2), "id": did, "kind": kind,
                   "meta": meta, "generation": gen, "entrainment": d["entrainment"], "audio": audio}
            for k in ("nova", "pulsetto"):
                if k in d:
                    out[k] = d[k]
            if did in drifts:
                problems.append(f"{group}/{name}: id {did} twice")
            drifts[did] = out
    # nothing written may carry the stem a Pharmacy file came from
    for did, d in drifts.items():
        text = json.dumps(d).lower()
        for stem in pharmacy:
            for word in {stem.lower(), stem.lower().replace("_", " "), stem.lower().replace("_", "-")}:
                if len(word) > 3 and word in text:
                    problems.append(f"{did}: still carries '{word}'")
    if problems:
        print("\n".join(problems), file=sys.stderr)
        sys.exit(1)
    index = sorted(({"id": i, "name": d["meta"].get("name", i), "kind": d["kind"], "group": d["meta"].get("category"),
                     "description": d["meta"].get("description", ""), "durationSec": d["meta"].get("durationSec"),
                     "strength": d["meta"].get("strength"), "phone": i in phone} for i, d in drifts.items()),
                   key=lambda r: (r["kind"], r["group"] or "", r["name"]))
    kinds = {}
    for r in index:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    print(f"{len(index)} drifts: " + ", ".join(f"{k} {n}" for k, n in sorted(kinds.items())) + f"; on the phone {len(phone)}")
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
    # the phone's own few, whole, for when no hub answers (app/sound/phoneDrifts.ts)
    with open(os.path.join(OUT, "phone.json"), "w") as f:
        json.dump([drifts[i] for i in sorted(phone)], f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
