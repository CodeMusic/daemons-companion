// ROUTINES -- THE CASINO (by server/src/slots.ts, the boards' table) and the party's game routines (C-155). (C-157: out of App.tsx.)
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { BETS, draw, OUTCOMES, PAYS, piecesFor, resultDetail, tableAct, type Piece } from "../../server/src/slots";
import { playerId } from "../data";
import { api } from "../net";
import { PlayerState } from "../types";
import { Action, Art, Card, Eyebrow, Small } from "../ui";
export const CASINO_BOOT = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
   // this start of the app
export let casinoSeq = 0;

export const SEASON_INK: Record<string, string> = { winter: "#9cc3e6", spring: "#7cc47c", summer: "#e8c547", autumn: "#d9822b" };

export function RoutinesCard({ ink }: { ink: string }) {
  const [open, setOpen] = useState<"casino" | "party" | null>(null);
  return (
    <Card>
      <Eyebrow>ROUTINES</Eyebrow>
      <XStack gap={8} flexWrap="wrap" marginTop={4}>
        <Action label={open === "casino" ? "Leave the CASINO" : "THE CASINO"} ink={ink} onPress={() => setOpen(open === "casino" ? null : "casino")} />
        <Action label={open === "party" ? "Close" : "YOUR PARTY'S ROUTINES"} ink={ink} onPress={() => setOpen(open === "party" ? null : "party")} />
      </XStack>
      {open === "casino" ? <Casino ink={ink} /> : null}
      {open === "party" ? <PartyRoutines /> : null}
    </Card>
  );
}

export function PartyRoutines() {
  const [st, setSt] = useState<PlayerState | null>(null);
  const [said, setSaid] = useState("");
  useEffect(() => { playerId().then((id) => api<PlayerState>(`/api/device/state?device=${id}`)).then(setSt).catch(() => {}); }, []);
  if (!st) return <Small>Asking the companion…</Small>;
  return (
    <YStack gap={10} marginTop={8}>
      {said ? <Text fontFamily="$mono" fontSize={14} fontWeight="700" color="$color12">{said}</Text> : null}
      {st.party.map((m, i) => (
        <YStack key={i} gap={4}>
          <Text fontFamily="$mono" fontSize={13} letterSpacing={1} color="$color11">{m.name}</Text>
          <XStack gap={6} flexWrap="wrap">
            {m.routines.map((r) => (
              <XStack key={r.name} paddingHorizontal={10} paddingVertical={6} borderRadius={4} borderWidth={2} borderColor={r.colour}
                      cursor="pointer" role="button" onPress={() => setSaid(`${m.name} used ${r.name}!`)}>
                <Text fontFamily="$mono" fontSize={12} color="$color12">{r.name}</Text>
              </XStack>
            ))}
          </XStack>
        </YStack>
      ))}
    </YStack>
  );
}

