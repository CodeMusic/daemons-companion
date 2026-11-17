#pragma once
// C-379: DAEMONS from the player's own ROM, made on this device -- C-187's rules (app/game/rom.ts), unchanged. The
// player gives their FireRed or LeafGreen once; it is known by its SHA-1 against patches.json, our patch for it comes
// from the release on GitHub and is checked, applied here and the result checked against the release's own SHA-1. The
// player's file is only read; a copy of it, untouched, is kept on this device (never sent anywhere) so a new release is
// made from it with one key. Nothing of Nintendo's is in this program.
// C-395 (the user, 2026-11-17): both games are kept -- CONTENT from FireRed, CONTEXT from LeafGreen -- each as the
// newest release, or as the TESTING build made with the DEBUG patch the paired hub holds (C-216, the app's way), and
// each with a save of its own. One is chosen; PLAY plays it.
//   <data>/games/<key>.gba and .json   the games made        <data>/saves/<key>.sav   each one's save
//   <data>/originals/<sha1>.gba        the player's own       <data>/playing          the key PLAY plays
#include <functional>
#include <string>
#include <vector>

struct Game {
  std::string edition, release, sha1, from;
  bool testing = false;
  std::string key() const;   // "content", "context-testing"
};
// The player's own FireRed or LeafGreen, named as patches.json names it ("Pokemon FireRed (USA) Rev 1")
struct Original { std::string path, sha1, edition, name; };

std::string romPath();                   // the game chosen
std::string savePath();                  // its save
std::string savePathOf(const Game &g);
bool heldGame(Game &g);                  // the game chosen, if there is one
std::vector<Game> heldGames();           // every game kept here, CONTENT first, each release before its testing build
bool chooseGame(const std::string &key); // PLAY plays it now; keep the running game's save and unload it first

std::vector<std::string> originalsFound();   // .gba files where a player would put one (not our own)
std::vector<Original> originals();           // the player's own ROMs: those kept here, then those found, each once

using Step = std::function<void(const std::string &)>;
// Each says what it is doing ("reading", "checking", "fetching", "patching", "keeping") and throws std::runtime_error
// with words the player can act on. None of them chooses the game made.
Game makeGame(const std::string &original, const Step &step);    // the newest release, from that file
Game makeRelease(const std::string &edition, const Step &step);  // the newest release of an edition, from its original
Game makeTesting(const std::string &edition, const Step &step);  // the TESTING build of an edition, from the hub
Game takeAsTesting(const std::string &path);                     // any ROM played as it is (--rom), and chosen

std::string latestRelease(bool online = false);   // as patches.json says (online: as GitHub says now)
// What the paired hub holds for the TESTING builds (C-216): asked at home only; why says why there are none
struct Testing { std::string version, why; std::vector<std::string> editions; };
Testing testingOffered();
