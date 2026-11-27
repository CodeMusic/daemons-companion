// C-601, C-576 (C-596): THE HOARD in SETTINGS -- its WHEN on this device (send a file at any time, only on Wi-Fi, only
// while plugged in, or only with both), and who a new file is shared with unless it is said otherwise. Both are this
// device's own (state/hoard.ts); what the whole of THE HOARD does -- its machines, its room, what goes when it is
// full -- is the hub's, in THE ENGINE ROOM. Every word DRAFT.
import { Text, YStack } from "tamagui";
import { ON_PHONE } from "../../platform/net";
import { SHARE_SAID, setHoardKept, useHoardKept, WHEN_ABOUT, WHEN_SAID, type HoardShare, type HoardWhen } from "../../state/hoard";
import { EngineRoom } from "../../shared/ui/engineRoom";
import { Card, Choice, Eyebrow, Small } from "../../shared/ui/ui";

const Row = (p: { label: string; children: React.ReactNode }) =>
  <YStack gap={4} marginTop={6}><Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color10">{p.label}</Text>{p.children}</YStack>;

export function HoardSettingsCard({ ink }: { ink: string }) {
  const k = useHoardKept();
  return (
    <Card>
      <Eyebrow>THE HOARD</Eyebrow>
      <Small>{`The household's own storage, on its own machines. These two are ${ON_PHONE ? "this phone's" : "this browser's"} own; its files are in PLACES, THE HOARD.`}</Small>
      <Row label={`WHEN ${ON_PHONE ? "THIS PHONE" : "THIS BROWSER"} SENDS A FILE`}>
        <Choice<HoardWhen> value={k.when} ink={ink} onPick={(when) => setHoardKept({ when })}
                           options={(Object.keys(WHEN_SAID) as HoardWhen[]).map((w) => [w, WHEN_SAID[w]] as [HoardWhen, string])} />
        <Small color="$color10">{WHEN_ABOUT[k.when]}</Small>
        {k.when !== "any" ? <Small color="$color10">A file held back waits in THE HOARD's FILES, each with SEND IT NOW.</Small> : null}
      </Row>
      <Row label="A NEW FILE IS SHARED WITH">
        <Choice<HoardShare> value={k.share} ink={ink} onPick={(share) => setHoardKept({ share })}
                            options={(Object.keys(SHARE_SAID) as HoardShare[]).map((s) => [s, SHARE_SAID[s]] as [HoardShare, string])} />
        <Small color="$color10">{k.share === "me" ? "Only you, unless you say otherwise as you put it in: a backup of your own." : "The household, unless you say otherwise as you put it in."}</Small>
      </Row>
      <EngineRoom page="hoard" ink={ink} what="Its machines, its room, and what goes when it is full are the hub's." />
      <Small color="$color8">DRAFT</Small>
    </Card>
  );
}
