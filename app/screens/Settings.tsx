// SETTINGS -- the save, the app, the look, the voice; on the phone THIS PHONE; on the site PAIR A PHONE and AWAY FROM HOME. (C-157: out of App.tsx.)
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { Input, Text, XStack, YStack } from "tamagui";
import { BUILD } from "../data";
import { LOOK, Look, setLook } from "../look";
import { ALONE, api, LOCAL, ON_PHONE, pairAgain, redrawWidgetNow, SERVER } from "../net";
import { Settings } from "../types";
import { Action, Card, Choice, Eyebrow, Small } from "../ui";
 // C-29: the save path, set here and kept by the server. The user picks a file once (emulator or cart) and SYNC just
// works; "open the folder" shows where to put a save.
export function SettingsScreen({ ink }: { ink: string }) {
  return ALONE ? <AloneSettings ink={ink} /> : <SavePathSettings ink={ink} />;
}

// C-111 (DRAFT): a phone hosting on its own keeps a copy of the save Delta shared; it takes a newer one, and gives it back
export function AloneSettings({ ink }: { ink: string }) {
  const [note, setNote] = useState("");
  const take = async () => {
    try { const n = await LOCAL!.importSave(); if (n) { setNote(`Taken: ${n}. SYNC on the DAEMON tab to bring its news across.`); redrawWidgetNow(); } }
    catch (e) { setNote((e as Error).message); }
  };
  const give = async () => { try { await LOCAL!.shareSave(); } catch (e) { setNote((e as Error).message); } };
  return (
    <YStack gap={14}>
      <VersionCard ink={ink} />
      <Card borderLeftWidth={6} borderLeftColor={LOCAL?.hasSave() ? "$color9" : "$color5"}>
        <Eyebrow>THIS PHONE HOSTS ON ITS OWN</Eyebrow>
        <Small>{`Your ${LOCAL?.edition() ?? "DAEMONS"} save is kept on this phone, a copy of Delta's. After you play, bring the newer ` +
          "one here. After a SYNC, give it back: Save to Files, then in Delta, hold the game and Import Save File."}</Small>
        <XStack gap={8} flexWrap="wrap" marginTop={4}>
          <Action label="Take a newer save from Files" onPress={take} ink={ink} />
          <Action label="Give the save back to Delta" onPress={give} ink={ink} />
        </XStack>
        {note ? <Small>{note}</Small> : null}
      </Card>
      <Card>
        <Eyebrow>A COMPANION ON A COMPUTER</Eyebrow>
        <Small>For a handheld, talking with your daemon, or reaching it from another device, the companion runs on a computer.</Small>
        <Action label="Pair with a companion instead" onPress={() => { pairAgain(); }} ink={ink} />
      </Card>
    </YStack>
  );
}

// C-111: a phone paired with a companion can leave it -- to host the daemon on this phone alone (Delta's save through
// Files), or to pair with another. The first tap only asks; nothing on the companion is changed or lost. DRAFT words.
export function LeaveCompanionCard({ ink }: { ink: string }) {
  const [sure, setSure] = useState(false);
  if (!ON_PHONE) return null;
  return (
    <Card>
      <Eyebrow>THIS PHONE</Eyebrow>
      <Small>{`Paired with ${SERVER}. Leave it to host your daemon on this phone alone, or to pair with another companion. ` +
        "Everything stays on the companion; pairing back needs a new code from its site (SETTINGS, PAIR A PHONE)."}</Small>
      <XStack marginTop={4}>
        <Action label={sure ? "Tap again to leave this companion" : "Leave this companion"} ink={ink}
                onPress={() => { if (sure) pairAgain(); else { setSure(true); setTimeout(() => setSure(false), 5000); } }} />
      </XStack>
    </Card>
  );
}

