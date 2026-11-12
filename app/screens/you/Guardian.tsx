// C-226 (docs/ACCOUNTS.md; the user, 2026-11-11): GUARDIAN -- the account a grown-up holds, and the kids' profiles in it.
// Signed out: sign in with Apple (a build that carries it), or open one profile on this device with the guardian's
// code. A kid's device: which profile it is, and a way to leave it. Signed in: the profiles, each named from the two
// lists (never typed), its controls (safest first), its friends-only nickname, a code to open it on a device, the
// devices it is open on; then sign out, or delete everything. Piece 4: each profile's friend code, the friends waiting
// for the guardian's yes, the players it blocks, its LEDGER (every trade, loan and gift), and PLAY AS IT HERE -- this
// companion's player on the exchange claimed into the profile. Every word is DRAFT; it all lives on THE COMMONS, reached
// through the hub (platform/accounts.ts).
import { useCallback, useEffect, useState } from "react";
import { Pressable } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { accounts, appleHere, appleToken, grownUpHere, keepToken, readToken } from "../../platform/accounts";
import { api } from "../../platform/net";
import { Action, Card, Entry, Eyebrow, Pending, Segments, Small, useInk } from "../../ui/ui";

type Controls = { friends: "approve" | "own"; trade: "friends" | "home" | "lobby"; meet: "friends" | "trades" | "off"; lobby: "off" | "on" };
type Profile = { id: string; name: string; tag: number; first: number; second: number; nickname: string | null; controls: Controls; at: string;
                 devices?: { id: string; label: string; at: string }[];
                 code?: string; waiting?: { player: string; name: string }[]; blocked?: { player: string; name: string }[] };   // piece 4
type Brief = { player: string | null; nickname: string; level: number } | null;
type Ledger = { offers: { id: string; at: string; kind: string; state: string; side: "from" | "with" | null; from: Brief; with: Brief; item?: { count: number; name: string } }[];
                friends: { friends: { id: string; name: string }[] } };
const KINDS: Record<string, string> = { full: "TRADE", loan: "LOAN", gift: "GIFT", item: "ITEM" };
type GuardianView = { id: string; provider: string; profiles: Profile[]; passkeys: { id: string; label: string }[] };
type Names = { first: (string | null)[]; second: (string | null)[]; dev?: boolean };

