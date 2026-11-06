// DAEMON -- Yours (its life, care, TALK, SYNC, NEARBY, meetings), Party; the INDEX and the Routines are their own files. (C-157: out of App.tsx.)
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioRecorder } from "expo-audio";
import { File } from "expo-file-system";
import { keepVoice, readingVoice, voiceFile } from "../../platform/voiceFile";
import { useCallback, useEffect, useState } from "react";
import { Pressable } from "react-native";
import { Button, Input, Text, XStack, YStack } from "tamagui";
import { ACTS, castLine, playerId } from "../../state/data";
import { DenStage } from "./Den";
import { ALONE, api, apiLater, LOCAL, MEETING, ON_PHONE, redrawWidgetNow, WIDGET } from "../../platform/net";
import { Carried, Cast, Daemon, DeviceRow, Life, Listen, Meeting, Message, Settings, Spoken, Today } from "../../state/types";
import { Action, Art, Card, CareKey, careSound, Eyebrow, Segments, Small, whenSaid } from "../../ui/ui";
import { hearSettings, soundLevel } from "../../sound/tuneSound";
import { IndexScreen } from "../shared/Index";
import { RoutinesCard } from "./Routines";
import { SoundingsScreen } from "./Soundings";
import { DreamsScreen } from "./Dreams";   // C-200
import { followVoice, useMouth } from "../../sound/speaking";   // C-213
import { MeetingsScreen } from "./Meetings";   // C-212
import { ReadsCard, Under } from "../shared/Reads";   // C-203, C-204
import { AsAbove, HalloweenNote, HourCount, useDawn, useDawnTone, useHalloween, useWitching, useWitchingLevel, WitchingHour } from "../shared/Witching";   // C-236, C-237, C-240; T-519
import { FirstSight } from "../shared/Hermetic";   // C-238
import { talkHere, thinker } from "../../platform/mind";   // C-280
import { useApi } from "../../platform/useApi";
import { heardSync } from "../../ui/received";              // C-261
import type { Arrival } from "../../../server/src/core";
import type { Care } from "../../../server/src/care";   // C-266
import { pretendLife, useDev } from "../../state/dev";
import { onLifeHeard } from "../../state/lifeHeard";   // C-300
import { GIVEN, phraseMs, PROVISIONS, type Serving } from "./Provision";   // C-302
import NIGHT from "../../modules/daemons-night";                       // C-284: the phone's own night   // C-269: as </> sets its mood and care (C-275: in the </> tab)
 // C-119: how it looks now, decided on the server

// C-122: what a press does to the day, assumed before anyone answers -- the widget's presume() (targets/widget/Care.swift)
export function presumed(l: Life, what: "feed" | "water" | "train" | "sleep" | "wake"): Life {
  const woke = l.tired === "asleep" ? "awake" : l.tired;   // tended, it wakes (C-114)
  switch (what) {
    case "feed":  return { ...l, fed: { ...l.fed, today: Math.min(3, l.fed.today + 1) }, tired: woke };
    case "water": return { ...l, watered: { ...l.watered, today: Math.min(3, l.watered.today + 1) }, tired: woke };
    case "train": return { ...l, trained: true, tired: woke };
    case "sleep": return { ...l, tired: "asleep" };
    case "wake":  return { ...l, tired: "awake" };
  }
}

