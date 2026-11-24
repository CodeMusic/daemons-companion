// BRAIN: hypothalamus (drives) -- may the Kit wake, by the charges: an energy budget
// C-459: the charge rule (policy.h).
#include "kit/policy.h"

namespace kit {

Wake mayWake(int zeroPercent, bool zeroCharging, int kitPercent, bool kitCharging, const Limits &l) {
  if (zeroCharging || kitCharging) return Wake::Go;                    // a charger lifts every limit
  int low = -1;
  if (zeroPercent >= 0) low = zeroPercent;
  if (kitPercent >= 0 && (low < 0 || kitPercent < low)) low = kitPercent;
  if (low < 0) return l.alwaysAsk ? Wake::Ask : Wake::Go;              // neither known (a computer): asked as above the line
  if (low < l.refuse) return Wake::Refuse;
  if (low <= l.ask) return Wake::Override;
  return l.alwaysAsk ? Wake::Ask : Wake::Go;
}
const char *wakeName(Wake w) {
  switch (w) { case Wake::Go: return "go"; case Wake::Ask: return "ask"; case Wake::Override: return "override"; default: return "refuse"; }
}

}  // namespace kit
