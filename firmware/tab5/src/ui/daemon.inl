// Part of ui.cpp (C-157): DAEMON: the care, NEARBY, THE CASINO, the news banner, the daemon's page. Included by ui.cpp in order -- not a file of its own: it
// shares ui.cpp's statics and may use anything the parts before it declare.
// ---- DAEMON -----------------------------------------------------------------------------------------------------------
static void tapSyncGame(lv_event_t *) { netGameSync(); }

// C-118: the care, as the app and the boards have it -- answered at once, then sent (kept if nothing answers, C-87)
static const char *CARE_KIND[] = { "feed", "water", "train", "sleep", "wake" }, *CARE_SAID[] = { "Eaten.", "Drank.", "Trained.", "Asleep.", "Awake." };   // DRAFT
static String careSaid;
static void tapCare(lv_event_t *e) {
  int k = (int)(long)lv_event_get_user_data(e);
  careSaid = CARE_SAID[k];
  // C-121 (the user, 2026-10-15: "presume the happy path show the screen feedback and then send to the server"): the
  // kept state takes the care at once -- asleep or awake, the day's meal or drink counted -- so the page is drawn as it
  // will be (WAKE, or DRINK FEED TRAIN SLEEP) before the companion answers; its answer, when it comes, replaces it
  JsonDocument st = newDoc();
  if (kept("state", st) && !st["daemon"].isNull()) {
    JsonObject life = st["daemon"]["life"];
    if (life.isNull()) life = st["daemon"]["life"].to<JsonObject>();
    String tired = (const char *)(life["tired"] | "awake");
    life["tired"] = String(k == 3 ? "asleep" : k == 4 || tired == "asleep" ? "awake" : tired.c_str());
    if (k == 0) life["fed"]["today"] = min(3, (int)(life["fed"]["today"] | 0) + 1);
    if (k == 1) life["watered"]["today"] = min(3, (int)(life["watered"]["today"] | 0) + 1);
    String json; serializeJson(st, json);
    keep("state", json);
  }
  drawnAt[P_DAEMON] = 0;
  if (k == 4) soundWake(); else soundCare(k);
  netSend("POST", String("/api/daemon/") + CARE_KIND[k], "{}");
}

