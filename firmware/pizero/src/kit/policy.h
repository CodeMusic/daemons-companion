#pragma once
// C-459 (docs/ZEROKIT.md 2): may the Kit be woken? Kept apart so the checks can ask it with no Kit (test/tests.cpp).
namespace kit {
// ---- C-459: may the Kit be woken? -------------------------------------------------------------------------------------
enum class Wake { Go, Ask, Override, Refuse };
struct Limits { int ask = 40, refuse = 10; bool alwaysAsk = true; };   // above ask: asked once; ask..refuse: OVERRIDE; below refuse: no
// the lower of the charges known (-1: not known; a charger lifts every limit)
Wake mayWake(int zeroPercent, bool zeroCharging, int kitPercent, bool kitCharging, const Limits &l);
const char *wakeName(Wake w);

}  // namespace kit
