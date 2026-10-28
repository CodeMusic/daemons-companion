// C-229, C-230 (the user, 2026-10-28, by multiple choice): ASK THE SUBTLE LAYER -- the GUIDE answers as REASON would, this
// book as INSTINCT would: one line from its nearest page, then a question back (the asking voice, printed faint, as the
// book prints it). TWO VOICES, its own entry ("one says a thing, the other asks what it means"), answers only in that
// asking voice, a turn at a time. Typed, or held and spoken on a phone; what it says is read aloud where the voice is.
// And TODAY'S QUESTION: one a day, set in the day's centre, word and note, the answer kept in a journal "with the day and
// the centre" (TRUE OR NOT). Answered by the companion (server/src/subtleask.ts), on a phone alone too. Every word DRAFT.
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { File } from "expo-file-system";
import { useEffect, useState } from "react";
import { Button, Text, XStack, YStack } from "tamagui";
import { api, apiLater, ON_PHONE } from "../net";
import { Entry, Small } from "../ui";
import { useVoice } from "./Daemon";

const C = { boards: "#1b0f1f", page: "#2c1c32", edge: "#4a3352", ink: "#f0e6f2", faint: "#9a86a0", pink: "#e07ad0" };   // the book's own
const mono = { fontFamily: "$mono" as const, letterSpacing: 2 };
type Said = { heard?: string; line?: string; back?: string; asking?: string; answer?: string; error?: string; audioBase64?: string | null };

function Tab({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return <Text {...mono} fontSize={12} color={on ? C.pink : C.faint} textDecorationLine={on ? "underline" : "none"} cursor="pointer" role="button"
               onPress={onPress}>{label}</Text>;
}

export function AskSubtle() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const speak = useVoice();
  const [mode, setMode] = useState<"ask" | "voices">("ask");
  const [q, setQ] = useState("");
  const [state, setState] = useState<"" | "listening" | "thinking">("");
  const [thread, setThread] = useState<Said[]>([]);              // TWO VOICES: the turns so far; ASK: the last answer
  const ask = async (b: Record<string, unknown>) => {
    setState("thinking");
    try {
      const r = await apiLater<Said>("/api/subtle/ask", { ...b, mode, turn: thread.length });
      setThread((t) => mode === "voices" ? [...t, r].slice(-6) : [r]); speak(r.audioBase64 ?? undefined);
    } catch (e) { setThread((t) => [...(mode === "voices" ? t : []), { error: (e as Error).message }]); }
    finally { setState(""); }
  };
  const typed = () => { const t = q.trim(); if (t && !state) { setQ(""); ask({ text: t }); } };
  const start = async () => {
    const ok = await requestRecordingPermissionsAsync();
    if (!ok.granted) { setThread([{ error: "The microphone is off for this app (Settings, then DAEMONS)." }]); return; }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync(); recorder.record(); setState("listening");
  };
  const stop = async () => {
    if (state !== "listening") return;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (!recorder.uri) { setState(""); return; }
    ask({ audioBase64: await new File(recorder.uri).base64(), audioMime: "audio/mp4" });
  };
  const choose = (m: "ask" | "voices") => { setMode(m); setThread([]); };
  return (
    <YStack backgroundColor={C.page} borderColor={C.edge} borderWidth={1} borderRadius={4} padding={16} gap={8}>
      <XStack gap={16} alignItems="center">
        <Tab on={mode === "ask"} label="ASK" onPress={() => choose("ask")} />
        <Tab on={mode === "voices"} label="TWO VOICES" onPress={() => choose("voices")} />
      </XStack>
      <Small color={C.faint}>{mode === "ask" ? "Ask it anything. It answers with a line from its pages, and a question back.  DRAFT"
                                             : "Say a thing. It answers only by asking what it means.  DRAFT"}</Small>
      {thread.map((s, i) => (
        <YStack key={i} gap={4}>
          {s.heard ? <Small color={C.faint}>{`“${s.heard}”`}</Small> : null}
          {s.line ? <Text fontSize={16} lineHeight={24} color={C.ink}>{s.line}</Text> : null}
          {s.back ? <Text fontSize={16} lineHeight={24} color={C.faint} fontStyle="italic">{s.back}</Text> : null}
          {s.asking ? <Text fontSize={16} lineHeight={24} color={C.faint} fontStyle="italic">{s.asking}</Text> : null}
          {s.error ? <Small color={C.faint}>{s.error}</Small> : null}
        </YStack>
      ))}
      <XStack gap={8} alignItems="center" flexWrap="wrap">
        <Entry value={q} onChange={setQ} onSubmit={typed} placeholder={mode === "ask" ? "What do you want to know?" : "Say a thing."} limit={120} />
        <Button size="$3" onPress={typed} disabled={!!state || !q.trim()} backgroundColor={C.pink}>
          <Text {...mono} fontSize={12} color={C.page}>{mode === "ask" ? "ASK" : "SAY"}</Text>
        </Button>
      </XStack>
      {ON_PHONE ? (
        <Button onPressIn={start} onPressOut={stop} disabled={state === "thinking"} borderColor={C.pink}
                backgroundColor={state === "listening" ? C.pink : C.page}>
          <Text {...mono} fontSize={12} color={state === "listening" ? C.page : C.pink}>
            {state === "listening" ? "LISTENING…" : state === "thinking" ? "TURNING ITS PAGES…" : "HOLD TO ASK ALOUD"}
          </Text>
        </Button>
      ) : state === "thinking" ? <Small color={C.faint}>Turning its pages…</Small> : null}
    </YStack>
  );
}

