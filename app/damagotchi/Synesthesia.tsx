// C-592 (the user, 2026-11-26: "there may be more places we would make use of them -- maybe a synthestesia simulator too"):
// SYNESTHESIA, FELT -- one sense given as all the others. A note is a colour, a tone and a rate (psyche/synesthesia.ts,
// psyche/entrain.ts rateOf: where its colour sits on its wheel, red's 4 Hz to violet's 12): the screen wears its colour,
// the headphones carry its tone with its rate between the ears, and where they are linked and allowed, THE NOVA flashes at
// that rate and THE PULSETTO pulses with it (app/sound/entrain.ts, the same conductor DRIFT DOWN uses). Its notes: the
// carried daemon's three (T-612: its KEY, DAY and MONTH), the week's seven, the year's twelve, or now's two. PLAY walks
// them, a few seconds each; a note tapped is held. The screen itself only breathes, slowly -- it never flashes; the fast
// light is the NOVA's alone, under the player's ceiling. Every word DRAFT.
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, View } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import speciesJson from "../../server/data/species.json";
import songsJson from "../../server/data/songs.json";
import week from "../../server/data/week.json";
import { Synesthesia, type Qualia, type TypeKey } from "../../server/src/psyche/synesthesia";
import { monthOf } from "../../server/src/psyche/months";
import { rateOf, rateWord } from "../../server/src/psyche/entrain";
import { binauralStage } from "../sound/binaural";
import { onSleep, sleepState, stopSleep } from "../sound/sleepSession";
import { begin, conduct, end } from "../sound/entrain";
import { PALETTE } from "../state/look";
import { OutputChips } from "./Devices";
import { Action, Card, Eyebrow, onColour, Segments, Small } from "../shared/ui/ui";

type Mode = "its" | "week" | "year" | "now";
type Note = { tag: string; q: Qualia; title: string; line: string; colours: string[]; dim?: boolean; accidental?: boolean };
const SPECIES = speciesJson as unknown as Record<string, { national: number; name: string; types: string[] }>;
const KEYS = (songsJson as unknown as { keys: Record<string, TypeKey & { name: string }> }).keys;
const DAYS = (week as { days: { day: string; virtue: string; shadow: string }[] }).days;
const HOLDS = [4, 8, 16] as const;