export function SavePathSettings({ ink }: { ink: string }) {
  const [s, setS] = useState<Settings | null>(null);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const load = useCallback(() => {
    api<Settings>("/api/settings").then((r) => { setS(r); setTyped(r.savePath ?? ""); }).catch((e) => setNote(e.message));
  }, []);
  useEffect(load, [load]);
  const said = (r: Settings) => !r.exists ? "No file at that path yet." : r.valid ? "Save set." : "That file is not a DAEMONS save.";
  const pick = async () => { const r = await api<Settings>("/api/settings/pick", {}); setS(r); setTyped(r.savePath ?? ""); setNote(said(r)); };
  const save = async () => { const r = await api<Settings>("/api/settings", { savePath: typed }); setS(r); setNote(said(r)); };
  const reveal = async () => { await api("/api/settings/reveal", {}); };
  // C-92: away, the companion's own settings may not be kept yet -- say so and show the rest, not an error
  if (!s) return (
    <YStack gap={14}>
      <VersionCard ink={ink} />
      {note ? <Card><Eyebrow>YOUR DAEMONS SAVE</Eyebrow><Small>Shown when the companion answers.</Small></Card> : <Small>Loading…</Small>}
      <TalkSettingsCard ink={ink} />
      <LeaveCompanionCard ink={ink} />
    </YStack>
  );
  return (
    <YStack gap={14}>
      <VersionCard ink={ink} />
      <Card borderLeftWidth={6} borderLeftColor={s.valid ? "$color9" : "$color5"}>
        <Eyebrow>YOUR DAEMONS SAVE</Eyebrow>
        <Text fontFamily="$mono" fontSize={13} color="$color12" wordWrap="break-word">{s.savePath ?? "not set"}</Text>
        <Small color={s.valid ? "$color10" : "$color8"}>
          {!s.savePath ? "Not set yet." : !s.exists ? "No file at that path yet."
            : !s.valid ? "That file is not a DAEMONS save."
            : `A DAEMONS save${s.source === "config.json" ? " (set in config.json)" : ""}.`}
        </Small>
        <XStack gap={8} flexWrap="wrap" marginTop={4}>
          {s.canPick ? <Action label="Choose a save…" onPress={pick} ink={ink} /> : null}
          {s.dir ? <Action label="Open the folder" onPress={reveal} ink={ink} /> : null}
        </XStack>
      </Card>
      <Card>
        <Eyebrow>OR TYPE THE PATH</Eyebrow>
        <Small>From an emulator, the .sav beside the ROM. From a cartridge, pull the save to your computer first. Point the emulator and the app at the same file and it just works.</Small>
        <XStack gap={8} alignItems="center" flexWrap="wrap" marginTop={4}>
          <Input flexGrow={1} minWidth={220} value={typed} onChangeText={setTyped} onSubmitEditing={save}
                 placeholder="/path/to/your.sav" backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={13} fontFamily="$mono" />
          <Action label="Save" onPress={save} ink={ink} />
        </XStack>
        {note ? <Small>{note}</Small> : null}
      </Card>
      <WeatherCard ink={ink} />
      <TalkSettingsCard ink={ink} />
      <LeaveCompanionCard ink={ink} />
    </YStack>
  );
}

