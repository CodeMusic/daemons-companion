// C-298: the JOURNAL, JOURNEY's second section -- several journals, each titled; entries with a title and the words;
// SUMMARIZE closing a chapter of what is new since the last one, written by the talk AI's background thinker (the Tiiny,
// thinking on) so it takes a while -- "check back later"; and each chapter's page exported or printed (page.ts).
// Every word here is DRAFT.
import { useCallback, useEffect, useRef, useState } from "react";
import { TextInput } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { api, ON_PHONE } from "../../platform/net";
import { useVoiceState, wholeVoice } from "../../platform/rendering";
import { VoiceButton } from "../../ui/voiceButton";
import { Action, Card, Entry, Eyebrow, Small, whenSaid } from "../../ui/ui";
import { exportPage, exportVoice, printPage, spanOf, spokenOf, type Page } from "./page";

type Row = { id: number; title: string; created: string; entries: number; last: string | null; waiting: number };
type JEntry = { id: number; title: string; body: string; at: string; edited: string | null };
type Chapter = { id: number; n: number; count: number; at: string; first: string; last: string; state: "writing" | "done" | "failed";
                 title: string; body: string; by: string; error: string | null };
type Journal = { id: number; title: string; created: string; entries: JEntry[]; chapters: Chapter[]; waiting: number;
                 limits: { journal: number; title: number; body: number } };

export const JOURNAL_WORDS = {   // DRAFT, every one
  eyebrow: "YOUR JOURNALS",
  none: "A journal is yours to keep: a title, then as many entries as you like. When a stretch of it is written, SUMMARIZE turns it into one page to print.",
  newHint: "a title, like: This autumn", make: "Start it",
  open: (n: number) => `${n} entr${n === 1 ? "y" : "ies"}`,
  back: "‹ All journals", rename: "Rename", remove: "Remove", removeSure: "Remove it, and every entry?", keep: "Keep",
  write: "NEW ENTRY", entryTitle: "a title (if you like)", entryBody: "What happened, what you noticed…", save: "Save entry", cancel: "Cancel",
  edit: "Edit", gone: "Remove", goneSure: "Remove this entry?",
  summarize: (n: number) => `Summarize ${n} new entr${n === 1 ? "y" : "ies"}`,
  nothingNew: "Everything here is summarized. Write more, and a new chapter waits.",
  chapters: "CHAPTERS", entries: "ENTRIES",
  writing: "Your daemon is thinking it through. A page like this takes a while -- check back later; it will be here.",
  failed: "It could not be written this time.", again: "Try again", plain: "Lay it out as written",
  export: "Export…", print: "Print", read: "Read", hide: "Hide",
  exportAs: "EXPORT AS", asPdf: "PDF page", asVoice: "Its voice (audio)", notYet: "Its voice: tap Hear it first, and it can be exported once made.",
  listen: { none: "○  Hear it", making: "Voice coming", ready: "●  Hear it", failed: "○  Try its voice again", stop: "■  Stop",
            makingHint: "Its voice is being made. You can leave -- it will be ready when you come back.",
            failedHint: "Its voice could not be made this time." },
  byPlain: "laid out as written", edited: "edited",
};
const W = JOURNAL_WORDS;
const paper = { color: "#1b1d22", fontSize: 16, paddingHorizontal: 12 } as const;

