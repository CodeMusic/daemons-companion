#pragma once
// C-511: EUDAIMONIA, the site where PRAXIS's work is seen (daemons-eudaimonia), asked from the device. Its board and its
// tickets are read by anyone; answering a ticket that waits on the user needs the user signed in. The device signs in
// as a browser does, by name and password typed on its keys, and keeps the session the site gives (thirty days) in
// ~/.config/daemons/eudaimonia-session, which only this user may read. The site's address is
// ~/.config/daemons/eudaimonia (one line), else the tailnet's http://roverbyteseer:4741.
#include <string>
#include "hub/http.h"

namespace eudaimonia {
std::string address();
bool signedIn();                                     // a session is kept (the site may still have ended it)
std::string signIn(const std::string &name, const std::string &password);   // "" when signed in, else why
void signOut();
Reply get(const std::string &path, long timeoutMs = 10000);
Reply post(const std::string &path, const std::string &json, long timeoutMs = 10000);
std::string jsonString(const std::string &s);        // s as a JSON string, quoted and escaped
}
