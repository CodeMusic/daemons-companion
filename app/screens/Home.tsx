// HOME -- Home Assistant's rooms, each a tap, and the house asked in words (C-139); its settings card. (C-157: out of App.tsx.)
import { useCallback, useEffect, useRef, useState } from "react";
import { Input, Text, XStack, YStack } from "tamagui";
import { api, apiLive, ON_PHONE } from "../net";
import { HomeSettings, HomeView, Thing } from "../types";
import { Action, Card, Choice, Eyebrow, Small } from "../ui";
   // C-142: the daemon as its agent
export const HOME_POLL_MS = 30000;

export let homeTalk: string | null = null;
       // the assistant's conversation, kept for follow-ups while the app is open

// Every word HOME and its SETTINGS card put on screen
export const HOME_WORDS = {
  loading: "Asking the house…",                                                                          // DRAFT
  stale: (e: string) => `Not updated just now: ${e}`,                                                    // DRAFT
  head: "HOME",                                                                                           // DRAFT
  unnamed: "Home Assistant",                                                                              // DRAFT
  count: (things: number, rooms: number) =>
    `${things} ${things === 1 ? "thing" : "things"} in ${rooms} ${rooms === 1 ? "room" : "rooms"}`,        // DRAFT
  empty: "Home Assistant answered, but has nothing HOME shows: lights, switches, fans, blinds, scenes, scripts, players, heating.",   // DRAFT
  refresh: "Refresh",                                                                                     // DRAFT
  setUp: "Set up Home Assistant on the companion's SETTINGS, on the computer it runs on.",               // DRAFT
  goSettings: "Go to SETTINGS",                                                                           // DRAFT
  askHead: "ASK THE HOUSE",                                                                               // DRAFT
  askHint: "Turn off the kitchen light",                                                                  // DRAFT
  ask: "Ask", asking: "Asking…",                                                                          // DRAFT
  notAnswering: "not answering",                                                                          // DRAFT
  refused: "Home Assistant did not do it.",                                                               // DRAFT
  on: "On", off: "Off", run: "Run", running: "Running", open: "Open", close: "Close", stop: "Stop",       // DRAFT
  play: "Play", pause: "Pause", next: "Next", cooler: "−", warmer: "+",                                   // DRAFT
  setHead: "HOME ASSISTANT",                                                                              // DRAFT
  setAbout: "For the HOME tab. The companion talks to Home Assistant for every screen, and keeps the token on this computer.",   // DRAFT
  tokenHint: "Long-lived access token",                                                                   // DRAFT
  tokenKeptHint: "A token is kept. Paste a new one to replace it.",                                      // DRAFT
  tokenFrom: "The token comes from Home Assistant: your profile, Security, Long-lived access tokens.",    // DRAFT
  save: "Save", checking: "Checking…",                                                                    // DRAFT
  forget: "Forget the token", forgetSure: "Tap again to forget it",                                       // DRAFT
  kept: "A token is kept.", notKept: "No token yet.",                                                     // DRAFT
  notYet: "Not set up yet: Home Assistant's address and a token.",                                       // DRAFT
  connected: (home?: string) => `Connected to ${home || "Home Assistant"}.`,                             // DRAFT
  // C-142: the daemon as Home Assistant's conversation agent
  agentHead: "THE DAEMON AS ITS ASSISTANT",                                                                 // DRAFT
  agentAbout: "In Home Assistant, add the Ollama integration with this address, choose the model \"daemon\" (the one the BOX-3 carries) or a daemon by name, and make it the voice assistant's conversation agent with \"Prefer handling commands locally\" on -- Home Assistant still switches the lights, and the daemon answers the rest.", // DRAFT
  agentClosed: (path: string) => `Open the companion to the network first (SETTINGS), then the address is this computer's, port and ${path}.`, // DRAFT
  agentRenew: "New address",                                                                                 // DRAFT
  agentRenewSure: "Sure? Home Assistant needs the new one",                                                  // DRAFT
};

// Under a thing's name: its state where no key already says it, and what it is doing (brightness, temperature, a song)
export function thingLine(t: Thing): string | null {
  if (t.state === "unavailable" || t.state === "unknown") return HOME_WORDS.notAnswering;
  const said = ["light", "switch", "fan", "input_boolean", "scene", "script"].includes(t.kind) ? null : t.state.replace(/_/g, " ");
  return [said, t.detail].filter(Boolean).join(" · ") || null;
}

