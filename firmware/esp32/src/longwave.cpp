// LONGWAVE: the T-Embed CC1101's Sub-GHz radio (CONTEXT.md: the author's own devices; receive only here).
//
// WHAT'S ON THE AIR listens across the four bands the board's antenna switch serves -- 315, 433.92, 868.35 and 915 MHz,
// where weather stations, doorbells, car keys and meters talk in short bursts -- and shows how loud each is, learning
// each band's quiet first and counting the bursts above it. It never transmits.
//
// The radio shares the screen's SPI bus (SCK 11, MOSI 9, MISO 10; its own CS 12), as LilyGO's factory firmware has it:
// the screen finishes its transfers before the radio speaks, and the SD card (CS 13) is held off the bus.
#include <RadioLib.h>
#include <SPI.h>
#include "app.h"
#include "leds.h"

static SPIClass radioSpi(HSPI);
static CC1101 *radio = nullptr;
static const int CS = 12, GDO0 = 3, GDO2 = 38, SW1 = 47, SW0 = 48, SD_CS = 13;

// The antenna switch: SW1 1 SW0 0 for 315 MHz, 1 1 for 433, 0 1 for 868 and 915 (LilyGO's cc1101_recv example).
static void band(float mhz) {
  bool sw1 = mhz < 500, sw0 = mhz > 350;
  digitalWrite(SW1, sw1); digitalWrite(SW0, sw0);
}

static bool radioOn(float mhz) {
  tft.waitDMA();
  pinMode(SD_CS, OUTPUT); digitalWrite(SD_CS, HIGH);
  pinMode(SW1, OUTPUT); pinMode(SW0, OUTPUT);
  band(mhz);
  if (!radio) {
    radioSpi.begin(11, 10, 9);
    radio = new CC1101(new Module(CS, GDO0, RADIOLIB_NC, GDO2, radioSpi));
    if (radio->begin(mhz) != RADIOLIB_ERR_NONE) { delete radio; radio = nullptr; return false; }
    radio->setOOK(true);                        // most of these bands' gadgets key the carrier on and off
    radio->setRxBandwidth(270);
  }
  return true;
}

// Listen at one frequency, live: the chip's RSSI register in direct receive mode.
static void tune(float mhz) {
  tft.waitDMA();
  radio->standby();
  band(mhz);
  radio->setFrequency(mhz);
  radio->receiveDirectAsync();
  delay(2);
}

static void radioOff() { if (radio) { tft.waitDMA(); radio->standby(); radio->sleep(); } }

String runWhatsOnTheAir() {
  if (!board.cc1101) return "This needs the T-Embed CC1101.";                                              // DRAFT
  static const float BAND_MHZ[] = { 315.0f, 433.92f, 868.35f, 915.0f };
  static const char *BAND_NAME[] = { "315", "433", "868", "915" };
  if (!radioOn(BAND_MHZ[1])) return "The Sub-GHz radio did not answer.";                                      // DRAFT
  float floorDb[4] = { 0, 0, 0, 0 }, now[4] = { -120, -120, -120, -120 }, peak[4] = { -120, -120, -120, -120 };
  int learnt[4] = { 0, 0, 0, 0 }, bursts[4] = { 0, 0, 0, 0 };
  uint32_t lastBurst[4] = { 0, 0, 0, 0 }, t0 = millis(), shown = 0;
  bool learning = true;
  while (millis() - t0 < 90000 && !giveUp()) {
    for (int b = 0; b < 4; b++) {
      tune(BAND_MHZ[b]);
      float loud = -130;
      for (uint32_t d = millis(); millis() - d < 60; ) { loud = max(loud, radio->getRSSI()); delayMicroseconds(800); }
      now[b] = loud;
      if (learning) { floorDb[b] += loud; learnt[b]++; continue; }
      float quiet = learnt[b] ? floorDb[b] / learnt[b] : -100;
      if (loud > quiet + 15 && millis() - lastBurst[b] > 300) { bursts[b]++; lastBurst[b] = millis(); ledsFlash(); }
      peak[b] = max(peak[b], loud);
    }
    if (learning && millis() - t0 > 5000) learning = false;
    ledsLoop();
    if (millis() - shown > 400) {
      shown = millis();
      String s = learning ? "Learning each band's quiet... " + String(5 - (millis() - t0) / 1000) + "\n" : String("");
      for (int b = 0; b < 4; b++) {
        float quiet = learnt[b] ? floorDb[b] / learnt[b] : -100;
        int bars = constrain((int)((now[b] - quiet) / 3), 0, 18);
        s += String(BAND_NAME[b]) + "  " + String((int)now[b]) + " dBm  " + String("||||||||||||||||||").substring(0, bars) +
             (learning ? "" : "  " + String(bursts[b])) + "\n";
      }
      tft.waitDMA();
      progress(s + "top button: stop");                                                                     // DRAFT
    }
  }
  radioOff();
  int total = bursts[0] + bursts[1] + bursts[2] + bursts[3];
  return daemonName() + " listened for " + String((millis() - t0) / 1000) + " s and heard " + String(total) +
         (total == 1 ? " burst" : " bursts") + ": 315 MHz " + String(bursts[0]) + ", 433 " + String(bursts[1]) +
         ", 868 " + String(bursts[2]) + ", 915 " + String(bursts[3]) + ".";                                 // DRAFT
}
