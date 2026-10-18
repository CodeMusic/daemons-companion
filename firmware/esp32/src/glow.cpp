// C-148: GLOW (Thermal) -- the daemon sees heat. The user, 2026-10-17: "I also have a M5StickC-Plus 1.1 and a Hat Thermal
// ... so the daemon can see heat as an added routine". M5Stack's Thermal HAT (U062) is an MLX90640: 32x24 pixels across
// 110x75 degrees, -40 to 300 C, I2C 0x33, on the HAT header's SDA 0 / SCL 26 (M5Stack's THERMAL_MLX90640 example, at
// 400 kHz). It is read with Melexis's own driver (lib/mlx90640) on the second I2C port, Wire1, only while a GLOW routine
// runs -- the StickC-Plus's 0 is also its microphone's clock, so the port lets go of it when the routine ends.
//
// The user chose the name and the four routines (2026-10-17). Every word here is DRAFT.
//   SEE THE HEAT      the heat, live, with the warmest and the coolest marked
//   WARMEST THING     the warmest spot, followed
//   SOMEONE'S HERE    the room learnt still, then a warm body coming into it noticed
//   HOW WARM IS THAT  the middle of the view, a thermometer pointed at things
#include <Wire.h>
#include "app.h"
#include "sound.h"
extern "C" {
#include "MLX90640_API.h"
#include "MLX90640_I2C_Driver.h"
}

static const uint8_t MLX = 0x33;
static TwoWire &hat = Wire1;
static bool listening = false;               // the buttons heard between the HAT's reads, while a routine runs
static void listen();

// ---- Melexis's driver's I2C, on the HAT's port. Words are big-endian; a read is cut to the Wire buffer's 128 bytes. ----
extern "C" {
void MLX90640_I2CInit(void) {}
void MLX90640_I2CFreqSet(int khz) { hat.setClock((uint32_t)khz * 1000); }
int MLX90640_I2CGeneralReset(void) { hat.beginTransmission(0x00); hat.write(0x06); return hat.endTransmission() == 0 ? 0 : -1; }
int MLX90640_I2CRead(uint8_t addr, uint16_t start, uint16_t n, uint16_t *data) {
  while (n) {
    uint16_t words = n > 64 ? 64 : n;
    hat.beginTransmission(addr); hat.write(start >> 8); hat.write(start & 0xFF);
    if (hat.endTransmission(false) != 0) return -MLX90640_I2C_NACK_ERROR;
    if (hat.requestFrom(addr, (uint8_t)(words * 2)) != words * 2) return -MLX90640_I2C_NACK_ERROR;
    for (uint16_t i = 0; i < words; i++) { uint16_t hi = hat.read(); data[i] = hi << 8 | hat.read(); }
    n -= words; start += words; data += words;
    // a subpage is ~14 of these, ~90 ms in all: the buttons between each, or a tap made while it reads goes unheard --
    // at 200 kHz the next subpage is always ready, so the wait below (which listens too) never comes
    if (listening) listen();
  }
  return MLX90640_NO_ERROR;
}
int MLX90640_I2CWrite(uint8_t addr, uint16_t reg, uint16_t v) {   // read back, as Melexis's own driver checks it
  hat.beginTransmission(addr); hat.write(reg >> 8); hat.write(reg & 0xFF); hat.write(v >> 8); hat.write(v & 0xFF);
  if (hat.endTransmission() != 0) return -MLX90640_I2C_NACK_ERROR;
  uint16_t back = 0;
  if (MLX90640_I2CRead(addr, reg, 1, &back) != 0) return -MLX90640_I2C_NACK_ERROR;
  return back == v ? MLX90640_NO_ERROR : -MLX90640_I2C_WRITE_ERROR;
}
}

