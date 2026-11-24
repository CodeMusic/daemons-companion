#pragma once
// C-515 (the user, 2026-11-24, by multiple choice: "GitHub builds, user install"): the program updates itself without a
// password. GitHub builds every board's program at each change (.github/workflows/pizero.yml) into the rolling release
// `pizero`; `--update` reads its manifest.json, takes this board's build, checks its SHA-1, and keeps it in
// <data>/program/<commit>/ with `current` pointing at it and `previous` at the one before. The program the launcher
// starts (the package's) first hops to the kept copy whenever that one was built later (hop()), so the launcher
// entries never change. Going back is `--update back`.
#include <string>

namespace update {
long long built();          // seconds since 1970 when this program was built (version.cpp, written by CMake)
const char *commit();       // the commit it was built from ("local" for a build by hand)
void hop(int argc, char **argv);   // exec the kept copy, if it was built later than this one; else return

struct Offer { bool found = false, newer = false; std::string commit, at, why; };
Offer look();               // what GitHub holds for this board, against what runs here
std::string take();         // fetch it, check it, keep it, make it current: "" when done, else why
std::string back();         // make `previous` current again: "" when done, else why
std::string keptCommit();   // the commit of the kept current copy, "" when none
}
