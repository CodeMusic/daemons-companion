// C-433 (PRAXIS 6; the user, 2026-11-22, by multiple choice: kinds, fields and ARETE first -- "ask me again after
// testing"): MINE on JOURNEY -- forms you make yourself. A form is its kinds, each with the fields you pick and what
// finishing one pays in ARETE (under a daily cap); a SPACE is made from a form and keeps its items; a form is SHARED to
// THE COMMONS as its shape alone, and a friend's TAKEN as your own (server/src/lifemanagement/myforms.ts). Every word DRAFT.
import { useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { api } from "../../platform/net";
import { useApi } from "../../platform/useApi";
import { Action, Card, Choice, Entry, Eyebrow, Pending, Small } from "../../ui/ui";

type FieldType = "text" | "long" | "number" | "date" | "rating" | "choice";
type MineField = { key?: string; title: string; type: FieldType; choices?: string[] | string };
type MineKind = { key?: string; title: string; fields: MineField[]; arete: number | string; cap: number | string };
type MineForm = { id: string; title: string; about: string; version: number; kinds: MineKind[]; from: string | null };
type Space = { id: string; title: string; form: string; formTitle: string; open: number; done: number };
type View = { forms: MineForm[]; spaces: Space[] };
type SpaceView = { id: string; title: string; kinds: { key: string; title: string; arete: number; fields: { key: string; title: string; type: FieldType; choices?: string[] }[] }[];
                   items: { id: string; kind: string; title: string; done: boolean; fields: Record<string, unknown> }[] };
type Shared = { n: number; title: string; about: string; sharedByName: string; uid: string };
const TYPES: [FieldType, string][] = [["text", "WORDS"], ["long", "A PAGE"], ["number", "NUMBER"], ["date", "DATE"], ["rating", "0-5"], ["choice", "CHOICE"]];

function FormEditor({ start, ink, onDone }: { start: MineForm | null; ink: string; onDone: (v: View | null) => void }) {
  const [title, setTitle] = useState(start?.title ?? ""), [about, setAbout] = useState(start?.about ?? "");
  const [kinds, setKinds] = useState<MineKind[]>(start?.kinds.map((k) => ({ ...k, fields: k.fields.map((f) => ({ ...f, choices: Array.isArray(f.choices) ? f.choices.join(", ") : f.choices })) }))
                                                ?? [{ title: "", fields: [], arete: 1, cap: 5 }]);
  const [said, setSaid] = useState("");
  const setKind = (i: number, k: Partial<MineKind>) => setKinds((ks) => ks.map((x, j) => (j === i ? { ...x, ...k } : x)));
  const setField = (i: number, f: number, v: Partial<MineField>) => setKind(i, { fields: kinds[i].fields.map((x, j) => (j === f ? { ...x, ...v } : x)) });
  const keep = async () => {
    setSaid("");
    try { onDone(await api<View>("/api/mine/form", { id: start?.id, title, about, kinds })); } catch (e) { setSaid((e as Error).message); }
  };
  return (
    <Card gap={8}>
      <Eyebrow>{start ? "CHANGE THE FORM" : "A NEW FORM"}</Eyebrow>
      <Entry value={title} onChange={setTitle} onSubmit={() => {}} placeholder="its name: Garden, Reading, Runs…" limit={40} />
      <Entry value={about} onChange={setAbout} onSubmit={() => {}} placeholder="what it is for (if you like)" limit={300} />
      {kinds.map((k, i) => (
        <YStack key={i} gap={6} padding={10} borderRadius={8} borderWidth={1} borderColor="$color6">
          <XStack justifyContent="space-between" alignItems="center"><Small color="$color10">{`A KIND OF THING`}</Small>
            {kinds.length > 1 ? <Text fontSize={12} color="$color9" cursor="pointer" role="button" onPress={() => setKinds((ks) => ks.filter((_, j) => j !== i))}>TAKE OUT</Text> : null}</XStack>
          <Entry value={k.title} onChange={(t) => setKind(i, { title: t })} onSubmit={() => {}} placeholder="Plant, Book, Run…" limit={40} />
          {k.fields.map((f, j) => (
            <YStack key={j} gap={4} marginLeft={10}>
              <XStack gap={6} alignItems="center">
                <YStack flex={1}><Entry value={f.title} onChange={(t) => setField(i, j, { title: t })} onSubmit={() => {}} placeholder="a field: Planted, Pages…" limit={40} /></YStack>
                <Text fontSize={12} color="$color9" cursor="pointer" role="button" onPress={() => setKind(i, { fields: k.fields.filter((_, x) => x !== j) })}>×</Text>
              </XStack>
              <Choice value={f.type} options={TYPES} onPick={(t) => setField(i, j, { type: t })} ink={ink} />
              {f.type === "choice" ? <Entry value={String(f.choices ?? "")} onChange={(t) => setField(i, j, { choices: t })} onSubmit={() => {}} placeholder="its choices, with commas" limit={300} /> : null}
            </YStack>
          ))}
          <Text fontSize={12} color="$color10" cursor="pointer" role="button" onPress={() => setKind(i, { fields: [...k.fields, { title: "", type: "text" }] })}>+ a field</Text>
          <Small color="$color10">Done, it earns</Small>
          <Entry value={String(k.arete)} onChange={(t) => setKind(i, { arete: t.replace(/[^0-9]/g, "") })} onSubmit={() => {}} placeholder="ARETE each" limit={2} />
          <Entry value={String(k.cap)} onChange={(t) => setKind(i, { cap: t.replace(/[^0-9]/g, "") })} onSubmit={() => {}} placeholder="at most a day" limit={3} />
          <Small color="$color8">ARETE each, and at most so many a day.</Small>
        </YStack>
      ))}
      <Text fontSize={12} color="$color10" cursor="pointer" role="button" onPress={() => setKinds((ks) => [...ks, { title: "", fields: [], arete: 1, cap: 5 }])}>+ another kind</Text>
      <XStack gap={8} flexWrap="wrap"><Action label="KEEP IT" ink={ink} onPress={keep} /><Action label="CANCEL" onPress={() => onDone(null)} /></XStack>
      {said ? <Small>{said}</Small> : null}
    </Card>
  );
}

function ItemAdder({ space, kind, ink, onView }: { space: string; kind: SpaceView["kinds"][number]; ink: string; onView: (v: SpaceView) => void }) {
  const [open, setOpen] = useState(false), [title, setTitle] = useState(""), [fields, setFields] = useState<Record<string, string>>({}), [said, setSaid] = useState("");
  if (!open) return <Action label={`+ ${kind.title.toUpperCase()}`} ink={ink} onPress={() => setOpen(true)} />;
  const add = async () => {
    const typed = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== "").map(([k, v]) => {
      const t = kind.fields.find((f) => f.key === k)?.type;
      return [k, t === "number" || t === "rating" ? Number(v) : v];
    }));
    try { onView(await api<SpaceView>("/api/mine/item", { space, kind: kind.key, title, fields: typed })); setOpen(false); setTitle(""); setFields({}); setSaid(""); }
    catch (e) { setSaid((e as Error).message); }
  };
  return (
    <YStack gap={6} padding={10} borderRadius={8} borderWidth={1} borderColor="$color6">
      <Small color="$color10">{`A NEW ${kind.title.toUpperCase()}`}</Small>
      <Entry value={title} onChange={setTitle} onSubmit={add} placeholder="its name" limit={200} />
      {kind.fields.map((f) => (
        f.type === "choice" && f.choices
          ? <YStack key={f.key} gap={4}><Small color="$color10">{f.title}</Small>
              <Choice value={fields[f.key] ?? ""} options={f.choices.map((c) => [c, c.toUpperCase()] as [string, string])} onPick={(c) => setFields((x) => ({ ...x, [f.key]: c }))} ink={ink} /></YStack>
          : <Entry key={f.key} value={fields[f.key] ?? ""} onChange={(t) => setFields((x) => ({ ...x, [f.key]: t }))} onSubmit={add}
                   placeholder={`${f.title}${f.type === "date" ? " (YYYY-MM-DD)" : f.type === "rating" ? " (0 to 5)" : f.type === "number" ? " (a number)" : ""}`} limit={f.type === "long" ? 2000 : 200} />
      ))}
      <XStack gap={8}><Action label="KEEP IT" ink={ink} onPress={add} /><Action label="CANCEL" onPress={() => setOpen(false)} /></XStack>
      {said ? <Small>{said}</Small> : null}
    </YStack>
  );
}

