// C-454 (the user, 2026-11-21, by multiple choice; docs/RESEARCH.md): RESEARCH on JOURNEY, beside the JOURNAL -- a study
// with its field and hypothesis on top, an EXPERT (its system written from them, shown and yours to rewrite), its SOURCES
// (typed or pasted, a note, a link, or a file the companion at home keeps and reads), the TALK, and FINDINGS: yours, or the
// expert's proposed to KEEP or DECLINE. A finding kept is 2 ARETE. What the expert may draw in is ticked per study, all off
// until you turn it on, and each answer says what it read (server/src/lifemanagement/research.ts). Every word DRAFT.
import { useCallback, useEffect, useState } from "react";
import { Platform, TextInput } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { api, ALONE } from "../platform/net";
import { useApi } from "../platform/useApi";
import { Action, Card, Entry, Eyebrow, Pending, Small } from "../ui/ui";

type Row = { id: number; title: string; field: string; hypothesis: string; state: string; created: string;
             sources: number; asks: number; findings: number; proposed: number; last: string };
type Source = { id: number; sort: "text" | "note" | "link" | "file"; name: string; mime: string; size: number; url: string;
                blob: string | null; chars: number; preview: string; at: string };
type Ask = { id: number; ask: string; answer: string; read: string[]; at: string; by: string; state: "writing" | "answered" | "failed"; error: string | null };
type Finding = { id: number; text: string; from: number | null; at: string; kept: boolean; proposal: string | null };
type Study = Row & { system: string; draws: ("journal" | "goals")[]; sourcesList: Source[]; talk: Ask[]; kept: Finding[]; waiting: Finding[] };
type View = { studies: Row[]; study?: Study | null; read?: { chars: number; how: string } };

