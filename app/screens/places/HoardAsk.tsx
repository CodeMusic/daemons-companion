// C-606 (C-596): ASK IT -- a question put to a file: typed, or said while the button is held, as TALK is held
// (damagotchi/Daemon.tsx). The hub answers it as a job (the house's mind looks at the file, finds a voice for it and
// speaks), so while it is made three small dots say where it is -- thinking, finding its voice, speaking -- and then
// the answer is played, with its words, and can be played again. Every answer a file has given is kept in THE HOARD
// as a creation of its own, and listed under it. Nothing is spoken by the app: the answer's voice is made on the hub.
// Every word DRAFT.
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { useEffect, useState } from "react";
import { Button, Text, XStack, YStack } from "tamagui";
import { againJob, askAloud, askFile, fileOf, live, notYet, type Held } from "../../platform/hoard";
import { ON_PHONE } from "../../platform/net";
import { Action, Card, Entry, Eyebrow, Small, whenSaid } from "../../shared/ui/ui";
import { Look, useWay } from "./HoardLook";
import { Dots, stageOf, useJobs } from "./HoardParts";

const words = (f: Held, k: "question" | "answer") => String(f.meta?.[k] ?? "").trim();

// one answer: what was asked, what it said, and its voice (fetched only when it is to be heard)
function Answer({ a, ink, auto }: { a: Held; ink: string; auto?: boolean }) {
  const [hear, setHear] = useState(!!auto);
  const way = useWay(a, hear);
  return (
    <YStack gap={4} paddingVertical={8} borderTopWidth={1} borderColor="$color5">
      {words(a, "question") ? <Small color="$color10">{`“${words(a, "question")}”`}</Small> : null}
      <Text fontSize={16} lineHeight={24} color="$color12">{words(a, "answer") || "It answered aloud."}</Text>
      {hear ? <Look f={a} way={way} ink={ink} auto /> : <Action label="HEAR IT" ink={ink} onPress={() => setHear(true)} />}
      {!auto ? <Small color="$color8">{whenSaid(new Date(a.added).toISOString())}</Small> : null}
    </YStack>
  );
}

export function AskIt({ f, answers, ink, onAnswered }: { f: Held; answers: Held[]; ink: string; onAnswered: () => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const jobs = useJobs();
  const [text, setText] = useState("");
  const [state, setState] = useState<"" | "listening" | "sending">("");
  const [asked, setAsked] = useState<string | null>(null);      // the job this page is waiting on
  const [fresh, setFresh] = useState<Held | null>(null);        // its answer, once made
  const [said, setSaid] = useState("");
  const job = asked ? jobs.jobs.find((j) => j.id === asked) ?? null : null;
  const lacking = (e: unknown) => setSaid(notYet(e) ? "This hub cannot answer for a file yet. Update it (the hub's deploy), then ask again." : (e as Error).message);
  // made: its answer fetched from THE HOARD once, and the list above told there is one more
  useEffect(() => {
    if (job?.state !== "done" || !job.result || fresh?.id === job.result) return;
    let gone = false;
    fileOf(job.result).then((a) => { if (!gone) { setFresh(a); onAnswered(); } }).catch((e) => { if (!gone) setSaid((e as Error).message); });
    return () => { gone = true; };
  }, [job?.state, job?.result]);
  const ask = async () => {
    const t = text.trim();
    if (!t || state) return;
    setSaid(""); setFresh(null); setState("sending");
    try { setAsked((await askFile(f.id, t)).id); setText(""); } catch (e) { lacking(e); } finally { setState(""); }
  };
  const start = async () => {
    if (state) return;
    try {
      if (!(await requestRecordingPermissionsAsync()).granted) { setSaid(ON_PHONE ? "The microphone is off for this app (Settings, then DAEMONS)." : "The microphone is not allowed for this page."); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync(); recorder.record(); setSaid(""); setState("listening");
    } catch (e) { setSaid((e as Error).message); }
  };
  const stop = async () => {
    if (state !== "listening") return;
    setState("sending");
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!recorder.uri) return;
      setFresh(null);
      setAsked((await askAloud(f.id, recorder.uri)).id);
    } catch (e) { lacking(e); } finally { setState(""); }
  };
  const busy = !!job && live(job);
  const earlier = answers.filter((a) => a.id !== fresh?.id).sort((a, b) => b.added - a.added);
  return (
    <Card>
      <Eyebrow>ASK IT</Eyebrow>
      <Small>Ask this file something. The house's mind looks at it, finds a voice for it, and answers aloud.</Small>
      <XStack gap={8} alignItems="center" flexWrap="wrap">
        <Entry value={text} onChange={setText} onSubmit={ask} placeholder="Ask it something…" limit={300} />
        <Action label={state === "sending" ? "ASKING…" : "ASK"} ink={ink} onPress={ask} />
      </XStack>
      <Button onPressIn={start} onPressOut={stop} backgroundColor={state === "listening" ? "$color9" : "$color3"} borderColor="$color9"
              disabled={state === "sending" || busy} marginTop={4}>
        <Text color={state === "listening" ? ink : "$color12"} fontFamily="$mono" letterSpacing={1.5}>
          {state === "listening" ? "LISTENING…" : state === "sending" ? "SENDING…" : "HOLD TO ASK ALOUD"}
        </Text>
      </Button>
      {busy ? (<>
        <Dots at={stageOf(job!)} />
        {job!.state === "waiting" ? <Small color="$color10">Waiting its turn: the hub makes one thing at a time.</Small> : null}
      </>) : null}
      {job?.state === "failed" ? (<>
        <Small color="$color8">{`It could not answer: ${job.error || "the hub did not say why"}.`}</Small>
        <Action label="TRY AGAIN" ink={ink} onPress={() => againJob(job.id)} />
      </>) : null}
      {job?.state === "stopped" ? <Small color="$color10">Stopped before it answered.</Small> : null}
      {said ? <Small color="$color8">{said}</Small> : null}
      {fresh ? <><Dots at={2} /><Answer key={fresh.id} a={fresh} ink={ink} auto /></> : null}
      {earlier.length ? (
        <YStack marginTop={6}>
          <Eyebrow>WHAT IT HAS ANSWERED</Eyebrow>
          {earlier.map((a) => <Answer key={a.id} a={a} ink={ink} />)}
        </YStack>
      ) : null}
    </Card>
  );
}
