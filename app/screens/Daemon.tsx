// DAEMON -- Yours (its life, care, TALK, SYNC, NEARBY, meetings), Party; the INDEX and the Routines are their own files. (C-157: out of App.tsx.)
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioRecorder } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { useCallback, useEffect, useState } from "react";
import { Button, Input, Text, XStack, YStack } from "tamagui";
import { ACTS, castLine, playerId } from "../data";
import { DenStage } from "../Den";
import { ALONE, api, apiLater, LOCAL, MEETING, ON_PHONE, redrawWidgetNow, WIDGET } from "../net";
import { Carried, Cast, Daemon, DeviceRow, Life, Listen, Meeting, Message, Settings, Spoken, Today } from "../types";
import { Action, Art, Card, CareKey, careSound, Eyebrow, Segments, Small, whenSaid } from "../ui";
import { hearSettings, soundLevel } from "../tuneSound";
import { IndexScreen } from "./Index";
import { RoutinesCard } from "./Routines";
import { SoundingsScreen } from "./Soundings";
import { DreamsScreen } from "./Dreams";   // C-200
import { MeetingsScreen } from "./Meetings";   // C-212
import { ReadsCard } from "./Reads";   // C-203
import { useApi } from "../useApi";
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
  const [hop, setHop] = useState(0);                       // C-113: tended, it hops in its den
  const [note, setNote] = useState("C");                    // C-114: the day's note, for its phrase
  const player = useAudioPlayer(null);
  useEffect(() => {
    api<Life>("/api/daemon/life").then(setL).catch(() => {});
    api<Today>("/api/today").then((t) => setNote(t.day.note)).catch(() => {});
    // C-160: this phone's own SOUND (PLACES, ITS SETTINGS) -- away, as it was last heard
    playerId().then((id) => api<{ settings: { sound?: boolean; volume?: number } }>(`/api/devices/${encodeURIComponent(id)}/settings`))
      .then((r) => hearSettings(r.settings)).catch(() => {});
  }, []);
  if (!l) return null;
  const care = async (what: "feed" | "water" | "train" | "sleep" | "wake", word: string) => {
    setSaid(word); if (what !== "sleep") setHop((n) => n + 1);   // C-118: seen at once; the life it brings back follows
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
    try { setL(await api<Life>(`/api/daemon/${what}`, {})); }   // its answer corrects the counts
    catch (e) {                                            // out of reach, api() has kept it (C-62) -- once: the widget's
      if (!/^Kept on this phone/.test((e as Error).message))   // queue would send it again (the review, 2026-10-18); refused,
        api<Life>("/api/daemon/life").then(setL).catch(() => {});   // the companion's own counts replace the presumed ones
    }
    if (ALONE) redrawWidgetNow();                         // C-111: no companion for the widget to ask
  };
  return (
    <Card borderLeftWidth={6} borderLeftColor="$color9">
      <Eyebrow>{`${name}, TODAY`}</Eyebrow>
      <DenStage species={daemon.species} asleep={l.tired === "asleep"} hop={hop} expression={l.expression} thrive={l.thrive}   // C-113, C-119
                art={<Art key={l.expression?.name ?? "awake"}
                          path={`/art/party/${daemon.slot}.png${l.expression && l.expression.name !== "awake" ? `?expression=${l.expression.name}` : ""}`} size={144} />} height={180} />
      {l.tired === "asleep"                                 // C-118: asleep, said plainly -- not the small word
        ? <Text fontSize={28} fontWeight="800" letterSpacing={2} color="$color12">ASLEEP</Text>
        : <Text fontSize={20} fontWeight="600" color="$color12">{l.word}</Text>}
      <Small>{`fed ${l.fed.today} of 3 · water ${l.watered.today} of 3${l.trained ? " · trained" : ""}${l.rested ? " · slept" : ""}`}</Small>
      {l.cue ? <Small color="$color10">{l.cue}</Small> : null}
      {l.grown && l.grown.exp > 0 ? <Small>{l.grown.level > (l.level ?? 0)
        ? `Grown here: level ${l.level} to ${l.grown.level}. It takes that home with it.`
        : `Grown here: ${l.grown.exp} experience. It takes that home with it.`}</Small> : null}
      {/* C-118: big, and as the boards have them: asleep, one WAKE; at bedtime SLEEP lit (DRAFT) */}
      {l.tired === "asleep" ? (
        <XStack marginTop={6}><CareKey label="Wake" lit onPress={() => care("wake", "Awake.")} ink={ink} /></XStack>
      ) : (
        <XStack gap={8} marginTop={6}>
          <CareKey label="Drink" onPress={() => care("water", "Drank.")} ink={ink} />{/* C-117: the boards' order */}
          <CareKey label="Feed" onPress={() => care("feed", "Eaten.")} ink={ink} />
          <CareKey label="Train" onPress={() => care("train", "Trained.")} ink={ink} />
          <CareKey label="Sleep" lit={l.tired === "drowsy"} onPress={() => care("sleep", "Asleep.")} ink={ink} />
        </XStack>
      )}
      {said ? <Small>{said}</Small> : null}
    </Card>
  );
}
export function useVoice() {
  const player = useAudioPlayer(null);
  return (b64?: string | null) => {
    if (!b64) return;
    const f = new File(Paths.cache, `voice-${Date.now()}.mp3`);
    f.create(); f.write(b64, { encoding: "base64" });
    player.replace({ uri: f.uri }); player.play();
  };
}

