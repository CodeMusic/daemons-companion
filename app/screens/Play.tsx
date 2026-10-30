// LIBRARY > SONGBOOK > PLAY (T-426, the user, 2026-10-18: "on the ios app, you should be able to go to the songbook, choose
// a song, choose a key, and either breath into the microphone to make the flute sound (along with putting your fingers on
// the screen to select the note, or for the harp it would be strings on the screen u pluck like a harp... when u play a note
// in either you see the colourized note appears and float over the screen (like the game) and once u play a song they
// connect and u hear the song echo (like the game) -- in songbook there should also be a freeform option where u can just
// play"): the save's own instrument (GET /api/play -- the HARP for CONTENT, the FLUTE for CONTEXT, LOCKED until the game
// gives it), played as the game plays it (DAEMONS' PLAY): a key from the wheel (major keys, C at the top, clockwise in
// their colours), the scale's eight degrees, an octave either way; each note drifts up in its key colour (the game's own
// sprites, art/play_notes.png); the last sixteen notes are listened to -- a learned song's notes in its key and order
// (octave and tempo do not count) join and it echoes; the right shape in another key is ALMOST. A heard song can be
// practised here; only the game learns it. Every word DRAFT.
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, PanResponder, Platform, View } from "react-native";
import { createAudioPlayer, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder,
         useAudioRecorderState, type AudioPlayer } from "expo-audio";
import { Text, XStack, YStack } from "tamagui";
import { previewQuery } from "../preview";
import { soundOf } from "../tuneSound";
import { Action, Card, Eyebrow, PIXELATED, Small } from "../ui";
import { useApi } from "../useApi";

type Song = { id: string; title: string; key: string; notes: string[]; frames: number[]; learned: boolean; heard: boolean };
type PlayData = { instrument: "harp" | "flute"; unlocked: boolean; keys: string[]; keyColours: string[]; outline: string; songs: Song[] };

const SCALE = [0, 2, 4, 5, 7, 9, 11, 12];             // a major key's eight degrees
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midiOf = (n: string) => {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  return m ? 12 * (Number(m[3]) + 1) + LETTER[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) : null;
};
const pc = (m: number) => ((m % 12) + 12) % 12;
const keyPc = (k: string) => pc(midiOf(`${k}4`) ?? 60);
const KEY_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
const NOTES = require("../../server/data/art/play_notes.png");   // the game's: 16x16 each, C..B, one above the next
const HARP_MS = 1600, FLUTE_MS = 4000;                // a plucked note rings out; a breathed one is held while breath lasts
const BREATH_DB = -28;                                // the microphone's level that counts as blowing

// The listening (play.json's listen): the last sixteen notes; a song heard when its notes, as pitch classes in order, end
// them; the same shape in another key is ALMOST
function hear(played: number[], songs: Song[]): { song: Song; almost: boolean } | null {
  const pcs = played.slice(-16).map(pc);
  for (const s of songs) {
    const sp = s.notes.map((n) => pc(midiOf(n) ?? 0));
    if (pcs.length < sp.length) continue;
    const tail = pcs.slice(-sp.length), d = pc(tail[0] - sp[0]);
    if (tail.every((p, i) => p === sp[i])) return { song: s, almost: false };
    if (d && tail.every((p, i) => pc(p - sp[i]) === d)) return { song: s, almost: true };
  }
  return null;
}

