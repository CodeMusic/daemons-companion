// TODAY -- the home page: the day, the one thing, a glance at each place (C-156). (C-157: out of App.tsx.)
import { useCallback, useEffect, useState } from "react";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { Text, XStack, YStack } from "tamagui";
import { castLine, playerId } from "../data";
import { api, ON_PHONE } from "../net";
import { hearSettings, soundLevel } from "../tuneSound";
import { Cast, Notebook, PlayerState, Profile, TABS, Today } from "../types";
import { Action, Art, Card, careSound, Eyebrow, Small } from "../ui";

export function TodayScreen({ today, reload, ink, goTo }: { today: Today; reload: () => void; ink: string; goTo: (t: (typeof TABS)[number]) => void }) {
  const done = async () => { if (today.next) { await api(`/api/steps/${today.next.step.id}/done`, {}); reload(); } };
  return (
    <YStack gap={14}>
      <Card>
        <Eyebrow>{today.day.day.toUpperCase()} · {today.day.note} · {today.season.toUpperCase()}</Eyebrow>
        <Text fontSize={24} fontWeight="600" color="$color12">{today.day.theme ?? today.day.virtue}</Text>
        <Text fontSize={16} color="$color11">{today.day.cue ?? today.day.virtue}</Text>
        <Small>{today.day.chakra} · {today.day.hue} · {today.edition}</Small>
      </Card>
      <Card borderLeftWidth={6} borderLeftColor="$color9" paddingVertical={20}>
        <Eyebrow>THE ONE THING</Eyebrow>
        {today.next ? (
          <>
            <Text fontSize={22} fontWeight="600" lineHeight={30} color="$color12">{today.next.step.text}</Text>
            <Small>{today.next.goal} › {today.next.subitem}</Small>
            <Action label="Done" onPress={done} ink={ink} />
          </>
        ) : (
          <Small>Nothing to do yet. Add a goal, and the first step will wait here.</Small>
        )}
      </Card>
      <TodayMore goTo={goTo} ink={ink} note={today.day.note} />
    </YStack>
  );
}

