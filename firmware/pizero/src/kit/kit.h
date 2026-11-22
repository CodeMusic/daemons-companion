#pragma once
// C-453 (docs/ZEROKIT.md): the LLM630 Compute Kit on the Zero's back -- its link (C-458), its power by demand (C-459),
// and the daemon's offline voice on it (C-461): whisper hears, the LLM answers as the carried daemon, melotts speaks.
// The Kit is reached at ~/.config/daemons/kit ("10.77.0.2:10001", the cable's network; DAEMONS_KIT overrides; "off" is
// none). Its own agent (firmware/llm630/kitd.py) answers on the next port up: its cell, its heat, its hotspot.
// Everything here runs on a thread of its own; a page reads view() and never waits. Every word DRAFT.
#include <cstdint>
#include <string>
#include <vector>
#include "game/hash.h"
#include "kit/policy.h"

namespace kit {

Limits limits();                       // ~/.config/daemons/kit.limits ("ask 40", "refuse 10", "always yes")
void keepLimits(const Limits &l);

// ---- C-461: where a talk goes (docs/ZEROKIT.md 4) -----------------------------------------------------------------------
enum class Via { Best, Kit, Mind };   // best: the hub's mind when it answers, else the Kit; kit: only here; mind: only the hub
Via via();
void keepVia(Via v);
const char *viaName(Via v);
Via viaByName(const std::string &s, Via otherwise);

enum class State { Off, Unreached, Asleep, Waking, Awake, Busy };
const char *stateName(State s);

struct Model { std::string mode, type; };
struct View {
  std::string address;               // host:port, or "" when off
  State state = State::Off;
  std::string why;                   // the last thing that went wrong, in words
  // from its agent (kitd), when it answers
  bool agent = false;
  int cell = -1;                     // its own cell, %; -1 none fitted or not known
  bool charging = false, onUsb = false;
  float temp = -1;                   // the AX630C's heat, degrees C
  int memFreeMb = -1;
  std::string hotspot;               // "on", "off", "" not known
  std::string ssid, key;             // the hotspot's name and key while it is on, to tell a guest (C-460)
  std::string version;               // StackFlow's
  std::vector<Model> models;         // sys.lsmode, once asked
  // the talk in hand
  bool talking = false;
  std::string heard, answer, by;     // by: "kit" or the hub's provider
  std::string llm, stt, tts;         // the models it set up
};

void begin();                        // its thread; asks the Kit now and then while nothing is in hand
void end();
View view();
bool configured();

void refresh();                      // ask again now (state, agent, models)
void wake();                         // set the three units up (the models into the NPU): the caller has asked mayWake
void sleep();                        // exit the units: the Kit's standby
void hotspot(bool on);               // through its agent

// a turn: typed words, or a recording (16 kHz mono WAV). The daemon's self is a short line the caller writes.
void say(const std::string &words, const std::string &self, bool speak);
void hear(const Bytes &wav, const std::string &self, bool speak);
void answeredElsewhere(const std::string &heard, const std::string &answer, const std::string &by, bool speak);   // the hub's answer, voiced here

// for the command line (over SSH, for checks): each waits and says what happened
int cliStatus();                     // the link, the agent, the units, every model
int cliSay(const std::string &words, bool speak);
int cliHear(const std::string &wavPath, bool speak);

// the default models (docs/ZEROKIT.md; M5Stack's repository, 2026-11-21): the 0.5B thinker that holds 256 tokens,
// whisper's base, the American voice. ~/.config/daemons/kit.models overrides ("llm NAME", "stt NAME", "tts NAME").
struct Choice { std::string llm = "qwen2.5-0.5B-p256-ax630c", stt = "whisper-base", tts = "melotts-en-us"; };
Choice chosen();

Bytes wav16k(const std::vector<int16_t> &mono);   // a 16 kHz mono WAV of these samples
}  // namespace kit
