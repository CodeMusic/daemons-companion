// ROUTINES -- THE CASINO (by server/src/slots.ts, the boards' table) and the party's game routines (C-155). (C-157: out of App.tsx.)
import { useCallback, useEffect, useRef, useState } from "react";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { dayRoot, hearSettings, soundLevel, tuneSound } from "../tuneSound";
import { Text, XStack, YStack } from "tamagui";
import { almostThird, BETS, CAT, drawFrom, JACK, learn, nearChance, nearPieces, OUTCOMES, PAYS, piecesFor, pullReturn, resultDetail, STRIP, stopAt,
         stopNear, strip, tableAct, weightsFor, type Cat, type Piece } from "../../server/src/slots";
import { KIND_NAMES, playerId } from "../data";
import { api } from "../net";
import { CasinoHouse, PlayerState, Reason } from "../types";
import { Action, Art, Card, Eyebrow, Small } from "../ui";
export const CASINO_BOOT = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
   // this start of the app
export let casinoSeq = 0;

export const SEASON_INK: Record<string, string> = { winter: "#9cc3e6", spring: "#7cc47c", summer: "#e8c547", autumn: "#d9822b" };

export function RoutinesCard({ ink }: { ink: string }) {
  const [open, setOpen] = useState<"casino" | "house" | "party" | null>(null);
  return (
    <Card>
      <Eyebrow>ROUTINES</Eyebrow>
      <XStack gap={8} flexWrap="wrap" marginTop={4}>
        <Action label={open === "casino" ? "Leave the CASINO" : "THE CASINO"} ink={ink} onPress={() => setOpen(open === "casino" ? null : "casino")} />
        <Action label={open === "house" ? "Close" : "THE HOUSE"} ink={ink} onPress={() => setOpen(open === "house" ? null : "house")} />
        <Action label={open === "party" ? "Close" : "YOUR PARTY'S ROUTINES"} ink={ink} onPress={() => setOpen(open === "party" ? null : "party")} />
      </XStack>
      {open === "casino" ? <Casino ink={ink} /> : null}
      {open === "house" ? <House ink={ink} /> : null}
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
  // C-158: the cat and the string (slots.ts) -- this player's own, learning each pull; `beside`, the piece a near miss
  // shows one place off the line on the third reel
  const run = useRef<{ o: number; want: Piece[]; at: (number | null)[]; started: number; beside: Piece | null } | null>(null);
  const cat = useRef<Cat>(CAT);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const unsent = useRef({ delta: 0, spins: 0 });
  const [owed, setOwed] = useState(0);                      // what this player has won or lost that the companion has not heard
  const player = useAudioPlayer(null);
  const luck = useRef(0);                                   // the day's, from the state (context.ts), for the seat's line
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
    // C-158: sitting here says the odds this player plays at, every half minute, for THE HOUSE -- the return in a
    // thousand, the string's reach in hundredths, pulls without a win and wins running (casino.ts's seated)
    const seat = (how: "here" | "gone") => {
      const c = cat.current, ret = Math.round(pullReturn(luck.current, c) * 1000);
      const odds = how === "here" ? ` ${ret} ${Math.round(c.reach * 100)} ${Math.min(c.dry, 99999)} ${Math.min(c.streak, 9999)}` : "";
      return api("/api/device/interact", { kind: "table", detail: `${how} ${who}${odds}` }).catch(() => {});
    };
    playerId().then((p) => { who = p; setId(p); load(p).then(() => seat("here")).catch(() => seat("here")); });
    let n = 0;
    const t = setInterval(() => { if (who) { seat("here"); if (++n % 2 === 0) { report(who); load(who).catch(() => {}); } } }, 30000);
    return () => { clearInterval(t); if (tick.current) clearInterval(tick.current); if (who) { report(who); seat("gone"); } };
  }, [load, report]);
  if (!st || !id) return <Small>Taking a seat…</Small>;
  if (!st.casino) return <Small>The CASINO plays with your save's money: choose your save on SETTINGS first.</Small>;
  luck.current = st.casino.context?.luck ?? 0;
  hearSettings(st.settings);
  const balance = Math.max(0, Math.min(999999, st.casino.balance + owed));
  const jack = st.daemon?.slot ?? st.casino.friends[0];
  const friends = st.daemon ? st.casino.friends : st.casino.friends.slice(1);
  const reel = st.casino.reel ?? [];                        // C-158: the reels' others, seen in the game, at home now first
  const spinning = stopped.some((x) => !x);
  // C-160: the boards' own casino tunes (firmware/esp32/src/sound.cpp soundSlots), on the day's note: the lever, a loss, a
  // small win, a big one or the jackpot -- a big win on a holiday plays the holiday's own (Halloween, Christmas ...)
  const root = dayRoot(st.day?.note);
  const sound = (what: 0 | 1 | 2 | 3 | 4) => {
    const look = st.holiday?.look ?? "";
    const [name, level] = what === 0 ? ["SLOTS_PULL", 0.8] : what === 1 ? ["SLOTS_LOSE", 0.5] : what === 2 ? ["SLOTS_WIN", 0.85]
      : look === "pumpkins" ? ["SLOTS_SPOOKY", 0.9] : look === "presents" ? ["SLOTS_JINGLE", 0.9]
      : look === "fireworks" ? ["SLOTS_FIREWORK", 0.9] : look === "hearts" ? ["SLOTS_SWEET", 0.85]
      : what === 3 ? ["SLOTS_BIG", 0.9] : ["SLOTS_JACKPOT", 1];
    const loud = soundLevel(st.settings) * (level as number);   // C-160: this player's own SOUND -- off is silent
    if (!loud) return;
    const uri = tuneSound(name as string, root, Math.round(loud * 20) / 20);
    if (uri) setAudioModeAsync({ playsInSilentMode: false }).catch(() => {}).finally(() => { player.replace({ uri }); player.play(); });
  };
  const settle = (o: number, near: boolean) => {
    const won = bet * PAYS[o] - bet;
    cat.current = learn(cat.current, o);
    sound(o === 0 ? 1 : OUTCOMES[o] === "JACK3" ? 4 : PAYS[o] >= 12 ? 3 : 2);
    unsent.current = { delta: unsent.current.delta + won, spins: unsent.current.spins + 1 };
    setOwed((n) => n + won);
    setSaid(o === 0 ? (near ? `SO CLOSE  -${bet}` : `-${bet}`) : near ? "ALMOST THE JACKPOT" : "");   // DRAFT
    if (o) { setBanner(`${OUTCOMES[o] === "JACK3" ? "JACKPOT! " : "WIN "}${(bet * PAYS[o]).toLocaleString()}`); setTimeout(() => setBanner(null), 2600); }
    const act = tableAct(o);
    if (act) api("/api/broadcast", { kind: "act", act }).catch(() => {});
    if (unsent.current.spins >= 10) report(id);
  };
  const stop = (i: number) => {
    const r = run.current;
    if (!r || r.at[i] !== null) return;
    setPos((p) => { r.at[i] = stopFor(r, i, p[i]); return p; });
  };
  // where reel i stops: on its piece -- the third with the piece it wanted beside the line, for a near miss
  const stopFor = (r: NonNullable<typeof run.current>, i: number, p: number) =>
    i === 2 && r.beside !== null ? stopNear(strips.current[i], p, r.want[i], r.beside) : stopAt(strips.current[i], p, r.want[i]);
  const pull = () => {
    if (spinning || bet > balance) return;
    // C-158: the table for this pull -- the day's return moved by the string -- and a loss often falls near; a 2x is
    // "almost the jackpot", a third JACK beside the line
    const c = cat.current, o = drawFrom(weightsFor(pullReturn(luck.current, c)));
    let want: Piece[] = piecesFor(o), beside: Piece | null = null;
    // the third piece chosen from what sits beside the wanted one on that reel, so a near miss is truly near (where none
    // comes round, a plain loss or a plain 2x)
    if (o === 0 && Math.random() < nearChance(c)) { const n = nearPieces(strips.current[2]); if (n) { want = n.pieces; beside = n.wanted; } }
    else if (OUTCOMES[o] === "JACK2") { const t = almostThird(strips.current[2]); if (t !== null) { want = [JACK as Piece, JACK as Piece, t]; beside = JACK as Piece; } }
    sound(0);
    run.current = { o, want, at: [null, null, null], started: Date.now(), beside };
    setStopped([false, false, false]); setBanner(null); setSaid("");
    if (tick.current) clearInterval(tick.current);
    tick.current = setInterval(() => {
      const r = run.current!;
      const age = Date.now() - r.started;
      setPos((p) => p.map((v, i) => (r.at[i] !== null && v >= (r.at[i] as number) ? v : v + 1)));
      setPos((p) => {
        [0, 1, 2].forEach((i) => { if (r.at[i] === null && age > 2200 + i * 500) r.at[i] = stopFor(r, i, p[i]); });
        const done = p.map((v, i) => r.at[i] !== null && v >= (r.at[i] as number));
        setStopped(done);
        if (done.every(Boolean)) { clearInterval(tick.current!); tick.current = null; run.current = null; settle(r.o, r.beside !== null); }
        return p;
      });
    }, 70);
  };
  const piece = (p: Piece, size: number) => {
    if (p >= 1 && p <= 3 && reel[p - 1]) return <Art path={`/art/species/${reel[p - 1].species}.png`} size={size} />;
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

// C-158 (the user, 2026-10-18: "a casino admin section where you can see who all is gambling and the current odds the
// instance is experiencing -- clicking on it explains why those odds are active (eg win streak, holiday, etc)"): THE HOUSE,
// from GET /api/casino -- the day's odds and everyone at the reels, each opening on its reasons. Every word DRAFT.
const seatName = (device: string) => {
  if (device.startsWith("site-")) return "A site";
  const kind = Object.keys(KIND_NAMES).filter((k) => device.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return kind ? KIND_NAMES[kind] : device;
};
const back = (rtp: number) => `${(rtp * 100).toFixed(1)} back of every 100`;
// a reason's part in points of return: the day's luck moves it 5 a whole step (slots.ts RETURN_AT); the string's is said so
const points = (r: Reason) => { const n = r.source === "the string" ? r.effect : r.effect * 5; return `${n > 0 ? "+" : ""}${n.toFixed(1)}`; };
function Reasons({ reasons }: { reasons: Reason[] }) {
  return (
    <YStack gap={3} marginTop={6} paddingLeft={10} borderLeftWidth={2} borderColor="$color6">
      {reasons.map((r, i) => (
        <XStack key={i} gap={8} alignItems="baseline">
          <Text width={44} textAlign="right" fontFamily="$mono" fontSize={12} fontWeight="700"
                color={r.effect > 0 ? "#3f8f4f" : r.effect < 0 ? "#b0413e" : "$color10"}>{points(r)}</Text>
          <Text flex={1} fontSize={14} color="$color12">{r.why}</Text>
        </XStack>
      ))}
    </YStack>
  );
}
export function House({ ink }: { ink: string }) {
  const [h, setH] = useState<CasinoHouse | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const get = () => api<CasinoHouse>("/api/casino").then((v) => { setH(v); setFailed(false); }).catch(() => setFailed(true));
    get();
    const t = setInterval(get, 15000);
    return () => clearInterval(t);
  }, []);
  if (!h) return <Small>{failed ? "THE HOUSE is kept on the computer: it answers when the phone can reach it." : "Asking the house…"}</Small>;
  const w = h.world?.weather;
  return (
    <YStack gap={8} marginTop={10}>
      <YStack padding={10} borderRadius={6} borderWidth={1} borderColor="$color6" cursor="pointer" role="button"
              onPress={() => setOpen(open === "day" ? null : "day")}>
        <Eyebrow>TODAY'S ODDS</Eyebrow>
        <Text fontFamily="$mono" fontSize={18} fontWeight="700" color="$color12">{back(h.context.rtp)}</Text>
        <Small>{`${h.holiday?.name ? `${h.holiday.name} · ` : ""}${(h.world?.watch ?? "").toLowerCase()}${w ? ` · ${w.kind}, ${Math.round(w.tempC)}°C in ${w.city}` : " · no city set for the weather (SETTINGS)"}`}</Small>
        {open === "day" ? <Reasons reasons={h.context.reasons} /> : <Small color={ink}>Why ›</Small>}
      </YStack>
      <Eyebrow>AT THE REELS</Eyebrow>
      {h.players.length === 0 ? <Small color="$color10">Nobody is playing just now.</Small> : null}
      {h.players.map((p) => (
        <YStack key={p.device} padding={10} borderRadius={6} borderWidth={1} borderColor="$color6" cursor="pointer" role="button"
                onPress={() => setOpen(open === p.device ? null : p.device)}>
          <XStack gap={10} alignItems="center">
            {p.species ? <Art path={`/art/species/${p.species}.png`} size={44} /> : <YStack width={44} height={44} />}
            <YStack flex={1}>
              <Text fontFamily="$mono" fontSize={14} fontWeight="700" color="$color12">{p.name}</Text>
              <Small>{`${seatName(p.device)} · ${p.odds ? back(p.odds.rtp) : "the day's odds"}`}</Small>
            </YStack>
          </XStack>
          {open === p.device ? (<>
            {p.odds ? <Small color="$color10">{`${p.odds.dry} pulls since a win · ${p.odds.streak} wins running · the string at ${p.odds.reach > 0 ? "+" : ""}${p.odds.reach.toFixed(2)}`}</Small> : null}
            <Reasons reasons={p.reasons} />
          </>) : null}
        </YStack>
      ))}
      <Small color="$color10">Every table keeps between 90 and 100 back of every 100 bet over many pulls: the day sets where,
        and each player's run of luck moves a pull a little either way.</Small>
    </YStack>
  );
}
