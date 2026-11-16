// C-377: DAEMONS on the Cardputer Zero. The loop: the keys to the page in front, the page's tick (the game's frames),
// and the canvas shown whenever it changed. SIGINT is APPLaunch's five-second press of Home: the save is kept first.
//
//   daemons-zero                       HOME (the device, or a window on a computer)
//   daemons-zero --scale 4             the window bigger
//   daemons-zero --hub http://h:4730   the hub to ask (else ~/.config/daemons/hub; "none" asks nothing)
//   daemons-zero --make FILE.gba       make the game from the player's own ROM, say each step, and stop
//   daemons-zero --rom FILE.gba        play any ROM as it is (a DEBUG build: testing)
//   daemons-zero --page care           start on a page (home, play, make, link, care, step, party, say)
//   daemons-zero --headless --frames N [--press 300:ENTER,420:L] [--shot out.bmp] [--every 100]
//                                      run N frames unseen, keys pressed at those frames, a picture at the end
//                                      (and every 100 frames: out_<frame>.bmp)
//   daemons-zero --bench N             run N frames of the game as fast as it goes and say the frames a second
//   daemons-zero --pair CODE           pair with the hub (--hub, or the one kept) by the code it shows (C-380)
//   daemons-zero --mirror send|read|off  the mirror: send (the device's default), read (a computer's: the hub's copy
//                                      taken, nothing ever written to the hub), off
//   daemons-zero --mirror-in           ask the hub for its copy once, as PLAY does, say what it chose, and stop
//   daemons-zero --send-save           send the save kept here to the hub once (as SEND THE SAVE NOW), and stop
//   daemons-zero --sync                a SYNC, as HOME's: this device's save out, the hub's SYNC, its copy back; and stop
//   daemons-zero --keep-there          C-215's yes: this other game kept on the hub as a save of its own; and stop
#include <algorithm>
#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <map>
#include <string>
#include <thread>

#include "app.h"
#include "canvas.h"
#include "game/rom.h"
#include "hal/hal.h"
#include "hub/hub.h"
#include "hub/mirror.h"
#include "paths.h"
#include "sound.h"

Page *homePage();
Page *playPage();
Page *makePage();
Page *pairPage();
Page *carePage();
Page *stepPage();
Page *partyPage();
Page *sayPage();

Emu emu;
bool held[(size_t)Key::Count];
volatile bool quitting;
bool headless;
static PageId now = PageId::Home;
static bool switched = true;

Page *pageFor(PageId id) {
  switch (id) {
    case PageId::Play: return playPage();
    case PageId::Make: return makePage();
    case PageId::Pair: return pairPage();
    case PageId::Care: return carePage();
    case PageId::Step: return stepPage();
    case PageId::Party: return partyPage();
    case PageId::Say: return sayPage();
    default: return homePage();
  }
}
void go(PageId id) { now = id; switched = true; pageFor(id)->enter(); }
PageId current() { return now; }

void keepSave() {
  if (!emu.loaded()) return;
  Bytes s = emu.save(), kept;
  if (readFile(inData("daemons.sav"), kept) && kept == s) return;
  if (kept.empty() && std::all_of(s.begin(), s.end(), [](uint8_t b) { return b == 0xFF; })) return;   // never saved
  writeFileAtomic(inData("daemons.sav"), s);
}

std::string clockNow() {
  char b[8];
  time_t t = time(nullptr);
  strftime(b, sizeof b, "%H:%M", localtime(&t));
  return b;
}
std::string upper(std::string s) { for (auto &c : s) c = (char)toupper((unsigned char)c); return s; }