// C-156 (the user, 2026-10-18: "the home page should have more content"): TODAY as the home page -- under the day and the
// one thing, a glance at each place: the daemon and its care, NEARBY's latest, the game, what waits in the LIBRARY. Each
// card opens its place. Every word DRAFT.
export function TodayMore({ goTo, ink, note }: { goTo: (t: (typeof TABS)[number]) => void; ink: string; note: string }) {
  const [life, setLife] = useState<{ word: string; cue: string | null; fed: { today: number; due: number }; watered: { today: number; due: number } } | null>(null);
  const [party, setParty] = useState<{ slot: number; nickname: string; away: boolean }[] | null>(null);
  const [p, setP] = useState<Profile | null>(null);
  const [nb, setNb] = useState<Notebook | null>(null);
  const [last, setLast] = useState<Cast | null>(null);
  const [said, setSaid] = useState("");
  const [own, setOwn] = useState<{ slot: number; nickname: string } | null | undefined>(undefined);   // this player's own (a box's, C-103); undefined: not heard yet
  const player = useAudioPlayer(null);
  useEffect(() => {                                         // C-160: this phone's own SOUND, as the DAEMON page reads it
    playerId().then((id) => api<{ settings: { sound?: boolean; volume?: number } }>(`/api/devices/${encodeURIComponent(id)}/settings`))
      .then((r) => hearSettings(r.settings)).catch(() => {});
  }, []);
  const load = useCallback(() => {
    playerId().then((id) => api<PlayerState>(`/api/device/state?device=${id}`)).then((st) => setOwn(st.daemon ?? null)).catch(() => setOwn(null));
    api<typeof life>("/api/daemon/life").then(setLife).catch(() => {});
    api<{ party: typeof party }>("/api/party").then((r) => setParty(r.party)).catch(() => {});
    api<Profile>("/api/profile").then(setP).catch(() => {});
    api<Notebook>("/api/notebook").then(setNb).catch(() => {});
    api<{ items: Cast[] }>("/api/broadcasts").then((r) => setLast([...r.items].reverse().find((c) => !c.mine) ?? null)).catch(() => {});
  }, []);
  useEffect(load, [load]);
  // the phone's own; only once it is known to have none, the first away -- never another daemon shown first, then swapped
  const d = own === undefined ? null : own ?? party?.find((x) => x.away) ?? null;
  // as the DAEMON page and the boards tend it: the day's phrase (C-114), the boards' word, then the daemon's own line (C-196)
  const care = async (c: "feed" | "water" | "train") => {
    setSaid(c === "feed" ? "Eaten." : c === "water" ? "Drank." : "Trained.");
    if (ON_PHONE && soundLevel() > 0) {
      try { await setAudioModeAsync({ playsInSilentMode: false }); player.replace({ uri: careSound(c, note) }); player.volume = soundLevel(); player.play(); }
      catch { /* quiet is fine */ }
    }
    try { const r = await api<{ said?: string }>(`/api/daemon/${c}`, {}); if (r.said) setSaid(r.said); load(); }
    catch (e) { setSaid((e as Error).message); }
  };
  const unread = nb?.sections.flatMap((s) => s.pages).filter((x) => x.unread).length ?? 0;
  const songs = nb?.sections.find((s) => s.name === "SONGBOOK")?.pages.length ?? 0;
  const won = p?.casino?.pending ?? 0;
  const link = (t: (typeof TABS)[number]) => ({ cursor: "pointer" as const, role: "button" as const, hoverStyle: { borderColor: "$color9" }, onPress: () => goTo(t) });
  return (
    <>
      {d && life ? (
        <Card>
          <XStack gap={12} alignItems="center" {...link("daemon")}>
            <Art path={`/art/party/${d.slot}.png`} size={64} />
            <YStack flex={1} gap={2}>
              <Eyebrow>YOUR DAEMON</Eyebrow>
              <Text fontFamily="$mono" fontSize={16} fontWeight="700" color="$color12">{`${d.nickname} · ${life.word}`}</Text>
              <Small>{life.cue ?? `fed ${life.fed.today} · watered ${life.watered.today}`}</Small>
            </YStack>
            <Text fontSize={18} color="$color10">›</Text>
          </XStack>
          <XStack gap={8} flexWrap="wrap" marginTop={6}>
            <Action label="Feed" ink={ink} onPress={() => care("feed")} />
            <Action label="Drink" ink={ink} onPress={() => care("water")} />
            <Action label="Train" ink={ink} onPress={() => care("train")} />
          </XStack>
          {said ? <Small>{said}</Small> : null}
        </Card>
      ) : null}
      {last ? (
        <Card {...link("daemon")}>
          <Eyebrow>NEARBY</Eyebrow>
          <Text fontSize={15} color="$color12">{castLine(last)}</Text>
        </Card>
      ) : null}
      {p ? (
        <Card {...link("you")}>
          <Eyebrow>YOUR GAME</Eyebrow>
          <Text fontSize={15} color="$color12">{`${p.savedIn?.place ? `Saved in ${p.savedIn.place}` : "Saved"} · ${p.marks.filter(Boolean).length} MARKS · ${p.money.toLocaleString()}`}</Text>
          {won || p.casino?.spins ? <Small>{`The CASINO: ${won > 0 ? "+" : ""}${won.toLocaleString()} at the next SYNC.`}</Small> : null}
        </Card>
      ) : null}
      {unread || songs ? (
        <Card {...link("library")}>
          <Eyebrow>IN THE LIBRARY</Eyebrow>
          <Text fontSize={15} color="$color12">{[unread ? `${unread} NOTEBOOK page${unread === 1 ? "" : "s"} not yet read` : "", songs ? `${songs} song${songs === 1 ? "" : "s"} in the SONGBOOK` : ""].filter(Boolean).join(" · ")}</Text>
        </Card>
      ) : null}
    </>
  );
}
