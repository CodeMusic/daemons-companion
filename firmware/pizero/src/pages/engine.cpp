// C-510: THE ENGINE ROOM on the Linux devices -- the hub's own room, drawn here from the same API the phone's web app
// (server/admin/) asks, with the key this device was paired with (C-380). It is the home network's and the tailnet's
// only: through the relay the hub refuses every one of these (server/src/admin.ts ADMIN_HOME_ONLY), and the page says
// so. Six rooms along the top, Z C (or the arrows) between them:
//   JOBS     what THE HANDS ran and are running, newest first; ENTER reads a job's output
//   RUN      the jobs the hub knows that need no words typed; ENTER runs one (one marked DANGER asks ENTER again)
//   SITE     what the site serves, and whether a newer one is waiting
//   DEVICES  every device that said hello, where it is and the daemon it carries
//   SAVES    the save's trail, and which side is the truth
//   HUB      the hub itself: its build, the mirror, the mind, the boards on LoRa
// R asks again; UP DOWN scroll; ESC goes back. Every word DRAFT.
#include <ArduinoJson.h>

#include <chrono>
#include <future>
#include <string>
#include <vector>

#include "app.h"
#include "apps.h"
#include "canvas.h"
#include "hal/hal.h"
#include "hub/hub.h"
#include "pages/parts.h"

