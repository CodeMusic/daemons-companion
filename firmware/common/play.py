#!/usr/bin/env python3
"""T-426: the game's instrument on the handhelds with keys -- the songs, the keys and their colours from
server/data/play.json (exported by DAEMONS), written for the boards as firmware/common/play.h. What the save holds (the
instrument, whether it is unlocked, which songs are learned or heard) comes in each board's state; this is the rest,
which never changes between saves.

    python3 firmware/common/play.py            report what would change
    python3 firmware/common/play.py --write    write play.h
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, "server", "data", "play.json")
OUT = os.path.join(HERE, "play.h")
PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi(name):
    """'Bb4' -> 70, 'C#5' -> 73 (C4 = 60)"""
    pc = PC[name[0]]; i = 1
    while i < len(name) and name[i] in "#b":
        pc += 1 if name[i] == "#" else -1; i += 1
    return 12 * (int(name[i:]) + 1) + pc


def key_pc(name):
    return midi(name + "4") - 60


def as_header():
    d = json.load(open(SRC))
    lines = [
        "#pragma once",
        "// T-426: the game's songs, keys and colours -- written by firmware/common/play.py from server/data/play.json (do",
        "// not edit by hand). A note is a MIDI number (C4 = 60); a frame is the game's, a sixtieth of a second.",
        "#include <stdint.h>",
        "struct PlaySong { const char *id, *title; uint8_t key; const uint8_t *notes; const uint8_t *frames; uint8_t n; };",
        "static const char *const PLAY_KEYS[12] = { " + ", ".join(json.dumps(k) for k in d["keys"]) + " };",
        "static const uint32_t PLAY_COLOURS[12] = { " + ", ".join("0x" + c[1:].upper() for c in d["key_colours"]) + " };",
        "static const uint32_t PLAY_OUTLINE = 0x%s;" % d["outline"][1:].upper(),
        "static const int PLAY_LISTEN = %d;   // a song is heard from the last this many notes" % d["listen"]["last_notes"],
    ]
    for i, s in enumerate(d["songs"]):
        lines.append("static const uint8_t PLAY_NOTES_%d[] = { %s };" % (i, ", ".join(str(midi(n)) for n in s["notes"])))
        lines.append("static const uint8_t PLAY_FRAMES_%d[] = { %s };" % (i, ", ".join(str(min(255, f)) for f in s["frames"])))
    lines.append("static const PlaySong PLAY_SONGS[] = {")
    for i, s in enumerate(d["songs"]):
        lines.append("  { %s, %s, %d, PLAY_NOTES_%d, PLAY_FRAMES_%d, %d }," % (json.dumps(s["id"]), json.dumps(s["title"]),
                                                                          key_pc(s["key"]), i, i, len(s["notes"])))
    lines.append("};")
    lines.append("static const int PLAY_SONG_N = %d;" % len(d["songs"]))
    return "\n".join(lines) + "\n"


def main():
    text = as_header()
    if os.path.exists(OUT) and open(OUT).read() == text:
        print("play: nothing to change"); return
    if "--write" in sys.argv:
        open(OUT, "w").write(text); print("wrote firmware/common/play.h")
    else:
        print("would write firmware/common/play.h")


if __name__ == "__main__":
    main()