export function LifeCard({ ink, name, daemon }: { ink: string; name: string; daemon: Daemon }) {
  const [l, setL] = useState<Life | null>(null);
  const [said, setSaid] = useState("");
  const [under, setUnder] = useState("");                   // C-204: words under words, once the book is held
  const witching = useWitching();                           // C-236: 3 to 4 in the morning
  const [above, setAbove] = useState(false);               // C-237: AS ABOVE SO BELOW, opened by a touch in the hour
  const halloween = useHalloween(daemon.species);           // C-240: the shimmer all day, the costume, the treats
  const [unmasked, setUnmasked] = useState(false);
  const masked = halloween.on && !!halloween.costume && !unmasked;
  const [hop, setHop] = useState(0);                       // C-113: tended, it hops in its den
  const [serving, setServing] = useState<Serving | null>(null);   // C-302: the fruit or the glass, eaten or drunk
  const mouth = useMouth();                                 // C-213: open and shut while its voice plays
  const [note, setNote] = useState("C");                    // C-114: the day's note, for its phrase
  const shimmer = useWitchingLevel();                       // T-519: the shimmer as strong as the hour is now, caught up to
  const dawn = useDawn();                                   // T-519: THE CREATOR'S HOUR, 4:24 to 5:12 -- its light and its tone
  useDawnTone(dawn.tone, note);
  const player = useAudioPlayer(null);
  useDev();                                                 // C-269: drawn again as </> moves its sliders
  useEffect(() => {
    api<Life>("/api/daemon/life").then(setL).catch(() => {});
    api<Today>("/api/today").then((t) => setNote(t.day.note)).catch(() => {});
    // C-160: this phone's own SOUND (PLACES, ITS SETTINGS) -- away, as it was last heard
    playerId().then((id) => api<{ settings: { sound?: boolean; volume?: number } }>(`/api/devices/${encodeURIComponent(id)}/settings`))
      .then((r) => hearSettings(r.settings)).catch(() => {});
  }, []);
  // C-300: tended elsewhere -- the widget, a watch -- read again: when the app is back at the front (shell/sync.ts, after
  // the widget's kept presses are sent) and every half minute while it is shown
  useEffect(() => {
    const again = () => api<Life>("/api/daemon/life").then(setL).catch(() => {});
    const off = onLifeHeard(again), t = setInterval(again, 30000);
    return () => { off(); clearInterval(t); };
  }, []);
  if (!l) return null;
  const shown = pretendLife(l);                             // C-269: as </> sets it, or as it is
  const care = async (what: "feed" | "water" | "train" | "sleep" | "wake", word: string) => {
    setSaid(word); setUnder(""); if (what !== "sleep") setHop((n) => n + 1);   // C-118: seen at once; the life it brings back follows
    if (what === "feed" || what === "water") setServing({ provision: PROVISIONS[GIVEN[what]], at: Date.now(), ms: phraseMs(what) });   // C-302
    setL((was) => was && presumed(was, what));            // C-122: the happy path, drawn before the companion answers
    if (ON_PHONE) {                                       // C-114: a phrase of the game's music, on the day's note
      try {
        if (what !== "wake" && soundLevel() > 0) {
          await setAudioModeAsync({ playsInSilentMode: false }); player.replace({ uri: careSound(what, note) });
          player.volume = soundLevel(); player.play();
        }
      }
      catch { /* quiet is fine */ }
    }
    // C-284: woken after a night in bed -- how often the phone was picked up meanwhile, from iOS's motion record (C-283)
    const slept = what !== "sleep" ? l.sleptAt : undefined;
    const stirs = slept && NIGHT ? await NIGHT.stirs(Date.parse(slept) / 1000, Date.now() / 1000).catch(() => null) : null;
    try {
      const r = await api<Life & { said?: string; under?: string; dream?: { id: number; text: string; by: string } }>(`/api/daemon/${what}`, typeof stirs === "number" ? { stirs } : {});
      setL(r); if (r.said) setSaid(r.said); setUnder(r.under ?? "");   // its answer corrects the counts; C-196: its own line
      if (r.dream) {                                      // C-283: the night's dream -- the written one at once
        setSaid(r.dream.text);
        // C-293: and the talk AI's telling, "I dreamt ...", in its place when it comes (a minute at most)
        const id = r.dream.id;
        if (r.dream.by === "words") (async () => {
          for (let i = 0; i < 15; i++) {
            await new Promise((ok) => setTimeout(ok, 4000));
            const told = (await api<{ dreams: { id: number; text: string; by: string }[] }>("/api/dreams").catch(() => null))?.dreams.find((d) => d.id === id);
            if (told && told.by !== "words") { setSaid(told.text); return; }
          }
        })();
      }
    }
    catch (e) {                                            // out of reach, api() has kept it (C-62) -- once: the widget's
      if (!/^Kept on this phone/.test((e as Error).message))   // queue would send it again (the review, 2026-10-18); refused,
        api<Life>("/api/daemon/life").then(setL).catch(() => {});   // the companion's own counts replace the presumed ones
    }
    redrawWidgetNow();                                    // C-300: the widget too, at once -- not in half an hour (C-111: alone, drawn here)
  };
  return (
    <Card borderLeftWidth={6} borderLeftColor="$color9">
      <Eyebrow>{`${name}, TODAY`}</Eyebrow>
      <YStack position="relative">
      <Pressable disabled={!witching && !halloween.on} onPress={() => witching ? setAbove(true) : setUnmasked((u) => !u)}
                 accessibilityLabel={witching ? "as above, so below" : halloween.on ? "the mask" : undefined}>{/* C-237: in the hour, a touch; C-240: the mask */}
      <DenStage species={daemon.species} asleep={l.tired === "asleep"} hop={hop} serving={serving} expression={masked ? null : shown.expression} thrive={l.thrive} witching={witching || halloween.on} shimmer={witching ? shimmer : 1} dawn={dawn.level}   // C-113, C-119; C-240: Halloween shimmers all day
                art={<Art key={`${l.expression?.name ?? "awake"}${mouth ? "-open" : ""}`}   // C-213: the mouth, open on the beat
                          path={masked ? `/art/species/${halloween.costume!.species}.png` : `/art/party/${daemon.slot}.png${artQuery(l.expression?.name, mouth)}`} size={144} />} height={180} />
      </Pressable>
      {witching ? <HourCount /> : null}
      </YStack>
      {l.tired === "asleep"                                 // C-118: asleep, said plainly -- not the small word
        ? <Text fontSize={28} fontWeight="800" letterSpacing={2} color="$color12">ASLEEP</Text>
        : <Text fontSize={20} fontWeight="600" color="$color12">{shown.word}</Text>}
      <Small>{`fed ${l.fed.today} of 3 · water ${l.watered.today} of 3${l.trained ? " · trained" : ""}${l.rested ? " · slept" : ""}`}</Small>
      {l.cue ? <Small color="$color10">{l.cue}</Small> : null}
      {shown.care ? <CareStats mood={shown.mood} care={shown.care} /> : null}
      {l.grown && l.grown.exp > 0 ? <Small>{l.grown.level > (l.level ?? 0)
        ? `Grown here: level ${l.level} to ${l.grown.level}. It takes that home with it.`
        : `Grown here: ${l.grown.exp} experience. It takes that home with it.`}</Small> : null}
      {/* C-118: big, and as the boards have them: asleep, one WAKE; at bedtime SLEEP lit (DRAFT) */}
      {witching ? <FirstSight /> : null}{/* C-238: the hour, seen here the first time -- what is happening, and SPELLCRAFT */}
      {witching && above ? <AsAbove onClose={() => setAbove(false)} />   /* C-237: AS ABOVE SO BELOW, in place of CARE */
      : l.tired === "asleep" ? (
        <XStack marginTop={6}><CareKey label="Wake" lit onPress={() => care("wake", "Awake.")} ink={ink} /></XStack>
      ) : (
        <XStack gap={8} marginTop={6}>
          <CareKey label="Feed" onPress={() => care("feed", "Eaten.")} ink={ink} />{/* C-279: feed, drink, train, sleep */}
          <CareKey label="Drink" onPress={() => care("water", "Drank.")} ink={ink} />
          <CareKey label="Train" onPress={() => care("train", "Trained.")} ink={ink} />
          <CareKey label="Sleep" lit={l.tired === "drowsy"} onPress={() => care("sleep", "Asleep.")} ink={ink} />
        </XStack>
      )}
      {said ? <Small>{said}</Small> : null}
      <Under words={under} />
      {witching ? <WitchingHour nickname={name} species={daemon.species} note={note} /> : null}
      <HalloweenNote h={halloween} masked={masked} name={name} />
    </Card>
  );
}
// C-266 (the user, 2026-11-01: "in the app in the daemon companion view you can see their stats, like mood, and the
// health ones"): how it is, and how it has been looked after -- each a bar, the care's words beside it (DRAFT). Weight is
// the one with a middle: its balance is the centre, thinner to the left, heavier to the right.
const CARE_ROWS: [string, (c: Care, mood: number) => number, (n: number) => string][] = [
  ["MOOD", (_, m) => m, (n) => (n >= 72 ? "good" : n >= 55 ? "fair" : "low")],
  ["REST", (c) => c.rest, (n) => (n >= 70 ? "rested" : n >= 40 ? "tired" : "worn out")],
  ["FED", (c) => 100 - c.hunger, (n) => (n >= 80 ? "full" : n >= 50 ? "peckish" : "hungry")],
  ["WATER", (c) => 100 - c.thirst, (n) => (n >= 80 ? "watered" : n >= 50 ? "dry" : "thirsty")],
  ["COMPANY", (c) => c.companionship, (n) => (n >= 80 ? "close" : n >= 50 ? "near" : "distant")],
];
// the filled part in the day's colour ($color9): ink is the text-on-colour shade, near white on a light day, and drew the
// empty part as the bar (FED 35 read as 65)
function CareStats({ mood, care }: { mood: number; care: Care }) {
  const bar = (n: number) => (
    <XStack flex={1} height={8} borderRadius={4} backgroundColor="$color4" overflow="hidden">
      <YStack width={`${Math.max(0, Math.min(100, n))}%`} backgroundColor="$color9" />
    </XStack>);
  const w = care.weight, weightWord = w <= -40 ? "thin" : w < -12 ? "lean" : w <= 12 ? "balanced" : w < 40 ? "plump" : "heavy";
  return (
    <YStack gap={4} marginTop={6} accessibilityLabel="its care">
      {CARE_ROWS.map(([label, of, word]) => { const n = of(care, mood); return (
        <XStack key={label} alignItems="center" gap={8}>
          <Text fontFamily="$mono" fontSize={10} width={62} color="$color11">{label}</Text>
          {bar(n)}
          <Text fontFamily="$mono" fontSize={10} width={64} color="$color10">{word(n)}</Text>
        </XStack>); })}
      <XStack alignItems="center" gap={8}>
        <Text fontFamily="$mono" fontSize={10} width={62} color="$color11">WEIGHT</Text>
        <XStack flex={1} height={8} borderRadius={4} backgroundColor="$color4" position="relative">
          <YStack position="absolute" left="50%" top={-2} bottom={-2} width={1} backgroundColor="$color9" />
          <YStack position="absolute" top={0} bottom={0} borderRadius={4} backgroundColor="$color9"
                  left={`${w < 0 ? 50 + w / 2 : 50}%`} width={`${Math.max(1, Math.abs(w) / 2)}%`} />
        </XStack>
        <Text fontFamily="$mono" fontSize={10} width={64} color="$color10">{weightWord}</Text>
      </XStack>
    </YStack>
  );
}

