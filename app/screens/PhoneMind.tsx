// C-280 (the user, 2026-11-03): THIS PHONE'S MIND -- whether a talk is answered by the hub (as always) or by the phone
// itself, with Apple's on-device model (app/mind.ts). Shown only on a phone whose build has it; says plainly when the
// phone cannot (an older iPhone, an iPad 8, Apple Intelligence off). Every word DRAFT.
import { useEffect, useState } from "react";
import { canThink, mindHere, setThinker, thinker, type Thinker } from "../mind";
import { Card, Choice, Eyebrow, Small } from "../ui";

export function PhoneMindCard({ ink }: { ink: string }) {
  const [t, setT] = useState<Thinker | null>(null);
  const [can, setCan] = useState<{ mind: boolean; why?: string } | null>(null);
  useEffect(() => { if (mindHere()) { thinker().then(setT); canThink().then(setCan); } }, []);
  if (!mindHere() || !t || !can) return null;
  const pick = async (v: Thinker) => { await setThinker(v); setT(v); };
  return (
    <Card borderLeftWidth={6} borderLeftColor={t === "phone" ? "$color9" : "$color5"}>
      <Eyebrow>THIS PHONE'S MIND</Eyebrow>
      <Small>When you hold TALK, who answers: the companion, as always, or this phone by itself -- Apple's own model on the phone, with nothing sent anywhere to think.</Small>
      {can.mind
        ? <Choice value={t} ink={ink} options={[["hub", "THE COMPANION"], ["phone", "THIS PHONE"]]} onPick={pick} />
        : <Small color="$color8">{`This phone cannot think for itself: ${can.why ?? "it needs iOS 26 and Apple Intelligence"}.`}</Small>}
      {t === "phone" && can.mind ? <Small color="$color10">Heard and answered on this phone. The companion's voice says it when the companion answers; else the phone's own.</Small> : null}
    </Card>
  );
}