// ---- NEARBY (C-134, broadcasts; the hub is server/src/broadcast.ts): what the daemons have said or done -- typed, or an
// interaction from the shared list -- by LoRa, Bluetooth or the companion, each once; an act from another daemon can be
// answered, once. Sent through netSend, so it is kept until the companion answers. Words from the hub's own lines.
static String castLine(JsonObject c, JsonDocument &acts) {
  String name = c["name"] | "", kind = c["kind"] | "";
  if (kind == "say") return name + ": " + (const char *)(c["text"] | "");
  for (const char *list : { "acts", "casino" })              // C-151: the CASINO's JACKPOT and BIGWIN too
    for (JsonObject a : acts[list].as<JsonArray>())
      if (String((const char *)(a["code"] | "")) == String((const char *)(c["act"] | "")))
        return name + " " + (const char *)(kind == "reply" ? (a["reply"] | "") : (a["seen"] | ""));
  return name;
}
static void sentSay(const String &text) {
  if (!text.length()) return;
  JsonDocument d; d["kind"] = "say"; d["text"] = text.substring(0, 40);
  String body; serializeJson(d, body);
  netSend("POST", "/api/broadcast", body);
}
static void tapSay(lv_event_t *) { askText("Say something to every daemon nearby (40 letters)", "", false, false, sentSay); }
static void tapAct(lv_event_t *e) {
  JsonDocument acts = newDoc();
  if (!kept("acts", acts)) return;
  JsonDocument d; d["kind"] = "act"; d["act"] = acts["acts"][(int)(long)lv_event_get_user_data(e)]["code"];
  String body; serializeJson(d, body);
  netSend("POST", "/api/broadcast", body);
}
static void tapAnswer(lv_event_t *e) {
  JsonDocument b = newDoc();
  if (!kept("broadcasts", b)) return;
  JsonObject c = b["items"][(int)(long)lv_event_get_user_data(e)];
  JsonDocument d; d["kind"] = "reply"; d["act"] = c["act"]; d["replyTo"] = c["id"];
  String body; serializeJson(d, body);
  netSend("POST", "/api/broadcast", body);
}
// C-155 (the user, 2026-10-18: "make sure it has the routines -- like casino"): THE CASINO on the Tab5, a player of its own
// (its device id, so its JACK is its own daemon), by slots.h -- the boards' table. Three reels of the JACK, the party's
// others, the coin and the season; seven bets; a seat at the table while it is open; what it wins or loses sent to the
// companion every ten pulls and on leaving (INTERACT casino), a big win called to the table. Every word DRAFT.
static lv_obj_t *reelBox[3], *casinoCoins, *casinoSaid, *casinoBetRow;
static uint8_t reelAt[3] = { slots::COIN, slots::JACK, slots::SEASON }, reelWant[3];
static int casinoBet = 10, casinoTick = -1, casinoOutcome = 0, casinoJack = -1, casinoFriend[3] = { -1, -1, -1 }, unsentSpins = 0, casinoSeqN = 0;
static long unsentDelta = 0, reportedDelta = 0, stateBalance = 0;
static String casinoSeason, casinoBootHex, lastReport;
static lv_timer_t *casinoTimer = nullptr;
static uint32_t seatAt = 0;
static bool casinoOpen = false;
static long casinoBalance() { long b = stateBalance + unsentDelta + reportedDelta; return b < 0 ? 0 : b > 999999 ? 999999 : b; }
static void casinoSeat(const char *how) { netSend("POST", "/api/device/interact", String("{\"kind\":\"table\",\"detail\":\"") + how + " " + deviceId() + "\"}"); seatAt = millis(); }
static void casinoReport() {
  if (!unsentSpins) return;
  if (!casinoBootHex.length()) { char h[5]; snprintf(h, sizeof h, "%04x", (unsigned)(esp_random() & 0xFFFF)); casinoBootHex = h; }
  lastReport = casinoBootHex + "." + String(++casinoSeqN);
  netSend("POST", "/api/device/interact", "{\"kind\":\"casino\",\"detail\":\"" + String(unsentDelta) + " " + lastReport + " " + deviceId() + " " + String(unsentSpins) + "\"}");
  reportedDelta += unsentDelta; unsentDelta = 0; unsentSpins = 0;
}
static void casinoTakeState() {                     // the coins as the companion knows them, and this Tab5's reports it has counted
  JsonDocument st = newDoc();
  if (!kept("state", st) || st["casino"].isNull()) return;
  stateBalance = st["casino"]["balance"] | 0L;
  if (lastReport.length() && String((const char *)(st["casino"]["seen"] | "")) == lastReport) reportedDelta = 0;
  casinoSeason = String((const char *)(st["season"] | ""));
  casinoJack = st["daemon"].isNull() ? -1 : (int)(st["daemon"]["slot"] | -1);
  JsonArray fr = st["casino"]["friends"].as<JsonArray>();
  int k = 0, at = 0;
  if (casinoJack < 0 && fr.size()) { casinoJack = fr[0] | -1; at = 1; }   // no daemon of its own: the party's first is the JACK
  for (int i = 0; i < 3; i++) casinoFriend[i] = -1;
  for (int i = at; i < (int)fr.size() && k < 3; i++) casinoFriend[k++] = fr[i] | -1;
}
static void casinoDrawPiece(int i) {
  lv_obj_clean(reelBox[i]);
  int p = reelAt[i], slot = p == slots::JACK ? casinoJack : p <= slots::F3 ? casinoFriend[p - 1] : -1;
  lv_obj_t *o;
  if (slot >= 0) o = picture(reelBox[i], "p" + String(slot), 512);
  else if (p == slots::COIN) {
    o = lv_obj_create(reelBox[i]); lv_obj_set_size(o, 100, 100); lv_obj_set_style_radius(o, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(o, lv_color_hex(0xE8B830), 0); lv_obj_set_style_border_color(o, lv_color_hex(0xA07A10), 0);
    lv_obj_set_style_border_width(o, 6, 0);
  } else {
    String t = p == slots::SEASON ? casinoSeason : String("?"); t.toUpperCase();
    lv_color_t c = casinoSeason == "winter" ? lv_color_hex(0x6C9CC6) : casinoSeason == "spring" ? lv_color_hex(0x4C9C4C)
                 : casinoSeason == "summer" ? lv_color_hex(0xC8A527) : lv_color_hex(0xC9721B);
    o = label(reelBox[i], t, &lv_font_montserrat_28, c);
  }
  lv_obj_center(o);
}
static void casinoShowCoins() { if (casinoCoins) lv_label_set_text(casinoCoins, String(casinoBalance()).c_str()); }
static void casinoStep(lv_timer_t *t) {
  if (!casinoOpen) { lv_timer_delete(t); casinoTimer = nullptr; return; }
  casinoTick++;
  for (int i = 0; i < 3; i++) { reelAt[i] = casinoTick >= 9 + i * 4 ? reelWant[i] : (reelAt[i] + 1 + i) % 6; casinoDrawPiece(i); }
  if (casinoTick < 17) return;
  lv_timer_delete(t); casinoTimer = nullptr; casinoTick = -1;
  long paid = (long)casinoBet * slots::PAYS[casinoOutcome], won = paid - casinoBet;
  unsentDelta += won; unsentSpins++;
  lv_label_set_text(casinoSaid, casinoOutcome == 0 ? ("-" + String(casinoBet)).c_str()
                    : ((casinoOutcome == 6 ? String("JACKPOT!  +") : String("+")) + String(paid)).c_str());
  if (const char *act = slots::tableAct(casinoOutcome)) netSend("POST", "/api/broadcast", String("{\"kind\":\"act\",\"act\":\"") + act + "\"}");
  if (unsentSpins >= 10) casinoReport();
  casinoShowCoins();
}
static void casinoPull(lv_event_t *) {
  if (casinoTimer || casinoBet > casinoBalance()) return;
  casinoOutcome = slots::draw(); slots::piecesFor(casinoOutcome, reelWant);
  lv_label_set_text(casinoSaid, ""); casinoTick = 0;
  soundSelect();
  casinoTimer = lv_timer_create(casinoStep, 80, nullptr);
}
static void casinoDrawBets();
static void casinoTapBet(lv_event_t *e) { int b = (int)(long)lv_event_get_user_data(e); if (b <= casinoBalance()) { casinoBet = b; casinoDrawBets(); } }
static void casinoDrawBets() {
  lv_obj_clean(casinoBetRow);
  for (int i = 0; i < slots::BET_N; i++) {
    lv_obj_t *b = button(casinoBetRow, String(slots::BETS[i]), casinoTapBet, (void *)(long)slots::BETS[i], slots::BETS[i] == casinoBet);
    if (slots::BETS[i] > casinoBalance()) lv_obj_set_style_opa(b, LV_OPA_40, 0);
  }
}
static void casinoLeave() {
  if (casinoTimer) {                                // the review, 2026-10-18: a pull left mid-spin is settled, as the
    lv_timer_delete(casinoTimer); casinoTimer = nullptr; casinoTick = -1;   // handhelds settle it -- never escaped
    unsentDelta += (long)casinoBet * slots::PAYS[casinoOutcome] - casinoBet; unsentSpins++;
  }
  casinoReport(); casinoSeat("gone"); casinoOpen = false;
  casinoCoins = casinoSaid = casinoBetRow = nullptr;  // the overlay goes with them
  for (int i = 0; i < 3; i++) reelBox[i] = nullptr;
}
static void tapCasino(lv_event_t *) {
  JsonDocument st = newDoc();
  if (!kept("state", st) || st["casino"].isNull()) { showWords("THE CASINO", "The CASINO plays with your save's money: the companion has to read your save first.", ""); return; }
  casinoTakeState();
  lv_obj_t *o = openOverlay();
  casinoOpen = true; overlayClosing = casinoLeave; casinoSeat("here");
  button(o, "LEAVE", closeOverlay, nullptr, false);
  label(o, "THE CASINO", &lv_font_montserrat_28, DAY);
  lv_obj_t *cr = row(o);
  label(cr, "COINS", &lv_font_montserrat_20, QUIET);
  casinoCoins = label(cr, "", &lv_font_montserrat_40, INK);
  lv_obj_t *reels = row(o);
  for (int i = 0; i < 3; i++) {
    reelBox[i] = lv_obj_create(reels); lv_obj_set_size(reelBox[i], 190, 190);
    lv_obj_set_style_border_color(reelBox[i], DAY, 0); lv_obj_set_style_border_width(reelBox[i], 4, 0);
    lv_obj_remove_flag(reelBox[i], LV_OBJ_FLAG_SCROLLABLE);
    casinoDrawPiece(i);
  }
  casinoSaid = label(o, "", &lv_font_montserrat_40, DAY);
  casinoBetRow = row(o); casinoDrawBets();
  button(o, "PULL", casinoPull);
  JsonDocument d = newDoc(); kept("state", d);
  String jackName = d["daemon"].isNull() ? String("your daemon") : String((const char *)(d["daemon"]["nickname"] | "your daemon"));
  label(o, "Three of " + jackName + " pays fifty times. What you win or lose reaches your save at the next SYNC.", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  String at; for (JsonObject t : d["casino"]["table"].as<JsonArray>()) at += (at.length() ? ", " : "") + String((const char *)(t["name"] | ""));
  if (at.length()) label(o, "At the table: " + at + ".", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  casinoShowCoins();
}
// C-158 (the user, 2026-10-18: "a casino admin section [app/site/tab5] where you can see who all is gambling and the current
// odds ... clicking on it explains why those odds are active"): THE HOUSE, from GET /api/casino -- today's odds and why,
// and everyone at the reels with the odds each last said; a tap on one opens its reasons. Every word DRAFT.
static String kindName(const String &kind);         // places.inl's
static String houseOpen;                            // the player whose reasons are open
static String houseBack(float rtp) { char b[40]; snprintf(b, sizeof b, "%.1f back of every 100", rtp * 100); return b; }
static void houseReasons(lv_obj_t *c, JsonArray reasons) {
  for (JsonObject r : reasons) {
    float e = r["effect"] | 0.0f; bool str = String((const char *)(r["source"] | "")) == "the string";
    float pts = str ? e : e * 5;                    // the day's luck moves the return 5 a whole step (slots.ts RETURN_AT)
    char p[12]; snprintf(p, sizeof p, "%+.1f", pts);
    lv_obj_t *l = row(c);
    label(l, p, &lv_font_montserrat_20, e > 0 ? lv_color_hex(0x3F8F4F) : e < 0 ? lv_color_hex(0xB0413E) : QUIET);
    label(l, r["why"] | "", &lv_font_montserrat_20, INK, LV_PCT(80));
  }
}
static void houseTap(lv_event_t *e) {
  String d = (const char *)lv_event_get_user_data(e);
  houseOpen = houseOpen == d ? String("") : d;
  watchAgain();
}
static void drawHouse(lv_obj_t *box, JsonDocument &h) {
  static std::vector<String> ids; ids.clear(); ids.reserve(16);
  lv_obj_t *c = card(box);
  label(c, "TODAY'S ODDS", &lv_font_montserrat_20, QUIET);
  label(c, houseBack(h["context"]["rtp"] | 0.95f), &lv_font_montserrat_40, INK);
  String day = (const char *)(h["holiday"]["name"] | "");
  String watch = (const char *)(h["world"]["watch"] | ""); watch.toLowerCase();
  day += (day.length() ? " - " : "") + watch;
  JsonObject w = h["world"]["weather"];
  day += w.isNull() ? String(" - no city set for the weather (the site's SETTINGS)")
                    : " - " + String((const char *)(w["kind"] | "")) + ", " + String((int)(w["tempC"] | 0)) + " C in " + String((const char *)(w["city"] | ""));
  label(c, day, &lv_font_montserrat_20, QUIET, LV_PCT(100));
  houseReasons(c, h["context"]["reasons"].as<JsonArray>());
  label(box, "AT THE REELS", &lv_font_montserrat_20, QUIET);
  JsonArray players = h["players"].as<JsonArray>();
  if (!players.size()) label(box, "Nobody is playing just now.", &lv_font_montserrat_20, QUIET);
  for (JsonObject p : players) { if (ids.size() < 16) ids.push_back((const char *)(p["device"] | "")); }
  int i = 0;
  for (JsonObject p : players) {
    if (i >= (int)ids.size()) break;
    const String &id = ids[i++];
    lv_obj_t *pc = card(box);
    lv_obj_add_flag(pc, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(pc, houseTap, LV_EVENT_CLICKED, (void *)id.c_str());
    lv_obj_t *r = row(pc);
    int sp = p["species"] | 0;
    if (sp) picture(r, "s" + String(sp), 256);
    lv_obj_t *col = column(r, LV_SIZE_CONTENT);
    label(col, p["name"] | "", &lv_font_montserrat_28, INK);
    String kind = id.startsWith("site-") ? String("A site") : kindName(id.substring(0, id.lastIndexOf('-') > 0 ? id.lastIndexOf('-') : id.length()));
    JsonObject o = p["odds"];
    label(col, kind + " - " + (o.isNull() ? String("the day's odds") : houseBack(o["rtp"] | 0.95f)), &lv_font_montserrat_20, QUIET);
    if (houseOpen == id) {
      if (!o.isNull()) label(pc, String((int)(o["dry"] | 0)) + " pulls since a win - " + String((int)(o["streak"] | 0)) + " wins running",
                             &lv_font_montserrat_20, QUIET, LV_PCT(100));
      houseReasons(pc, p["reasons"].as<JsonArray>());
    } else label(pc, "Why >", &lv_font_montserrat_16, DAY);
  }
  label(box, "Every table keeps between 90 and 100 back of every 100 bet over many pulls: the day sets where, and each "
             "player's run of luck moves a pull a little either way.", &lv_font_montserrat_16, QUIET, LV_PCT(100));
}
static void tapHouse(lv_event_t *) { houseOpen = ""; openWatched("THE HOUSE", "/api/casino", drawHouse); }

// C-154 (the user, 2026-10-18: "all devices (even if not in casino) should get the notifications"): what another daemon
// says or does -- a word, an act, a JACKPOT -- as a banner over whatever page is open, for seven seconds, as it arrives in
// what the Tab5 keeps (net.cpp asks every 30 s). The first look only learns what is already there. A tap opens NEARBY.
static std::set<String> newsSeen;
static bool newsPrimed = false;
static lv_obj_t *newsBanner = nullptr;
static uint32_t newsAt = 0, newsLooked = 0;
static void newsTap(lv_event_t *) {
  if (newsBanner) { lv_obj_delete(newsBanner); newsBanner = nullptr; }
  closeOverlay(); lv_tabview_set_active(tabs, P_DAEMON, LV_ANIM_OFF); lv_obj_send_event(tabs, LV_EVENT_VALUE_CHANGED, nullptr);
}
static void newsLook() {
  if (newsBanner && millis() - newsAt > 7000) { lv_obj_delete(newsBanner); newsBanner = nullptr; }
  if (millis() - newsLooked < 2000) return;
  newsLooked = millis();
  JsonDocument b = newDoc(), acts = newDoc();
  if (!kept("broadcasts", b)) return;
  kept("acts", acts);
  String line; int more = -1;
  for (JsonObject c : b["items"].as<JsonArray>()) {
    String id = c["id"] | "";
    if (!id.length() || newsSeen.count(id)) continue;
    newsSeen.insert(id);
    if (newsPrimed && !(c["mine"] | false)) { line = castLine(c, acts); more++; }
  }
  newsPrimed = true;
  if (!line.length()) return;
  if (more > 0) line += "  (+" + String(more) + ")";
  if (newsBanner) lv_obj_delete(newsBanner);
  newsBanner = lv_obj_create(lv_layer_top());
  lv_obj_set_size(newsBanner, LV_PCT(94), LV_SIZE_CONTENT);
  lv_obj_align(newsBanner, LV_ALIGN_TOP_MID, 0, 60);
  lv_obj_set_style_bg_color(newsBanner, DAY, 0); lv_obj_set_style_border_width(newsBanner, 0, 0);
  lv_obj_set_style_radius(newsBanner, 14, 0); lv_obj_set_style_pad_all(newsBanner, 20, 0);
  lv_obj_t *t = lv_label_create(newsBanner);
  lv_label_set_text(t, ("NEARBY   " + line).c_str());
  lv_obj_set_width(t, LV_PCT(100)); lv_label_set_long_mode(t, LV_LABEL_LONG_WRAP);
  lv_obj_set_style_text_font(t, &lv_font_montserrat_28, 0); lv_obj_set_style_text_color(t, lv_color_white(), 0);
  lv_obj_add_flag(newsBanner, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(newsBanner, newsTap, LV_EVENT_CLICKED, nullptr);
  newsAt = millis();
  soundSelect();
}

// once a minute while the CASINO is open: still at the table, what is owed sent, the coins as the companion knows them
static void casinoTick60() {
  if (!casinoOpen || millis() - seatAt < 60000) return;
  casinoSeat("here"); casinoReport(); casinoTakeState(); casinoShowCoins();
}

static void drawNearby(lv_obj_t *parent) {
  JsonDocument b = newDoc(), acts = newDoc();
  bool haveActs = kept("acts", acts);
  lv_obj_t *c = card(parent);
  label(c, "NEARBY", &lv_font_montserrat_20, QUIET);
  JsonArray items = kept("broadcasts", b) ? b["items"].as<JsonArray>() : JsonArray();
  if (!items.size()) label(c, "Nothing said yet.", &lv_font_montserrat_20, QUIET);
  int from = items.size() > 6 ? items.size() - 6 : 0;
  for (int i = from; i < (int)items.size(); i++) {
    JsonObject it = items[i];
    lv_obj_t *r = row(c);
    label(r, castLine(it, acts), &lv_font_montserrat_20, (it["mine"] | false) ? QUIET : INK, LV_PCT(70));
    bool answered = false;                              // an act from another daemon, not yet answered here, may be answered
    for (JsonObject o : items) if (String((const char *)(o["replyTo"] | "")) == String((const char *)(it["id"] | "")) && (o["mine"] | false)) answered = true;
    if (String((const char *)(it["kind"] | "")) == "act" && !(it["mine"] | false) && !answered) button(r, "ANSWER", tapAnswer, (void *)(long)i, false);
  }
  lv_obj_t *s = row(c);
  button(s, "SAY...", tapSay);
  if (haveActs) { int k = 0; for (JsonObject a : acts["acts"].as<JsonArray>()) button(s, a["label"] | "", tapAct, (void *)(long)k++, false); }
}

static void drawDaemon(lv_obj_t *p) {
  lv_obj_set_flex_flow(p, LV_FLEX_FLOW_ROW_WRAP);          // C-96: side by side in landscape, one above the other in portrait
  lv_obj_set_style_pad_column(p, 16, 0);
  int half = displayPortrait() ? LV_PCT(100) : LV_PCT(48);
  lv_obj_t *left = column(p, half), *right = column(p, half);
  JsonDocument st = newDoc();
  JsonObject d;
  if (kept("state", st)) d = st["daemon"];
  if (!d.isNull()) {
    lv_obj_t *c = card(left);
    denStage(c, d, displayPortrait() ? 640 : 540, displayPortrait() ? 380 : 340);   // C-113: in its den, walking it
    // C-118: how it is, plainly -- asleep said large -- and its care: DRINK FEED TRAIN SLEEP, SLEEP lit at bedtime, WAKE asleep
    String tired = (const char *)(d["life"]["tired"] | "awake");
    if (tired == "asleep") label(c, "ASLEEP", &lv_font_montserrat_40, DAY);                        // DRAFT
    else label(c, d["life"]["word"] | "", &lv_font_montserrat_28, DAY);
    lv_obj_t *keys = row(c);
    if (tired == "asleep") button(keys, "WAKE", tapCare, (void *)4L);
    else {
      button(keys, "DRINK", tapCare, (void *)1L, false); button(keys, "FEED", tapCare, (void *)0L, false);
      button(keys, "TRAIN", tapCare, (void *)2L, false); button(keys, "SLEEP", tapCare, (void *)3L, tired == "drowsy");
    }
    if (careSaid.length()) label(c, careSaid, &lv_font_montserrat_20, QUIET);
    label(c, d["nickname"] | "", &lv_font_montserrat_40, INK);
    label(c, "Lv. " + String((int)(d["level"] | 0)) + "   " + (const char *)(d["category"] | ""), &lv_font_montserrat_20, QUIET);
    String types; for (JsonVariant t : d["types"].as<JsonArray>()) types += (types.length() ? " / " : "") + String((const char *)t);
    label(c, types, &lv_font_montserrat_20, DAY);
    label(c, d["entry"] | "", &lv_font_montserrat_20, INK, LV_PCT(100));
  } else {
    label(left, "This Tab5 hosts no daemon. SEND one from the party in the game, SYNC, and choose it on DEVICES.",
          &lv_font_montserrat_28, QUIET, LV_PCT(100));
  }
  JsonDocument party = newDoc();
  label(right, "THE PARTY", &lv_font_montserrat_20, QUIET);
  if (kept("party", party)) {
    for (JsonObject m : party["party"].as<JsonArray>()) {
      lv_obj_t *r = row(right);
      picture(r, "p" + String((int)(m["slot"] | 0)), 256);
      String name = (const char *)(m["nickname"] | ""); if (!name.length()) name = (const char *)(m["name"] | "");
      label(r, name + "   Lv. " + String((int)(m["level"] | 0)) + ((m["away"] | false) ? "   (away)" : ""), &lv_font_montserrat_20, INK);
    }
  }
  button(right, "SYNC WITH THE GAME", tapSyncGame);
  label(right, "Close the game first: SYNC writes the save.", &lv_font_montserrat_16, QUIET, LV_PCT(100));
  if (netMessage().length()) label(right, netMessage(), &lv_font_montserrat_20, DAY, LV_PCT(100));
  lv_obj_t *rc = card(right);                       // C-155: ROUTINES -- THE CASINO
  label(rc, "ROUTINES", &lv_font_montserrat_20, QUIET);
  { lv_obj_t *rr = row(rc); button(rr, "THE CASINO", tapCasino); button(rr, "THE HOUSE", tapHouse, nullptr, false); }   // C-158
  drawNearby(right);
}

