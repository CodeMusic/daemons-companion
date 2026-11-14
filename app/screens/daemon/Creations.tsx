// C-358 (the user, 2026-11-14): CREATIONS -- what the daemons made, in one gallery for any kind (sleep sounds and
// paintings now): MINE, what this phone keeps; HOUSEHOLD, everything the hub keeps from every device of the home, ✓ on
// what is here and ONLY WHAT I DON'T HAVE; COMMUNITY, what homes shared to THE COMMONS. A sleep piece opens in a player
// like PulseEntrain's: its cover round as a record, the night drawn clockwise around it (each beat stage its colour, lit
// as it passes), a tap on the cover for the spectrum; DRIFT DOWN and its beats; EXPORT as MP3, with or without DRIFT
// DOWN, or as PulseEntrain's .imedx. Every word DRAFT.
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { api, TOKEN } from "../../platform/net";
import { adoptOld, coverUri, exportFile, keep, letGo, mine, mineSet, onMine, type Creation, type Kept } from "../../platform/creations";
import { DRIFT } from "../../sound/binaural";
import { canSample, FADE_S, headphones, onSleep, onSpectrum, playSleep, SESSION_S, setDrift, sleepState, stopSleep } from "../../sound/sleepSession";
import { Action, Card, CareKey, Eyebrow, Segments, Small, whenSaid } from "../../ui/ui";

type Where = "mine" | "household" | "community";
type Kind = Creation["kind"];
const STAGE_COLOUR: Record<string, string> = { ALPHA: "#7fb3e6", THETA: "#9b7fe6", DELTA: "#3c3f8c" };
const stageAtS = (s: number) => [...DRIFT].reverse().find((d) => s >= d.at) ?? DRIFT[0];
const source = (uri: string | null) => (uri ? { uri, ...(uri.startsWith("http") && TOKEN ? { headers: { authorization: `Bearer ${TOKEN}` } } : {}) } : null);