const STATE_SAID: Record<string, string> = { open: "OPEN", supported: "SUPPORTED", "not-supported": "NOT SUPPORTED", "set-aside": "SET ASIDE" };   // DRAFT
const DRAWS: [("journal" | "goals"), string][] = [["journal", "THE JOURNAL"], ["goals", "GOALS"]];   // DRAFT
const paper = { fontSize: 15, color: "#1d2029", paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#fbfaf6" } as const;
const when = (iso: string) => (iso ? new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" }) : "");

function Area({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (s: string) => void; placeholder: string; rows?: number }) {
  return (
    <YStack borderRadius={8} borderWidth={1} borderColor="$color6" overflow="hidden">
      <TextInput value={value} onChangeText={onChange} multiline placeholder={placeholder} placeholderTextColor="#8a8577"
                 style={{ ...paper, minHeight: rows * 22 + 20, textAlignVertical: "top", lineHeight: 22 }} />
    </YStack>
  );
}

// a picked file's bytes as base64: the browser's File on the site, the file on disk in the app
async function base64Of(a: DocumentPicker.DocumentPickerAsset): Promise<string> {
  const web = (a as unknown as { file?: Blob }).file;
  if (Platform.OS === "web" && web) {
    const bytes = new Uint8Array(await web.arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  return await (new File(a.uri) as unknown as { base64(): Promise<string> }).base64();
}

function NewStudy({ ink, onDone }: { ink: string; onDone: (v: View | null) => void }) {
  const [title, setTitle] = useState(""), [field, setField] = useState(""), [hypothesis, setHypothesis] = useState(""), [said, setSaid] = useState("");
  const keep = async () => {
    setSaid("");
    try { onDone(await api<View>("/api/research", { title, field, hypothesis })); } catch (e) { setSaid((e as Error).message); }
  };
  return (
    <Card gap={8}>
      <Eyebrow>A NEW STUDY</Eyebrow>
      <Entry value={title} onChange={setTitle} onSubmit={() => {}} placeholder="its name" limit={80} />
      <Entry value={field} onChange={setField} onSubmit={() => {}} placeholder="its field: sleep science, Jungian analysis…" limit={80} />
      <Area value={hypothesis} onChange={setHypothesis} placeholder="the hypothesis: one sentence you want to test" rows={2} />
      <Small color="$color10">An expert in that field is written from these two. You can read and change it once the study is made.</Small>
      <XStack gap={8} flexWrap="wrap">
        <Action label="BEGIN THE STUDY" ink={ink} onPress={keep} />
        <Action label="CANCEL" onPress={() => onDone(null)} />
      </XStack>
      {said ? <Small>{said}</Small> : null}
    </Card>
  );
}

function Expert({ s, ink, onView }: { s: Study; ink: string; onView: (v: View) => void }) {
  const [open, setOpen] = useState(false), [system, setSystem] = useState(s.system), [said, setSaid] = useState("");
  useEffect(() => setSystem(s.system), [s.system]);
  const post = async (b: Record<string, unknown>) => {
    setSaid("");
    try { onView(await api<View>("/api/research", { id: s.id, ...b })); } catch (e) { setSaid((e as Error).message); }
  };
  const tick = (d: "journal" | "goals") => post({ draws: s.draws.includes(d) ? s.draws.filter((x) => x !== d) : [...s.draws, d] });
  return (
    <Card gap={6}>
      <Eyebrow>THE EXPERT</Eyebrow>
      <Small color="$color10">{`A senior expert in ${s.field || "the study's field"} -- not your daemon.`}</Small>
      <Text fontSize={13} color="$color9" cursor="pointer" role="button" onPress={() => setOpen(!open)}>{open ? "HIDE WHAT IT IS TOLD" : "READ WHAT IT IS TOLD"}</Text>
      {open ? (
        <YStack gap={6}>
          <Area value={system} onChange={setSystem} placeholder="who the expert is" rows={6} />
          <XStack gap={8} flexWrap="wrap">
            <Action label="KEEP IT" ink={ink} onPress={() => post({ system })} />
            <Action label="WRITE IT AGAIN" onPress={() => post({ system: "" })} />
          </XStack>
        </YStack>
      ) : null}
      <Eyebrow>IT MAY READ</Eyebrow>
      <Small color="$color10">Nothing of yours until you tick it. Each answer says what it read.</Small>
      <XStack gap={8} flexWrap="wrap">
        {DRAWS.map(([d, label]) => (
          <XStack key={d} gap={6} alignItems="center" cursor="pointer" role="checkbox" aria-checked={s.draws.includes(d)} onPress={() => tick(d)}
                  borderWidth={1} borderColor={s.draws.includes(d) ? "$color9" : "$color6"} borderRadius={6} paddingHorizontal={10} paddingVertical={6}>
            <Text fontSize={13} color={s.draws.includes(d) ? "$color9" : "$color10"}>{`${s.draws.includes(d) ? "☑" : "☐"}  ${label}`}</Text>
          </XStack>
        ))}
      </XStack>
      {said ? <Small>{said}</Small> : null}
    </Card>
  );
}

function Sources({ s, ink, onView }: { s: Study; ink: string; onView: (v: View) => void }) {
  const [adding, setAdding] = useState<"" | "text" | "link">(""), [name, setName] = useState(""), [text, setText] = useState(""), [said, setSaid] = useState("");
  const post = async (path: string, b: Record<string, unknown>) => {
    setSaid("");
    try { const v = await api<View>(path, { study: s.id, ...b }); onView(v); return v; } catch (e) { setSaid((e as Error).message); return null; }
  };
  const keep = async () => {
    const v = await post("/api/research/source", adding === "link" ? { sort: "link", url: text.trim(), name } : { sort: "text", text, name });
    if (v) { setAdding(""); setName(""); setText(""); }
  };
  const file = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "text/*", "application/json"], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      setSaid(`Sending ${a.name} to the companion…`);
      const v = await post("/api/research/source/file", { name: a.name, mime: a.mimeType ?? "", data: await base64Of(a) });
      if (v?.read) setSaid(v.read.chars ? `Kept, and ${v.read.chars.toLocaleString()} characters read.` : "Kept, but its text could not be read here -- paste it as text too.");
    } catch (e) { setSaid((e as Error).message); }
  };
  return (
    <Card gap={6}>
      <Eyebrow>SOURCES</Eyebrow>
      {s.sourcesList.length ? s.sourcesList.map((x) => (
        <XStack key={x.id} gap={8} alignItems="flex-start">
          <YStack flex={1}>
            <Text fontSize={15} color="$color12">{x.name}</Text>
            <Small color="$color10">{[x.sort === "file" ? (x.mime || "a file") : x.sort === "link" ? x.url : x.sort === "note" ? "a note" : "text",
                                      x.chars ? `${x.chars.toLocaleString()} characters` : x.sort === "file" ? "its text not read" : "", when(x.at)].filter(Boolean).join(" · ")}</Small>
          </YStack>
          <Text fontSize={12} color="$color9" cursor="pointer" role="button" aria-label={`Take ${x.name} off`}
                onPress={() => post("/api/research/source/remove", { id: x.id })}>TAKE OFF</Text>
        </XStack>
      )) : <Small color="$color10">None yet. Paste text, keep a link, or send a file.</Small>}
      {adding ? (
        <YStack gap={6}>
          <Entry value={name} onChange={setName} onSubmit={() => {}} placeholder="its name (a paper, a page, my notes)" limit={120} />
          {adding === "link" ? <Entry value={text} onChange={setText} onSubmit={keep} placeholder="https://…" limit={400} />
            : <Area value={text} onChange={setText} placeholder="paste or type it here" rows={6} />}
          <XStack gap={8}><Action label="KEEP IT" ink={ink} onPress={keep} /><Action label="CANCEL" onPress={() => setAdding("")} /></XStack>
        </YStack>
      ) : (
        <XStack gap={8} flexWrap="wrap">
          <Action label="PASTE TEXT" ink={ink} onPress={() => setAdding("text")} />
          <Action label="A LINK" onPress={() => setAdding("link")} />
          {!ALONE ? <Action label="A FILE" onPress={file} /> : null}
        </XStack>
      )}
      {said ? <Small>{said}</Small> : null}
    </Card>
  );
}

function Talk({ s, ink, onView }: { s: Study; ink: string; onView: (v: View) => void }) {
  const [text, setText] = useState(""), [said, setSaid] = useState("");
  const post = async (path: string, b: Record<string, unknown>) => {
    setSaid("");
    try { const v = await api<View>(path, { study: s.id, ...b }); onView(v); return v; } catch (e) { setSaid((e as Error).message); return null; }
  };
  const send = async () => { if (text.trim() && await post("/api/research/ask", { text })) setText(""); };
  return (
    <Card gap={8}>
      <Eyebrow>THE TALK</Eyebrow>
      {s.talk.length ? null : <Small color="$color10">Ask the expert what would support the hypothesis, what would count against it, or what your sources show.</Small>}
      {s.talk.map((a) => (
        <YStack key={a.id} gap={4}>
          <Text fontSize={14} fontWeight="700" color="$color12">{a.ask}</Text>
          {a.state === "writing" ? <Small color="$color10">The expert is thinking… (it can take a few minutes; this page checks back)</Small>
            : a.state === "failed" ? (
              <XStack gap={8} alignItems="center"><Small>{a.error ?? "No answer came."}</Small>
                <Text fontSize={12} color="$color9" cursor="pointer" role="button" onPress={() => post("/api/research/again", { id: a.id })}>ASK AGAIN</Text></XStack>)
            : (
              <YStack gap={2}>
                <Text fontSize={15} lineHeight={22} color="$color12">{a.answer}</Text>
                <Small color="$color8">{`${a.read.length ? `It read: ${a.read.join("; ")}` : "It read nothing of yours"}${a.by ? ` · ${a.by}` : ""}`}</Small>
              </YStack>)}
        </YStack>
      ))}
      {ALONE ? <Small color="$color10">The expert answers through the companion at home; this phone, hosting alone, cannot.</Small> : (
        <YStack gap={6}>
          <Area value={text} onChange={setText} placeholder="ask the expert" rows={2} />
          <Action label="ASK" ink={ink} onPress={send} />
        </YStack>
      )}
      {said ? <Small>{said}</Small> : null}
    </Card>
  );
}

function Findings({ s, ink, onView }: { s: Study; ink: string; onView: (v: View) => void }) {
  const [text, setText] = useState(""), [said, setSaid] = useState("");
  const post = async (path: string, b: Record<string, unknown>) => {
    setSaid("");
    try { const v = await api<View>(path, { study: s.id, ...b }); onView(v); return v; } catch (e) { setSaid((e as Error).message); return null; }
  };
  return (
    <Card gap={6}>
      <Eyebrow>FINDINGS</Eyebrow>
      {s.waiting.map((f) => (
        <YStack key={f.proposal ?? f.text} gap={2} borderLeftWidth={3} borderColor="$color9" paddingLeft={8}>
          <Text fontSize={15} color="$color12">{f.text}</Text>
          <XStack gap={14}>
            <Small color="$color10">The expert proposes this.</Small>
            <Text fontSize={12} color="$color9" cursor="pointer" role="button" onPress={() => post("/api/research/finding/decide", { proposal: f.proposal, keep: true })}>KEEP IT</Text>
            <Text fontSize={12} color="$color10" cursor="pointer" role="button" onPress={() => post("/api/research/finding/decide", { proposal: f.proposal, keep: false })}>DECLINE</Text>
          </XStack>
        </YStack>
      ))}
      {s.kept.map((f) => (
        <XStack key={f.id} gap={8} alignItems="flex-start">
          <Text flex={1} fontSize={15} lineHeight={22} color="$color12">{`•  ${f.text}`}</Text>
          <Text fontSize={12} color="$color8" cursor="pointer" role="button" onPress={() => post("/api/research/finding/remove", { id: f.id })}>TAKE OFF</Text>
        </XStack>
      ))}
      {!s.waiting.length && !s.kept.length ? <Small color="$color10">A finding kept is 2 ARETE. A hypothesis not supported is a finding too.</Small> : null}
      <Area value={text} onChange={setText} placeholder="a finding of your own" rows={2} />
      <Action label="KEEP THIS FINDING" ink={ink} onPress={async () => { if (await post("/api/research/finding", { text })) setText(""); }} />
      {said ? <Small>{said}</Small> : null}
    </Card>
  );
}

function StudyPage({ id, ink, onBack, onList }: { id: number; ink: string; onBack: () => void; onList: (rows: Row[]) => void }) {
  const [s, setS] = useState<Study | null>(null), [error, setError] = useState("");
  const load = useCallback(() => api<View>(`/api/research/study?id=${id}`).then((v) => { setS(v.study ?? null); onList(v.studies); }, (e) => setError((e as Error).message)), [id, onList]);
  useEffect(() => { load(); }, [load]);
  const thinking = !!s?.talk.some((a) => a.state === "writing");
  useEffect(() => { if (!thinking) return; const t = setInterval(load, 10_000); return () => clearInterval(t); }, [thinking, load]);   // check back
  const onView = (v: View) => { if (v.study) setS(v.study); onList(v.studies); };
  if (error) return <Card><Small>{error}</Small><Action label="BACK" onPress={onBack} /></Card>;
  if (!s) return <Pending title="RESEARCH" height={[200, 160]} />;
  const state = async (to: string) => onView(await api<View>("/api/research/state", { id: s.id, state: to }));
  return (
    <YStack gap={14}>
      <Card gap={6}>
        <Text fontSize={12} color="$color9" cursor="pointer" role="button" onPress={onBack}>‹ EVERY STUDY</Text>
        <Text fontSize={19} fontWeight="700" color="$color12">{s.title}</Text>
        <Small color="$color10">{[s.field, STATE_SAID[s.state] ?? s.state, `begun ${when(s.created)}`].filter(Boolean).join(" · ")}</Small>
        <Eyebrow>THE HYPOTHESIS</Eyebrow>
        <Text fontSize={16} lineHeight={23} fontStyle="italic" color="$color12">{s.hypothesis}</Text>
        <XStack gap={8} flexWrap="wrap">
          {Object.entries(STATE_SAID).filter(([k]) => k !== s.state).map(([k, label]) => <Action key={k} label={label} onPress={() => state(k)} />)}
        </XStack>
      </Card>
      <Expert s={s} ink={ink} onView={onView} />
      <Sources s={s} ink={ink} onView={onView} />
      <Talk s={s} ink={ink} onView={onView} />
      <Findings s={s} ink={ink} onView={onView} />
      <Action label="TAKE THIS STUDY OFF" onPress={async () => { onList((await api<View>("/api/research/remove", { id: s.id })).studies); onBack(); }} />
      <Small color="$color8">DRAFT</Small>
    </YStack>
  );
}

let keptStudy: number | null = null;                                 // the study you left open, while the app is open
export function ResearchSection({ ink }: { ink: string }) {
  const [v, setV, error] = useApi<View>("/api/research");
  const [open, setOpen] = useState<number | null>(keptStudy), [making, setMaking] = useState(false);
  const pick = (id: number | null) => { keptStudy = id; setOpen(id); };
  const onList = useCallback((studies: Row[]) => setV({ studies }), [setV]);
  if (error) return <Card><Eyebrow>RESEARCH</Eyebrow><Small>{error}</Small></Card>;
  if (!v) return <Pending title="RESEARCH" height={[160, 140]} />;
  if (open != null) return <StudyPage id={open} ink={ink} onBack={() => pick(null)} onList={onList} />;
  return (
    <YStack gap={14}>
      {making ? <NewStudy ink={ink} onDone={(x) => { setMaking(false); if (x) { setV({ studies: x.studies }); if (x.study) pick(x.study.id); } }} /> : (
        <Card gap={6}>
          <Eyebrow>RESEARCH</Eyebrow>
          <Small>{v.studies.length ? "Your studies, the latest first." : "A study tests one hypothesis with an expert in its field, from sources you give it -- and, only if you tick them, your journal and GOALS."}</Small>
          <Action label="A NEW STUDY" ink={ink} onPress={() => setMaking(true)} />
        </Card>
      )}
      {v.studies.map((r) => (
        <Card key={r.id} gap={4} onPress={() => pick(r.id)} cursor="pointer" role="button">
          <Text fontSize={17} fontWeight="700" color="$color12">{r.title}</Text>
          <Text fontSize={14} fontStyle="italic" color="$color11" numberOfLines={2}>{r.hypothesis}</Text>
          <Small color="$color10">{[r.field, STATE_SAID[r.state] ?? r.state, `${r.sources} source${r.sources === 1 ? "" : "s"}`,
                                    `${r.findings} finding${r.findings === 1 ? "" : "s"}`, r.proposed ? `${r.proposed} proposed` : ""].filter(Boolean).join(" · ")}</Small>
        </Card>
      ))}
      <Small color="$color8">DRAFT</Small>
    </YStack>
  );
}
