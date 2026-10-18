// ROUTINES -- THE CASINO (by server/src/slots.ts, the boards' table) and the party's game routines (C-155). (C-157: out of App.tsx.)
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { BETS, draw, OUTCOMES, PAYS, piecesFor, resultDetail, STRIP, stopAt, strip, tableAct, type Piece } from "../../server/src/slots";
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
  // C-158 (the user, 2026-10-18: "the phone casino needs to be more like the devices"): three reels that scroll their strips
  // (each piece twice, as casino.cpp's), the payline the middle row; a pull decides the result, and each reel slips on to
  // its piece when STOPped (or by itself) -- stopping is the fun of it, not a skill (slots.ts)
  const strips = useRef<Piece[][]>([strip(), strip(), strip()]);
  const [pos, setPos] = useState<number[]>([0, 4, 8]);
  const [stopped, setStopped] = useState<boolean[]>([true, true, true]);
  const run = useRef<{ o: number; want: Piece[]; at: (number | null)[]; started: number } | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
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
    return () => { clearInterval(t); if (tick.current) clearInterval(tick.current); if (who) { report(who); seat("gone"); } };
  }, [load, report]);
  if (!st || !id) return <Small>Taking a seat…</Small>;
  if (!st.casino) return <Small>The CASINO plays with your save's money: choose your save on SETTINGS first.</Small>;
  const balance = Math.max(0, Math.min(999999, st.casino.balance + owed));
  const jack = st.daemon?.slot ?? st.casino.friends[0];
  const friends = st.daemon ? st.casino.friends : st.casino.friends.slice(1);
  const spinning = stopped.some((x) => !x);
  const settle = (o: number) => {
    const won = bet * PAYS[o] - bet;
    unsent.current = { delta: unsent.current.delta + won, spins: unsent.current.spins + 1 };
    setOwed((n) => n + won);
    setSaid(o === 0 ? `-${bet}` : "");
    if (o) { setBanner(`${OUTCOMES[o] === "JACK3" ? "JACKPOT! " : "WIN "}${(bet * PAYS[o]).toLocaleString()}`); setTimeout(() => setBanner(null), 2600); }
    const act = tableAct(o);
    if (act) api("/api/broadcast", { kind: "act", act }).catch(() => {});
    if (unsent.current.spins >= 10) report(id);
  };
  const stop = (i: number) => {
    const r = run.current;
    if (!r || r.at[i] !== null) return;
    setPos((p) => { r.at[i] = stopAt(strips.current[i], p[i], r.want[i]); return p; });
  };
  const pull = () => {
    if (spinning || bet > balance) return;
    const o = draw();
    run.current = { o, want: piecesFor(o), at: [null, null, null], started: Date.now() };
    setStopped([false, false, false]); setBanner(null); setSaid("");
    if (tick.current) clearInterval(tick.current);
    tick.current = setInterval(() => {
      const r = run.current!;
      const age = Date.now() - r.started;
      setPos((p) => p.map((v, i) => (r.at[i] !== null && v >= (r.at[i] as number) ? v : v + 1)));
      setPos((p) => {
        [0, 1, 2].forEach((i) => { if (r.at[i] === null && age > 2200 + i * 500) r.at[i] = stopAt(strips.current[i], p[i], r.want[i]); });
        const done = p.map((v, i) => r.at[i] !== null && v >= (r.at[i] as number));
        setStopped(done);
        if (done.every(Boolean)) { clearInterval(tick.current!); tick.current = null; run.current = null; settle(r.o); }
        return p;
      });
    }, 70);
  };
  const piece = (p: Piece, size: number) => {
    const slot = p === 0 ? jack : p <= 3 ? friends[p - 1] : undefined;
    if (slot !== undefined) return <Art path={`/art/party/${slot}.png`} size={size} />;
    if (p === 4) return <YStack width={size * 0.6} height={size * 0.6} borderRadius={size} backgroundColor="#f2c230" borderWidth={3} borderColor="#a07a10" />;
    if (p === 5) return <Text fontFamily="$mono" fontSize={12} fontWeight="800" color={SEASON_INK[st.season] ?? "#fbfaf6"}>{(st.holiday?.name ?? st.season).toUpperCase()}</Text>;
    return <Text fontFamily="$mono" fontSize={12} color="#9aa0aa">?</Text>;
  };
  const bets = BETS.filter((b) => b <= Math.max(balance, BETS[0]));
  const betBy = (d: number) => { const i = Math.max(0, Math.min(bets.length - 1, bets.indexOf(bet) + d)); setBet(bets[i] ?? BETS[0]); };
  const table = st.casino.table;
  const CELL = 66;
  return (
    <YStack gap={8} marginTop={10}>
      {/* the band, as the boards': CASINO and what it is dressed for, in the day's colour or the holiday's */}
      <XStack backgroundColor={st.holiday?.colours?.[0] ?? "$color9"} paddingHorizontal={12} paddingVertical={7} borderRadius={4}>
        <Text fontFamily="$mono" fontSize={14} letterSpacing={2} fontWeight="700" color={st.holiday ? "#fbfaf6" : ink}>
          {`CASINO   ${(st.holiday?.name ?? st.season).toUpperCase()}`}</Text>
      </XStack>
      {table.length ? <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color10">{`AT THE TABLE: ${table[0].name}${table.length > 1 ? ` +${table.length - 1}` : ""}`}</Text> : null}
      {/* the reels: each shows three of its strip, the middle row the payline between the arrows */}
      <YStack position="relative">
        <XStack gap={8} justifyContent="center" alignItems="center">
          <Text fontSize={14} color="#f2c230">▶</Text>
          {[0, 1, 2].map((i) => (
            <YStack key={i} flex={1} maxWidth={110} height={CELL * 3} borderRadius={8} backgroundColor="#25282e" overflow="hidden"
                    alignItems="center" justifyContent="space-around">
              {[-1, 0, 1].map((d) => (
                <YStack key={d} height={CELL} alignItems="center" justifyContent="center" opacity={d === 0 ? 1 : 0.55}>
                  {piece(strips.current[i][(((pos[i] + d) % STRIP) + STRIP) % STRIP], CELL - 8)}
                </YStack>
              ))}
            </YStack>
          ))}
          <Text fontSize={14} color="#f2c230">◀</Text>
        </XStack>
        {banner ? (
          <XStack position="absolute" top={8} alignSelf="center" backgroundColor="#f6c445" paddingHorizontal={18} paddingVertical={6} borderRadius={10}>
            <Text fontFamily="$mono" fontSize={22} fontWeight="800" color="#2b2310">{banner}</Text>
          </XStack>
        ) : null}
      </YStack>
      {/* the info row, as the boards': MONEY and BET */}
      <XStack justifyContent="space-between" alignItems="baseline" paddingHorizontal={6}>
        <Text fontFamily="$mono" fontSize={16} fontWeight="700" color="$color12">{`MONEY ${balance.toLocaleString()}`}</Text>
        <Text fontFamily="$mono" fontSize={14} fontWeight="700" color="$color9">{`BET ${bet}`}</Text>
        <Text fontFamily="$mono" fontSize={12} color="$color10">{said}</Text>
      </XStack>
      {/* the keys, labelled as the boards' are: BET - SPIN BET +, and STOP for each reel while they turn */}
      <XStack gap={8}>
        {spinning ? [0, 1, 2].map((i) => (
          <YStack key={i} flex={1}><Action label={stopped[i] ? "·" : "STOP"} ink={ink} onPress={() => stop(i)} /></YStack>
        )) : (<>
          <YStack flex={1}><Action label="BET -" ink={ink} onPress={() => betBy(-1)} /></YStack>
          <YStack flex={1}><Action label="SPIN" ink={ink} onPress={pull} /></YStack>
          <YStack flex={1}><Action label="BET +" ink={ink} onPress={() => betBy(1)} /></YStack>
        </>)}
      </XStack>
      <Small color="$color10">{`Three of ${st.daemon?.nickname ?? "your daemon"} pays fifty times. What you win or lose reaches your save at the next SYNC.`}</Small>
    </YStack>
  );
}