// C-119, C-213: the picture's query -- its expression's shade, and the mouth open while it speaks
const artQuery = (expression: string | undefined, mouth: boolean) => {
  const q = [expression && expression !== "awake" ? `expression=${expression}` : "", mouth ? "mouth=open" : ""].filter(Boolean).join("&");
  return q ? `?${q}` : "";
};
// a voice to play: the hub's base64, or a kept file (platform/voiceFile.ts) played from where it is
export function useVoice() {
  const player = useAudioPlayer(null);
  return (v?: string | File | null) => {
    if (!v) return;
    const f = typeof v === "string" ? voiceFile("voice", v) : v;
    player.replace({ uri: f.uri }); player.play();
    followVoice(player);                                   // C-213: its mouth moves while it speaks
  };
}

// C-66: push to talk -- hold TALK, say something, let go. The companion hears it (speech to text on the user's own
// server), the daemon answers as itself, and the INDEX voice says it.
export function TalkCard({ ink, name }: { ink: string; name: string }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const speak = useVoice();
  const [state, setState] = useState<"" | "listening" | "thinking">("");
  const [said, setSaid] = useState<Spoken | null>(null);
  const [heard, setHeard] = useState<File | null>(null);   // the answer's voice, kept on the phone to hear again
  const answered = (r: Spoken) => {
    const f = r.audioBase64 && r.answer ? keepVoice(`talk:${r.answer}`, r.audioBase64) : null;
    setHeard(f); speak(f ?? r.audioBase64);
  };
  const start = async () => {
    const ok = await requestRecordingPermissionsAsync();
    if (!ok.granted) { setSaid({ error: "The microphone is off for this app (Settings, then DAEMONS)." }); return; }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync(); recorder.record(); setState("listening");
  };
  const stop = async () => {
    if (state !== "listening") return;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (!recorder.uri) { setState(""); return; }
    setState("thinking");
    try {
      if (await thinker() === "phone") {                       // C-280: heard and answered on this phone
        const r = await talkHere(recorder.uri, name);
        setSaid(r); answered(r);
        return;
      }
      const audioBase64 = await new File(recorder.uri).base64();
      const r = await apiLater<Spoken>("/api/ai/talk", { audioBase64, audioMime: "audio/mp4" });   // C-180: never held open
      setSaid(r); answered(r);
    } catch (e) { setSaid({ error: (e as Error).message }); } finally { setState(""); }
  };
  return (
    <Card borderLeftWidth={6} borderLeftColor="$color9">
      <Eyebrow>{`TALK WITH ${name}`}</Eyebrow>
      <Button onPressIn={start} onPressOut={stop} backgroundColor={state === "listening" ? "$color9" : "$color3"}
              borderColor="$color9" disabled={state === "thinking"}>
        <Text color={state === "listening" ? ink : "$color12"} fontFamily="$mono" letterSpacing={1.5}>
          {state === "listening" ? "LISTENING…" : state === "thinking" ? "THINKING…" : "HOLD TO TALK"}
        </Text>
      </Button>
      {said?.heard ? <Small color="$color10">{`“${said.heard}”`}</Small> : null}
      {said?.answer ? <Text fontSize={16} lineHeight={24} color="$color12">{said.answer}</Text> : null}
      {heard && state === "" ? <Action label="HEAR IT AGAIN" ink={ink} onPress={() => speak(heard)} /> : null}{/* DRAFT */}
      {said?.error ? <Small color="$color8">{said.error}</Small> : null}
    </Card>
  );
}

