// C-334 (the user, 2026-11-11: "generitive sleep sounds ... DAEMON-ified (using again context to steer the output -- such
// as the daemons index entry or care/mood/companionship)"): SLEEP SOUNDS, above the dreams -- the piece made for the
// daemon as it is tonight (by the hub, on roverbyteseer's music maker: server/src/psyche/sleepsound.ts says how its context
// steers it), played for thirty minutes and faded out over the last ten; DRIFT DOWN, the binaural layer, for headphones.
// A piece made once is kept and played again until the daemon's context moves. Every word here is DRAFT.
//
// C-590 (the user, 2026-11-26: "the UX and UI in that area we could improve a lot"): REVERIE as a page in THE STUDIO, in
// the order a night is set up -- TONIGHT (its record, PLAY, MAKE ANOTHER), DRIFT DOWN (on or off, the drift chosen and
// its beats drawn across the thirty minutes, lit as they pass), WHERE THE DRIFT GOES (the headphones, THE PULSETTO, THE
// NOVA, C-591) and EVERY PIECE MADE. Choosing a drift -- the door, its kinds, the list, MAKE -- is a view of its own,
// back to the page once one is chosen. DREAMS keeps a small card that opens this page.
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { api } from "../platform/net";
import { keep, mine, type Creation } from "../platform/creations";   // C-358: what is played is kept in MINE
import { CreationsScreen, RecordCover } from "./Creations";   // C-358
import { carrierOf, driftOf, LONG_FALL, LONG_FALL_INFO, stageAt, stagesOfFile, type DriftFile, type DriftInfo, type Stage } from "../sound/binaural";
import { phoneDriftFile, phoneDriftList } from "../sound/phoneDrifts";   // C-551: the phone's own three of each kind
import { kindName, ReverieDoor, type Kind, type Side } from "./ReverieDoor";   // C-550: REVERIE's door
import { ReverieMake, type Made } from "./ReverieMake";   // C-554: REVERIE's MAKE
import { onSleep, playSleep, SESSION_S, setDrift, sleepState, stopSleep, FADE_S } from "../sound/sleepSession";
import { DriftOutputsCard, OutputChips } from "./Devices";   // C-591
import { Action, Card, CareKey, Eyebrow, Small } from "../shared/ui/ui";

type Track = { id: string; key: string; nickname: string; said: string; keyscale: string; state: "making" | "ready" | "failed";
               error?: string; asked: string; made?: string; seconds?: number; files: Record<string, string> | null };
type Sleep = { maker: boolean; tonight: { key: string; said: string; keyscale: string } | null; current: Track | null; tracks: Track[] };

export const left = (startedAt: number) => {
  const s = (Date.now() - startedAt) / 1000, fadeIn = SESSION_S - FADE_S - s, end = SESSION_S - s;
  return fadeIn > 60 ? `${Math.round(fadeIn / 60)} minutes until it fades.` : end > 0 ? `Fading: ${Math.max(1, Math.round(end / 60))} minutes left.` : "";   // DRAFT
};
export const BAND_COLOUR: Record<string, string> = { DELTA: "#3c3f8c", THETA: "#9b7fe6", ALPHA: "#7fb3e6", BETA: "#e0b45c", GAMMA: "#e06c5c" };

/** C-590: a drift across the thirty minutes -- a bar a half minute, as tall as its beat (on a log scale, half a hertz to
 *  forty), coloured by its band, lit up to where the night has reached; the fade's ten minutes shaded. */
