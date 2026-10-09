// C-76: StackFlow's protocol, as M5Stack's own code speaks it (docs/LLM630.md, read in code and NOT yet run on an
// LLM630): one JSON object per message, {request_id, work_id, action, object, data}; `setup` answers with the unit's
// instance id; `inference` sends data, whole or in pieces ({delta, index, finish}); answers come back the same way.
#include <memory>
#include <WiFi.h>
#include <Preferences.h>
#include <mbedtls/base64.h>
#include "app.h"
#include "brain.h"
#include "sound.h"

static String how;                                  // "", "uart", or "tcp host:port"
static WiFiClient tcp;
static Stream *wire = nullptr;
static String workWhisper, workLlm, workTts;        // the units' instance ids, once set up
static int nextId = 1;

void brainLoad() { Preferences p; p.begin("brain", false); how = p.isKey("how") ? p.getString("how", "") : ""; p.end(); }
bool brainConfigured() { return how.length() > 0; }
String brainDescribe() { return how.length() ? how : String("off"); }

bool brainSet(const String &h) {
  String v = h; v.trim();
  if (v == "off") v = "";
  else if (v != "uart" && !v.startsWith("tcp ")) return false;
  how = v; workWhisper = workLlm = workTts = ""; wire = nullptr; tcp.stop();
  Preferences p; p.begin("brain", false); p.putString("how", how); p.end();
  return true;
}

static bool connect() {
  if (wire && (how == "uart" || tcp.connected())) return true;
  workWhisper = workLlm = workTts = "";             // a new connection: the units are set up again
  if (how == "uart") {                              // the CC1101's back header: RX 44, TX 43 (TX to its RX, RX to its TX)
    Serial1.setRxBufferSize(16384);
    Serial1.begin(115200, SERIAL_8N1, 44, 43);
    wire = &Serial1; return true;
  }
  String target = how.substring(4); int colon = target.indexOf(':');
  String host = colon < 0 ? target : target.substring(0, colon);
  int port = colon < 0 ? 10001 : target.substring(colon + 1).toInt();
  if (WiFi.status() != WL_CONNECTED || !tcp.connect(host.c_str(), port, 3000)) return false;
  tcp.setNoDelay(true);
  wire = &tcp; return true;
}

static void sendJson(JsonDocument &d) { serializeJson(d, *wire); wire->print("\n"); wire->flush(); }

// One whole JSON object from the wire: braces counted outside strings, so nothing need end a line. Anything before the
// first brace (the ESP32's own boot text on IO43, a prompt) is skipped.
static bool readJson(JsonDocument &d, uint32_t waitMs) {
  String s; int depth = 0; bool inStr = false, esc = false;
  uint32_t until = millis() + waitMs;
  while (millis() < until) {
    if (!wire->available()) { delay(2); continue; }
    char c = wire->read();
    if (!depth && c != '{') continue;
    s += c;
    if (inStr) { if (esc) esc = false; else if (c == '\\') esc = true; else if (c == '"') inStr = false; continue; }
    if (c == '"') inStr = true;
    else if (c == '{') depth++;
    else if (c == '}' && --depth == 0) return !deserializeJson(d, s);
    until = millis() + waitMs;                       // a message still arriving keeps the wait open
  }
  return false;
}

// setup -> the instance's work_id ("whisper.1001"), or "" when it failed.
static String setupUnit(const char *unit, JsonDocument &data) {
  JsonDocument q;
  q["request_id"] = String("s") + nextId++; q["work_id"] = unit; q["action"] = "setup";
  q["object"] = String(unit) + ".setup"; q["data"] = data;
  sendJson(q);
  JsonDocument a;
  for (int tries = 0; tries < 4 && readJson(a, 30000); tries++)
    if (String(a["request_id"] | "") == String(q["request_id"] | "")) return (a["error"]["code"] | -1) == 0 ? String(a["work_id"] | "") : "";
  return "";
}

static bool setupUnits() {
  if (workWhisper.length() && workLlm.length() && workTts.length()) return true;
  if (!workWhisper.length()) {
    JsonDocument d; d["model"] = "whisper-base"; d["response_format"] = "asr.utf-8"; d["input"] = "whisper.wav.stream.base64";
    d["enoutput"] = true; d["language"] = "en";
    workWhisper = setupUnit("whisper", d);
  }
  if (!workLlm.length()) {                           // the character: short, because the small model's context is
    String who = st.carrying ? st.daemon.nickname : String("a daemon");
    JsonDocument d; d["model"] = "qwen2.5-0.5B-prefill-20e"; d["response_format"] = "llm.utf-8.stream";
    d["input"] = "llm.utf-8"; d["enoutput"] = true; d["max_token_len"] = 128;
    d["prompt"] = "You are " + who + ", a small creature called a daemon" +
                  (st.carrying && st.daemon.types.length() ? " of the " + st.daemon.types + " kind" : String("")) +
                  ", carried by the person speaking. Answer in one or two short, kind sentences, as yourself.";   // DRAFT
    workLlm = setupUnit("llm", d);
  }
  if (!workTts.length()) {
    JsonDocument d; d["model"] = "melotts-en-us"; d["response_format"] = "pcm.stream.base64"; d["input"] = "tts.utf-8";
    d["enoutput"] = true;
    workTts = setupUnit("melotts", d);
  }
  return workWhisper.length() && workLlm.length() && workTts.length();
}

