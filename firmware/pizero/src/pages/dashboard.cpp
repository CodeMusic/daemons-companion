// C-511: THE DASHBOARD on the Linux devices -- EUDAIMONIA's board (src/sites/eudaimonia.h): what waits on the user, the
// lanes at work and each project's count, read by anyone; a waiting ticket answered once the user has signed in. Three
// rooms along the top, Z C (or the arrows) between them:
//   WAITING   the tickets that wait on the user; ENTER opens one: its words, and its choices (Z C) answered with ENTER
//   LANES     each lane, its daemon, and the ticket it is on now
//   PROJECTS  each project's open, working and closed
// S signs in (or out); R asks again; UP DOWN scroll; ESC goes back. Every word DRAFT.
#include <ArduinoJson.h>

#include <chrono>
#include <cstring>
#include <future>
#include <string>
#include <vector>

#include "app.h"
#include "apps.h"
#include "canvas.h"
#include "hal/hal.h"
#include "pages/parts.h"
#include "sites/eudaimonia.h"

namespace {
const uint16_t SOFT = 0xC639, DIM = 0x8432, WARN = 0xFD20, GOOD = 0x6E8F;
const uint16_t BAND = 0x4A2F;   // the dashboard's own colour: dusk violet

struct Row { std::string left, right, id; uint16_t colour = SOFT; };
const char *kRooms[] = { "WAITING", "LANES", "PROJECTS" };
const int kCount = 3;

std::string str(JsonVariantConst v, const char *fallback = "") { return v.is<const char *>() ? v.as<const char *>() : fallback; }

struct Dashboard : Page {
  int room = 0, sel = 0, top = 0;
  std::future<Reply> asking;
  enum class Asked { Board, Ticket, Answer, SignIn } what = Asked::Board;
  std::vector<Row> rows;
  std::string why, told;
  // an open ticket
  std::string ticketId, ticketTitle, ticketWords;
  std::vector<std::string> choices;
  int choice = 0;
  bool answerable = false;
  // signing in
  bool signing = false, onPassword = false;
  std::string name, password;

  void askBoard() {
    rows.clear(); why.clear(); sel = top = 0;
    what = Asked::Board;
    asking = std::async(std::launch::async, [] { return eudaimonia::get("/api/board"); });
  }
  void enter() override { told.clear(); ticketId.clear(); signing = false; askBoard(); }

  void readBoard(const JsonDocument &d) {
    JsonVariantConst b = d["board"];
    if (b.isNull()) { why = str(d["why"], "The site keeps no board yet."); return; }
    if (room == 0) {
      for (JsonVariantConst t : b["waiting"].as<JsonArrayConst>())
        rows.push_back({ str(t["id"]) + " " + upper(str(t["title"])), upper(str(t["status"])), str(t["id"]), WARN });
      if (rows.empty()) why = "Nothing waits on you.";                                                     // DRAFT
    } else if (room == 1) {
      for (JsonVariantConst l : b["lanes"].as<JsonArrayConst>()) {
        JsonArrayConst working = l["working"].as<JsonArrayConst>();
        std::string on = working.size() ? str(working[0]["id"]) : "", lane = upper(str(l["lane"]));
        std::string daemon = str(l["daemonName"]);
        rows.push_back({ lane + (daemon.empty() ? "" : " (" + daemon + ")"), on.empty() ? "RESTING" : "ON " + on,
                         on, on.empty() ? DIM : GOOD });
      }
    } else {
      for (JsonVariantConst p : b["projects"].as<JsonArrayConst>())
        rows.push_back({ upper(str(p["name"])), std::to_string(p["open"] | 0) + " OPEN  " + std::to_string(p["working"] | 0) + " AT WORK  " +
                         std::to_string(p["closed"] | 0) + " DONE", "", TFT_WHITE });
    }
  }
  void readTicket(const JsonDocument &d) {
    JsonVariantConst t = d["ticket"];
    ticketTitle = upper(str(t["title"]));
    ticketWords = str(t["description"]);
    for (JsonVariantConst n : t["notes"].as<JsonArrayConst>()) { ticketWords = str(n["text"]) + "  |  " + ticketWords; break; }   // newest first
    std::string flat;   // one paragraph: the markdown's breaks and marks left out (the screen wraps by itself)
    for (char c : ticketWords) {
      if (c == '*' || c == '`' || c == '#') continue;
      if (c == '\n' || c == '\r' || c == '\t') c = ' ';
      if (c == ' ' && !flat.empty() && flat.back() == ' ') continue;
      flat += c;
    }
    ticketWords = flat;
    choices.clear();
    for (JsonVariantConst c : t["choices"].as<JsonArrayConst>()) choices.push_back(str(c));
    choice = 0;
    answerable = (t["waiting"] | false) && (t["answerable"] | false);
  }
  void tick() override {
    if (!asking.valid() || asking.wait_for(std::chrono::seconds(0)) != std::future_status::ready) return;
    Reply r = asking.get();
    drawn = false;
    JsonDocument d;
    bool read = !deserializeJson(d, (const char *)r.body.data(), r.body.size());
    std::string error = read && d["error"].is<const char *>() ? d["error"].as<const char *>()
                        : !r.error.empty() ? r.error : "the site said " + std::to_string(r.status);
    switch (what) {
      case Asked::Board: if (r.ok() && read) readBoard(d); else why = "EUDAIMONIA did not answer: " + error; break;   // DRAFT
      case Asked::Ticket: if (r.ok() && read) readTicket(d); else { told = error; ticketId.clear(); } break;
      case Asked::Answer:
        if (r.ok()) { told = "Answered " + ticketId + "."; ticketId.clear(); askBoard(); }                    // DRAFT
        else { told = r.status == 401 || r.status == 403 ? "Sign in first (S)." : error; if (r.status == 401) eudaimonia::signOut(); }
        break;
      case Asked::SignIn: break;
    }
  }
  std::future<std::string> signingIn;