export function DaemonScreen({ ink, goSettings }: { ink: string; goSettings: () => void }) {
  const [seg, setSeg] = useState<"yours" | "party" | "index" | "routines" | "soundings" | "dreams" | "meetings">("yours");   // C-156; C-200 dreams
  const [party, setParty] = useState<Daemon[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ species: number; name: string; category: string; entry: string; said?: string } | null>(null);
  const speak = useVoice();
  const [reading, setReading] = useState(false);
  // C-65: the INDEX entry, in the INDEX voice. C-303: or, where the daemon has one, what it says of itself, in its own
  const readAloud = async (species: number, said?: string) => {
    setReading(true);
    try { speak(await readingVoice(said ? { species, own: true } : { species }, said)); } catch { /* the card says nothing new */ }   // kept on the phone after the first time
    finally { setReading(false); }
  };
  const [note, setNote] = useState("");
  const [needPath, setNeedPath] = useState(false);   // C-30: SYNC with no save path set -> a modal that teaches it
  const [canPick, setCanPick] = useState(false);
  // C-116: the daemon this phone tends -- a party daemon AWAY if there is one, else the one its widget hosts, else the
  // first AWAY anywhere (C-103: most wait in a box, and the card was hidden for all of them)
  const [hosted, setHosted] = useState<Daemon | null>(null);
  const [own, setOwn] = useState(false);                 // the phone's own, as TODAY shows it, over any other away
  const load = useCallback(() => {
    api<{ party: Daemon[] }>("/api/party").then((r) => { setParty(r.party); setError(""); }).catch((e) => setError(e.message));
    api<{ devices: DeviceRow[]; away: Carried[] }>("/api/devices").then(async (v) => {
      const mine = WIDGET ? await WIDGET.widgetId() : null;
      const own = v.devices.find((x) => x.id === mine)?.daemon ?? null, d = own ?? v.away[0] ?? null;
      setHosted(d ? { ...d, friendship: 0, away: true, asked: false, holding: null } : null);
      setOwn(!!own);
    }).catch(() => {});
  }, []);
  useEffect(load, [load]);
  // C-21: the one SYNC. It reads the save, receives or returns a daemon if the game asked, links the save (so the
  // game shows SEND), and settles a daemon brought home without the app. Close the game first.
  const doSync = async () => {
    const r = await api<{ sameGame: boolean; firstSave: boolean; married: { name: string }; received: string[];
                          returned: string[]; refused: string[]; firstLink: boolean; recalledSeen: boolean;
                          grew: { nickname: string; exp: number; from: number; to: number } | null;
                          backup: string | null; casino: { won: number; spins: number; from: number; to: number } | null;
                          player?: string; arrivals?: Arrival[] }>("/api/sync", {});
    heardSync(r);                                               // C-261: RECEIVED, for what it brought
    const said: string[] = [];
    if (!r.sameGame) said.push(`This save belongs to a different game. Your companion hosts daemons from ${r.married.name}'s.`);
    if (r.firstLink) said.push("Linked. Your game now offers SEND in a daemon's menu.");
    r.received.forEach((n) => said.push(`${n} is with your device now.`));
    r.returned.forEach((n) => said.push(`${n} is home.`));
    r.refused.forEach((n) => said.push(n));                     // T-397: the server says why, whole
    if (r.recalledSeen) said.push("The daemon you brought home in the game is settled here too.");
    if (r.casino) {                                             // C-149: the CASINO's coins, written into the save's money (DRAFT)
      const c = r.casino, spins = `${c.spins} spin${c.spins === 1 ? "" : "s"}`;
      said.push(c.to === c.from && c.won > 0 ? `The CASINO won ${c.won.toLocaleString()} over ${spins}, but your MONEY is already full.`
        : c.won >= 0 ? `The CASINO won ${c.won.toLocaleString()} over ${spins}: MONEY ${c.from.toLocaleString()} to ${c.to.toLocaleString()}.`
        : `The CASINO lost ${(-c.won).toLocaleString()} over ${spins}: MONEY ${c.from.toLocaleString()} to ${c.to.toLocaleString()}.`);
    }
    if (r.grew) said.push(r.grew.to > r.grew.from ? `${r.grew.nickname} came home grown: level ${r.grew.from} to ${r.grew.to}.`
                                                  : `${r.grew.nickname} came home with ${r.grew.exp} more experience.`);   // C-45
    // C-111: on a phone alone the game's save changed here -- it goes back to Delta, or the game never sees it
    if (ALONE && r.backup) said.push("Now give the save back to Delta: Save to Files, then in Delta, hold the game and Import Save File.");
    setNote(said.length ? said.join(" ") : "Synced. Nothing was waiting.");
    load();
    if (ALONE) redrawWidgetNow();
    if (ALONE && r.backup) await LOCAL!.shareSave().catch(() => {});
  };
  // C-30: before syncing, make sure a save is set. If not, teach it rather than fail.
  // Reviewed 2026-10-04: a SYNC that fails (a file that is not a DAEMONS save, a save the game is still writing) used
  // to fail silently; now it says why. And the check is that the file IS a save, not merely that it exists.
  const syncNow = async () => {
    try {
      const s = await api<Settings>("/api/settings");
      setCanPick(s.canPick);
      if (!s.valid) { setNeedPath(true); return; }
      await doSync();
    } catch (e) { setNote(`SYNC did not finish: ${(e as Error).message}`); }
  };
  const pickAndSync = async () => {
    try {
      const r = await api<Settings & { picked: string | null }>("/api/settings/pick", {});
      if (r.picked && r.valid) { setNeedPath(false); await doSync(); }
      else if (r.picked) setNote("That file is not a DAEMONS save. Choose the .sav the game writes.");
    } catch (e) { setNote(`Could not set the save: ${(e as Error).message}`); }
  };
  // The SYNC card is always shown -- when no save is set yet, SYNC is how the user is taught to set one (C-30).
  const asked = party?.some((d) => d.asked) ?? false;
  const away = (own ? hosted : null) ?? party?.find((d) => d.away) ?? hosted ?? undefined;
  return (
    <YStack gap={14}>
      <Segments value={seg} onChange={setSeg} options={[["yours", "Yours"], ["party", "Party"], ["index", "INDEX"], ["routines", "Routines"], ["soundings", "SOUNDINGS"], ["dreams", "DREAMS"], ["meetings", "MEETINGS"]]} />
      {seg === "index" ? <IndexScreen ink={ink} /> : null}
      {seg === "soundings" ? <SoundingsScreen /> : null}
      {seg === "dreams" ? <DreamsScreen ink={ink} /> : null}
      {seg === "meetings" ? <MeetingsScreen ink={ink} /> : null}
      {seg === "routines" ? <RoutinesCard ink={ink} /> : null}
      {seg === "yours" ? (<>
      {away ? <LifeCard ink={ink} name={away.nickname} daemon={away} /> : null}
      {away && ON_PHONE && !ALONE ? <TalkCard ink={ink} name={away.nickname} /> : null}
      {needPath ? (
        <Card borderColor="$color9" borderLeftWidth={6} borderLeftColor="$color9">
          <Eyebrow>FIRST, YOUR SAVE</Eyebrow>
          <Small>To sync, the app needs your DAEMONS save (a .sav file). From an emulator, it is the .sav beside the ROM; from a cartridge, pull the save to your computer first.</Small>
          <XStack gap={8} flexWrap="wrap" marginTop={4}>
            {canPick ? <Action label="Choose a save…" onPress={pickAndSync} ink={ink} /> : null}
            <Action label="Settings" onPress={() => { setNeedPath(false); goSettings(); }} ink={ink} />
          </XStack>
        </Card>
      ) : null}
      <Card borderColor={asked ? "$color9" : "$color5"}>
        <Small>{asked ? "The game is asking. Close it first, then SYNC." : "Close the game, then SYNC to bring your save across."}</Small>
        <Action label="SYNC" onPress={syncNow} ink={ink} />
      </Card>
      {note ? <Small>{note}</Small> : null}
      {error && !needPath ? <Small color="$color8">{error}</Small> : null}
      <NearbyCard ink={ink} />
      <MeetingsCard />
      <ReadsCard />
      </>) : null}
      {seg === "party" ? (<>
      <XStack flexWrap="wrap" gap={12}>
        {(party ?? []).map((d) => (
          <YStack key={d.slot} width={150} alignItems="center" backgroundColor="$color1" borderWidth={1}
                  borderColor="$color5" borderRadius={4} padding={10} gap={2} opacity={d.away ? 0.45 : 1}
                  cursor="pointer" hoverStyle={{ borderColor: "$color9" }} role="button"
                  onPress={() => api<any>(`/api/species/${d.species}`).then((x) => setOpen({ species: d.species, name: x.name, category: x.category, entry: x.entry, said: x.said }))}>
            <Art path={`/art/party/${d.slot}.png`} size={128} />
            <Text fontFamily="$mono" fontSize={13} fontWeight="700" color="$color12">{d.nickname}</Text>
            <Small>{d.name} · L{d.level}</Small>
            {d.away ? <Small color="$color10">ON YOUR DEVICE</Small> : null}
            {d.holding ? <Small>holding {d.holding}</Small> : null}
            {d.spirits?.words ? <Small color="$color10">{d.spirits.words}</Small> : null}{/* DAEMONS T-519: as the game's summary says it */}
            {d.asked ? <Small color="$color10">{d.away ? "ASKED HOME" : "ASKED TO GO"}</Small> : null}
          </YStack>
        ))}
      </XStack>
      {open ? (
        <Card borderColor="$color9">
          {/* C-303 (DAEMONS T-522): on its own page a daemon tells of itself, in its own voice; the record is the INDEX
              tab's, in the INDEX voice. One with no telling yet shows its entry, as before. Labels DRAFT. */}
          <Eyebrow>{open.said ? `${open.name} · IN ITS OWN WORDS` : `${open.name} · ${open.category} DAEMON`}</Eyebrow>
          <Text fontSize={16} lineHeight={24} color="$color12">{open.said ?? open.entry}</Text>
          {ON_PHONE ? <Action label={open.said ? (reading ? "Speaking…" : "Hear it") : reading ? "Reading…" : "Read aloud"}
                              onPress={() => readAloud(open.species, open.said)} ink={ink} /> : null}
        </Card>
      ) : null}
      </>) : null}
    </YStack>
  );
}
// C-154 (the user, 2026-10-18: "all devices (even if not in casino) should get the notifications (either messages, daemons
// moves, or casino)"): what another daemon says or does -- a word, an act, a JACKPOT -- shown on every tab as it arrives,
// not only on NEARBY. Asked every 15 s; the first answer only learns what is already there. A tap opens NEARBY.
export const NEWS_SEEN = new Set<string>();

