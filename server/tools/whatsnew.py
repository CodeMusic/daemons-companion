#!/usr/bin/env python3
"""C-318: WHAT'S NEW, drawn from history -- every TestFlight build C-210 records, with the commits that went into it.

Each build is paired with the commit it was archived from (C-210's row names it), and the commits between one build and
the next that touched the app or the server are grouped by the ticket they name; the ticket's title (TODO.md) is the
section's header and each commit's subject, its ticket stripped, a line under it. Commits that name no ticket go under
THE GAME when they bring a ROM release, and under ALSO otherwise. Writes server/data/whatsnew.json, which the app and the
hub both read (the app's own build is the newest entry in it when it is bundled).

  python3 server/tools/whatsnew.py                 # report what it would write
  python3 server/tools/whatsnew.py --write         # write it
  python3 server/tools/whatsnew.py --write --build 964   # and a build about to be archived, from HEAD

Run from the companion's root. Every word it writes is the commits' own; the headers are TODO.md's.

C-339, SET UP: a section whose ticket needs setting up carries "setup", copied from server/data/whatsnew_setup.json
(kept by hand, one entry per ticket: title, steps, and optionally needs, where, wiki, book, draft -- that file's
"about" says what each is). WHAT'S NEW shows SET UP › on that section and opens the steps. A release that adds a
device, a server or a setting adds its ticket there before running this; the report names any ticket it holds that
no build mentions.
"""
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "server/data/whatsnew.json"
SETUP = ROOT / "server/data/whatsnew_setup.json"     # C-339: each ticket's setup steps, by hand
PATHS = ["app", "server/src", "server/data"]          # what reaches a build: the app, the rules it runs, its data
FIRST = 930                                           # the first TestFlight build
# C-210 names most builds' commits in its own words; these it names another way
KNOWN = {932: "a449dbc", 951: "0b6a659"}
SKIP = re.compile(r"^(C-210|TODO|TestFlight|README|wiki|LAYOUT)\b|\buploaded\b|\barchived\b", re.I)


def git(*a: str) -> str:
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def builds_from_todo(todo: str) -> dict[int, str]:
    row = next(l for l in todo.splitlines() if l.startswith("| **C-210**"))
    out = {int(m.group(1)): m.group(2) for m in re.finditer(r"\*\*(9\d\d)\*\*[^(]{0,80}?\(([0-9a-f]{7})", row)}
    out.update(KNOWN)
    return dict(sorted(out.items()))


def titles_from_todo(todo: str) -> dict[str, str]:
    t = {}
    for m in re.finditer(r"^\|\s*(?:~~)?\*\*(C-\d+)\*\*(?:~~)?\s*\|\s*\*\*(.+?)\*\*", todo, re.M):
        t[m.group(1)] = re.sub(r"\s+", " ", m.group(2)).strip()
    return t


def tidy(subject: str, ticket: str | None) -> str:
    s = subject
    if ticket:
        s = re.sub(rf"^(?:{ticket}(?:\s*\(\d+\))?[,:]?\s*)+", "", s)
    s = re.sub(r"^(?:C-\d+(?:\s*\(\d+\))?[,:/ ]+)+", "", s)    # further tickets named first
    s = re.sub(r"^patches\.json:\s*", "Knows the game's ROM release ", s)
    s = s.replace("--", "—").strip(" :;")
    return (s[:1].upper() + s[1:]) if s else s


def sections_for(commits: list[tuple[str, str]], titles: dict[str, str]) -> list[dict]:
    by: dict[str, dict] = {}
    for h, subj in commits:
        if SKIP.search(subj):
            continue
        m = re.match(r"^~?~?(C-\d+)", subj)
        if m:
            key = m.group(1)
            head = titles.get(key, key)
        elif re.search(r"patches\.json|ROM release|v11\.\d+", subj):
            key, head = "game", "THE GAME"
        else:
            key, head = "also", "ALSO"
        s = by.setdefault(key, {"ticket": key if key.startswith("C-") else None, "title": head, "lines": []})
        line = tidy(subj, s["ticket"])
        if line and line not in s["lines"]:
            s["lines"].append(line)
    # tickets first, in the order they were first worked on in this build; then the game; then the rest
    order = [k for k in by if k.startswith("C-")] + [k for k in ("game", "also") if k in by]
    out = []
    for k in order:
        s = by[k]
        if k == "game" and len(s["lines"]) > 3:          # many releases: the newest and how many
            s["lines"] = [s["lines"][-1], f"and {len(s['lines']) - 1} earlier game releases known"]
        out.append(s)
    return out or [{"ticket": None, "title": "SMALL FIXES", "lines": ["Nothing new to see: fixes, or what Apple asked for."]}]


def main(argv: list[str]) -> int:
    write = "--write" in argv
    extra = int(argv[argv.index("--build") + 1]) if "--build" in argv else None
    todo = (ROOT / "TODO.md").read_text()
    builds, titles = builds_from_todo(todo), titles_from_todo(todo)
    if extra and extra not in builds:
        builds[extra] = git("rev-parse", "--short", "HEAD").strip()
    nums = sorted(n for n in builds if n >= FIRST)
    entries, prev = [], None
    for n in nums:
        c = builds[n]
        rng = f"{prev}..{c}" if prev else c
        log = git("log", "--no-merges", "--format=%h\t%s", rng, "--", *PATHS) if prev else ""
        commits = [tuple(l.split("\t", 1)) for l in log.splitlines() if "\t" in l][::-1]   # oldest first
        date = git("show", "-s", "--format=%cs", c).strip()
        entries.append({"build": n, "commit": c, "date": date,
                        "sections": sections_for(commits, titles) if prev else
                        [{"ticket": None, "title": "THE FIRST BUILD", "lines": ["The companion on TestFlight for the first time: the iPhone, the iPad and the Mac."]}]})
        prev = c
    entries.reverse()                                    # newest first
    setup = json.loads(SETUP.read_text())["setup"] if SETUP.exists() else {}
    for t, st in setup.items():                          # C-339: a ticket's steps on every section that names it
        if not st.get("title") or not st.get("steps"):
            raise SystemExit(f"whatsnew_setup.json: {t} needs a title and steps")
    used = set()
    for e in entries:
        for s in e["sections"]:
            if s["ticket"] in setup:
                s["setup"] = setup[s["ticket"]]
                used.add(s["ticket"])
    for t in sorted(set(setup) - used):
        print(f"whatsnew_setup.json: {t} is in no build's notes yet")
    data = {"latest": entries[0]["build"], "builds": entries}
    text = json.dumps(data, indent=1, ensure_ascii=False) + "\n"
    was = OUT.read_text() if OUT.exists() else ""
    print(f"{len(entries)} builds, {entries[-1]['build']}..{entries[0]['build']}; "
          f"{sum(len(s['lines']) for e in entries for s in e['sections'])} lines; "
          f"{'unchanged' if text == was else 'would change' if not write else 'written'}")
    if write and text != was:
        OUT.write_text(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
