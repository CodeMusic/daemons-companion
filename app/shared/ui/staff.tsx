// C-419 (DAEMONS T-600's staff; the user, 2026-11-18: "so the visual pattern can also teach you the key"): A DAEMON'S
// SONG ON A STAFF. Each part on its own staff -- its clef, its type's key signature with the sharps and flats in their
// colours, and its notes in their pitch's colours (SYNESTHESIA: C red, D orange, E yellow, F green, G blue, A indigo,
// B violet; a black key split between the two either side), spaced by their time, in bars of four. A note not yet
// learned is STATIC: its candidates faint on their own lines and spaces, the true one surer as it closes
// (server/src/damagotchi/ownsong.ts heardAt, staffOf). The INDEX and the daemon's page draw it; T-600's book will. Every word DRAFT.
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text as RNText, View } from "react-native";
import { Text, YStack } from "tamagui";
import { BOTTOM, CHORUS, heardAt, noteColours, spell, staffOf, withChorus, type Heard, type SongPart } from "../../../server/src/damagotchi/ownsong";
import { ON_PHONE } from "../../platform/net";
import { songTimes, songUri } from "../../sound/ownSong";

/** A note head's oval in its colour, a black key's split between the two either side; `hollow`, a ring, for a long note. */
export function Oval({ midi, s, hollow = false }: { midi: number; s: number; hollow?: boolean }) {
  const c = noteColours(midi), w = s * 1.15, h = s * 0.9;
  if (hollow) return (
    <View style={{ width: w, height: h, borderRadius: s, borderWidth: Math.max(1.5, s * 0.2), borderColor: c[0],
                   borderRightColor: c[1] ?? c[0], borderBottomColor: c[1] ?? c[0], transform: [{ rotate: "-18deg" }] }} />
  );
  return (
    <View style={{ width: w, height: h, borderRadius: s, overflow: "hidden", backgroundColor: c[0], transform: [{ rotate: "-18deg" }] }}>
      {c[1] ? <View style={{ position: "absolute", left: s * 0.575, top: 0, width: s * 0.6, height: s, backgroundColor: c[1] }} /> : null}
    </View>
  );
}

/** C-418: a note head with its stem, as TRAIN's notes rise from its mouth -- a longer note a little larger. */
export function Head({ midi, beats, size, faint = 1 }: { midi: number; beats: number; size: number; faint?: number }) {
  const c = noteColours(midi), s = size * (0.8 + 0.15 * Math.min(2, beats));
  return (
    <View style={{ width: s * 1.3, height: s * 2.2, opacity: faint }}>
      <View style={{ position: "absolute", left: s * 1.02, top: 0, width: Math.max(1.5, s * 0.14), height: s * 1.7, backgroundColor: c[0] }} />
      <View style={{ position: "absolute", left: 0, top: s * 1.2 }}><Oval midi={midi} s={s} /></View>
    </View>
  );
}

// ------------------------------------------------------------------------------------------------- the layout, pure
// Every length is in staff spaces (g); y is 0 on the top line and 4g on the bottom one, each step half a space.
const yOf = (r: number, g: number) => ((8 - r) * g) / 2;
const ADV = (beats: number, g: number) => g * (1.75 + 0.95 * Math.min(4, beats));   // a note's room, more for a longer one
const ACC_W = 1.25, CLEF_W = 2.7, SIG_W = 1.05, BAR_GAP = 0.7, STEM = 3.3;
type Stem = { x: number; y1: number; y2: number };
interface NoteLay {
  i: number; n: Heard; cx: number; cy: number; r: number; hollow: boolean; dot: boolean; flag: "up" | "down" | null;
  stem: Stem | null; shown: -1 | 0 | 1 | null; ledgers: number[]; cands: { midi: number; cx: number; cy: number; op: number }[];
}
interface SystemLay { notes: NoteLay[]; bars: number[]; end: number | null; beams: { x1: number; y1: number; x2: number; y2: number; up: boolean; i: number }[];
                      top: number; bottom: number }
export interface StaffLay { clef: "treble" | "bass"; sig: { at: number; midi: number; acc: -1 | 1 }[]; lead: number; systems: SystemLay[] }

