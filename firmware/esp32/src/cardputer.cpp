// C-136: the Cardputers' keyboards -- one character a call, as the T-Deck's keyboard chip gives (input.cpp readDeck):
// 13 Enter, 8 Backspace, 9 Tab, 27 Esc (Fn + `), and the arrows printed on ; . , / under Fn: 0x11 up, 0x12 down,
// 0x13 left, 0x14 right. Shift (held) gives capitals and the upper symbols. The map is M5Cardputer's (Keyboard.h).
//
// The original scans a 74HC138 matrix: the address on 8, 9, 11 picks one of eight lines, and 13, 15, 3, 4, 5, 6, 7 read
// which keys on it are down (low). The ADV asks a TCA8418 on I2C 0x34 for its key events, polled here (its INT, on 11,
// is not needed for that). Both lay their keys out as the same 4 rows of 14.
#include <Wire.h>
#include "board.h"

#if defined(BOARD_CARDPUTER)
#include <driver/gpio.h>
#include <deque>

static const char NORMAL[4][14] = {
  { '`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 8 },
  { 9, 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\' },
  { 0, 0, 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', '\'', 13 },
  { 0, 0, 0, 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', ' ' } };
static const char SHIFTED[4][14] = {
  { '~', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', 8 },
  { 9, 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '{', '}', '|' },
  { 0, 0, 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ':', '"', 13 },
  { 0, 0, 0, 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '<', '>', '?', ' ' } };
static bool isFn(int x, int y) { return y == 2 && x == 0; }
static bool isShift(int x, int y) { return y == 2 && x == 1; }

static std::deque<int> keys;
static bool fnDown = false, shiftDown = false;
static void pressed(int x, int y, bool down) {
  if (isFn(x, y)) { fnDown = down; return; }
  if (isShift(x, y)) { shiftDown = down; return; }
  if (!down || x < 0 || x > 13 || y < 0 || y > 3) return;
  int c = (shiftDown ? SHIFTED : NORMAL)[y][x];
  if (fnDown) {
    if (y == 2 && x == 11) c = 0x11; else if (y == 3 && x == 11) c = 0x12;      // ; up, . down
    else if (y == 3 && x == 10) c = 0x13; else if (y == 3 && x == 12) c = 0x14;  // , left, / right
    else if (y == 0 && x == 0) c = 27;                                          // ` Esc
  }
  if (c && keys.size() < 16) keys.push_back(c);
}

// ---- the original: the 74HC138 matrix ---------------------------------------------------------------------------------
static const int ADDR[3] = { 8, 9, 11 }, IN[7] = { 13, 15, 3, 4, 5, 6, 7 };
static uint8_t was[8];
static void scanMatrix() {
  static bool ready = false;
  if (!ready) {
    for (int p : ADDR) { gpio_reset_pin((gpio_num_t)p); pinMode(p, OUTPUT); }
    for (int p : IN) { gpio_reset_pin((gpio_num_t)p); pinMode(p, INPUT_PULLUP); }
    ready = true;
  }
  for (int i = 0; i < 8; i++) {
    digitalWrite(ADDR[0], i & 1); digitalWrite(ADDR[1], (i >> 1) & 1); digitalWrite(ADDR[2], (i >> 2) & 1);
    delayMicroseconds(5);
    uint8_t now = 0;
    for (int j = 0; j < 7; j++) if (!digitalRead(IN[j])) now |= 1 << j;
    uint8_t changed = now ^ was[i];
    for (int j = 0; j < 7; j++) if (changed & (1 << j))
      pressed(i > 3 ? 2 * j : 2 * j + 1, 3 - (i & 3), now & (1 << j));
    was[i] = now;
  }
}

// ---- the ADV: the TCA8418 ---------------------------------------------------------------------------------------------
static const uint8_t TCA = 0x34;
static void tcaSet(uint8_t r, uint8_t v) { Wire.beginTransmission(TCA); Wire.write(r); Wire.write(v); Wire.endTransmission(); }
static uint8_t tcaGet(uint8_t r) {
  Wire.beginTransmission(TCA); Wire.write(r);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom(TCA, (uint8_t)1) != 1) return 0;
  return Wire.read();
}
static void readTca() {
  static bool ready = false;
  if (!ready) {                                  // Adafruit's / M5Cardputer's start: 7 rows by 8 columns, the rest inputs
    for (uint8_t r : { 0x23, 0x24, 0x25 }) tcaSet(r, 0x00);   // GPIO_DIR
    for (uint8_t r : { 0x20, 0x21, 0x22 }) tcaSet(r, 0xFF);   // GPI_EM
    for (uint8_t r : { 0x26, 0x27, 0x28 }) tcaSet(r, 0x00);   // GPIO_INT_LVL
    for (uint8_t r : { 0x1A, 0x1B, 0x1C }) tcaSet(r, 0xFF);   // GPIO_INT_EN
    tcaSet(0x1D, 0x7F); tcaSet(0x1E, 0xFF); tcaSet(0x1F, 0x00);   // KP_GPIO: the matrix
    for (int i = 0; i < 16 && tcaGet(0x04); i++) {}           // KEY_EVENT_A: what waited, dropped
    tcaSet(0x02, 0x1F);                                       // INT_STAT cleared
    tcaSet(0x01, tcaGet(0x01) | 0x01);                        // CFG: key events on
    ready = true;
  }
  int n = tcaGet(0x03) & 0x0F;                                // KEY_LCK_EC: how many events wait
  for (int i = 0; i < n; i++) {
    uint8_t ev = tcaGet(0x04);
    if (!ev) break;
    int code = (ev & 0x7F) - 1, r = code / 10, c = code % 10;
    pressed(r * 2 + (c > 3 ? 1 : 0), c % 4, ev & 0x80);
  }
  if (n) tcaSet(0x02, 0x01);
}

int cardputerKey() {
  static uint32_t at = 0;
  if (millis() - at >= 15) {
    at = millis();
    if (board.kind == BoardKind::CardputerAdv) readTca(); else scanMatrix();
  }
  if (keys.empty()) return 0;
  int c = keys.front(); keys.pop_front();
  return c;
}
#else
int cardputerKey() { return 0; }
#endif