export function Casino({ ink }: { ink: string }) {
  const [id, setId] = useState<string | null>(null);
  const [st, setSt] = useState<PlayerState | null>(null);
  const [bet, setBet] = useState(BETS[0]);
  const [reels, setReels] = useState<Piece[]>([4, 0, 5]);
  const [spinning, setSpinning] = useState(false);
  const [said, setSaid] = useState("");
  const unsent = useRef({ delta: 0, spins: 0 });
  const [owed, setOwed] = useState(0);                      // what this player has won or lost that the companion has not heard
  const load = useCallback(async (who: string) => { setSt(await api<PlayerState>(`/api/device/state?device=${who}`)); }, []);
  const report = useCallback(async (who: string) => {
    const u = unsent.current;
    if (!u.spins) return;
    const detail = resultDetail(u.delta, CASINO_BOOT, ++casinoSeq, who, u.spins);
    unsent.current = { delta: 0, spins: 0 };
    try { await api("/api/device/interact", { kind: "casino", detail }); setOwed(0); await load(who); }
    catch { unsent.current = { delta: unsent.current.delta + u.delta, spins: unsent.current.spins + u.spins }; }
  }, [load]);
  useEffect(() => {
    let who = "";
    const seat = (how: "here" | "gone") => api("/api/device/interact", { kind: "table", detail: `${how} ${who}` }).catch(() => {});
    playerId().then((p) => { who = p; setId(p); load(p).catch(() => {}); seat("here"); });
    const t = setInterval(() => { if (who) { seat("here"); report(who); load(who).catch(() => {}); } }, 60000);
    return () => { clearInterval(t); if (who) { report(who); seat("gone"); } };
  }, [load, report]);
  if (!st || !id) return <Small>Taking a seat…</Small>;
  if (!st.casino) return <Small>The CASINO plays with your save's money: choose your save on SETTINGS first.</Small>;
  const balance = Math.max(0, Math.min(999999, st.casino.balance + owed));
  const jack = st.daemon?.slot ?? st.casino.friends[0];
  const friends = st.daemon ? st.casino.friends : st.casino.friends.slice(1);
  const pull = () => {
    if (spinning || bet > balance) return;
    const o = draw(), want = piecesFor(o), won = bet * PAYS[o] - bet;
    setSpinning(true); setSaid("");
    let ticks = 0;
    const t = setInterval(() => {
      ticks++;
      setReels((r) => r.map((p, i) => (ticks >= 9 + i * 4 ? want[i] : (((p + 1 + i) % 6) as Piece))));
      if (ticks >= 17) {
        clearInterval(t); setReels(want); setSpinning(false);
        unsent.current = { delta: unsent.current.delta + won, spins: unsent.current.spins + 1 };
        setOwed((n) => n + won);
        setSaid(o === 0 ? `-${bet}` : `${OUTCOMES[o] === "JACK3" ? "JACKPOT! " : ""}+${(bet * PAYS[o]).toLocaleString()}`);
        const act = tableAct(o);
        if (act) api("/api/broadcast", { kind: "act", act }).catch(() => {});
        if (unsent.current.spins >= 10) report(id);
      }
    }, 80);
  };
  const piece = (p: Piece) => {
    const slot = p === 0 ? jack : p <= 3 ? friends[p - 1] : undefined;
    if (slot !== undefined) return <Art path={`/art/party/${slot}.png`} size={72} />;
    if (p === 4) return <YStack width={56} height={56} borderRadius={28} backgroundColor="#e8b830" borderWidth={3} borderColor="#a07a10" />;
    if (p === 5) return <Text fontFamily="$mono" fontSize={14} fontWeight="800" color={SEASON_INK[st.season] ?? "$color12"}>{st.season.toUpperCase()}</Text>;
    return <Text fontFamily="$mono" fontSize={12} color="$color10">?</Text>;
  };
  return (
    <YStack gap={12} marginTop={10}>
      <XStack justifyContent="space-between" alignItems="baseline">
        <Text fontFamily="$mono" fontSize={13} letterSpacing={2} color="$color11">COINS</Text>
        <Text fontFamily="$mono" fontSize={22} fontWeight="800" color="$color12">{balance.toLocaleString()}</Text>
      </XStack>
      <XStack gap={8} justifyContent="center">
        {reels.map((p, i) => (
          <YStack key={i} width={88} height={88} borderRadius={6} borderWidth={2} borderColor="$color9" backgroundColor="$color2"
                  alignItems="center" justifyContent="center">{piece(p)}</YStack>
        ))}
      </XStack>
      {said ? <Text textAlign="center" fontFamily="$mono" fontSize={18} fontWeight="800" color={said.startsWith("-") ? "$color10" : "$color9"}>{said}</Text> : null}
      <XStack gap={6} flexWrap="wrap" justifyContent="center">
        {BETS.map((b) => (
          <XStack key={b} paddingHorizontal={10} paddingVertical={6} borderRadius={4} borderWidth={2}
                  borderColor={b === bet ? "$color9" : "$color5"} opacity={b > balance ? 0.35 : 1}
                  cursor="pointer" role="button" onPress={() => b <= balance && setBet(b)}>
            <Text fontFamily="$mono" fontSize={12} color="$color12">{b}</Text>
          </XStack>
        ))}
      </XStack>
      <Action label={spinning ? "…" : `PULL (${bet})`} ink={ink} onPress={pull} />
      <Small color="$color10">{`Three of ${st.daemon?.nickname ?? "your daemon"} pays fifty times. What you win or lose reaches your save at the next SYNC.`}</Small>
      {st.casino.table.length ? <Small>{`At the table: ${st.casino.table.map((t) => t.name).join(", ")}.`}</Small> : null}
    </YStack>
  );
}