export function layStaff(part: SongPart, share: number, width: number, g: number): StaffLay {
  const st = staffOf(part), heard = heardAt(part, share), s = g * 1.1, half = (s * 1.15) / 2;
  const lead = g * (CLEF_W + st.sigSteps.length * SIG_W + (st.sigSteps.length ? 0.9 : 0.4));
  const sig = st.sigSteps.map((r, k) => ({ at: yOf(r, g), midi: 60 + st.sig.pcs[k], acc: st.sig.accidental as -1 | 1 }));
  // bars, each its notes' room, then systems: as many bars as fit on a line, the lines before the last stretched to fill it
  const bars: number[][] = [];
  st.notes.forEach((n, i) => { (bars[n.bar] ??= []).push(i); });
  const barW = bars.filter(Boolean).map((b) => b.reduce((w, i) => w + ADV(st.notes[i].beats, g) + (st.notes[i].shown !== null ? ACC_W * g : 0), 0) + BAR_GAP * g);
  const lines: number[][] = [[]];
  let used = lead;
  barW.forEach((w, b) => {
    if (used + w > width && lines[lines.length - 1].length) { lines.push([]); used = lead; }
    lines[lines.length - 1].push(b); used += w;
  });
  const full = bars.filter(Boolean);
  const systems = lines.map((line, li): SystemLay => {
    const natural = line.reduce((w, b) => w + barW[b], 0), last = li === lines.length - 1;
    const k = !last && natural > 0 ? Math.min(1.8, Math.max(1, (width - lead) / natural)) : 1;
    let x = lead;
    const notes: NoteLay[] = [], barXs: number[] = [];
    let end: number | null = null;
    for (const b of line) {
      for (const i of full[b]) {
        const p = st.notes[i], n = heard[i];
        if (p.shown !== null) x += ACC_W * g * k;
        const cx = x + g * 0.8, cy = yOf(p.r, g), sure = n.sure >= 1;
        const ledgers: number[] = [];
        if (sure) {
          for (let r = -2; r >= p.r; r -= 2) ledgers.push(yOf(r, g));
          for (let r = 10; r <= p.r; r += 2) ledgers.push(yOf(r, g));
        }
        const up = p.r < 4, plain = sure && p.beats < 4;
        notes.push({
          i, n, cx, cy, r: p.r, hollow: p.beats >= 2, dot: sure && (p.beats === 1.5 || p.beats === 3), shown: sure ? p.shown : null, ledgers,
          stem: plain ? (up ? { x: cx + half * 0.92 - Math.max(1.2, s * 0.12), y1: cy - g * 0.1, y2: cy - STEM * g }
                             : { x: cx - half * 0.92, y1: cy + g * 0.1, y2: cy + STEM * g }) : null,
          flag: plain && p.beats === 0.5 ? (up ? "up" : "down") : null,
          // static: its candidates, each on its own line or space, a little scattered, the true one surer as it closes
          cands: sure ? [] : n.candidates.map((c, j) => ({
            midi: c, cx: cx + (j ? (((j * 5) % 7) - 3) * g * 0.22 : 0), cy: yOf(spell(c, st.sig).step - BOTTOM[st.clef], g),
            op: j === 0 ? 0.22 + 0.6 * n.sure : 0.24 * (1 - n.sure) + 0.06,
          })),
        });
        x += ADV(p.beats, g) * k;
      }
      if (b === full.length - 1) end = x;                  // the part ends home: a double bar
      else barXs.push(x - g * 0.35);
      x += BAR_GAP * g * k * (b === full.length - 1 ? 0 : 1);
    }
    // two quavers on a beat share a beam, their stems one way (by where the two sit) and the beam no steeper than a space
    const beams: SystemLay["beams"] = [];
    for (let j = 0; j + 1 < notes.length; j++) {
      const a = notes[j], c = notes[j + 1], pa = st.notes[a.i], pc = st.notes[c.i];
      if (!a.flag || !c.flag || pa.bar !== pc.bar || pa.at % 1 !== 0 || c.i !== a.i + 1) continue;
      const up = (a.r + c.r) / 2 < 4;
      for (const m of [a, c]) m.stem = up ? { x: m.cx + half * 0.92 - Math.max(1.2, s * 0.12), y1: m.cy - g * 0.1, y2: m.cy - STEM * g }
                                         : { x: m.cx - half * 0.92, y1: m.cy + g * 0.1, y2: m.cy + STEM * g };
      let ya = a.stem!.y2, yc = c.stem!.y2;
      const mid = (ya + yc) / 2;
      ya = mid + Math.max(-g / 2, Math.min(g / 2, ya - mid)); yc = mid + Math.max(-g / 2, Math.min(g / 2, yc - mid));
      const short = up ? Math.max(0, ya - (a.cy - 2.6 * g), yc - (c.cy - 2.6 * g)) : Math.min(0, ya - (a.cy + 2.6 * g), yc - (c.cy + 2.6 * g));
      ya -= short; yc -= short;                            // no stem shorter than two and a half spaces
      a.stem!.y2 = ya; c.stem!.y2 = yc; a.flag = null; c.flag = null;
      beams.push({ x1: a.stem!.x, y1: ya, x2: c.stem!.x, y2: yc, up, i: a.i });
      j++;
    }
    // how far it reaches above the top line and below the bottom one: the clef, the heads, the stems, the static
    const ys = [-1.9 * g, 5.4 * g, ...sig.map((q) => q.at - 1.6 * g), ...sig.map((q) => q.at + 1.1 * g)];
    for (const m of notes) {
      ys.push(m.cy - g * 0.7, m.cy + g * 0.7);
      if (m.stem) ys.push(m.stem.y2 + (m.stem.y2 < m.cy ? -g * 0.3 : g * 0.3));
      for (const c of m.cands) ys.push(c.cy - g * 0.6, c.cy + g * 0.6);
      if (m.shown !== null) ys.push(m.cy - 1.6 * g, m.cy + 1.2 * g);
    }
    return { notes, bars: barXs, end, beams, top: Math.min(...ys), bottom: Math.max(...ys) };
  });
  return { clef: st.clef, sig, lead, systems };
}

