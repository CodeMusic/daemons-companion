// C-236 (the user, 2026-10-29): the witching hour -- from 3:00 to 4:00 in the morning, on this phone's clock, the carried
// daemon wears a thin shimmer and casts no shadow, and, once the save holds THE SUBTLE LAYER, it has a routine of its
// own named for its first type, here only in the hour: its tune falls, and one half step does not belong. The names and
// the tune are server/src/witching.ts's, one set with the game's (DAEMONS T-480). Every word DRAFT.
// C-237: every pulse breathes red<->blue through the book's purple on the clock's eight-second breath (witching.ts PULSE,
// the watches and the game the same); the shimmer's inner circle fills widdershins in emerald over the hour, the minutes
// left and the date beside it; and a touch on the den in the hour opens AS ABOVE SO BELOW in place of the care keys.
import { useAudioPlayer } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { AS_ABOVE, creatorLevelNow, creatorNow, creatorToneNow, EMERALD, goldBreathOf, hourDate, hourGone, minutesLeft, pulseNow, WITCHING_TUNE, witchingLevel,
         witchingLine, witchingNow, witchingRoutine } from "../../../server/src/witching";
import { api, ON_PHONE } from "../../platform/net";
import { auroraForced, dawnForced, hourForced, onSession } from "../../state/dev";   // C-275: </> sets the hour, in memory only; T-519 the creator's too; C-305 the aurora's nights
import { AURORA_BANDS, AURORA_LINE, auroraShows, auroraWeight } from "../../../server/src/aurora";   // C-305
import { dayRoot, soundLevel, soundOf } from "../../sound/tuneSound";
import { dawnTone } from "../../sound/dawnTone";            // T-519: THE CREATOR'S HOUR's tone
import { Action, Small } from "../../ui/ui";

// in the hour or not, looked at again each half minute -- or as </> sets it (C-275: on any time, read only, its count the
// clock's own minutes; or off in the hour itself)
export const hourNow = () => hourForced() ?? witchingNow();
export const previewed = () => (hourForced() === true && !witchingNow() ? "?preview=1" : "");
export function useWitching() {
  const [w, setW] = useState(hourNow());
  useEffect(() => { const t = setInterval(() => setW(hourNow()), 30000); return () => clearInterval(t); }, []);
  return w;
}

// T-519 (the user, 2026-11-02): when this app last came to the front -- the catch-up counts from here. Opened or brought
// back inside an hour, its effect waits a minute and then eases up to where the clock has it (server/src/witching.ts).
let arrived = Date.now();
AppState.addEventListener("change", (state) => { if (state === "active") arrived = Date.now(); });
export const arrivedAt = () => arrived;
// how much of the witching hour's shimmer shows (0..1): the game's glitch curve, caught up to; forced on, all of it
export function useWitchingLevel() {
  useFrame(2000);
  useSession();
  const forced = hourForced();
  return forced === true ? 1 : forced === false ? 0 : witchingLevel(arrived);
}
// THE CREATOR'S HOUR, 4:24 to 5:12 (T-519): its light and its tone (0..1 each), caught up to -- looked at each second in
// the hour and each half minute outside it; forced on, as at its middle
export type Dawn = { level: number; tone: number };
export function useDawn(): Dawn {
  const [, setF] = useState(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => { setF((x) => x + 1); t = setTimeout(tick, creatorNow() || dawnForced() !== null ? 1000 : 30000); };
    t = setTimeout(tick, 1000);
    return () => clearTimeout(t);
  }, []);
  useSession();
  const forced = dawnForced();
  if (forced !== null) return forced ? { level: 1, tone: 1 } : { level: 0, tone: 0 };
  return { level: creatorLevelNow(arrived), tone: creatorToneNow(arrived) };
}
// drawn again the moment </> changes the game session (C-275), not at the next look
function useSession() {
  const [, setF] = useState(0);
  useEffect(() => onSession(() => setF((x) => x + 1)), []);
}
// a frame every so often: the breath, the flicker
function useFrame(ms: number) {
  const [f, setF] = useState(0);
  useEffect(() => { const t = setInterval(() => setF((x) => x + 1), ms); return () => clearInterval(t); }, [ms]);
  return f;
}

