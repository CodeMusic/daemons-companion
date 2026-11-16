#pragma once
// C-381: the companion, asked as every board asks it -- GET /api/device/state with this device's id -- every thirty
// seconds (and at once after anything is done) on a thread of its own, so the screen never waits on the network. The
// hub's address is ~/.config/daemons/hub (one line), or DAEMONS_HUB; "none" asks nothing. What the state holds is read
// with the boards' own names (firmware/esp32/src/state.cpp); the pictures come from /api/device/art as the boards'
// do, fetched again only when a daemon's artKey changes.
#include <memory>
#include <mutex>
#include <string>
#include <vector>
#include "hub/http.h"

// A daemon's picture as a device draws it (server/src/art.ts deviceArt): up to sixteen colours, index 0 clear
struct Sprite { int w = 0, h = 0; uint16_t palette[16] = {}; std::vector<uint8_t> px; };

struct PartyMember {
  std::string name, types, artKey;
  int level = 0, slot = -1;
  std::vector<std::string> routines, routineTypes, routineColours;   // the game's routines, each with its streak's colour
};
struct Heard { std::string id, kind, name, text; int species = 0; };   // C-134: a broadcast in the last ten minutes

struct HubView {
  bool asked = false;                   // an answer (or a failure) has come back at all
  bool reached = false;                 // the last ask was answered
  std::string error;                    // why it was not, in words
  std::string date, edition, season, day, colour = "#5b6b8c", menu = "#5b6b8c", watch, virtue, note;
  long stepId = -1;                     // the ONE next step
  std::string stepText, goal, milestone;
  int msAt = 0, msOf = 0;
  bool carrying = false;                // the daemon carried
  std::string name, nickname, types, category, entry, artKey, word, tired, cue;
  int level = 0, friendship = 0, species = 0, slot = -1, mood = 0;
  int fedToday = 0, fedDue = 0, wateredToday = 0, wateredDue = 0;
  bool trained = false;
  std::string denWall = "#67625a", denDeep = "#3b3832", denFloor = "#2b2924", denGlow = "#e4ded3";   // C-113
  std::vector<PartyMember> party;       // C-68
  std::vector<Heard> heard;             // C-134
};

namespace hub {
void begin(const std::string &deviceId);   // starts the asking
HubView view();                            // a copy of what the hub last said
std::shared_ptr<const Sprite> art(const std::string &artKey);   // the picture fetched for this artKey, or null (not yet)
void refresh();                            // ask again now
std::string address();                     // "" when none is set
void end();

// C-381: what is done on this device, sent as the boards send it; the state is asked for again after. The answer's
// own words (a care's "said") come back in the Reply.
Reply post(const std::string &path, const std::string &json, long timeoutMs = 8000);
std::string deviceId();

// C-380: paired as a phone -- the hub's code typed on the keys (POST /api/pair) gives a key with the whole API, the
// mirror included; kept in ~/.config/daemons/token (only this user may read it), the hub's address beside it
bool paired();
std::vector<std::string> headers();        // this device's id, and the key when paired
std::string pair(const std::string &address, const std::string &code, const std::string &name);   // "" when paired, else why
std::string deviceName();                  // what the hub lists it as
}
