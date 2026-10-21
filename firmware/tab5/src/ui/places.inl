// Part of ui.cpp (C-157): DEVICES and HOME (PLACES). Included by ui.cpp in order -- not a file of its own: it
// shares ui.cpp's statics and may use anything the parts before it declare.
// ---- DEVICES ----------------------------------------------------------------------------------------------------------
struct Carry { String id; long long personality; };
static Carry carries[64]; static int carryN = 0;
// C-177 (the user, 2026-10-21: PLACES "seem to cause a soft-crash"): every device's card once drew a button for every
// away daemon -- 20 devices and 9 daemons, a few hundred objects at once. Now each card has CHOOSE, and only the card
// being chosen for shows the daemons.
static String choosingFor;
static void tapCarry(lv_event_t *e) {
  Carry &c = carries[(int)(long)lv_event_get_user_data(e)];
  String body = "{\"id\":\"" + c.id + "\",\"personality\":" + (c.personality < 0 ? String("null") : String((long long)c.personality)) + "}";
  netSend("POST", "/api/devices/carry", body);
  choosingFor = ""; drawnAt[P_PLACES] = 0;
}
static std::vector<String> chooseIds;
static void tapChoose(lv_event_t *e) {
  String id = chooseIds[(int)(long)lv_event_get_user_data(e)];
  choosingFor = choosingFor == id ? String() : id; drawnAt[P_PLACES] = 0;
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

// C-160 (the user, 2026-10-18: "tap the device to open its specific settings -- sound style, volume (or mute), along with
// any other device specific settings"): one device's own settings over every device's (GET/POST /api/devices/<id>/settings)
// -- each row this one's own or as every device, and back to every device's in one tap. Every word DRAFT.
static String ownPath, ownId, ownTaps[40]; static int ownTapN = 0;
static void ownTap(lv_event_t *e) { netSend("POST", ownPath, ownTaps[(int)(long)lv_event_get_user_data(e)]); }
static void ownHead(lv_obj_t *box, JsonDocument &d, const char *head, const char *const keys[], int nk) {
  bool own = false;
  for (int k = 0; k < nk; k++) own |= !d["own"][keys[k]].isNull();
  lv_obj_t *h = row(box);
  label(h, head, &lv_font_montserrat_20, QUIET);
  if (own && ownTapN < 40) {
    String back = "{"; for (int k = 0; k < nk; k++) back += String(k ? "," : "") + "\"" + keys[k] + "\":null"; back += "}";
    ownTaps[ownTapN] = back;
    button(h, "this one's own - back to every device's", ownTap, (void *)(long)ownTapN++, false);
  } else label(h, "as every device", &lv_font_montserrat_16, QUIET);
}
static void ownChoice(lv_obj_t *box, JsonDocument &d, const char *head, const char *const keys[], int nk,
                      const char *const names[], const char *const bodies[], int n, int on) {
  ownHead(box, d, head, keys, nk);
  lv_obj_t *r = row(box);
  for (int i = 0; i < n && ownTapN < 40; i++) { ownTaps[ownTapN] = bodies[i]; button(r, names[i], ownTap, (void *)(long)ownTapN++, i == on); }
}
// C-162, C-163 (the user, 2026-10-18, through the watch's session): the face a round screen shows at home, each drawn small
// with the device's own daemon -- the season's sky behind it while SEASON AND WEATHER is on -- for the boards that draw the
// round face (the T-Watch S3, the Dial, the CoreS3). Every word DRAFT.
static bool roundFace(const String &id) { return id.startsWith("t-watch-s3-") || id.startsWith("m5-dial-") || id.startsWith("m5-cores3-"); }
static int ownDaemonSlot() {                         // the daemon the device hosts, from the kept devices
  JsonDocument dv = newDoc();
  if (!kept("devices", dv)) return -1;
  for (JsonObject r : dv["devices"].as<JsonArray>())
    if (ownId == String((const char *)(r["id"] | ""))) return r["daemon"].isNull() ? -1 : (int)(r["daemon"]["slot"] | -1);
  return -1;
}
static void facePicture(lv_obj_t *parent, const char *face, bool sky, int slot) {
  const int S = 120;
  lv_obj_t *o = lv_obj_create(parent);
  lv_obj_remove_style_all(o); lv_obj_set_size(o, S, S);
  lv_obj_set_style_radius(o, LV_RADIUS_CIRCLE, 0); lv_obj_set_style_clip_corner(o, true, 0);
  lv_obj_set_style_bg_opa(o, LV_OPA_COVER, 0); lv_obj_set_style_bg_color(o, lv_color_hex(0x16181D), 0);
  lv_obj_set_style_border_width(o, 3, 0); lv_obj_set_style_border_color(o, lv_color_hex(0x833131), 0);
  lv_obj_remove_flag(o, LV_OBJ_FLAG_SCROLLABLE); lv_obj_remove_flag(o, LV_OBJ_FLAG_CLICKABLE);
  bool virtue = !strcmp(face, "virtue");
  if (sky && !virtue) {                              // the season's sky, and its hill
    lv_obj_t *b = lv_obj_create(o); lv_obj_remove_style_all(b); lv_obj_set_size(b, S, S);
    lv_obj_set_style_bg_opa(b, LV_OPA_COVER, 0); lv_obj_set_style_bg_color(b, lv_color_hex(0x3A2318), 0);
    lv_obj_t *h = lv_obj_create(o); lv_obj_remove_style_all(h); lv_obj_set_size(h, S + 30, S * 3 / 4); lv_obj_set_pos(h, -15, S * 3 / 4);
    lv_obj_set_style_radius(h, LV_RADIUS_CIRCLE, 0); lv_obj_set_style_bg_opa(h, LV_OPA_COVER, 0); lv_obj_set_style_bg_color(h, lv_color_hex(0x6B3A1C), 0);
  }
  if (virtue) {
    lv_obj_t *t = label(o, "13:06", &lv_font_montserrat_28, lv_color_hex(0xF3F1EA)); lv_obj_align(t, LV_ALIGN_CENTER, 0, -10);
    for (int k = 0; k < 2; k++) {
      lv_obj_t *bar = lv_obj_create(o); lv_obj_remove_style_all(bar); lv_obj_set_size(bar, k ? 36 : 60, 5);
      lv_obj_set_style_radius(bar, 2, 0); lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, 0);
      lv_obj_set_style_bg_color(bar, lv_color_hex(k ? 0x7A7F88 : 0xC9C6BD), 0); lv_obj_align(bar, LV_ALIGN_CENTER, 0, 16 + k * 10);
    }
    return;
  }
  bool clock = !strcmp(face, "clock");
  if (slot >= 0) { lv_obj_t *pic = picture(o, "p" + String(slot), clock ? 256 : 224); lv_obj_align(pic, LV_ALIGN_CENTER, 0, clock ? 0 : 10); }
  if (!clock) { lv_obj_t *t = label(o, "13:06", &lv_font_montserrat_16, lv_color_hex(0xF3F1EA)); lv_obj_align(t, LV_ALIGN_TOP_MID, 0, 10); return; }
  static lv_point_precise_t minute[2] = { { 60, 60 }, { 84, 32 } }, hour[2] = { { 60, 60 }, { 40, 46 } };
  for (lv_point_precise_t *pts : { minute, hour }) {
    lv_obj_t *l = lv_line_create(o); lv_line_set_points(l, pts, 2);
    lv_obj_set_style_line_width(l, 5, 0); lv_obj_set_style_line_rounded(l, true, 0); lv_obj_set_style_line_color(l, lv_color_hex(0xF3F1EA), 0);
  }
  lv_obj_t *dot = lv_obj_create(o); lv_obj_remove_style_all(dot); lv_obj_set_size(dot, 12, 12); lv_obj_align(dot, LV_ALIGN_CENTER, 0, 0);
  lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0); lv_obj_set_style_bg_opa(dot, LV_OPA_COVER, 0); lv_obj_set_style_bg_color(dot, lv_color_hex(0x833131), 0);
}
static void ownFaces(lv_obj_t *box, JsonDocument &d) {
  JsonObject v = d["settings"];
  String face = (const char *)(v["face"] | "daemon"); bool sky = v["faceSky"] | true;
  static const char *const FACE_K[] = { "face" };
  ownHead(box, d, "ITS FACE", FACE_K, 1);
  static const char *const F[] = { "daemon", "clock", "virtue" }, *const FN[] = { "DAEMON", "CLOCK", "VIRTUE" };
  static const char *const FA[] = { "the time above it", "hands over it", "the day's words" };
  int slot = ownDaemonSlot();
  lv_obj_t *r = row(box);
  for (int i = 0; i < 3 && ownTapN < 40; i++) {
    lv_obj_t *c = lv_obj_create(r);
    lv_obj_set_size(c, 190, LV_SIZE_CONTENT); lv_obj_set_style_pad_all(c, 10, 0); lv_obj_set_style_radius(c, 10, 0);
    lv_obj_set_style_bg_opa(c, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(c, face == F[i] ? 4 : 0, 0); lv_obj_set_style_border_color(c, DAY, 0);
    lv_obj_set_flex_flow(c, LV_FLEX_FLOW_COLUMN); lv_obj_set_flex_align(c, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_remove_flag(c, LV_OBJ_FLAG_SCROLLABLE);
    facePicture(c, F[i], sky, slot);
    label(c, FN[i], &lv_font_montserrat_20, INK);
    lv_obj_t *about = label(c, FA[i], &lv_font_montserrat_16, QUIET, LV_PCT(100)); lv_obj_set_style_text_align(about, LV_TEXT_ALIGN_CENTER, 0);
    ownTaps[ownTapN] = String("{\"face\":\"") + F[i] + "\"}";
    lv_obj_add_flag(c, LV_OBJ_FLAG_CLICKABLE); lv_obj_add_event_cb(c, ownTap, LV_EVENT_CLICKED, (void *)(long)ownTapN++);
  }
  static const char *const SKY_K[] = { "faceSky" };
  static const char *const SKY_N[] = { "On", "Off" };
  static const char *const SKY_B[] = { "{\"faceSky\":true}", "{\"faceSky\":false}" };
  ownChoice(box, d, "SEASON AND WEATHER", SKY_K, 1, SKY_N, SKY_B, 2, sky ? 0 : 1);
  label(box, "The season's sky behind the daemon and the weather in front, on the DAEMON and CLOCK faces.", &lv_font_montserrat_16, QUIET, LV_PCT(100));
}
static void drawOwnSettings(lv_obj_t *box, JsonDocument &d) {
  ownTapN = 0;
  JsonObject v = d["settings"];
  static const char *const SND_K[] = { "sound", "volume" };
  static const char *const SND_N[] = { "Off", "Quiet", "Middle", "Loud", "Loudest" };
  static const char *const SND_B[] = { "{\"sound\":false}", "{\"sound\":true,\"volume\":20}", "{\"sound\":true,\"volume\":40}",
                                       "{\"sound\":true,\"volume\":70}", "{\"sound\":true,\"volume\":100}" };
  int vol = v["volume"] | 60, snd = !(v["sound"] | true) ? 0 : vol <= 20 ? 1 : vol <= 40 ? 2 : vol <= 70 ? 3 : 4;
  ownChoice(box, d, "SOUND", SND_K, 2, SND_N, SND_B, 5, snd);
  static const char *const WK_K[] = { "wakeSound" };
  static const char *const WK_N[] = { "When it starts", "Every time it wakes" };
  static const char *const WK_B[] = { "{\"wakeSound\":\"power\"}", "{\"wakeSound\":\"every\"}" };
  ownChoice(box, d, "THE WAKE JINGLE", WK_K, 1, WK_N, WK_B, 2, String((const char *)(v["wakeSound"] | "power")) == "every" ? 1 : 0);
  static const char *const HM_K[] = { "home" };
  static const char *const HM_N[] = { "The daemon", "Today's step" };
  static const char *const HM_B[] = { "{\"home\":\"daemon\"}", "{\"home\":\"today\"}" };
  ownChoice(box, d, "HOME, WHERE IT WAKES", HM_K, 1, HM_N, HM_B, 2, String((const char *)(v["home"] | "daemon")) == "today" ? 1 : 0);
  static const char *const SL_K[] = { "sleepAfter" };
  static const char *const SL_N[] = { "30 s", "1 min", "2 min", "5 min", "Never" };
  static const char *const SL_B[] = { "{\"sleepAfter\":30}", "{\"sleepAfter\":60}", "{\"sleepAfter\":120}", "{\"sleepAfter\":300}", "{\"sleepAfter\":0}" };
  static const int SL_V[] = { 30, 60, 120, 300, 0 };
  int sl = -1, sa = v["sleepAfter"] | 120; for (int i = 0; i < 5; i++) if (SL_V[i] == sa) sl = i;
  ownChoice(box, d, "SLEEP WHEN LEFT ALONE", SL_K, 1, SL_N, SL_B, 5, sl);
  static const char *const RG_K[] = { "ring" };
  static const char *const RG_N[] = { "Off", "Dim", "A third", "Bright" };
  static const char *const RG_B[] = { "{\"ring\":0}", "{\"ring\":15}", "{\"ring\":33}", "{\"ring\":60}" };
  static const int RG_V[] = { 0, 15, 33, 60 };
  int rg = -1, rv = v["ring"] | 15; for (int i = 0; i < 4; i++) if (RG_V[i] == rv) rg = i;
  ownChoice(box, d, "THE RING AT REST", RG_K, 1, RG_N, RG_B, 4, rg);
  if (roundFace(ownId)) ownFaces(box, d);           // C-162, C-163
  bool keepsHours = false;                          // C-166: the clock's hours, once the companion keeps them
  for (JsonVariant k : d["keys"].as<JsonArray>()) if (!strcmp(k | "", "hours")) keepsHours = true;
  if (keepsHours && (roundFace(ownId) || ownId.startsWith("t-display-pro-"))) {
    static const char *const HR_K[] = { "hours" };
    static const char *const HR_N[] = { "12 HOURS", "24 HOURS" };
    static const char *const HR_B[] = { "{\"hours\":12}", "{\"hours\":24}" };
    ownChoice(box, d, "CLOCK", HR_K, 1, HR_N, HR_B, 2, (int)(d["settings"]["hours"] | 24) == 12 ? 0 : 1);
  }
}
static std::vector<String> ownIds;
static void tapOwnSettings(lv_event_t *e) {
  const String &id = ownIds[(int)(long)lv_event_get_user_data(e)];
  String kind = id.lastIndexOf('-') > 0 ? id.substring(0, id.lastIndexOf('-')) : id;
  ownId = id; ownPath = "/api/devices/" + id + "/settings";
  openWatched(kindName(kind) + (id == deviceId() ? " (this one)" : "") + ": ITS OWN SETTINGS", ownPath, drawOwnSettings);
}

static void drawDevices(lv_obj_t *p) {
  JsonDocument dv = newDoc();
  if (!kept("devices", dv)) { label(p, "Your devices show here once the Tab5 is paired.", &lv_font_montserrat_28, QUIET); return; }
  label(p, "Each device hosts a daemon of its own. SEND them from the party in the game, SYNC, and choose here which goes where.",
        &lv_font_montserrat_20, QUIET, LV_PCT(100));
  carryN = 0; ownIds.clear(); chooseIds.clear();
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
    lv_obj_t *nr = row(c);
    label(nr, kindName(d["kind"] | "") + (id == deviceId() ? "  (this one)" : "") + ((d["here"] | false) ? "" : "  (away)"), &lv_font_montserrat_28, INK);
    ownIds.push_back(id);                            // C-160: its own settings
    button(nr, "ITS SETTINGS", tapOwnSettings, (void *)(long)(ownIds.size() - 1), false);
    String said = String((d["here"] | false) ? "here, by " : "last heard ") + ((d["here"] | false) ? (const char *)(d["via"] | "") : (const char *)(d["lastSeen"] | ""));
    if (!d["battery"].isNull()) said += "   battery " + String((int)(d["battery"]["percent"] | 0)) + "%";
    label(c, said + "   " + id, &lv_font_montserrat_16, QUIET);
    JsonObject has = d["daemon"];
    label(c, has.isNull() ? "Hosts no daemon" : "Hosts " + String((const char *)(has["nickname"] | "")) + ", Lv. " + String((int)(has["level"] | 0)),
          &lv_font_montserrat_20, INK);
    if (!away.size()) continue;
    lv_obj_t *r = row(c);
    long long mine = has.isNull() ? -1 : (long long)(has["personality"] | 0LL);
    chooseIds.push_back(id);
    button(r, choosingFor == id ? "CLOSE" : "CHOOSE", tapChoose, (void *)(long)(chooseIds.size() - 1), false);   // DRAFT
    if (choosingFor != id) continue;
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

