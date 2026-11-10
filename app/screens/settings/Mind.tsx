// C-307 (the user, 2026-11-08): THE MIND -- every mind this phone can reach, seen as one: each arm with its dot, the
// ring for each kind of work, and AN ENDPOINT of the player's own, called from this phone (C-280 (3)). Replaces C-280's
// THIS PHONE'S MIND toggle. Every word DRAFT.
import { useEffect, useState } from "react";
import { Input, Text, XStack, YStack } from "tamagui";
import { meshTalk, RINGS, ringOf, sense, setRing, trailSaid, type Kind, type Ring, type Sense } from "../../platform/mesh";
import { endpoint, endpointModels, endpointThink, forgetEndpoint, keepEndpoint } from "../../platform/endpoint";
import { api, ON_PHONE } from "../../platform/net";
import { Action, Card, Choice, Entry, Eyebrow, Small } from "../../ui/ui";
import { useVoice } from "../daemon/Daemon";
import { HubEndpoints } from "./HubEndpoints";   // C-280 (1)

const RING_SAID: Record<Ring, string> = { anywhere: "ANYWHERE", home: "AT HOME", phone: "THIS PHONE" };
const KIND_SAID: Record<Kind, string> = { talk: "TALK", guide: "THE GUIDE" };
type Trace = { at: string; kind: Kind; ring: Ring; from: string; heard?: string; thought?: string; said?: string;
               ms: { hear?: number; think?: number; voice?: number }; covered?: boolean; failed?: string[] };
