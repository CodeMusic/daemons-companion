// C-554 (the user, 2026-11-24: "you select the type (human or daemon), u select the daemon to create it, an optional
// prompt for the sound, and optional prompt for style ... very similar to what we have and similar to the sing one"):
// REVERIE's MAKE, under the door once a kind is chosen. The daemon that makes it (the one carried, or any of the party),
// what it should sound like and its music's style, both optional; the hub's mind writes the drift and names it in that
// daemon's voice, the music maker makes the music, THE EASEL paints its cover (server: POST /api/reverie/make). DRAFT.
import { useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { api } from "../platform/net";
import { Action, Entry, Eyebrow, Small } from "../shared/ui/ui";
import { kindName, type Kind, type Side } from "./ReverieDoor";

export type Made = { chosen: string; wrote: boolean; name: string | null; track: { id: string; state: string } | null;
                     music?: string };   // why there is no music, when the hub has no music maker

export function ReverieMake({ side, kind, party, ink, onMade }:
  { side: Side; kind: Kind; party: { slot: number; nickname?: string }[]; ink?: string; onMade: (m: Made) => void }) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<number | null>(null);          // null: the one carried
  const [sound, setSound] = useState(""), [style, setStyle] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const make = async () => {
    setBusy(true); setError("");
    try { onMade(await api<Made>("/api/reverie/make", { side, kind, slot: slot ?? undefined, sound, style })); setOpen(false); setSound(""); setStyle(""); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const chip = (label: string, on: boolean, press: () => void) => (
    <Text key={label} fontFamily="$mono" fontSize={12} letterSpacing={1} paddingHorizontal={8} paddingVertical={4} borderRadius={6} borderWidth={1}
          borderColor={on ? "$color12" : "$color6"} color="$color12" cursor="pointer" role="button" onPress={press}>{label}</Text>
  );
  if (!open) return (
    <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12" cursor="pointer" role="link" marginTop={6}
          onPress={() => setOpen(true)}>{`MAKE A ${kindName(side, kind)} ›`}</Text>
  );
  return (
    <YStack gap={6} marginTop={6}>
      <Eyebrow>{`MAKE A ${kindName(side, kind)}`}</Eyebrow>
      <Small>{"Made by"}</Small>
      <XStack gap={6} flexWrap="wrap">
        {chip("THE ONE YOU CARRY", slot === null, () => setSlot(null))}
        {party.filter((d) => d.nickname).map((d) => chip(d.nickname!.toUpperCase(), slot === d.slot, () => setSlot(d.slot)))}
      </XStack>
      <Entry value={sound} onChange={setSound} onSubmit={make} placeholder="What should it sound like? (optional)" limit={300} />
      <Entry value={style} onChange={setStyle} onSubmit={make} placeholder="Its music's style? (optional)" limit={120} />
      <XStack gap={8} alignItems="center">
        <Action label={busy ? "WRITING ITS DRIFT…" : "MAKE"} ink={ink} onPress={busy ? () => {} : make} />
        <Text fontFamily="$mono" fontSize={12} color="$color10" cursor="pointer" role="link" onPress={() => setOpen(false)}>{"CANCEL"}</Text>
      </XStack>
      <Small color="$color10">{"Its drift is written in a few seconds; its music takes about three minutes on the hub's music maker."}</Small>
      {error ? <Small color="$color8">{error}</Small> : null}
    </YStack>
  );
}