// ---- the camera: up while a routine runs, its memory given back after (no PSRAM on the stick) ----------------------
// The user, 2026-10-17: every routine said "not enough memory". With a daemon on the stick, its picture and its links,
// the heap was 33 KB with 22 KB in one piece -- and GLOW asked for 14 KB of tables and then a 12 KB stack at once. Now:
// the EEPROM is read into the frame's own buffer, the calibration's task has the 6 KB it needs (it leaves ~2 KB), the
// picture is smoothed as it is drawn rather than into a copy, and SOMEONE'S HERE keeps its room in hundredths. At most
// 13 KB, and no piece over 6 KB; 10 KB once it runs.
static paramsMLX90640 *params = nullptr;     // 4.7 KB, the HAT's own calibration
static uint16_t *frame = nullptr;            // 834 words: a subpage as the driver reads it -- and the EEPROM, first
static float *to = nullptr;                  // each pixel's temperature
static int16_t *room = nullptr;              // SOMEONE'S HERE's still room, in hundredths of a degree
static volatile int extracted = 0;
static volatile UBaseType_t stackLeft = 0;

// Melexis's calibration keeps three 768-float tables on the stack as it works (3 KB each, one at a time) -- more than
// the loop's 8 KB leaves this deep in a routine, so it runs in a task of its own, its stack given back when it ends.
static void extractTask(void *waiting) {
  extracted = MLX90640_ExtractParameters(frame, params);
  stackLeft = uxTaskGetStackHighWaterMark(nullptr);
  xTaskNotifyGive((TaskHandle_t)waiting);
  vTaskDelete(nullptr);
}

static String noRoom() {                     // DRAFT -- the numbers, so a failure can be told what it was short of
  return "Not enough memory free to see heat just now: " + String(ESP.getFreeHeap() / 1024) + " KB free, " +
         String(ESP.getMaxAllocHeap() / 1024) + " KB in one piece.";
}

static void glowEnd() {
  free(params); free(frame); free(to); free(room);
  params = nullptr; frame = nullptr; to = nullptr; room = nullptr;
  hat.end();                                 // 0 back to the microphone
  pinMode(board.hatSda, INPUT_PULLUP);       // and both held up, so nothing clocks the HAT while it waits (board.cpp)
  pinMode(board.hatScl, INPUT_PULLUP);
}

static String glowBegin() {
  if (board.hatSda < 0) return "This board has no HAT header.";                                         // DRAFT
  // 200 kHz, not M5Stack's 400: the HAT has no pull-up on SCL, only the chip's own, too weak for 400 kHz's edges (one
  // pixel read -135.9 C, 2026-10-17); a subpage still reads in about 90 ms of its 125
  hat.begin(board.hatSda, board.hatScl, 200000);
  hat.beginTransmission(MLX);
  if (hat.endTransmission() != 0) {
    hat.end();
    return daemonName() + " sees no heat: no Thermal HAT answers on top of the stick.\nFit it, its window facing out, and run this again.";   // DRAFT
  }
  params = (paramsMLX90640 *)malloc(sizeof(paramsMLX90640));
  frame = (uint16_t *)malloc(834 * sizeof(uint16_t));             // 832 words of EEPROM fit in it
  if (!params || !frame) { String why = noRoom(); glowEnd(); return why; }
  if (MLX90640_DumpEE(MLX, frame) != 0) { glowEnd(); return "The Thermal HAT would not give its calibration."; }  // DRAFT
  extracted = -1;
  if (xTaskCreate(extractTask, "glow", 6144, xTaskGetCurrentTaskHandle(), 1, nullptr) != pdPASS) { String why = noRoom(); glowEnd(); return why; }
  ulTaskNotifyTake(pdTRUE, portMAX_DELAY);  // arithmetic only: it always ends
  vTaskDelay(2);                            // the idle task gives its stack back before the tables below are asked for
  to = (float *)calloc(768, sizeof(float));
  if (!to) { String why = noRoom(); glowEnd(); return why; }
  Serial.printf("glow: calibrated %d (its stack had %u bytes to spare; heap %u, largest %u)\n", extracted, (unsigned)stackLeft,
                ESP.getFreeHeap(), ESP.getMaxAllocHeap());
  // its own calibration may find bad pixels it can still mend (BadPixelsCorrection); anything else is a failure
  if (extracted != 0 && extracted != -MLX90640_BROKEN_PIXELS_NUM_ERROR && extracted != -MLX90640_OUTLIER_PIXELS_NUM_ERROR) {
    String why = "The Thermal HAT's calibration did not read (" + String(extracted) + ").";             // DRAFT
    glowEnd(); return why;
  }
  MLX90640_SetChessMode(MLX);                // its own way, the one it is calibrated in
  MLX90640_SetRefreshRate(MLX, 0x04);        // 8 subpages a second: four whole pictures
  return "";
}

