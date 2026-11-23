#!/usr/bin/env python3
"""C-369: the words the ear must hear -- written to server/data/hotwords.json.

Every daemon's name and every place's name from the game's data, less those that are ordinary English words (FORK, CANON,
PING: heard right already, and a near miss of one is more likely a real word -- "cannon" must not become CANON). The hub
corrects a near miss of one of these after hearing (server/src/machine/hotwords.ts), whatever model heard it, and hands the
list to an ear that takes hotwords. Run with --write to write; without, it says what it would change.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
OUT = os.path.join(DATA, "hotwords.json")
DICT = "/usr/share/dict/words"

def main():
    words = {w.strip().lower() for w in open(DICT)} if os.path.exists(DICT) else set()
    if not words:
        sys.exit("no dictionary at %s: run this on a Mac" % DICT)
    species = json.load(open(os.path.join(DATA, "species.json")))
    maps = json.load(open(os.path.join(DATA, "maps.json")))
    names = {v["name"] for v in (species.values() if isinstance(species, dict) else species) if isinstance(v, dict) and v.get("name")}
    places = {v["place"] for k, v in maps.items() if isinstance(v, dict) and v.get("place")}
    def ordinary(term):   # every word of it is a dictionary word (or a number)
        return all(w.isdigit() or w in words for w in re.findall(r"[a-z0-9]+", term.lower()))
    keep = sorted({t for t in names | places if not ordinary(t) and len(re.sub(r"[^a-z]", "", t.lower())) >= 4})
    out = {"_about": "C-369: the names the ear must hear (server/tools/hotwords.py; never edit by hand). 'said' maps what an "
                     "ear writes for DAEMON to the word itself -- the frightening word is never shown.",
           "said": {"damon": "daemon", "damons": "daemons", "daymon": "daemon", "daymons": "daemons", "day mon": "daemon",
                    "day mons": "daemons", "demon": "daemon", "demons": "daemons", "diamond": None},
           "words": keep}
    out["said"] = {k: v for k, v in out["said"].items() if v}
    text = json.dumps(out, indent=1, ensure_ascii=False) + "\n"
    old = open(OUT).read() if os.path.exists(OUT) else ""
    if text == old:
        return print("hotwords.json: current (%d words)" % len(keep))
    if "--write" not in sys.argv:
        return print("would write hotwords.json (%d words)" % len(keep))
    open(OUT + ".tmp", "w").write(text); os.replace(OUT + ".tmp", OUT)
    print("wrote hotwords.json (%d words)" % len(keep))

if __name__ == "__main__":
    main()
