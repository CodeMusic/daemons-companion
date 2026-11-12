// C-352, C-355: this month's symbol (server/src/months.ts), in the hemisphere SETTINGS' THEME tab says -- the edition's
// unless set -- and the palette the week wears.
import { hemisphereOf, monthOf } from "../../server/src/months";
import { useAccentSetting } from "./accent";
import { PALETTE } from "./look";
import type { Today } from "./types";

export function useMonth(today: Today, month?: number) {
  const { hemisphere } = useAccentSetting();
  const m = month ?? (Number(today.date.slice(5, 7)) || new Date().getMonth() + 1);
  return monthOf(m, hemisphereOf(today.edition, hemisphere === "edition" ? null : hemisphere), PALETTE);
}