// A tap answers at once: the thing as it will most likely be, until Home Assistant says how it is
export function presumedThing(t: Thing, action: string): Thing {
  if (t.on === null) return t;
  const on = ({ on: true, off: false, open: true, close: false, run: true, toggle: !t.on, play_pause: !t.on } as Record<string, boolean>)[action];
  if (on === undefined) return t;
  const state = action === "open" ? "opening" : action === "close" ? "closing"
    : t.kind === "media_player" ? (on ? "playing" : "paused") : on ? "on" : "off";
  return { ...t, on, state };
}

// A thing's key: a Choice's, so a lit one reads as it does on DEVICE's settings
export function HomeKey({ label, onPress, ink, lit = false }: { label: string; onPress: () => void; ink: string; lit?: boolean }) {
  return (
    <YStack role="button" cursor="pointer" borderRadius={3} paddingHorizontal={12} paddingVertical={6} minWidth={36} alignItems="center"
            borderWidth={1} borderColor={lit ? "$color9" : "$color6"} backgroundColor={lit ? "$color9" : "$color1"}
            hoverStyle={{ borderColor: "$color9" }} pressStyle={{ backgroundColor: lit ? "$color10" : "$color3" }} onPress={onPress}>
      <Text fontSize={13} fontWeight={lit ? "700" : "400"} color={lit ? ink : "$color12"}>{label}</Text>
    </YStack>
  );
}

export function ThingRow({ t, ink, slip, onAct }: { t: Thing; ink: string; slip: string | null; onAct: (action: string) => void }) {
  const can = (a: string) => t.can.includes(a), W = HOME_WORDS;
  const line = thingLine(t);
  const gone = t.state === "unavailable" || t.state === "unknown";
  const keys: { action: string; label: string; lit?: boolean }[] = [];
  if (can("toggle") && !(can("on") && can("off"))) keys.push({ action: "toggle", label: t.on ? W.on : W.off, lit: !!t.on });
  if (can("run")) keys.push({ action: "run", label: t.kind === "script" && t.on ? W.running : W.run, lit: t.kind === "script" && !!t.on });
  if (can("open")) keys.push({ action: "open", label: W.open, lit: !!t.on });
  if (can("stop")) keys.push({ action: "stop", label: W.stop });
  if (can("close")) keys.push({ action: "close", label: W.close, lit: t.on === false });
  if (can("play_pause")) keys.push({ action: "play_pause", label: t.on ? W.pause : W.play });
  if (can("next")) keys.push({ action: "next", label: W.next });
  if (can("cooler")) keys.push({ action: "cooler", label: W.cooler });
  if (can("warmer")) keys.push({ action: "warmer", label: W.warmer });
  return (
    <YStack paddingVertical={4} gap={2}>
      <XStack alignItems="center" gap={10}>
        <YStack flex={1}>
          <Text fontSize={15} color={gone ? "$color8" : "$color12"}>{t.name}</Text>
          {line ? <Small color={gone ? "$color8" : undefined}>{line}</Small> : null}
        </YStack>
        <XStack gap={6} flexWrap="wrap" justifyContent="flex-end" flexShrink={1}>
          {/* on and off as the settings have them: which it is, lit, and a tap on the other says so -- a second tap on a
              slow relay does not undo the first, as a toggle would */}
          {can("on") && can("off")
            ? <Choice<boolean | null> value={t.on} options={[[true, W.on], [false, W.off]]} onPick={(v) => onAct(v ? "on" : "off")} ink={ink} />
            : null}
          {keys.map((k) => <HomeKey key={k.action} label={k.label} lit={k.lit} ink={ink} onPress={() => onAct(k.action)} />)}
        </XStack>
      </XStack>
      {slip ? <Small color="$color9">{slip}</Small> : null}
    </YStack>
  );
}