// ---- the buttons, heard while it waits on the camera ---------------------------------------------------------------
static int heard = 0;                        // 1 a press, -1 back, 2 a step (a stick's side tap): the last since asked
static void listen() {
  int step, ev; routineInput(step, ev);
  if (ev) heard = ev; else if (step && !heard) heard = 2;
  if (cableKey) { heard = cableKey < 0 ? -1 : 1; cableKey = 0; }   // KEY PRESS / KEY BACK down the cable (progress)
}

// One whole picture: both subpages (chess, each half the pixels). False if the camera stopped answering.
static bool glowFrame() {
  for (int sub = 0; sub < 2; sub++) {
    uint32_t t0 = millis();
    while (true) {                           // its own wait has no end; this one does, and hears the buttons
      uint16_t status = 0;
      if (MLX90640_I2CRead(MLX, MLX90640_STATUS_REG, 1, &status) != 0) return false;
      if (MLX90640_GET_DATA_READY(status)) break;
      if (millis() - t0 > 1500) return false;
      listen();
      if (heard == 1 || heard == -1) return true;
      delay(4);
    }
    int got = MLX90640_GetFrameData(MLX, frame);
    if (heard == 1 || heard == -1) return true;   // stopped while it read: the picture can wait
    if (got < 0) { if (got == -MLX90640_FRAME_DATA_ERROR) continue; return false; }   // a garbled read: the next one
    float ta = MLX90640_GetTa(frame, params);
    MLX90640_CalculateTo(frame, params, 0.95f, ta - 8, to);        // 8 below its own air, as Melexis's open-air default
    MLX90640_BadPixelsCorrection(params->brokenPixels, to, 1, params);
    MLX90640_BadPixelsCorrection(params->outlierPixels, to, 1, params);
    // a reading the sensor cannot make (outside -40..300 C, or not a number) is a word garbled on the bus: it takes the
    // mean of its neighbours that can be made
    for (int i = 0; i < 768; i++) {
      if (to[i] > -41 && to[i] < 301) continue;
      int r = i / 32, c = i % 32, n = 0; float sum = 0;
      const int nb[4] = { c > 0 ? i - 1 : -1, c < 31 ? i + 1 : -1, r > 0 ? i - 32 : -1, r < 23 ? i + 32 : -1 };
      for (int k : nb) if (k >= 0 && to[k] > -41 && to[k] < 301) { sum += to[k]; n++; }
      to[i] = n ? sum / n : 20;
    }
  }
  return true;
}

// ---- the picture --------------------------------------------------------------------------------------------------
enum { SEE, WARMEST, HERE, HOW };
static int mode = SEE;
static float lo = 20, hi = 30, warmest = 0, coolest = 0, centre = 0;
static int hotAt = 0, coldAt = 0;
static int learnLeft = 0, comers = 0, newWarm = 0; static bool someone = false;
static uint16_t ramp[64];

// Black through violet, red and orange to yellow-white: the way heat is usually drawn, so it reads at a glance.
static void rampBegin() {
  static const uint8_t S[][4] = { {0, 0, 0, 12}, {10, 40, 0, 100}, {24, 150, 0, 150}, {38, 225, 40, 40},
                                  {50, 250, 145, 0}, {58, 255, 225, 50}, {63, 255, 255, 235} };
  for (int k = 0; k < 6; k++)
    for (int i = S[k][0]; i <= S[k + 1][0]; i++) {
      float f = (float)(i - S[k][0]) / (S[k + 1][0] - S[k][0]);
      ramp[i] = canvas.color565(S[k][1] + f * (S[k + 1][1] - S[k][1]), S[k][2] + f * (S[k + 1][2] - S[k][2]),
                                S[k][3] + f * (S[k + 1][3] - S[k][3]));
    }
}

// The sensor's column 0 is the right of what it faces, seen from behind the stick: mirrored, as M5Stack's example does.
static inline float px(const float *a, int col, int row) { return a[row * 32 + (31 - col)]; }

