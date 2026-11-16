// C-332 (the user, 2026-11-11, by multiple choice: "the game's music on the watch"): MUSIC, on the watch's BOOKS shelf
// after DREAMS. The game's own tracks as the hub publishes them (GET /api/music: gamemusic.ts, each rendered once from
// the port's MIDI), the list kept on the card as music.json; a track tapped plays -- from the card when it was kept
// (music/<id>.pcm), else from the hub as it comes and kept whole on the card as it plays (talkPlayFrom), so the second
// time needs no network. A touch stops it. Every word DRAFT.
#include "app.h"
#include "talk.h"
#include "card.h"
#include <vector>

void listRow(int i, int at, const String &text, uint16_t day, uint16_t ink, int width);   // ui.cpp
static JsonDocument tracks;
static int mAt = 0;
static bool mFromCard = false;
static String mWhy, mPlaying;

static String trackTitle(int i) {
  JsonVariant t = tracks["tracks"][i];
  String s = t["title"] | ""; if (!s.length()) s = t["id"] | "?";
  return upper(s);
}
static bool kept(int i) { return cardHas("music/" + String((const char *)(tracks["tracks"][i]["id"] | "")) + ".pcm"); }

static String drawMusic(uint16_t day, uint16_t ink) {
  canvas.setTextDatum(TL_DATUM); canvas.setTextFont(2); canvas.setTextColor(readable(day));
  if (mWhy.length()) { canvas.drawString("MUSIC", 10, 32); wrap(mWhy, 10, 56, W - 20, 2, 18, 6, PAPER); return "hold: back"; }   // DRAFT
  if (mPlaying.length()) {
    canvas.drawString("MUSIC", 10, 32);                                                                  // DRAFT
    wrap(mPlaying, 10, 60, W - 20, 2, 18, 3, PAPER);
    for (int k = 0; k < 3; k++) canvas.fillCircle(W / 2 - 20 + k * 20, H / 2 + 20, 4, (millis() / 300) % 3 == k ? PAPER : QUIET);
    return "touch: stop";                                                                                // DRAFT
  }
  int n = tracks["tracks"].size();
  const char *title = mFromCard ? "MUSIC  (FROM THE CARD)" : "MUSIC";                                    // DRAFT
  if (gridLists()) {
    static std::vector<String> words;
    int tw = (W - 24) / 2;
    words.assign(n, String());
    for (int i = 0; i < n; i++) words[i] = tileWord(trackTitle(i), tw);
    drawTiles(n, mAt, words.data(), title, [](int i, int cx, int cy) {                                  // a note; filled once kept
      bool k = kept(i);
      if (k) canvas.fillCircle(cx - 4, cy + 8, 6, PAPER); else canvas.drawCircle(cx - 4, cy + 8, 6, PAPER);
      canvas.drawFastVLine(cx + 2, cy - 12, 20, PAPER);
      canvas.drawLine(cx + 2, cy - 12, cx + 10, cy - 6, PAPER);
    }, day, ink);
    return " ";
  }
  canvas.drawString(title, 10, 30);
  static int top = 0;
  int fit = listRowsFit();
  if (mAt < top) top = mAt; if (mAt >= top + fit) top = mAt - fit + 1;
  for (int i = top; i < n && i < top + fit; i++) listRow(i - top, mAt - top, (kept(i) ? "* " : "  ") + trackTitle(i), day, ink, W - 12);
  return "swipe: choose   tap: play   hold: back";                                                       // DRAFT
}

String runMusic() {
  mAt = 0; mWhy = ""; mPlaying = ""; mFromCard = false;
  runPanel = drawMusic;
  progress("");
  bool ok; String got = http("GET", "/api/music", "", &ok);
  if (ok) cardWrite("music.json", got);
  else if ((got = cardRead("music.json")).length()) { ok = true; mFromCard = true; }
  tracks.clear();
  if (!ok || deserializeJson(tracks, got)) mWhy = online() ? "The companion did not answer." : "NEEDS WI-FI";   // DRAFT
  else if (!tracks["tracks"].size()) mWhy = "No music is published yet.";                               // DRAFT
  progress("");
  while (true) {
    int step, ev; routineInput(step, ev);
    if (routineQuit()) ev = -1;
    if (ev == -1) break;
    if (mWhy.length()) { delay(10); continue; }
    int n = tracks["tracks"].size();
    if (step && n) { mAt = gridLists() ? tilesPage(mAt, n, step) : (mAt + n + step) % n; progress(""); }
    if (ev == 1 && n && gridLists() && !tilesTap(mAt, n)) ev = 0;
    if (ev == 1 && n) {
      String id = tracks["tracks"][mAt]["id"] | "";
      mPlaying = trackTitle(mAt); progress("");
      delay(200);                                                // the tap's own touch, let go before a touch can stop it
      bool played = talkPlayFrom("/api/music/track?id=" + id, "music/" + id + ".pcm");
      mPlaying = "";
      screen = RUN; runPanel = drawMusic;
      if (!played) say(online() ? "NOT YET" : "NEEDS WI-FI");                                          // DRAFT
      progress("");
    }
    delay(10);
  }
  runPanel = nullptr; tracks.clear();
  return "";
}