// SETTINGS' PREVIEW (or the site's ?preview=) asks the companion's bench check: as if held, every song learned
export function PlayBook() {
  const [p] = useApi<PlayData>(`/api/play${previewQuery()}`);
  const [song, setSong] = useState<Song | "free" | null>(null);
  const [key, setKey] = useState<number | null>(null);
  if (!p) return null;
  const NAME = p.instrument.toUpperCase();
  if (!p.unlocked) return (
    <Card>
      <Eyebrow>{`PLAY THE ${NAME}`}</Eyebrow>
      <Small>{`The ${NAME} is waiting in the game. Once it is yours there, it plays here too.`}</Small>
    </Card>
  );
  if (song === null) return (
    <Card>
      <Eyebrow>{`PLAY THE ${NAME}`}</Eyebrow>
      <Small>Choose a song to play, or play freely.</Small>
      <Action label="PLAY FREELY" onPress={() => { setSong("free"); setKey(null); }} />
      {p.songs.filter((s) => s.learned || s.heard).map((s) => (
        <XStack key={s.id} role="button" cursor="pointer" alignItems="center" gap={10} paddingVertical={8} borderTopWidth={1}
                borderColor="$color5" onPress={() => { setSong(s); setKey(null); }}>
          <YStack width={12} height={12} borderRadius={6} backgroundColor={p.keyColours[keyPc(s.key)]} />
          <YStack flex={1}>
            <Text fontFamily="$mono" fontSize={14} fontWeight="700" letterSpacing={1} color="$color12">{s.title}</Text>
            <Small color="$color10">{s.learned ? `learned · in ${KEY_NAMES[keyPc(s.key)]}` : "heard in the game, not yet played back there"}</Small>
          </YStack>
          <Text fontSize={18} color="$color10">›</Text>
        </XStack>
      ))}
    </Card>
  );
  const s = song === "free" ? null : song;
  if (key === null) return <KeyWheel p={p} song={s} onPick={setKey} onBack={() => setSong(null)} />;
  return <Instrument p={p} song={s} keyAt={key} onKey={() => setKey(null)} onSongs={() => { setSong(null); setKey(null); }} />;
}

// THE KEY WHEEL: twelve dots in their colours, C at the top, chromatic, clockwise -- a song's own key marked
function KeyWheel({ p, song, onPick, onBack }: { p: PlayData; song: Song | null; onPick: (k: number) => void; onBack: () => void }) {
  const R = 104, D = 40, own = song ? keyPc(song.key) : null;
  return (
    <Card>
      <Eyebrow>{song ? `${song.title} · CHOOSE A KEY` : "PLAY FREELY · CHOOSE A KEY"}</Eyebrow>
      {song ? <Small>{`It is ${song.learned ? "learned" : "heard"} in ${KEY_NAMES[own!]}. In another key it is only ALMOST.`}</Small> : null}
      <YStack alignSelf="center" width={2 * R + D} height={2 * R + D} position="relative" marginVertical={8}>
        {KEY_NAMES.map((name, k) => {
          const a = (k / 12) * 2 * Math.PI;
          return (
            <YStack key={k} role="button" cursor="pointer" position="absolute" left={R + R * Math.sin(a)} top={R - R * Math.cos(a)}
                    width={D} height={D} borderRadius={D} backgroundColor={p.keyColours[k]} alignItems="center" justifyContent="center"
                    borderWidth={k === own ? 4 : 2} borderColor={k === own ? "$color12" : p.outline} onPress={() => onPick(k)}>
              <Text fontFamily="$mono" fontSize={12} fontWeight="800" color={k >= 7 && k <= 11 ? "#fbfaf6" : "#1d2026"}>{name}</Text>
            </YStack>
          );
        })}
      </YStack>
      <Action label="‹ SONGS" onPress={onBack} />
    </Card>
  );
}

// A note drifting up from where it was played, in its key colour, and fading (the game's: art/play_notes.png)
const Floating = memo(function Floating({ pcAt, x, y, onDone }: { pcAt: number; x: number; y: number; onDone: () => void }) {
  const t = useRef(new Animated.Value(0)).current, sway = useRef((Math.random() * 2 - 1) * 18).current;
  const done = useRef(onDone); done.current = onDone;   // the latest, without starting the drift again on every redraw
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => done.current());
  }, [t]);
  const S = 40;
  return (
    <Animated.View pointerEvents="none" style={{ position: "absolute", left: x - S / 2, top: y - S / 2, width: S, height: S, overflow: "hidden",
      opacity: t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.85, 0] }),
      transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -150] }) },
                  { translateX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, sway, sway * 0.4] }) }] }}>
      <NoteSprite pcAt={pcAt} size={S} />
    </Animated.View>
  );
});
function NoteSprite({ pcAt, size }: { pcAt: number; size: number }) {
  return (
    <View style={{ width: size, height: size, overflow: "hidden" }}>
      <Image source={NOTES} style={[{ width: size, height: size * 12, marginTop: -size * pcAt }, PIXELATED as any]} />
    </View>
  );
}

