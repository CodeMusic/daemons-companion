// C-190 (C-186 step 5, docs/ONEAPP.md): THE HUB in DEVICES -- what the companion this app is paired with gives beyond a
// phone alone: the save it mirrors (C-188), its AI (the modules, C-180) and its LoRa (the boards that carry one, and
// when one was last heard). A phone alone says so plainly: everything works here but the AI. Every word is DRAFT.
import { Text, YStack } from "tamagui";
import { KIND_NAMES } from "../data";
import { Card, Eyebrow, Small } from "../ui";
import { useApi } from "../useApi";

type Hub = { hub: false } | {
  hub: true; server: string; onHub: boolean;
  mirror: { on: boolean; at: string | null };
  ai: { provider: string; modules: { name: string; llm: string | null; answering: boolean }[] };
  lora: { boards: { id: string; kind: string; here: boolean }[]; heard: string | null };
};

const when = (at: string) => new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function HubCard() {
  const [h] = useApi<Hub>("/api/hub");
  if (!h) return null;
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
      <Small>{h.lora.boards.length
        ? `LORA: ${h.lora.boards.map((b) => `${KIND_NAMES[b.kind] ?? b.kind}${b.here ? "" : " (away)"}`).join(", ")}` +
          (h.lora.heard ? ` · last heard ${when(h.lora.heard)}` : " · nothing heard yet")
        : "LORA: no board with LoRa has been in touch."}</Small>
      <Small color="$color8">DRAFT</Small>
    </Card>
  );
}
