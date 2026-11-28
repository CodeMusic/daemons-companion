// C-381: the shared drawing.
#include "pages/parts.h"

#include <algorithm>
#include <cstring>
#include "board.h"

#include <ArduinoJson.h>

#include "app.h"
#include "canvas.h"
#include "hal/hal.h"

void drawSprite(const Sprite &s, int x, int y, int scale) {
  for (int j = 0; j < s.h; j++)
    for (int i = 0; i < s.w; i++) {
      uint8_t c = s.px[(size_t)j * s.w + i];
      if (!c) continue;
      if (scale == 1) canvas.drawPixel(x + i, y + j, s.palette[c]);
      else canvas.fillRect(x + i * scale, y + j * scale, scale, scale, s.palette[c]);
    }
}

Split split(int side) {
  Split s;
  s.px = 4;
  s.py = 18;
  if (lay::tall()) {
    s.pw = hal::W - 8;
    s.ph = hal::H - 160;   // the words below need 160: 200 of the HackberryPi's 360 is the picture's, a 64 px daemon three times its size
    s.tx = 6;
    s.ty = s.py + s.ph + 8;
    s.cols = lay::cols();
  } else {
    s.pw = side;
    s.ph = side + lay::more();
    s.tx = side + 12;
    s.ty = 20;
    s.cols = (hal::W - s.tx - 8) / 6;
  }
  return s;
}

void drawDen(const HubView &v, int x, int y, int w, int h) {
  const int floorH = h / 4;
  canvas.fillRect(x, y, w, h - floorH, hex(v.denWall, rgb(0x67, 0x62, 0x5a)));
  canvas.fillRect(x, y + h - floorH, w, floorH, hex(v.denFloor, rgb(0x2b, 0x29, 0x24)));
  canvas.drawFastHLine(x, y + h - floorH, w, hex(v.denDeep, rgb(0x3b, 0x38, 0x32)));
  if (!v.carrying) return;
  auto s = hub::art(v.artKey);
  if (!s) return;
  int scale = 1;   // as big as fits whole: twice in the first canvas's den, up to four times in a bigger one (C-593)
  for (int n = 2; n <= (h >= 140 ? 4 : 2); n++) if (s->w * n <= w && s->h * n <= h) scale = n;
  const int sx = x + (w - s->w * scale) / 2, sy = y + h - floorH / 2 - s->h * scale;   // standing on the floor
  canvas.fillEllipse(x + w / 2, y + h - floorH / 2, s->w * scale / 3, 3, hex(v.denDeep, rgb(0x3b, 0x38, 0x32)));   // its shadow
  drawSprite(*s, sx, sy < y ? y : sy, scale);
  if (v.tired == "asleep") {   // asleep: dimmed, with its Zs (as the boards draw it)
    canvas.setTextColor(hex(v.denGlow, TFT_WHITE));
    canvas.setCursor(x + w - 18, y + 6);
    canvas.print("z Z");
  }
}

int lay::under = 0;

int drawStrip(const HubView &v, int y0, uint16_t day) {
  const int h = hal::H - y0;
  canvas.fillRect(0, y0, hal::W, h, rgb(0x10, 0x12, 0x18));
  canvas.fillRect(0, y0, hal::W, 3, day);
  int right = hal::W - 6;
  if (v.reached && v.carrying && h >= 60) {
    const int dw = std::min(112, h - 12);
    right = hal::W - 6 - dw;
    drawDen(v, right, y0 + 8, dw, h - 14);
    right -= 8;
  }
  return right;
}

void denUnder(const HubView &v, uint16_t day) {
  lay::under = 0;
  if (!lay::tall() || !v.reached || !v.carrying) return;
  lay::under = 120;   // the HackberryPi's 360 less the 240 the game has on PLAY
  const uint16_t soft = rgb(0xc8, 0xc8, 0xd0), dim = rgb(0x80, 0x84, 0x90);
  const int y0 = hal::H - lay::under, right = drawStrip(v, y0, day), cols = (right - 6) / 6;
  canvas.setFont(&fonts::Font0);
  canvas.setTextSize(1);
  canvas.setTextColor(TFT_WHITE);
  canvas.setCursor(6, y0 + 9);
  canvas.print(upper(v.nickname.empty() ? v.name : v.nickname).substr(0, 16).c_str());
  canvas.setTextColor(dim);
  canvas.printf("  LV %d", v.level);
  canvas.setTextColor(day);
  canvas.setCursor(6, y0 + 22);
  canvas.print(upper(v.tired == "asleep" ? "asleep" : v.tired == "drowsy" ? "drowsy" : v.word).substr(0, cols).c_str());
  if (!v.cue.empty()) { canvas.setTextColor(soft); wrap(v.cue, 6, y0 + 40, cols, 4, 10); }
  const int cy = hal::H - 18;   // the day's care, level with the den's floor
  canvas.setTextColor(dim);
  canvas.setCursor(6, cy);
  canvas.print("FED");
  drawPips(30, cy, v.fedToday, v.fedDue, day, dim);
  canvas.setCursor(100, cy);
  canvas.print("WATER");
  drawPips(136, cy, v.wateredToday, v.wateredDue, day, dim);
}

