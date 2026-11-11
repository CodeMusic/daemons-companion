// C-280 (1): THE HUB'S ENDPOINTS -- any OpenAI-compatible model the player names, kept on the hub, each one more mind in
// its chain: the Tiiny first, then these in the order given, then the house's boards, then n8n. A key is sent once and
// never shown again. Shown on the phone and the site alike (THE MIND card, Mind.tsx). Every word DRAFT.
import { useEffect, useState } from "react";
import { Input, Text, XStack, YStack } from "tamagui";
import { api } from "../../platform/net";
import { Action, Choice, Eyebrow, Small, useHeld } from "../../ui/ui";

type View = { id: string; name: string; url: string; model: string; keySet: boolean; home: boolean };
type Health = { id: string; ok: boolean; at: string; models: string[] };
type Settings = { endpoints?: View[]; health?: { endpoints?: Health[] } };
const BLANK = { id: "", url: "", key: "", model: "", name: "" };
const field = { backgroundColor: "$color1", borderColor: "$color6", color: "$color12", fontSize: 14 } as const;

export function HubEndpoints({ ink }: { ink: string }) {
  const [list, setList] = useState<View[] | null>(null);
  const [health, setHealth] = useState<Health[]>([]);
  const [f, setF] = useState(BLANK);
  const [note, setNote] = useState("");
  const take = (t: Settings) => { setList(t.endpoints ?? []); setHealth(t.health?.endpoints ?? []); };
  const [failed, setFailed] = useState(false);
  const read = () => api<Settings>("/api/talk/settings").then(take).catch(() => { setList(null); setFailed(true); });
  useEffect(() => { read(); }, []);
  const held = useHeld([399, 303]);   // C-344: its place in THE MIND held until the hub answers
  if (!list) return failed ? null : <YStack minHeight={held} />;

  const send = async (b: Record<string, unknown>, said: string) => {
    setNote("Asking the hub…");
    try { take(await api<Settings>("/api/talk/settings", b)); setNote(said); return true; }
    catch (err) { setNote((err as Error).message); return false; }
  };
  const keep = async () => {
    if (!f.url.trim()) { setNote("Its address first: a base ending in /v1."); return; }
    const { id, key, ...rest } = f;
    if (await send({ endpoint: { ...(id ? { id } : {}), ...rest, ...(key.trim() ? { key } : {}) } },
                   "Kept on the hub. Its key stays there and is never shown again; its dot says whether it answered.")) setF(BLANK);
  };
  const healthOf = (id: string) => health.find((h) => h.id === id);
  const editing = f.id ? healthOf(f.id) : undefined;

  return (
    <YStack gap={6}>
      <Eyebrow>THE HUB'S ENDPOINTS</Eyebrow>
      <Small>Any OpenAI-compatible model, asked by the hub: after the Tiiny, in this order, before the hub's boards. One at home stays inside the AT HOME ring.</Small>
      {list.length ? list.map((e, i) => {
        const h = healthOf(e.id);
        return (
          <XStack key={e.id} gap={8} alignItems="center" flexWrap="wrap">
            <YStack width={10} height={10} borderRadius={5} backgroundColor={!h ? "$color6" : h.ok ? "#3fb950" : "#e5534b"} />
            <Text fontFamily="$mono" fontSize={12} letterSpacing={1} color="$color12">{`${i + 1}. ${e.name}`}</Text>
            <Small color="$color10">{`${e.model || "its first model"} · ${e.home ? "at home" : "on the internet"}${e.keySet ? " · key kept" : ""}${h && !h.ok ? " · not answering" : ""}`}</Small>
            <XStack gap={6}>
              {i > 0 ? <Action label="↑" ink={ink} onPress={() => send({ moveEndpoint: { id: e.id, by: -1 } }, "")} /> : null}
              {i < list.length - 1 ? <Action label="↓" ink={ink} onPress={() => send({ moveEndpoint: { id: e.id, by: 1 } }, "")} /> : null}
              <Action label="CHANGE" ink={ink} onPress={() => { setF({ id: e.id, url: e.url, key: "", model: e.model, name: e.name }); setNote(""); }} />
              <Action label="FORGET" ink={ink} onPress={() => send({ forgetEndpoint: e.id }, `${e.name} forgotten, and its key with it.`)} />
            </XStack>
          </XStack>
        );
      }) : <Small color="$color10">None yet.</Small>}
      <Input value={f.url} onChangeText={(url) => setF({ ...f, url })} placeholder="its address, ending /v1" autoCapitalize="none" autoCorrect={false} keyboardType="url" {...field} />
      <XStack gap={6} flexWrap="wrap">
        <Input flexGrow={1} minWidth={140} value={f.key} onChangeText={(key) => setF({ ...f, key })} placeholder={f.id && list.find((e) => e.id === f.id)?.keySet ? "its key is kept" : "its key, if it needs one"}
               secureTextEntry autoCapitalize="none" autoCorrect={false} {...field} />
        <Input flexGrow={1} minWidth={140} value={f.model} onChangeText={(model) => setF({ ...f, model })} placeholder="its model (blank: its first)" autoCapitalize="none" autoCorrect={false} {...field} />
      </XStack>
      <Input value={f.name} onChangeText={(name) => setF({ ...f, name })} placeholder="a name for it" {...field} />
      {editing?.models.length ? <Choice value={f.model} ink={ink} options={editing.models.slice(0, 12).map((m) => [m, m] as [string, string])} onPick={(model) => setF({ ...f, model })} /> : null}
      <XStack gap={8} flexWrap="wrap">
        <Action label={f.id ? "KEEP THE CHANGE" : "ADD IT"} ink={ink} onPress={keep} />
        {f.id ? <Action label="NOT NOW" ink={ink} onPress={() => setF(BLANK)} /> : null}
        <Action label="LOOK AGAIN" ink={ink} onPress={read} />
      </XStack>
      {note ? <Small color="$color10">{note}</Small> : null}
    </YStack>
  );
}
