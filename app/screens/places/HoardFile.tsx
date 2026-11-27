// THE HOARD: one file's own page (C-596) -- it is looked at here (HoardLook.tsx), and SAVED or SHARED as the original.
// A text file can be READ ALOUD (C-603) in its own voice, your daemon's, or a daemon you pick; a picture can be MADE TO
// SPEAK; a picture, a recording or any creation can be ASKED (C-606). Its owner sees who it is shared with and until
// when, changes that, marks it PROTECTED (never cleaned up to make room) and removes it, behind a second tap. Someone
// else's says whose it is, and is never offered to be removed. Every word DRAFT.
import { useState } from "react";
import { Text, TextArea, XStack, YStack } from "tamagui";
import { looksOf, sizeSaid } from "../../../server/src/hoard/rules";
import { changeFile, make, notYet, onceOnly, removeFile, saveOriginal, type Held, type Making, type Voice } from "../../platform/hoard";
import { ON_PHONE } from "../../platform/net";
import { Action, Card, Choice, Eyebrow, Small, whenSaid } from "../../shared/ui/ui";
import { AskIt } from "./HoardAsk";
import { KIND_SAID } from "./HoardJobs";
import { Look, looksSaid, TextLook, useWay } from "./HoardLook";
import { Back, DaemonPick, Label, LinkOnce, ShareEditor, sharedSaid, sharingAsked, sharingLacks, sharingOf, type Sharing } from "./HoardParts";

const meta = (f: Held, k: string) => { const v = f.meta?.[k]; return typeof v === "string" ? v.trim() : ""; };
// whose voice a creation speaks in: a daemon's by its name, or its own, as the hub cast it
const voiceSaid = (f: Held) => { const by = meta(f, "by"), cast = meta(f, "persona"); return by && by !== "its own voice" ? `In ${by}'s voice.` : cast ? `In its own voice: ${cast}` : ""; };
// what each picture of a MAGIC VIDEO says, or the words of its song
function linesOf(f: Held): string[] {
  const song = (f.meta?.song as { lyrics?: unknown } | undefined)?.lyrics;
  if (typeof song === "string" && song.trim()) return [song.trim()];
  const scenes = Array.isArray(f.meta?.scenes) ? (f.meta.scenes as { phrase?: unknown; by?: unknown }[]) : [];
  return scenes.filter((s) => typeof s?.phrase === "string" && s.phrase).map((s) => `${typeof s.by === "string" && s.by && s.by !== "its own voice" ? `${s.by}: ` : ""}${s.phrase}`);
}

// a making asked for: queued with the hub's other JOBS, and said so
function useMaking(onJobs: () => void, ink: string) {
  const [busy, setBusy] = useState(false), [said, setSaid] = useState(""), [queued, setQueued] = useState(false);
  const ask = async (m: Making, what: string) => {
    if (busy) return;
    setBusy(true); setSaid(""); setQueued(false);
    try { await make(m); setQueued(true); }
    catch (e) { setSaid(notYet(e) ? `This hub cannot ${what} yet. Update it (the hub's deploy), then come back.` : (e as Error).message); }
    finally { setBusy(false); }
  };
  const after = (<>
    {queued ? <XStack gap={10} alignItems="center" flexWrap="wrap"><Small color="$color12">Asked for. It waits its turn in JOBS, and is kept in CREATIONS when it is made.</Small>
      <Action label="SEE THE JOBS ›" ink={ink} onPress={onJobs} /></XStack> : null}
    {said ? <Small color="$color8">{said}</Small> : null}
  </>);
  return { busy, ask, after };
}

