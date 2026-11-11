// C-328 (the user, 2026-11-11: "it would show the request on the other device and if u accept it, it would simulate what
// u see in game, where u take turns selecting moves and dealing damage -- where finally one of them is announced the
// winner (and exp is awarded for this too)"): THE BATTLE, over every screen as RECEIVED is. A request to this device
// shows here wherever the player is (ACCEPT, with which daemon, or DECLINE); a battle on shows the two daemons as the game
// lays them out -- the other's at the top right, this one's below on the left, each with its name, level and HP bar --
// the game's lines played one at a time in the box at the bottom, and then this side's four routines, with the seconds
// left to choose. The end says who outscored whom and the experience each gained (written at the next SYNC). The battle
// lines are the game's own words (data/battle.json); every other word here is DRAFT.
import { useEffect, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { Art } from "./ui";
import { act, arena, listen, type Arena, type Fight, type Line } from "../platform/battle";

const INK = "#1d2029", PAPER = "#fbfaf6", RULE = "#2b2f3a", FIELD = "#e8efe2", GOOD = "#3fae5a", MID = "#e0b13a", LOW = "#d4483b";
const STATUS: Record<string, string> = { psn: "LEAK", tox: "LEAK", brn: "HEAT", par: "THR", slp: "SUSP", frz: "HUNG" };   // DRAFT: the states, short
const LINE_MS = 1100;

export function useArena(): Arena | null {
  const [, tick] = useState(0);
  useEffect(() => listen(() => tick((n) => n + 1)), []);
  return arena();
}

// which battle is this device's to show now: one on, or a request to it, or one just over it has not put away
export function BattleOverlay() {
  const a = useArena();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  if (!a) return null;
  const f = a.fights.find((x) => x.phase === "on" && x.me !== null)
         ?? a.fights.find((x) => x.phase === "asked" && x.me === 1 && !closed.has(x.id))
         ?? a.fights.find((x) => x.phase === "over" && x.me !== null && !closed.has(x.id) && Date.now() - Date.parse(x.at) < 30 * 60_000);
  if (!f) return null;
  const close = () => setClosed((s) => new Set(s).add(f.id));
  return (
    <YStack position="absolute" top={0} left={0} right={0} bottom={0} zIndex={999} alignItems="center" justifyContent="center"
            backgroundColor="rgba(8,10,14,0.6)" padding={12} role="dialog" aria-label="BATTLE">
      <YStack borderWidth={3} borderColor={RULE} borderRadius={10} backgroundColor={PAPER} padding={4} width="100%" maxWidth={420}>
        {f.phase === "asked" ? <Asked f={f} a={a} onClose={close} /> : <Fought key={f.id} f={f} onClose={close} />}
      </YStack>
    </YStack>
  );
}

function Button({ label, onPress, strong, disabled }: { label: string; onPress: () => unknown; strong?: boolean; disabled?: boolean }) {
  return (
    <YStack borderWidth={2} borderColor={RULE} borderRadius={6} paddingHorizontal={14} paddingVertical={8} cursor={disabled ? "default" : "pointer"}
            backgroundColor={strong ? INK : PAPER} opacity={disabled ? 0.4 : 1} onPress={disabled ? undefined : onPress} role="button" aria-label={label}>
      <Text fontFamily="$mono" fontSize={14} fontWeight="700" letterSpacing={1} color={strong ? PAPER : INK} textAlign="center">{label}</Text>
    </YStack>
  );
}

// ---- a request to this device ----
function Asked({ f, a, onClose }: { f: Fight; a: Arena; onClose: () => void }) {
  const [pick, setPick] = useState<number | null>(a.daemon?.personality ?? a.away[0]?.personality ?? null);
  const [said, setSaid] = useState("");
  const theirs = f.sides[0].daemon;
  const answer = async (yes: boolean) => {
    try { await act("/api/battle/answer", { id: f.id, accept: yes, ...(yes && a.chooses && pick !== null ? { personality: pick } : {}) }); if (!yes) onClose(); }
    catch (e) { setSaid((e as Error).message); }
  };
  return (
    <YStack borderWidth={3} borderColor="$color9" borderRadius={7} padding={16} gap={12} alignItems="center">
      <Text fontFamily="$mono" fontSize={17} fontWeight="700" color={INK} textAlign="center">{f.asking}</Text>
      {theirs ? (
        <YStack alignItems="center" gap={4}>
          <Art path={`/art/species/${theirs.species}.png`} size={96} />
          <Text fontFamily="$mono" fontSize={13} color={INK}>{`${theirs.nickname} · LV ${theirs.level}`}</Text>
        </YStack>
      ) : null}
      {a.chooses && a.away.length ? (
        <YStack gap={6} width="100%">
          <Text fontSize={12} color="#6b7080">Fight with  · DRAFT</Text>
          <XStack flexWrap="wrap" gap={6}>
            {a.away.map((d) => (
              <XStack key={d.personality} alignItems="center" gap={6} borderWidth={2} borderRadius={6} paddingHorizontal={8} paddingVertical={4} cursor="pointer"
                      borderColor={pick === d.personality ? INK : "#c9ccd4"} onPress={() => setPick(d.personality!)} role="radio" aria-checked={pick === d.personality}>
                <Art path={`/art/species/${d.species}.png`} size={32} />
                <Text fontFamily="$mono" fontSize={12} color={INK}>{`${d.nickname} ${d.level}`}</Text>
              </XStack>
            ))}
          </XStack>
        </YStack>
      ) : !a.daemon ? <Text fontSize={12} color={LOW}>No daemon AWAY to fight with -- SEND one from the game.  DRAFT</Text> : null}
      <XStack gap={10}>
        <Button label="ACCEPT" strong onPress={() => answer(true)} disabled={a.chooses ? pick === null : !a.daemon} />
        <Button label="DECLINE" onPress={() => answer(false)} />
      </XStack>
      {said ? <Text fontSize={12} color={LOW} textAlign="center">{said}</Text> : null}
      <Text fontSize={11} color="#6b7080">Win or lose, every daemon comes back as it went.  DRAFT</Text>
    </YStack>
  );
}

// ---- the battle, as the game lays it out ----
function Bar({ hp, max }: { hp: number; max: number }) {
  const r = max ? hp / max : 0;
  return (
    <XStack alignItems="center" gap={4}>
      <Text fontFamily="$mono" fontSize={10} fontWeight="700" color={MID}>HP</Text>
      <YStack flex={1} height={7} borderRadius={4} backgroundColor="#4a4f5c" padding={1}>
        <YStack height={5} borderRadius={3} width={`${Math.max(0, Math.min(1, r)) * 100}%`} backgroundColor={r > 0.5 ? GOOD : r > 0.2 ? MID : LOW} />
      </YStack>
    </XStack>
  );
}
function Plate({ f, i, hp, showHP }: { f: Fight; i: 0 | 1; hp: number; showHP: boolean }) {
  const d = f.sides[i].daemon!;
  return (
    <YStack borderWidth={2} borderColor={RULE} borderRadius={6} backgroundColor={PAPER} paddingHorizontal={8} paddingVertical={4} width={176} gap={2}>
      <XStack justifyContent="space-between">
        <Text fontFamily="$mono" fontSize={13} fontWeight="700" color={INK} numberOfLines={1}>{d.nickname}</Text>
        <Text fontFamily="$mono" fontSize={12} color={INK}>{`LV${d.level}`}</Text>
      </XStack>
      <Bar hp={hp} max={d.maxHP} />
      <XStack justifyContent="space-between">
        <Text fontFamily="$mono" fontSize={10} color={LOW}>{STATUS[d.status] ?? ""}</Text>
        {showHP ? <Text fontFamily="$mono" fontSize={11} color={INK}>{`${hp}/ ${d.maxHP}`}</Text> : null}
      </XStack>
    </YStack>
  );
}

function Fought({ f, onClose }: { f: Fight; onClose: () => void }) {
  const me = (f.me ?? 0) as 0 | 1, them = (1 - me) as 0 | 1;
  const lines: Line[] = f.log.flat();
  const [shown, setShown] = useState(() => (f.phase === "over" ? 0 : lines.length));   // a battle opened midway starts where it is
  const [said, setSaid] = useState("");
  const [sent, setSent] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (shown >= lines.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), lines[shown]?.text ? LINE_MS : 350);
    return () => clearTimeout(t);
  }, [shown, lines.length]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  useEffect(() => { setSent(null); }, [f.turn]);
  const playing = shown < lines.length;
  // every line carries both HPs after it: the bars follow the last line shown (full health before the first)
  const seen = lines.slice(0, shown);
  const lastHP = [...seen].reverse().find((l) => l.hp)?.hp ?? null;
  const hp = (i: 0 | 1) => lastHP?.[i] ?? f.sides[i].daemon!.maxHP;
  const text = [...seen].reverse().find((l) => l.text)?.text ?? "";
  const left = f.deadline ? Math.max(0, Math.round((Date.parse(f.deadline) - now) / 1000)) : null;
  const mine = f.sides[me].daemon!, foe = f.sides[them].daemon!;
  const choose = async (slot: number) => {
    setSent(slot); setSaid("");
    try { await act("/api/battle/choose", { id: f.id, slot }); } catch (e) { setSent(null); setSaid((e as Error).message); }
  };
  const leave = async () => { try { await act("/api/battle/leave", { id: f.id }); } catch (e) { setSaid((e as Error).message); } };
  const over = f.phase === "over" && !playing;
  return (
    <YStack borderRadius={7} overflow="hidden">
      {/* the field: theirs at the top right, this one's lower left, as the game draws them */}
      <YStack backgroundColor={FIELD} padding={10} gap={6} height={250}>
        <XStack justifyContent="space-between" alignItems="flex-start">
          <Plate f={f} i={them} hp={hp(them)} showHP={false} />
          <YStack opacity={hp(them) <= 0 && !playing ? 0.15 : 1}><Art path={`/art/species/${foe.species}.png`} size={96} /></YStack>
        </XStack>
        <XStack justifyContent="space-between" alignItems="flex-end" flex={1}>
          <YStack style={{ transform: [{ scaleX: -1 }] }} opacity={hp(me) <= 0 && !playing ? 0.15 : 1}><Art path={`/art/species/${mine.species}.png`} size={104} /></YStack>
          <Plate f={f} i={me} hp={hp(me)} showHP />
        </XStack>
      </YStack>
      {/* the box at the bottom: the line being said, or what to do */}
      <YStack backgroundColor={INK} padding={6}>
        <YStack borderWidth={3} borderColor="#c6873b" borderRadius={6} backgroundColor={PAPER} padding={10} minHeight={92} gap={8} justifyContent="center">
          {playing || (!over && f.chosen[me]) || f.phase === "over" ? (
            <Text fontFamily="$mono" fontSize={15} color={INK} aria-live="polite">
              {playing ? text : over ? (f.draw ? "Both HALTED -- a draw.  DRAFT" : f.result ?? text) : `Waiting for ${f.sides[them].label}…  DRAFT`}
            </Text>
          ) : (
            <YStack gap={6}>
              <XStack justifyContent="space-between">
                <Text fontFamily="$mono" fontSize={13} color={INK}>{`What will ${mine.nickname} do?`}</Text>
                {left !== null ? <Text fontFamily="$mono" fontSize={13} fontWeight="700" color={left <= 10 ? LOW : INK}>{`${left}s`}</Text> : null}
              </XStack>
              <XStack flexWrap="wrap" gap={6}>
                {(mine.moves ?? []).map((m) => (
                  <YStack key={m.slot} width="48%" borderWidth={2} borderColor={sent === m.slot ? INK : "#c9ccd4"} borderRadius={6} padding={6}
                          opacity={m.pp > 0 ? 1 : 0.35} cursor={m.pp > 0 && sent === null ? "pointer" : "default"}
                          onPress={m.pp > 0 && sent === null ? () => choose(m.slot) : undefined} role="button" aria-label={`${m.name}, ${m.pp} of ${m.maxPP} MP`}>
                    <Text fontFamily="$mono" fontSize={13} fontWeight="700" color={INK} numberOfLines={1}>{m.name}</Text>
                    <XStack justifyContent="space-between">
                      <Text fontSize={10} color="#6b7080">{m.type ?? ""}</Text>
                      <Text fontFamily="$mono" fontSize={10} color={INK}>{`MP ${m.pp}/${m.maxPP}`}</Text>
                    </XStack>
                  </YStack>
                ))}
                {(mine.moves ?? []).every((m) => m.pp <= 0) ? <Button label="STRUGGLE" onPress={() => choose(-1)} /> : null}
              </XStack>
            </YStack>
          )}
        </YStack>
      </YStack>
      {over ? (
        <YStack padding={12} gap={8} alignItems="center">
          {f.exp[me] ? <Text fontFamily="$mono" fontSize={13} color={INK} textAlign="center">{`${mine.nickname} gained ${f.exp[me]} EXP. Points!`}</Text> : null}
          {f.forfeit === them ? <Text fontSize={12} color="#6b7080">{`${f.sides[them].label} left the battle.  DRAFT`}</Text> : null}
          <Text fontSize={11} color="#6b7080" textAlign="center">Its experience reaches the game at the next SYNC. Both daemons are back to full health.  DRAFT</Text>
          <Button label="OK" strong onPress={onClose} />
        </YStack>
      ) : (
        <XStack padding={8} justifyContent="space-between" alignItems="center">
          <Text fontSize={11} color="#6b7080">{`${f.sides[0].label} vs ${f.sides[1].label}${f.far ? " · on the exchange" : ""} · turn ${f.turn + 1}  · DRAFT`}</Text>
          <Text fontSize={12} color={LOW} cursor="pointer" onPress={leave} role="button" aria-label="Leave the battle">LEAVE</Text>
        </XStack>
      )}
      {said ? <Text fontSize={12} color={LOW} padding={8}>{said}</Text> : null}
    </YStack>
  );
}
