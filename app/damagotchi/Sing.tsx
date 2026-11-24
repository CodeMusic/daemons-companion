// C-362 (the user, 2026-11-14: "a new daemon routine where your daemon sings a song either from a prompt, your own lyrics
// with style guide, or simply from the daemons own creations ... using that same persona methods we created"; by
// multiple choice: ACE-Step's own singing): THE DAEMON SINGS -- three ways in: A PROMPT (it writes the words), YOUR
// LYRICS with a style, or ITS OWN (its persona of the day writes and styles it). The hub writes it on the house's mind and
// sings it on the music maker (about two or three minutes), painting its cover meanwhile; the song is a creation, kept
// on this phone once it is ready and played here. Every word DRAFT.
import { useEffect, useState } from "react";
import { Text, TextArea, XStack, YStack } from "tamagui";
import { api } from "../platform/net";
import { keep, mine, type Creation } from "../platform/creations";
import { Action, Card, CareKey, Entry, Eyebrow, Small } from "../shared/ui/ui";
import { CreationsScreen, RecordCover, SongPlayer } from "./Creations";

type Mode = "prompt" | "lyrics" | "own";
const SAID: Record<Mode, string> = {
  prompt: "Say what the song is about, and it writes the words and sings them.",
  lyrics: "Give it your words, and how to sing them; it sings them as they are.",
  own: "It writes a song of its own, from its day -- what it is, how it is cared for, what it hopes for -- and sings it.",
};

export function SingScreen({ ink, name, onClose }: { ink: string; name: string; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("prompt");
  const [request, setRequest] = useState(""), [style, setStyle] = useState("");
  const [asked, setAsked] = useState<string | null>(null);              // the song being made, by id
  const [row, setRow] = useState<Creation | null>(null);
  const [kept, setKept] = useState<ReturnType<typeof mine>[number] | null>(null);
  const [gallery, setGallery] = useState(false);
  const [error, setError] = useState("");
  // while the song is written and sung, look again every few seconds; once ready, keep it on this phone
  useEffect(() => {
    if (!asked) return;
    let stop = false;
    const look = async () => {
      const c = (await api<{ creations: Creation[] }>("/api/creations?kind=song")).creations.find((x) => x.id === asked) ?? null;
      if (stop) return;
      setRow(c);
      if (c?.state === "ready") { setKept(mine("song").find((x) => x.id === c.id) ?? await keep(c, "household")); return; }
      if (c?.state === "failed") return;
      setTimeout(() => { look().catch(() => {}); }, 6000);
    };
    look().catch((e) => setError((e as Error).message));
    return () => { stop = true; };
  }, [asked]);

  const singNow = async () => {
    setError(""); setRow(null); setKept(null);
    const r = await api<{ song: { id: string } }>("/api/sing", { mode, request, style });
    setAsked(r.song.id);
  };

  if (gallery) return <CreationsScreen ink={ink} start="song" onClose={() => setGallery(false)} />;
  if (kept) return <SongPlayer k={kept} ink={ink} onBack={() => { setKept(null); setAsked(null); setRow(null); }} />;
  return (
    <YStack gap={12}>
      <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12" cursor="pointer" role="link" onPress={onClose}>{"‹ BACK"}</Text>
      <Card>
        <Eyebrow>{"THE DAEMON SINGS · DRAFT"}</Eyebrow>
        <Small>{`${name} sings you a song. ${SAID[mode]}`}</Small>
        <XStack gap={8} marginTop={6}>
          <CareKey label="PROMPT" ink={ink} lit={mode === "prompt"} onPress={() => setMode("prompt")} />
          <CareKey label="MY WORDS" ink={ink} lit={mode === "lyrics"} onPress={() => setMode("lyrics")} />
          <CareKey label="ITS OWN" ink={ink} lit={mode === "own"} onPress={() => setMode("own")} />
        </XStack>
        {mode === "prompt" ? <Entry value={request} onChange={setRequest} onSubmit={() => {}} placeholder="a song about…" limit={300} /> : null}
        {mode === "lyrics" ? (
          <TextArea value={request} onChangeText={setRequest} placeholder={"[verse]\nYour words, a line at a time…\n\n[chorus]\n…"} maxLength={3000}
                    minHeight={180} backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={14} />
        ) : null}
        <Entry value={style} onChange={setStyle} onSubmit={() => {}} limit={200}
               placeholder={mode === "lyrics" ? "how to sing it: slow folk, piano, hopeful…" : "a style, if you like (or leave it to it)"} />
        <Action label={`SING, ${name}`} ink={ink} onPress={singNow} />
        {error ? <Small color="$color8">{error}</Small> : null}
      </Card>
      {asked ? (
        <Card alignItems="center">
          {row ? <RecordCover c={row} size={200} /> : null}
          <Small color="$color12">{!row ? "Asking the hub…" : row.state === "failed" ? `It could not sing it: ${row.meta.error ?? "?"}`
            : row.meta.stage === "writing" ? `${name} is writing the words…` : `${name} is singing "${row.title}"… about two or three minutes.`}</Small>
        </Card>
      ) : null}
      <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="700" color="$color12" cursor="pointer" role="link"
            onPress={() => setGallery(true)}>{"EVERY SONG ›"}</Text>
    </YStack>
  );
}