const mix = (a: string, b: string, t: number) => {
  const c = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(c(a, i) + (c(b, i) - c(a, i)) * t).toString(16).padStart(2, "0")).join("")}`;
};
const dimmed = (h: string) => mix(h, "#000000", 0.45);   // a minor key's colour: the same, dimmer
const dayNote = (q: Qualia, tag = "DAY"): Note => {
  const d = DAYS[q.ordinal - 1];
  return { tag, q, title: `${q.name.toUpperCase()} · ${q.shown}`, line: d ? `${d.virtue} over ${d.shadow}` : q.hues.join(" into "), colours: q.colours };
};
const monthNote = (q: Qualia, tag = "MONTH"): Note =>
  ({ tag, q, title: `${q.name.toUpperCase()} · ${q.shown}`, line: `${monthOf(q.ordinal).tone}, ${q.hues.join(" into ")}`, colours: q.colours });

/** The notes a mode walks. */
function notesOf(mode: Mode, species: number | null): Note[] {
  if (mode === "week") return [1, 2, 3, 4, 5, 6, 7].map((d) => dayNote(Synesthesia.day(d, PALETTE)));
  if (mode === "year") return Array.from({ length: 12 }, (_, i) => monthNote(Synesthesia.month(i + 1, PALETTE)));
  if (mode === "now") { const n = Synesthesia.now(new Date(), PALETTE); return [dayNote(n.day, "TODAY"), monthNote(n.month, "THIS MONTH")]; }
  const s = species !== null ? SPECIES[String(species)] : null, key = s ? KEYS[s.types[0]] : null;
  if (!s || !key) return [];
  const d = Synesthesia.daemon(s.national, key, PALETTE);
  return [
    { tag: "ITS KEY", q: d.key, title: d.key.label, line: `Its kind, ${s.types[0]}: ${d.key.minor ? "a minor key, dim" : "a major key, bright"}.`,
      colours: d.key.minor ? d.key.colours.map(dimmed) : d.key.colours, dim: d.key.minor },
    { ...dayNote(d.day, "ITS DAY"), line: `What it practises: ${DAYS[d.day.ordinal - 1]?.virtue ?? ""} over ${DAYS[d.day.ordinal - 1]?.shadow ?? ""}.`, accidental: d.accidentals.includes("day") },
    { ...monthNote(d.month, "ITS MONTH"), line: `What it brings: ${monthOf(d.month.ordinal).tone}.`, accidental: d.accidentals.includes("month") },
  ];
}

// the tone: one player, kept for the app's run (C-440: a released player must never be touched)
let tone: AudioPlayer | null = null;
async function sound(q: Qualia | null) {
  try {
    if (!q) { tone?.pause(); return; }
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: "doNotMix" });
    tone ??= createAudioPlayer(null);
    tone.replace({ uri: binauralStage(Synesthesia.hz(q, 3), rateOf(q)) });
    tone.loop = true; tone.volume = 0.3;
    tone.play();
  } catch { /* no sound here */ }
}

// the colour, breathing slowly: never faster than about once a second, never a flash
function Field({ note, playing }: { note: Note; playing: boolean }) {
  const breath = useRef(new Animated.Value(1)).current, rate = rateOf(note.q);
  useEffect(() => {
    if (!playing) { breath.setValue(1); return; }
    const half = Math.max(500, Math.min(1250, 4000 / rate));
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 0.82, duration: half, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(breath, { toValue: 1, duration: half, useNativeDriver: Platform.OS !== "web" })]));
    loop.start();
    return () => loop.stop();
  }, [playing, rate, note.title]);
  const [a, b] = [note.colours[0], note.colours[1] ?? note.colours[0]], ink = onColour(mix(a, b, 0.5));
  const strips = Array.from({ length: 24 }, (_, i) => mix(a, b, i / 23));
  return (
    <View style={{ height: 210, borderRadius: 12, overflow: "hidden" }}>
      <Animated.View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, flexDirection: "row", opacity: breath }}>
        {strips.map((c, i) => <View key={i} style={{ flex: 1, backgroundColor: c }} />)}
      </Animated.View>
      <YStack flex={1} padding={16} justifyContent="space-between" position="relative" zIndex={1}>{/* above the colour: the web paints an absolute layer over a static one */}
        <Text fontFamily="$mono" fontSize={11} letterSpacing={2} fontWeight="700" color={ink}>{note.tag}{note.accidental ? " · ITS ACCIDENTAL" : ""}</Text>
        <YStack gap={4}>
          <Text fontFamily="$mono" fontSize={22} fontWeight="800" letterSpacing={1} color={ink}>{note.title}</Text>
          <Text fontSize={14} lineHeight={20} color={ink}>{note.line}</Text>
          <Text fontFamily="$mono" fontSize={12} letterSpacing={1} color={ink}>{`${Synesthesia.hz(note.q, 3)} Hz · ${rate} Hz between the ears · ${rateWord(rate)}`}</Text>
        </YStack>
      </YStack>
    </View>
  );
}

export function SynesthesiaScreen({ ink, species, name, onBack }: { ink: string; species: number | null; name?: string; onBack: () => void }) {
  const [mode, setMode] = useState<Mode>(species !== null ? "its" : "week");
  const chose = useRef(false);   // the player picked a mode: the daemon's notes arriving late do not take it back
  useEffect(() => { if (species !== null && !chose.current) setMode("its"); }, [species]);
  const pick = (m: Mode) => { chose.current = true; setMode(m); };
  const notes = useMemo(() => notesOf(mode, species), [mode, species]);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hold, setHold] = useState<number>(8);
  const [useSound, setUseSound] = useState(true), [useLight, setUseLight] = useState(true), [usePulse, setUsePulse] = useState(false);
  const [said, setSaid] = useState("");
  const note = notes[Math.min(at, notes.length - 1)] ?? null;
  useEffect(() => { setAt(0); }, [mode]);
  // walk the notes while playing; a reverie begun elsewhere takes the devices back
  useEffect(() => {
    if (!playing || notes.length < 2) return;
    const t = setInterval(() => setAt((i) => (i + 1) % notes.length), hold * 1000);
    return () => clearInterval(t);
  }, [playing, hold, notes.length]);
  useEffect(() => onSleep((s) => { if (s.playing) setPlaying(false); }), []);
  // the note now, to the headphones and the devices; the PULSETTO steps every ten seconds, so the conductor is called often
  useEffect(() => {
    if (!playing || !note) { sound(null); return; }
    sound(useSound ? note.q : null);
    const r = rateOf(note.q), go = () => conduct(0, r, 1);
    go();
    const t = setInterval(go, 5000);
    return () => clearInterval(t);
  }, [playing, note?.title, useSound, useLight, usePulse]);
  // a device switched on or off here: the conductor begun again with it in or out
  useEffect(() => { if (playing) begin(null, { pulsetto: usePulse, nova: useLight }); }, [useLight, usePulse]);
  useEffect(() => () => { sound(null); end(); }, []);

  const start = () => {
    setSaid("");
    if (sleepState().playing) { stopSleep(); setSaid("The reverie playing was stopped, so its devices are free."); }   // DRAFT
    begin(null, { pulsetto: usePulse, nova: useLight });
    setPlaying(true);
  };
  const stop = () => { setPlaying(false); sound(null); end(); };
  const toggle = (label: string, on: boolean, set: (v: boolean) => void) => (
    <Text key={label} fontFamily="$mono" fontSize={12} letterSpacing={1} paddingHorizontal={9} paddingVertical={5} borderRadius={6} borderWidth={1}
          borderColor={on ? "$color12" : "$color6"} backgroundColor={on ? "$color4" : "transparent"} color="$color12" cursor="pointer" role="switch" aria-checked={on}
          onPress={() => set(!on)}>{`${on ? "✓ " : ""}${label}`}</Text>
  );
  return (
    <YStack gap={12}>
      <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12" cursor="pointer" role="link" onPress={() => { stop(); onBack(); }}>{"‹ THE STUDIO"}</Text>
      <Card>
        <Eyebrow>{"SYNESTHESIA, FELT · DRAFT"}</Eyebrow>
        <Small>{"One sense given as the others. Each note is a colour, a tone and a rate: see its colour, hear its tone with its rate between your ears, and -- where they are linked -- feel the NOVA flash and the PULSETTO pulse at that rate."}</Small>
        <Segments value={mode} onChange={pick} options={[...(species !== null ? [["its", name ? name.toUpperCase() : "ITS NOTES"] as [Mode, string]] : []),
                                                             ["week", "THE WEEK"], ["year", "THE YEAR"], ["now", "NOW"]]} />
      </Card>
      {note ? <Field note={note} playing={playing} /> : <Card><Small>{"Carry a daemon to feel its three notes."}</Small></Card>}
      <XStack gap={6} flexWrap="wrap" justifyContent="center">
        {notes.map((n, i) => (
          <YStack key={n.title} alignItems="center" gap={3} cursor="pointer" role="button" aria-label={n.title} onPress={() => setAt(i)}
                  padding={4} borderRadius={8} borderWidth={1.5} borderColor={i === at ? "$color12" : "transparent"}>
            <XStack width={notes.length > 7 ? 22 : 34} height={notes.length > 7 ? 40 : 34} borderRadius={notes.length > 7 ? 4 : 17} overflow="hidden">
              {n.colours.map((c) => <View key={c} style={{ flex: 1, backgroundColor: c }} />)}
            </XStack>
            <Text fontFamily="$mono" fontSize={10} color="$color11">{n.q.shown.split("/")[0]}</Text>
          </YStack>
        ))}
      </XStack>
      <Card>
        <XStack gap={8} flexWrap="wrap" alignItems="center">
          {playing ? <Action label="STOP" ink={ink} onPress={stop} /> : <Action label={notes.length > 1 ? "PLAY THEM" : "PLAY"} ink={ink} onPress={start} />}
        </XStack>
        {notes.length > 1 ? (
          <XStack gap={6} flexWrap="wrap" alignItems="center" marginTop={4}>
            <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color="$color11">{"EACH FOR"}</Text>
            {HOLDS.map((h) => toggle(`${h} S`, hold === h, () => setHold(h)))}
          </XStack>
        ) : null}
        <XStack gap={6} flexWrap="wrap" marginTop={4}>
          {toggle("SOUND", useSound, setUseSound)}
          {toggle("NOVA", useLight, setUseLight)}
          {toggle("PULSETTO", usePulse, setUsePulse)}
        </XStack>
        <OutputChips />
        <Small color="$color10">{"Its NOVA and PULSETTO settings are DRIFT DOWN's: REVERIE, WHERE THE DRIFT GOES. The screen only breathes; the flashing is the NOVA's, under your ceiling."}</Small>
        {said ? <Small color="$color10">{said}</Small> : null}
      </Card>
    </YStack>
  );
}
