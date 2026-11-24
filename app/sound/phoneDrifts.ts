// C-551 (the user, 2026-11-24: "the phone come with maybe 3 in each category -- the hub itself can contain all of them"):
// the few drifts the app carries itself, three of each kind, written by server/tools/import_drifts.py -- so REVERIE has
// more than THE LONG FALL when no hub answers (a phone on its own, away from home). The hub's library has them all.
import type { DriftFile, DriftInfo } from "./binaural";

const PHONE = require("../../server/data/drifts/phone.json") as DriftFile[];

export const phoneDriftFile = (id: string): DriftFile | null => PHONE.find((d) => d.id === id) ?? null;
export const phoneDriftList = (): DriftInfo[] => PHONE.map((d) => ({
  id: d.id, name: d.meta.name ?? d.id, kind: d.kind, group: d.meta.category ?? null, description: d.meta.description ?? "",
  durationSec: d.meta.durationSec ?? null, strength: d.meta.strength ?? null, phone: true,
}));