// Asked in words: Home Assistant's own conversation agent answers -- the one the BOX-3's voice uses (C-138)
export function AskCard({ ink, onAnswered }: { ink: string; onAnswered: () => void }) {
  const [text, setText] = useState(""), [asking, setAsking] = useState(false);
  const [said, setSaid] = useState<{ asked: string; speech?: string; error?: string } | null>(null);
  const ask = async () => {
    const t = text.trim();
    if (!t || asking) return;
    setAsking(true);
    try {
      const r = await apiLive<{ ok: boolean; speech?: string; conversationId?: string; error?: string }>("/api/home/ask",
        { text: t, ...(homeTalk ? { conversationId: homeTalk } : {}) });
      if (r.conversationId) homeTalk = r.conversationId;
      setSaid(r.ok ? { asked: t, speech: r.speech } : { asked: t, error: r.error ?? HOME_WORDS.refused });
      if (r.ok) { setText(""); onAnswered(); }                       // what it did shows in the rooms below
    } catch (e) { setSaid({ asked: t, error: (e as Error).message }); }
    finally { setAsking(false); }
  };
  return (
    <Card>
      <Eyebrow>{HOME_WORDS.askHead}</Eyebrow>
      <XStack gap={8} alignItems="center">
        <Input flex={1} value={text} maxLength={500} onChangeText={setText} onSubmitEditing={ask} placeholder={HOME_WORDS.askHint}
               backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={14} />
        <Action label={asking ? HOME_WORDS.asking : HOME_WORDS.ask} ink={ink} onPress={ask} />
      </XStack>
      {said ? <Small color="$color10">{`“${said.asked}”`}</Small> : null}
      {said?.speech ? <Text fontSize={16} lineHeight={24} color="$color12">{said.speech}</Text> : null}
      {said?.error ? <Small color="$color8">{said.error}</Small> : null}
    </Card>
  );
}

export function HomeScreen({ ink, goSettings }: { ink: string; goSettings: () => void }) {
  const [view, setView] = useState<HomeView | null>(null);
  const [error, setError] = useState("");                  // the last refresh failed: what was shown stays, with a word
  const [slip, setSlip] = useState<{ id: string; error: string } | null>(null);   // a tap refused, shown for a moment
  const busy = useRef(false);
  const taps = useRef(0);                  // a tap since a refresh began makes that refresh's answer older than the tap
  const load = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    const began = taps.current;
    apiLive<HomeView>("/api/home").then((v) => {
      if (taps.current !== began) return;
      // Home Assistant not answering for a moment keeps the rooms on screen, with a word, as DEVICE does
      setView((was) => (!v.ok && was?.ok ? was : v));
      setError(v.ok ? "" : v.error ?? "");
    }).catch((e) => setError((e as Error).message))
      .finally(() => { busy.current = false; });
  }, []);
  useEffect(() => { load(); const t = setInterval(load, HOME_POLL_MS); return () => clearInterval(t); }, [load]);

  const replace = (t: Thing) => setView((v) => v && { ...v, rooms: v.rooms.map((r) => ({ ...r, things: r.things.map((x) => (x.id === t.id ? t : x)) })) });
  const act = async (t: Thing, action: string) => {
    taps.current++;
    replace(presumedThing(t, action));
    let r: { ok: boolean; thing?: Thing; error?: string };
    try { r = await apiLive<typeof r>("/api/home/act", { id: t.id, action }); }
    catch (e) { r = { ok: false, error: (e as Error).message }; }
    taps.current++;
    if (r.ok && r.thing) { replace(r.thing); return; }
    replace(t);                                                                 // as it was: Home Assistant did not do it
    setSlip({ id: t.id, error: r.error ?? HOME_WORDS.refused });
    setTimeout(() => setSlip((s) => (s?.id === t.id ? null : s)), 5000);
  };

  if (!view) return <Small>{error || HOME_WORDS.loading}</Small>;
  if (!view.ok) return (
    <Card borderLeftWidth={6} borderLeftColor="$color5">
      <Eyebrow>{HOME_WORDS.head}</Eyebrow>
      <Small>{view.error ?? ""}</Small>
      {/not set up|token/i.test(view.error ?? "") ? <Small>{HOME_WORDS.setUp}</Small> : null}
      <XStack gap={8} flexWrap="wrap">
        {!ON_PHONE ? <Action label={HOME_WORDS.goSettings} ink={ink} onPress={goSettings} /> : null}
        <Action label={HOME_WORDS.refresh} ink={ink} onPress={load} />
      </XStack>
    </Card>
  );
  const things = view.rooms.reduce((n, r) => n + r.things.length, 0);
  return (
    <YStack gap={14}>
      {error ? <Small color="$color10">{HOME_WORDS.stale(error)}</Small> : null}
      <Card borderLeftWidth={6} borderLeftColor="$color9">
        <Eyebrow>{HOME_WORDS.head}</Eyebrow>
        <Text fontSize={20} fontWeight="600" color="$color12">{view.home || HOME_WORDS.unnamed}</Text>
        <Small>{things ? HOME_WORDS.count(things, view.rooms.length) : HOME_WORDS.empty}</Small>
        <Action label={HOME_WORDS.refresh} ink={ink} onPress={load} />
      </Card>
      <AskCard ink={ink} onAnswered={load} />
      {view.rooms.map((r) => (
        <Card key={r.name}>
          <Eyebrow>{r.name.toUpperCase()}</Eyebrow>
          {r.things.map((t) => (
            <ThingRow key={t.id} t={t} ink={ink} slip={slip?.id === t.id ? slip.error : null} onAct={(a) => act(t, a)} />
          ))}
        </Card>
      ))}
    </YStack>
  );
}

