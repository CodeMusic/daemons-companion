// C-212 (the user, 2026-10-28: "a (grouped by day) list of my meetings, see the summary, take-aways, action-items, and
// full transcript if needed"): every meeting the watch recorded, the newest day first -- each one's write-up, the
// daemon's day-dream of it (both readable aloud, C-208), and its whole transcript folded away until it is wanted. A
// meeting still being heard or written says so; one that failed can be tried again. Every word DRAFT.
import { useEffect, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { api } from "../net";
import { ReadAloud } from "../readAloud";
import { Action, Card, Eyebrow, Small } from "../ui";

type Meeting = { id: number; startedAt: string; endedAt: string | null; title: string; parts: (string | null)[];
                 state: "recording" | "hearing" | "writing" | "done" | "failed"; error?: string;
                 summary: string; takeaways: string[]; actions: string[]; daydream: string; daemon: string; audio: boolean };
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
          <Small>{`${timeOf(m.startedAt)}${minutes(m) ? ` · ${minutes(m)} min` : ""}${STATE[m.state] ? ` · ${STATE[m.state]}` : ""}`}</Small>
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
  if (!list.length) return (<YStack gap={14}><VoiceNotes ink={ink} />
    <Card><Small>{"No meetings yet. On the Ultra, HOURS → RECORD A MEETING, and its write-up is here afterwards.  DRAFT"}</Small></Card></YStack>);
  const days: [string, Meeting[]][] = [];
  for (const m of list) { const d = dayOf(m.startedAt); const at = days.find(([x]) => x === d); if (at) at[1].push(m); else days.push([d, [m]]); }
  return (
    <YStack gap={14}>
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
