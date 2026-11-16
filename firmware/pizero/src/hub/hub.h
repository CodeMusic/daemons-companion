#pragma once
// C-381 (its first piece): the companion, asked as every board asks it -- GET /api/device/state with this device's id
// -- every thirty seconds on a thread of its own, so the screen never waits on the network. The hub's address is
// ~/.config/daemons/hub (one line), or DAEMONS_HUB; "none" asks nothing. C-380 (the mirror, paired as a phone) is next.
#include <mutex>
#include <string>

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
}