type Reader = "auto" | "daemon" | "pick";
const READER: Record<Reader, string> = {
  auto: "A voice drafted from the text itself: who it sounds like it was written by.",
  daemon: `The daemon on ${ON_PHONE ? "this phone" : "this device"} reads it.`,
  pick: "One of your daemons reads it.",
};
// C-603: READ IT ALOUD
function ReadAloudCard({ f, ink, onJobs }: { f: Held; ink: string; onJobs: () => void }) {
  const [reader, setReader] = useState<Reader>("daemon"), [species, setSpecies] = useState<number | null>(null);
  const m = useMaking(onJobs, ink);
  const voice: Voice | null = reader === "pick" ? (species !== null ? `daemon:${species}` : null) : reader;
  return (
    <Card>
      <Eyebrow>READ IT ALOUD</Eyebrow>
      <Small>The hub reads this text aloud and keeps the reading. A very long text is read from its start, as far as one reading goes.</Small>
      <Label>IN WHOSE VOICE</Label>
      <Choice<Reader> value={reader} ink={ink} onPick={setReader} options={[["auto", "ITS OWN VOICE"], ["daemon", "YOUR DAEMON"], ["pick", "PICK A DAEMON"]]} />
      <Small color="$color10">{READER[reader]}</Small>
      {reader === "pick" ? <DaemonPick value={species} onPick={setSpecies} /> : null}
      {voice ? <Action label={m.busy ? "ASKING…" : "READ IT ALOUD"} ink={ink} onPress={() => m.ask({ kind: "spoken", of: f.id, voice }, "read a file aloud")} /> : null}
      {m.after}
    </Card>
  );
}
// C-577: MAKE IT SPEAK, a talking photo
function SpeakCard({ f, ink, onJobs }: { f: Held; ink: string; onJobs: () => void }) {
  const [words, setWords] = useState(""), [own, setOwn] = useState(true), [species, setSpecies] = useState<number | null>(null);
  const m = useMaking(onJobs, ink);
  const ready = own || species !== null;
  return (
    <Card>
      <Eyebrow>MAKE IT SPEAK</Eyebrow>
      <Small>The house's mind looks at this picture, writes what it would say if it were someone, finds it a voice, and makes a short video in which its mouth moves as it speaks.</Small>
      <TextArea value={words} onChangeText={setWords} maxLength={600} minHeight={70} fontSize={14} placeholder="Its words, if you want to choose them (or leave them to it)…"
                backgroundColor="$color1" borderColor="$color6" color="$color12" />
      <Label>IN WHOSE VOICE</Label>
      <Choice value={own} ink={ink} onPick={setOwn} options={[[true, "ITS OWN VOICE"], [false, "PICK A DAEMON"]]} />
      {!own ? <DaemonPick value={species} onPick={setSpecies} /> : null}
      {ready ? <Action label={m.busy ? "ASKING…" : "MAKE IT SPEAK"} ink={ink}
                       onPress={() => m.ask({ kind: "magic", of: f.id, ...(words.trim() ? { words: words.trim() } : {}), voice: own ? "auto" : `daemon:${species!}` }, "make a picture speak")} /> : null}
      {m.after}
    </Card>
  );
}

// its owner's: who it is shared with and until when, PROTECTED, and REMOVE behind a second tap
function OwnerCard({ f, ink, onChanged, onRemoved }: { f: Held; ink: string; onChanged: (f: Held) => void; onRemoved: () => void }) {
  const [editing, setEditing] = useState<Sharing | null>(null), [link, setLink] = useState<string | null>(null);
  const [sure, setSure] = useState(false), [said, setSaid] = useState("");
  const keep = async () => {
    if (!editing) return;
    const lacks = sharingLacks(editing);
    if (lacks) { setSaid(lacks); return; }
    const r = await changeFile(f.id, sharingAsked(editing));
    setLink(r.link ?? null); setEditing(null); setSaid(""); onChanged(r.file);
  };
  const protect = async (on: boolean) => { onChanged((await changeFile(f.id, { protected: on })).file); };
  const remove = async () => {
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 6000); return; }
    await removeFile(f.id); onRemoved();
  };
  return (
    <Card>
      <Eyebrow>IT IS YOURS</Eyebrow>
      <Small color="$color12">{`Shared with: ${sharedSaid(f)}`}</Small>
      <Small color="$color10">{f.how === "move" ? "It was moved here, so THE HOARD's may be the only copy." : "It was copied here: a backup."}</Small>
      {editing ? (<>
        <ShareEditor value={editing} onChange={setEditing} ink={ink} />
        <XStack gap={8} flexWrap="wrap">
          <Action label="KEEP IT SO" ink={ink} onPress={keep} />
          <Action label="NOT NOW" ink={ink} onPress={() => { setEditing(null); setSaid(""); }} />
        </XStack>
        {editing.share === "friend" ? <Small color="$color10">A new link is made, and any link from before stops opening it.</Small> : null}
      </>) : <Action label="CHANGE WHO IT IS SHARED WITH" ink={ink} onPress={() => { setLink(null); setEditing(sharingOf("me", f)); }} />}
      {link ? <LinkOnce path={link} friend={f.friend} ink={ink} /> : null}
      <Label>WHEN THE HOARD IS FULL</Label>
      <Choice value={f.protected} ink={ink} onPick={protect} options={[[true, "PROTECTED"], [false, "NOT PROTECTED"]]} />
      <Small color="$color10">{f.protected ? "It is never cleaned up to make room for a newer file." : "If THE HOARD is set to clear its oldest files when it is full, this may be one of them."}</Small>
      <Action label={sure ? "TAP AGAIN TO REMOVE IT" : "REMOVE IT FROM THE HOARD"} ink={ink} onPress={remove} />
      {sure ? <Small color="$color8">It is removed from every machine that holds it, and cannot be brought back.</Small> : null}
      {said ? <Small color="$color8">{said}</Small> : null}
    </Card>
  );
}

