// C-377: DAEMONS on the Cardputer Zero, and since C-457 every Linux board (src/board.h). The loop: the keys to the page in front, the page's tick (the game's frames),
// and the canvas shown whenever it changed. SIGINT is APPLaunch's five-second press of Home: the save is kept first.
//
//   daemons-zero                       HOME (the device, or a window on a computer)
//   daemons-zero --scale 4             the window bigger
//   daemons-zero --hub http://h:4730   the hub to ask (else ~/.config/daemons/hub; "none" asks nothing)
//   daemons-zero --make FILE.gba       make the game from the player's own ROM, say each step, choose it, and stop
//   daemons-zero --make content|context  the newest release of that edition, from the original kept or found (C-395)
//   daemons-zero --make-testing content|context  its TESTING build, from the paired hub's DEBUG patch (C-216, C-395)
//   daemons-zero --game KEY            choose the game PLAY plays: content, context, content-testing, context-testing
//   daemons-zero --games               say every game kept here and every original found, and stop
//   daemons-zero --saved               as if the game had just saved: HOME SYNCs as it is entered (C-397; for checks)
//   daemons-zero --rom FILE.gba        play any ROM as it is (a DEBUG build: testing)
//   daemons-zero --app engine          open as one of its apps (C-509: daemons, engine, dashboard, account, caps, talk, kit)
//   daemons-zero --update check|take|back  this board's newest build on GitHub: say it, or fetch, check and keep it (no
//                                      password; the next start runs it), or go back to the copy before (C-515)
//   daemons-zero --version             when and from what this program was built, and stop
//   daemons-zero --apps [--desktop DIR]  say every app, and with --desktop write a launcher entry for each into DIR; stop
//   daemons-zero --page care           start on a page (home, play, games, link, care, step, party, say)
//   daemons-zero --canvas 360x360@2    draw as a board with that canvas would, shown that many times over (C-593: for
//                                      pictures of a board that is not here; this board's own canvas otherwise)
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
//   daemons-zero --cap cc1101|lora|none  a pretend cap on the header (a computer, or checks): no chip is asked (C-444)
//   daemons-zero --rollcall all        a ROLL CALL on the cap's band: one:ID, some:ID,ID, all or once (C-447, docs/CAPS.md)
//   daemons-zero --answer 60           answer roll calls heard for that many seconds; --antenna 433|915|none, --power DBM
//   daemons-zero --caps                say which cap is fitted and what it offers, and stop (C-444, docs/CAPS.md)
//   daemons-zero --band 315|433|915    set the CC1101's band, read the switch back, listen two seconds, and stop
//   daemons-zero --kit                 the LLM630 Kit on the back: its link, agent, units and models; and stop (C-453)
//   daemons-zero --kit-at HOST:PORT    the Kit to ask (else ~/.config/daemons/kit, else 10.77.0.2:10001; "off")
//   daemons-zero --kit-say "WORDS"     one turn on the Kit by typed words, timed, its voice played; and stop
//   daemons-zero --kit-hear FILE.wav   one turn on the Kit from a 16 kHz mono recording; and stop
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
#include "apps.h"
#include "update.h"
#include "board.h"
#include "canvas.h"
#include "caps/cap.h"
#include "caps/longwave.h"
#include "common/rollcall.h"
#include "game/rom.h"
#include "hal/hal.h"
#include "hub/hub.h"
#include "hub/mirror.h"
#include "kit/kit.h"
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
Page *capsPage();
Page *rollCallPage();
Page *talkPage();
Page *kitPage();
Page *enginePage();
Page *dashboardPage();
Page *accountPage();

Emu emu;
bool held[(size_t)Key::Count];
volatile bool quitting;
bool headless;
bool savedSinceSync;
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
    case PageId::Caps: return capsPage();
    case PageId::RollCall: return rollCallPage();
    case PageId::Talk: return talkPage();
    case PageId::Kit: return kitPage();
    case PageId::Engine: return enginePage();
    case PageId::Dashboard: return dashboardPage();
    case PageId::Account: return accountPage();
    default: return homePage();
  }
}
void go(PageId id) {
  if (id != PageId::Play) hal::game(nullptr, 0, 0, 0, 0, 0);   // C-593: the game's picture leaves the screen with its page
  lay::under = 0;                                               // and the daemon's strip with its own (a page that has one says so as it is drawn)
  now = id;
  switched = true;
  pageFor(id)->enter();
}
PageId current() { return now; }