export function JournalSection({ ink }: { ink: string }) {
  const [rows, setRows] = useState<Row[] | null>(null), [open, setOpen] = useState<number | null>(null);
  const [title, setTitle] = useState(""), [said, setSaid] = useState("");
  const load = useCallback(() => { api<{ journals: Row[] }>("/api/journals").then((r) => setRows(r.journals)).catch((e) => setSaid(e.message)); }, []);
  useEffect(load, [load]);
  const make = async () => {
    if (!title.trim()) return;
    try { const j = await api<Journal>("/api/journal", { title }); setTitle(""); setOpen(j.id); } catch (e) { setSaid((e as Error).message); }
  };
  if (open != null) return <JournalPage id={open} ink={ink} onBack={() => { setOpen(null); load(); }} />;
  return (
    <Card>
      <Eyebrow>{W.eyebrow}</Eyebrow>
      {rows && !rows.length ? <Small>{W.none}</Small> : null}
      {(rows ?? []).map((r) => (
        <XStack key={r.id} alignItems="center" gap={10} paddingVertical={8} borderBottomWidth={1} borderBottomColor="$color4" cursor="pointer"
                onPress={() => setOpen(r.id)} role="button">
          <YStack flex={1}>
            <Text fontSize={16} fontWeight="600" color="$color12">{r.title}</Text>
            <Small>{`${W.open(r.entries)}${r.last ? ` · ${whenSaid(r.last)}` : ""}${r.waiting ? ` · ${r.waiting} new` : ""}`}</Small>
          </YStack>
          <Text fontSize={18} color="$color9">›</Text>
        </XStack>
      ))}
      <XStack gap={8} flexWrap="wrap" alignItems="center" marginTop={8}>
        <Entry value={title} onChange={setTitle} placeholder={W.newHint} limit={40} onSubmit={make} />
        <Action label={W.make} onPress={make} ink={ink} />
      </XStack>
      {said ? <Small color="$color9">{said}</Small> : null}
    </Card>
  );
}