  void key(const KeyEvent &e) override {
    if (!e.down) return;
    drawn = false;
    if (signing) {   // the name, then the password, typed
      std::string &field = onPassword ? password : name;
      if (e.key == Key::Esc) { signing = false; password.clear(); return; }
      if (e.key == Key::Tab) { onPassword = !onPassword; return; }
      if (e.key == Key::Backspace) { if (!field.empty()) field.pop_back(); return; }
      if (e.key == Key::Enter) {
        if (!onPassword) { onPassword = true; return; }
        std::string n = name, p = password;
        password.clear();
        signingIn = std::async(std::launch::async, [n, p] { return eudaimonia::signIn(n, p); });
        told = "Signing in...";                                                                                // DRAFT
        signing = false;
        return;
      }
      if (e.ch && field.size() < 40) field += e.ch;
      return;
    }
    if (!ticketId.empty()) {   // an open ticket
      if (e.key == Key::Esc || e.key == Key::PadB) { ticketId.clear(); return; }
      Dir dir = dirOf(e.key);
      if (!choices.empty() && (e.key == Key::C || dir == Dir::Right)) choice = (choice + 1) % (int)choices.size();
      if (!choices.empty() && (e.key == Key::Z || dir == Dir::Left)) choice = (choice + (int)choices.size() - 1) % (int)choices.size();
      if ((e.key == Key::Enter || e.key == Key::PadA) && answerable && !choices.empty()) {
        if (!eudaimonia::signedIn()) { told = "Sign in first (S)."; return; }                                  // DRAFT
        std::string body = "{\"text\":\"\",\"choice\":" + eudaimonia::jsonString(choices[choice]) + "}", path = "/api/ticket/" + ticketId + "/answer";
        what = Asked::Answer;
        asking = std::async(std::launch::async, [path, body] { return eudaimonia::post(path, body); });
        told = "Answering...";                                                                                 // DRAFT
      }
      if (e.key == Key::S) { signing = true; onPassword = false; }
      return;
    }
    if (e.key == Key::Esc || e.key == Key::PadB) { goHome(); return; }
    if (e.key == Key::R) { askBoard(); return; }
    if (e.key == Key::S) {
      if (eudaimonia::signedIn()) { eudaimonia::signOut(); told = "Signed out."; }                          // DRAFT
      else { signing = true; onPassword = false; }
      return;
    }
    Dir dir = dirOf(e.key);
    if (e.key == Key::Z || e.key == Key::C || dir == Dir::Left || dir == Dir::Right) {
      room = (room + ((e.key == Key::C || dir == Dir::Right) ? 1 : kCount - 1)) % kCount;
      told.clear();
      askBoard();
      return;
    }
    if (dir == Dir::Down && sel + 1 < (int)rows.size()) sel++;
    if (dir == Dir::Up && sel > 0) sel--;
    if (sel < top) top = sel;
    if (sel >= top + lay::rows(11, 11)) top = sel - (lay::rows(11, 11) - 1);
    if ((e.key == Key::Enter || e.key == Key::PadA) && sel < (int)rows.size() && !rows[sel].id.empty()) {
      ticketId = rows[sel].id;
      ticketTitle = rows[sel].left;
      ticketWords.clear();
      choices.clear();
      what = Asked::Ticket;
      std::string path = "/api/ticket/" + ticketId;
      asking = std::async(std::launch::async, [path] { return eudaimonia::get(path); });
    }
  }
  bool drawn = false;
  std::chrono::steady_clock::time_point lastDrawn;
  bool changed() override {
    if (signingIn.valid() && signingIn.wait_for(std::chrono::seconds(0)) == std::future_status::ready) {
      std::string w = signingIn.get();
      told = w.empty() ? "Signed in." : w;                                                                     // DRAFT
      drawn = false;
    }
    auto t = std::chrono::steady_clock::now();
    if (!drawn) { drawn = true; lastDrawn = t; return true; }
    if (t - lastDrawn > std::chrono::seconds(60)) { lastDrawn = t; if (!asking.valid() && ticketId.empty() && !signing) askBoard(); return true; }
    return false;
  }
  void draw() override {
    canvas.fillScreen(rgb(0x16, 0x14, 0x1c));
    drawBand(eudaimonia::signedIn() ? "DASHBOARD  (SIGNED IN)" : "DASHBOARD", BAND);                           // DRAFT
    canvas.setTextSize(1);
    if (signing) {
      canvas.setTextColor(SOFT);
      canvas.setCursor(6, 30);
      canvas.print(("SIGN IN TO " + eudaimonia::address().substr(eudaimonia::address().find("//") + 2)).substr(0, 50).c_str());   // DRAFT
      canvas.setTextColor(onPassword ? DIM : TFT_WHITE);
      canvas.setCursor(6, 56); canvas.printf("NAME      %s%s", name.c_str(), onPassword ? "" : "_");
      canvas.setTextColor(onPassword ? TFT_WHITE : DIM);
      canvas.setCursor(6, 72); canvas.printf("PASSWORD  %s%s", std::string(password.size(), '*').c_str(), onPassword ? "_" : "");
      canvas.setTextColor(DIM);
      canvas.setCursor(6, lay::foot(160));
      canvas.print(hint("TAB: NEXT   ENTER: SIGN IN   ESC: BACK"));                                             // DRAFT
      return;
    }
    if (!ticketId.empty()) {   // a ticket open
      canvas.setTextColor(TFT_WHITE);
      wrap(ticketTitle, 4, 18, lay::across(), 2, 10);
      canvas.setTextColor(SOFT);
      wrap(ticketWords.empty() ? "..." : ticketWords, 4, 42, lay::across(), lay::rows(choices.empty() ? 10 : 7, 10), 10);
      if (!choices.empty()) {
        canvas.setTextColor(answerable ? TFT_WHITE : DIM);
        canvas.setCursor(4, lay::foot(116));
        canvas.print("CHOOSE:");                                                                                 // DRAFT
        int y = lay::foot(128);
        canvas.fillRect(0, y - 1, hal::W, 11, BAND);
        canvas.setCursor(4, y);
        canvas.printf("%d/%d  %s", choice + 1, (int)choices.size(), upper(choices[choice]).substr(0, lay::across() - 8).c_str());
      }
      canvas.setTextColor(DIM);
      canvas.setCursor(4, lay::foot(160));
      std::string foot = !told.empty() ? upper(told) : answerable ? hint("Z C: CHOICE  ENTER: ANSWER  ESC: BACK") : hint("ESC: BACK");   // DRAFT
      canvas.print(foot.substr(0, lay::across()).c_str());
      return;
    }
    int x = 4;
    for (int i = 0; i < kCount; i++) {
      int w = 6 * (int)strlen(kRooms[i]) + 6;
      if (i == room) canvas.fillRect(x - 2, 16, w, 11, BAND);
      canvas.setTextColor(i == room ? TFT_WHITE : DIM);
      canvas.setCursor(x + 1, 18);
      canvas.print(kRooms[i]);
      x += w + 2;
    }
    int y = 31;
    if (!why.empty()) { canvas.setTextColor(why == "Nothing waits on you." ? GOOD : WARN); wrap(why, 4, y, lay::across(), 4, 10); }
    else if (rows.empty()) { canvas.setTextColor(DIM); canvas.setCursor(4, y); canvas.print("ASKING EUDAIMONIA..."); }   // DRAFT
    for (int i = top; i < (int)rows.size() && i < top + lay::rows(11, 11); i++) {
      const Row &r = rows[i];
      if (i == sel) canvas.fillRect(0, y - 1, hal::W, 11, rgb(0x2c, 0x28, 0x3a));
      canvas.setTextColor(r.colour);
      canvas.setCursor(4, y);
      int room4left = lay::across() - (int)r.right.size() - 1;
      canvas.print(r.left.substr(0, room4left > 8 ? room4left : 8).c_str());
      canvas.setTextColor(i == sel ? TFT_WHITE : DIM);
      canvas.setCursor(hal::W - 4 - 6 * (int)r.right.size(), y);
      canvas.print(r.right.c_str());
      y += 11;
    }
    canvas.setTextColor(DIM);
    canvas.setCursor(4, lay::foot(160));
    std::string foot = !told.empty() ? upper(told) : hint(eudaimonia::signedIn() ? "Z C: ROOM  ENTER: OPEN  S: SIGN OUT  ESC" : "Z C: ROOM  ENTER: OPEN  S: SIGN IN  ESC");   // DRAFT
    canvas.print(foot.substr(0, lay::across()).c_str());
  }
};
}  // namespace

Page *dashboardPage() { static Dashboard p; return &p; }
