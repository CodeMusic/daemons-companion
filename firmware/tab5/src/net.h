#pragma once
// C-77: how the Tab5 reaches the companion. Its own Wi-Fi; paired like a phone (a key that opens the whole API), at home
// and away through the relay the phone uses; everything downloaded and kept, and the writes made away sent in order.
// The network runs on its own task, so the screen never waits on it; the screen asks for work through netAsk().
#include <Arduino.h>
#include <atomic>

struct NetStatus {
  bool wifi = false;                 // joined a network
  bool paired = false;               // holds a key
  bool home = false, away = false;   // what answered last: home, or the relay
  bool syncing = false;
  String network;                    // the network joined
  String message;                    // the last thing worth saying ("Paired.", "That code is not right." ...)
  int artDone = 0, artTotal = 0;     // the INDEX's pictures, while they download
};
extern NetStatus net;
extern std::atomic<uint32_t> keptChanged;   // bumped whenever a kept answer changes: the screens redraw from it
// C-98: which answers changed since the screen last looked, so a page is drawn again only when what it shows did
enum : uint32_t { K_TODAY = 1, K_GOALS = 2, K_PARTY = 4, K_PROFILE = 8, K_DEVICES = 16, K_STATE = 32, K_INDEX = 64,
                  K_ART = 128, K_NETS = 256, K_MESSAGE = 512, K_VOICE = 1024 };
extern std::atomic<uint32_t> keptMask;

void netBegin();
const String &deviceId();            // "m5-tab5-" and the end of its MAC (C-80)
// What the screen asks for
void netJoin(const String &ssid, const String &pass);
void netScan();                      // fills netNetworks
extern String netNetworks[16]; extern int netNetworkCount;
void netPair(const String &server, const String &code);
void netSyncNow();                   // download everything again
void netGameSync();                  // SYNC with the game: only when the companion answers (it writes the save)
void netSend(const char *method, const String &path, const String &body);   // a write: sent now, or kept and sent later
String serverAddress();
bool localTime(struct tm &out);      // the time where the companion is, once it has said (its state carries the clock)
String relayAddress();
// C-99: an INDEX entry read aloud in the INDEX voice (the companion makes it; only at home -- the relay carries no voice)
enum Voice { V_QUIET, V_MAKING, V_SPEAKING };
extern std::atomic<int> netVoice;    // what the voice is doing
void netSpeak(int species);          // make it and play it; a second call, or netHush(), stops it
void netHush();