export let newsPrimed = false;

export function useNews(onTap: () => void, ink = "#fbfaf6") {
  const [news, setNews] = useState<{ id: string; line: string } | null>(null);
  useEffect(() => {
    let gone: ReturnType<typeof setTimeout> | null = null;
    const ask = () => api<{ items: Cast[] }>("/api/broadcasts").then((r) => {
      const fresh = r.items.filter((c) => !NEWS_SEEN.has(c.id));
      fresh.forEach((c) => NEWS_SEEN.add(c.id));
      const theirs = fresh.filter((c) => !c.mine);
      if (newsPrimed && theirs.length) {
        const c = theirs[theirs.length - 1];
        setNews({ id: c.id, line: castLine(c) + (theirs.length > 1 ? `  (+${theirs.length - 1})` : "") });
        if (gone) clearTimeout(gone);
        gone = setTimeout(() => setNews(null), 7000);
      }
      newsPrimed = true;
    }).catch(() => {});
    ask();
    const t = setInterval(ask, 15000);
    return () => { clearInterval(t); if (gone) clearTimeout(gone); };
  }, []);
  const banner = news ? (
    <XStack position="absolute" left={16} right={16} top={ON_PHONE ? 122 : 112} alignItems="center" gap={10} padding={14}
            borderRadius={10} backgroundColor="$color9" maxWidth={720} alignSelf="center" cursor="pointer" role="button"
            onPress={() => { setNews(null); onTap(); }}>
      <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color={ink}>NEARBY</Text>
      <Text flex={1} fontSize={14} fontWeight="700" color={ink}>{news.line}</Text>
    </XStack>
  ) : null;
  return banner;
}