type Today = { held: boolean; question?: string; centre?: string; note?: string; word?: string; answer?: string | null };
type Kept = { date: string; question: string; answer: string; centre: string; note: string; card?: { keyword: string; side: string; shiny: boolean } };

export function TodaysQuestion() {
  const [t, setT] = useState<Today | null>(null);
  const [a, setA] = useState("");
  const [err, setErr] = useState("");
  const [journal, setJournal] = useState<Kept[] | null>(null);
  useEffect(() => { api<Today>("/api/subtle/today").then(setT).catch(() => {}); }, []);
  if (!t?.held || !t.question) return null;
  const keep = async () => {
    const x = a.trim();
    if (!x) return;
    try { await api("/api/subtle/today", { text: x }); setT({ ...t, answer: x }); setA(""); setErr(""); if (journal) openJournal(); }
    catch (e) { setErr((e as Error).message); }
  };
  const openJournal = () => api<{ entries: Kept[] }>("/api/subtle/journal").then((r) => setJournal(r.entries)).catch(() => {});
  return (
    <YStack backgroundColor={C.page} borderColor={C.edge} borderWidth={1} borderRadius={4} padding={16} gap={8}>
      <Text {...mono} fontSize={12} color={C.pink}>TODAY'S QUESTION</Text>
      <Text {...mono} fontSize={10} color={C.faint}>{`THE ${(t.centre ?? "").toUpperCase()} · ${t.note} · ${(t.word ?? "").toUpperCase()}`}</Text>
      <Text fontSize={17} lineHeight={25} color={C.ink}>{t.question}</Text>
      {t.answer ? <Text fontSize={15} lineHeight={22} color={C.faint} fontStyle="italic">{t.answer}</Text> : null}
      <XStack gap={8} alignItems="center" flexWrap="wrap">
        <Entry value={a} onChange={setA} onSubmit={keep} placeholder={t.answer ? "Answer again." : "What do you notice?"} limit={300} />
        <Button size="$3" onPress={keep} disabled={!a.trim()} backgroundColor={C.pink}>
          <Text {...mono} fontSize={12} color={C.page}>KEEP</Text>
        </Button>
      </XStack>
      {err ? <Small color={C.faint}>{err}</Small> : null}
      <Text {...mono} fontSize={11} color={C.pink} cursor="pointer" role="button" onPress={() => (journal ? setJournal(null) : openJournal())}>
        {journal ? "CLOSE THE JOURNAL" : "THE JOURNAL ›"}</Text>
      {journal?.map((k) => (
        <YStack key={k.date} gap={2} paddingTop={8} borderTopWidth={1} borderColor={C.edge}>
          <Text {...mono} fontSize={10} color={C.faint}>{`${k.date} · THE ${k.centre.toUpperCase()} · ${k.note}${k.card ? ` · ${k.card.keyword}${k.card.shiny ? " ✦" : ""}` : ""}`}</Text>
          <Text fontSize={14} lineHeight={20} color={C.faint}>{k.question}</Text>
          <Text fontSize={15} lineHeight={22} color={C.ink}>{k.answer}</Text>
        </YStack>
      ))}
    </YStack>
  );
}
