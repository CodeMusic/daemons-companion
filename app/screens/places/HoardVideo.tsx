// C-604 (C-596): MAKE A MAGIC VIDEO, from THE HOARD's CREATIONS -- pictures chosen from THE HOARD (any the asker may
// read), in the order they are chosen; for each, IT DECIDES what is said (the house's mind looks at the picture), or
// YOUR WORDS, or A DAEMON of yours says it; then the music -- none, music with no words under the voices, or A SONG
// that carries the words itself, which is offered only when no picture has words of yours or a daemon speaking; a
// title; and it is queued with the other JOBS. The hub makes it; nothing is made or spoken here. Every word DRAFT.
import { useState } from "react";
import { Text, TextArea, XStack, YStack } from "tamagui";
import { looksOf } from "../../../server/src/hoard/rules";
import { make, notYet, onceOnly, SCENES_MOST, speaks, type Held, type Music, type Scene } from "../../platform/hoard";
import { Action, Card, Choice, Entry, Eyebrow, Small } from "../../shared/ui/ui";
import { Thumb } from "./HoardLook";
import { Back, DaemonPick, Label } from "./HoardParts";

type Part = { of: string; say: Scene["say"]; words: string; species: number | null };
const SAY: Record<Scene["say"], string> = {
  auto: "The house's mind looks at the picture and decides what it says.",
  words: "It says what you write here.",
  daemon: "One of your daemons looks at the picture and says what it thinks of it, in its own voice.",
};
const MUSIC: Record<Music, string> = {
  none: "The voices alone.",
  under: "Music with no words, kept under the voices.",
  song: "A song that carries the words itself, over the pictures.",
};
const SHOWN = 30;                                             // pictures offered at a time: each is fetched to be shown