// The instrument itself: the harp's strings or the flute's holes, the octave, the staff of what is played (and a song's
// notes ahead), and the listening
function Instrument({ p, song, keyAt, onKey, onSongs }: { p: PlayData; song: Song | null; keyAt: number; onKey: () => void; onSongs: () => void }) {
  const harp = p.instrument === "harp", NAME = p.instrument.toUpperCase();
  const [octave, setOctave] = useState(0);
  const [w, setW] = useState(0);
  const [floats, setFloats] = useState<{ id: number; pcAt: number; x: number; y: number }[]>([]);
  const [played, setPlayed] = useState<number[]>([]);
  const [said, setSaid] = useState("");
  const [joined, setJoined] = useState<{ song: Song; lit: number } | null>(null);
  const [lit, setLit] = useState<number | null>(null);    // the string or hole sounding now
  const base = 60 + keyAt - (keyAt > 6 ? 12 : 0);        // the key's tonic, about middle C
  const midiAt = (d: number) => base + SCALE[d] + 12 * octave;
  const players = useRef(new Map<number, AudioPlayer>());
  const echo = useRef<AudioPlayer | null>(null);
  const nextId = useRef(0);
  const ms = harp ? HARP_MS : FLUTE_MS;

  // the notes' sounds, made for this key and octave before they are needed (a tap must not wait for one to be made)
  const player = (m: number) => {
    let pl = players.current.get(m);
    if (!pl) { pl = createAudioPlayer({ uri: soundOf(`play-${p.instrument}-${m}-${ms}`, [[m, ms]]) }); players.current.set(m, pl); }
    return pl;
  };
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: !harp, shouldRouteThroughEarpiece: false }).catch(() => {});
    for (let d = 0; d < 8; d++) player(midiAt(d));
  }, [keyAt, octave]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    players.current.forEach((pl) => pl.remove()); players.current.clear(); echo.current?.remove();
    setAudioModeAsync({ playsInSilentMode: false, allowsRecording: false }).catch(() => {});
  }, []);

  const sing = (d: number) => { const pl = player(midiAt(d)); pl.volume = 1; pl.seekTo(0); pl.play(); };
  const hush = (d: number) => {                          // a breathed note let go: faded, then stopped
    const pl = players.current.get(midiAt(d));
    if (!pl) return;
    let v = 1;
    const t = setInterval(() => { v -= 0.25; if (v <= 0) { clearInterval(t); pl.pause(); pl.volume = 1; } else pl.volume = v; }, 30);
  };

  // each note played: it drifts up, joins the sixteen listened to, and may be a song
  const heardRef = useRef<number[]>([]);
  const noted = (d: number, x: number, y: number) => {
    const m = midiAt(d), id = nextId.current++;
    setFloats((f) => [...f.slice(-12), { id, pcAt: pc(m), x, y }]);
    const now = [...heardRef.current, m].slice(-16);
    heardRef.current = now; setPlayed(now);
    const listen = song ? [song] : p.songs.filter((s) => s.learned);
    const h = hear(now, listen);
    if (!h) return;
    if (h.almost) { setSaid(`ALMOST: that is ${h.song.title}, in another key.`); return; }
    heardRef.current = []; setPlayed([]);
    if (!h.song.learned) { setSaid(`That is ${h.song.title}. Play it back in the game to learn it.`); return; }
    setSaid("");
    joinAndEcho(h.song);
  };
  const joinAndEcho = (s: Song) => {
    const tune: [number, number][] = s.notes.map((n, i) => [midiOf(n) ?? 60, Math.round(((s.frames[i] ?? 15) * 1000) / 60)]);
    setTimeout(() => {                                   // after the last note has rung a moment, as the game waits
      echo.current?.remove();
      echo.current = createAudioPlayer({ uri: soundOf(`echo-${s.id}`, tune, 0, 1, true) });
      echo.current.play();
      let at = 0;
      tune.forEach(([, d], i) => { setTimeout(() => setJoined({ song: s, lit: i }), at); at += d; });
      setTimeout(() => setJoined(null), at + 1600);
    }, 500);
    setJoined({ song: s, lit: -1 });
  };

  // the harp: eight strings across; a touch plucks the string under it, and every string it is drawn across
  const H = 300, lastString = useRef<number | null>(null);
  const stringAt = (x: number) => Math.max(0, Math.min(7, Math.floor((x / Math.max(1, w)) * 8)));
  const pluck = (d: number, y: number) => { sing(d); setLit(d); setTimeout(() => setLit((l) => (l === d ? null : l)), 160); noted(d, ((d + 0.5) * w) / 8, y); };
  const harpPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => { const d = stringAt(e.nativeEvent.locationX); lastString.current = d; pluck(d, e.nativeEvent.locationY); },
    onPanResponderMove: (e) => {
      const d = stringAt(e.nativeEvent.locationX), was = lastString.current;
      if (was === null || d === was) return;
      for (let k = was + Math.sign(d - was); k !== d + Math.sign(d - was); k += Math.sign(d - was)) pluck(k, e.nativeEvent.locationY);
      lastString.current = d;
    },
    onPanResponderRelease: () => { lastString.current = null; },
  }), [w, octave, keyAt]);   // eslint-disable-line react-hooks/exhaustive-deps
  // on the phone, every finger its own: each touch plucks the string under it and every string it is drawn across, so
  // a chord can be plucked and a strum made with more than one (the site, with a mouse, keeps the one pointer above)
  const fingers = useRef(new Map<number, number>());
  const touched = (e: any, start: boolean) => {
    for (const t of e.nativeEvent.changedTouches ?? []) {
      const d = stringAt(t.locationX), was = fingers.current.get(t.identifier);
      if (start || was === undefined) { fingers.current.set(t.identifier, d); pluck(d, t.locationY); continue; }
      if (d === was) continue;
      const step = Math.sign(d - was);
      for (let k = was + step; k !== d + step; k += step) pluck(k, t.locationY);
      fingers.current.set(t.identifier, d);
    }
  };
  const untouched = (e: any) => { for (const t of e.nativeEvent.changedTouches ?? []) fingers.current.delete(t.identifier); };
  const harpTouch = Platform.OS === "web" ? harpPan.panHandlers
    : { onTouchStart: (e: any) => touched(e, true), onTouchMove: (e: any) => touched(e, false), onTouchEnd: untouched, onTouchCancel: untouched,
        // the harp keeps the gesture while it is played, so the page does not scroll under a strum
        onStartShouldSetResponder: () => true, onMoveShouldSetResponder: () => true, onResponderTerminationRequest: () => false };

  // the flute: eight holes; a finger chooses the note, and breath into the microphone sounds it (with no microphone, the
  // finger alone)
  const [hole, setHole] = useState<number | null>(null);
  const breath = useBreath(!harp);
  const blowing = breath.level === null ? hole !== null : breath.level > BREATH_DB;
  const sounding = useRef<number | null>(null);
  useEffect(() => {
    if (harp) return;
    const want = blowing && hole !== null ? hole : null;
    if (want === sounding.current) return;
    if (sounding.current !== null) hush(sounding.current);
    sounding.current = want;
    if (want !== null) { sing(want); setLit(want); noted(want, ((want % 4) + 0.5) * (w / 4), want < 4 ? H * 0.3 : H * 0.72); }
    else setLit(null);
  }, [blowing, hole]);   // eslint-disable-line react-hooks/exhaustive-deps
  const holeAt = (x: number, y: number) => Math.max(0, Math.min(3, Math.floor((x / Math.max(1, w)) * 4))) + (y > H / 2 ? 4 : 0);
  const flutePan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => setHole(holeAt(e.nativeEvent.locationX, e.nativeEvent.locationY)),
    onPanResponderMove: (e) => setHole(holeAt(e.nativeEvent.locationX, e.nativeEvent.locationY)),
    onPanResponderRelease: () => setHole(null), onPanResponderTerminate: () => setHole(null),
  }), [w]);   // eslint-disable-line react-hooks/exhaustive-deps

  // a song's notes, in this key, ahead on the staff -- filled as far as they have been played in order
  const target = song ? song.notes.map((n) => (midiOf(n) ?? 60) + pc(keyAt - keyPc(song.key))) : [];
  let done = 0;
  for (let k = Math.min(target.length, played.length); k > 0; k--)
    if (played.slice(-k).every((m, i) => pc(m) === pc(target[i]))) { done = k; break; }
  const shown = joined ? joined.song.notes.map((n) => midiOf(n) ?? 60) : song ? target : played.slice(-12);

  return (
    <Card>
      <Eyebrow>{`THE ${NAME} · IN ${KEY_NAMES[keyAt]} · ${song ? song.title : "FREELY"}`}</Eyebrow>
      {/* the staff: what is played, or a song's notes ahead, filled as they are played; joined when a song is heard */}
      <XStack minHeight={34} alignItems="center" gap={joined ? 0 : 4} flexWrap="wrap">
        {shown.map((m, i) => {
          const ghost = song && !joined && i >= done, glow = joined && joined.lit === i;
          return (
            <XStack key={i} alignItems="center">
              {joined && i > 0 ? <YStack width={10} height={3} backgroundColor={p.keyColours[pc(m)]} /> : null}
              <YStack width={glow ? 22 : 18} height={glow ? 22 : 18} borderRadius={12} borderWidth={2} borderColor={ghost ? p.keyColours[pc(m)] : p.outline}
                      backgroundColor={ghost ? "transparent" : joined ? (glow ? "#fff6d8" : p.keyColours[pc(m)]) : p.keyColours[pc(m)]} />
            </XStack>
          );
        })}
        {!shown.length ? <Small color="$color10">{harp ? "Draw a finger across the strings." : "Hold a hole and breathe into the microphone."}</Small> : null}
      </XStack>
      {/* the instrument */}
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H, borderRadius: 8, backgroundColor: "#1d2026", overflow: "hidden" }}
            {...(harp ? harpTouch : flutePan.panHandlers)}>
        {harp ? Array.from({ length: 8 }, (_, d) => (
          <View key={d} pointerEvents="none" style={{ position: "absolute", left: ((d + 0.5) * w) / 8 - (lit === d ? 2.5 : 1.5), top: 14, bottom: 14,
                                                     width: lit === d ? 5 : 3, borderRadius: 2, backgroundColor: p.keyColours[pc(midiAt(d))],
                                                     opacity: lit === d ? 1 : 0.75 }} />
        )) : Array.from({ length: 8 }, (_, d) => {
          const size = Math.min(w / 4, H / 2) * 0.62;
          return (
            <View key={d} pointerEvents="none" style={{ position: "absolute", left: ((d % 4) + 0.5) * (w / 4) - size / 2,
                                                       top: (d < 4 ? H * 0.28 : H * 0.72) - size / 2, width: size, height: size, borderRadius: size,
                                                       borderWidth: 4, borderColor: p.keyColours[pc(midiAt(d))],
                                                       backgroundColor: hole === d ? p.keyColours[pc(midiAt(d))] : "transparent" }} />
          );
        })}
        {Array.from({ length: 8 }, (_, d) => (
          <Text key={`n${d}`} allowFontScaling={false} pointerEvents="none" position="absolute" fontFamily="$mono" fontSize={11} color="#9aa0aa"
                left={harp ? ((d + 0.5) * w) / 8 - 4 : ((d % 4) + 0.5) * (w / 4) - 4} top={harp ? H - 14 : (d < 4 ? H * 0.28 : H * 0.72) - 7}>{d + 1}</Text>
        ))}
        {floats.map((f) => <Floating key={f.id} pcAt={f.pcAt} x={f.x} y={f.y} onDone={() => setFloats((all) => all.filter((o) => o.id !== f.id))} />)}
      </View>
      {!harp ? (
        <XStack alignItems="center" gap={8}>
          <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color10">BREATH</Text>
          <YStack flex={1} height={8} borderRadius={4} backgroundColor="$color4" overflow="hidden">
            <YStack height={8} width={`${breath.level === null ? 0 : Math.max(0, Math.min(100, ((breath.level + 60) / 60) * 100))}%`}
                    backgroundColor={blowing ? "$color9" : "$color7"} />
          </YStack>
          {breath.level === null ? <Small color="$color10">{breath.why || "no microphone: a finger plays alone"}</Small> : null}
        </XStack>
      ) : null}
      {said ? <Text fontSize={14} fontWeight="700" color="$color12">{said}</Text> : null}
      <XStack gap={8} flexWrap="wrap" alignItems="center">
        <Action label="OCTAVE −" onPress={() => setOctave((o) => Math.max(-1, o - 1))} />
        <Text fontFamily="$mono" fontSize={12} color="$color11" marginTop={8}>{octave < 0 ? "LOW" : octave > 0 ? "HIGH" : "MIDDLE"}</Text>
        <Action label="OCTAVE +" onPress={() => setOctave((o) => Math.min(1, o + 1))} />
      </XStack>
      <XStack gap={8} flexWrap="wrap">
        <Action label="‹ KEY" onPress={onKey} />
        <Action label="‹ SONGS" onPress={onSongs} />
      </XStack>
    </Card>
  );
}

