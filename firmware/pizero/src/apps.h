#pragma once
// C-509 (the user, 2026-11-24: "one program, several apps"; "code wise they should be unified with much common code"):
// one program, several apps. Each app is a launcher icon that opens this same program on its own first page
// (`--app ID`), so one install updates them all and they share one pairing, one save and one hub. Inside an app, a
// page's BACK returns to the app's own first page, and BACK there leaves the app (back to the launcher). DAEMONS is the
// whole program as it was, with every page on HOME's row.
#include <string>
#include <vector>
#include "app.h"

struct AppDef {
  const char *id;      // --app ID, and the launcher entry's file name
  const char *name;    // what the launcher shows (DRAFT)
  PageId home;         // the page it opens on
  const char *about;   // one line, for --apps and the launcher's comment (DRAFT)
  bool zeroOnly;       // only where its hardware is (the Cardputer Zero's cap header, its Kit)
};

const std::vector<AppDef> &apps();
const AppDef *appNamed(const std::string &id);   // null when there is none by that id
const AppDef &app();                             // the app this run is (DAEMONS unless --app said otherwise)
void useApp(const AppDef &a);
void goHome();                                   // the app's first page; from there, out of the app
