#pragma once
// C-379: DAEMONS from the player's own ROM, made on this device -- C-187's rules (app/game/rom.ts), unchanged. The
// player gives their FireRed or LeafGreen once; it is known by its SHA-1 against patches.json, our patch for it comes
// from the release on GitHub and is checked, applied here and the result checked against the release's own SHA-1. The
// player's file is only read; a copy of it, untouched, is kept beside the game (on their own device, never sent
// anywhere) so a new release is made from it with one key. Nothing of Nintendo's is in this program.
#include <functional>
#include <string>
#include <vector>

struct Game { std::string edition, release, sha1, from; bool testing = false; };

std::string romPath();                              // the game this device plays: <data>/daemons.gba
bool heldGame(Game &g);                             // the game held, if there is one
std::vector<std::string> originalsFound();          // .gba files where a player would put one (not our own)
// Makes the game; `step` is told what it is doing ("reading", "checking", "fetching", "patching", "keeping");
// throws std::runtime_error with words the player can act on
Game makeGame(const std::string &original, const std::function<void(const std::string &)> &step);
Game takeAsTesting(const std::string &path);        // any ROM, played as it is (a DEBUG build: C-216's testing)
std::string latestRelease();                        // as patches.json says now
