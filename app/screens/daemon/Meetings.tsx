// C-212 (the user, 2026-10-28: "a (grouped by day) list of my meetings, see the summary, take-aways, action-items, and
// full transcript if needed"): every meeting the watch recorded, the newest day first -- each one's write-up, the
// daemon's day-dream of it (both readable aloud, C-208), and its whole transcript folded away until it is wanted. A
// meeting still being heard or written says so; one that failed can be tried again. Every word DRAFT.
import { useEffect, useRef, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import { api, ALONE, ON_PHONE } from "../../platform/net";
import { forgetWaiting, MEETING_RECORDING, sendOrKeep, sendWaiting, waiting, type Waiting } from "../../platform/meetings";
import { ReadAloud } from "../../ui/readAloud";
import { Action, Card, Eyebrow, Small } from "../../ui/ui";

type Meeting = { id: number; startedAt: string; endedAt: string | null; title: string; parts: (string | null)[];
                 state: "recording" | "hearing" | "writing" | "done" | "failed"; error?: string;
                 summary: string; takeaways: string[]; actions: string[]; daydream: string; daemon: string; audio: boolean;
                 from?: "phone" | "memo" };
const STATE = { recording: "Recording…", hearing: "Listening to it…", writing: "Writing it up…", done: "", failed: "Not written up" };   // DRAFT
const dayOf = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const minutes = (m: Meeting) => m.endedAt ? Math.max(1, Math.round((new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime()) / 60000)) : null;

function Bullets({ items }: { items: string[] }) {
  return <YStack gap={2}>{items.map((t, i) => <Text key={i} fontSize={15} lineHeight={22} color="$color12">{`•  ${t}`}</Text>)}</YStack>;
}

function MeetingCard({ m, ink, reload }: { m: Meeting; ink?: string; reload: () => void }) {
  const [open, setOpen] = useState(false), [words, setWords] = useState(false);
  const transcript = m.parts.filter(Boolean).join(" ");
  return (
    <Card>
      <XStack onPress={() => setOpen((o) => !o)} cursor="pointer" justifyContent="space-between" alignItems="center" gap={10}>
        <YStack flex={1}>
          <Text fontFamily="$mono" fontSize={15} fontWeight="700" letterSpacing={1} color="$color12">{m.title}</Text>
          <Small>{`${timeOf(m.startedAt)}${minutes(m) ? ` · ${minutes(m)} min` : ""}${m.from === "memo" ? " · a voice memo" : m.from === "phone" ? " · on the phone" : ""}${STATE[m.state] ? ` · ${STATE[m.state]}` : ""}`}</Small>
        </YStack>
        <Text fontSize={18} color="$color10">{open ? "−" : "+"}</Text>
      </XStack>
      {!open ? (m.summary ? <Small>{m.summary}</Small> : null) : (
        <YStack gap={10} marginTop={8}>
          {m.state === "failed" ? <Small color="$color8">{m.error ?? "It could not be written up."}</Small> : null}
          {m.summary ? (<YStack gap={4}>
            <Eyebrow>SUMMARY</Eyebrow>
            <Text fontSize={15} lineHeight={22} color="$color12">{m.summary}</Text>
            <ReadAloud id={`meeting-${m.id}`} paragraphs={[m.title, m.summary, ...m.actions.map((a) => `Action: ${a}`)]} ink={ink} />
          </YStack>) : null}
          {m.takeaways.length ? <YStack gap={4}><Eyebrow>TAKE-AWAYS</Eyebrow><Bullets items={m.takeaways} /></YStack> : null}
          {m.actions.length ? <YStack gap={4}><Eyebrow>ACTION ITEMS</Eyebrow><Bullets items={m.actions} /></YStack> : null}
          {m.daydream ? (<YStack gap={4}>
            <Eyebrow>{`${m.daemon || "ITS"} DAY-DREAM`}</Eyebrow>
            <Text fontSize={15} lineHeight={22} fontStyle="italic" color="$color11">{m.daydream}</Text>
            <ReadAloud id={`daydream-${m.id}`} paragraphs={[m.daydream]} ink={ink} />
          </YStack>) : null}
          {transcript ? (<YStack gap={4}>
            <Text fontFamily="$mono" fontSize={12} letterSpacing={2} color="$color10" cursor="pointer" onPress={() => setWords((w) => !w)}>
              {words ? "HIDE THE TRANSCRIPT" : "THE WHOLE TRANSCRIPT"}</Text>
            {words ? <Text fontSize={14} lineHeight={21} color="$color12">{transcript}</Text> : null}
          </YStack>) : null}
          <Small color="$color10">{m.audio ? "Its recording is kept on the companion for now." : "Its recording was cleared for space; the words stay."}</Small>
          <XStack gap={8} flexWrap="wrap">
            {m.state === "failed" && m.audio ? <Action label="TRY AGAIN" ink={ink} onPress={async () => { await api("/api/meeting/retry", { id: m.id }); reload(); }} /> : null}
            <Action label="FORGET IT" ink={ink} onPress={async () => { await api("/api/meeting/forget", { id: m.id }); reload(); }} />
          </XStack>
        </YStack>
      )}
    </Card>
  );
}

// C-199 (5): the notes said to the watch, newest first -- each its words, a goal made of it, or forgotten
type VoiceNote = { id: number; at: string; text: string; state: "hearing" | "done" | "failed"; error?: string };
function VoiceNotes({ ink }: { ink?: string }) {
  const [notes, setNotes] = useState<VoiceNote[] | null>(null), [n, setN] = useState(0), [said, setSaid] = useState("");
  const reload = () => setN((x) => x + 1);
  useEffect(() => { api<{ notes: VoiceNote[] }>("/api/voicenotes").then((r) => setNotes(r.notes)).catch(() => setNotes([])); }, [n]);
  useEffect(() => { if (!notes?.some((x) => x.state === "hearing")) return; const t = setTimeout(reload, 10000); return () => clearTimeout(t); }, [notes]);
  if (!notes?.length) return null;
  return (
    <Card>
      <Eyebrow>VOICE NOTES</Eyebrow>
      {said ? <Small>{said}</Small> : null}
      {notes.slice(0, 30).map((v) => (
        <YStack key={v.id} borderTopWidth={1} borderColor="$color5" paddingVertical={8} gap={4}>
          <Small color="$color10">{`${dayOf(v.at)}, ${timeOf(v.at)}${v.state === "hearing" ? " · Listening to it…" : ""}`}</Small>
          {v.state === "failed" ? <Small color="$color8">{v.error ?? "Not heard."}</Small> : null}
          {v.text ? <Text fontSize={15} lineHeight={22} color="$color12">{v.text}</Text> : null}
          <XStack gap={8} flexWrap="wrap">
            {v.state === "done" ? <Action label="MAKE IT A GOAL" ink={ink} onPress={async () => {
              await api("/api/goals", { title: v.text.slice(0, 40) }); setSaid("Added to your goals.");   // DRAFT
            }} /> : null}
            {v.state === "failed" ? <Action label="TRY AGAIN" ink={ink} onPress={async () => { await api("/api/voicenote/retry", { id: v.id }); reload(); }} /> : null}
            <Action label="FORGET IT" ink={ink} onPress={async () => { await api("/api/voicenote/forget", { id: v.id }); reload(); }} />
          </XStack>
        </YStack>
      ))}
    </Card>
  );
}

// C-316 (the user, 2026-11-10): a meeting started here, or a voice memo given -- sent whole to the hub, which cuts, hears
// and writes it up exactly as it does the watch's. The phone keeps recording with the screen locked; what cannot be sent
// now waits on the phone. Every word DRAFT.
const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
function NewMeeting({ ink, sent }: { ink?: string; sent: () => void }) {
  const recorder = useAudioRecorder(MEETING_RECORDING);
  const state = useAudioRecorderState(recorder, 500);
  const began = useRef(0);
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState<Waiting[]>(waiting());
  const after = (r: { id: number | null; why?: string }) => {
    setHeld(waiting());
    setSaid(r.id !== null ? "Sent. It is being heard now, and its write-up will be here." : `Kept on this phone to send later: ${r.why}`);
    sent();
  };
  const record = async () => {
    try {
      if (!(await requestRecordingPermissionsAsync()).granted) { setSaid("The microphone is not allowed: Settings → DAEMONS → Microphone."); return; }
      // on through the screen locking and the app put away (UIBackgroundModes audio is already held, C-277)
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: true, shouldPlayInBackground: true });
      await recorder.prepareToRecordAsync(); recorder.record(); began.current = Date.now(); setSaid("");
    } catch (e) { setSaid((e as Error).message); }
  };
  const stop = async (send: boolean) => {
    setBusy(true);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, allowsBackgroundRecording: false, shouldPlayInBackground: false });
      if (!send) { setSaid("Not kept."); return; }
      if (!recorder.uri) { setSaid("Nothing was recorded."); return; }
      setSaid("Sending it to the companion…");
      after(await sendOrKeep({ uri: recorder.uri, from: "phone", at: began.current }));
    } catch (e) { setSaid((e as Error).message); } finally { setBusy(false); }
  };
  const memo = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ["audio/*"], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      setBusy(true); setSaid(`Sending ${a.name} to the companion…`);
      after(await sendOrKeep({ uri: a.uri, from: "memo", name: a.name, at: 0, ...(a.lastModified ? { ended: a.lastModified } : {}) }));
    } catch (e) { setSaid((e as Error).message); } finally { setBusy(false); }
  };
  const again = async () => {
    setBusy(true); setSaid("Sending…");
    try { const r = await sendWaiting(); setHeld(waiting()); setSaid(r.left ? `${r.sent} sent; ${r.left} still waiting: ${r.why}` : `${r.sent} sent.`); sent(); }
    finally { setBusy(false); }
  };
  if (ALONE) return <Card><Small>{"Meetings are heard and written up by the companion on your computer: this phone, hosting alone, cannot.  DRAFT"}</Small></Card>;
  return (
    <Card>
      <Eyebrow>A MEETING</Eyebrow>
      {state.isRecording ? (<YStack gap={8}>
        <XStack gap={8} alignItems="center">
          <YStack width={12} height={12} borderRadius={6} backgroundColor="#e5534b" />
          <Text fontFamily="$mono" fontSize={16} fontWeight="700" letterSpacing={1} color="#e5534b">{`RECORDING  ${clock(state.durationMillis)}`}</Text>
        </XStack>
        <Small>{ON_PHONE ? "It keeps recording with the screen locked. Stop it when the meeting ends." : "Keep this page open until the meeting ends."}</Small>
        <XStack gap={8} flexWrap="wrap">
          <Action label={busy ? "SENDING…" : "STOP AND WRITE IT UP"} ink={ink} onPress={() => stop(true)} />
          <Action label="STOP, DON'T KEEP IT" ink={ink} onPress={() => stop(false)} />
        </XStack>
      </YStack>) : (<YStack gap={8}>
        <Small>{"Record one on this phone, or give it a voice memo: it is heard and written up as the watch's are -- the summary, take-aways, action items and your daemon's day-dream."}</Small>
        <XStack gap={8} flexWrap="wrap">
          <Action label="RECORD A MEETING" ink={ink} onPress={record} />
          <Action label={busy ? "SENDING…" : "FROM A VOICE MEMO"} ink={ink} onPress={memo} />
        </XStack>
        {ON_PHONE ? <Small color="$color10">{"A voice memo: in Voice Memos, ••• → Save to Files, then choose it here."}</Small> : null}
      </YStack>)}
      {held.length ? (<YStack gap={6} borderTopWidth={1} borderColor="$color5" paddingTop={8}>
        <Small>{`${held.length} waiting on this phone to be sent:`}</Small>
        {held.map((w) => (<XStack key={w.id} gap={8} alignItems="center" flexWrap="wrap">
          <YStack flex={1}><Small>{`${w.name ?? (w.at ? `${dayOf(new Date(w.at).toISOString())}, ${timeOf(new Date(w.at).toISOString())}` : "a recording")}`}</Small></YStack>
          <Action label="FORGET" ink={ink} onPress={() => { forgetWaiting(w.id); setHeld(waiting()); }} />
        </XStack>))}
        <Action label={busy ? "SENDING…" : "SEND THEM NOW"} ink={ink} onPress={again} />
      </YStack>) : null}
      {said ? <Small color="$color10">{said}</Small> : null}
    </Card>
  );
}

