#pragma once
// C-381 (its first piece): the companion, asked as every board asks it -- GET /api/device/state with this device's id
// -- every thirty seconds on a thread of its own, so the screen never waits on the network. The hub's address is
// ~/.config/daemons/hub (one line), or DAEMONS_HUB; "none" asks nothing. C-380 (the mirror, paired as a phone) is next.
#include <mutex>
#include <string>
#include <vector>

struct HubView {
  bool asked = false;                   // an answer (or a failure) has come back at all
  bool reached = false;                 // the last ask was answered
  std::string error;                    // why it was not, in words
  std::string date, edition, season, day, colour = "#5b6b8c", watch;
  std::string stepText, goal;           // the ONE next step
  bool carrying = false;
  std::string name, nickname, types;    // the daemon carried
  int level = 0, friendship = 0;
};

namespace hub {
void begin(const std::string &deviceId);   // starts the asking
HubView view();                            // a copy of what the hub last said
std::string address();                     // "" when none is set
void end();

// C-380: paired as a phone -- the hub's code typed on the keys (POST /api/pair) gives a key with the whole API, the
// mirror included; kept in ~/.config/daemons/token (only this user may read it), the hub's address beside it
bool paired();
std::vector<std::string> headers();        // this device's id, and the key when paired
std::string pair(const std::string &address, const std::string &code, const std::string &name);   // "" when paired, else why
std::string deviceName();                  // what the hub lists it as
}