// the shimmer, about the daemon (in its den, moving with it): two faint rings on the breath, and now and then one drops out
export function WitchShimmer({ side, level = 1 }: { side: number; level?: number }) {   // T-519: as strong as the hour is now
  const f = useFrame(140);
  const ring = (k: number) => {
    if (level <= 0.01 || (f + k * 3) % 9 === 0) return null;   // it flickers
    const s = side * (0.84 + 0.08 * k + 0.03 * Math.sin(f / 4 + k));
    return <View key={k} pointerEvents="none" style={{ position: "absolute", left: (side - s) / 2, top: (side * 1.04 - s * 1.08) / 2, width: s, height: s * 1.08,
                                                        borderRadius: s, borderWidth: k ? 1 : 2, borderColor: pulseNow(k ? 0.75 : 1), opacity: (0.6 - 0.15 * k) * level }} />;
  };
  return <>{ring(0)}{ring(1)}</>;
}

// the hour, counting down: the inner circle filled widdershins from twelve in the tablet's emerald -- sixty spokes, one a
// minute -- behind the daemon, with a mark at twelve and at the crease, half past
export function HourPie({ side }: { side: number }) {
  useFrame(10000);
  if (!hourNow()) return null;                               // C-240: Halloween shimmers all day, but the count is the hour's
  const w = side * 0.76, h = side * 0.84, gone = hourGone(), spoke = (Math.PI * h) / 60 + 1.5;
  const filled = Math.floor(gone * 60 + 0.5);
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: (side - w) / 2, top: (side - h) / 2, width: w, height: h, borderRadius: w, overflow: "hidden" }}>
      {Array.from({ length: filled }, (_, i) => (
        <View key={i} style={{ position: "absolute", left: (w - spoke) / 2, top: 0, width: spoke, height: h, transform: [{ rotate: `${-(i + 0.5) * 6}deg` }] }}>
          <View style={{ height: h / 2, backgroundColor: EMERALD.deep }} />
        </View>
      ))}
      <View style={{ position: "absolute", left: w / 2 - 1, top: 0, width: 2, height: 6, backgroundColor: EMERALD.lit }} />
      <View style={{ position: "absolute", left: w / 2 - 1, bottom: 0, width: 2, height: 6, backgroundColor: EMERALD.lit }} />
    </View>
  );
}

// over the den: the minutes left, and the date -- the hour is three to four, so the time is not needed
export function HourCount() {
  useFrame(15000);
  return (
    <YStack position="absolute" top={8} left={10} pointerEvents="none">
      <Text fontFamily="$mono" fontSize={22} fontWeight="700" color={EMERALD.lit}>{`${minutesLeft()} min left`}</Text>
      <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color={EMERALD.lit}>{hourDate()}</Text>
    </YStack>
  );
}

// AS ABOVE SO BELOW -- in the hour, in place of the care keys: a line at a time, in emerald, on the breath. DRAFT
export function AsAbove({ onClose }: { onClose: () => void }) {
  const [at, setAt] = useState(0);
  const f = useFrame(200);
  const glow = (1 - Math.cos((f / 40) * 2 * Math.PI)) / 2;
  return (
    <Pressable onPress={() => setAt((a) => (a + 1) % AS_ABOVE.length)} accessibilityRole="button" accessibilityLabel="the next line">
      <YStack gap={6} padding={12} borderRadius={10} backgroundColor={pulseNow(0.25)} marginTop={6}>
        {at > 0 ? <Small color="$color9">{AS_ABOVE[at - 1]}</Small> : null}
        <Text fontSize={20} fontWeight="600" lineHeight={28} color={glow > 0.5 ? EMERALD.lit : "#3FB06C"}>{AS_ABOVE[at]}</Text>
        <XStack justifyContent="space-between">
          <Small color="$color9">{at + 1 < AS_ABOVE.length ? "tap: more" : "tap: again"}</Small>
          <Text fontSize={12} color={EMERALD.lit} onPress={onClose}>CARE</Text>
        </XStack>
      </YStack>
    </Pressable>
  );
}

