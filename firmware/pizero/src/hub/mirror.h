#pragma once
// C-380: one save with the hub, as the app keeps it (app/screens/game/Game.tsx, docs/ONEAPP.md). Paired as a phone,
// the device's save is the real one and the hub keeps a mirror of it:
//   pull  -- before the game starts, or comes back from HOME: the hub's copy, and C-365's rule (server/src/game/
//            mirror.ts mirrorChoice) says whether it is taken. "take" while this device's save has not moved since the
//            two agreed; "keep" when only this device moved (C-384: it goes out); both moved, the truth decides --
//            "replace" (the companion's, the default: this device's own is set aside in the hub's trail first, C-364)
//            or "keep" (this device's goes out at its next save)
//   push  -- after every save the game writes: sent with `base`, the copy both last held, so a late write never undoes
//            a SYNC; the hub refuses another game's save, or a copy it has moved on from (409)
// `agreed` is kept in <data>/mirror.json. On a computer the mirror is read only by default: the window takes the hub's
// copy to play on, and never writes the hub's save (--mirror send if it should).
#include <string>
#include "game/hash.h"

namespace mirror {
enum class Mode { Off, Read, Send };
Mode mode();
void setMode(Mode m);
const char *modeName(Mode m);
Mode modeByName(const std::string &name, Mode otherwise);

std::string agreed();

struct In {
  std::string choice;     // "same", "take", "replace", "keep", or "" when nothing came (no mirror yet, away, not paired)
  std::string why;        // what happened, in words (DRAFT)
  bool took = false;      // `save` is the hub's, to be played
  Bytes save;
};
In pull(const Bytes &mine);

struct Out { bool sent = false, otherGame = false; std::string why; };
Out push(const Bytes &save);

// push on a thread of its own: the newest save waiting is sent, one at a time; `lastOut` says how the last one went
void pushLater(const Bytes &save);
bool pushing();
Out lastOut(uint64_t &serial);   // serial goes up with each outcome
void finish(int waitMs);         // the save still on its way gets this long (APPLaunch kills three seconds after SIGINT)
}