// C-158 (the user, 2026-10-18: real weather, "a city set on the site"): the city whose weather the devices and the
// CASINO's luck follow (GET/POST /api/weather; Open-Meteo, no account). "" forgets it. Every word DRAFT.
type Weather = { place: { name: string; country: string } | null; now: { kind: string; tempC: number; city: string } | null };
export function WeatherCard({ ink }: { ink: string }) {
  const [w, setW] = useState<Weather | null>(null);
  const [typed, setTyped] = useState(""), [said, setSaid] = useState("");
  useEffect(() => { api<Weather>("/api/weather").then((x) => { setW(x); setTyped(x.place?.name ?? ""); }).catch(() => {}); }, []);
  if (!w) return null;
  const save = async (city: string) => {
    setSaid("Asking…");
    try { const x = await api<Weather>("/api/weather", { city }); setW(x); setTyped(x.place?.name ?? ""); setSaid(x.place ? "" : "Forgotten: no weather now."); }
    catch (e) { setSaid((e as Error).message); }
  };
  return (
    <Card>
      <Eyebrow>THE WEATHER</Eyebrow>
      <Small>Your devices follow the real weather of one city, and so does the CASINO's luck: a clear sky or snow a little
        kinder, rain or a storm a little less.</Small>
      {w.place ? <Text fontFamily="$mono" fontSize={14} color="$color12">
        {`${w.place.name}, ${w.place.country}${w.now ? ` · ${w.now.kind}, ${Math.round(w.now.tempC)}°C` : ""}`}</Text> : <Small color="$color10">No city set.</Small>}
      <XStack gap={8} alignItems="center" flexWrap="wrap" marginTop={4}>
        <Input flexGrow={1} minWidth={180} value={typed} onChangeText={setTyped} onSubmitEditing={() => save(typed)}
               placeholder="A city" backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={15} />
        <Action label="Set" onPress={() => save(typed)} ink={ink} />
        {w.place ? <Action label="Forget" onPress={() => save("")} ink={ink} /> : null}
      </XStack>
      {said ? <Small>{said}</Small> : null}
    </Card>
  );
}
export function VersionCard({ ink }: { ink: string }) {
  const [v, setV] = useState<{ server: string | null; appChanged: boolean | null } | null>(null);
  const [look, seeLook] = useState(LOOK);                                    // C-144
  const commit = BUILD.split(" ")[0];
  useEffect(() => { api<typeof v>(`/api/version${commit ? `?build=${commit}` : ""}`).then(setV).catch(() => {}); }, [commit]);
  return (
    <Card>
      <Eyebrow>THIS APP</Eyebrow>
      <Text fontFamily="$mono" fontSize={13} color="$color12">
        {ON_PHONE ? (BUILD ? `build ${BUILD}` : "a development build") : `the site, with the companion at ${v?.server ?? "..."}`}
      </Text>
      {ON_PHONE && v?.appChanged ? <Small color="$color11">A newer app is ready. On the computer: ./bindCompanion.sh phone</Small>   // DRAFT
        : ON_PHONE && v?.appChanged === false ? <Small>Up to date.</Small> : null}
      <YStack gap={4} marginTop={6}>
        <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color10">
          {ON_PHONE ? "LIGHT OR DARK -- AUTO AS THE PHONE IS SET" : "LIGHT OR DARK -- AUTO AS THIS COMPUTER IS SET"}
        </Text>{/* DRAFT */}
        <Choice<Look> value={look} options={[["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]]}
                      onPick={(l) => { setLook(l); seeLook(l); }} ink={ink} />
      </YStack>
    </Card>
  );
}

// C-66: who answers when you talk to your daemon -- a privacy choice, so it is said plainly.
export function TalkSettingsCard({ ink }: { ink: string }) {
  const [t, setT] = useState<{ provider: "auto" | "local" | "openrouter"; connected: boolean } | null>(null);
  useEffect(() => { api<typeof t>("/api/talk/settings").then(setT).catch(() => {}); }, []);
  if (!t) return null;
  const pick = async (provider: "auto" | "local" | "openrouter") => setT(await api<typeof t>("/api/talk/settings", { provider }));
  return (
    <Card>
      <Eyebrow>WHO ANSWERS WHEN YOU TALK</Eyebrow>
      <Choice value={t.provider} options={[["auto", "Mine, then OpenRouter"], ["local", "Only mine"], ["openrouter", "OpenRouter"]]}
              onPick={pick} ink={ink} />
      <Small>{t.provider === "local" ? "Your words stay on your own machines. If your model is busy or off, the daemon says it cannot answer."
        : t.provider === "openrouter" ? "The words heard go to OpenRouter to be answered. The recording itself never leaves home."
        : "Your own model answers; when it is busy, the words heard go to OpenRouter so nobody waits. The recording never leaves home."}</Small>
      {!t.connected ? <Small color="$color8">Talking is not set up yet: add "talk" to server/config.json (README, Talk to your daemon).</Small> : null}
    </Card>
  );
}

// ---- C-53, on the site: open the companion to the network, show a code, see and forget paired phones ----
export function PairCard({ ink }: { ink: string }) {
  const [net, setNet] = useState<{ open: boolean; now: boolean; address: string | null; name?: string | null; port: number } | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [phones, setPhones] = useState<{ name: string; paired: string; seen: string | null }[]>([]);
  const load = useCallback(() => {
    api<typeof net>("/api/settings/network").then(setNet).catch(() => {});
    api<typeof phones>("/api/pair/phones").then(setPhones).catch(() => {});
  }, []);
  useEffect(load, [load]);
  if (!net) return null;
  // the computer's own name first: it stays the same on every network, where its address does not
  const address = net.name ? `http://${net.name}:${net.port}` : net.address ? `http://${net.address}:${net.port}` : "(no network address)";
  const fallback = net.name && net.address ? `http://${net.address}:${net.port}` : null;
  return (
    <Card>
      <Eyebrow>PAIR A PHONE</Eyebrow>
      <Small>The companion app on your phone talks to this computer once it is paired. It needs the companion open to your network.</Small>
      <XStack gap={8} flexWrap="wrap" alignItems="center">
        <Action label={net.open ? "Open to my network: yes" : "Open to my network: no"} ink={ink}
                onPress={async () => { await api("/api/settings/network", { open: !net.open }); load(); }} />
      </XStack>
      {net.open !== net.now ? <Small color="$color9">Restart the companion for this to take effect (Ctrl-C, then ./bindCompanion.sh).</Small> : null}
      {net.now ? (
        <>
          <Action label="Show a code" ink={ink} onPress={async () => setCode((await api<{ code: string }>("/api/pair/code", {})).code)} />
          {code ? (
            <YStack gap={2} marginTop={4}>
              <Text fontFamily="$mono" fontSize={28} letterSpacing={6} fontWeight="700" color="$color12">{code}</Text>
              <Small>{`On the phone, type the address ${address} and this code. It works once, for ten minutes.`}</Small>
              {fallback ? <Small color="$color10">{`The name finds this computer on any Wi-Fi it shares with the phone. If the phone cannot reach it, type ${fallback} instead (that one changes with the network).`}</Small> : null}
            </YStack>
          ) : null}
        </>
      ) : null}
      {phones.map((p) => (
        <XStack key={p.name} alignItems="center" gap={8} paddingVertical={2}>
          <Text flex={1} fontSize={15} color="$color12">{`${p.name}${p.seen ? "" : "  (not seen yet)"}`}</Text>
          <Action label="Forget" ink={ink} onPress={async () => setPhones(await api("/api/pair/forget", { name: p.name }))} />
        </XStack>
      ))}
    </Card>
  );
}

// ---- C-56, on the site: the way back from anywhere -- the relay on the user's n8n, and the secret it marks requests with ----
export function RelayCard({ ink }: { ink: string }) {
  const [r, setR] = useState<{ url: string | null; secret: string } | null>(null);
  const [url, setUrl] = useState(""), [said, setSaid] = useState("");
  useEffect(() => { api<NonNullable<typeof r>>("/api/settings/relay").then((x) => { setR(x); setUrl(x.url ?? ""); }).catch(() => {}); }, []);
  if (!r) return null;
  const save = async (b: object) => {
    try { const x = await api<NonNullable<typeof r>>("/api/settings/relay", b); setR(x); setSaid("Saved. Paired phones learn it the next time they open at home."); }
    catch (e) { setSaid((e as Error).message); }
  };
  return (
    <Card>
      <Eyebrow>AWAY FROM HOME</Eyebrow>
      <Small>Your n8n carries the phone's requests here from anywhere (docs/REMOTE.md). Its webhook's address:</Small>
      <Input value={url} onChangeText={setUrl} placeholder="https://your-n8n/webhook/companion" autoCapitalize="none" autoCorrect={false}
             backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={15} />
      <XStack gap={8} flexWrap="wrap">
        <Action label="Save" ink={ink} onPress={() => save({ url })} />
        <Action label="New secret" ink={ink} onPress={() => save({ renew: true })} />
      </XStack>
      <Small>The relay's secret (n8n sends it as x-companion-relay):</Small>
      {/* selectable is the phone's; on the web it reached the DOM as an unknown attribute, so the web gets user-select */}
      <Text fontFamily="$mono" fontSize={13} color="$color12" {...(Platform.OS === "web" ? { userSelect: "text" } : { selectable: true })}>{r.secret}</Text>
      {said ? <Small>{said}</Small> : null}
    </Card>
  );
}