// The stats of one picture, and the colour range eased toward them (at least 5 degrees, so a still room is not all noise).
static void glowStats() {
  hotAt = coldAt = 0;
  for (int i = 1; i < 768; i++) { if (to[i] > to[hotAt]) hotAt = i; if (to[i] < to[coldAt]) coldAt = i; }
  warmest = to[hotAt]; coolest = to[coldAt];
  centre = (to[11 * 32 + 15] + to[11 * 32 + 16] + to[12 * 32 + 15] + to[12 * 32 + 16]) / 4;
  float tlo = coolest, thi = warmest;
  if (thi - tlo < 5) { float mid = (thi + tlo) / 2; tlo = mid - 2.5f; thi = mid + 2.5f; }
  lo += (tlo - lo) * 0.35f; hi += (thi - hi) * 0.35f;
}

// Chess mode reads alternate pixels in its two subpages, and a small offset between them showed as a chessboard once the
// colours were stretched across a room's few degrees (seen on the stick, 2026-10-17). Each pixel's four neighbours are the
// other subpage's, so half of it and an eighth of each evens the two out; the numbers on the screen stay the pixels' own.
// A row at a time, as it is drawn (a copy of the whole picture was 3 KB the stick could not spare).
static void smoothRow(int row, float *out) {   // out[col], in the screen's columns (mirrored, as px)
  for (int col = 0; col < 32; col++) {
    float t = px(to, col, row);
    float n = (col > 0 ? px(to, col - 1, row) : t) + (col < 31 ? px(to, col + 1, row) : t) +
              (row > 0 ? px(to, col, row - 1) : t) + (row < 23 ? px(to, col, row + 1) : t);
    out[col] = t * 0.5f + n * 0.125f;
  }
}
static inline float roomAt(int col, int row) { return room[row * 32 + (31 - col)] / 100.0f; }

static String deg(float c) { return String(c, 1) + "C"; }   // DRAFT -- no degree sign in the board's fonts

// The picture's box on this screen: as big as fits under the day's band and over the footer, 4:3, on the left.
static int boxX = 4, boxY = 29, boxW = 120, boxH = 90;
static void boxFit() {
  boxH = H - 29 - 16; boxW = boxH * 4 / 3;
  if (boxW > W / 2) { boxW = W / 2; boxH = boxW * 3 / 4; }
}
static void cellCentre(int i, int &x, int &y) {   // a sensor pixel's middle, on the screen (mirrored, as drawn)
  int col = 31 - (i % 32), row = i / 32;
  x = boxX + (col * 2 + 1) * boxW / 64; y = boxY + (row * 2 + 1) * boxH / 48;
}

static void drawHeat() {
  float span = hi - lo;
  float rowA[32], rowB[32]; int haveA = -1, haveB = -1;   // the two smoothed rows the picture is between
  for (int sy = 0; sy < boxH; sy++) {
    float v = (sy + 0.5f) * 24 / boxH - 0.5f; if (v < 0) v = 0; if (v > 23) v = 23;
    int r0 = (int)v, r1 = r0 < 23 ? r0 + 1 : 23; float fv = v - r0;
    if (haveA != r0) { if (haveB == r0) memcpy(rowA, rowB, sizeof rowA); else smoothRow(r0, rowA); haveA = r0; }
    if (haveB != r1) { smoothRow(r1, rowB); haveB = r1; }
    for (int sx = 0; sx < boxW; sx++) {
      float u = (sx + 0.5f) * 32 / boxW - 0.5f; if (u < 0) u = 0; if (u > 31) u = 31;
      int c0 = (int)u, c1 = c0 < 31 ? c0 + 1 : 31; float fu = u - c0;
      float t = (rowA[c0] * (1 - fu) + rowA[c1] * fu) * (1 - fv) + (rowB[c0] * (1 - fu) + rowB[c1] * fu) * fv;
      int k = (int)((t - lo) / span * 63); if (k < 0) k = 0; if (k > 63) k = 63;
      uint16_t c = ramp[k];
      if (mode == HERE && !learnLeft) {      // SOMEONE'S HERE: the still room dimmed, what came into it in its colours
        float d = (px(to, c0, r0) - roomAt(c0, r0)) * (1 - fu) * (1 - fv) + (px(to, c1, r0) - roomAt(c1, r0)) * fu * (1 - fv)
                + (px(to, c0, r1) - roomAt(c0, r1)) * (1 - fu) * fv + (px(to, c1, r1) - roomAt(c1, r1)) * fu * fv;
        if (d < 1.5f) c = (c >> 2) & 0x39E7;
      }
      canvas.drawPixel(boxX + sx, boxY + sy, c);
    }
  }
}