void drawBand(const char *title, uint16_t colour) {
  canvas.fillRect(0, 0, hal::W, 14, colour);
  canvas.setFont(&fonts::Font0);
  canvas.setTextSize(1);
  canvas.setTextColor(TFT_WHITE);
  canvas.setCursor(6, 3);
  canvas.print(title);
  hal::Power p = hal::power();
  std::string right = clockNow();
  if (p.percent >= 0) right = std::to_string(p.percent) + (p.charging ? "%+ " : "% ") + right;
  canvas.setCursor(hal::W - 6 - 6 * (int)right.size(), 3);
  canvas.print(right.c_str());
}

int wrap(const std::string &text, int x, int y, int cols, int rowsMax, int lineH) {
  int rows = 0;
  size_t at = 0;
  while (at < text.size() && rows < rowsMax) {
    size_t end = std::min(text.size(), at + cols);
    if (end < text.size()) {
      size_t sp = text.rfind(' ', end);
      if (sp != std::string::npos && sp > at) end = sp;
    }
    std::string line = text.substr(at, end - at);
    if (rows == rowsMax - 1 && end < text.size()) line = line.substr(0, cols - 1) + "~";
    canvas.setCursor(x, y + rows * lineH);
    canvas.print(line.c_str());
    rows++;
    at = end;
    while (at < text.size() && text[at] == ' ') at++;
  }
  return rows;
}

static void onSignal(int) { quitting = true; }

static int bench(int frames) {
  Bytes save;
  std::string why;
  readFile(inData("daemons.sav"), save);
  if (!emu.load(romPath(), save, why)) { fprintf(stderr, "bench: %s\n", why.c_str()); return 1; }
  auto t0 = std::chrono::steady_clock::now();
  for (int i = 0; i < frames; i++) emu.frame(i % 120 < 6 ? 1u << GBA_A : 0);   // A now and then, past the title
  double s = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
  printf("%d frames in %.2f s: %.1f frames a second (the GBA runs 59.7)\n", frames, s, frames / s);
  return 0;
}

