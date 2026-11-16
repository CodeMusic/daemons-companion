#pragma once
// C-378: where the program keeps what is its own. The game and its save are the device's (docs/ONEAPP.md: the
// device's save is the real one); DAEMONS_HOME moves all of it -- a test runs on a copy, never on the player's own.
#include <string>
#include "game/hash.h"

std::string dataDir();     // ~/.local/share/daemons: the game, the player's original, the save, patches.json
std::string configDir();   // ~/.config/daemons: the hub's address, the keys
std::string inData(const std::string &name);
std::string inConfig(const std::string &name);

bool readFile(const std::string &path, Bytes &out);
bool readText(const std::string &path, std::string &out);
bool writeFileAtomic(const std::string &path, const Bytes &bytes);   // a temporary file, then renamed over
bool writeTextAtomic(const std::string &path, const std::string &text);
bool exists(const std::string &path);