export function MakeVideo({ files, ink, onBack, onQueued }: { files: Held[]; ink: string; onBack: () => void; onQueued: () => void }) {
  const pictures = files.filter((f) => looksOf(f.mime) === "image" && !onceOnly(f));
  const [parts, setParts] = useState<Part[]>([]);
  const [music, setMusic] = useState<Music>("under"), [prompt, setPrompt] = useState(""), [title, setTitle] = useState("");
  const [shown, setShown] = useState(SHOWN);
  const [busy, setBusy] = useState(false), [said, setSaid] = useState("");
  const scenes: Scene[] = parts.map((p) => ({ of: p.of, say: p.say,
    ...(p.say === "words" && p.words.trim() ? { words: p.words.trim() } : {}), ...(p.say === "daemon" && p.species !== null ? { species: p.species } : {}) }));
  const spoken = scenes.some(speaks);
  const tune: Music = music === "song" && spoken ? "under" : music;   // a SONG chosen, then a speaker added: back under the voices
  const place = (id: string) => parts.findIndex((p) => p.of === id);
  const toggle = (id: string) => setParts((was) => (was.some((p) => p.of === id) ? was.filter((p) => p.of !== id)
    : was.length >= SCENES_MOST ? was : [...was, { of: id, say: "auto", words: "", species: null }]));
  const set = (i: number, patch: Partial<Part>) => setParts((was) => was.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i: number, by: number) => setParts((was) => {
    const to = i + by;
    if (to < 0 || to >= was.length) return was;
    const out = [...was]; [out[i], out[to]] = [out[to], out[i]];
    return out;
  });
  const lacks = !parts.length ? "Choose its pictures first."
    : parts.some((p) => p.say === "words" && !p.words.trim()) ? "A picture set to YOUR WORDS has none yet."
    : parts.some((p) => p.say === "daemon" && p.species === null) ? "A picture set to A DAEMON has none picked yet." : "";
  const queue = async () => {
    if (busy) return;
    if (lacks) { setSaid(lacks); return; }
    setBusy(true); setSaid("");
    try {
      await make({ kind: "video", ...(title.trim() ? { title: title.trim() } : {}), scenes, music: tune, ...(tune !== "none" && prompt.trim() ? { musicPrompt: prompt.trim() } : {}) });
      onQueued();
    } catch (e) { setSaid(notYet(e) ? "This hub cannot make a MAGIC VIDEO yet. Update it (the hub's deploy), then come back." : (e as Error).message); }
    finally { setBusy(false); }
  };
  const name = (id: string) => pictures.find((f) => f.id === id)?.name ?? "a picture";
  return (
    <YStack gap={12}>
      <Back to="CREATIONS" onPress={onBack} />
      <Card>
        <Eyebrow>{"MAKE A MAGIC VIDEO · DRAFT"}</Eyebrow>
        <Small>Pictures from THE HOARD, one after another, each speaking as if it were someone, with music if you like. The hub makes it, and it takes a while.</Small>
        <Label>ITS PICTURES, IN THE ORDER YOU TAP THEM</Label>
        {pictures.length ? (
          <XStack gap={8} flexWrap="wrap">
            {pictures.slice(0, shown).map((f) => {
              const at = place(f.id);
              return (
                <YStack key={f.id} role="button" cursor="pointer" aria-label={f.name} padding={2} borderRadius={6} borderWidth={2}
                        borderColor={at >= 0 ? "$color9" : "transparent"} onPress={() => toggle(f.id)} position="relative">
                  <Thumb f={f} size={84} />
                  {at >= 0 ? (
                    <YStack position="absolute" top={4} left={4} width={24} height={24} borderRadius={12} backgroundColor="$color9" alignItems="center" justifyContent="center">
                      <Text fontFamily="$mono" fontSize={12} fontWeight="800" color={ink}>{at + 1}</Text>
                    </YStack>
                  ) : null}
                </YStack>
              );
            })}
          </XStack>
        ) : <Small color="$color10">No picture in THE HOARD yet that you may open: put one in from FILES.</Small>}
        {pictures.length > shown ? <Action label={`${pictures.length - shown} MORE ›`} ink={ink} onPress={() => setShown((n) => n + SHOWN)} /> : null}
        {parts.length >= SCENES_MOST ? <Small color="$color10">{`${SCENES_MOST} pictures is the most one video takes.`}</Small> : null}
      </Card>
      {parts.map((p, i) => (
        <Card key={p.of}>
          <XStack gap={10} alignItems="center">
            {pictures.some((f) => f.id === p.of) ? <Thumb f={pictures.find((f) => f.id === p.of)!} size={56} /> : <YStack width={56} height={56} borderRadius={4} backgroundColor="$color3" />}
            <YStack flex={1}>
              <Eyebrow>{`PICTURE ${i + 1} OF ${parts.length}`}</Eyebrow>
              <Text fontSize={15} color="$color12" numberOfLines={1}>{name(p.of)}</Text>
            </YStack>
            {i > 0 ? <Text fontFamily="$mono" fontSize={12} letterSpacing={1} color="$color9" cursor="pointer" role="button" onPress={() => move(i, -1)}>EARLIER</Text> : null}
            {i < parts.length - 1 ? <Text fontFamily="$mono" fontSize={12} letterSpacing={1} color="$color9" cursor="pointer" role="button" onPress={() => move(i, 1)}>LATER</Text> : null}
          </XStack>
          <Choice<Scene["say"]> value={p.say} ink={ink} onPick={(say) => set(i, { say })} options={[["auto", "IT DECIDES"], ["words", "YOUR WORDS"], ["daemon", "A DAEMON"]]} />
          <Small color="$color10">{SAY[p.say]}</Small>
          {p.say === "daemon" ? <DaemonPick value={p.species} onPick={(species) => set(i, { species })} /> : null}
          {p.say === "words" ? (
            <TextArea value={p.words} onChangeText={(words) => set(i, { words })} maxLength={600} minHeight={70} fontSize={14} placeholder="What it says…"
                      backgroundColor="$color1" borderColor="$color6" color="$color12" />
          ) : null}
        </Card>
      ))}
      <Card>
        <Label>ITS MUSIC</Label>
        <Choice<Music> value={tune} ink={ink} onPick={setMusic}
                       options={[["none", "NONE"], ["under", "MUSIC UNDER THE VOICES"], ...(spoken ? [] : [["song", "A SONG"] as [Music, string]])]} />
        <Small color="$color10">{MUSIC[tune]}</Small>
        {spoken ? <Small color="$color10">A SONG sings its own words, so it is offered only when no picture has words of yours or a daemon speaking.</Small> : null}
        {tune !== "none" ? <Entry value={prompt} onChange={setPrompt} onSubmit={() => {}} placeholder="the music, in a few words (or leave it to it)" limit={200} /> : null}
        <Label>ITS TITLE</Label>
        <Entry value={title} onChange={setTitle} onSubmit={() => {}} placeholder="a title (or leave it to it)" limit={80} />
        <Action label={busy ? "ASKING…" : "MAKE IT"} ink={ink} onPress={queue} />
        {said ? <Small color="$color8">{said}</Small> : null}
      </Card>
    </YStack>
  );
}