void keepSave() {
  if (!emu.loaded()) return;
  Bytes s = emu.save(), kept;
  if (readFile(savePath(), kept) && kept == s) return;
  if (kept.empty() && std::all_of(s.begin(), s.end(), [](uint8_t b) { return b == 0xFF; })) return;   // never saved
  writeFileAtomic(savePath(), s);
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
  if (hub::away()) right = "AWAY " + right;   // C-56: the hub reached through the relay   // DRAFT
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
  readFile(savePath(), save);
  if (!emu.load(romPath(), save, why)) { fprintf(stderr, "bench: %s\n", why.c_str()); return 1; }
  auto t0 = std::chrono::steady_clock::now();
  for (int i = 0; i < frames; i++) emu.frame(i % 120 < 6 ? 1u << GBA_A : 0);   // A now and then, past the title
  double s = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
  printf("%d frames in %.2f s: %.1f frames a second (the GBA runs 59.7)\n", frames, s, frames / s);
  return 0;
}

int main(int argc, char **argv) {
  // C-515: say when this program was built and stop (asked of a new one before it is kept); else run the newest kept copy
  if (argc == 2 && !strcmp(argv[1], "--version")) { printf("%lld %s %s\n", update::built(), update::commit(), board::ID); return 0; }
  update::hop(argc, argv);
  int scale = 3, frames = -1, benchFrames = 0, every = 0;
  std::string start = "home", shot, makeFrom, makeTestingOf, gameKey, romFrom, hubArg, pairCode, canvasArg;
  bool listGames = false, listCaps = false, kitStatus = false, listApps = false;
  std::string updateWhat;   // C-515: check, take or back
  std::string desktopDir;
  std::string kitSay, kitHear;
  std::string bandArg, antennaArg, powerArg, rollcallArg;   // C-444, C-447
  int answerFor = 0;
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
    else if (a == "--canvas") canvasArg = val();
    else if (a == "--app") {   // C-509: which app this run is
      const AppDef *ap = appNamed(val());
      if (!ap) { fprintf(stderr, "no app by that name: daemons-zero --apps\n"); return 2; }
      useApp(*ap);
      start = "";
    }
    else if (a == "--apps") listApps = true;
    else if (a == "--update") updateWhat = val();
    else if (a == "--desktop") desktopDir = val();
    else if (a == "--make") makeFrom = val();
    else if (a == "--rom") romFrom = val();
    else if (a == "--make-testing") makeTestingOf = val();
    else if (a == "--game") gameKey = val();
    else if (a == "--games") listGames = true;
    else if (a == "--saved") savedSinceSync = true;   // as if the game had just saved: HOME SYNCs on entering
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
    else if (a == "--cap") caps::pretend(val());
    else if (a == "--caps") listCaps = true;
    else if (a == "--band") bandArg = val();
    else if (a == "--antenna") antennaArg = val();
    else if (a == "--power") powerArg = val();
    else if (a == "--rollcall") rollcallArg = val();
    else if (a == "--answer") answerFor = atoi(val().c_str());
    else if (a == "--kit") kitStatus = true;
    else if (a == "--kit-at") setenv("DAEMONS_KIT", val().c_str(), 1);
    else if (a == "--kit-say") kitSay = val();
    else if (a == "--kit-hear") kitHear = val();
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
  {   // C-593: the canvas is this board's own; --canvas draws as another board's would
    int cw = board::CANVAS_W, ch = board::CANVAS_H, over = 0;
    if (!canvasArg.empty() && (sscanf(canvasArg.c_str(), "%dx%d@%d", &cw, &ch, &over) < 2 || cw < 320 || ch < 170)) {
      fprintf(stderr, "--canvas is WxH, or WxH@N for a screen N times its size: 320x170 at least\n");
      return 2;
    }
    if (canvasArg.empty()) hal::canvasSize(cw, ch, board::SCREEN_W, board::SCREEN_H);
    else hal::canvasSize(cw, ch, cw * std::max(1, over), ch * std::max(1, over));
  }
  signal(SIGINT, onSignal);
  signal(SIGTERM, onSignal);
  gameKeysLoad();

  auto say = [](const std::string &s) { printf("%s\n", s.c_str()); fflush(stdout); };
  auto editionOf = [](std::string k) { for (auto &c : k) c = (char)toupper((unsigned char)c); return k; };
  if (!bandArg.empty() && bandArg != "315" && bandArg != "433" && bandArg != "915") {
    fprintf(stderr, "--band is 315, 433 or 915 (868 is never offered: docs/CAPS.md)\n");
    return 2;
  }
  if (!antennaArg.empty()) {   // C-447: which antenna is on the cap's connector, as the user says
    if (antennaArg == "433") caps::setAntenna(caps::Antenna::A433);
    else if (antennaArg == "915" || antennaArg == "868/915") caps::setAntenna(caps::Antenna::A868915);
    else if (antennaArg == "315") caps::setAntenna(caps::Antenna::A315);
    else if (antennaArg == "none") caps::setAntenna(caps::Antenna::None);
    else { fprintf(stderr, "--antenna is 315, 433, 915 or none\n"); return 2; }
    printf("antenna said to be on: %s\n", caps::antennaName(caps::antenna()));
    if (!listCaps && bandArg.empty() && rollcallArg.empty() && !answerFor) return 0;
  }
  if (!powerArg.empty()) { longwave::setPower(atoi(powerArg.c_str())); printf("roll call power: %d dBm\n", longwave::power()); }
  if (!rollcallArg.empty() || answerFor > 0) {   // C-447: a roll call, or answering, from the command line (over SSH)
    const caps::Found &f = caps::find();
    if (!bandArg.empty()) caps::setBand(bandArg == "915" ? caps::Band::B915 : bandArg == "315" ? caps::Band::B315 : caps::Band::B433);
    printf("cap: %s; band %s MHz; antenna %s; power %d dBm; key %s; this is %s (%04X)\n", f.kind == caps::Kind::None ? "none" : f.name.c_str(),
           caps::bandName(caps::band()), caps::antennaName(caps::antenna()), longwave::power(), longwave::keyName().c_str(), longwave::myName().c_str(), longwave::me());
    if (answerFor > 0) {
      if (!longwave::setAnswering(true)) { printf("may not send on this band, so it cannot answer: %s\n", longwave::mayCall().c_str()); return 1; }
      printf("answering for %d s\n", answerFor);
      fflush(stdout);
      for (auto t0 = std::chrono::steady_clock::now(); !quitting && std::chrono::steady_clock::now() - t0 < std::chrono::seconds(answerFor);) {
        std::string l = longwave::tick();
        if (!l.empty()) { printf("  %s\n", l.c_str()); fflush(stdout); }
        else std::this_thread::sleep_for(std::chrono::microseconds(500));
      }
      printf("answered %d\n", longwave::answeredCount());
      return 0;
    }
    std::string m = rollcallArg.substr(0, rollcallArg.find(':'));
    uint8_t mode = m == "one" ? rollcall::ONE : m == "some" ? rollcall::SOME : m == "all" ? rollcall::ALL : m == "once" ? rollcall::ONCE : 255;
    if (mode == 255) { fprintf(stderr, "--rollcall is one:ID, some:ID,ID, all or once\n"); return 2; }
    std::vector<uint16_t> to;
    if (rollcallArg.find(':') != std::string::npos) {
      std::string ids = rollcallArg.substr(rollcallArg.find(':') + 1);
      for (size_t at = 0; at < ids.size();) {
        size_t c = ids.find(',', at);
        to.push_back((uint16_t)strtoul(ids.substr(at, c == std::string::npos ? std::string::npos : c - at).c_str(), nullptr, 16));
        at = c == std::string::npos ? ids.size() : c + 1;
      }
    }
    longwave::Result r = longwave::call(mode, to);
    if (!r.sent) { printf("no call: %s\n", r.why.c_str()); return 1; }
    printf("call %u (%s): %d of %d packets sent at %d dBm\n", r.call, rollcall::modeName(mode), r.packets, rollcall::CALL_PACKETS, r.power);
    for (auto &a : r.answers)
      printf("  %-8s %04X slot %d: here %d dBm, there %d dBm, heard %d of %d\n", a.name.c_str(), a.id, a.slot, a.here, a.there, a.heard, a.of);
    printf("  %zu answered; noise %d, other households %d, broken %d\n", r.answers.size(), r.noise, r.strangers, r.broken);
    return 0;
  }
  if (listCaps || !bandArg.empty()) {   // C-444: the cap, from the command line (over SSH, for checks)
    const caps::Found &f = caps::find();
    printf("cap: %s%s%s\n", f.kind == caps::Kind::None ? "none" : f.name.c_str(), f.detail.empty() ? "" : " -- ", f.detail.c_str());
    if (!f.why.empty()) printf("  note: %s\n", f.why.c_str());
    for (auto &o : f.offers) printf("  offers %s (%s): %s\n", o.type.c_str(), o.raw.c_str(), o.state.c_str());
    if (!bandArg.empty()) {
      caps::Band b = bandArg == "315" ? caps::Band::B315 : bandArg == "915" ? caps::Band::B915 : caps::Band::B433;
      bool ok = caps::setBand(b);
      printf("band %s\n  %s\n", ok ? "set" : "NOT set", caps::bandCheck().c_str());
      int lo = 0, hi = -200, sum = 0, n = 0;
      for (auto t0 = std::chrono::steady_clock::now(); std::chrono::steady_clock::now() - t0 < std::chrono::seconds(2); n++) {
        int r = caps::rssiDbm();
        lo = n ? std::min(lo, r) : r; hi = std::max(hi, r); sum += r;
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
      }
      printf("  heard %d samples: quietest %d dBm, loudest %d, mean %d\n", n, lo, hi, n ? sum / n : 0);
      printf("  antenna said to be on: %s; may transmit here: %s (only ROLL CALL does)\n", caps::antennaName(caps::antenna()),
             caps::mayTransmit(b) ? "yes" : "no");
      if (!ok) return 1;
    }
    return 0;
  }
  if (kitStatus) return kit::cliStatus();   // C-453: over SSH, for checks
  if (!kitSay.empty() || !kitHear.empty()) {
    bool speak = sound::begin();
    int rc = kitSay.empty() ? kit::cliHear(kitHear, speak) : kit::cliSay(kitSay, speak);
    sound::end();
    return rc;
  }
  if (!updateWhat.empty()) {   // C-515
    printf("running: built %lld from %s%s\n", update::built(), update::commit(), getenv("DAEMONS_HOPPED") ? " (the kept copy)" : "");
    if (updateWhat == "back") { std::string w = update::back(); printf("%s\n", w.empty() ? "back to the copy before" : w.c_str()); return w.empty() ? 0 : 1; }
    update::Offer o = update::look();
    if (!o.found) { printf("%s\n", o.why.c_str()); return 1; }
    printf("GitHub: %s built %s -- %s\n", o.commit.substr(0, 12).c_str(), o.at.c_str(), o.newer ? "newer than this" : "this is it");
    if (updateWhat != "take" || !o.newer) return 0;
    std::string w = update::take();
    printf("%s\n", w.empty() ? "kept, and current: the next start runs it" : w.c_str());
    return w.empty() ? 0 : 1;
  }
  if (listApps) {   // C-509: every app, and a launcher entry for each (tools/make_deb.sh writes them into the .deb)
    for (auto &a : apps()) {
      if (a.zeroOnly && std::string(board::ID) != "cardputer-zero" && !(a.home == PageId::Caps && board::RADIOS)) continue;   // C-514
      printf("%-8s %-12s %s\n", a.id, a.name, a.about);
      if (desktopDir.empty()) continue;
      std::string path = desktopDir + "/daemons" + (std::string(a.id) == "daemons" ? "" : std::string("-") + a.id) + ".desktop";
      FILE *f = fopen(path.c_str(), "w");
      if (!f) { fprintf(stderr, "cannot write %s\n", path.c_str()); return 1; }
      fprintf(f, "[Desktop Entry]\nName=%s\nComment=%s\nExec=/usr/share/APPLaunch/bin/daemons-zero%s%s\n"
                 "Icon=share/images/daemons_100.png\nTerminal=false\nType=Application\n",
              a.name, a.about, std::string(a.id) == "daemons" ? "" : " --app ", std::string(a.id) == "daemons" ? "" : a.id);
      fclose(f);
    }
    return 0;
  }
  if (listGames) {
    Game now;
    bool any = heldGame(now);
    for (const Game &g : heldGames())
      printf("%-16s %-10s %s%s\n", g.key().c_str(), g.release.c_str(), g.sha1.c_str(), any && g.key() == now.key() ? "  (chosen)" : "");
    for (const Original &o : originals()) printf("original %-8s %s  %s\n", o.edition.c_str(), o.name.c_str(), o.path.c_str());
    return 0;
  }
  if (!makeFrom.empty() || !makeTestingOf.empty()) {
    try {
      if (!makeTestingOf.empty()) hub::begin(hal::deviceId());
      Game g = !makeTestingOf.empty() ? makeTesting(editionOf(makeTestingOf), say)
               : (makeFrom == "content" || makeFrom == "context") ? makeRelease(editionOf(makeFrom), say)
               : makeGame(makeFrom, say);
      chooseGame(g.key());
      printf("made %s %s%s (%s) -> %s\n", g.edition.c_str(), g.release.c_str(), g.testing ? " TESTING" : "", g.sha1.c_str(), romPath().c_str());
      if (!makeTestingOf.empty()) hub::end();
      return 0;
    } catch (const std::exception &e) { fprintf(stderr, "%s\n", e.what()); return 1; }
  }
  if (!gameKey.empty() && !chooseGame(gameKey)) { fprintf(stderr, "no game %s is kept here (--games lists them)\n", gameKey.c_str()); return 1; }
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
      readFile(savePath(), mine);
      if (std::all_of(mine.begin(), mine.end(), [](uint8_t b) { return b == 0xFF; })) mine.clear();
      mirror::In in = mirror::pull(mine);
      if (in.took && !writeFileAtomic(savePath(), in.save)) { fprintf(stderr, "the hub's copy could not be kept\n"); rc = 1; }
      printf("mirror in (%s): %s%s%s\n", mirror::modeName(mirror::mode()), in.choice.empty() ? "nothing" : in.choice.c_str(),
             in.why.empty() ? "" : " -- ", in.why.c_str());
      if (in.took) printf("this device's save is now %s\n", sha1Hex(in.save).c_str());
    }
    if (sendSave && rc == 0) {
      Bytes mine;
      if (!readFile(savePath(), mine) || mine.empty()) { fprintf(stderr, "no save kept here\n"); rc = 1; }
      else {
        mirror::Out o = mirror::push(mine);
        printf("send (%s): %s -- %s\n", mirror::modeName(mirror::mode()),
               o.sent ? "sent" : o.kept ? "kept as a save of its own (another game)" : o.otherGame ? "refused, another game" : "not sent", o.why.c_str());
        if (!o.sent && !o.kept) rc = 1;
      }
    }
    if (keepThere && rc == 0) {   // C-215's yes: this game kept on the hub as a save of its own, now and at each save
      Bytes mine;
      readFile(savePath(), mine);
      mirror::keepHere(true);
      mirror::Out o = mirror::keepThere(mine);
      printf("keep there: %s -- %s\n", o.kept ? "kept" : "not kept", o.why.c_str());
      if (!o.kept) rc = 1;
    }
    if (syncOnce && rc == 0) {   // C-380: as HOME's SYNC does it
      Bytes mine;
      readFile(savePath(), mine);
      mirror::Synced s = mirror::syncNow(mine);
      if (s.took) writeFileAtomic(savePath(), s.save);
      printf("sync: %s -- %s (arrived %zu, received %zu, returned %zu)\n", s.ok ? "ran" : "did not run", s.why.c_str(), s.arrived, s.received, s.returned);
      for (auto &a : s.arrivals) printf("  received (%s) %s, species %d, from %s\n", a.kind.c_str(), a.nickname.c_str(), a.species, a.from.empty() ? "-" : a.from.c_str());
      if (!s.carried.empty()) printf("  %s is carried by this device now\n", s.carried.c_str());
      for (auto &w : s.refused) printf("  refused: %s\n", w.c_str());
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
  kit::begin();   // C-453: the Kit on the back, asked on a thread of its own
  caps::find();   // C-444: once at start; a cap is never fitted while the Zero is on
  const std::map<std::string, PageId> pages{ { "home", PageId::Home }, { "play", PageId::Play }, { "make", PageId::Make }, { "games", PageId::Make }, { "link", PageId::Pair },
                                           { "care", PageId::Care }, { "step", PageId::Step }, { "party", PageId::Party }, { "say", PageId::Say },
                                           { "caps", PageId::Caps }, { "rollcall", PageId::RollCall }, { "talk", PageId::Talk }, { "kit", PageId::Kit }, { "engine", PageId::Engine }, { "dashboard", PageId::Dashboard }, { "account", PageId::Account } };
  go(pages.count(start) ? pages.at(start) : app().home);   // C-509: --page, else the app's own first page

  auto lastDraw = std::chrono::steady_clock::now();
  uint64_t loops = 0;
  while (!quitting && !hal::closed()) {
    Page *p = pageFor(now);
    KeyEvent e;
    while (hal::poll(e)) {
      held[(size_t)e.key] = e.down;
      if (!board::forPage(e, held, now == PageId::Play)) continue;   // C-457: a pad read as the pages' keys
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
            if (board::forPage(s, held, now == PageId::Play)) p->key(s);
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
  kit::end();
  sound::end();
  hub::end();
  hal::end();
  return 0;
}