export function FileView({ f, all, ink, onBack, onChanged, onRemoved, onJobs, onOpen }:
  { f: Held; all: Held[]; ink: string; onBack: () => void; onChanged: (f: Held) => void; onRemoved: () => void; onJobs: () => void; onOpen: (id: string) => void }) {
  const looks = looksOf(f.mime), made = f.kind !== "file";
  const way = useWay(f, looks === "audio" || looks === "video" || looks === "image");
  const [saving, setSaving] = useState("");
  const from = made && f.of ? all.find((x) => x.id === f.of) ?? null : null;
  const save = async () => {
    setSaving("Fetching it from the quickest machine that holds it…");
    try { await saveOriginal(f, way.local); } finally { setSaving(""); }
  };
  return (
    <YStack gap={12}>
      <Back to={made ? "CREATIONS" : "THE HOARD"} onPress={onBack} />
      <Card>
        <Eyebrow>{made ? KIND_SAID[f.kind] ?? "A CREATION" : looksSaid(f).toUpperCase()}</Eyebrow>
        <Text fontSize={18} fontWeight="600" color="$color12">{f.name}</Text>
        <Small>{`${sizeSaid(f.size)} · ${f.mine ? "yours" : `${f.ownerName}'s`} · ${made ? "made" : "put in"} ${whenSaid(new Date(f.added).toISOString())}`}</Small>
        <Look f={f} way={way} ink={ink} />
        {meta(f, "question") ? <Small color="$color10">{`“${meta(f, "question")}”`}</Small> : null}
        {meta(f, "answer") || meta(f, "phrase") ? <Text fontSize={16} lineHeight={24} color="$color12">{meta(f, "answer") || meta(f, "phrase")}</Text> : null}
        {linesOf(f).map((line, i) => <Text key={i} fontSize={15} lineHeight={22} color="$color12">{line}</Text>)}
        {made && voiceSaid(f) ? <Small color="$color10">{voiceSaid(f)}</Small> : null}
        {f.kind === "spoken" && f.meta?.whole === false ? <Small color="$color10">It is long: only its first part was read aloud.</Small> : null}
        {from ? <Text fontFamily="$mono" fontSize={12} letterSpacing={1} color="$color9" cursor="pointer" role="link" onPress={() => onOpen(from.id)}>{`MADE FROM ${from.name.toUpperCase()} ›`}</Text> : null}
        {f.kind === "spoken" && from && looksOf(from.mime) === "text" ? (<><Label>ITS WORDS</Label><TextLook f={from} /></>)
          : f.kind === "spoken" && meta(f, "opening") ? <Small>{`It begins: “${meta(f, "opening")}…”`}</Small> : null}
        <Action label={saving ? "FETCHING…" : ON_PHONE ? "SAVE OR SHARE THE ORIGINAL" : "SAVE THE ORIGINAL"} ink={ink} onPress={save} />
        {saving ? <Small color="$color10">{saving}</Small> : null}
        {onceOnly(f) && !way.local ? <Small color="$color10">It can be downloaded once: saving it is that once.</Small> : null}
      </Card>
      {looks === "text" && !made ? <ReadAloudCard f={f} ink={ink} onJobs={onJobs} /> : null}
      {looks === "image" ? <SpeakCard f={f} ink={ink} onJobs={onJobs} /> : null}
      {looks === "image" || looks === "audio" || looks === "text" || made ? <AskIt f={f} answers={all.filter((x) => x.kind === "answer" && x.of === f.id)} ink={ink} onAnswered={() => onChanged(f)} /> : null}
      {f.mine ? <OwnerCard f={f} ink={ink} onChanged={onChanged} onRemoved={onRemoved} /> : (
        <Card>
          <Eyebrow>{`IT IS ${f.ownerName.toUpperCase()}'S`}</Eyebrow>
          <Small color="$color12">{`Shared with: ${sharedSaid(f)}`}</Small>
          <Small color="$color10">Only the one who put it here can change that, or remove it.</Small>
        </Card>
      )}
      <Small color="$color8">DRAFT</Small>
    </YStack>
  );
}