void drawPartyMember(const PartyMember &m, const HubView &v, int x, int y, int w, int h) {
  canvas.fillRect(x, y, w, h, rgb(0x22, 0x26, 0x30));
  auto s = hub::art(m.artKey);
  if (!s) return;
  int scale = 1;   // C-593: bigger where a bigger canvas gives its picture the room
  for (int n = 2; n <= (h >= 140 ? 3 : 1); n++) if (s->w * n <= w && s->h * n <= h) scale = n;
  drawSprite(*s, x + (w - s->w * scale) / 2, y + (h - s->h * scale) / 2, scale);
}

void drawPips(int x, int y, int have, int due, uint16_t on, uint16_t off) {
  const int n = have + due > 6 ? 6 : have + due;
  for (int i = 0; i < n; i++) {
    if (i < have) canvas.fillCircle(x + i * 9 + 3, y + 3, 3, on);
    else canvas.drawCircle(x + i * 9 + 3, y + 3, 3, off);
  }
}

bool Choices::key(Key k) {
  Dir d = dirOf(k);
  const int n = (int)items.size();
  if (!n) return false;
  if (d == Dir::Left) { sel = (sel + n - 1) % n; return true; }
  if (d == Dir::Right || k == Key::Tab) { sel = (sel + 1) % n; return true; }
  return false;
}

void Choices::draw(int y, uint16_t accent) {
  // the widths, then the first shown chosen so the chosen one fits on the line
  std::vector<int> w;
  for (auto &s : items) w.push_back((int)s.size() * 6 + 12);
  int first = 0;
  auto span = [&](int a, int b) { int t = 0; for (int i = a; i <= b; i++) t += w[i] + 6; return t; };
  while (first < sel && span(first, sel) > hal::W - 12) first++;
  int x = 6;
  canvas.setFont(&fonts::Font0);
  canvas.setTextSize(1);
  if (first > 0) { canvas.setTextColor(rgb(0x80, 0x84, 0x90)); canvas.setCursor(0, y + 4); canvas.print("<"); }
  for (int i = first; i < (int)items.size(); i++) {
    if (x + w[i] > hal::W - 6) { canvas.setTextColor(rgb(0x80, 0x84, 0x90)); canvas.setCursor(hal::W - 6, y + 4); canvas.print(">"); break; }
    if (i == sel) { canvas.fillRoundRect(x, y, w[i], 16, 3, accent); canvas.setTextColor(TFT_WHITE); }
    else { canvas.drawRoundRect(x, y, w[i], 16, 3, rgb(0x50, 0x54, 0x60)); canvas.setTextColor(rgb(0xc8, 0xc8, 0xd0)); }
    canvas.setCursor(x + 6, y + 4);
    canvas.print(items[i].c_str());
    x += w[i] + 6;
  }
}

std::string replyWords(const Reply &r, const char *field) {
  JsonDocument d;
  bool read = !r.body.empty() && !deserializeJson(d, (const char *)r.body.data(), r.body.size());
  if (r.ok()) return read && d[field].is<const char *>() ? d[field].as<const char *>() : "";
  if (read && d["error"].is<const char *>()) return d["error"].as<const char *>();
  return !r.error.empty() ? r.error : "the hub said " + std::to_string(r.status);   // DRAFT
}

// C-457: whole words only (ENTER, ESC, TAB, BACKSPACE, and the printed arrows Z C and F X as a pair)
const char *hint(const char *words) {
  const bool ownWords = strcmp(board::word(Key::Esc), keyName(Key::Esc)) != 0;   // C-593: the HackberryPi's back key
  if (board::KEYBOARD && !ownWords) return words;
  static std::string kept[4];
  static int next;
  std::string &out = kept[next++ & 3];
  out.clear();
  const std::string in = words;
  auto isWord = [](char c) { return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'); };
  const struct { const char *from; const char *to; } fixed[] = { { "Z C", "LEFT RIGHT" }, { "F X", "UP DOWN" } };
  size_t i = 0;
  while (i < in.size()) {
    bool done = false;
    if (i == 0 || !isWord(in[i - 1])) {
      if (!board::KEYBOARD) for (auto &f : fixed) {
        size_t n = strlen(f.from);
        if (in.compare(i, n, f.from) == 0 && (i + n == in.size() || !isWord(in[i + n]))) { out += f.to; i += n; done = true; break; }
      }
      if (!done) {
        size_t j = i;
        while (j < in.size() && isWord(in[j])) j++;
        if (j > i) {
          const std::string w = in.substr(i, j - i);
          Key k = w == "ENTER" ? Key::Enter : w == "ESC" ? Key::Esc : w == "TAB" ? Key::Tab : w == "BACKSPACE" ? Key::Backspace : Key::None;
          out += k == Key::None ? w : board::word(k);
          i = j;
          done = true;
        }
      }
    }
    if (!done) out += in[i++];
  }
  return out.c_str();
}
