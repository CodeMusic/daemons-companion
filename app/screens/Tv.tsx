// C-256: TV -- the TVs a watch's remote presses, set up here (the user, 2026-10-30: "an interface of entering your tv type
// and adding it to the watch"). The platform chosen, FIND listing what the companion heard (the Rokus on the network and
// Home Assistant's TVs), a name, ADD; then TEST, rename and remove. The pressing is tv.ts's, on the companion; this card
// only asks it. A Roku is reached directly, the rest through Home Assistant. Every word DRAFT.
import { useCallback, useEffect, useState } from "react";
import { Input, Text, XStack, YStack } from "tamagui";
import { apiLive, SITE_HOME } from "../net";
import { Action, Card, Choice, Eyebrow, Small } from "../ui";

type Platform = "roku" | "apple" | "google" | "fire";
type Tv = { id: string; name: string; platform: Platform; host?: string; entity?: string };
type Found = { name: string; platform: Platform; host?: string; entity?: string; added: boolean };

// Every word the TV card puts on screen
export const TV_WORDS = {
  head: "TV",                                                                                               // DRAFT
  about: "A remote for the watch. The watch has no infrared, so a button is a request to the companion, which presses it the TV's own way.",   // DRAFT
  platforms: [["roku", "ROKU"], ["apple", "APPLE TV"], ["google", "GOOGLE TV"], ["fire", "FIRE TV"]] as [Platform, string][],   // DRAFT
  how: {
    roku: "A Roku is reached directly, on this network. On the Roku: Settings, System, Advanced system settings, Control by mobile apps -- not Disabled.",   // DRAFT
    apple: "An Apple TV is pressed through Home Assistant: add its Apple TV integration there first.",                                      // DRAFT
    google: "A Google TV, an Android TV or a Shield is pressed through Home Assistant: add its Android TV Remote integration there first.",  // DRAFT
    fire: "A Fire TV is pressed through Home Assistant: add its Android Debug Bridge integration there first.",                             // DRAFT
  } as Record<Platform, string>,
  yours: "YOUR TVS",                                                                                        // DRAFT
  none: "No TV yet. Choose what it is, then FIND.",                                                         // DRAFT
  find: "FIND", finding: "Looking…",                                                                        // DRAFT
  foundNone: (p: string) => `No ${p} heard. Is it on, and on this network?`,                                // DRAFT
  foundHead: "HEARD",                                                                                       // DRAFT
  added: "added",                                                                                           // DRAFT
  homeError: (e: string) => `Home Assistant did not answer: ${e}`,                                          // DRAFT
  homeSettings: "Home Assistant is set up on SETTINGS, on the computer the companion runs on.",            // DRAFT
  goSettings: "Go to SETTINGS",                                                                             // DRAFT
  byAddress: "Or a Roku by its address",                                                                    // DRAFT
  addressHint: "192.168.1.40",                                                                              // DRAFT
  nameHint: "Its name on the watch",                                                                        // DRAFT
  add: "ADD", adding: "Adding…", cancel: "Cancel",                                                          // DRAFT
  test: "TEST", tested: "It answered. Did the TV go home?", testing: "Pressing…",                           // DRAFT
  rename: "Rename", save: "Save",                                                                           // DRAFT
  remove: "Remove", removeSure: "Tap again to remove it",                                                   // DRAFT
  where: (t: Tv) => t.host ? `${t.host}` : t.entity ?? "",                                                  // DRAFT
  platformName: (p: Platform) => TV_WORDS.platforms.find(([v]) => v === p)?.[1] ?? p,                      // DRAFT
  onWatch: "On the watch: ROUTINES, TV -- or say \"INDEX, open TV\".",                                      // DRAFT
};

const field = { backgroundColor: "$color1", borderColor: "$color6", color: "$color12", fontSize: 15 } as const;