// The text of an answer: whole (data is a string) or in pieces until finish.
static bool collectText(const String &work, String &out, uint32_t waitMs) {
  JsonDocument a;
  while (readJson(a, waitMs)) {
    if (String(a["work_id"] | "") != work) continue;
    if ((a["error"]["code"] | 0) != 0) return false;
    if (a["data"].is<const char *>()) { out += String((const char *)a["data"]); return true; }
    out += String(a["data"]["delta"] | "");
    if (a["data"]["finish"] | false) return true;
    if (out.length()) progress(out);                 // the words as they come
  }
  return out.length() > 0;
}

bool brainTurn(const uint8_t *wav, size_t bytes, String &heard, String &answer, String &error) {
  heard = answer = error = "";
  if (!brainConfigured()) { error = "No offline brain set."; return false; }                                  // DRAFT
  if (!connect()) { error = "The offline brain did not answer (" + how + ")."; return false; }                 // DRAFT
  progress("Waking the offline brain...");                                                                     // DRAFT
  if (!setupUnits()) { error = "The offline brain would not set up its units."; return false; }                   // DRAFT

  // 1. the recording to whisper, in base64 pieces of 4,096 characters, as M5's own plugin sends it
  static const size_t RAW = 3072;                    // 3,072 bytes -> 4,096 base64 characters
  std::unique_ptr<unsigned char, void (*)(void *)> b64Held((unsigned char *)malloc(4100), free);   // C-97: borrowed while in use, not kept
  unsigned char *b64 = b64Held.get();
  if (!b64) { error = "Not enough memory for the recording."; return false; }   // DRAFT
  int index = 0;
  for (size_t at = 0; at < bytes; at += RAW, index++) {
    size_t n = min(RAW, bytes - at), olen = 0;
    mbedtls_base64_encode(b64, 4100, &olen, wav + at, n);
    b64[olen] = 0;
    JsonDocument q;
    q["request_id"] = String("w") + nextId; q["work_id"] = workWhisper; q["action"] = "inference";
    q["object"] = "asr.wav.stream.base64";
    q["data"]["delta"] = (const char *)b64; q["data"]["index"] = index; q["data"]["finish"] = at + n >= bytes;
    sendJson(q);
  }
  nextId++;
  progress("Listening, offline...");                                                                           // DRAFT
  if (!collectText(workWhisper, heard, 60000) || !heard.length()) { error = "The offline brain heard nothing."; return false; }

  // 2. the words to the model, its answer in pieces
  { JsonDocument q; q["request_id"] = String("l") + nextId++; q["work_id"] = workLlm; q["action"] = "inference";
    q["object"] = "llm.utf-8"; q["data"] = heard; sendJson(q); }
  if (!collectText(workLlm, answer, 60000) || !answer.length()) { error = "The offline brain had no answer."; return false; }
  answer.trim();
  progress(answer);

  // 3. the answer to melotts; each piece of 16 kHz samples played as it arrives
  { JsonDocument q; q["request_id"] = String("t") + nextId++; q["work_id"] = workTts; q["action"] = "inference";
    q["object"] = "tts.utf-8"; q["data"] = answer; sendJson(q); }
  JsonDocument a;
  while (readJson(a, 30000)) {
    if (String(a["work_id"] | "") != workTts) continue;
    const char *delta = a["data"]["delta"] | (a["data"].is<const char *>() ? (const char *)a["data"] : "");
    size_t len = strlen(delta), olen = 0;
    uint8_t *pcm = len ? (uint8_t *)ps_malloc(len * 3 / 4 + 4) : nullptr;   // a sentence of voice, sized to fit
    if (pcm && !mbedtls_base64_decode(pcm, len * 3 / 4 + 4, &olen, (const unsigned char *)delta, len))
      soundPcm((const int16_t *)pcm, olen / 2);
    free(pcm);
    if ((a["data"]["finish"] | true) || giveUp()) break;
  }
  return true;
}
