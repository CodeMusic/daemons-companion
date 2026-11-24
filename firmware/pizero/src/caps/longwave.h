#pragma once
// C-447: LONGWAVE ROLL CALL on the Cardputer Zero -- radio tests between the user's own devices (docs/CAPS.md). A call
// is three short packets; every device of the household that hears it answers in its own slot, and the caller draws who
// answered, how loud each was both ways and how many of the call's packets arrived. The frame, slots and limits are
// firmware/common/rollcall.h, shared with the ADV.
//
// It transmits only where caps::mayTransmit says (the band's antenna fitted; 433 or 915, never 315 or 868), at -10 dBm
// unless asked lower or up to 0 dBm and never above, and at 433 MHz no more than one call every ten seconds.
#include <cstdint>
#include <string>
#include <vector>

namespace longwave {

struct Answer {
  uint16_t id = 0;
  std::string name;
  int slot = 0;
  int here = -127;      // its answer as heard here, dBm
  int there = -127;     // the call as it heard it, dBm
  int heard = 0, of = 0;   // how many of the call's packets reached it
};

struct Result {
  bool sent = false;
  std::string why;              // why no call went out
  uint16_t call = 0;
  uint8_t mode = 0;
  int packets = 0, power = 0;   // the call's packets sent, and the dBm they went at
  std::vector<Answer> answers;
  int noise = 0;                // packets on the band that were not DAEMONS frames (dropped unread)
  int strangers = 0;            // DAEMONS frames from another household (dropped unread)
  int broken = 0;               // packets whose CRC failed
};

uint16_t me();                       // this device's short id (from its device id)
std::string myName();                // up to eight letters, the device's host name
std::string keyName();               // whose devices answer: "YOUR HUB (name)", "YOUR OWN KEY", or "ANY DAEMONS DEVICE"

int power();                         // dBm, -30 to 0
void setPower(int dbm);              // kept in cap.conf's neighbour, rollcall.conf

std::string mayCall();               // "" when a call may go out now, else why not, in words (DRAFT)
int quietLeft();                     // seconds before the band may be called on again (433: ten seconds a call)

// One call, and its answers. Blocks for under half a second.
Result call(uint8_t mode, const std::vector<uint16_t> &targets);

// Answering: while on, a call heard is answered in this device's slot. tick() is called often (each frame); it returns
// a line when it answered someone, else "".
bool setAnswering(bool on);          // false (and stays off) where this device may not transmit
bool answering();
std::string tick();
int answeredCount();

}  // namespace longwave
