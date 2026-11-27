// THE HOARD's JOBS (C-605, C-596): everything waiting to be made -- a text read aloud (C-603), a photo that speaks, a MAGIC
// VIDEO (C-604), an answer (C-606). The hub makes them one at a time: the one in hand first, with what it is doing
// now and how far along it is; then the rest in their order; then what was made lately. Yours can be stopped, and one
// that failed says why and can be tried again. Read again every three seconds while one is waiting or being made
// (platform/hoard.ts), and not otherwise. Every word DRAFT.
import { Text, XStack, YStack } from "tamagui";
import { againJob, live, stopJob, type Job, type JobsNow } from "../../platform/hoard";
import { Action, Card, Eyebrow, Small, whenSaid } from "../../shared/ui/ui";
import { Bar } from "./HoardParts";

export const KIND_SAID: Record<string, string> = { spoken: "A TEXT READ ALOUD", magic: "A PHOTO THAT SPEAKS", video: "A MAGIC VIDEO", answer: "AN ANSWER" };
const when = (ms: number | null) => (ms ? whenSaid(new Date(ms).toISOString()) : "");

function JobRow({ j, ahead, ink, onOpen }: { j: Job; ahead: number; ink: string; onOpen: (id: string) => void }) {
  return (
    <YStack gap={4} paddingVertical={10} borderTopWidth={1} borderColor="$color5">
      <XStack justifyContent="space-between" alignItems="baseline" gap={8}>
        <Text flex={1} fontSize={15} fontWeight="600" color="$color12" numberOfLines={2}>{j.title || KIND_SAID[j.kind] || "A making"}</Text>
        <Text fontFamily="$mono" fontSize={10} letterSpacing={1} color="$color10">{KIND_SAID[j.kind] ?? ""}</Text>
      </XStack>
      {j.state === "making" ? (<>
        <Bar part={j.progress} />
        <Small color="$color12">{j.step ? `${j.step[0].toUpperCase()}${j.step.slice(1)}` : "Being made…"}</Small>
      </>) : j.state === "waiting" ? <Small>{ahead > 0 ? `Waiting its turn: ${ahead} ahead of it.` : "Next."}</Small>
        : j.state === "done" ? <Small>{`Made ${when(j.ended)}.`}</Small>
        : j.state === "stopped" ? <Small color="$color10">{`Stopped ${when(j.ended)}.`}</Small>
        : <Small color="$color8">{`It could not be made: ${j.error || "the hub did not say why"}.`}</Small>}
      <Small color="$color10">{`${j.mine ? "Asked for by you" : `Asked for by ${j.by || "someone in the household"}`}, ${when(j.at)}.`}</Small>
      <XStack gap={8} flexWrap="wrap">
        {live(j) && j.mine ? <Action label="STOP" ink={ink} onPress={() => stopJob(j.id)} /> : null}
        {(j.state === "failed" || j.state === "stopped") && j.mine ? <Action label="TRY AGAIN" ink={ink} onPress={() => againJob(j.id)} /> : null}
        {j.state === "done" && j.result ? <Action label="OPEN IT ›" ink={ink} onPress={() => onOpen(j.result!)} /> : null}
      </XStack>
    </YStack>
  );
}

const LATELY = 12;
export function JobsList({ now, ink, onOpen }: { now: JobsNow; ink: string; onOpen: (id: string) => void }) {
  if (now.missing) return <Card><Eyebrow>JOBS</Eyebrow><Small>{"This hub cannot make anything from a file yet. Update it (the hub's deploy), then come back."}</Small></Card>;
  if (!now.asked) return <Card minHeight={96}><Eyebrow>JOBS</Eyebrow><Small color="$color8">…</Small></Card>;
  const making = now.jobs.filter((j) => j.state === "making" || (j.state === "waiting" && j.id === now.now));
  const waiting = now.jobs.filter((j) => j.state === "waiting" && j.id !== now.now).sort((a, b) => a.at - b.at);
  const lately = now.jobs.filter((j) => !live(j)).sort((a, b) => (b.ended ?? b.at) - (a.ended ?? a.at)).slice(0, LATELY);
  return (
    <YStack gap={14}>
      <Card>
        <Eyebrow>{"BEING MADE NOW · DRAFT"}</Eyebrow>
        <Small color="$color10">One at a time, in the order they were asked for.</Small>
        {making.length ? making.map((j) => <JobRow key={j.id} j={j} ahead={0} ink={ink} onOpen={onOpen} />)
          : <Small>{waiting.length ? "The next one is about to begin." : "Nothing is being made."}</Small>}
        {waiting.map((j, i) => <JobRow key={j.id} j={j} ahead={making.length + i} ink={ink} onOpen={onOpen} />)}
        {now.error ? <Small color="$color8">{`Not read again just now: ${now.error}`}</Small> : null}
      </Card>
      {lately.length ? (
        <Card>
          <Eyebrow>LATELY</Eyebrow>
          {lately.map((j) => <JobRow key={j.id} j={j} ahead={0} ink={ink} onOpen={onOpen} />)}
        </Card>
      ) : null}
    </YStack>
  );
}