export function NearbyCard({ ink }: { ink: string }) {
  const [items, setItems] = useState<Cast[]>([]);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const load = useCallback(() => { api<{ items: Cast[] }>("/api/broadcasts").then((r) => setItems(r.items)).catch(() => {}); }, []);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);
  // C-141: while NEARBY is open the phone also listens by Bluetooth, and a send goes out as the boards' pieces too
  useEffect(() => { MEETING?.listenForCasts(true); return () => { MEETING?.listenForCasts(false); }; }, []);
  const send = async (body: object) => {
    try {
      const r = await api<{ cast?: { id: string; kind: "say" | "act" | "reply"; species: number; name: string; text?: string; act?: string; replyTo?: string } }>("/api/broadcast", body);
      if (r?.cast) MEETING?.burst(r.cast);
      setNote(""); load();
    }
    catch (e) { setNote((e as Error).message); }                 // e.g. no daemon is away to say it
  };
  const answered = (id: string) => items.some((o) => o.replyTo === id && o.mine);
  return (
    <Card>
      <Eyebrow>NEARBY</Eyebrow>
      {items.length ? items.slice(-8).map((c) => (
        <XStack key={c.id} alignItems="center" gap={8} justifyContent="space-between">
          <Text flex={1} fontSize={15} lineHeight={21} color={c.mine ? "$color10" : "$color12"}>{castLine(c)}</Text>
          {c.kind === "act" && !c.mine && !answered(c.id)
            ? <Action label="Answer" ink={ink} onPress={() => send({ kind: "reply", act: c.act, replyTo: c.id })} /> : null}
        </XStack>
      )) : <Small>Nothing said yet.</Small>}
      <XStack gap={8} alignItems="center" marginTop={6}>
        <Input flex={1} value={text} maxLength={40} onChangeText={setText} placeholder="Say something to every daemon nearby"
               backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={14}
               onSubmitEditing={() => { if (text.trim()) { send({ kind: "say", text: text.trim() }); setText(""); } }} />
        <Action label="Say" ink={ink} onPress={() => { if (text.trim()) { send({ kind: "say", text: text.trim() }); setText(""); } }} />
      </XStack>
      <XStack gap={6} flexWrap="wrap">
        {ACTS.acts.map((a) => <Action key={a.code} label={a.label} ink={ink} onPress={() => send({ kind: "act", act: a.code })} />)}
      </XStack>
      {note ? <Small color="$color10">{note}</Small> : null}
    </Card>
  );
}