// C-66: push to talk -- hold TALK, say something, let go. The companion hears it (speech to text on the user's own
// server), the daemon answers as itself, and the INDEX voice says it.
export function TalkCard({ ink, name }: { ink: string; name: string }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const speak = useVoice();
  const [state, setState] = useState<"" | "listening" | "thinking">("");
  const [said, setSaid] = useState<Spoken | null>(null);
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
      const audioBase64 = await new File(recorder.uri).base64();
      const r = await apiLater<Spoken>("/api/ai/talk", { audioBase64, audioMime: "audio/mp4" });   // C-180: never held open
      setSaid(r); speak(r.audioBase64);
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
      {said?.error ? <Small color="$color8">{said.error}</Small> : null}
    </Card>
  );
}

export function DaemonScreen({ ink, goSettings }: { ink: string; goSettings: () => void }) {
  const [seg, setSeg] = useState<"yours" | "party" | "index" | "routines" | "soundings" | "dreams" | "meetings">("yours");   // C-156; C-200 dreams
  const [party, setParty] = useState<Daemon[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ species: number; name: string; category: string; entry: string } | null>(null);
  const speak = useVoice();
  const [reading, setReading] = useState(false);
  const readAloud = async (species: number) => {           // C-65: the INDEX entry, in the INDEX voice
    setReading(true);
    try { speak((await apiLater<Spoken>("/api/ai/speak", { species })).audioBase64); } catch { /* the card says nothing new */ }
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
                          backup: string | null; casino: { won: number; spins: number; from: number; to: number } | null }>("/api/sync", {});
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
                  onPress={() => api<any>(`/api/species/${d.species}`).then((x) => setOpen({ species: d.species, name: x.name, category: x.category, entry: x.entry }))}>
            <Art path={`/art/party/${d.slot}.png`} size={128} />
            <Text fontFamily="$mono" fontSize={13} fontWeight="700" color="$color12">{d.nickname}</Text>
            <Small>{d.name} · L{d.level}</Small>
            {d.away ? <Small color="$color10">ON YOUR DEVICE</Small> : null}
            {d.holding ? <Small>holding {d.holding}</Small> : null}
            {d.asked ? <Small color="$color10">{d.away ? "ASKED HOME" : "ASKED TO GO"}</Small> : null}
          </YStack>
        ))}
      </XStack>
      {open ? (
        <Card borderColor="$color9">
          <Eyebrow>{open.name} · {open.category} DAEMON</Eyebrow>
          <Text fontSize={16} lineHeight={24} color="$color12">{open.entry}</Text>
          {ON_PHONE ? <Action label={reading ? "Reading…" : "Read aloud"} onPress={() => readAloud(open.species)} ink={ink} /> : null}
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
