#!/usr/bin/env python3
"""C-134: the things a daemon can do for every other daemon at once -- a broadcast. A board without a keyboard chooses
one of these instead of typing; every daemon that receives one answers it, once, with its reply (and a reply is never
answered). Every word here is DRAFT.

One list feeds every place that sends or shows them:

    server/data/acts.json       the server, the app, the site and the Tab5
    firmware/common/acts.h      the handhelds

    python3 firmware/common/acts.py            report what would change
    python3 firmware/common/acts.py --write    write both files
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
JSON_OUT = os.path.join(ROOT, "server", "data", "acts.json")
H_OUT = os.path.join(HERE, "acts.h")

# code (short, sent on the air), what the sender chooses, what everyone sees ("{name} ..."), and the reply they see
# ("{name} ...") when another daemon answers it. Codes are never reused: a board not yet updated shows an unknown code
# as the code itself.
ACTS = [
    ("WAVE",  "WAVE",            "waves to everyone",          "waves back"),
    ("BOW",   "BOW",             "bows",                       "bows in return"),
    ("HUM",   "HUM A TUNE",      "hums a tune",                "hums along"),
    ("DANCE", "DANCE",           "dances",                     "dances too"),
    ("BERRY", "SHARE A BERRY",   "shares a berry",             "takes it, and is glad"),
    ("GLOW",  "GLOW",            "glows",                      "glows back"),
    ("CALL",  "CALL OUT",        "calls out to every daemon",  "answers the call"),
    ("REST",  "SETTLE TO REST",  "settles down to rest",       "curls up nearby"),
    ("CHEER", "CHEER",           "cheers",                     "cheers with it"),
    ("PLAY",  "INVITE TO PLAY",  "wants to play",              "joins in"),
]


def as_json():
    return json.dumps({"acts": [{"code": c, "label": l, "seen": s, "reply": r} for c, l, s, r in ACTS]}, indent=1) + "\n"


def as_header():
    lines = [
        "#pragma once",
        "// The things a daemon can do for every other daemon -- written by firmware/common/acts.py (do not edit by hand).",
        "struct Act { const char *code, *label, *seen, *reply; };",
        "static const Act ACTS[] = {",
    ]
    lines += ["  { %s, %s, %s, %s }," % tuple(json.dumps(v) for v in a) for a in ACTS]
    lines += ["};", "static const int ACT_N = %d;" % len(ACTS)]
    return "\n".join(lines) + "\n"


def main():
    write = "--write" in sys.argv
    changed = 0
    for path, text in ((JSON_OUT, as_json()), (H_OUT, as_header())):
        if os.path.exists(path) and open(path).read() == text:
            continue
        changed += 1
        print(("wrote " if write else "would write ") + os.path.relpath(path, ROOT))
        if write:
            with open(path, "w") as f:
                f.write(text)
    if not changed:
        print("acts: nothing to change")


if __name__ == "__main__":
    main()