// ------------------------------------------------------------------------------------------------- drawing it
const SIGN: Record<string, string> = { "1": "♯", "-1": "♭", "0": "♮" };
// a sign in its pitch's colour -- a black key's split down the middle between the two either side
function Sign({ acc, midi, cx, cy, g, faint = 1 }: { acc: -1 | 0 | 1; midi: number; cx: number; cy: number; g: number; faint?: number }) {
  const c = noteColours(midi), w = g * 1.4, size = g * 2.3, top = cy - size * (acc === -1 ? 0.7 : 0.56);
  const glyph = (colour: string, left: number) => (
    <RNText allowFontScaling={false} style={{ position: "absolute", left, top: 0, width: w, textAlign: "center", fontSize: size,
                                             lineHeight: size * 1.15, color: colour, fontWeight: "700" }}>{SIGN[String(acc)]}</RNText>
  );
  return (
    <View style={{ position: "absolute", left: cx - w / 2, top, width: w, height: size * 1.15, opacity: faint }}>
      {glyph(c[0], 0)}
      {c[1] ? <View style={{ position: "absolute", left: w / 2, top: 0, width: w / 2, height: size * 1.15, overflow: "hidden" }}>{glyph(c[1], -w / 2)}</View> : null}
    </View>
  );
}

const CLEF = { treble: { ch: "𝄞", size: 7.4, top: -2.75 }, bass: { ch: "𝄢", size: 4.1, top: -0.95 } };