export function MeetingsCard() {
  const [m] = useApi<{ meetings: Meeting[]; messages?: Message[]; heardOurs: { at: string } | null; lastListen: Listen }>("/api/meetings");
  if (!m) return null;
  return (
    <Card borderColor="$color5">
      <Eyebrow>MET NEARBY</Eyebrow>
      {m.meetings.length ? m.meetings.map((x, i) => (
        <XStack key={i} gap={10} alignItems="center">
          {x.art ? <Art path={x.art} size={48} /> : <YStack width={48} height={48} />}
          <YStack flex={1}>
            <Text fontFamily="$mono" fontSize={13} fontWeight="700" color="$color12">{x.name}</Text>
            <Small>{whenSaid(x.at)}{x.how === "lora" ? (x.hops ? ` · over LoRa, passed on by ${x.hops === 1 ? "a board" : "two boards"}` : " · over LoRa") : ""} · {x.written ? "in your INDEX" : "in your INDEX after the next SYNC"}</Small>
          </YStack>
        </XStack>
      )) : <Small>No one yet. A meeting needs another companion nearby: someone else's handheld, or the app on someone else's phone.</Small>}
      {m.messages?.length ? (
        <YStack gap={4} marginTop={6}>
          <Eyebrow>WAVES AND WORDS</Eyebrow>
          {m.messages.map((x, i) => (
            <Small key={i} color="$color11">
              {x.dir === "in" ? `${x.name}${x.ours ? " (one of yours)" : ""} ${x.kind === "wave" ? "waved" : `said “${x.text}”`}`
                              : `${x.name} ${x.kind === "wave" ? "waved at" : `said “${x.text}” to`} ${x.peer === "00000000" ? "everyone nearby" : "a daemon nearby"}`}
              {" · "}{whenSaid(x.at)}{x.hops ? " · passed on" : ""}
            </Small>
          ))}
        </YStack>
      ) : null}
      {m.lastListen || m.heardOurs ? (
        <Small color="$color8">
          {m.lastListen ? `Last listen ${whenSaid(m.lastListen.at)}: ${m.lastListen.started ? `${m.lastListen.devices} devices heard` : "the radio was busy"}.` : ""}
          {m.heardOurs ? ` Your phone and handheld last heard each other ${whenSaid(m.heardOurs.at)}.` : ""}
        </Small>
      ) : null}
    </Card>
  );
}
