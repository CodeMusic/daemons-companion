// C-307 (the user, 2026-11-08): THE MIND -- every mind this phone can reach, seen as one: each arm with its dot, the
// ring for each kind of work, and AN ENDPOINT of the player's own, called from this phone (C-280 (3)). Replaces C-280's
// THIS PHONE'S MIND toggle. Every word DRAFT.
import { useEffect, useState } from "react";
import { Input, Text, XStack, YStack } from "tamagui";
import { RINGS, ringOf, sense, setRing, type Kind, type Ring, type Sense } from "../../platform/mesh";
import { endpoint, endpointModels, endpointThink, forgetEndpoint, keepEndpoint } from "../../platform/endpoint";
import { api, ON_PHONE } from "../../platform/net";
import { Action, Card, Choice, Eyebrow, Small } from "../../ui/ui";

const RING_SAID: Record<Ring, string> = { anywhere: "ANYWHERE", home: "AT HOME", phone: "THIS PHONE" };
const KIND_SAID: Record<Kind, string> = { talk: "TALK", guide: "THE GUIDE" };

function Arm({ name, ok, note }: { name: string; ok: boolean | null; note: string }) {
  return (
    <XStack gap={8} alignItems="center">
      <YStack width={10} height={10} borderRadius={5} backgroundColor={ok === null ? "$color6" : ok ? "#3fb950" : "#e5534b"} />
      <Text fontFamily="$mono" fontSize={12} letterSpacing={1} color="$color12" width={110}>{name}</Text>
      <Small color="$color10">{note}</Small>
    </XStack>
  );
}