// THE HOUR: its routine, once the book is held
export function WitchingHour({ nickname, species, note }: { nickname: string; species: number; note: string }) {
  const player = useAudioPlayer(null);
  const [routine, setRoutine] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  useEffect(() => {
    Promise.all([api<{ held: boolean }>(`/api/subtle/today${previewed()}`), api<{ types: string[] }>(`/api/species/${species}`)])
      .then(([s, sp]) => setRoutine(s.held ? witchingRoutine(sp.types ?? []) : null)).catch(() => {});
  }, [species]);
  if (!routine) return null;
  const run = () => {
    setSaid(witchingLine(nickname, routine));
    if (ON_PHONE) {
      try { player.replace({ uri: soundOf("witching", WITCHING_TUNE, dayRoot(note), soundLevel()) }); player.play(); } catch { /* quiet is fine */ }
    }
  };
  return (
    <YStack gap={4} paddingTop={6}>
      <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color={EMERALD.lit}>THE HOUR</Text>
      <Action label={routine} onPress={run} ink={pulseNow(0.85)} />
      {said ? <Small color={EMERALD.lit}>{said}</Small> : <Small color="$color9">Only now, between three and four.</Small>}
    </YStack>
  );
}

// ---- THE CREATOR'S HOUR (DAEMONS T-519; the user, 2026-11-02: "not a glitch something else ... a softer touch still
// encompassing"): light, not noise. Nothing flickers or tears. In the den a warm gold comes up from the floor like daylight
// under a door, breathing once in sixteen seconds (half the witching breath); a few motes drift up through it, six at the
// most; and the daemon wears a thin gold rim, steady, and looks rested. In the middle seven minutes a quiet "aah" joins
// (sound/dawnTone.ts). Every part DRAFT; DAEMONS docs/private/plan-the-two-hours-2026-11-02.md has the whole of it.
const GOLD = "#FFD27A", GOLD_DEEP = "#F2B04C";
const breath16 = () => 0.85 + 0.15 * goldBreathOf();       // on the clock, as the watches and the game breathe it
export function DawnLight({ w, height, level }: { w: number; height: number; level: number }) {
  useFrame(level > 0.01 ? 100 : 60000);
  if (level <= 0.01 || !w) return null;
  const b = breath16(), now = Date.now(), bands = 12, motes = Math.round(6 * level);
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: w, height }}>
      {Array.from({ length: bands }, (_, i) => {                 // the light, from the floor up: brightest at the bottom
        const k = 1 - i / bands, bh = (height * 0.7) / bands, lo = Math.round(i * bh), hi = Math.round((i + 1) * bh);   // edge to edge,
        return <View key={i} style={{ position: "absolute", left: 0, right: 0, bottom: lo, height: hi - lo, backgroundColor: GOLD,   // never doubled
                                       opacity: level * 0.34 * b * k ** 1.5 }} />;
      })}
      {Array.from({ length: motes }, (_, i) => {                 // the motes, rising slowly, each on its own time
        const period = 9000 + i * 1700, u = ((now / period) + i * 0.37) % 1;
        const x = w * ((0.13 + i * 0.157) % 1) + 6 * Math.sin(now / (2300 + i * 400) + i);
        const size = i % 2 ? 3 : 4.5;
        return <View key={`m${i}`} style={{ position: "absolute", left: x, top: height * (1 - u) - size, width: size, height: size, borderRadius: size,
                                              backgroundColor: i % 3 ? GOLD : "#FFF4D6", opacity: level * 0.8 * Math.sin(Math.PI * u) }} />;
      })}
    </View>
  );
}
// about the daemon: a thin gold rim, steady, and a faint warmth inside it
export function DawnRim({ side, level }: { side: number; level: number }) {
  if (level <= 0.01) return null;
  const s = side * 0.9;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: (side - s) / 2, top: (side * 1.04 - s * 1.06) / 2, width: s, height: s * 1.06,
                                         borderRadius: s, borderWidth: 1.5, borderColor: GOLD_DEEP, backgroundColor: "rgba(255,210,122,0.12)",
                                         opacity: 0.6 * level * breath16() }} />
  );
}
// its tone, in the middle seven minutes: quiet -- about a third of this phone's own SOUND -- looped on the day's note, and
// let go as the minutes end. Only on a phone, as the hour's tune is.
export function useDawnTone(tone: number, note: string) {
  const player = useAudioPlayer(null);
  const loaded = useRef("");
  useEffect(() => {
    if (!ON_PHONE) return;
    try {
      const v = tone * soundLevel() * 0.35;
      if (v <= 0.002) { if (loaded.current && player.playing) player.pause(); return; }
      const uri = dawnTone(dayRoot(note));
      if (loaded.current !== uri) { player.replace({ uri }); player.loop = true; loaded.current = uri; }
      player.volume = v;
      if (!player.playing) player.play();
    } catch { /* quiet is fine */ }
  }, [tone, note, player]);
}

