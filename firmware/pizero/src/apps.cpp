// C-509: the apps one program is (apps.h). Adding one is a row here, its page, and nothing else: tools/make_deb.sh makes
// a launcher entry for every row (`daemons-zero --apps --desktop`).
#include "apps.h"

namespace {
const std::vector<AppDef> kApps = {
  { "daemons", "DAEMONS", PageId::Home, "The game and the companion: your daemon, its care and its steps", false },
  { "engine", "ENGINE ROOM", PageId::Engine, "The hub's own room: its jobs, its site, its devices and its saves", false },
  { "dashboard", "DASHBOARD", PageId::Dashboard, "EUDAIMONIA: what waits on you, the lanes at work, and your answers", false },
  { "account", "ACCOUNT", PageId::Account, "The profile this device plays as, on THE COMMONS", false },
  { "caps", "CAPS", PageId::Caps, "The cap on the header: which it is, and what it can do", true },
  { "talk", "TALK", PageId::Talk, "Talk with the daemon you carry", false },
  { "kit", "KIT", PageId::Kit, "The LLM630 Kit on the back: awake or resting, its cell and its models", true },
};
const AppDef *running = &kApps[0];
}  // namespace

const std::vector<AppDef> &apps() { return kApps; }
const AppDef *appNamed(const std::string &id) {
  for (auto &a : kApps)
    if (id == a.id) return &a;
  return nullptr;
}
const AppDef &app() { return *running; }
void useApp(const AppDef &a) { running = &a; }
void goHome() {
  if (running->home == PageId::Home || current() != running->home) { go(running->home); return; }
  quitting = true;   // BACK on the app's own first page: out of the app, as APPLaunch's long press does (the save kept)
}
