// C-334 (the user, 2026-11-11: "generitive sleep sounds ... DAEMON-ified (using again context to steer the output -- such
// as the daemons index entry or care/mood/companionship)"): SLEEP SOUNDS, above the dreams -- the piece made for the
// daemon as it is tonight (by the hub, on roverbyteseer's music maker: server/src/psyche/sleepsound.ts says how its context
// steers it), played for thirty minutes and faded out over the last ten; DRIFT DOWN, the binaural layer, for headphones.
// A piece made once is kept and played again until the daemon's context moves. Every word here is DRAFT.
import { useEffect, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { api } from "../platform/net";
import { keep, mine, type Creation } from "../platform/creations";   // C-358: what is played is kept in MINE
import { CreationsScreen, RecordCover } from "./Creations";   // C-358
import { driftOf, LONG_FALL, LONG_FALL_INFO, type DriftFile, type DriftInfo } from "../sound/binaural";
import { phoneDriftFile, phoneDriftList } from "../sound/phoneDrifts";   // C-551: the phone's own three of each kind
import { kindName, ReverieDoor, type Kind, type Side } from "./ReverieDoor";   // C-550: REVERIE's door
import { headphones, onSleep, playSleep, SESSION_S, setDrift, sleepState, stopSleep, FADE_S } from "../sound/sleepSession";
import { Action, Card, CareKey, Eyebrow, Small, whenSaid } from "../shared/ui/ui";

type Track = { id: string; key: string; nickname: string; said: string; keyscale: string; state: "making" | "ready" | "failed";
               error?: string; asked: string; made?: string; seconds?: number; files: Record<string, string> | null };
type Sleep = { maker: boolean; tonight: { key: string; said: string; keyscale: string } | null; current: Track | null; tracks: Track[] };

const left = (startedAt: number) => {
  const s = (Date.now() - startedAt) / 1000, fadeIn = SESSION_S - FADE_S - s, end = SESSION_S - s;
  return fadeIn > 60 ? `Fading in ${Math.round(fadeIn / 60)} minutes.` : end > 0 ? `Fading: ${Math.max(1, Math.round(end / 60))} minutes left.` : "";   // DRAFT
};

export function SleepSoundsCard({ ink }: { ink?: string }) {
  const [sleep, setSleep] = useState<Sleep | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState(sleepState());
  const [drift, setDriftOn] = useState(sleepState().drift);
  const [, tickle] = useState(0);
  const [gallery, setGallery] = useState(false);                                 // C-358: CREATIONS, in place of this card
  // C-506: REVERIE's drifts -- the library (the hub's), the one chosen, and the list open or not
  const [drifts, setDrifts] = useState<DriftInfo[]>([LONG_FALL_INFO, ...phoneDriftList()]);
  const [chosen, setChosen] = useState<string>(LONG_FALL);
  const [picking, setPicking] = useState(false);
  // C-550: the door -- you or a daemon, then a kind; the drifts listed are that kind's
  const [side, setSide] = useState<Side | null>(null), [kind, setKind] = useState<Kind | null>(null);
  const [choice, setChoice] = useState<"REASON" | "INSTINCT">("REASON");
  const [party, setParty] = useState<{ slot: number }[]>([]);
  useEffect(() => {
    api<{ choice?: "REASON" | "INSTINCT" }>("/api/profile").then((p) => { if (p.choice) setChoice(p.choice); }).catch(() => {});
    api<{ party: { slot: number }[] }>("/api/party").then((r) => setParty(r.party ?? [])).catch(() => {});
  }, []);
  const pickKind = (k: Kind | null) => { setKind(k); if (k) setPicking(true); };
  // C-553: a kind's drifts for the side chosen -- a daemon's own where it has them (its machine voice), else yours
  const ofKind = kind ? drifts.filter((x) => x.kind === kind) : drifts;
  const daemons = ofKind.filter((x) => x.side === "daemon");
  const shown = side === "daemon" && daemons.length ? daemons : ofKind.filter((x) => x.side !== "daemon");
  const [tonight, setTonight] = useState<Creation | null>(null);                 // C-358: tonight's piece as a creation (its cover)
  const load = () => api<Sleep>("/api/sleep").then(setSleep).catch((e) => setError(e.message));
  useEffect(() => { load(); return onSleep(setNow); }, []);
  useEffect(() => {   // C-506: a hub without the library (or a phone on its own) keeps THE LONG FALL and the phone's own (C-551)
    api<{ drifts: DriftInfo[]; chosen: string }>("/api/drifts").then((r) => { if (r.drifts?.length) setDrifts(r.drifts); setChosen(r.chosen ?? LONG_FALL); }).catch(() => {});
  }, []);
  const choose = async (id: string) => {
    setPicking(false); setChosen(id);
    try { await api("/api/drifts/choose", { id }); } catch { /* kept on this phone for now */ }
  };
  useEffect(() => {   // C-358: tonight's cover, once painted
    const id = sleep?.current?.id;
    if (!id) { setTonight(null); return; }
    api<{ creations: Creation[] }>("/api/creations?kind=sleep").then((r) => setTonight(r.creations.find((c) => c.id === id) ?? null)).catch(() => {});
  }, [sleep?.current?.id, sleep?.current?.state]);
  const making = !!sleep?.tracks.some((t) => t.state === "making");
  useEffect(() => {   // while a piece is being made, look again; while one plays, keep the minutes true
    if (!making && !now.playing) return;
    const t = setInterval(() => { if (making) load(); tickle((n) => n + 1); }, making ? 10000 : 30000);
    return () => clearInterval(t);
  }, [making, now.playing]);

  const make = async (again = false) => {
    setError(""); setBusy("Asking the hub for it…");
    try { await api("/api/sleep/make", { again }); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const play = async (t: Track) => {
    if (!t.files) return;
    setError(""); setBusy("Fetching it to the phone, once…");
    try {
      if (drift && headphones() === false) setError("DRIFT DOWN waits for headphones: the music plays alone until then.");
      // C-358: kept in MINE first (fetched once), then played from the phone
      let k = mine("sleep").find((x) => x.id === t.id);
      if (!k) {
        const c = (await api<{ creations: Creation[] }>("/api/creations?kind=sleep")).creations.find((x) => x.id === t.id);
        if (!c) throw new Error("The hub does not have it any more.");   // DRAFT
        k = await keep(c, "household");
      }
      // C-506: the chosen drift's file (THE LONG FALL is made on the phone, as always)
      const driftFile = chosen === LONG_FALL ? null
        : await api<DriftFile>(`/api/drifts/${encodeURIComponent(chosen)}`).catch(() => phoneDriftFile(chosen));   // C-551: the phone's own, away
      await playSleep({ id: t.id, uri: k.local["phone.m4a"], title: k.title || `${t.nickname || "Your daemon"}'s sleep sounds`, keyscale: t.keyscale, drift, driftFile });
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const toggleDrift = () => { const on = !drift; setDriftOn(on); if (now.playing) setDrift(on); };

  if (gallery) return <CreationsScreen ink={ink ?? "#fbfaf6"} start="sleep" onClose={() => setGallery(false)} />;
  if (!sleep) return error ? <Card><Eyebrow>{"SLEEP SOUNDS"}</Eyebrow><Small color="$color8">{error}</Small></Card> : null;
  const cur = sleep.current, older = sleep.tracks.filter((t) => t.state === "ready" && t.id !== cur?.id);
  return (
    <Card>
      <Eyebrow>{kind && side ? `REVERIE · ${kindName(side, kind)} · DRAFT` : "REVERIE · SLEEP SOUNDS · DRAFT"}</Eyebrow>
      <Small>{"Music made for your daemon as it is tonight, to fall asleep to together. It plays for thirty minutes and fades away over the last ten."}</Small>
      {sleep.tonight ? <Small color="$color10">{sleep.tonight.said}</Small> : <Small>{"Carry a daemon to have sleep sounds made for it."}</Small>}
      {tonight ? <XStack alignSelf="center" marginVertical={4}><RecordCover c={tonight} size={180} /></XStack> : null}
      {!sleep.maker ? <Small color="$color8">{"Sleep sounds are made on the hub's music maker, and this hub has none set up."}</Small> : null}

      {now.playing ? (
        <YStack gap={2}>
          <Small color="$color12">{`Playing. ${left(now.startedAt)}`}</Small>
          {now.drift ? <Small>{now.driftHeld ?? (now.stage ? `DRIFT DOWN: ${now.stage}` : "DRIFT DOWN")}</Small> : null}
          <Action label="STOP" ink={ink} onPress={stopSleep} />
        </YStack>
      ) : cur?.state === "ready" ? (
        <XStack gap={8} flexWrap="wrap">
          <Action label="PLAY 30 MINUTES" ink={ink} onPress={() => play(cur)} />
          <Action label="MAKE ANOTHER" ink={ink} onPress={() => make(true)} />
        </XStack>
      ) : cur?.state === "making" ? (
        <Small>{"Being made on the hub: about three minutes. It will be here."}</Small>
      ) : sleep.tonight && sleep.maker ? (
        <Action label="MAKE TONIGHT'S" ink={ink} onPress={() => make()} />
      ) : null}
      {sleep.tracks.find((t) => t.state === "failed" && t.key === sleep.tonight?.key)?.error && !making ? (
        <Small color="$color8">{`The last one was not made: ${sleep.tracks.find((t) => t.state === "failed" && t.key === sleep.tonight?.key)!.error}`}</Small>
      ) : null}
      {busy ? <Small>{busy}</Small> : null}
      {error ? <Small color="$color8">{error}</Small> : null}

      {/* C-334: PulseEntrain's idea -- a binaural layer, headphones only */}
      <XStack marginTop={8}>
        <CareKey label={drift ? "DRIFT DOWN · ON" : "DRIFT DOWN"} ink={ink ?? "#fbfaf6"} lit={drift} onPress={toggleDrift} />
      </XStack>
      <ReverieDoor side={side} kind={kind} choice={choice} party={party} onSide={setSide} onKind={pickKind} />
      {(() => {   // C-506: which drift, and what it does
        const d = drifts.find((x) => x.id === chosen) ?? LONG_FALL_INFO;
        return (
          <YStack gap={2}>
            <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12" cursor="pointer" role="link"
                  onPress={() => setPicking((p) => !p)}>{`THE DRIFT: ${d.name} ${picking ? "‹" : "›"}`}</Text>
            <Small>{d.id === LONG_FALL
              ? `With headphones: a slow beat between your ears under the music, easing from ${driftOf().map((x) => `${x.word.toLowerCase()} ${x.beat} Hz`).join(" to ")} as you fall asleep. Headphones only; on a speaker it waits.`
              : `${d.description} The beat between your ears needs headphones; its noise bed plays either way.`}</Small>
            {now.playing && picking ? <Small color="$color8">{"A drift chosen now plays from the next PLAY."}</Small> : null}
            {picking ? <DriftList drifts={shown} chosen={chosen} onChoose={choose} /> : null}
          </YStack>
        );
      })()}

      {/* C-358: every piece made -- this phone's, the household's and the community's -- in CREATIONS */}
      <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12" cursor="pointer" role="link" marginTop={8}
            onPress={() => setGallery(true)}>{older.length ? `CREATIONS › (${older.length + (cur?.state === "ready" ? 1 : 0)} made)` : "CREATIONS ›"}</Text>
    </Card>
  );
}

// C-506: the drifts by kind -- SLEEP first, then MEDITATION, then TINCTURES (named by how each feels) -- each with its line
const KIND_NAME: Record<string, string> = { sleep: "SLEEP", meditation: "MEDITATION", nature: "NATURE", tinctures: "TINCTURES" };   // DRAFT
const KIND_ORDER = ["sleep", "meditation", "nature", "tinctures"];
function DriftList({ drifts, chosen, onChoose }: { drifts: DriftInfo[]; chosen: string; onChoose: (id: string) => void }) {
  const kinds = [...new Set(drifts.map((d) => d.kind))].sort((a, b) => (KIND_ORDER.indexOf(a) + 99) % 99 - (KIND_ORDER.indexOf(b) + 99) % 99);
  return (
    <YStack gap={6} marginTop={4}>
      {kinds.map((k) => (
        <YStack key={k} gap={2}>
          <Eyebrow>{KIND_NAME[k] ?? k.toUpperCase()}</Eyebrow>
          {drifts.filter((d) => d.kind === k).map((d) => (
            <YStack key={d.id} cursor="pointer" role="button" onPress={() => onChoose(d.id)} paddingVertical={2}>
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
