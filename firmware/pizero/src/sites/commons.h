#pragma once
// C-513: ACCOUNTS and THE COMMONS from the device (docs/ACCOUNTS.md). A device joins one profile with the eight-letter
// code its guardian makes in the app (POST /accounts/device/join), and keeps the token it is given in
// ~/.config/daemons/profile-token (only this user may read it); after that it asks as that profile (x-daemons-profile).
// The commons' address is ~/.config/daemons/commons (one line), else what the paired hub says it is linked to
// (GET /api/commons), so a device needs nothing typed but the code. Until api.daemons.codemusic.ca opens (C-278) that
// is the tailnet's.
#include <string>
#include "hub/http.h"

namespace commons {
std::string address();                       // "" when none is known
bool joined();                               // a profile's token is kept
std::string join(const std::string &code);   // "" when joined, else why
void leave();                                // the token forgotten here (the guardian revokes it in the app)
Reply get(const std::string &path, long timeoutMs = 10000);
Reply post(const std::string &path, const std::string &json, long timeoutMs = 10000);
}
