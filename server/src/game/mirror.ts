// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-188: the device's save and the paired companion's mirror of it, each known by its SHA-1, with the one both last held
// (`agreed`). The mirror is taken onto the device only when the device's save has not moved since they agreed (so what
// moved is the companion's -- a SYNC). When both moved, C-365 (the user, 2026-11-14): the companion's is the truth by
// default, and the device sets its own aside in the companion's trail (C-364) and takes the companion's ("replace");
// with the truth set to the device, the device's goes out at its next save as it did ("keep").
// No node: imports (it runs on the phone).
export function mirrorChoice(mirror: string, mine: string, agreed: string, truth: "companion" | "device" = "companion"): "same" | "take" | "keep" | "replace" {
  if (mirror === mine) return "same";
  if (!mine || mine === agreed) return "take";
  return truth === "device" ? "keep" : "replace";
}
