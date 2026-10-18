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
// the review, 2026-10-18: net.message and net.network are written on the network's task and read on the screen's -- an
// Arduino String torn mid-copy is garbage or a fault -- so they are read and written only through these (a mutex)
String netMessage();
String netNetworkName();
void netSay(const String &m);
extern std::atomic<uint32_t> keptChanged;   // bumped whenever a kept answer changes: the screens redraw from it
// C-98: which answers changed since the screen last looked, so a page is drawn again only when what it shows did
enum : uint32_t { K_TODAY = 1, K_GOALS = 2, K_PARTY = 4, K_PROFILE = 8, K_DEVICES = 16, K_STATE = 32, K_INDEX = 64,
                  K_ART = 128, K_NETS = 256, K_MESSAGE = 512, K_VOICE = 1024, K_HOME = 2048 };
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
// C-139: HOME -- Home Assistant through the companion (server/src/home.ts; its address and token are set on the computer it
// runs on, never here). Kept as "home", downloaded while the page is open and every 30 s while it stays open. A tap is sent
// NOW and never kept for later (an old "turn on the kettle" sent hours afterwards is wrong): it goes, or the page says it
// did not. `before` is the thing as it was shown, put back if the tap does not go.
void netHomeWatch(bool open);        // every pass of the screen: whether HOME is the page on it
void netHomeAct(const String &id, const String &action, const String &before);
void netHomeAsk(const String &text); // Home Assistant's own conversation agent answers
void netHomeHeard(String &asked, String &answer);   // the last thing asked, and its answer ("" while it comes)
