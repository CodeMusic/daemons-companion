// C-190 (C-186 step 5, docs/ONEAPP.md): THE HUB in DEVICES -- what the companion this app is paired with gives beyond a
// phone alone: the save it mirrors (C-188), its AI (the modules, C-180) and its LoRa (the boards that carry one, and
// when one was last heard). A phone alone says so plainly: everything works here but the AI. Every word is DRAFT.
import { useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { api } from "../../platform/net";
import { KIND_NAMES } from "../../state/data";
import { Action, Card, Choice, Eyebrow, Pending, Small } from "../../ui/ui";
import { useApi } from "../../platform/useApi";

type Hub = { hub: false } | {
  hub: true; server: string; onHub: boolean;
  mirror: { on: boolean; at: string | null };
  ai: { provider: string; modules: { name: string; llm: string | null; answering: boolean }[] };
  lora: { boards: { id: string; kind: string; here: boolean }[]; heard: string | null };
};

// C-211 (the user, 2026-10-28: "configure the primary source (module or n8n ... green/red health indicator dots"): who
// answers a talk first -- the hub's module or n8n, the other after it -- with a dot for whether each can now (checked by
// the companion every minute). One choice for the whole companion: set here, on a watch's own settings, or on the watch.
type First = "module" | "n8n" | "tiiny";
type TalkSettings = { first: First; tiiny?: { url: string };
                      health?: { n8n: { ok: boolean } | null; modules: { name: string; ok: boolean }[]; tiiny?: { ok: boolean; models: string[] } | null } };
const Dot = ({ ok }: { ok: boolean | null }) =>
  <YStack width={10} height={10} borderRadius={5} backgroundColor={ok === null ? "$color6" : ok ? "#3fb950" : "#e5534b"} />;
export function TalkFirstRow({ ink }: { ink?: string }) {
  const [t, setT, failed] = useApi<TalkSettings>("/api/talk/settings");
  const [said, setSaid] = useState("");
  if (!t) return failed ? null : <YStack minHeight={222} />;   // C-344: its place in the card held until the first answer
  // an older companion (or a kept answer) has no health: grey dots, never a crash (the review)
  const mods = t.health?.modules ?? [], moduleOk = mods.length ? mods.some((m) => m.ok) : null;
  const n8nOk = t.health?.n8n ? t.health.n8n.ok : null;
  // C-249: the Tiiny, once its address is given (Settings, THE TIINY)
  const hasTiiny = !!t.tiiny?.url, tiinyOk = t.health?.tiiny ? t.health.tiiny.ok : null;
  const pick = async (first: First) => {
    try { setT(await api<TalkSettings>("/api/talk/settings", { first })); setSaid(""); } catch (e) { setSaid((e as Error).message); }
  };
  return (
    <YStack gap={6} paddingVertical={6}>
      <Text fontFamily="$mono" fontSize={12} letterSpacing={2} color="$color11">WHO ANSWERS FIRST WHEN YOU TALK</Text>
      <Choice value={t.first} options={[...(hasTiiny ? [["tiiny", "The Tiiny"] as [First, string]] : []), ["module", "The hub's AI board"], ["n8n", "n8n"]]}
              onPick={pick} ink={ink} />
      <XStack gap={14} alignItems="center" flexWrap="wrap">
        {hasTiiny ? <XStack gap={6} alignItems="center"><Dot ok={tiinyOk} /><Small>{tiinyOk === null ? "Tiiny: not looked for yet" : tiinyOk ? "Tiiny: answering" : "Tiiny: not answering"}</Small></XStack> : null}
        <XStack gap={6} alignItems="center"><Dot ok={moduleOk} /><Small>{moduleOk === null ? "AI board: none known" : moduleOk ? "AI board: answering" : "AI board: not answering"}</Small></XStack>
        <XStack gap={6} alignItems="center"><Dot ok={n8nOk} /><Small>{n8nOk === null ? "n8n: not set" : n8nOk ? "n8n: reachable" : "n8n: out of reach"}</Small></XStack>
      </XStack>
      <Small>{t.first === "tiiny" ? "If the Tiiny is away or silent, the AI board answers, then n8n."
        : t.first === "module" ? "The other answers when the first cannot, or is slow." : "The AI board answers when n8n cannot."}</Small>
      {!hasTiiny ? <Small>The Tiiny joins these once its address is given: Settings, WHO ANSWERS WHEN YOU TALK, THE TIINY.</Small> : null}
      {said ? <Small color="$color8">{said}</Small> : null}
      <Small color="$color8">DRAFT</Small>
    </YStack>
  );
}

const when = (at: string) => new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function HubCard({ ink }: { ink?: string }) {
  const [h, setH] = useApi<Hub>("/api/hub");
  const [looking, setLooking] = useState(false);
  // the AI's boards looked for again now, not at the next five-minute round (ai/discover.ts), with the addresses kept
  const lookAgain = async () => {
    setLooking(true);
    try {
      const t = await api<{ moduleAddresses: string }>("/api/talk/settings");
      await api("/api/talk/settings", { moduleAddresses: t.moduleAddresses });
      setH(await api<Hub>("/api/hub"));
    } finally { setLooking(false); }
  };
  if (!h) return <Pending title="THE COMPANION" height={[555, 495]} />;   // C-344: its place held until the first answer
  if (!h.hub) return (
    <Card borderLeftWidth={6} borderLeftColor="$color5" gap={4}>
      <Eyebrow>THE HUB</Eyebrow>
      <Text fontSize={18} fontWeight="600" color="$color12">This phone, on its own</Text>
      <Small>Everything works here except talking with the daemon, which needs the hub's AI. Pair with a companion in SETTINGS to add it.</Small>
      <Small color="$color8">DRAFT</Small>
    </Card>
  );
  const answering = h.ai.modules.filter((m) => m.answering);
  return (
    <Card borderLeftWidth={6} borderLeftColor="$color9" gap={6}>
      <Eyebrow>{h.onHub ? "THE HUB" : "THE COMPANION ON A COMPUTER"}</Eyebrow>
      <Text fontSize={18} fontWeight="600" color="$color12">{`Paired · ${h.server}`}</Text>
      <Small>{h.mirror.on
        ? `THE SAVE: kept in step with this device${h.mirror.at ? `, last ${when(h.mirror.at)}` : ""}.`
        : "THE SAVE: read from a file the companion was given, not from this device."}</Small>
      <Small>{answering.length
        ? `THE AI: ${answering.map((m) => m.name).join(", ")}, answering.`
        : h.ai.modules.length ? "THE AI: its modules are not answering just now." : `THE AI: no module on the hub; talk goes to ${h.ai.provider}.`}</Small>
      <Action label={looking ? "Looking…" : "LOOK FOR AI BOARDS AGAIN"} ink={ink} onPress={lookAgain} />
      <TalkFirstRow ink={ink} />
      <Small>{h.lora.boards.length
        ? `LORA: ${h.lora.boards.map((b) => `${KIND_NAMES[b.kind] ?? b.kind}${b.here ? "" : " (away)"}`).join(", ")}` +
          (h.lora.heard ? ` · last heard ${when(h.lora.heard)}` : " · nothing heard yet")
        : "LORA: no board with LoRa has been in touch."}</Small>
      <Small color="$color8">DRAFT</Small>
    </Card>
  );
}