static String drawGlow(uint16_t day, uint16_t ink) {
  drawHeat();
  int x, y, px0 = boxX + boxW + 8, pw = W - px0 - 4;
  canvas.setClipRect(boxX, boxY, boxW, boxH);   // the marks stay in the picture, even on its edge
  canvas.setTextDatum(TL_DATUM);
  auto label = [&](const String &s, int yy) { canvas.setTextFont(1); canvas.setTextColor(QUIET); canvas.drawString(s, px0, yy); };
  auto big = [&](const String &s, int yy) { canvas.setTextFont(4); canvas.setTextColor(PAPER); canvas.drawString(s, px0, yy); };
  if (mode == SEE) {
    cellCentre(hotAt, x, y);  canvas.drawCircle(x, y, 5, INK); canvas.drawCircle(x, y, 4, PAPER);
    cellCentre(coldAt, x, y); canvas.drawLine(x - 3, y - 3, x + 3, y + 3, PAPER); canvas.drawLine(x - 3, y + 3, x + 3, y - 3, PAPER);
    canvas.clearClipRect();
    canvas.drawCircle(px0 + 3, 33, 3, PAPER); label("  WARMEST", 30);                                   // DRAFT
    big(deg(warmest), 41);
    canvas.drawLine(px0 + 1, 74, px0 + 5, 78, PAPER); canvas.drawLine(px0 + 1, 78, px0 + 5, 74, PAPER); label("  COOLEST", 72);   // DRAFT
    canvas.setTextFont(2); canvas.setTextColor(PAPER); canvas.drawString(deg(coolest), px0, 83);
  } else if (mode == WARMEST) {
    cellCentre(hotAt, x, y);
    canvas.drawCircle(x, y, 8, INK); canvas.drawCircle(x, y, 7, PAPER);
    canvas.drawLine(x - 13, y, x - 9, y, PAPER); canvas.drawLine(x + 9, y, x + 13, y, PAPER);
    canvas.drawLine(x, y - 13, x, y - 9, PAPER); canvas.drawLine(x, y + 9, x, y + 13, PAPER);
    canvas.clearClipRect();
    label("THE WARMEST THING", 30);                                                                     // DRAFT
    big(deg(warmest), 41);
    wrap(upper(daemonName()) + " FOLLOWS IT", px0, 76, pw, 1, 10, 3, day);                               // DRAFT
  } else if (mode == HOW) {
    x = boxX + boxW / 2; y = boxY + boxH / 2;
    canvas.drawCircle(x, y, 6, INK); canvas.drawCircle(x, y, 5, PAPER);
    canvas.drawLine(x - 11, y, x - 7, y, PAPER); canvas.drawLine(x + 7, y, x + 11, y, PAPER);
    canvas.drawLine(x, y - 11, x, y - 7, PAPER); canvas.drawLine(x, y + 7, x, y + 11, PAPER);
    canvas.clearClipRect();
    label("THE MIDDLE", 30);                                                                            // DRAFT
    big(deg(centre), 41);
    label("WARMEST " + deg(warmest), 76); label("COOLEST " + deg(coolest), 88);                       // DRAFT
  } else if (learnLeft) {
    canvas.clearClipRect();
    label("LEARNING THE ROOM", 30);                                                                     // DRAFT
    big(String((learnLeft + 3) / 4), 41);
    wrap("Keep out of its view a moment.", px0, 76, pw, 1, 10, 4, QUIET);                              // DRAFT
  } else {
    canvas.clearClipRect();
    label(someone ? upper(daemonName()) + " SEES" : "WATCHING", 30);                                     // DRAFT
    if (someone) wrap("SOMEONE'S HERE", px0, 42, pw, 2, 17, 2, day);                                   // DRAFT
    else { canvas.setTextFont(2); canvas.setTextColor(QUIET); canvas.drawString("no one yet", px0, 42); }   // DRAFT
    if (comers) label(comers == 1 ? "came once" : "came " + String(comers) + " times", 82);             // DRAFT
  }
  return "press: stop";                                                                                 // DRAFT
}