const secs = (ms?: number) => (ms === undefined ? "" : ` ${(ms / 1000).toFixed(1)}s`);
// one line of RECENT THOUGHTS: "14:02 TALK (phone) · heard here 0.6s · thought on the Tiiny 2.3s · said by the hub 3.1s"
const traceSaid = (t: Trace) => {
  const at = new Date(t.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const where = (w?: string) => (w === "here" ? (t.from === "site" ? "on the site" : "on the phone") : w?.startsWith("by ") ? w : w ? `on ${w}` : "");
  return [`${at} ${KIND_SAID[t.kind]} (${t.from}${t.ring !== "anywhere" ? `, ${RING_SAID[t.ring]}` : ""})`,
          t.heard && `heard ${where(t.heard)}${secs(t.ms.hear)}`,
          t.thought && `thought ${t.thought === "this phone" ? "on the phone" : where(t.thought)}${secs(t.ms.think)}${t.covered ? " (covering)" : ""}`,
          t.said && `said ${where(t.said)}${secs(t.ms.voice)}`,
          t.failed?.length && `failed: ${t.failed.join(", ")}`].filter(Boolean).join(" · ");   // DRAFT
};

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
  const [traces, setTraces] = useState<Trace[]>([]);
  const [tried, setTried] = useState("");
  const [trying, setTrying] = useState<{ busy?: boolean; answer?: string; trail?: string; error?: string }>({});
  const speak = useVoice();
  const readTraces = () => api<{ traces?: Trace[] }>("/api/mind").then((m) => setTraces(m.traces ?? [])).catch(() => {});
  // TRY IT: a line typed, answered through THE MIND exactly as a held TALK is (heard is skipped: it was typed)
  const tryIt = async () => {
    const said = tried.trim();
    if (!said || trying.busy) return;
    setTrying({ busy: true }); setTried("");
    try {
      const r = await meshTalk({ kind: "talk", name: "your daemon", text: said });
      setTrying({ answer: r.answer ?? "", trail: trailSaid(r.trail), error: r.error ?? undefined });
      const v = await r.voice;
      setTrying({ answer: r.answer ?? "", trail: trailSaid(r.trail) });
      if (v?.audioBase64) speak(v.audioBase64);
      setTimeout(readTraces, 500);
    } catch (err) { setTrying({ error: (err as Error).message }); }
  };
  const look = async (fresh = false) => {
    setS(await sense(fresh)); readTraces();
    const got = await endpoint();
    setE(got ? { url: got.url, model: got.model, name: got.name, key: "", keySet: got.keySet } : { url: "", model: "", name: "", key: "", keySet: false });
  };
  useEffect(() => {
    look();
    if (ON_PHONE) Promise.all([ringOf("talk"), ringOf("guide")]).then(([talk, guide]) => setRings({ talk, guide }));
    else setRings({ talk: "anywhere", guide: "anywhere" });   // the site: every ring is a phone's own
    api<{ rings?: { dream?: "anywhere" | "home" } }>("/api/talk/settings").then((t) => setDream(t.rings?.dream ?? "anywhere")).catch(() => {});
  }, []);
  if (!s || !rings || !e) return null;

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
      {!ON_PHONE ? <Small color="$color10">On this site, the hub thinks. On a phone, the phone's own mind and an endpoint join it.</Small> : null}
      <YStack gap={6} paddingVertical={4}>
        {ON_PHONE ? <Arm name="THIS PHONE" ok={s.phone.mind} note={s.phone.mind ? "thinks, hears and speaks here" : s.phone.hear ? `hears here; cannot think: ${s.phone.why ?? "needs Apple Intelligence"}` : "not in this build"} /> : null}
        <Arm name="THE HUB" ok={s.hub.there} note={hubNote} />
        {ON_PHONE ? <Arm name="ENDPOINT" ok={s.endpoint.set ? true : null} note={s.endpoint.set ? `${s.endpoint.name} · ${s.endpoint.model || "no model"} · ${s.endpoint.home ? "at home" : "on the internet"}` : "none set"} /> : null}
      </YStack>
      <Action label="LOOK AGAIN" ink={ink} onPress={() => look(true)} />

      <Eyebrow>TRY IT</Eyebrow>
      <Small>Say something to your daemon here, typed: it goes through THE MIND as a held TALK does, and the line under the answer says which minds took part.</Small>
      <XStack gap={8} alignItems="center" flexWrap="wrap">
        <Entry value={tried} onChange={setTried} onSubmit={tryIt} placeholder="Say something…" limit={200} />
        <Action label={trying.busy ? "THINKING…" : "SAY IT"} ink={ink} onPress={tryIt} />
      </XStack>
      {trying.answer ? <Text fontSize={16} lineHeight={24} color="$color12">{trying.answer}</Text> : null}
      {trying.trail ? <Small color="$color8">{trying.trail}</Small> : null}
      {trying.error ? <Small color="$color8">{trying.error}</Small> : null}

      <Eyebrow>RECENT THOUGHTS</Eyebrow>
      {traces.length
        ? <YStack gap={3}>{traces.slice(0, 8).map((t, i) => <Small key={`${t.at}${i}`} color={t.covered || t.failed?.length ? "$color9" : "$color10"}>{traceSaid(t)}</Small>)}</YStack>
        : <Small color="$color10">None yet: each talk, held or typed, on any phone or here, is kept here -- where it was heard, thought and said, and how long each took. Never what was said.</Small>}

      {ON_PHONE ? <>
      <Eyebrow>HOW FAR EACH MAY GO</Eyebrow>
      <Small>ANYWHERE: every mind. AT HOME: nothing leaves your house -- this phone, the hub, the Tiiny, an endpoint at home. THIS PHONE: nothing leaves the phone.</Small>
      {(Object.keys(RINGS) as Kind[]).map((k) => (
        <YStack key={k} gap={4}>
          <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color="$color10">{KIND_SAID[k]}</Text>
          <Choice value={rings[k]} ink={ink} options={RINGS[k].map((r) => [r, RING_SAID[r]] as [Ring, string])} onPick={(r) => pick(k, r)} />
        </YStack>
      ))}
      </> : null}
      {dream ? (
        <YStack gap={4}>
          <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color="$color10">DREAMS</Text>
          <Choice value={dream} ink={ink} options={[["anywhere", "ANYWHERE"], ["home", "AT HOME"]]} onPick={pickDream} />
        </YStack>
      ) : null}
      <Small color="$color10">The GUIDE and dreams are kept on the hub, so they cannot be thought on this phone alone. The JOURNAL is always written at home.</Small>
      {rings.talk === "phone" && !s.phone.mind ? <Small color="$color8">{`This phone cannot think for itself (${s.phone.why ?? "it needs iOS 26 and Apple Intelligence"}), so TALK will not answer here.`}</Small> : null}

      {ON_PHONE ? <>
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
      </> : null}
      {note ? <Small color="$color10">{note}</Small> : null}
      <HubEndpoints ink={ink} />
    </Card>
  );
}