function SpacePage({ id, ink, onClose }: { id: string; ink: string; onClose: () => void }) {
  const [v, setV] = useApi<SpaceView>(`/api/mine/space?id=${encodeURIComponent(id)}`);
  if (!v) return <Pending title="A SPACE" height={200} />;
  const kindOf = (k: string) => v.kinds.find((x) => x.key === k);
  const shown = (it: SpaceView["items"][number]) => Object.entries(it.fields).filter(([, x]) => x !== "" && x != null)
    .map(([k, x]) => `${kindOf(it.kind)?.fields.find((f) => f.key === k)?.title ?? k}: ${x}`).join(" · ");
  return (
    <YStack gap={14}>
      <Card gap={8}>
        <Text fontSize={20} fontWeight="700" color="$color12">{v.title}</Text>
        <XStack gap={8} flexWrap="wrap">{v.kinds.map((k) => <ItemAdder key={k.key} space={v.id} kind={k} ink={ink} onView={setV} />)}</XStack>
        {v.items.length ? v.items.map((it) => (
          <XStack key={it.id} gap={10} alignItems="flex-start" paddingVertical={6} borderBottomWidth={1} borderColor="$color4">
            <YStack width={20} height={20} marginTop={2} borderRadius={4} borderWidth={1.5} borderColor={ink} backgroundColor={it.done ? ink : "transparent"}
                    cursor="pointer" role="checkbox" aria-checked={it.done} aria-label={`${it.title} done`}
                    onPress={async () => setV(await api<SpaceView>("/api/mine/item/done", { id: it.id, done: !it.done }))} />
            <YStack flex={1}>
              <Text fontSize={15} color={it.done ? "$color10" : "$color12"} textDecorationLine={it.done ? "line-through" : "none"}>{it.title}</Text>
              <Small color="$color10">{[kindOf(it.kind)?.title, shown(it)].filter(Boolean).join(" · ")}</Small>
            </YStack>
            <Text fontSize={12} color="$color9" cursor="pointer" role="button" aria-label={`Take ${it.title} out`}
                  onPress={async () => setV(await api<SpaceView>("/api/mine/item/remove", { id: it.id }))}>×</Text>
          </XStack>
        )) : <Small>Nothing in it yet.</Small>}
        <Action label="BACK" onPress={onClose} />
      </Card>
    </YStack>
  );
}