export function MeetingsScreen({ ink }: { ink?: string }) {
  const [list, setList] = useState<Meeting[] | null>(null);
  const [error, setError] = useState("");
  const [n, setN] = useState(0);
  const reload = () => setN((x) => x + 1);
  useEffect(() => { api<{ meetings: Meeting[] }>("/api/meeting/list").then((r) => setList(r.meetings)).catch((e) => setError(e.message)); }, [n]);
  useEffect(() => {                                          // while one is being heard or written, look again now and then
    if (!list?.some((m) => m.state !== "done" && m.state !== "failed")) return;
    const t = setTimeout(reload, 15000); return () => clearTimeout(t);
  }, [list]);
  if (error) return <Small color="$color8">{error}</Small>;
  if (!list) return null;
  if (!list.length) return (<YStack gap={14}><NewMeeting ink={ink} sent={reload} /><VoiceNotes ink={ink} />
    <Card><Small>{"No meetings yet. Record one above, give it a voice memo, or on the Ultra, HOURS → RECORD A MEETING; its write-up is here afterwards.  DRAFT"}</Small></Card></YStack>);
  const days: [string, Meeting[]][] = [];
  for (const m of list) { const d = dayOf(m.startedAt); const at = days.find(([x]) => x === d); if (at) at[1].push(m); else days.push([d, [m]]); }
  return (
    <YStack gap={14}>
      <NewMeeting ink={ink} sent={reload} />
      <VoiceNotes ink={ink} />
      {days.map(([day, ms]) => (
        <YStack key={day} gap={8}>
          <Text fontFamily="$mono" fontSize={12} letterSpacing={2} color="$color10">{day.toUpperCase()}</Text>
          {ms.map((m) => <MeetingCard key={m.id} m={m} ink={ink} reload={reload} />)}
        </YStack>
      ))}
    </YStack>
  );
}