export function TvCard({ ink, goSettings }: { ink: string; goSettings?: () => void }) {
  const W = TV_WORDS;
  const [tvs, setTvs] = useState<Tv[] | null>(null), [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("roku");
  const [found, setFound] = useState<Found[] | null>(null), [homeError, setHomeError] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [picked, setPicked] = useState<{ host?: string; entity?: string } | null>(null);
  const [name, setName] = useState(""), [address, setAddress] = useState(""), [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiLive<{ tvs: Tv[] }>("/api/tvs").then((r) => { setTvs(r.tvs); setError(null); }).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load]);

  const find = async () => {
    setFinding(true); setSaid(""); setPicked(null);
    try { const r = await apiLive<{ found: Found[]; homeError?: string }>("/api/tvs/find"); setFound(r.found); setHomeError(r.homeError ?? null); }
    catch (e) { setSaid((e as Error).message); }
    finally { setFinding(false); }
  };
  const pick = (f: Found) => { setPicked({ host: f.host, entity: f.entity }); setName(f.name.slice(0, 16)); setSaid(""); };
  const add = async () => {
    if (!picked) return;
    setBusy(true); setSaid("");
    try {
      const r = await apiLive<{ ok: boolean; error?: string; tvs: Tv[] }>("/api/tvs", { name, platform, ...picked });
      setTvs(r.tvs);
      if (!r.ok) { setSaid(r.error ?? ""); return; }
      setPicked(null); setName(""); setAddress("");
      setFound((l) => l?.map((f) => (f.host && f.host === picked.host) || (f.entity && f.entity === picked.entity) ? { ...f, added: true } : f) ?? null);
    } catch (e) { setSaid((e as Error).message); }
    finally { setBusy(false); }
  };

  if (!tvs) return error ? (
    <Card borderLeftWidth={6} borderLeftColor="$color5">
      <Eyebrow>{W.head}</Eyebrow>
      <Small>{error}</Small>
      <Action label={W.find} ink={ink} onPress={load} />
    </Card>
  ) : null;
  const heard = (found ?? []).filter((f) => f.platform === platform);
  return (
    <Card borderLeftWidth={6} borderLeftColor={tvs.length ? "$color9" : "$color5"}>
      <Eyebrow>{W.head}</Eyebrow>
      <Small>{W.about}</Small>

      <Eyebrow>{W.yours}</Eyebrow>
      {tvs.length ? tvs.map((t) => <TvRow key={t.id} tv={t} ink={ink} onChanged={setTvs} />) : <Small>{W.none}</Small>}
      {tvs.length ? <Small color="$color10">{W.onWatch}</Small> : null}

      <Choice value={platform} options={W.platforms} ink={ink} onPick={(p) => { setPlatform(p); setPicked(null); setSaid(""); }} />
      <Small>{W.how[platform]}</Small>
      <Action label={finding ? W.finding : W.find} ink={ink} onPress={find} />

      {found ? <YStack gap={6}>
        {heard.length ? <Eyebrow>{W.foundHead}</Eyebrow> : <Small color="$color8">{W.foundNone(W.platformName(platform))}</Small>}
        {heard.map((f) => {
          const on = !!picked && ((f.host && f.host === picked.host) || (f.entity && f.entity === picked.entity));
          return (
            <XStack key={f.host ?? f.entity} role="button" cursor={f.added ? "default" : "pointer"} gap={8} alignItems="center"
                    paddingVertical={6} paddingHorizontal={10} borderRadius={3} borderWidth={1}
                    borderColor={on ? "$color9" : "$color6"} backgroundColor={on ? "$color3" : "$color1"}
                    opacity={f.added ? 0.55 : 1} onPress={() => { if (!f.added) pick(f); }}>
              <Text flex={1} fontSize={15} color="$color12">{f.name}</Text>
              <Text fontFamily="$mono" fontSize={12} color="$color10">{f.added ? W.added : f.host ?? f.entity}</Text>
            </XStack>
          );
        })}
        {platform !== "roku" && homeError ? <>
          <Small color="$color9">{W.homeError(homeError)}</Small>
          <Small>{W.homeSettings}</Small>
          {SITE_HOME && goSettings ? <Action label={W.goSettings} ink={ink} onPress={goSettings} /> : null}
        </> : null}
        {platform === "roku" ? <>
          <Small>{W.byAddress}</Small>
          <Input value={address} onChangeText={(a) => { setAddress(a); setPicked(a.trim() ? { host: a.trim() } : null); }}
                 placeholder={W.addressHint} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" {...field} />
        </> : null}
      </YStack> : null}

      {picked ? <YStack gap={6}>
        <Input value={name} onChangeText={(n) => setName(n.slice(0, 16))} onSubmitEditing={add} placeholder={W.nameHint}
               autoCapitalize="characters" autoCorrect={false} {...field} />
        <XStack gap={8} flexWrap="wrap">
          <Action label={busy ? W.adding : W.add} ink={ink} onPress={add} />
          <Action label={W.cancel} ink={ink} onPress={() => { setPicked(null); setAddress(""); setSaid(""); }} />
        </XStack>
      </YStack> : null}
      {said ? <Small color="$color9">{said}</Small> : null}
    </Card>
  );
}

// One TV kept: TEST presses HOME on it; rename and remove
function TvRow({ tv, ink, onChanged }: { tv: Tv; ink: string; onChanged: (l: Tv[]) => void }) {
  const W = TV_WORDS;
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [naming, setNaming] = useState<string | null>(null), [sure, setSure] = useState(false);
  const test = async () => {
    setSaid({ ok: true, text: W.testing });
    try { const r = await apiLive<{ ok: boolean; error?: string }>("/api/tvs/press", { id: tv.id, key: "home" }); setSaid({ ok: r.ok, text: r.ok ? W.tested : r.error ?? "" }); }
    catch (e) { setSaid({ ok: false, text: (e as Error).message }); }
  };
  const change = async (b: Record<string, unknown>) => {
    const r = await apiLive<{ ok: boolean; tvs: Tv[] }>("/api/tvs", { id: tv.id, ...b });
    onChanged(r.tvs);
  };
  return (
    <YStack gap={6} paddingVertical={6} borderBottomWidth={1} borderColor="$color4">
      <XStack gap={8} alignItems="baseline" flexWrap="wrap">
        <Text fontSize={17} fontWeight="600" color="$color12">{tv.name}</Text>
        <Small>{W.platformName(tv.platform)} · {W.where(tv)}</Small>
      </XStack>
      {naming !== null ? <XStack gap={8} alignItems="center">
        <Input flex={1} value={naming} onChangeText={(n) => setNaming(n.slice(0, 16))} autoCapitalize="characters" autoCorrect={false}
               onSubmitEditing={() => change({ op: "rename", name: naming }).then(() => setNaming(null))} {...field} />
        <Action label={W.save} ink={ink} onPress={() => change({ op: "rename", name: naming }).then(() => setNaming(null))} />
      </XStack> : null}
      <XStack gap={8} flexWrap="wrap">
        <Action label={W.test} ink={ink} onPress={test} />
        {naming === null ? <Action label={W.rename} ink={ink} onPress={() => setNaming(tv.name)} /> : null}
        <Action label={sure ? W.removeSure : W.remove} ink={ink}
                onPress={() => { if (sure) return change({ op: "remove" }); setSure(true); setTimeout(() => setSure(false), 5000); }} />
      </XStack>
      {said ? <Small color={said.ok ? "$color10" : "$color9"}>{said.text}</Small> : null}
    </YStack>
  );
}