export function MineSection({ ink }: { ink: string }) {
  const [v, setV, error] = useApi<View>("/api/mine");
  const [shared] = useApi<{ linked: boolean; creations: Shared[] }>("/api/community?kind=form");
  const [editing, setEditing] = useState<MineForm | null | "new">(null), [space, setSpace] = useState<string | null>(null), [said, setSaid] = useState("");
  if (error) return <Card><Eyebrow>MINE</Eyebrow><Small>{error}</Small></Card>;
  if (!v) return <Pending title="MINE" height={[180, 160]} />;
  if (space) return <SpacePage id={space} ink={ink} onClose={() => { setSpace(null); api<View>("/api/mine").then(setV).catch(() => {}); }} />;
  if (editing) return <FormEditor start={editing === "new" ? null : editing} ink={ink} onDone={(x) => { if (x) setV(x); setEditing(null); }} />;
  const post = async (path: string, body: unknown, done?: string) => {
    setSaid("");
    try { const r = await api<View & { shared?: unknown }>(path, body); if (r.forms) setV(r); if (done) setSaid(done); } catch (e) { setSaid((e as Error).message); }
  };
  return (
    <YStack gap={14}>
      <Card gap={6}>
        <Eyebrow>MINE</Eyebrow>
        <Small>Forms you make yourself: the kinds of things you keep, the fields each has, and what finishing one earns.</Small>
        <Action label="A NEW FORM" ink={ink} onPress={() => setEditing("new")} />
      </Card>
      {v.spaces.map((s) => (
        <Card key={s.id} gap={4} cursor="pointer" role="button" onPress={() => setSpace(s.id)}>
          <Text fontSize={17} fontWeight="700" color="$color12">{s.title}</Text>
          <Small color="$color10">{`${s.formTitle} · ${s.open} open · ${s.done} done ›`}</Small>
        </Card>
      ))}
      {v.forms.length ? (
        <Card gap={8}>
          <Eyebrow>YOUR FORMS</Eyebrow>
          {v.forms.map((f) => (
            <YStack key={f.id} gap={4} paddingVertical={6} borderBottomWidth={1} borderColor="$color4">
              <Text fontSize={16} fontWeight="600" color="$color12">{f.title}</Text>
              <Small color="$color10">{`${f.kinds.map((k) => k.title).join(", ")} · version ${f.version}${f.from ? ` · from ${f.from}` : ""}`}</Small>
              <XStack gap={8} flexWrap="wrap">
                <Action label="MAKE A SPACE" ink={ink} onPress={() => post("/api/mine/space", { form: f.id })} />
                <Action label="CHANGE" onPress={() => setEditing(f)} />
                <Action label="SHARE" onPress={() => post("/api/mine/share", { id: f.id }, `${f.title} is on THE COMMONS for your friends' homes.`)} />
              </XStack>
            </YStack>
          ))}
        </Card>
      ) : null}
      {shared?.linked && shared.creations.length ? (
        <Card gap={8}>
          <Eyebrow>FORMS ON THE COMMONS</Eyebrow>
          {shared.creations.map((c) => (
            <XStack key={c.uid} gap={8} alignItems="center">
              <YStack flex={1}><Text fontSize={15} fontWeight="600" color="$color12">{c.title}</Text><Small color="$color10">{`${c.about} · from ${c.sharedByName}`}</Small></YStack>
              <Action label="TAKE IT" ink={ink} onPress={() => post("/api/mine/take", { n: c.n, from: c.sharedByName }, `${c.title} is yours now.`)} />
            </XStack>
          ))}
        </Card>
      ) : null}
      {said ? <Small>{said}</Small> : null}
      <Small color="$color8">DRAFT</Small>
    </YStack>
  );
}