// ---- the routines: one loop, four ways of looking -----------------------------------------------------------------
static String glowRun(int m) {
  String why = glowBegin();
  if (why.length()) return why;
  mode = m; heard = 0; boxFit(); rampBegin();
  lo = 20; hi = 30; warmest = coolest = centre = 0; hotAt = coldAt = 0;
  learnLeft = 0; comers = 0; newWarm = 0; someone = false;
  if (m == HERE) {
    room = (int16_t *)calloc(768, sizeof(int16_t));
    if (!room) { String why = noRoom(); glowEnd(); return why; }
    learnLeft = 20;                          // five seconds of pictures, the room still
  }
  float seenHot = -999, seenCold = 999, lastCentre = 0; int lost = 0, calm = 0, ready = 0;
  listening = true;
  uint32_t t0 = millis(), lastCame = 0;
  bool firstShown = false;
  runPanel = drawGlow;
  while (true) {
    if (!glowFrame()) { if (++lost > 3) break; delay(50); continue; }
    if (heard == 1 || heard == -1) break;
    lost = 0;
    glowStats();
    if (!firstShown) { lo = coolest; hi = warmest; if (hi - lo < 5) { lo = (lo + hi) / 2 - 2.5f; hi = lo + 5; } firstShown = true; }
    seenHot = max(seenHot, warmest); seenCold = min(seenCold, coolest); lastCentre = centre;
    if (m == HERE) {
      if (learnLeft) {                       // the still room: each pixel's mean over the first twenty pictures
        for (int i = 0; i < 768; i++) room[i] += (int16_t)lroundf(constrain(to[i], -40.0f, 300.0f) * 5);   // 100ths, a 20th
        learnLeft--;
      } else {
        // a warm body: a few pixels at least 2.5 degrees over the room and warm as a person is; it has come when two
        // pictures in a row say so, and gone after four that do not. The room follows slow changes where no one is.
        newWarm = 0;
        for (int i = 0; i < 768; i++) {
          float r = room[i] / 100.0f, d = to[i] - r;
          if (d > 2.5f && to[i] > 26) newWarm++;
          else if (d < 1.0f) room[i] = (int16_t)lroundf((r + d * 0.02f) * 100);
        }
        if (!someone) { ready = newWarm >= 6 ? ready + 1 : 0; if (ready >= 2) { someone = true; comers++; lastCame = millis(); calm = 0; progress(""); soundSelect(); } }
        else { calm = newWarm < 3 ? calm + 1 : 0; if (calm >= 4) { someone = false; ready = 0; } }
      }
    }
    progress("");
    listen();                                // and a KEY PRESS that came down the cable while it drew (progress)
    if (heard == 1 || heard == -1) break;
    heard = 0;
    if (millis() - t0 > 10UL * 60 * 1000) break;   // ten minutes, then it rests: the stick's cell is small
  }
  listening = false;
  runPanel = nullptr; lastInput = millis();
  int secs = (millis() - t0) / 1000;
  glowEnd();
  String name = daemonName();
  if (lost > 3 && seenHot < -900) return "The Thermal HAT stopped answering. Is it still on?";              // DRAFT
  String out;
  if (m == SEE) out = name + " watched the heat for " + String(secs) + " s. The warmest it saw was " + deg(seenHot) +
                      ", the coolest " + deg(seenCold) + ".";                                                // DRAFT
  else if (m == WARMEST) out = name + " followed the warmest thing for " + String(secs) + " s. The warmest was " + deg(seenHot) + ".";   // DRAFT
  else if (m == HOW) out = name + " looked for " + String(secs) + " s. The middle read " + deg(lastCentre) + " last.";   // DRAFT
  else if (!comers) out = name + " kept watch for " + String(secs) + " s. No one came.";                     // DRAFT
  else out = name + " kept watch for " + String(secs) + " s. Someone came " + (comers == 1 ? String("once") : String(comers) + " times") +
             "; the last " + String((millis() - lastCame) / 1000) + " s ago.";                               // DRAFT
  if (lost > 3) out += "\n\nThe Thermal HAT stopped answering.";                                            // DRAFT
  return out;
}

String runSeeTheHeat()   { return glowRun(SEE); }
String runWarmestThing() { return glowRun(WARMEST); }
String runSomeonesHere() { return glowRun(HERE); }
String runHowWarm()      { return glowRun(HOW); }