namespace {
const uint16_t SOFT = 0xC639, DIM = 0x8432, WARN = 0xFD20, GOOD = 0x6E8F;
const uint16_t BAND = 0x5A6B;   // the room's own colour: iron

struct Row { std::string left, right, detail, run; uint16_t colour = SOFT; bool danger = false; };

const char *kRooms[] = { "JOBS", "RUN", "SITE", "DEVICES", "SAVES", "HUB" };
const char *kPaths[] = { "/api/engine/jobs", "/api/engine/jobs", "/api/engine/site", "/api/devices", "/api/saves/history", "/api/hub" };
const int kCount = 6;

// "2026-11-24T05:38:29.000Z" -> "11-24 05:38" (UTC, as the hub keeps it)
std::string when(const char *iso) {
  std::string s = iso ? iso : "";
  return s.size() >= 16 ? s.substr(5, 5) + " " + s.substr(11, 5) : s;
}
std::string str(JsonVariantConst v, const char *fallback = "") { return v.is<const char *>() ? v.as<const char *>() : fallback; }

std::vector<Row> rowsOf(int room, const JsonDocument &d) {
  std::vector<Row> out;
  switch (room) {
    case 0:   // JOBS
      for (JsonVariantConst j : d["jobs"].as<JsonArrayConst>()) {
        std::string state = str(j["state"]), arg = str(j["arg"]);
        Row r{ upper(str(j["name"])) + (arg.empty() ? "" : " " + arg), upper(state) + " " + when(str(j["asked"]).c_str()), str(j["output"]) };
        r.colour = state == "done" ? (j["exit"] | 0) == 0 ? GOOD : WARN : state == "failed" ? WARN : TFT_WHITE;
        out.push_back(r);
      }
      if (d["hands"].is<JsonObjectConst>())
        out.insert(out.begin(), Row{ "THE HANDS", "SEEN " + when(str(d["hands"]["seen"]).c_str()), str(d["hands"]["name"]), "", DIM });
      else out.insert(out.begin(), Row{ "THE HANDS", "NOT SEEN", "No computer is running THE HANDS for this hub.", "", WARN });
      break;
    case 1:   // RUN: the kinds that need no words
      for (JsonVariantConst k : d["kinds"].as<JsonArrayConst>()) {
        if (!k["arg"].isNull()) continue;
        Row r{ upper(str(k["name"])), upper(str(k["group"])), str(k["said"]), str(k["name"]) };
        r.danger = k["danger"] | false;
        if (r.danger) r.colour = WARN;
        out.push_back(r);
      }
      break;
    case 2: {   // SITE
      std::string serving = str(d["commit"]), latest = str(d["latest"]);
      out.push_back({ "SERVING", upper(str(d["serving"])) + " " + serving.substr(0, 8), "Built at " + str(d["at"]) });
      out.push_back({ "NEWEST", latest.substr(0, 8), "Looked " + str(d["checked"]), "", latest == serving ? GOOD : WARN });
      if (!d["error"].isNull()) out.push_back({ "ERROR", "", str(d["error"]), "", WARN });
      if (d["fetching"] | false) out.push_back({ "FETCHING NOW", "", "", "", DIM });
      break;
    }
    case 3:   // DEVICES
      for (JsonVariantConst v : d["devices"].as<JsonArrayConst>()) {
        bool here = v["here"] | false;
        std::string carried = v["daemon"].is<JsonObjectConst>() ? str(v["daemon"]["nickname"]) : "";
        int pc = v["battery"]["percent"] | -1;
        Row r{ upper(str(v["name"], str(v["id"]).c_str())), (here ? "HERE" : "SEEN " + when(str(v["lastSeen"]).c_str())) + (pc >= 0 ? " " + std::to_string(pc) + "%" : ""),
               str(v["kind"]) + " by " + str(v["via"]) + (carried.empty() ? ", carrying none" : ", carrying " + carried) + ". " + str(v["firmware"]) };
        r.colour = here ? GOOD : DIM;
        out.push_back(r);
      }
      break;
    case 4:   // SAVES
      out.push_back({ "THE TRUTH", upper(str(d["truth"])), "Which side wins when both have moved.", "", TFT_WHITE });
      for (JsonVariantConst t : d["trail"].as<JsonArrayConst>())
        out.push_back({ upper(str(t["kind"])) + " " + str(t["name"]) + " " + str(t["playTime"]), when(str(t["at"]).c_str()),
                        "From " + str(t["from"]) + ". " + str(t["sha1"]).substr(0, 12) + " " + str(t["note"]) });
      break;
    case 5: {   // HUB
      out.push_back({ "BUILD", str(d["server"]), "The hub's own code.", "", TFT_WHITE });
      out.push_back({ "ON THE HUB", (d["onHub"] | false) ? "YES" : "NO", "Whether this is the hub's own machine." });
      out.push_back({ "MIRROR", (d["mirror"]["on"] | false) ? "ON " + when(str(d["mirror"]["at"]).c_str()) : "OFF", "The save's mirror (C-380)." });
      out.push_back({ "MIND", upper(str(d["ai"]["provider"], "none")), "Who thinks for the daemon." });
      for (JsonVariantConst m : d["ai"]["modules"].as<JsonArrayConst>())
        out.push_back({ "  " + upper(str(m["name"])), (m["answering"] | false) ? "ANSWERING" : "QUIET", str(m["llm"]), "", (m["answering"] | false) ? GOOD : WARN });
      for (JsonVariantConst b : d["lora"]["boards"].as<JsonArrayConst>())
        out.push_back({ "LORA " + upper(str(b["kind"])), (b["here"] | false) ? "HERE" : "AWAY", str(b["id"]), "", (b["here"] | false) ? GOOD : DIM });
      out.push_back({ "TAILNET", str(d["tailnet"]), "" });
      break;
    }
  }
  return out;
}

struct Engine : Page {
  int room = 0, sel = 0, top = 0;
  std::future<Reply> asking;
  std::vector<Row> rows;
  std::string why, told, reading;   // why nothing shows; a word after a run; a job's output being read
  bool sure = false;                // a DANGER job asked once
  Sending running;