function JournalPage({ id, ink, onBack }: { id: number; ink: string; onBack: () => void }) {
  const [j, setJ] = useState<Journal | null>(null), [said, setSaid] = useState("");
  const [writing, setWriting] = useState<JEntry | "new" | null>(null);
  const [naming, setNaming] = useState<string | null>(null), [sure, setSure] = useState(false);
  const [reading, setReading] = useState<number | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  const load = useCallback(() => api<Journal>(`/api/journal?id=${id}`).then(setJ).catch((e) => setSaid(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  const thinking = !!j?.chapters.some((c) => c.state === "writing");
  useEffect(() => { if (!thinking) return; const t = setInterval(load, 15_000); return () => clearInterval(t); }, [thinking, load]);   // check back
  const act = async (path: string, body: object) => {
    try { setSaid(""); const r = await api<Journal & { writing?: number }>(path, body); setJ(r); if (r.writing) setReading(r.writing); return r; }
    catch (e) { setSaid((e as Error).message); return null; }
  };
  if (!j) return <Card><Small>{said || "Loading…"}</Small></Card>;
  const pageOf = (c: Chapter): Page => ({ journal: j.title, n: c.n, title: c.title, body: c.body, first: c.first, last: c.last, count: c.count });
  const out = (f: (p: Page) => Promise<unknown>, c: Chapter) => f(pageOf(c)).catch((e) => setSaid((e as Error).message));
  return (
    <YStack gap={14}>
      <Card>
        <Text fontFamily="$mono" fontSize={12} color="$color10" cursor="pointer" onPress={onBack}>{W.back}</Text>
        {naming == null ? (
          <XStack alignItems="center" gap={10}>
            <Text flex={1} fontSize={22} fontWeight="700" color="$color12">{j.title}</Text>
            <Text fontFamily="$mono" fontSize={11} color="$color10" cursor="pointer" onPress={() => setNaming(j.title)}>{W.rename}</Text>
          </XStack>
        ) : (
          <XStack gap={8} flexWrap="wrap" alignItems="center">
            <Entry value={naming} onChange={setNaming} placeholder={W.newHint} limit={j.limits.journal}
                   onSubmit={() => act("/api/journal/rename", { id, title: naming }).then((r) => r && setNaming(null))} />
            <Action label={W.keep} onPress={() => act("/api/journal/rename", { id, title: naming }).then((r) => r && setNaming(null))} ink={ink} />
            <Action label={sure ? W.removeSure : W.remove} onPress={() => sure ? api("/api/journal/remove", { id }).then(onBack) : setSure(true)} />
            <Action label={W.cancel} onPress={() => { setNaming(null); setSure(false); }} />
          </XStack>
        )}
        {writing ? <EntryForm j={j} entry={writing === "new" ? null : writing} ink={ink}
                              onDone={(r) => { if (r) setJ(r); setWriting(null); }} />
                 : <XStack gap={8} flexWrap="wrap" marginTop={6}>
                     <Action label={`+ ${W.write}`} onPress={() => setWriting("new")} ink={ink} />
                     {j.waiting ? <Action label={W.summarize(j.waiting)} onPress={() => act("/api/journal/summarize", { journal: id })} /> : null}
                   </XStack>}
        {!j.waiting && j.entries.length ? <Small>{W.nothingNew}</Small> : null}
        {said ? <Small color="$color9">{said}</Small> : null}
      </Card>
      {j.chapters.length ? (
        <Card>
          <Eyebrow>{W.chapters}</Eyebrow>
          {j.chapters.map((c) => (
            <YStack key={c.id} paddingVertical={8} gap={4} borderBottomWidth={1} borderBottomColor="$color4">
              <XStack alignItems="center" gap={8}>
                <Text fontFamily="$mono" fontSize={12} fontWeight="700" color="$color11">{`CHAPTER ${c.n}`}</Text>
                <Text flex={1} fontSize={15} fontWeight="600" color="$color12" numberOfLines={1}>{c.state === "done" ? c.title : ""}</Text>
              </XStack>
              <Small>{`${spanOf(c)} · ${W.open(c.count)}${c.by === "plain" ? ` · ${W.byPlain}` : ""}`}</Small>
              {c.state === "writing" ? <Small>{W.writing}</Small> : null}
              {c.state === "failed" ? (
                <YStack gap={6}>
                  <Small color="$color9">{c.error || W.failed}</Small>
                  <XStack gap={8} flexWrap="wrap">
                    <Action label={W.again} onPress={() => act("/api/journal/again", { chapter: c.id })} ink={ink} />
                    <Action label={W.plain} onPress={() => act("/api/journal/plain", { journal: id, chapter: c.id })} />
                  </XStack>
                </YStack>
              ) : null}
              {c.state === "done" ? (
                <>
                  <XStack gap={8} flexWrap="wrap">
                    <Action label={reading === c.id ? W.hide : W.read} onPress={() => setReading(reading === c.id ? null : c.id)} ink={ink} />
                    <VoiceButton text={spokenOf(c)} words={W.listen} />
                    <Action label={W.export} onPress={() => ON_PHONE ? setExporting(exporting === c.id ? null : c.id) : out(exportPage, c)} />
                    <Action label={W.print} onPress={() => out(printPage, c)} />
                  </XStack>
                  {exporting === c.id ? <ExportChoice page={pageOf(c)} ink={ink} onDone={() => setExporting(null)} onFail={setSaid} /> : null}
                  {reading === c.id ? (
                    <YStack backgroundColor="#fbfaf6" borderRadius={6} borderWidth={1} borderColor="$color6" padding={16} gap={10} marginTop={4}>
                      <Text fontSize={19} fontWeight="700" color="#1b1d22">{c.title}</Text>
                      {c.body.split(/\n\s*\n/).map((p, i) => <Text key={i} fontSize={15} lineHeight={23} color="#1b1d22">{p.trim()}</Text>)}
                    </YStack>
                  ) : null}
                </>
              ) : null}
            </YStack>
          ))}
        </Card>
      ) : null}
      {j.entries.length ? (
        <Card>
          <Eyebrow>{W.entries}</Eyebrow>
          {j.entries.map((e) => <EntryRow key={e.id} e={e} onEdit={() => setWriting(e)}
                                          onRemove={() => act("/api/journal/entry/remove", { journal: id, id: e.id })} />)}
        </Card>
      ) : null}
    </YStack>
  );
}

// Export, generalized: every way this chapter has been made -- its page always, its voice once one is made
function ExportChoice({ page, ink, onDone, onFail }: { page: Page; ink: string; onDone: () => void; onFail: (s: string) => void }) {
  const spoken = spokenOf(page), state = useVoiceState(spoken);
  const go = (f: () => Promise<unknown>) => f().then(onDone, (e) => onFail((e as Error).message));
  return (
    <YStack gap={2} marginTop={4} padding={10} borderRadius={6} borderWidth={1} borderColor="$color6">
      <Eyebrow>{W.exportAs}</Eyebrow>
      <XStack gap={8} flexWrap="wrap">
        <Action label={W.asPdf} onPress={() => go(() => exportPage(page))} ink={ink} />
        {state === "ready" ? <Action label={W.asVoice} onPress={() => go(() => exportVoice(page, wholeVoice(spoken)!))} ink={ink} /> : null}
        <Action label={W.cancel} onPress={onDone} />
      </XStack>
      {state !== "ready" ? <Small>{state === "making" ? W.listen.makingHint : W.notYet}</Small> : null}
    </YStack>
  );
}

function EntryRow({ e, onEdit, onRemove }: { e: JEntry; onEdit: () => void; onRemove: () => void }) {
  const [more, setMore] = useState(false), [sure, setSure] = useState(false);
  const long = e.body.length > 220;
  return (
    <YStack paddingVertical={8} gap={3} borderBottomWidth={1} borderBottomColor="$color4">
      <XStack alignItems="center" gap={8}>
        <Text flex={1} fontSize={15} fontWeight="600" color="$color12">{e.title || whenSaid(e.at)}</Text>
        <Text fontFamily="$mono" fontSize={11} color="$color10" cursor="pointer" onPress={onEdit}>{W.edit}</Text>
        <Text fontFamily="$mono" fontSize={11} color={sure ? "$color9" : "$color10"} cursor="pointer"
              onPress={() => sure ? onRemove() : setSure(true)}>{sure ? W.goneSure : W.gone}</Text>
      </XStack>
      {e.title ? <Small>{`${whenSaid(e.at)}${e.edited ? ` · ${W.edited}` : ""}`}</Small> : null}
      <Text fontSize={14} lineHeight={21} color="$color11" cursor={long ? "pointer" : undefined} onPress={long ? () => setMore(!more) : undefined}>
        {long && !more ? `${e.body.slice(0, 220).trim()}…` : e.body}</Text>
    </YStack>
  );
}

function EntryForm({ j, entry, ink, onDone }: { j: Journal; entry: JEntry | null; ink: string; onDone: (r: Journal | null) => void }) {
  const [title, setTitle] = useState(entry?.title ?? ""), [body, setBody] = useState(entry?.body ?? ""), [said, setSaid] = useState("");
  const bodyRef = useRef<TextInput>(null);
  const save = async () => {
    if (!title.trim() && !body.trim()) return onDone(null);
    try { onDone(await api<Journal>("/api/journal/entry", { journal: j.id, id: entry?.id, title, body })); } catch (e) { setSaid((e as Error).message); }
  };
  return (
    <YStack gap={8} marginTop={6}>
      <YStack borderRadius={8} borderWidth={1} borderColor="$color6" overflow="hidden" backgroundColor="#fbfaf6">
        <TextInput value={title} onChangeText={setTitle} maxLength={j.limits.title} placeholder={W.entryTitle} placeholderTextColor="#8a8577"
                   returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => bodyRef.current?.focus()} autoFocus={!entry}
                   style={{ ...paper, fontWeight: "700", paddingVertical: 10, backgroundColor: "#ece6d6" }} />
        <TextInput ref={bodyRef} value={body} onChangeText={setBody} multiline maxLength={j.limits.body} placeholder={W.entryBody}
                   placeholderTextColor="#8a8577" style={{ ...paper, minHeight: 160, paddingVertical: 10, textAlignVertical: "top", lineHeight: 23 }} />
      </YStack>
      <XStack gap={8} flexWrap="wrap" alignItems="center">
        <Action label={W.save} onPress={save} ink={ink} />
        <Action label={W.cancel} onPress={() => onDone(null)} />
        <Text fontFamily="$mono" fontSize={11} color="$color8">{`${body.length}/${j.limits.body}`}</Text>
      </XStack>
      {said ? <Small color="$color9">{said}</Small> : null}
    </YStack>
  );
}
