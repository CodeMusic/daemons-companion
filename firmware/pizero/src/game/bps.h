#pragma once
// C-379: our BPS patch applied on the device -- the player's own FireRed or LeafGreen in, DAEMONS out. A line-for-line
// port of server/src/game/bps.ts (the phone's), with the same three checks and the same words when one fails.
#include <stdexcept>
#include "game/hash.h"

struct PatchError : std::runtime_error { using std::runtime_error::runtime_error; };

Bytes applyBps(const Bytes &source, const Bytes &patch);   // throws PatchError