/** One part on its staff, as wide as it is given: `share` of it learned, `sung` the note being sung (null, not singing). */
export function SongStaff({ part, share, sung = null, g = 8 }: { part: SongPart; share: number; sung?: number | null; g?: number }) {
  const [width, setWidth] = useState(0);
  const lay = useMemo(() => (width > 0 ? layStaff(part, share, width, g) : null), [part, share, width, g]);
  const s = g * 1.1, line = Math.max(1, g * 0.12);
  return (
    <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} style={{ width: "100%" }}>
      {lay?.systems.map((sys, k) => {
        const h = sys.bottom - sys.top, oy = -sys.top, clef = CLEF[lay.clef];
        return (
          <View key={k} style={{ width, height: h, marginTop: k ? g * 0.6 : 0 }}>
            {[0, 1, 2, 3, 4].map((l) => (
              <YStack key={l} position="absolute" left={0} top={oy + l * g - line / 2} width={(sys.end ?? width) + (sys.end ? g * 0.5 : 0)} height={line}
                      backgroundColor="$color8" />
            ))}
            <Text position="absolute" left={g * 0.1} top={oy + clef.top * g} fontSize={clef.size * g} lineHeight={clef.size * g * 1.2}
                  color="$color11" allowFontScaling={false}>{clef.ch}</Text>
            {lay.sig.map((q, j) => <Sign key={j} acc={q.acc} midi={q.midi} cx={g * (CLEF_W + 0.3 + j * SIG_W)} cy={oy + q.at} g={g} />)}
            {sys.bars.map((x, j) => <YStack key={j} position="absolute" left={x} top={oy} width={line} height={4 * g} backgroundColor="$color9" />)}
            {sys.end !== null ? (<>
              <YStack position="absolute" left={sys.end - g * 0.2} top={oy} width={line} height={4 * g} backgroundColor="$color9" />
              <YStack position="absolute" left={sys.end + g * 0.15} top={oy} width={g * 0.4} height={4 * g} backgroundColor="$color9" />
            </>) : null}
            {sys.beams.map((b, j) => {
              const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1) + line, th = g * 0.45, ang = Math.atan2(b.y2 - b.y1, b.x2 - b.x1);
              const notYet = sung !== null && b.i > sung;
              return <YStack key={j} position="absolute" left={(b.x1 + b.x2) / 2 - len / 2} top={oy + (b.y1 + b.y2) / 2 - (b.up ? 0 : th)}
                             width={len} height={th} backgroundColor="$color11" opacity={notYet ? 0.3 : 1} rotate={`${ang}rad`} />;
            })}
            {sys.notes.map((m) => {
              const now = sung === m.i, dim = sung !== null && m.i > sung ? 0.3 : 1, c = noteColours(m.n.midi);
              const o = { position: "absolute" as const, opacity: dim };
              return (
                <View key={m.i} pointerEvents="none" style={{ position: "absolute", left: 0, top: oy, width: 0, height: 0 }}>
                  {now ? <View style={{ position: "absolute", left: m.cx - g * 1.5, top: m.cy - g * 1.5, width: g * 3, height: g * 3, borderRadius: g * 1.5,
                                        backgroundColor: c[0], opacity: 0.25 }} /> : null}
                  {m.ledgers.map((y, j) => <YStack key={j} {...o} left={m.cx - s * 0.95} top={y - line / 2} width={s * 1.9} height={line} backgroundColor="$color9" />)}
                  {m.stem ? <YStack {...o} left={m.stem.x} top={Math.min(m.stem.y1, m.stem.y2)} width={Math.max(1.2, s * 0.12)}
                                    height={Math.abs(m.stem.y2 - m.stem.y1)} backgroundColor="$color11" /> : null}
                  {m.flag && m.stem ? <YStack {...o} left={m.stem.x} top={m.stem.y2 - (m.flag === "up" ? 0 : g * 0.45)} width={g * 1.15} height={g * 0.4}
                                              backgroundColor="$color11" rotate={m.flag === "up" ? "50deg" : "-50deg"} transformOrigin="0% 50%" /> : null}
                  {m.shown !== null ? <Sign acc={m.shown} midi={m.n.midi} cx={m.cx - g * 1.55} cy={m.cy} g={g * 0.8} faint={dim} /> : null}
                  {m.cands.length ? m.cands.map((q, j) => (
                    <View key={j} style={{ position: "absolute", left: q.cx - (s * 1.15) / 2, top: q.cy - (s * 0.9) / 2, opacity: q.op * dim }}>
                      <Oval midi={q.midi} s={s} />
                    </View>
                  )) : (
                    <View style={{ position: "absolute", left: m.cx - (s * 1.15) / 2, top: m.cy - (s * 0.9) / 2, opacity: dim,
                                   transform: now ? [{ scale: 1.2 }] : [] }}>
                      <Oval midi={m.n.midi} s={s} hollow={m.hollow} />
                    </View>
                  )}
                  {m.dot ? <View style={{ position: "absolute", left: m.cx + g * 1.05, top: m.cy - (m.r % 2 === 0 ? g * 0.75 : g * 0.25) - g * 0.18,
                                          width: g * 0.36, height: g * 0.36, borderRadius: g, backgroundColor: c[0], opacity: dim }} /> : null}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/** Where a song stands while it is sung: which part, and which of its notes (-1 before its first). */
export type SongAt = { part: number; note: number };
/** A song's parts on their staves, each with its name and key, the earlier parts whole (DRAFT). */
export function SongStaves({ parts: verses, shares: verseShares, at = null, g = 8 }: { parts: SongPart[]; shares: number[]; at?: SongAt | null; g?: number }) {
  const { parts, shares } = withChorus(verses, verseShares);   // T-613: its hidden chorus, once its last verse is whole
  return (
    <YStack gap={10}>
      {parts.map((p, i) => {
        const share = shares[i] ?? 1;
        const sung = !at ? null : i < at.part ? Infinity : i > at.part ? -1 : at.note;
        return (
          <YStack key={`${p.name}-${i}`} gap={4}>
            <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color10">
              {p.name === CHORUS ? `CHORUS · ${p.key.toUpperCase()}`   /* T-613, DRAFT */
                : `${p.name} · ${p.key.toUpperCase()}${share < 1 ? ` · ${Math.floor(share * 100)}% LEARNED` : ""}`}
            </Text>
            <SongStaff part={p} share={share} sung={sung} g={g} />
          </YStack>
        );
      })}
    </YStack>
  );
}

/**
 * C-419: singing a song aloud -- its parts at their shares on the save's instrument (app/sound/ownSong.ts), and where it
 * has got to, for the staves. `phase` is "making" while the sound is mixed, "speaking" while it plays (ListenControl's).
 */
export function useSinging() {
  const player = useAudioPlayer(null);
  const [on, setOn] = useState<{ key: string; phase: "making" | "speaking"; t0: number; times: ReturnType<typeof songTimes> } | null>(null);
  const [ms, setMs] = useState(-1);
  const [failed, setFailed] = useState("");
  useEffect(() => {
    if (on?.phase !== "speaking") return;
    const t = setInterval(() => {
      const now = Date.now() - on.t0;
      if (now > on.times.ms + 500) { setOn(null); setMs(-1); } else setMs(now);
    }, 60);
    return () => clearInterval(t);
  }, [on]);
  const sing = (key: string, verses: SongPart[], verseShares: number[]) => {
    const { parts, shares } = withChorus(verses, verseShares);   // T-613: as SongStaves draws it, so `at` lines up
    setFailed(""); setMs(-1);
    setOn({ key, phase: "making", t0: 0, times: songTimes(parts) });
    setTimeout(async () => {                                // let the spinner show while it is mixed
      try {
        const uri = songUri(parts, shares);
        if (!uri) { setFailed("The instrument is still being tuned. Try again in a moment."); setOn(null); return; }   // DRAFT
        if (ON_PHONE) await setAudioModeAsync({ playsInSilentMode: true });
        player.replace({ uri }); player.play();
        setOn((o) => (o?.key === key ? { ...o, phase: "speaking", t0: Date.now() } : o));
      } catch (e) { setFailed((e as Error).message); setOn(null); }
    }, 30);
  };
  // C-440: never call this from an unmount cleanup. useAudioPlayer releases the player in its own cleanup, which runs
  // first, and release already silences it (teardownPlayer on iOS, the src removed on the web); a pause after that
  // throws SharedObject.NotFoundException on a phone, and in a release build that is a crash -- TestFlight 992 died
  // leaving DAEMONS > Yours for any other tab. The try is for a press that lands as it goes.
  const hush = useCallback(() => { try { player.pause(); } catch { /* gone */ } setOn(null); setMs(-1); }, [player]);
  let at: SongAt | null = null;
  if (on?.phase === "speaking") {
    const { starts, notes } = on.times;
    let p = 0;
    while (p + 1 < starts.length && starts[p + 1] <= ms) p++;
    let n = -1;
    while (n + 1 < notes[p].length && notes[p][n + 1] <= ms) n++;
    at = { part: p, note: n };
  }
  return { singing: on?.key ?? null, phase: on?.phase ?? null, at, failed, sing, hush };
}