  void ask() {
    rows.clear(); why.clear(); sel = top = 0; reading.clear(); sure = false;
    if (!hub::paired()) { why = "Pair this device with the hub first (DAEMONS > LINK)."; return; }
    std::string path = kPaths[room];
    asking = std::async(std::launch::async, [path] { return hub::get(path, 8000); });
  }
  void enter() override { told.clear(); ask(); }
  void tick() override {
    if (asking.valid() && asking.wait_for(std::chrono::seconds(0)) == std::future_status::ready) {
      Reply r = asking.get();
      JsonDocument d;
      if (r.ok() && !deserializeJson(d, (const char *)r.body.data(), r.body.size())) rows = rowsOf(room, d);
      else if (hub::away() || r.status == 403) why = "The engine room opens at home or on the tailnet only.";
      else why = "The hub did not answer: " + (r.error.empty() ? "it said " + std::to_string(r.status) : r.error);
      drawn = false;
    }
    Reply done;
    if (running.done(done)) { told = done.ok() ? "Asked. JOBS shows it running." : replyWords(done, "error"); drawn = false; }
  }
  void key(const KeyEvent &e) override {
    if (!e.down) return;
    drawn = false;
    if (!reading.empty()) { reading.clear(); return; }   // any key closes a job's output
    if (e.key == Key::Esc || e.key == Key::PadB) { if (sure) { sure = false; return; } goHome(); return; }
    if (e.key == Key::R) { ask(); return; }
    Dir dir = dirOf(e.key);
    if (e.key == Key::Z || e.key == Key::C || dir == Dir::Left || dir == Dir::Right) {
      room = (room + ((e.key == Key::C || dir == Dir::Right) ? 1 : kCount - 1)) % kCount;
      told.clear();
      ask();
      return;
    }
    if (dir == Dir::Down && sel + 1 < (int)rows.size()) { sel++; sure = false; }
    if (dir == Dir::Up && sel > 0) { sel--; sure = false; }
    if (sel < top) top = sel;
    if (sel >= top + 11) top = sel - 10;
    if ((e.key == Key::Enter || e.key == Key::PadA) && sel < (int)rows.size()) {
      const Row &r = rows[sel];
      if (room == 1 && !r.run.empty()) {
        if (r.danger && !sure) { sure = true; told = "ENTER again to run " + upper(r.run) + "."; return; }
        sure = false;
        running.send("/api/engine/jobs", "{\"name\":\"" + r.run + "\"}");
        told = "Asking for " + upper(r.run) + "...";
        return;
      }
      if (!r.detail.empty()) reading = r.detail;
    }
  }
  bool drawn = false;
  std::chrono::steady_clock::time_point lastDrawn;
  bool changed() override {   // after an answer or a key, and each five seconds (a running job's state)
    auto t = std::chrono::steady_clock::now();
    if (!drawn) { drawn = true; lastDrawn = t; return true; }
    if (t - lastDrawn > std::chrono::seconds(5)) { lastDrawn = t; if (room == 0 && !asking.valid()) ask(); return true; }
    return false;
  }
  void draw() override {
    canvas.fillScreen(rgb(0x14, 0x16, 0x1c));
    drawBand("ENGINE ROOM", BAND);                                                                                   // DRAFT
    int x = 4;
    canvas.setTextSize(1);
    for (int i = 0; i < kCount; i++) {   // the rooms
      int w = 6 * (int)strlen(kRooms[i]) + 6;
      if (i == room) canvas.fillRect(x - 2, 16, w, 11, BAND);
      canvas.setTextColor(i == room ? TFT_WHITE : DIM);
      canvas.setCursor(x + 1, 18);
      canvas.print(kRooms[i]);
      x += w + 2;
    }
    if (!reading.empty()) {   // a job's output, as it ended
      canvas.setTextColor(SOFT);
      wrap(reading.size() > 900 ? reading.substr(reading.size() - 900) : reading, 4, 31, 52, 12, 10);
      canvas.setTextColor(DIM);
      canvas.setCursor(4, 160);
      canvas.print(hint("ANY KEY: BACK"));                                                                          // DRAFT
      return;
    }
    int y = 31;
    if (!why.empty()) { canvas.setTextColor(WARN); wrap(why, 4, y, 52, 4, 10); }
    else if (rows.empty()) { canvas.setTextColor(DIM); canvas.setCursor(4, y); canvas.print(asking.valid() ? "ASKING THE HUB..." : "NOTHING HERE."); }   // DRAFT
    for (int i = top; i < (int)rows.size() && i < top + 11; i++) {
      const Row &r = rows[i];
      if (i == sel) canvas.fillRect(0, y - 1, hal::W, 11, rgb(0x2a, 0x2f, 0x3c));
      canvas.setTextColor(r.colour);
      canvas.setCursor(4, y);
      int room4right = 52 - (int)r.right.size() - 1;
      canvas.print(r.left.substr(0, room4right > 8 ? room4right : 8).c_str());
      canvas.setTextColor(i == sel ? TFT_WHITE : DIM);
      canvas.setCursor(hal::W - 4 - 6 * (int)r.right.size(), y);
      canvas.print(r.right.c_str());
      y += 11;
    }
    canvas.setTextColor(DIM);
    canvas.setCursor(4, 160);
    std::string foot = !told.empty() ? upper(told) : room == 1 ? hint("Z C: ROOM  ENTER: RUN  R: AGAIN  ESC: BACK") : hint("Z C: ROOM  ENTER: READ  R: AGAIN  ESC: BACK");   // DRAFT
    canvas.print(foot.substr(0, 52).c_str());
  }
};
}  // namespace

Page *enginePage() { static Engine p; return &p; }
