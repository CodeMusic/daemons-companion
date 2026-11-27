// C-591 (the user, 2026-11-26: "the options that can use the downdrift info are the headphones, the pulsetto, or ... the
// Luma ... both luminate nova and the pulsetto are bluetooth"): WHERE THE DRIFT GOES -- the three things DRIFT DOWN can
// reach, each a row: THE HEADPHONES (found by themselves: the beat between the ears), THE PULSETTO (link it; AUTO, from
// the drift or its beat, or FIXED; always inside a MIN..MAX) and THE NOVA (link it, once its warning is read; its
// pattern, brightness and ceiling). And the small row of the three, lit or not, that a player and THE STUDIO show.
// Every word DRAFT.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { NOVA, PULSETTO, type Linked } from "../platform/entrainers";
import { ON_PHONE } from "../platform/net";
import { headphones } from "../sound/sleepSession";
import { onConducting, conducting, type Conducting } from "../sound/entrain";
import { setOutputs, useOutputs } from "../state/drift";
import { CEILINGS, PATTERN_WORDS, rangeOf, type Pattern } from "../../server/src/psyche/entrain";
import { Action, Card, Eyebrow, Small } from "../shared/ui/ui";

const OFF_LINK: Linked = { phase: "off", name: "", battery: null, charging: null, running: false, level: 0, note: "" };
export function useLinked(which: "pulsetto" | "nova"): Linked {
  const dev = which === "pulsetto" ? PULSETTO : NOVA;
  const [l, setL] = useState<Linked>(dev?.now ?? OFF_LINK);
  useEffect(() => (dev ? dev.watch(setL) : undefined), [dev]);
  return l;
}
/** Headphones now: true, false, or null where this build cannot tell -- looked at every few seconds. */
export function useHeadphones(): boolean | null {
  const [h, setH] = useState<boolean | null>(headphones());
  useEffect(() => { const t = setInterval(() => setH(headphones()), 3000); return () => clearInterval(t); }, []);
  return h;
}
export function useConducting(): Conducting {
  const [c, setC] = useState(conducting());
  useEffect(() => onConducting(setC), []);
  return c;
}

// a small round light: lit (in use), dim (there, idle), hollow (not there)
const Dot = ({ on, there, colour = "#5fc48a" }: { on: boolean; there: boolean; colour?: string }) => (
  <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: there ? colour : "#8a8798",
                 backgroundColor: on ? colour : there ? `${colour}55` : "transparent" }} />
);
const chip = (label: string, lit: boolean, press: () => void, key?: string) => (
  <Text key={key ?? label} fontFamily="$mono" fontSize={12} letterSpacing={1} paddingHorizontal={9} paddingVertical={5} borderRadius={6} borderWidth={1}
        borderColor={lit ? "$color12" : "$color6"} backgroundColor={lit ? "$color4" : "transparent"} color="$color12"
        cursor="pointer" role="button" aria-pressed={lit} onPress={press}>{label}</Text>
);
// – n +
function Stepper({ label, value, min, max, onChange, shown }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; shown?: (n: number) => string }) {
  const key = (t: string, d: number) => (
    <Text fontFamily="$mono" fontSize={16} fontWeight="700" width={34} height={30} lineHeight={30} textAlign="center" borderRadius={6} borderWidth={1}
          borderColor="$color6" color={(d < 0 ? value <= min : value >= max) ? "$color7" : "$color12"} cursor="pointer" role="button"
          aria-label={`${label} ${d < 0 ? "down" : "up"}`} onPress={() => onChange(Math.min(max, Math.max(min, value + d)))}>{t}</Text>
  );
  return (
    <XStack alignItems="center" gap={6}>
      <Text fontFamily="$mono" fontSize={12} letterSpacing={1} color="$color11" minWidth={44}>{label}</Text>
      {key("–", -1)}
      <Text fontFamily="$mono" fontSize={15} fontWeight="700" color="$color12" minWidth={40} textAlign="center">{shown ? shown(value) : String(value)}</Text>
      {key("+", 1)}
    </XStack>
  );
}

/** The three, in one line: lit where the drift is using it now. */
export function OutputChips({ onPress }: { onPress?: () => void }) {
  const ears = useHeadphones(), p = useLinked("pulsetto"), n = useLinked("nova"), c = useConducting(), o = useOutputs();
  const item = (label: string, on: boolean, there: boolean) => (
    <XStack key={label} alignItems="center" gap={5}><Dot on={on} there={there} /><Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color11">{label}</Text></XStack>
  );
  return (
    <XStack gap={14} flexWrap="wrap" alignItems="center" cursor={onPress ? "pointer" : undefined} onPress={onPress} role={onPress ? "button" : undefined}>
      {item("HEADPHONES", ears === true && c.on, ears !== false)}
      {item(c.stim ? `PULSETTO ${c.stim.level}` : "PULSETTO", !!c.stim && c.stim.level > 0, p.phase === "linked" && o.usePulsetto)}
      {item(c.light && !c.light.dark ? `NOVA ${Math.round(c.light.hz * 10) / 10} Hz` : "NOVA", !!c.light && !c.light.dark, n.phase === "linked" && o.useNova)}
      {onPress ? <Text fontFamily="$mono" fontSize={11} color="$color10">{"›"}</Text> : null}
    </XStack>
  );
}

