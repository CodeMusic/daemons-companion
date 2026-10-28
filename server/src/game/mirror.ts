// C-188: the device's save and the paired companion's mirror of it, each known by its SHA-1, with the one both last held
// (`agreed`). The mirror is taken onto the device only when the device's save has not moved since they agreed (so what
// moved is the companion's -- a SYNC); when both moved, the device's is the real one and goes out at its next save.
// No node: imports (it runs on the phone).
export function mirrorChoice(mirror: string, mine: string, agreed: string): "same" | "take" | "keep" {
  if (mirror === mine) return "same";
  return !mine || mine === agreed ? "take" : "keep";
}