const CONTROLS: { key: keyof Controls; label: string; options: [string, string][] }[] = [
  { key: "friends", label: "FRIENDS", options: [["approve", "I APPROVE"], ["own", "IT DECIDES"]] },
  { key: "trade", label: "TRADES WITH", options: [["friends", "FRIENDS"], ["home", "+ HOME"], ["lobby", "+ LOBBY"]] },
  { key: "meet", label: "MEETINGS", options: [["friends", "FRIENDS"], ["trades", "TRADES"], ["off", "OFF"]] },
  { key: "lobby", label: "THE LOBBY", options: [["off", "OFF"], ["on", "ON"]] },
];
const when = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function GuardianCard({ ink: given }: { ink?: string }) {
  const dayInk = useInk(), ink = given ?? dayInk;
  const [names, setNames] = useState<Names | null>(null);
  const [me, setMe] = useState<GuardianView | null>(null);
  const [mine, setMine] = useState<Profile | null>(null);           // a kid's device: the one profile it is
  const [apple, setApple] = useState(false);
  const [said, setSaid] = useState(""), [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try { setNames(await accounts<Names>("names")); } catch (e) { setError((e as Error).message); setLoaded(true); return; }
    const [g, p] = await Promise.all([readToken("guardian"), readToken("profile")]);
    if (g) { try { setMe(await accounts<GuardianView>("me")); } catch { await keepToken("guardian", null); setMe(null); } } else setMe(null);
    if (p) { try { setMine(await accounts<Profile>("profile/me")); } catch { await keepToken("profile", null); setMine(null); } } else setMine(null);
    setLoaded(true);
  }, []);
  useEffect(() => { load(); appleHere().then(setApple); }, [load]);

  const act = async (what: () => Promise<unknown>, done: string) => {
    setSaid(""); setError("");
    try { await what(); setSaid(done); await load(); } catch (e) { setError((e as Error).message); }
  };
  const signedIn = async (r: { token: string }) => { await keepToken("guardian", r.token); };

  if (!loaded) return <Pending title="GUARDIAN" height={[129, 109]} />;   // C-344: its place held until the first answer
  if (!names) return (
    <Card gap={6}><Eyebrow>GUARDIAN</Eyebrow><Small>{error || "Accounts are not reachable from here."}</Small><Small color="$color8">DRAFT</Small></Card>
  );

  // ---- signed in: the guardian's page
  if (me) return (
    <Card gap={10}>
      <Eyebrow>GUARDIAN</Eyebrow>
      <Small>{`Signed in with ${me.provider === "apple" ? "Apple" : me.provider === "google" ? "Google" : me.provider}. Each profile below is a player; its name is built from two lists, never typed.`}</Small>
      {me.profiles.map((p) => <ProfileRow key={p.id} p={p} ink={ink} act={act} />)}
      <NewProfile names={names} ink={ink} add={(first, second) => act(() => accounts("profile", { first, second }), "Profile added.")} />
      <XStack gap={8} flexWrap="wrap">
        <Action label="SIGN OUT" ink={ink} onPress={() => act(async () => { await accounts("signout", {}).catch(() => {}); await keepToken("guardian", null); }, "Signed out.")} />
      </XStack>
      <DeleteAll ink={ink} onDelete={() => act(async () => { await accounts("delete", { confirm: "DELETE" }); await keepToken("guardian", null); }, "Everything is deleted.")} />
      {said ? <Small>{said}</Small> : null}
      {error ? <Small color="$red10">{error}</Small> : null}
      <Small color="$color8">DRAFT</Small>
    </Card>
  );

  // ---- a kid's device, or signed out
  return (
    <Card gap={8}>
      <Eyebrow>GUARDIAN</Eyebrow>
      {mine ? (<>
        <Text fontFamily="$mono" fontSize={18} letterSpacing={1} color="$color12">{`${mine.name} #${mine.tag}`}</Text>
        <Small>{`This device plays as ${mine.name}${mine.nickname ? ` (${mine.nickname} to friends)` : ""}. Its guardian sets what it may do.`}</Small>
        {mine.code ? <Small>{`Its friend code: ${mine.code}`}</Small> : null}
        <Action label="LEAVE THIS PROFILE" ink={ink} onPress={() => act(() => keepToken("profile", null), "This device has left the profile.")} />
      </>) : (<>
        <Small>A grown-up signs in to make profiles for the players at home. A player never signs in.</Small>
        {apple
          ? <Action label="SIGN IN WITH APPLE" ink={ink} onPress={() => act(async () => {
              // piece 5: a device that says its person is under 18 does not make a guardian
              if (await grownUpHere() === false) throw new Error("A grown-up signs in here. Ask a parent or guardian to sign in on their own device.");   // DRAFT
              const t = await appleToken();
              if (!t) throw new Error("Sign in with Apple was not finished.");
              await signedIn(await accounts<{ token: string }>("signin", { provider: "apple", idToken: t }));
            }, "Signed in.")} />
          : <Small color="$color10">Sign in with Apple comes with the next app build.</Small>}
        {names.dev ? <Action label="DEV SIGN-IN" ink={ink} onPress={() => act(async () => signedIn(await accounts<{ token: string }>("signin", { provider: "dev", sub: "scratch" })), "Signed in (dev).")} /> : null}
        <Small>Or open a profile here with the code its guardian made.</Small>
        <XStack gap={8} flexWrap="wrap" alignItems="center">
          <Entry value={code} onChange={(x) => setCode(x.toUpperCase())} onSubmit={() => {}} placeholder="the eight-letter code" limit={8} />
          <Action label="OPEN" ink={ink} onPress={() => act(async () => {
            const r = await accounts<{ token: string; profile: Profile }>("device/join", { code, label: "this device" });
            await keepToken("profile", r.token); setCode("");
          }, "This device is open on the profile.")} />
        </XStack>
      </>)}
      {said ? <Small>{said}</Small> : null}
      {error ? <Small color="$red10">{error}</Small> : null}
      <Small color="$color8">DRAFT</Small>
    </Card>
  );
}