export function MindCard({ ink }: { ink: string }) {
  const [s, setS] = useState<Sense | null>(null);
  const [rings, setRings] = useState<Record<Kind, Ring> | null>(null);
  const [dream, setDream] = useState<"anywhere" | "home" | null>(null);
  const [e, setE] = useState<{ url: string; model: string; name: string; key: string; keySet: boolean } | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const look = async (fresh = false) => {
    setS(await sense(fresh));
    const got = await endpoint();
    setE(got ? { url: got.url, model: got.model, name: got.name, key: "", keySet: got.keySet } : { url: "", model: "", name: "", key: "", keySet: false });
  };
  useEffect(() => {
    if (!ON_PHONE) return;
    look();
    Promise.all([ringOf("talk"), ringOf("guide")]).then(([talk, guide]) => setRings({ talk, guide }));
    api<{ rings?: { dream?: "anywhere" | "home" } }>("/api/talk/settings").then((t) => setDream(t.rings?.dream ?? "anywhere")).catch(() => {});
  }, []);
  if (!ON_PHONE || !s || !rings || !e) return null;

  const pick = async (k: Kind, r: Ring) => { await setRing(k, r); setRings({ ...rings, [k]: r }); };
  const pickDream = async (r: "anywhere" | "home") => {
    try { await api("/api/talk/settings", { rings: { dream: r } }); setDream(r); } catch (err) { setNote((err as Error).message); }
  };
  const keep = async () => {
    if (!e.url.trim()) { setNote("Its address first: a base ending in /v1."); return; }
    await keepEndpoint(e, e.key); setNote("Kept on this phone. The key is in its Keychain, never sent to the hub."); await look(true);
  };
  const list = async () => { try { await keepEndpoint(e, e.key); setModels(await endpointModels()); setNote(""); } catch (err) { setNote((err as Error).message); } };
  const test = async () => {
    setNote("Asking…");
    try { await keepEndpoint(e, e.key); setNote(`It answered: “${await endpointThink("Answer in five words or fewer.", [], "Say hello.", 20_000)}”`); }
    catch (err) { setNote((err as Error).message); }
  };
  const forget = async () => { await forgetEndpoint(); setModels([]); setNote("Forgotten."); await look(true); };

  const hubNote = !s.hub.there ? "out of reach"
    : `answering first: ${s.hub.first === "tiiny" ? "the Tiiny" : s.hub.first === "module" ? "its board" : "n8n"}` +
      `${s.hub.tiiny ? " · Tiiny ●" : ""}${s.hub.module ? " · board ●" : ""}${s.hub.n8n ? " · n8n ●" : ""}`;
  return (
    <Card borderLeftWidth={6} borderLeftColor="$color9">
      <Eyebrow>THE MIND</Eyebrow>
      <Small>Your daemon thinks with every mind it can reach, as one: the strongest answers, and if it is slow this phone answers instead. It hears on the phone where it can, so only words travel.</Small>
      <YStack gap={6} paddingVertical={4}>
        <Arm name="THIS PHONE" ok={s.phone.mind} note={s.phone.mind ? "thinks, hears and speaks here" : s.phone.hear ? `hears here; cannot think: ${s.phone.why ?? "needs Apple Intelligence"}` : "not in this build"} />
        <Arm name="THE HUB" ok={s.hub.there} note={hubNote} />
        <Arm name="ENDPOINT" ok={s.endpoint.set ? true : null} note={s.endpoint.set ? `${s.endpoint.name} · ${s.endpoint.model || "no model"} · ${s.endpoint.home ? "at home" : "on the internet"}` : "none set"} />
      </YStack>
      <Action label="LOOK AGAIN" ink={ink} onPress={() => look(true)} />

      <Eyebrow>HOW FAR EACH MAY GO</Eyebrow>
      <Small>ANYWHERE: every mind. AT HOME: nothing leaves your house -- this phone, the hub, the Tiiny, an endpoint at home. THIS PHONE: nothing leaves the phone.</Small>
      {(Object.keys(RINGS) as Kind[]).map((k) => (
        <YStack key={k} gap={4}>
          <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color="$color10">{KIND_SAID[k]}</Text>
          <Choice value={rings[k]} ink={ink} options={RINGS[k].map((r) => [r, RING_SAID[r]] as [Ring, string])} onPick={(r) => pick(k, r)} />
        </YStack>
      ))}
      {dream ? (
        <YStack gap={4}>
          <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color="$color10">DREAMS</Text>
          <Choice value={dream} ink={ink} options={[["anywhere", "ANYWHERE"], ["home", "AT HOME"]]} onPick={pickDream} />
        </YStack>
      ) : null}
      <Small color="$color10">The GUIDE and dreams are kept on the hub, so they cannot be thought on this phone alone. The JOURNAL is always written at home.</Small>
      {rings.talk === "phone" && !s.phone.mind ? <Small color="$color8">{`This phone cannot think for itself (${s.phone.why ?? "it needs iOS 26 and Apple Intelligence"}), so TALK will not answer here.`}</Small> : null}

      <Eyebrow>AN ENDPOINT OF YOUR OWN</Eyebrow>
      <Small>Any OpenAI-compatible model, asked by this phone itself -- so your daemon can talk with no hub at all.</Small>
      <Input value={e.url} onChangeText={(url) => setE({ ...e, url })} placeholder="its address, ending /v1" autoCapitalize="none" autoCorrect={false} keyboardType="url"
             backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={14} />
      <XStack gap={6} flexWrap="wrap">
        <Input flexGrow={1} minWidth={140} value={e.key} onChangeText={(key) => setE({ ...e, key })} placeholder={e.keySet ? "its key is kept" : "its key"}
               secureTextEntry autoCapitalize="none" autoCorrect={false} backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={14} />
        <Input flexGrow={1} minWidth={140} value={e.model} onChangeText={(model) => setE({ ...e, model })} placeholder="its model" autoCapitalize="none" autoCorrect={false}
               backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={14} />
      </XStack>
      <Input value={e.name} onChangeText={(name) => setE({ ...e, name })} placeholder="a name for it" backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={14} />
      {models.length ? <Choice value={e.model} ink={ink} options={models.slice(0, 12).map((m) => [m, m] as [string, string])} onPick={(model) => setE({ ...e, model })} /> : null}
      <XStack gap={8} flexWrap="wrap">
        <Action label="KEEP" ink={ink} onPress={keep} />
        <Action label="ITS MODELS" ink={ink} onPress={list} />
        <Action label="TEST" ink={ink} onPress={test} />
        {s.endpoint.set ? <Action label="FORGET" ink={ink} onPress={forget} /> : null}
      </XStack>
      {note ? <Small color="$color10">{note}</Small> : null}
    </Card>
  );
}