// C-240: Halloween, with THE HERMETIC LAYER held -- the shimmer all day, the costume (what it fears; a tap takes the mask
// off), and the treats the daemons it met today left. GET /api/halloween?species=. Every word DRAFT.
export type HalloweenT = { on: boolean; costume?: { species: number; name: string } | null; treats?: { text: string; at: string }[] };
export function useHalloween(species: number) {
  const [h, setH] = useState<HalloweenT>({ on: false });
  useEffect(() => {
    const look = () => api<HalloweenT>(`/api/halloween?species=${species}`).then(setH).catch(() => {});
    look(); const t = setInterval(look, 60000); return () => clearInterval(t);
  }, [species]);
  return h;
}
export function HalloweenNote({ h, masked, name }: { h: HalloweenT; masked: boolean; name: string }) {
  if (!h.on) return null;
  return (
    <YStack gap={4} paddingTop={6}>
      <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color={EMERALD.lit}>HALLOWEEN</Text>
      {h.costume ? <Small color="$color11">{masked ? `${name} went as ${h.costume.name}, what it fears. Tap it to take the mask off.`
                                                 : `${name}, unmasked. Tap it to put ${h.costume.name} back on.`}</Small> : null}
      {(h.treats ?? []).slice(0, 5).map((t, i) => <Small key={i} color={EMERALD.lit}>{t.text}</Small>)}
      {(h.treats ?? []).length === 0 ? <Small color="$color9">Every daemon it meets today leaves a treat.</Small> : null}
    </YStack>
  );
}

// C-305 (DAEMONS T-528, vision 4.40): THE AURORA -- once THE UNITY BOOK is mended, on a night of light (about one in three,
// 8 PM to 5 AM, picked from the date by the game's own rule: server/src/aurora.ts), the den's sky takes the edition's
// line, as the game's grove skies do: oxygen's red strongest in the top band in CONTENT, its green a band lower in
// CONTEXT, breathing on the creator's hour's sixteen seconds -- the clock's, so a phone and a GBA breathe together.
// Looked at each half minute; </> forces it on (as on a night of light) or off. Part 2's conjugate light is not here yet.
export function useAurora(mended: boolean): boolean {
  useFrame(30000);
  useSession();
  return mended && (auroraForced() ?? auroraShows(true));
}
// the den's wall is sixteen bands down to its floor; the top six are its sky, each laid toward the line by the game's weight
export function AuroraSky({ w, fy, edition }: { w: number; fy: number; edition: string }) {
  useFrame(125);
  if (!w) return null;
  const e = edition === "CONTEXT" ? "CONTEXT" : "CONTENT", b = goldBreathOf(), bh = fy / 16;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: w, height: fy }}>
      {AURORA_BANDS[e].map((band, i) => band ? (
        <View key={i} style={{ position: "absolute", left: 0, right: 0, top: Math.round(i * bh), height: Math.round((i + 1) * bh) - Math.round(i * bh),
                               backgroundColor: AURORA_LINE[e], opacity: auroraWeight(band, b) / 256 }} />) : null)}
    </View>
  );
}