// C-139, on the site: Home Assistant's address and a long-lived token. Set on this computer only -- the companion refuses
// it to a paired phone (LOCAL_ONLY) -- so, like PAIR A PHONE, the card is the site's, and shows only when the companion
// answers it. The token is never shown again, and never filled in: a new one replaces it, and Forget drops it.
export function HomeAssistantCard({ ink }: { ink: string }) {
  const [s, setS] = useState<HomeSettings | null>(null);
  const [url, setUrl] = useState(""), [token, setToken] = useState(""), [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false), [sure, setSure] = useState(false), [renewSure, setRenewSure] = useState(false);
  useEffect(() => { api<HomeSettings>("/api/settings/home").then((x) => { setS(x); setUrl(x.url ?? ""); }).catch(() => {}); }, []);
  if (!s) return null;
  const W = HOME_WORDS;
  const save = async (b: { url?: string; token?: string; renewAgentKey?: boolean }) => {
    setBusy(true); setSaid("");
    try { const x = await api<HomeSettings>("/api/settings/home", b); setS(x); setUrl(x.url ?? ""); setToken(""); }
    catch (e) { setSaid((e as Error).message); }                     // e.g. an address that is not http(s)
    finally { setBusy(false); setSure(false); }
  };
  const saveTyped = () => save({ url, ...(token.trim() ? { token: token.trim() } : {}) });
  return (
    <Card borderLeftWidth={6} borderLeftColor={s.ok ? "$color9" : "$color5"}>
      <Eyebrow>{W.setHead}</Eyebrow>
      <Small>{W.setAbout}</Small>
      <Input value={url} onChangeText={setUrl} onSubmitEditing={saveTyped} placeholder="http://homeassistant.local:8123"
             autoCapitalize="none" autoCorrect={false} keyboardType="url"
             backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={15} />
      <Input value={token} onChangeText={setToken} onSubmitEditing={saveTyped} placeholder={s.hasToken ? W.tokenKeptHint : W.tokenHint}
             secureTextEntry type="password" autoComplete="off" autoCapitalize="none" autoCorrect={false}
             backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={15} />
      <Small>{W.tokenFrom}</Small>
      <XStack gap={8} flexWrap="wrap">
        <Action label={busy ? W.checking : W.save} ink={ink} onPress={saveTyped} />
        {s.hasToken ? <Action label={sure ? W.forgetSure : W.forget} ink={ink}
                              onPress={() => { if (sure) save({ token: "" }); else { setSure(true); setTimeout(() => setSure(false), 5000); } }} /> : null}
      </XStack>
      <Small>{s.hasToken ? W.kept : W.notKept}</Small>
      <Small color={s.ok ? "$color10" : "$color8"}>{!s.url || !s.hasToken ? W.notYet : s.ok ? W.connected(s.home) : s.error ?? ""}</Small>
      {said ? <Small color="$color9">{said}</Small> : null}
      {s.agent ? <>
        <Eyebrow>{W.agentHead}</Eyebrow>
        <Small>{W.agentAbout}</Small>
        {s.agent.url ? <Text fontFamily="$mono" fontSize={13} color="$color12" selectable>{s.agent.url}</Text>
                     : <Small color="$color8">{W.agentClosed(s.agent.path)}</Small>}
        <XStack gap={8} flexWrap="wrap">
          <Action label={renewSure ? W.agentRenewSure : W.agentRenew} ink={ink}
                  onPress={() => { if (renewSure) { setRenewSure(false); save({ renewAgentKey: true }); } else { setRenewSure(true); setTimeout(() => setRenewSure(false), 5000); } }} />
        </XStack>
      </> : null}
    </Card>
  );
}