// The cover as a record: round, its title across it, and the night around its edge -- a tick a minute, coloured by the
// beat stage that minute is in, lit up to where the night has reached (clockwise from the top)
export function RecordCover({ c, size, progress = 0, onPress, children }:
    { c: Creation | Kept; size: number; progress?: number; onPress?: () => void; children?: React.ReactNode }) {
  const ticks = 60, uri = coverUri(c), inner = size - 22;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={c.title}>
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        {Array.from({ length: ticks }, (_, i) => {
          const s = (i / ticks) * SESSION_S, lit = i / ticks < progress;
          return (
            <View key={i} pointerEvents="none" style={{ position: "absolute", width: size, height: size, alignItems: "center",
                                                         transform: [{ rotate: `${(360 * i) / ticks}deg` }] }}>
              <View style={{ width: 3, height: 8, borderRadius: 1.5, backgroundColor: STAGE_COLOUR[stageAtS(s).word],
                             opacity: lit ? 1 : s >= SESSION_S - FADE_S ? 0.18 : 0.35 }} />
            </View>
          );
        })}
        <View style={{ width: inner, height: inner, borderRadius: inner / 2, overflow: "hidden", backgroundColor: "#1d1b2e",
                       alignItems: "center", justifyContent: "center" }}>
          {children ?? (uri ? <Image source={source(uri)!} style={{ width: inner, height: inner }} /> :
            <Text fontFamily="$mono" fontSize={11} color="#c9c3e6" marginBottom={inner * 0.3}>{c.state === "making" ? "being made…" : c.meta.painting ? "being painted…" : ""}</Text>)}
          {/* the hole in the middle, then the title on its label below it, as THE EASEL hangs a title under its paintings */}
          {!children ? <View style={{ position: "absolute", width: inner * 0.07, height: inner * 0.07, borderRadius: inner, backgroundColor: "#0e0d18", opacity: 0.8 }} /> : null}
          {!children ? (
            <View style={{ position: "absolute", bottom: inner * 0.1, left: inner * 0.16, right: inner * 0.16, paddingVertical: 3,
                           paddingHorizontal: 5, backgroundColor: "rgba(20,18,36,0.66)", borderRadius: 3 }}>
              <Text fontFamily="$mono" fontSize={Math.max(8, Math.round(inner / 21))} lineHeight={Math.max(10, Math.round(inner / 16))} fontWeight="700"
                    letterSpacing={0.5} color="#f4efe2" textAlign="center" numberOfLines={2}>{c.title}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// a few bands of the music's spectrum (a plain DFT over the newest samples), or, where the build cannot sample, bars
// breathing at DRIFT DOWN's beat
const BANDS = 24;
function bandsOf(frames: number[]): number[] {
  const n = Math.min(512, frames.length), x = frames.slice(frames.length - n), out: number[] = [];
  for (let b = 0; b < BANDS; b++) {
    const k = Math.max(1, Math.round(2 ** ((b / BANDS) * Math.log2(n / 4))));   // log-spaced bins up to a quarter of the rate
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { const a = (2 * Math.PI * k * i) / n, w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n); re += x[i] * w * Math.cos(a); im -= x[i] * w * Math.sin(a); }
    out.push(Math.sqrt(re * re + im * im));
  }
  // quiet music is still music: the bars are scaled to the loudest band lately (a peak that falls slowly), then eased
  peak = Math.max(peak * 0.97, ...out, 1e-4);
  return out.map((v) => Math.sqrt(v / peak));
}
let peak = 1e-4;
function Spectrum({ size, beat, colour }: { size: number; beat: number; colour: string }) {
  const [bands, setBands] = useState<number[]>(() => Array(BANDS).fill(0.1));
  const last = useRef(0);
  useEffect(() => {
    if (canSample()) return onSpectrum((fr) => { const now = Date.now(); if (now - last.current < 80) return; last.current = now; setBands(bandsOf(fr)); });
    const t = setInterval(() => {   // no samples here: the beat, breathing
      const ph = (Date.now() / 1000) * beat * 2 * Math.PI;
      setBands(Array.from({ length: BANDS }, (_, i) => 0.25 + 0.55 * Math.abs(Math.sin(ph + i * 0.35)) * (1 - i / (BANDS * 1.4))));
    }, 90);
    return () => clearInterval(t);
  }, [beat]);
  // mirrored about the record's hole: the lowest sounds in the middle, the highest at both edges
  const shown = [...bands.slice().reverse(), ...bands], w = (size * 0.74) / shown.length;
  return (
    <XStack width={size} height={size} alignItems="center" justifyContent="center" gap={1}>
      {shown.map((v, i) => <View key={i} style={{ width: w - 1, height: Math.max(3, v * size * 0.62), borderRadius: 2, backgroundColor: colour, opacity: 0.55 + v * 0.45 }} />)}
    </XStack>
  );
}

// The player, for a sleep piece this phone keeps
export function SleepPlayer({ k, ink, onBack }: { k: Kept; ink: string; onBack: () => void }) {
  const [now, setNow] = useState(sleepState());
  const [drift, setDriftOn] = useState(sleepState().drift);
  const [spectrum, setSpectrum] = useState(false);
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  const [, tickle] = useState(0);
  useEffect(() => onSleep(setNow), []);
  const mineNow = now.playing && now.id === k.id;
  useEffect(() => { if (!mineNow) return; const t = setInterval(() => tickle((n) => n + 1), 2000); return () => clearInterval(t); }, [mineNow]);
  const s = mineNow ? (Date.now() - now.startedAt) / 1000 : 0, stage = stageAtS(s);
  const play = async () => {
    setError("");
    if (drift && headphones() === false) setError("DRIFT DOWN waits for headphones: the music plays alone until then.");   // DRAFT
    await playSleep({ id: k.id, uri: k.local["phone.m4a"], title: k.title, keyscale: String(k.meta.keyscale ?? ""), drift });
  };
  const toggleDrift = () => { const on = !drift; setDriftOn(on); if (mineNow) setDrift(on); };
  const out = async (file: string, label: string) => {
    setError(""); setBusy(`Making ${label} on the hub… the first time takes a little while.`);   // DRAFT
    try { await exportFile(k.files[file], `${k.title}${file === "export.imedx" ? ".imedx" : file === "export-drift.mp3" ? " (DRIFT DOWN).mp3" : ".mp3"}`); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const size = 260;
  return (
    <YStack gap={12}>
      <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12" cursor="pointer" role="link" onPress={onBack}>{"‹ CREATIONS"}</Text>
      <YStack alignItems="center" gap={8}>
        <RecordCover c={k} size={size} progress={mineNow ? s / SESSION_S : 0} onPress={() => setSpectrum((v) => !v)}>
          {spectrum ? <Spectrum size={size - 22} beat={drift ? stage.beat : 1} colour={STAGE_COLOUR[stage.word]} /> : undefined}
        </RecordCover>
        <Small color="$color8">{spectrum ? "Tap the record for its cover." : "Tap the record for its spectrum."}</Small>
        <Text fontFamily="$mono" fontSize={17} fontWeight="700" letterSpacing={1} color="$color12" textAlign="center">{k.title}</Text>
        {k.about ? <Small>{k.about}</Small> : null}
      </YStack>
      <Card>
        <Eyebrow>{"THE NIGHT · DRAFT"}</Eyebrow>
        {mineNow ? <Small color="$color12">{s < SESSION_S - FADE_S ? `Playing: ${Math.round((SESSION_S - FADE_S - s) / 60)} minutes until it fades.`
                                                                    : `Fading: ${Math.max(1, Math.round((SESSION_S - s) / 60))} minutes left.`}</Small>
                 : <Small>{"Thirty minutes: whole for twenty, fading over the last ten."}</Small>}
        <XStack gap={8} flexWrap="wrap">
          {mineNow ? <Action label="STOP" ink={ink} onPress={stopSleep} /> : <Action label="PLAY 30 MINUTES" ink={ink} onPress={play} />}
        </XStack>
        <XStack marginTop={8}><CareKey label={drift ? "DRIFT DOWN · ON" : "DRIFT DOWN"} ink={ink} lit={drift} onPress={toggleDrift} /></XStack>
        {mineNow && now.drift ? <Small>{now.driftHeld ?? `DRIFT DOWN: ${stage.word}, ${stage.beat} Hz`}</Small> : null}
        <Small>{`Beats ${String(k.meta.beats ?? "")} between the ears (headphones), on a ${k.meta.carrierHz} Hz carrier in ${k.meta.keyscale}, ${k.meta.bpm} beats a minute.`}</Small>
      </Card>
      <Card>
        <Eyebrow>{"MADE"}</Eyebrow>
        <Small>{`By ${k.daemon.nickname || "a daemon"}${k.by ? `, asked for on ${k.by}` : ""}, ${whenSaid(k.made)}.${k.where === "community" ? " From the community." : ""}`}</Small>
      </Card>
      <Card>
        <Eyebrow>{"EXPORT"}</Eyebrow>
        <Small>{"The night as one MP3 -- with DRIFT DOWN under it or without -- or as a PulseEntrain session (.imedx) to open in that app."}</Small>
        <XStack gap={8} flexWrap="wrap">
          <Action label="MP3" ink={ink} onPress={() => out("export.mp3", "the MP3")} />
          <Action label="MP3 + DRIFT DOWN" ink={ink} onPress={() => out("export-drift.mp3", "the MP3")} />
          <Action label="PULSEENTRAIN" ink={ink} onPress={() => out("export.imedx", "the session")} />
        </XStack>
        {busy ? <Small>{busy}</Small> : null}
        {error ? <Small color="$color8">{error}</Small> : null}
      </Card>
      <Action label="LET IT GO FROM THIS PHONE" ink={ink} onPress={() => { if (mineNow) stopSleep(); letGo(k.uid); onBack(); }} />
    </YStack>
  );
}

// A creation from the hub or the community, before it is on this phone: what it is, and DOWNLOAD
function Details({ c, where, have, ink, onBack, onKept }: { c: Creation & { sharedByName?: string }; where: Where; have: boolean; ink: string;
                                                           onBack: () => void; onKept: (k: Kept) => void }) {
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [said, setSaid] = useState("");
  const get = async () => {
    setError(""); setBusy("Bringing it to this phone…");   // DRAFT
    try { onKept(await keep(c, where === "community" ? "community" : "household")); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const share = async () => {
    setError(""); setBusy("Sharing it with the community…");   // DRAFT
    try { await api("/api/community/share", { uid: c.uid }); setSaid("Shared with the community."); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  return (
    <YStack gap={12}>
      <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12" cursor="pointer" role="link" onPress={onBack}>{"‹ CREATIONS"}</Text>
      <YStack alignItems="center" gap={8}>
        {c.kind === "sleep" ? <RecordCover c={c} size={240} /> : <Image source={source(coverUri(c))!} style={{ width: 240, height: 240, borderRadius: 4 }} />}
        <Text fontFamily="$mono" fontSize={16} fontWeight="700" letterSpacing={1} color="$color12" textAlign="center">{c.title}</Text>
        {c.about ? <Small>{c.about}</Small> : null}
      </YStack>
      <Card>
        <Small>{`By ${c.daemon.nickname || "a daemon"}${c.by ? `, asked for on ${c.by}` : ""}, ${whenSaid(c.made)}.`}</Small>
        {c.sharedByName ? <Small>{`Shared by ${c.sharedByName}.`}</Small> : null}
        {c.kind === "sleep" ? <Small>{`${c.meta.keyscale}, ${c.meta.bpm} beats a minute; DRIFT DOWN beats ${c.meta.beats ?? "10 → 6 → 2 Hz"}.`}</Small> : null}
        {c.kind === "painting" && c.meta.request ? <Small>{`Asked: ${c.meta.request}`}</Small> : null}
        {have ? <Small color="$color12">{"✓ On this phone."}</Small> : c.state === "ready" ? <Action label="DOWNLOAD TO THIS PHONE" ink={ink} onPress={get} /> : <Small>{"Still being made."}</Small>}
        {where === "household" && c.state === "ready" ? <Action label="SHARE WITH THE COMMUNITY" ink={ink} onPress={share} /> : null}
        {busy ? <Small>{busy}</Small> : null}
        {said ? <Small color="$color12">{said}</Small> : null}
        {error ? <Small color="$color8">{error}</Small> : null}
      </Card>
    </YStack>
  );
}

// a tile in the gallery
function Tile({ c, have, onPress }: { c: Creation; have: boolean; onPress: () => void }) {
  return (
    <YStack width={150} alignItems="center" gap={4} cursor="pointer" onPress={onPress} opacity={c.state === "failed" ? 0.4 : 1}>
      <View>
        {c.kind === "sleep" ? <RecordCover c={c} size={140} onPress={onPress} />
          : <Pressable onPress={onPress}><Image source={source(coverUri(c)) ?? undefined} style={{ width: 140, height: 140, borderRadius: 3, backgroundColor: "#2b2620" }} /></Pressable>}
        {have ? <View style={{ position: "absolute", top: 4, right: 4, width: 26, height: 26, borderRadius: 13, backgroundColor: "#2f7d4f",
                               alignItems: "center", justifyContent: "center" }}><Text color="#fff" fontWeight="800">{"✓"}</Text></View> : null}
      </View>
      <Text fontSize={12} color="$color11" textAlign="center" numberOfLines={1}>{c.daemon.nickname}</Text>
    </YStack>
  );
}

export function CreationsScreen({ ink, start, onClose }: { ink: string; start?: Kind; onClose?: () => void }) {
  const [where, setWhere] = useState<Where>("mine");
  const [kind, setKind] = useState<Kind>(start ?? "sleep");
  const [missingOnly, setMissingOnly] = useState(false);
  const [mineList, setMine] = useState<Kept[]>(() => mine());
  const [household, setHousehold] = useState<Creation[] | null>(null);
  const [community, setCommunity] = useState<{ linked: boolean; creations: Creation[] } | null>(null);
  const [open, setOpen] = useState<{ c: Creation | Kept; where: Where } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => onMine(() => setMine(mine())), []);
  const loadHousehold = () => api<{ creations: Creation[] }>("/api/creations").then((r) => { setHousehold(r.creations); adoptOld(r.creations).catch(() => {}); })
                                .catch((e) => setError(e.message));
  useEffect(() => { loadHousehold(); }, []);
  useEffect(() => { if (where === "community" && !community) api<{ linked: boolean; creations: Creation[] }>("/api/community").then(setCommunity).catch((e) => setError(e.message)); }, [where]);
  const painting = !!household?.some((c) => c.meta.painting);
  useEffect(() => { if (!painting) return; const t = setInterval(loadHousehold, 15000); return () => clearInterval(t); }, [painting]);
  const have = useMemo(() => new Set(mineList.map((c) => c.uid)), [mineList]);

  if (open) {
    const k = mineList.find((x) => x.uid === open.c.uid);
    if (k && k.kind === "sleep") return <SleepPlayer k={k} ink={ink} onBack={() => setOpen(null)} />;
    if (k && open.where === "mine") return (
      <YStack gap={12}>
        <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12" cursor="pointer" role="link" onPress={() => setOpen(null)}>{"‹ CREATIONS"}</Text>
        <Image source={source(k.local["painting.png"] ?? coverUri(k))!} style={{ width: "100%", aspectRatio: 1, borderRadius: 4 }} />
        <Text fontFamily="$mono" fontSize={16} fontWeight="700" color="$color12">{k.title}</Text>
        {k.about ? <Small>{k.about}</Small> : null}
        <Action label="LET IT GO FROM THIS PHONE" ink={ink} onPress={() => { letGo(k.uid); setOpen(null); }} />
      </YStack>
    );
    return <Details c={open.c} where={open.where} have={have.has(open.c.uid)} ink={ink} onBack={() => setOpen(null)}
                    onKept={(kk) => setOpen({ c: kk, where: "mine" })} />;
  }

  const shown = (where === "mine" ? mineList : where === "household" ? household ?? [] : community?.creations ?? [])
    .filter((c) => c.kind === kind).filter((c) => !(missingOnly && where !== "mine" && have.has(c.uid)));
  return (
    <YStack gap={12}>
      {onClose ? <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12" cursor="pointer" role="link" onPress={onClose}>{"‹ BACK"}</Text> : null}
      <Card>
        <Eyebrow>{"CREATIONS · DRAFT"}</Eyebrow>
        <Small>{"What the daemons made. MINE is on this phone; HOUSEHOLD is everything the hub keeps, from every device at home; COMMUNITY is what homes shared on THE COMMONS."}</Small>
      </Card>
      <Segments value={where} onChange={setWhere} options={[["mine", "MINE"], ["household", "HOUSEHOLD"], ["community", "COMMUNITY"]]} />
      <XStack gap={8}>
        <CareKey label="SLEEP SOUNDS" ink={ink} lit={kind === "sleep"} onPress={() => setKind("sleep")} />
        <CareKey label="PAINTINGS" ink={ink} lit={kind === "painting"} onPress={() => setKind("painting")} />
      </XStack>
      {where !== "mine" ? (
        <XStack gap={8} alignItems="center" cursor="pointer" onPress={() => setMissingOnly((v) => !v)} role="checkbox" aria-checked={missingOnly}>
          <View style={{ width: 20, height: 20, borderRadius: 3, borderWidth: 1.5, borderColor: "#888", alignItems: "center", justifyContent: "center" }}>
            {missingOnly ? <Text fontWeight="800" color="$color12">{"✓"}</Text> : null}
          </View>
          <Small>{"Only what this phone does not have"}</Small>
        </XStack>
      ) : null}
      {where === "community" && community && !community.linked ? <Small>{"The community needs this home linked to THE COMMONS: SETTINGS, THE COMMONS."}</Small> : null}
      {error ? <Small color="$color8">{error}</Small> : null}
      {where === "household" && !household ? <Small>{"Asking the hub…"}</Small> : null}
      {!shown.length && (where === "mine" || household) ? (
        <Small>{where === "mine" ? "Nothing on this phone yet: bring something from HOUSEHOLD, or make tonight's sleep sounds." : "Nothing here yet."}</Small>
      ) : null}
      <XStack flexWrap="wrap" gap={12} justifyContent="center">
        {shown.map((c) => <Tile key={c.uid} c={c} have={where !== "mine" && have.has(c.uid)} onPress={() => setOpen({ c, where })} />)}
      </XStack>
    </YStack>
  );
}