export function BeatChart({ stages, progress = 0, height = 64 }: { stages: Stage[]; progress?: number; height?: number }) {
  const bars = 60, lg = (hz: number) => Math.max(0.08, Math.min(1, Math.log(Math.max(0.5, hz) / 0.5) / Math.log(80)));
  return (
    <YStack gap={4} accessibilityLabel={`The drift's beats: ${[...new Set(stages.map((x) => x.word))].join(", ").toLowerCase()}`}>
      <XStack height={height} alignItems="flex-end" gap={1}>
        {Array.from({ length: bars }, (_, i) => {
          const s = (i / bars) * SESSION_S, st = stages.length ? stageAt(s, stages) : { beat: 1, word: "DELTA" }, lit = i / bars < progress;
          return <View key={i} style={{ flex: 1, height: Math.round(lg(st.beat) * height), borderRadius: 1.5, backgroundColor: BAND_COLOUR[st.word] ?? "#888",
                                        opacity: lit ? 1 : s >= SESSION_S - FADE_S ? 0.3 : 0.6 }} />;
        })}
      </XStack>
      <XStack justifyContent="space-between">
        <Text fontFamily="$mono" fontSize={10} color="$color10">{"0"}</Text>
        <Text fontFamily="$mono" fontSize={10} color="$color10">{"20 MIN · THEN THE FADE"}</Text>
        <Text fontFamily="$mono" fontSize={10} color="$color10">{"30"}</Text>
      </XStack>
    </YStack>
  );
}

// DREAMS' shortcut: tonight in one card -- PLAY or STOP, the devices -- and OPEN REVERIE
export function SleepSoundsCard({ ink }: { ink?: string }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(sleepState());
  useEffect(() => onSleep(setNow), []);
  if (open) return <ReveriePage ink={ink} onBack={() => setOpen(false)} back="‹ DREAMS" />;
  return (
    <Card>
      <Eyebrow>{"REVERIE · DRAFT"}</Eyebrow>
      <Small>{now.playing ? `Playing ${now.title || "tonight's sleep sounds"}. ${left(now.startedAt)}` : "Music made for your daemon tonight, to fall asleep to together, and DRIFT DOWN under it."}</Small>
      {now.playing ? <OutputChips /> : null}
      <XStack gap={8} flexWrap="wrap">
        {now.playing ? <Action label="STOP" ink={ink} onPress={stopSleep} /> : null}
        <Action label="OPEN REVERIE" ink={ink} onPress={() => setOpen(true)} />
      </XStack>
    </Card>
  );
}

