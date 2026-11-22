// C-433 (PRAXIS 6; the user, 2026-11-22, by multiple choice): RECIPES on JOURNEY -- typed in, or read from a recipe page's
// link (the hub reads its published ingredients and steps; checked here before it is kept). COOKED logs a meal: 3 ARETE,
// and the daemon eats with you (the same FEED as anywhere). A meal logged by mistake can be taken back that day
// (server/src/lifemanagement/recipes.ts). Every word DRAFT.
import { useState } from "react";
import { TextInput } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { api, ALONE } from "../../platform/net";
import { useApi } from "../../platform/useApi";
import { Action, Card, Entry, Eyebrow, Pending, Small } from "../../ui/ui";

type Recipe = { id: number; title: string; ingredients: string[]; steps: string[]; serves: string; minutes: number | null;
                source: string; note: string; cooked: { id: number; at: string }[] };
type View = { recipes: Recipe[]; recipe?: Recipe; fed?: { said: string } | null };
type Draft = { id?: number; title: string; ingredients: string; steps: string; serves: string; minutes: string; source: string };
const EMPTY: Draft = { title: "", ingredients: "", steps: "", serves: "", minutes: "", source: "" };
const paper = { fontSize: 15, color: "#1d2029", paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#fbfaf6" } as const;
const today = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const when = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

function Area({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (s: string) => void; placeholder: string; rows?: number }) {
  return (
    <YStack borderRadius={8} borderWidth={1} borderColor="$color6" overflow="hidden">
      <TextInput value={value} onChangeText={onChange} multiline placeholder={placeholder} placeholderTextColor="#8a8577"
                 style={{ ...paper, minHeight: rows * 22 + 20, textAlignVertical: "top", lineHeight: 22 }} />
    </YStack>
  );
}

function Editor({ start, ink, onDone }: { start: Draft; ink: string; onDone: (v: View | null) => void }) {
  const [d, setD] = useState<Draft>(start), [link, setLink] = useState(""), [said, setSaid] = useState(""), [reading, setReading] = useState(false);
  const set = (k: keyof Draft) => (v: string) => setD((x) => ({ ...x, [k]: v }));
  const read = async () => {
    setSaid(""); setReading(true);
    try {
      const r = await api<{ recipe: { title: string; ingredients: string[]; steps: string[]; serves: string; minutes: number; source: string } }>("/api/recipes/read", { url: link.trim() });
      const x = r.recipe;
      setD({ ...d, title: x.title, ingredients: x.ingredients.join("\n"), steps: x.steps.join("\n"), serves: x.serves, minutes: x.minutes ? String(x.minutes) : "", source: x.source });
      setSaid("Read. Check it, then KEEP IT.");
    } catch (e) { setSaid((e as Error).message); } finally { setReading(false); }
  };
  const keep = async () => {
    setSaid("");
    try { onDone(await api<View>("/api/recipes", { ...d, minutes: Number(d.minutes) || 0 })); } catch (e) { setSaid((e as Error).message); }
  };
  return (
    <Card gap={8}>
      <Eyebrow>{d.id ? "CHANGE THE RECIPE" : "A NEW RECIPE"}</Eyebrow>
      {!d.id && !ALONE ? (
        <YStack gap={6}>
          <Small color="$color10">From a recipe page</Small>
          <Entry value={link} onChange={setLink} onSubmit={read} placeholder="https://…" limit={400} />
          <Action label={reading ? "READING…" : "READ IT"} ink={ink} onPress={read} />
          <Small color="$color10">Or type it in:</Small>
        </YStack>
      ) : null}
      <Entry value={d.title} onChange={set("title")} onSubmit={() => {}} placeholder="its name" limit={80} />
      <Area value={d.ingredients} onChange={set("ingredients")} placeholder="the ingredients, one a line" />
      <Area value={d.steps} onChange={set("steps")} placeholder="the steps, one a line" rows={5} />
      <Entry value={d.serves} onChange={set("serves")} onSubmit={() => {}} placeholder="how many it serves" limit={40} />
      <Entry value={d.minutes} onChange={(t) => set("minutes")(t.replace(/[^0-9]/g, ""))} onSubmit={() => {}} placeholder="minutes in all" limit={4} />
      <XStack gap={8} flexWrap="wrap">
        <Action label="KEEP IT" ink={ink} onPress={keep} />
        <Action label="CANCEL" onPress={() => onDone(null)} />
      </XStack>
      {said ? <Small>{said}</Small> : null}
    </Card>
  );
}

function RecipeCard({ r, ink, open, onOpen, onView, onEdit }: { r: Recipe; ink: string; open: boolean; onOpen: () => void;
                      onView: (v: View) => void; onEdit: () => void }) {
  const [fed, setFed] = useState<string | null>(null), [said, setSaid] = useState("");
  const post = async (path: string, body: unknown) => {
    setSaid("");
    try { const v = await api<View>(path, body); onView(v); return v; } catch (e) { setSaid((e as Error).message); return null; }
  };
  const cook = async () => { const v = await post("/api/recipes/cooked", { id: r.id }); if (v) setFed(v.fed?.said || "A meal together. +3 ARETE."); };
  return (
    <Card gap={6}>
      <XStack onPress={onOpen} cursor="pointer" justifyContent="space-between" alignItems="center" gap={10} role="button" aria-expanded={open}>
        <YStack flex={1}>
          <Text fontSize={17} fontWeight="700" color="$color12">{r.title}</Text>
          <Small color="$color10">{[r.minutes ? `${r.minutes} min` : "", r.serves ? `serves ${r.serves}` : "",
                                    r.cooked.length ? `cooked ${r.cooked.length}×, last ${when(r.cooked[0].at)}` : "not cooked yet"].filter(Boolean).join(" · ")}</Small>
        </YStack>
        <Text fontSize={18} color="$color10">{open ? "−" : "+"}</Text>
      </XStack>
      {open ? (
        <YStack gap={8} marginTop={4}>
          {r.ingredients.length ? <YStack gap={2}><Eyebrow>INGREDIENTS</Eyebrow>
            {r.ingredients.map((l, i) => <Text key={i} fontSize={15} lineHeight={22} color="$color12">{`•  ${l}`}</Text>)}</YStack> : null}
          {r.steps.length ? <YStack gap={2}><Eyebrow>STEPS</Eyebrow>
            {r.steps.map((l, i) => <Text key={i} fontSize={15} lineHeight={22} color="$color12">{`${i + 1}.  ${l}`}</Text>)}</YStack> : null}
          {r.source ? <Small color="$color10">{`From ${r.source.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}`}</Small> : null}
          <XStack gap={8} flexWrap="wrap">
            <Action label="COOKED" ink={ink} onPress={cook} />
            <Action label="CHANGE" onPress={onEdit} />
            <Action label="TAKE IT OFF" onPress={() => post("/api/recipes/remove", { id: r.id })} />
          </XStack>
          {fed ? <Small color={ink}>{fed}</Small> : null}
          {r.cooked.filter((c) => today(c.at)).map((c) => (
            <XStack key={c.id} gap={8}><Small color="$color10">Cooked today</Small>
              <Text fontSize={12} color={ink} cursor="pointer" role="button" aria-label="Take back that meal"
                    onPress={() => post("/api/recipes/uncooked", { id: r.id, meal: c.id })}>UNDO</Text></XStack>
          ))}
          {said ? <Small>{said}</Small> : null}
        </YStack>
      ) : null}
    </Card>
  );
}

export function RecipesSection({ ink }: { ink: string }) {
  const [v, setV, error] = useApi<View>("/api/recipes");
  const [open, setOpen] = useState<number | null>(null), [editing, setEditing] = useState<Draft | null>(null);
  if (error) return <Card><Eyebrow>RECIPES</Eyebrow><Small>{error}</Small></Card>;
  if (!v) return <Pending title="RECIPES" height={[160, 140]} />;
  const done = (x: View | null) => { if (x) { setV(x); if (x.recipe) setOpen(x.recipe.id); } setEditing(null); };
  return (
    <YStack gap={14}>
      {editing ? <Editor start={editing} ink={ink} onDone={done} /> : (
        <Card gap={6}>
          <Eyebrow>RECIPES</Eyebrow>
          <Small>{v.recipes.length ? "A meal cooked is 3 ARETE, and your daemon eats with you." : "Nothing kept yet. Read one from a recipe page, or type one in. A meal cooked is 3 ARETE, and your daemon eats with you."}</Small>
          <Action label="A NEW RECIPE" ink={ink} onPress={() => setEditing(EMPTY)} />
        </Card>
      )}
      {v.recipes.map((r) => (
        <RecipeCard key={r.id} r={r} ink={ink} open={open === r.id} onOpen={() => setOpen(open === r.id ? null : r.id)} onView={setV}
                    onEdit={() => setEditing({ id: r.id, title: r.title, ingredients: r.ingredients.join("\n"), steps: r.steps.join("\n"),
                                              serves: r.serves, minutes: r.minutes ? String(r.minutes) : "", source: r.source })} />
      ))}
      <Small color="$color8">DRAFT</Small>
    </YStack>
  );
}