function Row({ title, there, on, children }: { title: string; there: boolean; on: boolean; children: React.ReactNode }) {
  return (
    <YStack gap={6} paddingVertical={10} borderTopWidth={1} borderColor="$color4">
      <XStack alignItems="center" gap={8}><Dot on={on} there={there} /><Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12">{title}</Text></XStack>
      {children}
    </YStack>
  );
}
const state = (l: Linked) => l.phase === "linked" ? `Linked${l.battery !== null ? `, battery ${l.battery}%${l.charging ? ", charging" : ""}` : ""}.`
  : l.phase === "looking" ? "Looking…" : l.phase === "lost" ? "Dropped: looking for it again." : "Not linked.";

/** WHERE THE DRIFT GOES: the headphones, THE PULSETTO and THE NOVA, each with what it does and its settings. */
export function DriftOutputsCard({ ink }: { ink?: string }) {
  const ears = useHeadphones(), p = useLinked("pulsetto"), n = useLinked("nova"), c = useConducting(), o = useOutputs();
  const [warn, setWarn] = useState<number | null>(null);   // the ceiling a warning is being read for
  const [lo, hi] = rangeOf(o.stim);
  const light = (patch: Partial<typeof o.light>) => setOutputs({ light: patch as typeof o.light });
  const stim = (patch: Partial<typeof o.stim>) => setOutputs({ stim: patch as typeof o.stim });
  const askCeiling = (cap: number) => { if (cap <= o.lightOk) light({ ceiling: cap }); else setWarn(cap); };
  return (
    <Card>
      <Eyebrow>{"WHERE THE DRIFT GOES · DRAFT"}</Eyebrow>
      <Small>{"DRIFT DOWN reaches whatever is here: headphones, a PULSETTO, a NOVA, any or none. It is best with headphones: the beat between your ears needs them. Without, its noise and its pulse still play, and the devices still follow it."}</Small>

      <Row title="HEADPHONES" there={ears !== false} on={ears === true && c.on}>
        <Small>{ears === true ? "In: the beat between your ears plays under the music." : ears === false ? "Not in: the beat between the ears waits for them; the rest goes on."
          : "This build cannot tell whether they are in: put them in for the beat between your ears."}</Small>
      </Row>

      <Row title="PULSETTO" there={p.phase === "linked"} on={!!c.stim && c.stim.level > 0}>
        <Small>{"Gentle stimulation of the vagus nerve at the neck, from your PULSETTO, stepping with the drift. A wellness device, not medicine: stop it whenever you like."}</Small>
        {!ON_PHONE ? <Small color="$color8">{"The PULSETTO links in the phone app."}</Small> : (<>
          <Small color={p.phase === "linked" ? "$color12" : "$color10"}>{state(p)}{c.stim ? ` Now ${c.stim.level}, ${c.stim.why === "drift" ? "as the drift writes it" : c.stim.why === "beat" ? "from the beat" : "as you set it"}.` : ""}</Small>
          {p.note ? <Small color="$color8">{p.note}</Small> : null}
          <XStack gap={8} flexWrap="wrap" alignItems="center">
            {p.phase === "linked" ? <Action label="UNLINK" ink={ink} onPress={() => PULSETTO!.unlink()} /> : <Action label="LINK THE PULSETTO" ink={ink} onPress={() => PULSETTO!.link()} />}
            {p.running ? <Action label="STOP IT NOW" ink={ink} onPress={() => { PULSETTO!.end(); setOutputs({ usePulsetto: false }); }} /> : null}
          </XStack>
          <XStack gap={6} flexWrap="wrap" marginTop={4}>
            {chip(o.usePulsetto ? "USED BY THE DRIFT" : "NOT USED", o.usePulsetto, () => setOutputs({ usePulsetto: !o.usePulsetto }))}
          </XStack>
        </>)}
        <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color="$color11" marginTop={4}>{"HOW STRONG"}</Text>
        <XStack gap={6} flexWrap="wrap">
          {chip("AUTO", o.stim.mode === "auto", () => stim({ mode: "auto" }))}
          {chip("FIXED", o.stim.mode === "fixed", () => stim({ mode: "fixed" }))}
        </XStack>
        <Small>{o.stim.mode === "auto" ? "AUTO: as the drift writes it; where it writes nothing, from its beat -- gentler as it slows (2 in delta, 3 theta, 4 alpha)."
                                       : "FIXED: one level all the way through."}</Small>
        {o.stim.mode === "fixed" ? <Stepper label="LEVEL" value={Math.min(hi, Math.max(lo, o.stim.level))} min={lo} max={hi} onChange={(v) => stim({ level: v })} /> : null}
        <Stepper label="MIN" value={lo} min={1} max={9} onChange={(v) => stim({ min: v, max: Math.max(v, hi) })} />
        <Stepper label="MAX" value={hi} min={1} max={9} onChange={(v) => stim({ max: v, min: Math.min(v, lo) })} />
        <Small>{"It never goes outside MIN to MAX, moves one level at a time, and eases down to MIN as the night fades."}</Small>
      </Row>

      <Row title="NOVA" there={n.phase === "linked"} on={!!c.light && !c.light.dark}>
        <Small>{"Light flashed through closed eyes at the drift's beat, from your LUMENATE NOVA. It has no colours: only how fast, which eye, and how bright."}</Small>
        {o.lightOk === 0 || warn !== null ? (
          <YStack gap={6} padding={12} borderRadius={6} borderWidth={1.5} borderColor="#d9a43a" backgroundColor="$color2">
            <Text fontFamily="$mono" fontSize={12} letterSpacing={1.5} fontWeight="700" color="$color12">{"FLASHING LIGHT: READ THIS FIRST"}</Text>
            <Small color="$color12">{(warn ?? 12) > 12
              ? `Above 12 Hz is where flashing light most often brings on a seizure -- 15 to 25 Hz most of all. A ceiling of ${warn} Hz lets the NOVA flash there when a drift asks.`
              : "Flashing light can bring on a seizure in someone with photosensitive epilepsy, sometimes the first they ever have. Do not use the NOVA if you or your family have had seizures or epilepsy, or if flashing light gives you migraines. Stop at once if you feel strange, dizzy or unwell."}</Small>
            <Small>{"The NOVA itself has no limit; the app holds it under the ceiling you choose, 12 Hz unless you raise it."}</Small>
            <XStack gap={8} flexWrap="wrap">
              <Action label={(warn ?? 12) > 12 ? `I HAVE READ IT: ALLOW ${warn} HZ` : "I HAVE READ IT: USE THE LIGHT"} ink={ink}
                      onPress={() => { const cap = warn ?? 12; setOutputs({ lightOk: Math.max(o.lightOk, cap), light: { ...o.light, ceiling: cap } }); setWarn(null); }} />
              {warn !== null ? <Action label="NOT NOW" ink={ink} onPress={() => setWarn(null)} /> : null}
            </XStack>
          </YStack>
        ) : (<>
          {!ON_PHONE ? <Small color="$color8">{"The NOVA links in the phone app."}</Small> : (<>
            <Small color={n.phase === "linked" ? "$color12" : "$color10"}>{state(n)}{c.light && !c.light.dark ? ` Flashing at ${Math.round(c.light.hz * 10) / 10} Hz.` : ""}</Small>
            {n.note ? <Small color="$color8">{n.note}</Small> : null}
            <XStack gap={8} flexWrap="wrap">
              {n.phase === "linked" ? <Action label="UNLINK" ink={ink} onPress={() => NOVA!.unlink()} /> : <Action label="LINK THE NOVA" ink={ink} onPress={() => NOVA!.link()} />}
              {n.running ? <Action label="DARK NOW" ink={ink} onPress={() => { NOVA!.stop(); setOutputs({ useNova: false }); }} /> : null}
            </XStack>
            <XStack gap={6} flexWrap="wrap" marginTop={4}>{chip(o.useNova ? "USED BY THE DRIFT" : "NOT USED", o.useNova, () => setOutputs({ useNova: !o.useNova }))}</XStack>
          </>)}
          <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color="$color11" marginTop={4}>{"PATTERN"}</Text>
          <XStack gap={6} flexWrap="wrap">
            {(Object.keys(PATTERN_WORDS) as Pattern[]).map((k) => chip(PATTERN_WORDS[k][0], o.light.pattern === k, () => light({ pattern: k }), k))}
          </XStack>
          <Small>{PATTERN_WORDS[o.light.pattern][1]}</Small>
          <Stepper label="BRIGHT" value={Math.round(o.light.brightness * 10)} min={1} max={10} onChange={(v) => light({ brightness: v / 10 })} shown={(v) => `${v * 10}%`} />
          <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color="$color11" marginTop={4}>{"NEVER FASTER THAN"}</Text>
          <XStack gap={6} flexWrap="wrap">
            {CEILINGS.map((cap) => chip(`${cap} HZ`, o.light.ceiling === cap, () => askCeiling(cap), String(cap)))}
          </XStack>
          <Small>{"A drift asking for more flashes at the ceiling instead. Every sleep drift stays under 12."}</Small>
        </>)}
      </Row>
    </Card>
  );
}