function ProfileRow({ p, ink, act }: { p: Profile; ink: string; act: (what: () => Promise<unknown>, done: string) => Promise<void> }) {
  const [nick, setNick] = useState(p.nickname ?? "");
  const [code, setCode] = useState<{ code: string; until: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  return (
    <YStack gap={8} borderTopWidth={1} borderColor="$color5" paddingTop={10}>
      <Text fontFamily="$mono" fontSize={17} letterSpacing={1} color="$color12">{`${p.name} #${p.tag}`}</Text>
      <Small color="$color10">Until a traded daemon's trainer name can be hidden, a profile trades, lends and gives only with friends, and players who are not friends see its daemons by kind, never by the name it typed.</Small>
      {CONTROLS.map((c) => (
        <YStack key={c.key} gap={4}>
          <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color10">{c.label}</Text>
          <Segments value={p.controls[c.key] as string} options={c.options}
                    onChange={(v) => act(() => accounts("profile/controls", { id: p.id, [c.key]: v }), `${p.name}: ${c.label.toLowerCase()} set.`)} />
        </YStack>
      ))}
      <XStack gap={8} flexWrap="wrap" alignItems="center">
        <Entry value={nick} onChange={(x) => setNick(x.toUpperCase())} onSubmit={() => {}} placeholder="a nickname friends see (optional)" limit={10} />
        <Action label="SET" ink={ink} onPress={() => act(() => accounts("profile/nickname", { id: p.id, text: nick }), nick ? `Friends see ${nick}.` : "No nickname.")} />
      </XStack>
      <XStack gap={8} flexWrap="wrap" alignItems="center">
        <Action label="OPEN ON A DEVICE" ink={ink} onPress={() => act(async () => setCode(await accounts("device/code", { profile: p.id })), "A code for one device.")} />
        {code ? <Text fontFamily="$mono" fontSize={20} letterSpacing={4} color="$color12">{code.code}</Text> : null}
        {code ? <Small>{`Enter it on the player's device before ${when(code.until)}. It works once.`}</Small> : null}
      </XStack>
      {(p.devices ?? []).map((d) => (
        <XStack key={d.id} gap={10} alignItems="center">
          <Small>{`Open on ${d.label}`}</Small>
          <Action label="CLOSE IT" ink={ink} onPress={() => act(() => accounts("device/revoke", { id: d.id }), `Closed on ${d.label}.`)} />
        </XStack>
      ))}
      {p.code ? <Small>{`Friend code ${p.code}: another player types it to ask to be friends.`}</Small> : null}
      {(p.waiting ?? []).map((w) => (
        <XStack key={w.player} gap={8} flexWrap="wrap" alignItems="center">
          <Small>{`${w.name} wants to be friends.`}</Small>
          <Action label="YES" ink={ink} onPress={() => act(() => accounts("profile/friend", { profile: p.id, player: w.player }), `${w.name} is ${p.name}'s friend.`)} />
          <Action label="NO" ink={ink} onPress={() => act(() => accounts("profile/friend", { profile: p.id, player: w.player, yes: false }), `Not ${w.name}.`)} />
        </XStack>
      ))}
      {(p.blocked ?? []).map((x) => (
        <XStack key={x.player} gap={8} flexWrap="wrap" alignItems="center">
          <Small>{`${x.name} is blocked.`}</Small>
          <Action label="UNBLOCK" ink={ink} onPress={() => act(() => accounts("profile/block", { profile: p.id, player: x.player, yes: false }), `${x.name} is not blocked now.`)} />
        </XStack>
      ))}
      <XStack gap={8} flexWrap="wrap">
        <Action label={ledger ? "HIDE ITS TRADES" : "ITS TRADES"} ink={ink} onPress={() => ledger ? setLedger(null) : act(async () => setLedger(await accounts<Ledger>("profile/ledger", { id: p.id })), "Its trades, loans and gifts.")} />
        <Action label="PLAY AS IT HERE" ink={ink} onPress={() => act(async () => api("/api/trade/claim", { guardian: await readToken("guardian"), profile: p.id }),
                                                                           `This companion's player is ${p.name} now: its trades and friends came with it.`)} />
      </XStack>
      {ledger ? <LedgerList l={ledger} ink={ink} block={(player, name) => act(async () => setLedger(await accounts<Ledger>("profile/block", { profile: p.id, player })), `${name} is blocked.`)} /> : null}
      {removing
        ? <XStack gap={8} flexWrap="wrap" alignItems="center"><Small>{`Remove ${p.name} and close it on every device?`}</Small>
            <Action label="REMOVE" ink={ink} onPress={() => act(() => accounts("profile/remove", { id: p.id }), `${p.name} is removed.`)} />
            <Action label="KEEP" ink={ink} onPress={() => setRemoving(false)} /></XStack>
        : <Pressable onPress={() => setRemoving(true)} accessibilityRole="button"><Small color="$color10">Remove this profile…</Small></Pressable>}
    </YStack>
  );
}

// A profile's LEDGER: each trade, loan and gift, the other player in it, and its friends -- any of them blocked from here
function LedgerList({ l, ink, block }: { l: Ledger; ink: string; block: (player: string, name: string) => void }) {
  if (!l.offers.length && !l.friends.friends.length) return <Small>No trades, loans, gifts or friends yet.</Small>;
  return (
    <YStack gap={6}>
      {l.offers.map((o) => {
        const mine = o.side === "with" ? o.with : o.from, theirs = o.side === "with" ? o.from : o.with;
        const what = o.item ? `${o.item.count} × ${o.item.name}` : mine ? `${mine.nickname} LV ${mine.level}` : "";
        return <Small key={o.id}>{`${KINDS[o.kind] ?? o.kind} · ${what}${theirs?.player ? ` · with ${theirs.player}` : ""} · ${o.state}`}</Small>;
      })}
      {l.friends.friends.map((f) => (
        <XStack key={f.id} gap={8} alignItems="center" flexWrap="wrap">
          <Small>{`Friend: ${f.name}`}</Small>
          <Action label="BLOCK" ink={ink} onPress={() => block(f.id, f.name)} />
        </XStack>
      ))}
    </YStack>
  );
}

// One list's words as chips, the one picked filled
function WordChips({ list, pick, on, ink }: { list: (string | null)[]; pick: number | null; on: (i: number) => void; ink: string }) {
  return (
    <XStack gap={6} flexWrap="wrap">
      {list.map((w, i) => w ? (
        <Pressable key={i} onPress={() => on(i)} accessibilityRole="button" accessibilityState={{ selected: pick === i }}>
          <Text fontFamily="$mono" fontSize={12} paddingHorizontal={9} paddingVertical={5} borderRadius={99} borderWidth={1}
                borderColor={pick === i ? ink : "$color6"} backgroundColor={pick === i ? ink : "transparent"} color={pick === i ? "$color1" : "$color11"}>{w}</Text>
        </Pressable>) : null)}
    </XStack>
  );
}

// A new profile's name: one word from each list, picked
function NewProfile({ names, ink, add }: { names: Names; ink: string; add: (first: number, second: number) => void }) {
  const [first, setFirst] = useState<number | null>(null), [second, setSecond] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  if (!open) return <Action label="ADD A PROFILE" ink={ink} onPress={() => setOpen(true)} />;
  return (
    <YStack gap={8} borderTopWidth={1} borderColor="$color5" paddingTop={10}>
      <Text fontFamily="$mono" fontSize={17} letterSpacing={1} color="$color12">
        {`${first === null ? "…" : names.first[first]} ${second === null ? "…" : names.second[second]}`}</Text>
      <Small>The first word</Small>
      <WordChips list={names.first} pick={first} on={setFirst} ink={ink} />
      <Small>The second word</Small>
      <WordChips list={names.second} pick={second} on={setSecond} ink={ink} />
      <XStack gap={8}>
        <Action label="MAKE IT" ink={ink} onPress={() => { if (first !== null && second !== null) { add(first, second); setOpen(false); setFirst(null); setSecond(null); } }} />
        <Action label="NOT NOW" ink={ink} onPress={() => setOpen(false)} />
      </XStack>
    </YStack>
  );
}

function DeleteAll({ ink, onDelete }: { ink: string; onDelete: () => void }) {
  const [typed, setTyped] = useState(""), [open, setOpen] = useState(false);
  if (!open) return <Pressable onPress={() => setOpen(true)} accessibilityRole="button"><Small color="$color10">Delete this account and every profile in it…</Small></Pressable>;
  return (
    <YStack gap={6}>
      <Small>This erases the account, every profile and every device it is open on, at once. It cannot be undone. Type DELETE to go on.</Small>
      <XStack gap={8} flexWrap="wrap" alignItems="center">
        <Entry value={typed} onChange={(x) => setTyped(x.toUpperCase())} onSubmit={() => {}} placeholder="DELETE" limit={6} />
        <Action label="DELETE EVERYTHING" ink={ink} onPress={() => { if (typed === "DELETE") onDelete(); }} />
        <Action label="KEEP IT" ink={ink} onPress={() => { setOpen(false); setTyped(""); }} />
      </XStack>
    </YStack>
  );
}
