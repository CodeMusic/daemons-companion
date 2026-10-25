// Part of ui.cpp (C-157): YOU: the trainer card, MARKS and ROOTS, the QR codes, the region maps, the NOTEBOOK card, GAME EVENTS. Included by ui.cpp in order -- not a file of its own: it
// shares ui.cpp's statics and may use anything the parts before it declare.
// ---- PROFILE (C-131): as the app's -- the player as the game draws them, the save's facts, the MARKS (the trainer card's
// badges) and ROOTS (each understanding's colour), each opening its words, and the NOTEBOOK by section, a page a tap.
// Everything comes from what the Tab5 keeps: profile, marks, notebook (net.cpp), and the pictures (fetchProfileArt).
static String reflowed(String t) {                // the game wraps lines to its box; a page here re-flows them
  t.replace("\n\n", "\x01"); t.replace("\n", " "); t.replace("\x01", "\n\n");
  return t;
}
static void showWords(const String &head, const String &body, const String &foot) {
  lv_obj_t *o = openOverlay();
  button(o, "BACK", closeOverlay, nullptr, false);
  label(o, head, &lv_font_montserrat_28, DAY, LV_PCT(100));
  label(o, body, &lv_font_montserrat_20, INK, LV_PCT(100));
  if (foot.length()) label(o, foot, &lv_font_montserrat_20, QUIET, LV_PCT(100));
}
// C-140 (the user, 2026-10-16): a MARK or a ROOT opened reads as a small page -- its own heading (a MARK's in ink beside its
// badge, a ROOT's in its own colour), the lesson's first line leading and the rest as points, then a small heading over
// each part of the pair as it is earned: the leader afterwards, the union PLUGIN, the insight.
static lv_obj_t *subHead(lv_obj_t *o, const String &t) { return label(o, t, &lv_font_montserrat_16, QUIET); }
static void points(lv_obj_t *o, const std::vector<String> &lines) {
  for (const String &l : lines) label(o, "-   " + l, &lv_font_montserrat_20, INK, LV_PCT(100));
}
static std::vector<String> paragraphs(JsonArray parts) {   // a lesson's scripts, re-flowed, a paragraph each
  std::vector<String> out;
  for (JsonVariant part : parts) {
    String t = reflowed(part.as<String>()) + "\n\n";
    int a = 0, b;
    while ((b = t.indexOf("\n\n", a)) >= 0) { String p = t.substring(a, b); p.trim(); if (p.length()) out.push_back(p); a = b + 2; }
  }
  return out;
}
static int rootOfMark(JsonDocument &m, int n) {           // the understanding a MARK pairs with (wisdom.root_flag)
  int f = m["marks"][n]["wisdom"]["root_flag"] | -1, k = 0;
  for (JsonObject u : m["understandings"].as<JsonArray>()) { if ((int)(u["flag"] | -2) == f) return k; k++; }
  return -1;
}
static void quote(lv_obj_t *o, const String &t) {
  lv_obj_t *q = label(o, t, &lv_font_montserrat_20, DAY, LV_PCT(100));
  lv_obj_set_style_border_side(q, LV_BORDER_SIDE_LEFT, 0); lv_obj_set_style_border_width(q, 4, 0);
  lv_obj_set_style_border_color(q, DAY, 0); lv_obj_set_style_pad_left(q, 12, 0);
}
static void tapMark(lv_event_t *e) {
  int i = (int)(long)lv_event_get_user_data(e);
  JsonDocument pr = newDoc(), m = newDoc();
  if (!kept("profile", pr) || !kept("marks", m)) return;
  lv_obj_t *o = openOverlay();
  button(o, "BACK", closeOverlay, nullptr, false);
  if (!(pr["marks"][i] | false)) { label(o, "MARK " + String(i + 1) + "  --  not yet earned.", &lv_font_montserrat_28, QUIET); return; }
  JsonObject mk = m["marks"][i];
  String title = mk["title"] | ""; title.toUpperCase();
  lv_obj_t *head = row(o);
  picture(head, "mark" + String(i + 1), 512);             // the badge, small
  label(head, title, &lv_font_montserrat_28, INK);
  std::vector<String> ps = paragraphs(mk["lesson"].as<JsonArray>());
  if (ps.size()) {                                         // its own name dropped: the heading says it
    String first = ps[0], up = first; up.toUpperCase();
    if (up.startsWith(title + ".")) { first = first.substring(title.length() + 1); first.trim(); }
    if (first.length()) label(o, first, &lv_font_montserrat_28, INK, LV_PCT(100));
    points(o, std::vector<String>(ps.begin() + 1, ps.end()));
  }
  label(o, "From the BENCHMARK in " + String((const char *)(mk["found"] | "")) + ".", &lv_font_montserrat_20, DAY, LV_PCT(100));
  JsonObject w = mk["wisdom"], got = pr["wisdom"][i];
  if (w.isNull() || got.isNull()) return;
  int r = rootOfMark(m, i);
  String leader = w["leader"] | "";
  subHead(o, (got["root"] | false) && r >= 0 ? leader + ", WITH " + String((const char *)(m["understandings"][r]["name"] | ""))
                                             : leader + ", AFTERWARDS");
  String said;
  for (JsonVariant l : ((got["root"] | false) ? w["with"] : w["without"]).as<JsonArray>()) said += l.as<String>() + " ";
  label(o, said, &lv_font_montserrat_20, INK, LV_PCT(100));
  if (got["given"] | false) {
    subHead(o, "UNION PLUGIN");
    label(o, String((const char *)(w["union_plugin"] | "")) + "  -  " + (const char *)(w["union_routine"] | ""), &lv_font_montserrat_20, INK);
    std::vector<String> ex; for (JsonVariant l : w["explain"].as<JsonArray>()) ex.push_back(l.as<String>());
    points(o, ex);
  }
  if (got["insight"] | false) {
    subHead(o, "INSIGHT  -  " + String((const char *)(w["virtue"] | "")));
    quote(o, w["insight"] | "");
  }
}
static void tapRoot(lv_event_t *e) {
  int i = (int)(long)lv_event_get_user_data(e);
  JsonDocument pr = newDoc(), m = newDoc();
  if (!kept("profile", pr) || !kept("marks", m)) return;
  lv_obj_t *o = openOverlay();
  button(o, "BACK", closeOverlay, nullptr, false);
  if (!(pr["roots"][i] | false)) { label(o, "Not yet.", &lv_font_montserrat_28, QUIET); return; }
  JsonObject u = m["understandings"][i];
  JsonArray rgb = u["rgb"].as<JsonArray>();
  lv_color_t col = rgb.size() == 3 ? lv_color_make(rgb[0] | 90, rgb[1] | 107, rgb[2] | 140) : DAY;
  label(o, u["name"] | "", &lv_font_montserrat_40, col);  // in its own colour
  std::vector<String> ps = paragraphs(u["lesson"].as<JsonArray>());   // T-405: read as a MARK's lesson is (C-140)
  if (ps.empty()) label(o, "Its lesson is still being written.", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  else {
    String first = ps[0], up = first, name = u["name"] | ""; up.toUpperCase(); name.toUpperCase();
    if (up.startsWith(name + ".")) { first = first.substring(name.length() + 1); first.trim(); }
    size_t next = 1;
    if (!first.length() && ps.size() > 1) first = ps[next++];   // a box that was only its name: the next one leads
    if (first.length()) label(o, first, &lv_font_montserrat_28, INK, LV_PCT(100));
    points(o, std::vector<String>(ps.begin() + next, ps.end()));
  }
  int n = -1;
  for (int k = 0; k < (int)m["marks"].size(); k++) if (rootOfMark(m, k) == i) n = k;
  if (n < 0 || !(pr["marks"][n] | false)) return;
  subHead(o, "PAIRED WITH");
  lv_obj_t *pm = row(o);
  picture(pm, "mark" + String(n + 1), 512);
  String t = m["marks"][n]["title"] | ""; t.toUpperCase();
  label(pm, t, &lv_font_montserrat_20, INK);
  if (pr["wisdom"][n]["insight"] | false) {
    subHead(o, "INSIGHT  -  " + String((const char *)(m["marks"][n]["wisdom"]["virtue"] | "")));
    quote(o, m["marks"][n]["wisdom"]["insight"] | "");
  }
}
// The game's QR codes, here as the code itself: the Tab5 has no browser, so a page that ends on one (a NOTEBOOK page's song
// or post, the GUIDE's last chapter) shows it large enough to scan with a phone (the user, 2026-10-16)
static void qrFor(lv_obj_t *parent, const String &url, lv_color_t dark, lv_color_t light) {
  if (!url.length()) return;
  bool song = url.indexOf("soundcloud.com") >= 0 || url.indexOf("youtu") >= 0 || url.indexOf("spotify.com") >= 0 || url.indexOf("bandcamp.com") >= 0;
  label(parent, song ? "Scan with your phone to listen." : "Scan with your phone to read.", &lv_font_montserrat_20, QUIET, LV_PCT(100));   // DRAFT
  lv_obj_t *q = lv_qrcode_create(parent);
  lv_qrcode_set_size(q, 360);
  lv_qrcode_set_dark_color(q, dark);
  lv_qrcode_set_light_color(q, light);
  lv_qrcode_update(q, url.c_str(), url.length());
  lv_obj_set_style_border_color(q, light, 0);       // the quiet zone a phone needs around it
  lv_obj_set_style_border_width(q, 16, 0);
}
// T-417: a SONGBOOK page's motif, as the game draws it -- the key's note in the key's colour, then the heads on a treble
// staff, each coloured by its pitch class (the twelve key colours, exported in notebook.json), a sharp or flat beside it.
// E4 on the bottom line, a step a line or a space, ledger lines where needed. Absolute positions in a box of its own.
static int staffStep(const String &n, int &pc, char &acc) {
  static const char *L = "CDEFGAB"; static const int PCS[] = { 0, 2, 4, 5, 7, 9, 11 };
  if (n.length() < 2) return 99;
  const char *at = strchr(L, n[0]); if (!at) return 99;
  int i = at - L, k = 1; acc = 0;
  if (n[1] == '#' || n[1] == 'b') { acc = n[1]; k = 2; }
  pc = (PCS[i] + (acc == '#' ? 1 : acc == 'b' ? 11 : 0)) % 12;
  return n.substring(k).toInt() * 7 + i - (4 * 7 + 2);
}
static lv_color_t keyColour(JsonArray colours, int pc) {
  const char *h = colours[pc] | "";
  return strlen(h) == 7 ? lv_color_hex(strtol(h + 1, nullptr, 16)) : INK;
}
static void songStaff(lv_obj_t *parent, const String &key, JsonArray notes, JsonArray colours, const char *outline = "") {
  int kpc; char kacc; staffStep(key + "4", kpc, kacc);
  lv_obj_t *kr = row(parent);
  lv_obj_t *dot = lv_obj_create(kr); lv_obj_set_size(dot, 24, 24); lv_obj_set_style_radius(dot, 12, 0);
  lv_obj_set_style_bg_color(dot, keyColour(colours, kpc), 0); lv_obj_set_style_border_width(dot, 0, 0);
  label(kr, "IN " + key, &lv_font_montserrat_20, QUIET);
  const int GAP = 20, HEAD = 24, COL = 52, LEFT = 30;
  int lo = 0, hi = 8, n = 0; std::vector<int> st, pcs; std::vector<char> accs;
  for (JsonVariant v : notes) { int pc; char a; int s = staffStep(v.as<String>(), pc, a); if (s == 99) continue;
    st.push_back(s); pcs.push_back(pc); accs.push_back(a); lo = min(lo, s); hi = max(hi, s); n++; }
  auto yOf = [&](int s) { return (hi - s) * (GAP / 2) + HEAD / 2; };
  lv_obj_t *box = lv_obj_create(parent);
  lv_obj_set_size(box, LEFT + n * COL + 16, yOf(lo) + HEAD);
  lv_obj_set_style_bg_opa(box, LV_OPA_TRANSP, 0); lv_obj_set_style_border_width(box, 0, 0); lv_obj_set_style_pad_all(box, 0, 0);
  lv_obj_remove_flag(box, LV_OBJ_FLAG_SCROLLABLE);
  auto line = [&](int x, int w, int s) { lv_obj_t *l = lv_obj_create(box); lv_obj_set_size(l, w, 2); lv_obj_set_pos(l, x, yOf(s));
    lv_obj_set_style_bg_color(l, QUIET, 0); lv_obj_set_style_border_width(l, 0, 0); lv_obj_set_style_radius(l, 0, 0); };
  for (int s = 0; s <= 8; s += 2) line(0, LEFT + n * COL + 16, s);
  for (int i = 0; i < n; i++) {
    int x = LEFT + i * COL;
    for (int s = -2; s >= st[i]; s -= 2) line(x - 8, HEAD + 16, s);
    for (int s = 10; s <= st[i]; s += 2) line(x - 8, HEAD + 16, s);
    if (accs[i]) { lv_obj_t *a = label(box, accs[i] == '#' ? "#" : "b", &lv_font_montserrat_20, QUIET); lv_obj_set_pos(a, x - 20, yOf(st[i]) - 14); }
    lv_obj_t *h = lv_obj_create(box); lv_obj_set_size(h, HEAD + 4, HEAD - 2); lv_obj_set_pos(h, x, yOf(st[i]) - HEAD / 2 + 1);
    lv_obj_set_style_radius(h, LV_RADIUS_CIRCLE, 0); lv_obj_set_style_bg_color(h, keyColour(colours, pcs[i]), 0);
    lv_obj_set_style_border_color(h, strlen(outline) == 7 ? lv_color_hex(strtol(outline + 1, nullptr, 16)) : lv_color_hex(0x1D2026), 0);
    lv_obj_set_style_border_width(h, 2, 0);
  }
}
static void tapPage(lv_event_t *e) {
  long v = (long)lv_event_get_user_data(e);
  JsonDocument nb = newDoc();
  if (!kept("notebook", nb)) return;
  JsonObject pg = nb["sections"][(int)(v >> 8)]["pages"][(int)(v & 0xFF)];
  String text = !pg["text"].isNull() ? reflowed(pg["text"].as<String>())
               : String(pg["kind"] | "") == "song" ? String("The game draws its notes in the key you played it in.")   // T-417, DRAFT
               : String("Written by the game from your save each time you open it there.");
  String place = pg["place"] | "";
  bool staff = String(pg["kind"] | "") == "song" && pg["notes"].as<JsonArray>().size();
  showWords(pg["title"] | "", staff ? String(pg["about"] | "") : text, place.length() ? "Found in " + place + "." : String(""));
  if (overlay && staff) songStaff(overlay, pg["key"] | "", pg["notes"].as<JsonArray>(), nb["keyColours"].as<JsonArray>(), nb["outline"] | "");
  if (overlay) qrFor(overlay, pg["link"] | "", lv_color_black(), lv_color_white());
}
// C-127 on the Tab5: a region as the game's region map draws it, cropped to its cells, a cell a place, lit when the save
// has visited it -- a place with no flag (a route) when it touches a lit one -- and ??? until the REVIEW BOARD. Each row is
// drawn as runs of one colour, so a map is a few dozen rectangles, not hundreds.
static void regionMap(lv_obj_t *parent, JsonObject region, JsonObject pr, int cell) {
  bool open = region["hidden_until"].isNull() || (pr["gameClear"] | false);
  std::map<String, bool> visited;
  for (JsonVariant v : pr["visited"].as<JsonArray>()) visited[v.as<String>()] = true;
  JsonObject secs = region["sections"];
  auto flagged = [&](const String &m) { return !secs[m].isNull() && !secs[m]["visited_flag"].isNull(); };
  lv_obj_t *col = column(parent, LV_SIZE_CONTENT);
  lv_obj_set_flex_align(col, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_t *maps = row(col);
  for (JsonObject map : region["maps"].as<JsonArray>()) {
    JsonArray grid = map["grid"];
    int H = grid.size(), W = H ? grid[0].size() : 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    std::map<String, bool> lit;
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
      String m = grid[y][x].as<String>();
      if (m == "MAPSEC_NONE") continue;
      x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y);
      if (open && flagged(m) && visited.count(m)) lit[m] = true;
    }
    if (x1 < 0) continue;
    if (open) for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {      // a route lights when it touches a lit town
      String m = grid[y][x].as<String>();
      if (m == "MAPSEC_NONE" || lit.count(m) || flagged(m)) continue;
      const int d[4][2] = { { 0, 1 }, { 1, 0 }, { 0, -1 }, { -1, 0 } };
      for (auto &k : d) {
        int nx = x + k[0], ny = y + k[1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        String n = grid[ny][nx].as<String>();
        if (lit.count(n) && flagged(n)) { lit[m] = true; break; }
      }
    }
    lv_obj_t *box = lv_obj_create(maps);
    lv_obj_set_size(box, (x1 - x0 + 1) * cell, (y1 - y0 + 1) * cell);
    lv_obj_set_style_bg_opa(box, LV_OPA_TRANSP, 0); lv_obj_set_style_border_width(box, 0, 0); lv_obj_set_style_pad_all(box, 0, 0);
    lv_obj_remove_flag(box, LV_OBJ_FLAG_SCROLLABLE);
    for (int y = y0; y <= y1; y++) {
      int x = x0;
      while (x <= x1) {
        String m = grid[y][x].as<String>();
        if (m == "MAPSEC_NONE") { x++; continue; }
        bool on = lit.count(m) > 0;
        int run = x;
        while (run <= x1) { String r = grid[y][run].as<String>(); if (r == "MAPSEC_NONE" || (lit.count(r) > 0) != on) break; run++; }
        lv_obj_t *r = lv_obj_create(box);
        lv_obj_set_pos(r, (x - x0) * cell, (y - y0) * cell);
        lv_obj_set_size(r, (run - x) * cell - 1, cell - 1);
        lv_obj_set_style_radius(r, 0, 0); lv_obj_set_style_border_width(r, 0, 0); lv_obj_set_style_pad_all(r, 0, 0);
        lv_obj_set_style_bg_color(r, on ? DAY : UNLIT, 0);
        lv_obj_remove_flag(r, LV_OBJ_FLAG_CLICKABLE);
        x = run;
      }
    }
  }
  label(col, open ? String((const char *)(region["name"] | "")) : String("???"), &lv_font_montserrat_20, QUIET);
}

static void tapEvents(lv_event_t *);
static void drawProfile(lv_obj_t *p) {
  JsonDocument pr = newDoc();
  if (!kept("profile", pr) || pr["name"].isNull()) { label(p, "Nothing kept yet: the PROFILE comes from your save, after a SYNC.", &lv_font_montserrat_28, QUIET, LV_PCT(100)); return; }
  bool instinct = String((const char *)(pr["choice"] | "REASON")) == "INSTINCT";
  String who = instinct ? "instinct" : "reason";
  lv_obj_t *c = card(p);
  lv_obj_t *top = row(c);
  picture(top, "player_" + who, 768);             // the trainer card's picture, 3x
  picture(top, "player_" + who + "_walk", 768);   // and as they walk
  lv_obj_t *id = column(top, LV_SIZE_CONTENT);
  label(id, pr["name"] | "", &lv_font_montserrat_48, INK);
  char no[8]; snprintf(no, sizeof no, "%05d", (int)(pr["trainerId"] | 0));
  label(id, String((const char *)(pr["edition"] | "")) + "  -  ID No. " + no, &lv_font_montserrat_20, QUIET);
  String rival = pr["rival"] | "";
  label(id, String((const char *)(pr["choice"] | "")) + (rival.length() ? "  -  rival " + rival : String("")), &lv_font_montserrat_20, INK);
  if (!pr["savedIn"].isNull()) label(id, "Last saved in " + String((const char *)(pr["savedIn"]["place"] | "")), &lv_font_montserrat_20, QUIET);
  JsonDocument rg = newDoc();                       // C-127: the two regions, filling in as they are explored
  if (kept("regions", rg)) for (JsonObject r : rg["regions"].as<JsonArray>())
    regionMap(top, r, pr.as<JsonObject>(), r["maps"].size() > 1 ? 6 : 10);
  lv_obj_t *f = card(p);
  JsonObject t = pr["playTime"];
  char pt[16]; snprintf(pt, sizeof pt, "%d:%02d", (int)(t["hours"] | 0), (int)(t["minutes"] | 0));
  String shoes = pr["shoes"].isNull() ? String("not yet") : String((const char *)pr["shoes"]) + "'s";
  label(f, String("PLAY TIME  ") + pt + "      MONEY  " + String((long)(pr["money"] | 0)) + "      SHOES  " + shoes, &lv_font_montserrat_20, INK, LV_PCT(100));
  String at;                                                 // C-151: the boards at the reels now, each by its daemon (DRAFT)
  for (JsonObject t : pr["casino"]["table"].as<JsonArray>()) at += (at.length() ? ", " : "") + String((const char *)(t["name"] | ""));
  if (at.length()) label(f, "At the CASINO now: " + at + ".", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  long won = pr["casino"]["pending"] | 0L, spins = pr["casino"]["spins"] | 0L;   // C-149: the CASINO's, at the next SYNC (DRAFT)
  if (won || spins) label(f, String("The CASINO: ") + (won > 0 ? "+" + String(won) : won < 0 ? String(won) : String("even")) + " over " +
                             String(spins) + (spins == 1 ? " spin" : " spins") + ", into your save at the next SYNC (then " +
                             String((long)(pr["casino"]["balance"] | 0L)) + ").", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  JsonObject ix = pr["index"];
  label(f, (ix["held"] | false) ? "INDEX  " + String((int)(ix["bound"] | 0)) + " bound - " + String((int)(ix["seen"] | 0)) + " seen" : String("INDEX  not yet held"),
        &lv_font_montserrat_20, INK);
  label(f, String("DIPLOMA  ") + ((pr["diploma"] | false) ? "earned" : "not yet") + "      OPUS  " + ((pr["opus"] | false) ? "carried" : "not carried"),
        &lv_font_montserrat_20, INK);
  // MARKS: the badges, faint until earned; a tap opens the lesson
  label(f, "MARKS  (tap one)", &lv_font_montserrat_20, QUIET);
  lv_obj_t *mr = row(f);
  JsonArray marks = pr["marks"].as<JsonArray>();
  for (int i = 0; i < 8; i++) {
    lv_obj_t *b = lv_button_create(mr);
    lv_obj_set_style_bg_opa(b, LV_OPA_TRANSP, 0); lv_obj_set_style_shadow_width(b, 0, 0); lv_obj_set_style_pad_all(b, 2, 0);
    lv_obj_t *img = picture(b, "mark" + String(i + 1), 1024);   // 16 px, 4x
    lv_obj_set_style_opa(img, (marks[i] | false) ? LV_OPA_COVER : LV_OPA_20, 0);
    lv_obj_add_event_cb(b, [](lv_event_t *) { soundSelect(); }, LV_EVENT_CLICKED, nullptr);
    lv_obj_add_event_cb(b, tapMark, LV_EVENT_CLICKED, (void *)(long)i);
  }
  // ROOTS: each understanding in its own colour, filled when held -- never a count
  JsonDocument m = newDoc(); bool haveMarks = kept("marks", m);
  label(f, "ROOTS", &lv_font_montserrat_20, QUIET);
  lv_obj_t *rr = row(f);
  JsonArray roots = pr["roots"].as<JsonArray>();
  for (int i = 0; i < (int)roots.size(); i++) {
    JsonArray rgb = haveMarks ? m["understandings"][i]["rgb"].as<JsonArray>() : JsonArray();
    lv_color_t col = rgb.size() == 3 ? lv_color_make(rgb[0] | 90, rgb[1] | 107, rgb[2] | 140) : DAY;
    lv_obj_t *dot = lv_button_create(rr);
    lv_obj_set_size(dot, 44, 44);
    lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_shadow_width(dot, 0, 0);
    lv_obj_set_style_border_width(dot, 4, 0); lv_obj_set_style_border_color(dot, col, 0);
    bool held = roots[i] | false;
    lv_obj_set_style_bg_color(dot, col, 0); lv_obj_set_style_bg_opa(dot, held ? LV_OPA_COVER : LV_OPA_TRANSP, 0);
    lv_obj_set_style_opa(dot, held ? LV_OPA_COVER : LV_OPA_50, 0);
    lv_obj_add_event_cb(dot, [](lv_event_t *) { soundSelect(); }, LV_EVENT_CLICKED, nullptr);
    lv_obj_add_event_cb(dot, tapRoot, LV_EVENT_CLICKED, (void *)(long)i);
  }
  // C-132: the groves found, each its universe; C-128: GAME EVENTS, behind a button (forty-odd rows)
  JsonDocument gv = newDoc();
  JsonArray found = pr["groves"].as<JsonArray>();
  if (found.size() && kept("groves", gv)) {
    lv_obj_t *g = card(p);
    label(g, "GROVES  -  beyond them all, " + String((const char *)(gv["nexus"] | "")), &lv_font_montserrat_20, QUIET, LV_PCT(100));
    for (JsonObject gr : gv["groves"].as<JsonArray>()) {
      bool mine = false;
      for (JsonVariant f2 : found) if (f2.as<String>() == String((const char *)(gr["grove"] | ""))) mine = true;
      if (!mine) continue;
      String sign = gr["sign"] | ""; sign.replace("\n", " ");
      label(g, gr["universe"] | "", &lv_font_montserrat_28, DAY);
      label(g, sign, &lv_font_montserrat_20, INK, LV_PCT(100));
    }
  }
  button(p, "GAME EVENTS", tapEvents, nullptr, false);
}

// C-156: the NOTEBOOK, now on the LIBRARY's shelf: the game's sections, a page a tap; a page not yet opened in the game is
// marked. The SONGBOOK's section is the SONGBOOK's own.
static void notebookCard(lv_obj_t *p) {
  lv_obj_t *n = card(p);
  label(n, "NOTEBOOK", &lv_font_montserrat_20, QUIET);
  JsonDocument nb = newDoc();
  if (!kept("notebook", nb) || !(nb["held"] | false)) { label(n, "Not carried yet.", &lv_font_montserrat_20, INK); return; }
  JsonArray secs = nb["sections"].as<JsonArray>();
  if (!secs.size()) { label(n, "Nothing filed in it yet.", &lv_font_montserrat_20, INK); return; }
  for (int s = 0; s < (int)secs.size(); s++) {
    if (String((const char *)(secs[s]["name"] | "")) == "SONGBOOK") continue;
    label(n, secs[s]["name"] | "", &lv_font_montserrat_20, DAY);
    lv_obj_t *pr2 = row(n);
    JsonArray pages = secs[s]["pages"].as<JsonArray>();
    for (int k = 0; k < (int)pages.size() && k < 256; k++)
      button(pr2, String((pages[k]["unread"] | false) ? "* " : "") + (const char *)(pages[k]["title"] | ""), tapPage, (void *)(long)((s << 8) | k), false);
  }
}

// C-128 on the Tab5: GAME EVENTS in an overlay, by section -- + held and named, a row not yet held only "Still to come."
static void tapEvents(lv_event_t *) {
  JsonDocument pg = newDoc();
  if (!kept("progress", pg)) return;
  lv_obj_t *o = openOverlay();
  button(o, "BACK", closeOverlay, nullptr, false);
  label(o, "GAME EVENTS", &lv_font_montserrat_28, DAY);
  String sec;
  for (JsonObject e : pg["events"].as<JsonArray>()) {
    if (sec != String((const char *)(e["section"] | ""))) { sec = e["section"] | ""; label(o, sec, &lv_font_montserrat_20, QUIET); }
    if (e["held"].isNull()) label(o, "?  " + String((const char *)(e["name"] | "")), &lv_font_montserrat_20, QUIET, LV_PCT(100));
    else if (e["held"] | false) label(o, "+  " + String((const char *)(e["name"] | "")), &lv_font_montserrat_20, INK, LV_PCT(100));
    else label(o, ".  Still to come.", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  }
}

