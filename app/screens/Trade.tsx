// C-218, C-219 (the user, 2026-10-28: "a trading mechanism ... another user can trade with"; decided by multiple choice):
// TRADE -- this companion's player on THE EXCHANGE (the hub's, on the home network and the tailnet). Join with a name
// (an invite code from the hub, unless this is the hub); offer a daemon that is AWAY, in full or on loan, to anyone or to
// one player; take another's offer with one of yours; call a loan home. Nothing moves in the game until each side's
// next SYNC writes it. Every word is DRAFT.
import { useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { api } from "../net";
import { Action, Art, Card, Choice, Entry, Eyebrow, Small, useInk } from "../ui";
import { useApi } from "../useApi";

type Brief = { player: string; personality: number; species: number; nickname: string; level: number; edition: string } | null;
type Offer = { id: string; at: string; kind: "full" | "loan" | "gift" | "item"; state: string; to: string | null; mine: boolean; from: Brief; with: Brief; done: boolean; held: boolean;
               side?: "from" | "with" | null; commons?: boolean;
               item?: { id: number; count: number; name: string }; given?: boolean };   // C-223: an item given, and whether it has left the giver's save
type Held = { item: number; count: number; name: string };   // C-223: an item this save could give
type Mine = { personality: number; species: number; name: string; nickname: string; level: number; busy: boolean };
// C-220: OUT TOGETHER
type OutOne = { id?: string; player: string; species: number; nickname: string; level: number; edition: string; name: string; until: string };
type Met = { id: string; at: string; a: OutOne; b: OutOne; lines: { who: "a" | "b"; said: string; by: "module" | "written" }[]; own?: boolean;
             trade?: "full" | "loan"; commons?: boolean };   // a trade's hello; with a friend's home (C-220, the commons lane)
type Out = { mine: OutOne | null; others: OutOne[]; met: Met[] };
// C-223: dreams shared at home
type SharedDream = { id: string; at: string; player: string; mine: boolean; species: number; nickname: string; quality: string; text: string; woke: string };
type View = { items?: Held[]; dreams?: SharedDream[] | null; out?: Out | null; hub: string | null; needsHub?: boolean; me: { id: string; name: string; password: boolean } | null; game: string | null; edition: string; away: Mine[];
              board: { open: Offer[]; trades: Offer[]; players: { id: string; name: string; commons?: boolean }[]; commons?: boolean;
                       friends?: { friends: Named[]; asked: Named[]; asks: Named[] } } | null;   // C-223
              pending: number; waiting: number };
type Named = { id: string; name: string };
type Commons = { url: string | null; error?: string; home: { id: string; name: string; approved: boolean; code: string; friends: Named[]; asks: Named[]; asked: Named[] } | null };

const who = (b: Brief) => (b ? `${b.nickname} · LV ${b.level}${b.edition ? ` · ${b.edition}` : ""}` : "");
const what = (o: Offer) => (o.item ? `${o.item.count} × ${o.item.name}` : who(o.from));   // C-223: an item, or the daemon offered
const STATE: Record<string, string> = { agreed: "agreed -- each side's next SYNC brings it", done: "traded", returning: "on its way home -- each side's next SYNC",
                                        returned: "home again", withdrawn: "withdrawn" };

export function TradeScreen({ ink }: { ink?: string }) {
  const dayInk = useInk();
  ink = ink ?? dayInk;
  const [v, setV, error] = useApi<View>("/api/trade");
  const [said, setSaid] = useState("");
  const [name, setName] = useState(""), [code, setCode] = useState(""), [pw, setPw] = useState(""), [hub, setHub] = useState("");
  const [kind, setKind] = useState<"full" | "loan" | "gift">("full");
  const [scope, setScope] = useState<"home" | "friends">("home");   // C-222: this home, or friends' homes on THE COMMONS
  const [to, setTo] = useState<string>("");   // a player's id, "" anyone, "friends" C-223
  const [giving, setGiving] = useState<string | null>(null);   // the offer being taken
  const [invite, setInvite] = useState<{ code: string; until: string } | null>(null);
  const reload = async () => setV(await api<View>("/api/trade"));
  const act = async (path: string, body: unknown, done: string) => { await api(path, body); setSaid(done); await reload(); };

  if (error) return <Card><Eyebrow>TRADE</Eyebrow><Small>{error}</Small><Small color="$color8">DRAFT</Small></Card>;
  if (!v) return null;
  const free = v.away.filter((d) => !d.busy);

  const hubCard = (
    <Card gap={6}>
      <Eyebrow>THE HUB</Eyebrow>
      <Small>{v.needsHub ? "Trading goes through a hub. Name its address here, then join." : v.hub ? `Trading through ${v.hub}.` : "This companion is the hub: other players trade here."}</Small>
      {/* plain http reaches the local network and the tailnet (*.ts.net, build 800 on) */}
      <Small color="$color10">Your hub's address: its name on your network or your tailnet.  DRAFT</Small>
      <XStack gap={8} flexWrap="wrap" alignItems="center">
        <Entry value={hub} onChange={setHub} onSubmit={() => {}} placeholder="http://your-hub:4730 (empty: this one)" limit={80} />
        <Action label="SET" ink={ink} onPress={() => act("/api/trade/hub", { url: hub }, hub ? `Trading through ${hub}. Join there.` : "This companion is the hub again.")} />
      </XStack>
    </Card>
  );
  if (v.needsHub) return <YStack gap={14}>{hubCard}{said ? <Small>{said}</Small> : null}<Small color="$color8">DRAFT</Small></YStack>;
  if (!v.me) return (
    <YStack gap={14}>
      <Card gap={6}>
        <Eyebrow>JOIN THE EXCHANGE</Eyebrow>
        <Small>Choose a player name. Other players see it beside the daemons you offer.</Small>
        <Entry value={name} onChange={setName} onSubmit={() => {}} placeholder="a name, 2 to 12 letters" limit={12} />
        {v.hub ? <Entry value={code} onChange={(s) => setCode(s.toUpperCase())} onSubmit={() => {}} placeholder="the invite code from the hub" limit={8} /> : null}
        <Entry value={pw} onChange={setPw} onSubmit={() => {}} placeholder="a password (only to join from another device)" limit={64} />
        <Action label="JOIN" ink={ink} onPress={() => act("/api/trade/join", { name, code, password: pw || undefined }, "Joined.")} />
        {said ? <Small>{said}</Small> : null}
      </Card>
      {hubCard}
      <Small color="$color8">DRAFT</Small>
    </YStack>
  );

  const b = v.board;
  const targets = (b?.players ?? []).filter((p) => p.id !== v.me!.id && !!p.commons === (scope === "friends"));
  const theirs = (b?.open ?? []).filter((o) => !o.mine), ours = (b?.open ?? []).filter((o) => o.mine);
  return (
    <YStack gap={14}>
      <Card gap={6}>
        <Eyebrow>{`TRADING AS ${v.me.name}`}</Eyebrow>
        <Small>{`Your game: ${v.game ?? "no save"} (${v.edition}). Only a daemon AWAY can be traded -- SEND it from the game first.`}</Small>
        {v.waiting || v.pending ? <Small>{`${v.waiting} waiting for your next SYNC.`}</Small> : null}
        {said ? <Small>{said}</Small> : null}
      </Card>

      <Card gap={6}>
        <Eyebrow>OFFER ONE OF YOURS</Eyebrow>
        {free.length ? (<>
          <Choice value={kind} ink={ink} onPick={setKind} options={[["full", "TRADE IT"], ["loan", "LEND IT"], ["gift", "GIVE IT"]]} />
          <Small>{kind === "full" ? "It becomes theirs, and theirs yours." : kind === "loan" ? "You each lend one. Either of you can call yours home, and both come back."
            : "It becomes theirs, and nothing comes back. Your next SYNC lets it go."}</Small>
          {b?.commons ? <Choice value={scope} ink={ink} onPick={(x) => { setScope(x as "home" | "friends"); setTo(""); }} options={[["home", "THIS HOME"], ["friends", "FRIENDS' HOMES"]] as ["home" | "friends", string][]} /> : null}
          {targets.length ? (
            <Choice value={to} ink={ink} onPick={setTo} options={[["", "ANYONE"], ...(scope === "home" && b?.friends?.friends.length ? [["friends", "FRIENDS"] as [string, string]] : []),
                                                                  ...targets.map((p) => [p.id, p.name] as [string, string])]} />
          ) : null}
          {free.map((d) => (
            <XStack key={d.personality} gap={10} paddingVertical={6} borderTopWidth={1} borderColor="$color5" alignItems="center">
              <YStack flex={1}><Text fontSize={15} color="$color12">{`${d.nickname} · LV ${d.level}`}</Text><Small>{d.name}</Small></YStack>
              <Action label="OFFER" ink={ink} onPress={() => act("/api/trade/offer", { personality: d.personality, kind, to: to && to !== "friends" ? to : undefined, friends: to === "friends", scope }, `${d.nickname} is ${kind === "gift" ? "offered as a gift" : "on offer"}${scope === "friends" ? " to friends' homes" : ""}.`)} />
            </XStack>
          ))}
        </>) : <Small>No daemon is AWAY and free to offer.</Small>}
      </Card>

      <Card gap={6}>
        <Eyebrow>OFFERS</Eyebrow>
        {!theirs.length && !ours.length ? <Small>Nobody is offering anything yet.</Small> : null}
        {theirs.map((o) => (
          <YStack key={o.id} gap={4} paddingVertical={6} borderTopWidth={1} borderColor="$color5">
            <Text fontSize={15} color="$color12">{`${o.from?.player}: ${what(o)}`}</Text>
            <Small>{o.kind === "loan" ? "A loan: each lends one." : o.kind === "gift" || o.kind === "item" ? "A gift: nothing is asked back." : "A trade."}{o.to ? ` For ${o.to}.` : ""}</Small>
            {o.kind === "item" ? <Action label="TAKE IT" ink={ink} onPress={() => act("/api/trade/accept", { offer: o.id, gift: true }, `Thank you! Once ${o.from?.player}'s next SYNC lets it go, yours puts it in your PC.`)} />
            : o.kind === "gift" ? <Action label="TAKE IT" ink={ink} onPress={() => act("/api/trade/accept", { offer: o.id, gift: true }, `Thank you! Your next SYNC brings ${o.from?.nickname}.`)} />
            : giving !== o.id ? <Action label="TAKE IT" ink={ink} onPress={() => setGiving(o.id)} /> : (
              <YStack gap={4}>
                <Small>Give which of yours?</Small>
                {free.map((d) => (
                  <Action key={d.personality} label={`${d.nickname} · LV ${d.level}`} ink={ink}
                          onPress={async () => { setGiving(null); await act("/api/trade/accept", { offer: o.id, personality: d.personality }, `Agreed. Your next SYNC brings ${o.from?.nickname}.`); }} />
                ))}
                <Action label="NOT NOW" ink={ink} onPress={() => setGiving(null)} />
              </YStack>
            )}
          </YStack>
        ))}
        {ours.map((o) => (
          <XStack key={o.id} gap={10} paddingVertical={6} borderTopWidth={1} borderColor="$color5" alignItems="center">
            <YStack flex={1}><Text fontSize={15} color="$color12">{`Yours: ${what(o)}`}</Text>
              <Small>{`${o.kind === "loan" ? "To lend" : o.kind === "gift" || o.kind === "item" ? "To give" : "To trade"}${o.to ? `, for ${o.to}` : ", to anyone"}`}</Small></YStack>
            <Action label="WITHDRAW" ink={ink} onPress={() => act("/api/trade/withdraw", { id: o.id }, "Withdrawn.")} />
          </XStack>
        ))}
      </Card>

      {v.items ? <ItemCard items={v.items} players={(b?.players ?? []).filter((p) => p.id !== v.me!.id && !p.commons)} friends={!!b?.friends?.friends.length} ink={ink} act={act} /> : null}
      <OutCard v={v} ink={ink} act={act} />
      {b?.friends ? <FriendsCard f={b.friends} players={(b.players ?? []).filter((p) => p.id !== v.me!.id && !p.commons)} ink={ink} act={act} /> : null}

      {v.dreams ? (
        <Card gap={6}>
          <Eyebrow>DREAMS SHARED</Eyebrow>
          {!v.dreams.length ? <Small>No dreams shared yet. SHARE one from your daemon's DREAMS.</Small> : null}
          {v.dreams.slice(0, 8).map((d) => (
            <XStack key={d.id} gap={10} paddingVertical={6} borderTopWidth={1} borderColor="$color5" alignItems="flex-start">
              {d.species ? <Art path={`/art/species/${d.species}.png`} size={40} /> : null}
              <YStack flex={1} gap={2}>
                <Text fontSize={15} color="$color12">{d.text}</Text>
                <Small color="$color10">{`${d.mine ? "Yours" : d.player}: ${d.nickname || "a daemon"}, a ${d.quality === "vivid" ? "deep" : d.quality === "broken" ? "restless" : "quiet"} night`}</Small>
                {d.mine ? <Action label="UNSHARE" ink={ink} onPress={() => act("/api/trade/unshare", { id: d.id }, "Unshared.")} /> : null}
              </YStack>
            </XStack>
          ))}
        </Card>
      ) : null}

      {(b?.trades ?? []).length ? (
        <Card gap={6}>
          <Eyebrow>YOUR TRADES</Eyebrow>
          {b!.trades.map((o) => (
            <YStack key={o.id} gap={2} paddingVertical={6} borderTopWidth={1} borderColor="$color5">
              {o.kind === "item" ? (<>
                <Text fontSize={15} color="$color12">{`${what(o)}  →  ${o.side === "from" ? o.with?.player : "you"}`}</Text>
                <Small>{`Gift ${o.side === "from" ? "to" : "from"} ${o.side === "from" ? o.with?.player : o.from?.player}: ${o.state === "done" ? "given" : o.state === "withdrawn" ? "called off"
                  : !o.given ? (o.side === "from" ? "your next SYNC lets it go" : `waiting for ${o.from?.player}'s next SYNC`) : (o.side === "from" ? "let go -- their next SYNC takes it" : "your next SYNC puts it in your PC")}`}</Small>
                {o.side === "from" && o.state === "agreed" && !o.given ? <Action label="CALL IT OFF" ink={ink} onPress={() => act("/api/trade/withdraw", { id: o.id }, "Called off. It stays in your game.")} /> : null}
              </>) : (<>
              <Text fontSize={15} color="$color12">{o.kind === "gift" ? `${who(o.from)}  →  ${o.side === "from" ? o.with?.player : "you"}` : `${who(o.from)}  ⇄  ${who(o.with)}`}</Text>
              <Small>{`${o.kind === "loan" ? "Loan" : o.kind === "gift" ? "Gift" : "Trade"} with ${o.side === "from" ? o.with?.player : o.from?.player}: ${o.kind === "gift" ? (o.state === "done" ? "given" : "agreed -- each side's next SYNC") : o.state === "agreed" && o.held ? "lent -- each of you holds the other's" : STATE[o.state] ?? o.state}`}</Small>
              {o.kind === "loan" && o.state === "agreed" ? <Action label="CALL MINE HOME" ink={ink} onPress={() => act("/api/trade/recall", { id: o.id }, "Called home. Each side's next SYNC brings its own back.")} /> : null}
              </>)}
            </YStack>
          ))}
        </Card>
      ) : null}

      {!v.hub ? (
        <Card gap={6}>
          <Eyebrow>INVITE A PLAYER</Eyebrow>
          <Small>Another player's companion joins this hub with a code. It works once, for fifteen minutes.</Small>
          <Action label="MAKE A CODE" ink={ink} onPress={async () => setInvite(await api("/api/exchange/invite", {}))} />
          {invite ? <Text fontFamily="$mono" fontSize={22} letterSpacing={4} color="$color12">{invite.code}</Text> : null}
        </Card>
      ) : null}
      {!v.hub ? <CommonsCard ink={ink} /> : null}
      {!v.me.password ? (
        <Card gap={6}>
          <Eyebrow>A PASSWORD</Eyebrow>
          <Small>{`Optional. With it, ${v.me.name} can join from another device.`}</Small>
          <XStack gap={8} flexWrap="wrap" alignItems="center">
            <Entry value={pw} onChange={setPw} onSubmit={() => {}} placeholder="at least 6 letters" limit={64} />
            <Action label="SET" ink={ink} onPress={async () => { await act("/api/trade/password", { password: pw }, "Password set."); setPw(""); }} />
          </XStack>
        </Card>
      ) : null}
      {hubCard}
      <Small color="$color8">DRAFT</Small>
    </YStack>
  );
}

// C-220 (the user, 2026-10-28: "if I send mine and so does another user ... we see both of them on screen and they
// interact -- they even chat"): OUT TOGETHER -- one AWAY daemon sent out (nothing leaves the game), another player's
// met, and the two talk; the hub's AI board says what it can in time, the rest is written. Every word DRAFT.
// C-223: an ITEM given, nothing back -- from the bag's ITEMS, BALLS and BERRIES and the PC (never a key item or a PLUGIN).
// The giver's next SYNC takes it out of the game; only then does the receiver's put it in their PC.
function ItemCard({ items, players, friends, ink, act }: { items: Held[]; players: Named[]; friends: boolean; ink: string;
                                                         act: (path: string, body: unknown, done: string) => Promise<void> }) {
  const [to, setTo] = useState(""), [count, setCount] = useState("1");
  return (
    <Card gap={6}>
      <Eyebrow>GIVE AN ITEM</Eyebrow>
      <Small>It becomes theirs, and nothing comes back. Your next SYNC takes it out of your game; theirs puts it in their PC.</Small>
      {!items.length ? <Small>Your bag and PC hold nothing that can be given. Key items and PLUGINS stay yours.</Small> : (<>
        <Choice value={count} ink={ink} onPick={setCount} options={[["1", "ONE"], ["5", "FIVE"], ["all", "ALL"]]} />
        {players.length ? <Choice value={to} ink={ink} onPick={setTo} options={[["", "ANYONE"], ...(friends ? [["friends", "FRIENDS"] as [string, string]] : []),
                                                                             ...players.map((p) => [p.id, p.name] as [string, string])]} /> : null}
        {items.slice(0, 30).map((it) => {
          const n = count === "all" ? Math.min(it.count, 99) : Math.min(Number(count), it.count);
          return (
            <XStack key={it.item} gap={10} paddingVertical={6} borderTopWidth={1} borderColor="$color5" alignItems="center">
              <YStack flex={1}><Text fontSize={15} color="$color12">{it.name}</Text><Small>{`You hold ${it.count}.`}</Small></YStack>
              <Action label={`GIVE ${n}`} ink={ink} onPress={() => act("/api/trade/offer", { kind: "item", item: it.item, count: n, to: to && to !== "friends" ? to : undefined, friends: to === "friends" },
                                                                        `${n} × ${it.name} offered as a gift.`)} />
            </XStack>
          );
        })}
      </>)}
    </Card>
  );
}

function OutCard({ v, ink, act }: { v: View; ink: string; act: (path: string, body: unknown, done: string) => Promise<void> }) {
  const [meeting, setMeeting] = useState<string | null>(null);
  const out = v.out;
  if (!out) return null;
  const mine = out.mine;
  return (
    <Card gap={6}>
      <Eyebrow>OUT TOGETHER</Eyebrow>
      <Small>Send one of your daemons out to meet other players' daemons. Nothing leaves your game: it is a visit.</Small>
      {mine ? (
        <XStack gap={10} alignItems="center">
          <Art path={`/art/species/${mine.species}.png`} size={56} />
          <YStack flex={1}><Text fontSize={15} color="$color12">{`${mine.nickname} is out · LV ${mine.level}`}</Text><Small>{mine.name}</Small></YStack>
          <Action label="CALL BACK" ink={ink} onPress={() => act("/api/trade/back", {}, `${mine.nickname} is home.`)} />
        </XStack>
      ) : v.away.length ? v.away.map((d) => (
        <XStack key={d.personality} gap={10} paddingVertical={6} borderTopWidth={1} borderColor="$color5" alignItems="center">
          <Art path={`/art/species/${d.species}.png`} size={40} />
          <YStack flex={1}><Text fontSize={15} color="$color12">{`${d.nickname} · LV ${d.level}`}</Text><Small>{d.name}</Small></YStack>
          <Action label="SEND OUT" ink={ink} onPress={() => act("/api/trade/out", { personality: d.personality }, `${d.nickname} is out.`)} />
        </XStack>
      )) : <Small>No daemon is AWAY -- SEND one from the game first.</Small>}
      {out.others.length ? <Small color="$color10">Out now:</Small> : <Small color="$color10">Nobody else is out yet.</Small>}
      {out.others.map((o) => (
        <XStack key={o.id} gap={10} paddingVertical={6} borderTopWidth={1} borderColor="$color5" alignItems="center">
          <Art path={`/art/species/${o.species}.png`} size={40} />
          <YStack flex={1}><Text fontSize={15} color="$color12">{`${o.player}: ${o.nickname} · LV ${o.level}`}</Text><Small>{o.name}</Small></YStack>
          {mine ? <Action label={meeting === o.id ? "MEETING..." : "MEET"} ink={ink} onPress={async () => {
            if (meeting) return;
            setMeeting(o.id!);
            try { await act("/api/trade/meet", { with: o.id }, `${mine.nickname} met ${o.nickname}.`); } finally { setMeeting(null); }
          }} /> : null}
        </XStack>
      ))}
      {out.met.slice(0, 3).map((m) => (
        <YStack key={m.id} gap={6} paddingVertical={8} borderTopWidth={1} borderColor="$color5">
          <XStack justifyContent="space-between" alignItems="flex-end">
            <YStack alignItems="center"><Art path={`/art/species/${m.a.species}.png`} size={64} /><Small>{m.a.nickname}</Small></YStack>
            <YStack alignItems="center"><Small color="$color10">{new Date(m.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Small>
              {m.trade ? <Small color="$color10">{m.trade === "loan" ? "a loan's hello" : "a trade's hello"}</Small>
                : m.own ? <Small color="$color10">met on their own</Small> : null}
              {m.commons ? <Small color="$color10">a friend's home</Small> : null}</YStack>
            <YStack alignItems="center"><YStack style={{ transform: [{ scaleX: -1 }] }}><Art path={`/art/species/${m.b.species}.png`} size={64} /></YStack><Small>{m.b.nickname}</Small></YStack>
          </XStack>
          {m.lines.map((l, i) => (
            <XStack key={i} justifyContent={l.who === "a" ? "flex-start" : "flex-end"}>
              <YStack maxWidth="80%" paddingHorizontal={10} paddingVertical={6} borderRadius={10} backgroundColor={l.who === "a" ? "$color4" : "$color5"}>
                <Text fontSize={14} color="$color12">{`${l.who === "a" ? m.a.nickname : m.b.nickname}: ${l.said}`}</Text>
              </YStack>
            </XStack>
          ))}
        </YStack>
      ))}
    </Card>
  );
}

// C-223 (the user, 2026-10-28, by multiple choice): FRIENDS at home -- ask a player, they ask back (or ACCEPT), and you
// are friends: an offer can then be for FRIENDS only. Every word DRAFT.
function FriendsCard({ f, players, ink, act }: { f: { friends: Named[]; asked: Named[]; asks: Named[] }; players: Named[]; ink: string;
                                                  act: (path: string, body: unknown, done: string) => Promise<void> }) {
  const known = new Set([...f.friends, ...f.asked, ...f.asks].map((x) => x.id));
  const others = players.filter((p) => !known.has(p.id));
  return (
    <Card gap={6}>
      <Eyebrow>FRIENDS</Eyebrow>
      {!f.friends.length && !f.asks.length && !f.asked.length ? <Small>Ask a player to be friends. Once they ask back, you can offer to friends only.</Small> : null}
      {f.asks.map((a) => (
        <XStack key={a.id} gap={10} alignItems="center" borderTopWidth={1} borderColor="$color5" paddingVertical={6}>
          <Text flex={1} fontSize={15} color="$color12">{`${a.name} asks to be friends.`}</Text>
          <Action label="ACCEPT" ink={ink} onPress={() => act("/api/trade/befriend", { id: a.id }, `${a.name} is a friend.`)} />
        </XStack>
      ))}
      {f.friends.map((x) => (
        <XStack key={x.id} gap={10} alignItems="center" borderTopWidth={1} borderColor="$color5" paddingVertical={6}>
          <Text flex={1} fontSize={15} color="$color12">{x.name}</Text>
          <Action label="FORGET" ink={ink} onPress={() => act("/api/trade/unfriend", { id: x.id }, `${x.name} is not a friend now.`)} />
        </XStack>
      ))}
      {f.asked.map((x) => <Small key={x.id}>{`Waiting for ${x.name} to ask back.`}</Small>)}
      {others.map((p) => (
        <XStack key={p.id} gap={10} alignItems="center" borderTopWidth={1} borderColor="$color5" paddingVertical={6}>
          <Text flex={1} fontSize={15} color="$color12">{p.name}</Text>
          <Action label="ASK" ink={ink} onPress={() => act("/api/trade/befriend", { id: p.id }, `Asked ${p.name}.`)} />
        </XStack>
      ))}
    </Card>
  );
}

// C-222: THE COMMONS, on the hub only -- this home linked to the commons (it waits for the keeper to let it in), its
// friend code, a friend added by theirs, asks to accept, friends to forget. Every word DRAFT.
function CommonsCard({ ink }: { ink: string }) {
  const [c, setC, error] = useApi<Commons>("/api/commons");
  const [url, setUrl] = useState(""), [name, setName] = useState(""), [code, setCode] = useState(""), [said, setSaid] = useState("");
  const again = async () => setC(await api<Commons>("/api/commons"));
  const friend = async (what: string, body: unknown, done: string) => { await api(`/api/commons/${what}`, body); setSaid(done); await again(); };
  if (error) return null;                                   // a companion that is not the hub has no commons of its own
  if (!c) return null;
  const h = c.home;
  return (
    <Card gap={6}>
      <Eyebrow>THE COMMONS</Eyebrow>
      {!c.url ? (<>
        <Small>Link this home to the commons, and trade with friends' homes. Your players and devices still talk only to this hub.</Small>
        <Entry value={url} onChange={setUrl} onSubmit={() => {}} placeholder="http://roverbyteseer:4750" limit={80} />
        <Entry value={name} onChange={setName} onSubmit={() => {}} placeholder="this home's name, as friends see it" limit={16} />
        <Action label="LINK" ink={ink} onPress={async () => { setC(await api<Commons>("/api/commons", { url, name })); setSaid("Linked. The commons' keeper lets this home in."); }} />
      </>) : !h ? (
        <Small>{`The commons at ${c.url} did not answer${c.error ? `: ${c.error}` : "."}`}</Small>
      ) : !h.approved ? (
        <Small>{`${h.name} is waiting for the commons' keeper to let it in.`}</Small>
      ) : (<>
        <Small>{`${h.name} on the commons. Give a friend this code; enter theirs to ask.`}</Small>
        <Text fontFamily="$mono" fontSize={22} letterSpacing={4} color="$color12">{h.code}</Text>
        <XStack gap={8} flexWrap="wrap" alignItems="center">
          <Entry value={code} onChange={(x) => setCode(x.toUpperCase())} onSubmit={() => {}} placeholder="a friend's code" limit={8} />
          <Action label="ASK" ink={ink} onPress={() => friend("friend", { code }, "Asked. They accept on their hub.")} />
        </XStack>
        {h.asks.map((a) => (
          <XStack key={a.id} gap={10} alignItems="center" borderTopWidth={1} borderColor="$color5" paddingVertical={6}>
            <Small>{`${a.name} asks to be friends.`}</Small>
            <Action label="ACCEPT" ink={ink} onPress={() => friend("friend/accept", { id: a.id }, `${a.name} is a friend.`)} />
          </XStack>
        ))}
        {h.asked.map((a) => <Small key={a.id}>{`Waiting for ${a.name} to accept.`}</Small>)}
        {h.friends.map((f) => (
          <XStack key={f.id} gap={10} alignItems="center" borderTopWidth={1} borderColor="$color5" paddingVertical={6}>
            <Text flex={1} fontSize={15} color="$color12">{f.name}</Text>
            <Action label="FORGET" ink={ink} onPress={() => friend("friend/forget", { id: f.id }, `${f.name} is not a friend now.`)} />
          </XStack>
        ))}
      </>)}
      {c.url ? <Action label="UNLINK" ink={ink} onPress={async () => { setC(await api<Commons>("/api/commons", { url: "" })); setSaid("Unlinked."); }} /> : null}
      {said ? <Small>{said}</Small> : null}
    </Card>
  );
}