/** REVERIE, the page (THE STUDIO's, and DREAMS' opened). */
export function ReveriePage({ ink, onBack, back = "‹ THE STUDIO" }: { ink?: string; onBack?: () => void; back?: string }) {
  const [sleep, setSleep] = useState<Sleep | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState(sleepState());
  const [drift, setDriftOn] = useState(sleepState().drift);
  const [, tickle] = useState(0);
  const [view, setView] = useState<"page" | "choose" | "gallery">("page");
  // C-506: REVERIE's drifts -- the library (the hub's), the one chosen
  const [drifts, setDrifts] = useState<DriftInfo[]>([LONG_FALL_INFO, ...phoneDriftList()]);
  const [chosen, setChosen] = useState<string>(LONG_FALL);
  const [chosenFile, setChosenFile] = useState<DriftFile | null>(null);
  // C-550: the door -- you or a daemon, then a kind; the drifts listed are that kind's
  const [side, setSide] = useState<Side | null>(null), [kind, setKind] = useState<Kind | null>(null);
  const [choice, setChoice] = useState<"REASON" | "INSTINCT">("REASON");
  const [party, setParty] = useState<{ slot: number; nickname?: string }[]>([]);
  const [madeId, setMadeId] = useState<string | null>(null);   // C-554: the reverie made here, its music on the way
  const [madeNote, setMadeNote] = useState("");
  const [tonight, setTonight] = useState<Creation | null>(null);                 // C-358: tonight's piece as a creation (its cover)
  useEffect(() => {
    api<{ choice?: "REASON" | "INSTINCT" }>("/api/profile").then((p) => { if (p.choice) setChoice(p.choice); }).catch(() => {});
    api<{ party: { slot: number; nickname?: string }[] }>("/api/party").then((r) => setParty(r.party ?? [])).catch(() => {});
  }, []);
  const load = () => api<Sleep>("/api/sleep").then(setSleep).catch((e) => setError(e.message));
  useEffect(() => { load(); return onSleep(setNow); }, []);
  useEffect(() => {   // C-506: a hub without the library (or a phone on its own) keeps THE LONG FALL and the phone's own (C-551)
    api<{ drifts: DriftInfo[]; chosen: string }>("/api/drifts").then((r) => { if (r.drifts?.length) setDrifts(r.drifts); setChosen(r.chosen ?? LONG_FALL); }).catch(() => {});
  }, []);
  const fileOf = (id: string): Promise<DriftFile | null> => id === LONG_FALL ? Promise.resolve(null)
    : api<DriftFile>(`/api/drifts/${encodeURIComponent(id)}`).catch(() => phoneDriftFile(id));   // C-551: the phone's own, away
  useEffect(() => { let gone = false; fileOf(chosen).then((f) => { if (!gone) setChosenFile(f); }).catch(() => {}); return () => { gone = true; }; }, [chosen]);
  useEffect(() => {   // C-358: tonight's cover, once painted
    const id = sleep?.current?.id;
    if (!id) { setTonight(null); return; }
    api<{ creations: Creation[] }>("/api/creations?kind=sleep").then((r) => setTonight(r.creations.find((c) => c.id === id) ?? null)).catch(() => {});
  }, [sleep?.current?.id, sleep?.current?.state]);
  const making = !!sleep?.tracks.some((t) => t.state === "making");
  useEffect(() => {   // while a piece is being made, look again; while one plays, keep the minutes and the chart true
    if (!making && !now.playing) return;
    const t = setInterval(() => { if (making) load(); tickle((n) => n + 1); }, making ? 10000 : 15000);
    return () => clearInterval(t);
  }, [making, now.playing]);
  const stages = useMemo(() => chosenFile ? stagesOfFile(chosenFile, carrierOf(sleep?.tonight?.keyscale)) : driftOf(new Date()), [chosenFile, sleep?.tonight?.keyscale]);

  const choose = async (id: string) => {
    setChosen(id); setView("page");
    try { await api("/api/drifts/choose", { id }); } catch { /* kept on this phone for now */ }
  };
  const made = (m: Made) => {   // C-554: the drift it wrote is chosen; the list and the pieces are read again
    setMadeId(m.track?.id ?? null); setChosen(m.chosen);
    setMadeNote(`${m.wrote ? `Its drift, ${m.name ?? "a new one"}, is written and chosen.` : "No mind answered, so the kind's own drift is chosen."}` +
                (m.music ? ` No music: ${m.music}` : ""));   // DRAFT
    api<{ drifts: DriftInfo[]; chosen: string }>("/api/drifts").then((r) => { if (r.drifts?.length) setDrifts(r.drifts); }).catch(() => {});
    load();
  };
  const make = async (again = false) => {
    setError(""); setBusy("Asking the hub for it…");
    try { await api("/api/sleep/make", { again }); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const play = async (t: Track) => {
    if (!t.files) return;
    setError(""); setBusy("Fetching it to the phone, once…");
    try {
      // C-358: kept in MINE first (fetched once), then played from the phone
      let k = mine("sleep").find((x) => x.id === t.id);
      if (!k) {
        const c = (await api<{ creations: Creation[] }>("/api/creations?kind=sleep")).creations.find((x) => x.id === t.id);
        if (!c) throw new Error("The hub does not have it any more.");   // DRAFT
        k = await keep(c, "household");
      }
      const driftFile = await fileOf(chosen);   // C-506: the chosen drift's file (THE LONG FALL is made on the phone, as always)
      await playSleep({ id: t.id, uri: k.local["phone.m4a"], title: k.title || `${t.nickname || "Your daemon"}'s sleep sounds`, keyscale: t.keyscale, drift, driftFile });
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const toggleDrift = () => { const on = !drift; setDriftOn(on); if (now.playing) setDrift(on); };
  const backLink = (label: string, press: () => void) => (
    <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12" cursor="pointer" role="link" onPress={press}>{label}</Text>
  );

  if (view === "gallery") return <CreationsScreen ink={ink ?? "#fbfaf6"} start="sleep" onClose={() => setView("page")} />;
  const d = drifts.find((x) => x.id === chosen) ?? LONG_FALL_INFO;

  if (view === "choose") {
    // C-553: a kind's drifts for the side chosen -- a daemon's own where it has them (its machine voice), else yours
    const ofKind = kind ? drifts.filter((x) => x.kind === kind) : drifts;
    const daemons = ofKind.filter((x) => x.side === "daemon");
    const shown = side === "daemon" && daemons.length ? daemons : ofKind.filter((x) => x.side !== "daemon");
    return (
      <YStack gap={12}>
        {backLink("‹ REVERIE", () => setView("page"))}
        <Card>
          <Eyebrow>{kind && side ? `CHOOSE A DRIFT · ${kindName(side, kind)} · DRAFT` : "CHOOSE A DRIFT · DRAFT"}</Eyebrow>
          {side ? <Small>{"Choose a kind, then a drift -- or make one of your own."}</Small> : null}{/* C-550: the door itself has no words */}
          <ReverieDoor side={side} kind={kind} choice={choice} party={party} onSide={setSide} onKind={setKind} />
          {side && kind ? <ReverieMake side={side} kind={kind} party={party} ink={ink} onMade={made} /> : null}
          {madeNote ? <Small color="$color10">{madeNote}</Small> : null}
        </Card>
        {side ? <Card><DriftList drifts={shown} chosen={chosen} onChoose={choose} /></Card> : null}
      </YStack>
    );
  }

  if (!sleep) return (
    <YStack gap={12}>
      {onBack ? backLink(back, onBack) : null}
      <Card><Eyebrow>{"REVERIE"}</Eyebrow><Small color={error ? "$color8" : "$color10"}>{error || "Asking the hub…"}</Small></Card>
    </YStack>
  );
  const cur = sleep.current, older = sleep.tracks.filter((t) => t.state === "ready" && t.id !== cur?.id);
  const s = now.playing ? (Date.now() - now.startedAt) / 1000 : 0, st = stageAt(s, stages);
  const reverie = madeId ? sleep.tracks.find((x) => x.id === madeId) : null;   // C-554: the reverie made here
  const failed = sleep.tracks.find((t) => t.state === "failed" && t.key === sleep.tonight?.key)?.error;
  return (
    <YStack gap={12}>
      {onBack ? backLink(back, onBack) : null}
      <Card>
        <Eyebrow>{"REVERIE · TONIGHT · DRAFT"}</Eyebrow>
        {tonight ? <XStack alignSelf="center" marginVertical={4}><RecordCover c={tonight} size={210} progress={now.playing && now.id === cur?.id ? s / SESSION_S : 0} /></XStack> : null}
        <Small>{sleep.tonight ? sleep.tonight.said : "Carry a daemon to have sleep sounds made for it."}</Small>
        {!sleep.maker ? <Small color="$color8">{"Sleep sounds are made on the hub's music maker, and this hub has none set up."}</Small> : null}
        {now.playing ? <Small color="$color12">{`Playing ${now.title || "tonight's"}. ${left(now.startedAt)}`}</Small>
          : <Small>{"Thirty minutes: whole for twenty, fading away over the last ten."}</Small>}
        <XStack gap={8} flexWrap="wrap">
          {now.playing ? <Action label="STOP" ink={ink} onPress={stopSleep} />
            : cur?.state === "ready" ? <Action label="PLAY 30 MINUTES" ink={ink} onPress={() => play(cur)} />
            : sleep.tonight && sleep.maker && cur?.state !== "making" ? <Action label="MAKE TONIGHT'S" ink={ink} onPress={() => make()} /> : null}
          {!now.playing && cur?.state === "ready" && sleep.maker ? <Action label="MAKE ANOTHER" ink={ink} onPress={() => make(true)} /> : null}
          {reverie?.state === "ready" && !now.playing ? <Action label="PLAY YOUR REVERIE" ink={ink} onPress={() => play(reverie)} /> : null}
        </XStack>
        {cur?.state === "making" ? <Small>{"Being made on the hub: about three minutes. It will be here."}</Small> : null}
        {reverie && reverie.state === "making" ? <Small>{"Your reverie's music is being made, about three minutes."}</Small> : null}
        {reverie && reverie.state === "failed" ? <Small color="$color8">{`Its music was not made: ${reverie.error ?? "the music maker did not answer"}. Its drift is kept.`}</Small> : null}
        {failed && !making ? <Small color="$color8">{`The last one was not made: ${failed}`}</Small> : null}
        {busy ? <Small>{busy}</Small> : null}
        {error ? <Small color="$color8">{error}</Small> : null}
      </Card>

      <Card>
        <XStack alignItems="center" justifyContent="space-between" gap={8}>
          <Eyebrow>{"DRIFT DOWN"}</Eyebrow>
          <XStack width={140}><CareKey label={drift ? "ON" : "OFF"} ink={ink ?? "#fbfaf6"} lit={drift} onPress={toggleDrift} /></XStack>
        </XStack>
        <Text fontFamily="$mono" fontSize={15} fontWeight="700" letterSpacing={1} color="$color12">{d.name}</Text>
        <Small>{d.id === LONG_FALL ? `Alpha as you settle, theta, then delta as you sleep: ${driftOf().map((x) => `${x.beat} Hz`).join(", ")} tonight, each placed by the day.` : d.description}</Small>
        <BeatChart stages={stages} progress={now.playing ? s / SESSION_S : 0} />
        {now.playing && now.drift ? <Small color="$color12">{`Now ${st.word}, ${st.exact ?? st.beat} Hz.${now.driftHeld ? ` ${now.driftHeld}` : ""}`}</Small> : null}
        {!drift ? <Small color="$color10">{"Off: the music plays alone."}</Small> : null}
        <Action label="CHOOSE ANOTHER DRIFT" ink={ink} onPress={() => setView("choose")} />
        {now.playing ? <Small color="$color10">{"A drift chosen now plays from the next PLAY."}</Small> : null}
      </Card>

      <DriftOutputsCard ink={ink} />

      <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12" cursor="pointer" role="link"
            onPress={() => setView("gallery")}>{older.length ? `EVERY PIECE MADE › (${older.length + (cur?.state === "ready" ? 1 : 0)})` : "EVERY PIECE MADE ›"}</Text>
    </YStack>
  );
}

// C-506: the drifts by kind -- SLEEP first, then MEDITATION, then TINCTURES (named by how each feels) -- each with its line
const KIND_NAME: Record<string, string> = { sleep: "SLEEP", meditation: "MEDITATION", nature: "NATURE", tinctures: "TINCTURES" };   // DRAFT
const KIND_ORDER = ["sleep", "meditation", "nature", "tinctures"];
function DriftList({ drifts, chosen, onChoose }: { drifts: DriftInfo[]; chosen: string; onChoose: (id: string) => void }) {
  const kinds = [...new Set(drifts.map((d) => d.kind))].sort((a, b) => (KIND_ORDER.indexOf(a) + 99) % 99 - (KIND_ORDER.indexOf(b) + 99) % 99);
  if (!drifts.length) return <Small>{"No drifts of this kind yet."}</Small>;
  return (
    <YStack gap={8}>
      {kinds.map((k) => (
        <YStack key={k} gap={2}>
          <Eyebrow>{KIND_NAME[k] ?? k.toUpperCase()}</Eyebrow>
          {drifts.filter((d) => d.kind === k).map((d) => (
            <YStack key={d.id} cursor="pointer" role="button" onPress={() => onChoose(d.id)} paddingVertical={6} paddingHorizontal={8} borderRadius={6}
                    backgroundColor={d.id === chosen ? "$color3" : "transparent"} hoverStyle={{ backgroundColor: "$color2" }}>
              <Text fontFamily="$mono" fontSize={13} fontWeight={d.id === chosen ? "700" : "400"} color="$color12">
                {`${d.id === chosen ? "● " : ""}${d.name}${d.durationSec ? ` · ${Math.round(d.durationSec / 60)} min` : ""}${(d.strength ?? 0) >= 5 ? ` · STRENGTH ${d.strength}` : ""}`}{/* C-551: the strong ones say so (THE VAULT KEY is 7) */}</Text>
              {d.description ? <Small>{d.description.length > 140 ? `${d.description.slice(0, 137).replace(/\s+\S*$/, "")}…` : d.description}</Small> : null}
            </YStack>
          ))}
        </YStack>
      ))}
    </YStack>
  );
}
