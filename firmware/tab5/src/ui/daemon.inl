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
// C-158 (the user, 2026-10-18: "the phone casino needs to be more like the devices"; the Tab5 too): like the boards' -- the
// band (CASINO and the season, or the holiday in its colours), AT THE TABLE, three dark reels each showing three of its
// strip (each piece twice, shuffled), the payline the middle row between the arrows, MONEY and BET, BET - / SPIN / BET +
// becoming STOP for each reel; the pull is decided by slots.h's engine -- the day's luck (the state's casino.context), this
// Tab5's own cat and string, a loss often falling near (the winning piece one place off the line) -- and each reel slips
// on to its piece when STOPped or by itself. The reels' other daemons are the ones seen in the game (casino.reel).
static lv_obj_t *reelCell[3][3], *casinoCoins, *casinoBetLabel, *casinoSaid, *casinoNear, *casinoBanner, *casinoKeys[2];
static uint8_t reelStrip[3][slots::STRIP_N], reelWant[3];
static int reelPos[3] = { 0, 4, 8 }, reelStop[3] = { -1, -1, -1 }, nearBeside = -1;
static int casinoBet = 10, casinoTick = -1, casinoOutcome = 0, casinoJack = -1, casinoFriend[3] = { -1, -1, -1 }, casinoReelSp[3] = { 0, 0, 0 };
static int unsentSpins = 0, casinoSeqN = 0;
static long unsentDelta = 0, reportedDelta = 0, stateBalance = 0;
static String casinoSeason, casinoBootHex, lastReport, casinoLook;
static lv_timer_t *casinoTimer = nullptr;
static uint32_t seatAt = 0;
static bool casinoOpen = false, stripsMade = false;
static slots::Cat casinoCat;
static float casinoLuck = 0;
static long casinoBalance() { long b = stateBalance + unsentDelta + reportedDelta; return b < 0 ? 0 : b > 999999 ? 999999 : b; }
// sitting here says the odds this Tab5 plays at -- the return in a thousand, the string's reach in hundredths, pulls without
// a win, wins running (server casino.ts seated) -- for THE HOUSE
static void casinoSeat(const char *how) {
  String odds;
  if (!strcmp(how, "here")) {
    char b[48]; snprintf(b, sizeof b, " %d %d %d %d", (int)lroundf(slots::pullReturn(casinoLuck, casinoCat) * 1000), (int)lroundf(casinoCat.reach * 100),
                         min(casinoCat.dry, 99999), min(casinoCat.streak, 9999));
    odds = b;
  }
  netSend("POST", "/api/device/interact", String("{\"kind\":\"table\",\"detail\":\"") + how + " " + deviceId() + odds + "\"}"); seatAt = millis();
}
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
  casinoLook = String((const char *)(st["holiday"]["look"] | ""));
  casinoLuck = st["casino"]["context"]["luck"] | 0.0f;
  casinoJack = st["daemon"].isNull() ? -1 : (int)(st["daemon"]["slot"] | -1);
  JsonArray fr = st["casino"]["friends"].as<JsonArray>();
  int k = 0, at = 0;
  if (casinoJack < 0 && fr.size()) { casinoJack = fr[0] | -1; at = 1; }   // no daemon of its own: the party's first is the JACK
  for (int i = 0; i < 3; i++) { casinoFriend[i] = -1; casinoReelSp[i] = 0; }
  for (int i = at; i < (int)fr.size() && k < 3; i++) casinoFriend[k++] = fr[i] | -1;
  int r = 0; for (JsonObject x : st["casino"]["reel"].as<JsonArray>()) if (r < 3) casinoReelSp[r++] = x["species"] | 0;
}
static uint8_t stripAt(int i, int pos) { return reelStrip[i][((pos % slots::STRIP_N) + slots::STRIP_N) % slots::STRIP_N]; }
static void casinoDrawCell(int i, int row) {
  lv_obj_t *cell = reelCell[i][row];
  if (!cell) return;
  lv_obj_clean(cell);
  int p = stripAt(i, reelPos[i] + row - 1);
  int sp = p >= slots::F1 && p <= slots::F3 ? casinoReelSp[p - 1] : 0;
  int slot = p == slots::JACK ? casinoJack : p <= slots::F3 ? casinoFriend[p - 1] : -1;
  lv_obj_t *o;
  if (sp > 0) o = picture(cell, "s" + String(sp), 384);
  else if (slot >= 0) o = picture(cell, "p" + String(slot), 384);
  else if (p == slots::COIN) {
    o = lv_obj_create(cell); lv_obj_set_size(o, 72, 72); lv_obj_set_style_radius(o, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(o, lv_color_hex(0xF2C230), 0); lv_obj_set_style_border_color(o, lv_color_hex(0xA07A10), 0);
    lv_obj_set_style_border_width(o, 5, 0);
  } else {
    String t = p == slots::SEASON ? casinoSeason : String("?"); t.toUpperCase();
    lv_color_t c = casinoSeason == "winter" ? lv_color_hex(0x9CC3E6) : casinoSeason == "spring" ? lv_color_hex(0x7CC47C)
                 : casinoSeason == "summer" ? lv_color_hex(0xE8C547) : lv_color_hex(0xD9822B);
    o = label(cell, t, &lv_font_montserrat_20, c);
  }
  lv_obj_center(o);
}
static void casinoDrawReels() { for (int i = 0; i < 3; i++) for (int r = 0; r < 3; r++) casinoDrawCell(i, r); }
static void casinoShowCoins() {
  if (casinoCoins) lv_label_set_text(casinoCoins, ("MONEY " + String(casinoBalance())).c_str());
  if (casinoBetLabel) lv_label_set_text(casinoBetLabel, ("BET " + String(casinoBet)).c_str());
}
static void casinoShowKeys(bool spinning) {        // shown and hidden, never rebuilt inside a tap on one of them
  if (!casinoKeys[0]) return;
  if (spinning) { lv_obj_add_flag(casinoKeys[0], LV_OBJ_FLAG_HIDDEN); lv_obj_remove_flag(casinoKeys[1], LV_OBJ_FLAG_HIDDEN); }
  else { lv_obj_remove_flag(casinoKeys[0], LV_OBJ_FLAG_HIDDEN); lv_obj_add_flag(casinoKeys[1], LV_OBJ_FLAG_HIDDEN); }
}
// where reel i stops: on its piece, the first place past where it is -- the third, for a near miss, with the piece it
// wanted beside the line (slots.ts stopAt / stopNear)
static int casinoStopFor(int i) {
  int from = reelPos[i] + 1;
  if (i == 2 && nearBeside >= 0)
    for (int k = from; k < from + slots::STRIP_N; k++)
      if (stripAt(2, k) == reelWant[2] && (stripAt(2, k - 1) == nearBeside || stripAt(2, k + 1) == nearBeside)) return k;
  for (int k = from; k < from + slots::STRIP_N; k++) if (stripAt(i, k) == reelWant[i]) return k;
  return from;
}
static void casinoSettle() {
  long paid = (long)casinoBet * slots::PAYS[casinoOutcome], won = paid - casinoBet;
  bool near = nearBeside >= 0;
  slots::learn(casinoCat, casinoOutcome);
  unsentDelta += won; unsentSpins++;
  soundSlots(casinoOutcome == 0 ? 1 : casinoOutcome == 6 ? 4 : slots::PAYS[casinoOutcome] >= 12 ? 3 : 2, casinoLook);
  lv_label_set_text(casinoSaid, casinoOutcome == 0 ? ("-" + String(casinoBet)).c_str() : "");
  lv_label_set_text(casinoNear, !near ? "" : casinoOutcome == 0 ? "SO CLOSE" : "ALMOST THE JACKPOT");   // DRAFT
  if (casinoOutcome) {
    lv_label_set_text(lv_obj_get_child(casinoBanner, 0), ((casinoOutcome == 6 ? String("JACKPOT!  ") : String("WIN  ")) + String(paid)).c_str());   // DRAFT
    lv_obj_remove_flag(casinoBanner, LV_OBJ_FLAG_HIDDEN);
  }
  if (const char *act = slots::tableAct(casinoOutcome)) netSend("POST", "/api/broadcast", String("{\"kind\":\"act\",\"act\":\"") + act + "\"}");
  if (unsentSpins >= 10) casinoReport();
  casinoShowCoins(); casinoShowKeys(false);
}
static void casinoStep(lv_timer_t *t) {
  if (!casinoOpen) { lv_timer_delete(t); casinoTimer = nullptr; return; }
  casinoTick++;
  bool all = true;
  for (int i = 0; i < 3; i++) {
    if (reelStop[i] < 0 && casinoTick > 26 + i * 6) reelStop[i] = casinoStopFor(i);   // by itself, a reel at a time
    if (reelStop[i] >= 0 && reelPos[i] >= reelStop[i]) continue;
    all = false; reelPos[i]++;
    for (int r = 0; r < 3; r++) casinoDrawCell(i, r);
  }
  if (!all) return;
  lv_timer_delete(t); casinoTimer = nullptr; casinoTick = -1;
  casinoSettle();
}
static void casinoStopTap(lv_event_t *e) {
  int i = (int)(long)lv_event_get_user_data(e);
  if (casinoTimer && reelStop[i] < 0) reelStop[i] = casinoStopFor(i);
}
static void casinoPull(lv_event_t *) {
  if (casinoTimer || casinoBet > casinoBalance()) return;
  int w[slots::OUTCOME_N];
  slots::weightsFor(slots::pullReturn(casinoLuck, casinoCat), w);
  casinoOutcome = slots::drawFrom(w); slots::piecesFor(casinoOutcome, reelWant);
  nearBeside = -1;                                 // a loss often falls near; a 2x shows a third JACK beside the line
  uint8_t wanted = 0, c = 0;
  if (casinoOutcome == 0 && (float)(esp_random() % 1000) / 1000.0f < slots::nearChance(casinoCat)) {
    if (slots::nearPieces(reelStrip[2], reelWant, wanted)) nearBeside = wanted;
  } else if (casinoOutcome == 2 && slots::almostThird(reelStrip[2], c)) { reelWant[2] = c; nearBeside = slots::JACK; }
  for (int i = 0; i < 3; i++) reelStop[i] = -1;
  lv_label_set_text(casinoSaid, ""); lv_label_set_text(casinoNear, ""); lv_obj_add_flag(casinoBanner, LV_OBJ_FLAG_HIDDEN);
  casinoTick = 0;
  soundSlots(0, casinoLook);
  casinoShowKeys(true);
  casinoTimer = lv_timer_create(casinoStep, 70, nullptr);
}
static void casinoBetBy(lv_event_t *e) {
  int d = (int)(long)lv_event_get_user_data(e), at = 0;
  for (int i = 0; i < slots::BET_N; i++) if (slots::BETS[i] == casinoBet) at = i;
  for (int k = at + d; k >= 0 && k < slots::BET_N; k += d) if (slots::BETS[k] <= max(casinoBalance(), (long)slots::BETS[0])) { casinoBet = slots::BETS[k]; break; }
  casinoShowCoins();
}
static void casinoLeave() {
  if (casinoTimer) {                                // the review, 2026-10-18: a pull left mid-spin is settled, as the
    lv_timer_delete(casinoTimer); casinoTimer = nullptr; casinoTick = -1;   // handhelds settle it -- never escaped
    unsentDelta += (long)casinoBet * slots::PAYS[casinoOutcome] - casinoBet; unsentSpins++;
    slots::learn(casinoCat, casinoOutcome);
  }
  casinoReport(); casinoSeat("gone"); casinoOpen = false;
  casinoCoins = casinoBetLabel = casinoSaid = casinoNear = casinoBanner = nullptr;   // the overlay goes with them
  casinoKeys[0] = casinoKeys[1] = nullptr;
  for (int i = 0; i < 3; i++) for (int r = 0; r < 3; r++) reelCell[i][r] = nullptr;
}
static lv_color_t hexOr(const char *h, lv_color_t or_) { return h && strlen(h) == 7 && h[0] == '#' ? lv_color_hex(strtol(h + 1, nullptr, 16)) : or_; }
static void tapCasino(lv_event_t *) {
  JsonDocument st = newDoc();
  if (!kept("state", st) || st["casino"].isNull()) { showWords("THE CASINO", "The CASINO plays with your save's money: the companion has to read your save first.", ""); return; }
  casinoTakeState();
  if (!stripsMade) {                               // each piece twice round a reel, shuffled (slots.ts strip)
    stripsMade = true;
    for (int i = 0; i < 3; i++) {
      for (int k = 0; k < slots::STRIP_N; k++) reelStrip[i][k] = k % 6;
      for (int k = slots::STRIP_N - 1; k > 0; k--) { int j = esp_random() % (k + 1); uint8_t t = reelStrip[i][k]; reelStrip[i][k] = reelStrip[i][j]; reelStrip[i][j] = t; }
    }
  }
  lv_obj_t *o = openOverlay();
  casinoOpen = true; overlayClosing = casinoLeave; casinoSeat("here");
  button(o, "LEAVE", closeOverlay, nullptr, false);
  // the band: CASINO and what it is dressed for, in the holiday's colours or the day's
  lv_obj_t *band = lv_obj_create(o);
  lv_obj_set_size(band, LV_PCT(100), LV_SIZE_CONTENT); lv_obj_set_style_radius(band, 6, 0); lv_obj_set_style_border_width(band, 0, 0);
  lv_obj_set_style_pad_all(band, 14, 0); lv_obj_remove_flag(band, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(band, hexOr(st["holiday"]["colours"][0] | "", BAR), 0);
  String dress = st["holiday"].isNull() ? casinoSeason : String((const char *)(st["holiday"]["name"] | "")); dress.toUpperCase();
  label(band, "CASINO    " + dress, &lv_font_montserrat_28, lv_color_white());
  String at; int more = 0;
  for (JsonObject t : st["casino"]["table"].as<JsonArray>()) { if (!at.length()) at = (const char *)(t["name"] | ""); else more++; }
  if (at.length()) label(o, "AT THE TABLE: " + at + (more ? "  +" + String(more) : String("")), &lv_font_montserrat_20, QUIET);   // DRAFT
  // the reels: each shows three of its strip, the middle row the payline between the arrows
  lv_obj_t *reels = row(o);
  lv_obj_set_style_pad_column(reels, 12, 0);
  lv_obj_set_flex_align(reels, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  label(reels, LV_SYMBOL_PLAY, &lv_font_montserrat_28, lv_color_hex(0xF2C230));
  for (int i = 0; i < 3; i++) {
    lv_obj_t *r = lv_obj_create(reels);
    lv_obj_set_size(r, 180, 3 * 118); lv_obj_set_style_radius(r, 10, 0); lv_obj_set_style_border_width(r, 0, 0);
    lv_obj_set_style_bg_color(r, lv_color_hex(0x25282E), 0); lv_obj_set_style_pad_all(r, 0, 0);
    lv_obj_remove_flag(r, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_flex_flow(r, LV_FLEX_FLOW_COLUMN);
    for (int k = 0; k < 3; k++) {
      lv_obj_t *c = reelCell[i][k] = lv_obj_create(r);
      lv_obj_remove_style_all(c); lv_obj_set_size(c, 180, 118);
      lv_obj_remove_flag(c, LV_OBJ_FLAG_SCROLLABLE); lv_obj_remove_flag(c, LV_OBJ_FLAG_CLICKABLE);
      if (k != 1) lv_obj_set_style_opa(c, LV_OPA_50, 0);
    }
  }
  label(reels, LV_SYMBOL_LEFT, &lv_font_montserrat_28, lv_color_hex(0xF2C230));
  casinoBanner = lv_obj_create(o);                 // WIN / JACKPOT, in gold, until the next pull
  lv_obj_set_size(casinoBanner, LV_PCT(100), LV_SIZE_CONTENT); lv_obj_set_style_radius(casinoBanner, 12, 0);
  lv_obj_set_style_bg_color(casinoBanner, lv_color_hex(0xF6C445), 0); lv_obj_set_style_border_width(casinoBanner, 0, 0);
  lv_obj_set_style_pad_all(casinoBanner, 10, 0); lv_obj_remove_flag(casinoBanner, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_t *bl = label(casinoBanner, "", &lv_font_montserrat_40, lv_color_hex(0x2B2310)); lv_obj_center(bl);
  lv_obj_add_flag(casinoBanner, LV_OBJ_FLAG_HIDDEN);
  // the info row, as the boards': MONEY and BET, and what the last pull came to
  lv_obj_t *info = row(o);
  lv_obj_set_style_pad_column(info, 30, 0);
  casinoCoins = label(info, "", &lv_font_montserrat_28, INK);
  casinoBetLabel = label(info, "", &lv_font_montserrat_28, legible(DAY));
  casinoSaid = label(info, "", &lv_font_montserrat_28, QUIET);
  casinoNear = label(o, "", &lv_font_montserrat_28, legible(DAY));
  // the keys, labelled as the boards' are: BET - SPIN BET +, and STOP for each reel while they turn
  casinoKeys[0] = row(o);
  button(casinoKeys[0], "BET -", casinoBetBy, (void *)(long)-1, false);
  button(casinoKeys[0], "SPIN", casinoPull);
  button(casinoKeys[0], "BET +", casinoBetBy, (void *)(long)1, false);
  casinoKeys[1] = row(o);
  for (int i = 0; i < 3; i++) button(casinoKeys[1], "STOP", casinoStopTap, (void *)(long)i);
  casinoShowKeys(false);
  JsonDocument d = newDoc(); kept("state", d);
  String jackName = d["daemon"].isNull() ? String("your daemon") : String((const char *)(d["daemon"]["nickname"] | "your daemon"));
  label(o, "Three of " + jackName + " pays fifty times. What you win or lose reaches your save at the next SYNC.", &lv_font_montserrat_20, QUIET, LV_PCT(100));
  casinoDrawReels(); casinoShowCoins();
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

// every half minute while the CASINO is open: still at the table, and at what odds (C-158); every minute what is owed
// sent and the coins as the companion knows them
static void casinoTick60() {
  if (!casinoOpen || millis() - seatAt < 30000) return;
  static bool odd = false; odd = !odd;
  casinoSeat("here");
  if (!odd) { casinoReport(); casinoTakeState(); casinoShowCoins(); }
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

