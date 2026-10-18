// Part of ui.cpp (C-157): the INDEX. Included by ui.cpp in order -- not a file of its own: it
// shares ui.cpp's statics and may use anything the parts before it declare.
// ---- INDEX ------------------------------------------------------------------------------------------------------------
static const int PER_PAGE = 18;
static void tapIndexPage(lv_event_t *e) { indexPage += (int)(long)lv_event_get_user_data(e); drawnAt[P_DAEMON] = 0; }

static int listening = 0;                          // the species LISTEN reads
static const char *listenWord() { return netVoice == V_MAKING ? "MAKING THE VOICE...  STOP" : netVoice == V_SPEAKING ? "HUSH" : LV_SYMBOL_VOLUME_MAX "  LISTEN"; }   // DRAFT
static void tapListen(lv_event_t *) { if (netVoice == V_QUIET) netSpeak(listening); else netHush(); }

static void tapEntry(lv_event_t *e) {
  int at = (int)(long)lv_event_get_user_data(e);
  JsonDocument ix = newDoc();
  if (!kept("index", ix)) return;
  JsonObject en = ix["entries"][at];
  lv_obj_t *o = openOverlay();
  lv_obj_set_flex_flow(o, displayPortrait() ? LV_FLEX_FLOW_COLUMN : LV_FLEX_FLOW_ROW);   // C-96
  lv_obj_t *left = column(o, displayPortrait() ? LV_PCT(100) : 420), *right = column(o, displayPortrait() ? LV_PCT(100) : 700);
  picture(left, "s" + String((int)(en["species"] | 0)), 256 * 6);
  label(right, "No. " + String((int)(en["national"] | 0)) + "   " + (const char *)(en["name"] | ""), &lv_font_montserrat_40, INK);
  String types; for (JsonVariant t : en["types"].as<JsonArray>()) types += (types.length() ? " / " : "") + String((const char *)t);
  label(right, String((const char *)(en["category"] | "")) + "   " + types, &lv_font_montserrat_20, DAY);
  String text = en["entry"] | ""; text.replace("\n", " ");
  label(right, text, &lv_font_montserrat_28, INK, LV_PCT(100));
  JsonArray native = en["native"].as<JsonArray>();   // T-407: NATIVE, as the game's area page says it
  if (native.size()) {
    String lines; for (JsonVariant n : native) lines += (lines.length() ? "\n" : "") + String((const char *)n);
    label(right, "NATIVE", &lv_font_montserrat_16, DAY);
    label(right, lines, &lv_font_montserrat_20, INK, LV_PCT(100));
  }
  lv_obj_t *r = row(right);                          // C-99: read aloud, in the INDEX voice, as the phone's LISTEN
  listening = en["species"] | 0;
  netHush(); voiceSaidWas = netMessage();
  lv_obj_t *b = button(r, listenWord(), tapListen);
  listenLabel = lv_obj_get_child(b, 0);
  button(r, "CLOSE", closeOverlay, nullptr, false);
  voiceSaid = label(right, "", &lv_font_montserrat_20, DAY, LV_PCT(100));
}

static void drawIndex(lv_obj_t *p) {
  JsonDocument ix = newDoc();
  if (!kept("index", ix)) { label(p, "The INDEX downloads once the Tab5 is paired.", &lv_font_montserrat_28, QUIET); return; }
  JsonArray entries = ix["entries"];
  int pages = max(1, ((int)entries.size() + PER_PAGE - 1) / PER_PAGE);
  indexPage = (indexPage % pages + pages) % pages;
  lv_obj_t *top = row(p);
  label(top, "Seen " + String((int)(ix["seen"] | 0)) + "   Bound " + String((int)(ix["bound"] | 0)), &lv_font_montserrat_20, QUIET);
  button(top, LV_SYMBOL_LEFT, tapIndexPage, (void *)-1L, false);
  label(top, String(indexPage + 1) + " / " + String(pages), &lv_font_montserrat_20, INK);
  button(top, LV_SYMBOL_RIGHT, tapIndexPage, (void *)1L, false);
  if (net.artTotal && net.artDone < net.artTotal) label(top, "pictures " + String(net.artDone) + " / " + String(net.artTotal), &lv_font_montserrat_16, QUIET);
  lv_obj_t *grid = row(p);
  for (int i = indexPage * PER_PAGE; i < min((int)entries.size(), (indexPage + 1) * PER_PAGE); i++) {
    JsonObject en = entries[i];
    bool seen = en["seen"] | false;
    lv_obj_t *cell = column(grid, 165);
    lv_obj_set_style_bg_opa(cell, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(cell, CARD, 0);
    lv_obj_set_style_radius(cell, 6, 0);
    lv_obj_set_style_pad_all(cell, 8, 0);
    lv_obj_set_flex_align(cell, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    if (seen) picture(cell, "s" + String((int)(en["species"] | 0)), 256 * 2);
    else label(cell, "?", &lv_font_montserrat_48, QUIET);
    label(cell, String((int)(en["national"] | 0)) + " " + (seen ? (const char *)(en["name"] | "") : "-----"), &lv_font_montserrat_16, INK);
    if (seen) { lv_obj_add_flag(cell, LV_OBJ_FLAG_CLICKABLE); lv_obj_add_event_cb(cell, tapEntry, LV_EVENT_CLICKED, (void *)(long)i); }
  }
}

