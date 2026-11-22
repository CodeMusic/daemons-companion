// C-455 (the user, 2026-11-21, by multiple choice: a letter in its own voice, the numbers under it; one name per span;
// on TODAY, then kept in a book on the LIBRARY's shelf beside the DREAM-BOOKS): MENTIONS FROM YOUR DAEMON. TODAY shows the
// newest letter not yet read (server/src/mentions.ts newestUnread); read, it stays in the book, which reads a page at a time,
// newest first, its cover the daemon who wrote the newest. Every word DRAFT.
import { useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { api } from "../../platform/net";
import { useApi } from "../../platform/useApi";
import { Action, Art, Card, Eyebrow, Small, whenSaid } from "../../ui/ui";
import { VoiceButton } from "../../ui/voiceButton";
import { coverLine } from "./DreamBooks";

export type Mention = { id: number; span: "day" | "month" | "season" | "year"; title: string; from: string; to: string; said: string; at: string;
                        species: number | null; nickname: string; state: "writing" | "done" | "failed"; body: string; by: string;
                        stats: unknown; read: boolean };
export type MentionsT = { book: string; mentions: Mention[]; unread: Mention | null };
const lines = (m: Mention): string[] => {
  const s = m.stats as { together?: { said: string; n: number }[]; steps?: number; goals?: string[]; arete?: number;
                         entries?: number; dreamsWritten?: number; nights?: number; vivid?: number; broken?: number } | null;
  if (!s) return [];
  const n = (k: number, one: string, many = `${one}S`) => `${k} ${k === 1 ? one : many}`;   // "1 STEP", "2 STEPS"
  return [
    s.steps || s.goals?.length ? `${n(s.steps ?? 0, "STEP")}${s.goals?.length ? ` · ${n(s.goals.length, "GOAL")}` : ""}` : "",
    s.arete ? `${s.arete} ARETE` : "",
    ...(s.together ?? []).slice(0, 4).map((c) => (c.n === 1 ? c.said : `${c.n} ${c.said}`).toUpperCase()),
    s.entries ? `${s.entries} JOURNAL` : "", s.dreamsWritten ? `${n(s.dreamsWritten, "DREAM")} WRITTEN` : "",
    s.nights ? `${n(s.nights, "NIGHT")}${s.vivid ? ` · ${s.vivid} VIVID` : ""}` : "",
  ].filter(Boolean);
};

// the letter itself: its span, its words, the numbers under it
function Letter({ m }: { m: Mention }) {
  const n = lines(m);
  return (
    <YStack gap={10}>
      <XStack alignItems="center" gap={10}>
        {m.species ? <Art path={`/art/species/${m.species}.png`} size={48} /> : null}
        <YStack flex={1}>
          <Eyebrow>{m.title}</Eyebrow>
          <Small>{`${m.said} · from ${m.nickname}`}</Small>
        </YStack>
      </XStack>
      <Text fontSize={16} lineHeight={25} fontStyle="italic" color="$color12">{m.body}</Text>
      {n.length ? <XStack gap={6} flexWrap="wrap">{n.map((l) => (
        <Text key={l} fontFamily="$mono" fontSize={11} letterSpacing={0.5} color="$color10" borderWidth={1} borderColor="$color6" borderRadius={4} paddingHorizontal={6} paddingVertical={2}>{l}</Text>
      ))}</XStack> : null}
      {m.state === "writing" ? <Small>{`${m.nickname} is still writing; these are its first words.`}</Small> : null}
    </YStack>
  );
}

// TODAY: the newest letter not yet read, if one came in the last day and a half
export function MentionsCard() {
  const [v, setV] = useApi<MentionsT>("/api/mentions");
  const m = v?.unread;
  if (!m) return null;
  const read = async () => { await api("/api/mentions/read", { id: m.id }); setV(v ? { ...v, unread: null } : v); };
  return (
    <Card>
      <Letter m={m} />
      <XStack gap={8} alignItems="center" marginTop={6} flexWrap="wrap">
        <VoiceButton text={m.body} voice="daemon" />
        <Action label="Read" onPress={read} />
        <Small>{`Kept in ${v?.book ?? "its book"}, in the LIBRARY.`}</Small>
      </XStack>
    </Card>
  );
}

// the cover on the shelf: the newest letter's daemon
export function MentionsCover({ v, w, h }: { v: MentionsT; w: number; h: number }) {
  const s = h / 320, newest = v.mentions[0];
  return (
    // positioned, so it stands over the shelf's own title (Bookcase's Standing lays that under every cover)
    <YStack position="relative" width={w} height={h} backgroundColor="#3a3420" alignItems="center" justifyContent="space-between" paddingVertical={18 * s} paddingHorizontal={8 * s}>
      <Text fontFamily="$mono" {...coverLine(14, 8, s)} fontWeight="800" color="#f3e6c4" textAlign="center" numberOfLines={3}>{v.book}</Text>
      {newest?.species ? <Art path={`/art/species/${newest.species}.png`} size={Math.round(110 * s)} /> : <YStack />}
      <Text fontFamily="$mono" {...coverLine(10, 7, s)} color="#d9c78f" textAlign="center" numberOfLines={1}>{`${v.mentions.length} ${v.mentions.length === 1 ? "LETTER" : "LETTERS"}`}</Text>
    </YStack>
  );
}

// the book: a page a letter, newest first
export function MentionsBook({ v }: { v: MentionsT }) {
  const [page, setPage] = useState(0);
  const all = v.mentions, m = all[page];
  if (!m) return <Small>No letters yet. Your daemon writes one when its time comes (THE ENGINE ROOM's LATER says when).</Small>;
  return (
    <YStack gap={12}>
      <Card><Letter m={m} /><Small>{`Written ${whenSaid(m.at)}${m.by && m.by !== "words" ? ` · ${m.by}` : ""}`}</Small></Card>
      <XStack justifyContent="space-between" alignItems="center" gap={8} flexWrap="wrap">
        <Action label="‹ NEWER" onPress={() => setPage((p) => Math.max(0, p - 1))} />
        <VoiceButton text={m.body} voice="daemon" />
        <Text fontFamily="$mono" fontSize={11} color="$color10">{`${page + 1} / ${all.length}`}</Text>
        <Action label="OLDER ›" onPress={() => setPage((p) => Math.min(all.length - 1, p + 1))} />
      </XStack>
    </YStack>
  );
}