int main(int argc, char **argv) {
  int scale = 3, frames = -1, benchFrames = 0, every = 0;
  std::string start = "home", shot, makeFrom, romFrom, hubArg, pairCode;
  bool mirrorIn = false, sendSave = false, syncOnce = false, keepThere = false;
  std::map<uint64_t, std::vector<Key>> presses;
  for (int i = 1; i < argc; i++) {
    std::string a = argv[i];
    auto val = [&]() -> std::string { if (i + 1 >= argc) { fprintf(stderr, "%s needs a value\n", a.c_str()); exit(2); } return argv[++i]; };
    if (a == "--scale") scale = atoi(val().c_str());
    else if (a == "--headless") headless = true;
    else if (a == "--frames") frames = atoi(val().c_str());
    else if (a == "--shot") shot = val();
    else if (a == "--every") every = atoi(val().c_str());
    else if (a == "--page") start = val();
    else if (a == "--make") makeFrom = val();
    else if (a == "--rom") romFrom = val();
    else if (a == "--hub") hubArg = val();
    else if (a == "--bench") benchFrames = atoi(val().c_str());
    else if (a == "--pair") pairCode = val();
    else if (a == "--mirror") {
      std::string m = val();
      mirror::Mode md = mirror::modeByName(m, (mirror::Mode)-1);
      if ((int)md == -1) { fprintf(stderr, "--mirror is send, read or off\n"); return 2; }
      mirror::setMode(md);
    }
    else if (a == "--mirror-in") mirrorIn = true;
    else if (a == "--send-save") sendSave = true;
    else if (a == "--sync") syncOnce = true;
    else if (a == "--keep-there") keepThere = true;
    else if (a == "--press") {
      std::string list = val();
      size_t at = 0;
      while (at < list.size()) {
        size_t comma = list.find(',', at), colon = list.find(':', at);
        std::string part = list.substr(at, comma == std::string::npos ? std::string::npos : comma - at);
        if (colon != std::string::npos && colon < at + part.size()) {
          Key k = keyByName(part.substr(colon - at + 1));
          if (k != Key::None) presses[strtoull(part.c_str(), nullptr, 10)].push_back(k);
          else fprintf(stderr, "--press: no key in %s\n", part.c_str());
        }
        if (comma == std::string::npos) break;
        at = comma + 1;
      }
    } else { fprintf(stderr, "what is %s? (see the top of src/main.cpp)\n", a.c_str()); return 2; }
  }
  if (!hubArg.empty()) setenv("DAEMONS_HUB", hubArg.c_str(), 1);
  signal(SIGINT, onSignal);
  signal(SIGTERM, onSignal);
  gameKeysLoad();

  if (!makeFrom.empty()) {
    try {
      Game g = makeGame(makeFrom, [](const std::string &s) { printf("%s\n", s.c_str()); fflush(stdout); });
      printf("made %s %s (%s) -> %s\n", g.edition.c_str(), g.release.c_str(), g.sha1.c_str(), romPath().c_str());
      return 0;
    } catch (const std::exception &e) { fprintf(stderr, "%s\n", e.what()); return 1; }
  }
  if (!romFrom.empty()) {
    try { Game g = takeAsTesting(romFrom); printf("playing %s as it is (testing, %s)\n", romFrom.c_str(), g.edition.c_str()); }
    catch (const std::exception &e) { fprintf(stderr, "%s\n", e.what()); return 1; }
    if (start == "home") start = "play";
  }
  if (benchFrames > 0) return bench(benchFrames);
  if (const char *m = getenv("DAEMONS_MIRROR")) mirror::setMode(mirror::modeByName(m, mirror::mode()));

  // C-380: pairing and the mirror, one at a time from the command line
  if (!pairCode.empty() || mirrorIn || sendSave || syncOnce || keepThere) {
    hub::begin(hal::deviceId());
    int rc = 0;
    if (!pairCode.empty()) {
      std::string address = hub::address().empty() ? "http://daemons-hearth:4730" : hub::address();
      std::string why = hub::pair(address, pairCode, hub::deviceName());
      if (why.empty()) printf("paired with %s as \"%s\"\n", hub::address().c_str(), hub::deviceName().c_str());
      else { fprintf(stderr, "not paired: %s\n", why.c_str()); rc = 1; }
    }
    if (mirrorIn && rc == 0) {
      Bytes mine;
      readFile(inData("daemons.sav"), mine);
      if (std::all_of(mine.begin(), mine.end(), [](uint8_t b) { return b == 0xFF; })) mine.clear();
      mirror::In in = mirror::pull(mine);
      if (in.took && !writeFileAtomic(inData("daemons.sav"), in.save)) { fprintf(stderr, "the hub's copy could not be kept\n"); rc = 1; }
      printf("mirror in (%s): %s%s%s\n", mirror::modeName(mirror::mode()), in.choice.empty() ? "nothing" : in.choice.c_str(),
             in.why.empty() ? "" : " -- ", in.why.c_str());
      if (in.took) printf("this device's save is now %s\n", sha1Hex(in.save).c_str());
    }
    if (sendSave && rc == 0) {
      Bytes mine;
      if (!readFile(inData("daemons.sav"), mine) || mine.empty()) { fprintf(stderr, "no save kept here\n"); rc = 1; }
      else {
        mirror::Out o = mirror::push(mine);
        printf("send (%s): %s -- %s\n", mirror::modeName(mirror::mode()),
               o.sent ? "sent" : o.kept ? "kept as a save of its own (another game)" : o.otherGame ? "refused, another game" : "not sent", o.why.c_str());
        if (!o.sent && !o.kept) rc = 1;
      }
    }
    if (keepThere && rc == 0) {   // C-215's yes: this game kept on the hub as a save of its own, now and at each save
      Bytes mine;
      readFile(inData("daemons.sav"), mine);
      mirror::keepHere(true);
      mirror::Out o = mirror::keepThere(mine);
      printf("keep there: %s -- %s\n", o.kept ? "kept" : "not kept", o.why.c_str());
      if (!o.kept) rc = 1;
    }
    if (syncOnce && rc == 0) {   // C-380: as HOME's SYNC does it
      Bytes mine;
      readFile(inData("daemons.sav"), mine);
      mirror::Synced s = mirror::syncNow(mine);
      if (s.took) writeFileAtomic(inData("daemons.sav"), s.save);
      printf("sync: %s -- %s (arrived %zu, received %zu, returned %zu)\n", s.ok ? "ran" : "did not run", s.why.c_str(), s.arrived, s.received, s.returned);
      if (s.took) printf("this device's save is now %s\n", sha1Hex(s.save).c_str());
      if (!s.ok) rc = 1;
    }
    hub::end();
    return rc;
  }

  canvasBegin();
  if (!hal::begin(scale, headless)) { fprintf(stderr, "no screen\n"); return 1; }
  if (!headless && !sound::begin()) fprintf(stderr, "sound: none found; the game plays silent\n");
  hub::begin(hal::deviceId());
  const std::map<std::string, PageId> pages{ { "home", PageId::Home }, { "play", PageId::Play }, { "make", PageId::Make }, { "link", PageId::Pair },
                                           { "care", PageId::Care }, { "step", PageId::Step }, { "party", PageId::Party }, { "say", PageId::Say } };
  go(pages.count(start) ? pages.at(start) : PageId::Home);

  auto lastDraw = std::chrono::steady_clock::now();
  uint64_t loops = 0;
  while (!quitting && !hal::closed()) {
    Page *p = pageFor(now);
    KeyEvent e;
    while (hal::poll(e)) {
      held[(size_t)e.key] = e.down;
      p->key(e);
      switched = true;
      p = pageFor(now);
    }
    if (headless) {   // scripted keys, held for six frames each, counted by the game's frames (or by loops on a page)
      uint64_t at = emu.loaded() && now == PageId::Play ? emu.frames() : loops;
      bool want[(size_t)Key::Count] = {};
      for (auto &[f, ks] : presses)
        for (Key k : ks) if (at >= f && at < f + 6) want[(size_t)k] = true;   // a key listed twice presses twice
      for (auto &[f, ks] : presses)
        for (Key k : ks)
          if (want[(size_t)k] != held[(size_t)k]) {
            held[(size_t)k] = want[(size_t)k];
            KeyEvent s{ k, want[(size_t)k], want[(size_t)k] ? keyChar(k, false) : (char)0 };   // what it types, as a key would
            p->key(s);
            switched = true;
            p = pageFor(now);
          }
    }
    p->tick();
    if (headless && every > 0 && !shot.empty() && emu.loaded() && emu.frames() % every == 0 && emu.frames()) {
      p->draw();
      std::string at = shot.substr(0, shot.rfind('.')) + "_" + std::to_string(emu.frames()) + ".bmp";
      canvasShot(at);
    }
    auto t = std::chrono::steady_clock::now();
    if (switched || p->changed() || t - lastDraw > std::chrono::seconds(1)) {
      switched = false;
      p->draw();
      hal::present(canvasPixels());
      lastDraw = t;
    }
    loops++;
    if (headless && frames >= 0 && loops >= (uint64_t)frames) break;   // a pass is a frame while the game plays, unseen
    if (!headless) std::this_thread::sleep_for(std::chrono::milliseconds(now == PageId::Play ? 1 : 8));
    else if (now != PageId::Play) std::this_thread::sleep_for(std::chrono::milliseconds(5));   // the hub has time to answer
  }
  if (!shot.empty()) { pageFor(now)->draw(); if (canvasShot(shot)) printf("picture: %s\n", shot.c_str()); }
  keepSave();   // a save the game had not finished settling is kept as it stands
  mirror::finish(2000);   // the save on its way to the hub gets two seconds (APPLaunch kills three after SIGINT)
  sound::end();
  hub::end();
  hal::end();
  return 0;
}