// The microphone's level, in dB (about -60 quiet to 0 loud), for the flute's breath: on the phone the recorder's metering,
// on the site the browser's own. null where there is none (or it was refused), `why` saying so.
function useBreath(on: boolean): { level: number | null; why: string } {
  const [level, setLevel] = useState<number | null>(null);
  const [why, setWhy] = useState("");
  const recorder = useAudioRecorder({ ...RecordingPresets.LOW_QUALITY, isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, 60);
  useEffect(() => {
    if (!on || Platform.OS === "web") return;
    let live = true;
    (async () => {
      const ok = await requestRecordingPermissionsAsync().catch(() => ({ granted: false }));
      if (!ok.granted) { setWhy("the microphone is not allowed: a finger plays alone"); return; }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, shouldRouteThroughEarpiece: false });
      await recorder.prepareToRecordAsync();
      if (live) recorder.record();
    })().catch(() => setWhy("the microphone did not start: a finger plays alone"));
    return () => { live = false; recorder.stop().catch(() => {}); };
  }, [on]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (on && Platform.OS !== "web" && typeof state.metering === "number") setLevel(state.metering); }, [on, state.metering]);
  useEffect(() => {                                     // the site: the browser's microphone, its loudness sampled
    if (!on || Platform.OS !== "web") return;
    let stream: MediaStream | null = null, ctx: AudioContext | null = null, t: ReturnType<typeof setInterval> | null = null;
    navigator.mediaDevices?.getUserMedia({ audio: true }).then((s) => {
      stream = s; ctx = new AudioContext();
      const an = ctx.createAnalyser(); an.fftSize = 1024; ctx.createMediaStreamSource(s).connect(an);
      const buf = new Float32Array(an.fftSize);
      t = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        let sum = 0; for (const v of buf) sum += v * v;
        setLevel(20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-6));
      }, 60);
    }).catch(() => setWhy("the microphone is not allowed: a finger plays alone"));
    return () => { if (t) clearInterval(t); stream?.getTracks().forEach((x) => x.stop()); ctx?.close().catch(() => {}); };
  }, [on]);
  return { level: on ? level : null, why };
}
