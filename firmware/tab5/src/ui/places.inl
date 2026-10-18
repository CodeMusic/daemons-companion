// Part of ui.cpp (C-157): DEVICES and HOME (PLACES). Included by ui.cpp in order -- not a file of its own: it
// shares ui.cpp's statics and may use anything the parts before it declare.
// ---- DEVICES ----------------------------------------------------------------------------------------------------------
struct Carry { String id; long long personality; };
static Carry carries[64]; static int carryN = 0;
static void tapCarry(lv_event_t *e) {
  Carry &c = carries[(int)(long)lv_event_get_user_data(e)];
  String body = "{\"id\":\"" + c.id + "\",\"personality\":" + (c.personality < 0 ? String("null") : String((long long)c.personality)) + "}";
  netSend("POST", "/api/devices/carry", body);
}
// C-130: each device as it looks (firmware/common/device_sprites.py writes the list), and the maker it is listed under
#include "../../common/device_sprites.h"
static const DeviceLook *lookFor(const String &kind) {
  String k = kind;
  for (int i = 0; i < DEVICE_ALIAS_N; i++) if (k == DEVICE_ALIASES[i][0]) k = DEVICE_ALIASES[i][1];
  const DeviceLook *best = nullptr; size_t bestLen = 0;
  for (int i = 0; i < DEVICE_LOOK_N; i++) {
    size_t n = strlen(DEVICE_LOOKS[i].kind);
    if (k == DEVICE_LOOKS[i].kind) return &DEVICE_LOOKS[i];
    if (k.startsWith(DEVICE_LOOKS[i].kind) && n > bestLen) { best = &DEVICE_LOOKS[i]; bestLen = n; }
  }
  return best;
}
static String makerOf(const String &kind) { const DeviceLook *l = lookFor(kind); return l ? l->maker : "Other"; }
// The sprite, `px` pixels square: each shape a rounded rectangle on the 32x32 grid (the list keeps them in tenths)
static void deviceSprite(lv_obj_t *parent, const String &kind, int px, bool dim) {
  lv_obj_t *box = lv_obj_create(parent);
  lv_obj_remove_style_all(box);
  lv_obj_set_size(box, px, px);
  lv_obj_clear_flag(box, LV_OBJ_FLAG_SCROLLABLE);
  if (dim) lv_obj_set_style_opa(box, LV_OPA_70, 0);
  const DeviceLook *l = lookFor(kind);
  static const DeviceShape PLAIN[] = { {40, 80, 240, 160, 20, 0x5A5D63}, {70, 110, 180, 100, 10, 0x46A8E0} };
  const DeviceShape *sh = l ? l->shapes : PLAIN; int n = l ? l->n : 2;
  for (int i = 0; i < n; i++) {
    lv_obj_t *o = lv_obj_create(box);
    lv_obj_remove_style_all(o);
    lv_obj_set_pos(o, sh[i].x * px / 320, sh[i].y * px / 320);
    lv_obj_set_size(o, max(1, sh[i].w * px / 320), max(1, sh[i].h * px / 320));
    lv_obj_set_style_radius(o, sh[i].r * px / 320, 0);
    lv_obj_set_style_bg_opa(o, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(o, lv_color_hex(sh[i].c), 0);
  }
}

static String kindName(const String &kind) {
  if (const DeviceLook *l = lookFor(kind)) return l->name;
  if (kind == "t-embed-cc1101") return "T-Embed CC1101"; if (kind == "t-embed") return "T-Embed"; if (kind == "t-embed-si4732") return "T-Embed SI4732";
  if (kind == "t-watch-s3") return "T-Watch S3"; if (kind == "m5-sticks3") return "M5StickS3"; if (kind == "m5-cores3") return "M5Stack CoreS3";
  if (kind == "m5-fire") return "M5Stack Fire"; if (kind == "m5go") return "M5GO"; if (kind == "m5-tab5") return "M5Stack Tab5"; if (kind == "m5-dial") return "M5Stack Dial";
  return kind;
}

static void drawDevices(lv_obj_t *p) {
  JsonDocument dv = newDoc();
  if (!kept("devices", dv)) { label(p, "Your devices show here once the Tab5 is paired.", &lv_font_montserrat_28, QUIET); return; }
  label(p, "Each device hosts a daemon of its own. SEND them from the party in the game, SYNC, and choose here which goes where.",
        &lv_font_montserrat_20, QUIET, LV_PCT(100));
  carryN = 0;
  JsonArray away = dv["away"];
  // C-130: under each maker's name, and beside each device a picture of it
  static const char *const OTHER = "Other";
  for (int m = 0; m <= DEVICE_MAKER_N; m++) {
  String maker = m < DEVICE_MAKER_N ? DEVICE_MAKERS[m] : OTHER;
  bool headed = false;
  for (JsonObject d : dv["devices"].as<JsonArray>()) {
    if (makerOf(d["kind"] | "") != maker) continue;
    if (!headed) { headed = true; String head = maker; head.toUpperCase(); label(p, head, &lv_font_montserrat_20, QUIET); }
    lv_obj_t *outer = card(p);
    lv_obj_set_flex_flow(outer, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_pad_column(outer, 20, 0);
    deviceSprite(outer, d["kind"] | "", 96, !(d["here"] | false));
    lv_obj_t *c = column(outer, LV_SIZE_CONTENT);
    lv_obj_set_flex_grow(c, 1);
    String id = d["id"] | "";
    label(c, kindName(d["kind"] | "") + (id == deviceId() ? "  (this one)" : "") + ((d["here"] | false) ? "" : "  (away)"), &lv_font_montserrat_28, INK);
    String said = String((d["here"] | false) ? "here, by " : "last heard ") + ((d["here"] | false) ? (const char *)(d["via"] | "") : (const char *)(d["lastSeen"] | ""));
    if (!d["battery"].isNull()) said += "   battery " + String((int)(d["battery"]["percent"] | 0)) + "%";
    label(c, said + "   " + id, &lv_font_montserrat_16, QUIET);
    JsonObject has = d["daemon"];
    label(c, has.isNull() ? "Hosts no daemon" : "Hosts " + String((const char *)(has["nickname"] | "")) + ", Lv. " + String((int)(has["level"] | 0)),
          &lv_font_montserrat_20, INK);
    lv_obj_t *r = row(c);
    long long mine = has.isNull() ? -1 : (long long)(has["personality"] | 0LL);
    for (JsonObject a : away) {
      if (carryN >= 63) break;
      long long pers = a["personality"] | 0LL;
      carries[carryN] = { id, pers };
      button(r, a["nickname"] | "", tapCarry, (void *)(long)carryN++, pers == mine);
    }
    if (away.size() && carryN < 64) { carries[carryN] = { id, -1 }; button(r, "None", tapCarry, (void *)(long)carryN++, mine < 0); }
  }
  }
}

// ---- HOME (C-139): Home Assistant, through the companion (server/src/home.ts) -- the home's name, each room a heading as
// DEVICES heads each maker, and each thing a card: its name, how it is, and what can be done to it (the server says which;
// a lock is shown, never opened). A tap answers at once (C-121): the kept view takes what it will most likely do and is
// drawn again, the thing marked "..." until the companion answers -- then it is sent NOW, never kept for later
// (netHomeAct, not netSend: a kettle started hours late is wrong). One that does not go is put back and says so on its
// card. Every word here is DRAFT.
struct HomeTap { String id, action; };
static std::vector<HomeTap> homeTaps;              // what each button on the page does, by its place here
static const int HOME_MOST = 96;                   // things drawn at most (a few objects each); the site shows the rest

static void foresee(JsonObject th, const String &action) {
  String kind = th["kind"] | "", state = th["state"] | "";
  if (action == "toggle" || action == "on" || action == "off") {
    bool now = action == "toggle" ? !(th["on"] | false) : action == "on";
    th["on"] = now; th["state"] = now ? "on" : "off";
    if (!now && kind == "light") th["detail"] = nullptr;          // its brightness goes with it
  } else if (action == "open" || action == "close") { th["state"] = action == "open" ? "opening" : "closing"; th["on"] = action == "open"; }
  else if (action == "play_pause") { bool playing = state == "playing"; th["state"] = playing ? "paused" : "playing"; th["on"] = !playing; }
}

static void tapHome(lv_event_t *e) {
  int i = (int)(long)lv_event_get_user_data(e);
  if (i < 0 || i >= (int)homeTaps.size()) return;
  HomeTap t = homeTaps[i];
  String before;
  JsonDocument h = newDoc();
  if (kept("home", h)) {
    for (JsonObject room : h["rooms"].as<JsonArray>())
      for (JsonObject th : room["things"].as<JsonArray>()) {
        if (t.id != (const char *)(th["id"] | "")) continue;
        th.remove("busy"); th.remove("failed"); th.remove("said");
        serializeJson(th, before);                   // put back if it does not go
        foresee(th, t.action);
        th["busy"] = true;
      }
    String json; serializeJson(h, json);
    keep("home", json);
  }
  drawnAt[P_PLACES] = 0;
  netHomeAct(t.id, t.action, before);
}

static void homeButton(lv_obj_t *parent, const String &text, const String &id, const char *action, bool filled, int width = -1) {
  homeTaps.push_back({ id, action });
  lv_obj_t *b = button(parent, text, tapHome, (void *)(long)(homeTaps.size() - 1), filled);
  if (width > 0) lv_obj_set_width(b, width);
}

static void drawThing(lv_obj_t *p, JsonObject th) {
  String id = th["id"] | "", kind = th["kind"] | "", state = th["state"] | "";
  bool on = th["on"] | false;
  auto can = [&](const char *a) { for (JsonVariant c : th["can"].as<JsonArray>()) if (c.as<String>() == a) return true; return false; };
  lv_obj_t *c = card(p);
  lv_obj_set_flex_flow(c, LV_FLEX_FLOW_ROW);
  lv_obj_set_style_pad_column(c, 16, 0);
  lv_obj_set_flex_align(c, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_t *words = column(c, LV_SIZE_CONTENT);
  lv_obj_set_flex_grow(words, 1);
  lv_obj_set_style_pad_row(words, 4, 0);
  label(words, th["name"] | "", &lv_font_montserrat_28, INK, LV_PCT(100));
  // how it is: its state where no button already says it, and its detail (80%, 21 C to 22 C, what is playing)
  bool says = state == "unavailable" || state == "unknown" || kind == "cover" || kind == "media_player" || kind == "climate" || kind == "lock";
  String line = says ? state : String(""), detail = th["detail"] | "";
  if (detail.length()) line += (line.length() ? "  -  " : "") + detail;
  if (th["busy"] | false) line += line.length() ? "   ..." : "...";
  if (line.length()) label(words, line, &lv_font_montserrat_20, QUIET, LV_PCT(100));
  if (th["failed"].is<const char *>()) label(words, th["failed"].as<const char *>(), &lv_font_montserrat_20, DAY, LV_PCT(100));
  else if (th["said"].is<const char *>()) label(words, th["said"].as<const char *>(), &lv_font_montserrat_20, QUIET);
  lv_obj_t *keys = row(c);
  lv_obj_set_width(keys, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(keys, LV_FLEX_FLOW_ROW);
  if (can("toggle")) homeButton(keys, on ? "ON" : "OFF", id, "toggle", on, 120);
  if (can("open")) homeButton(keys, "OPEN", id, "open", state == "open" || state == "opening");
  if (can("close")) homeButton(keys, "CLOSE", id, "close", state == "closed" || state == "closing");
  if (can("stop")) homeButton(keys, "STOP", id, "stop", false);
  if (can("run")) homeButton(keys, "RUN", id, "run", kind == "script" && on);
  if (can("play_pause")) homeButton(keys, state == "playing" ? LV_SYMBOL_PAUSE : LV_SYMBOL_PLAY, id, "play_pause", state == "playing");
  if (can("next")) homeButton(keys, LV_SYMBOL_NEXT, id, "next", false);
  if (can("cooler")) homeButton(keys, LV_SYMBOL_MINUS, id, "cooler", false);
  if (can("warmer")) homeButton(keys, LV_SYMBOL_PLUS, id, "warmer", false);
}

static void sentHomeAsk(const String &text) { if (text.length()) { netHomeAsk(text); drawnAt[P_PLACES] = 0; } }
static void tapHomeAsk(lv_event_t *) { askText("Ask the home -- Home Assistant's assistant answers", "", false, false, sentHomeAsk); }

static void drawHome(lv_obj_t *p) {
  homeTaps.clear();
  JsonDocument h = newDoc();
  if (!kept("home", h)) {
    label(p, net.paired ? "HOME is Home Assistant, through the companion. Asking it now..." : "HOME shows here once the Tab5 is paired (SETTINGS).",
          &lv_font_montserrat_28, QUIET, LV_PCT(100));
    return;
  }
  String name = h["home"] | "";
  label(p, name.length() ? name : String("HOME"), &lv_font_montserrat_40, DAY, LV_PCT(100));
  bool ok = h["ok"] | false;
  JsonArray rooms = h["rooms"].as<JsonArray>();
  if (!ok) {                                       // not set up, or not answering: what went wrong, the rooms last seen below
    lv_obj_t *c = card(p);
    label(c, h["error"] | "Home Assistant did not answer.", &lv_font_montserrat_28, INK, LV_PCT(100));
    if (rooms.size()) label(c, "Below, as it was last seen.", &lv_font_montserrat_20, QUIET);
  } else if (!net.home && !net.away)
    label(p, "KEPT: as it was last seen. A tap goes only when the companion answers.", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  String asked, answer;                            // asked in words, and the answer
  netHomeHeard(asked, answer);
  if (ok) button(p, "ASK...", tapHomeAsk);
  if (asked.length()) {
    lv_obj_t *c = card(p);
    label(c, "You asked: " + asked, &lv_font_montserrat_20, QUIET, LV_PCT(100));
    label(c, answer.length() ? answer : String("..."), &lv_font_montserrat_28, INK, LV_PCT(100));
  }
  int shown = 0, all = 0;
  for (JsonObject room : rooms) {
    JsonArray things = room["things"].as<JsonArray>();
    all += things.size();
    if (shown >= HOME_MOST || !things.size()) continue;
    String head = room["name"] | ""; head.toUpperCase();
    label(p, head, &lv_font_montserrat_20, QUIET);
    for (JsonObject th : things) { if (shown >= HOME_MOST) break; drawThing(p, th); shown++; }
  }
  if (all > shown) label(p, "And " + String(all - shown) + " more: the site shows the whole home.", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  if (ok && !all) label(p, "Home Assistant has nothing HOME shows yet: its lights, switches, fans, covers, scenes, scripts, media, climate and locks.",
                        &lv_font_montserrat_20, QUIET, LV_PCT(100));
}

