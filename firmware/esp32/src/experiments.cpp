// C-70: the radio experiments, one at a time. Each says plainly what it can and cannot sense.
//
// WI-FI MOTION (every board): Wi-Fi sensing. Each packet from the access point carries its channel state -- how every
// subcarrier arrived, bent by the walls, the furniture and anyone moving between. Still air keeps that picture still;
// a person walking through the room changes it from packet to packet. The board pings its gateway twenty times a second
// so the packets keep coming, and scores how much each picture differs from the last. It senses movement near the line
// between the board and the access point, not who or what moved -- and a fan or a pet moves it too.
#include <WiFi.h>
#include <esp_wifi.h>
#include <ping/ping_sock.h>
#include "app.h"
#include "leds.h"

static const int SUB = 64;                    // the legacy long training field's subcarriers
static portMUX_TYPE csiLock = portMUX_INITIALIZER_UNLOCKED;
static float prevAmp[SUB], motionSum = 0;
static int motionCount = 0;
static bool havePrev = false;
static uint8_t apMac[6];

static void IRAM_ATTR onCsi(void *, wifi_csi_info_t *info) {
  if (!info || !info->buf || memcmp(info->mac, apMac, 6)) return;   // the access point's packets only
  int n = min(SUB, (int)info->len / 2);
  float amp[SUB], diff = 0, base = 0;
  for (int k = 0; k < n; k++) {
    float im = info->buf[2 * k], re = info->buf[2 * k + 1];
    amp[k] = sqrtf(re * re + im * im);
  }
  portENTER_CRITICAL_ISR(&csiLock);
  if (havePrev) {
    for (int k = 0; k < n; k++) { diff += fabsf(amp[k] - prevAmp[k]); base += prevAmp[k]; }
    if (base > 0) { motionSum += diff / base; motionCount++; }
  }
  memcpy(prevAmp, amp, sizeof(float) * n); havePrev = true;
  portEXIT_CRITICAL_ISR(&csiLock);
}

static esp_ping_handle_t startPings() {
  esp_ping_config_t pc = ESP_PING_DEFAULT_CONFIG();
  IPAddress gw = WiFi.gatewayIP();
  pc.target_addr.type = IPADDR_TYPE_V4;
  pc.target_addr.u_addr.ip4.addr = static_cast<uint32_t>(gw);
  pc.count = ESP_PING_COUNT_INFINITE; pc.interval_ms = 50; pc.timeout_ms = 1000; pc.data_size = 8;
  esp_ping_callbacks_t cbs = {};
  esp_ping_handle_t ping = nullptr;
  if (esp_ping_new_session(&pc, &cbs, &ping) == ESP_OK) esp_ping_start(ping);
  return ping;
}

String runWifiMotion() {
  if (WiFi.status() != WL_CONNECTED) return "WI-FI MOTION listens to the network the board is on. Join one first: TEACH A NETWORK.";   // DRAFT
  memcpy(apMac, WiFi.BSSID(), 6);
  havePrev = false; motionSum = 0; motionCount = 0;
  wifi_csi_config_t cfg = {};
  cfg.lltf_en = true; cfg.htltf_en = false; cfg.stbc_htltf2_en = false; cfg.ltf_merge_en = true;
  cfg.channel_filter_en = true; cfg.manu_scale = false; cfg.shift = 0;
  if (esp_wifi_set_csi_config(&cfg) != ESP_OK || esp_wifi_set_csi_rx_cb(onCsi, nullptr) != ESP_OK || esp_wifi_set_csi(true) != ESP_OK)
    return "This board's Wi-Fi would not share its channel state.";                                   // DRAFT
  esp_ping_handle_t ping = startPings();
  // The first five seconds learn the room still; after that, a score well above the still room is movement.
  float still = 0, peak = 0; int stillN = 0, moved = 0, seconds = 0;
  uint32_t t0 = millis(), shown = 0;
  while (millis() - t0 < 45000 && !giveUp()) {
    delay(100);
    if (millis() - shown < 500) continue;
    shown = millis();
    float score; int n;
    portENTER_CRITICAL(&csiLock); score = motionCount ? motionSum / motionCount : 0; n = motionCount; motionSum = 0; motionCount = 0;
    portEXIT_CRITICAL(&csiLock);
    seconds = (millis() - t0) / 1000;
    if (seconds < 5) { if (n) { still += score; stillN++; }
      progress("Learning the room while it is still... " + String(5 - seconds) + "\n\nStand back, and keep still.");   // DRAFT
      continue; }
    float calm = stillN ? still / stillN : score, ratio = calm > 0 ? score / calm : 0;
    peak = max(peak, ratio);
    bool moving = ratio > 1.8f;
    if (moving) moved++;
    int bars = constrain((int)(ratio * 4), 0, 24);
    ledsDance(DANCE_PULSE, moving ? 0 : 1, 2);
    progress(String(moving ? "SOMETHING MOVED" : "still") + "   " + String(ratio, 1) + "x\n" +
             String("||||||||||||||||||||||||").substring(0, bars) + "\n\n" + String(n) + " packets a half-second.  Top button: stop.");   // DRAFT
  }
  ledsDance(-1, 0, 0);
  if (ping) { esp_ping_stop(ping); esp_ping_delete_session(ping); }
  esp_wifi_set_csi(false);
  return daemonName() + " watched the air for " + String(seconds) + " s. Movement " + String(moved / 2) +
         " s of it; the most, " + String(peak, 1) + " times the still room.";                          // DRAFT
}
