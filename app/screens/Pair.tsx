// pairing a phone with its companion, or the phone alone with Delta (C-53, C-111). (C-157: out of App.tsx.)
import * as SecureStore from "expo-secure-store";
import { useState } from "react";
import { Platform } from "react-native";
import { Input, Text, YStack } from "tamagui";
import { api, AWAY, hostAlone, KEEP, keepSiteToken, LOCAL, ON_PHONE, SERVER, setConnection, WIDGET } from "../net";
import { Action, Choice, Small } from "../ui";

export function PairScreen({ onPaired }: { onPaired: () => void }) {
  // C-170: the site away from home pairs with the companion that served it -- no address to type, its key in the browser
  const [server, setServer] = useState(ON_PHONE ? "" : SERVER), [code, setCode] = useState(""), [name, setName] = useState(ON_PHONE ? "my phone" : "a browser");
  const [error, setError] = useState("");
  // hosting alone is folded away (2026-10-24: on the user's mom's iPad, its "choose a save" under the pairing boxes read
  // as the app wanting a save, when all it needed was the code)
  const [alone, setAlone] = useState(false);
  const pair = async () => {
    try {
      setError("");
      const base = server.trim().replace(/\/$/, "").replace(/^(?!https?:\/\/)/, "http://");
      const r = await fetch(base + "/api/pair", { method: "POST", headers: { "content-type": "application/json" },
                                                  body: JSON.stringify({ code: code.trim(), name: name.trim() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `the companion answered ${r.status}`);
      if (!ON_PHONE) { keepSiteToken(j.token, base); setConnection({ server: base, token: j.token }); onPaired(); return; }   // C-170: kept under the server it was paired with
      await SecureStore.setItemAsync("server", base, KEEP);
      await SecureStore.setItemAsync("token", j.token, KEEP);
      if (j.away) { await SecureStore.setItemAsync("away", j.away, KEEP); setConnection({ away: j.away }); }   // C-56
      setConnection({ server: base, token: j.token });
      WIDGET?.shareWithWidget({ server: base, token: j.token, away: AWAY });   // C-100
      onPaired();
    } catch (e) { setError(`${(e as Error).message}. Is the companion running, and is it open to your network (Settings on the site)?`); }
  };
  return (
    <YStack flex={1} backgroundColor="$color2" padding={24} paddingTop={80} gap={14}>
      <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="600" color="$color10">DAEMONS · companion</Text>
      <Text fontSize={24} fontWeight="700" color="$color12">{ON_PHONE ? "Pair this phone" : "Pair this browser"}</Text>
      {ON_PHONE ? <Small>On your computer, open the companion's site, then SETTINGS, PAIR A PHONE, and Show a code. Type its address and the code here.</Small>
        : <Small>{`This is the companion at ${SERVER}. Show a pairing code on the companion itself -- its own screen, or its site on the computer it runs on (SETTINGS, PAIR A PHONE) -- and type it here.`}</Small>}
      {ON_PHONE ? <Input value={server} onChangeText={setServer} placeholder="http://10.0.0.100:4730" autoCapitalize="none" autoCorrect={false}
             keyboardType="url" backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={15} /> : null}
      <Input value={code} onChangeText={setCode} placeholder="six-digit code" keyboardType="number-pad" maxLength={6}
             backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={15} />
      <Input value={name} onChangeText={setName} placeholder="this phone's name" maxLength={40}
             backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={15} />
      <Action label="Pair" onPress={pair} />
      {error ? <Small color="$color9">{error}</Small> : null}
      {!ON_PHONE ? <Small>DRAFT</Small> : null}
      {LOCAL && !alone ? <Text fontSize={14} color="$color10" marginTop={18} textDecorationLine="underline" role="button"
                                onPress={() => setAlone(true)}>No computer? Host the daemon on this device alone</Text> : null}{/* DRAFT */}
      {LOCAL && alone ? <PhoneAlone onPaired={onPaired} /> : null}
    </YStack>
  );
}

// C-111 (DRAFT): no computer -- the phone hosts the daemon itself, from the save Delta shares through Files
export function PhoneAlone({ onPaired }: { onPaired: () => void }) {
  const [edition, setEdition] = useState<"CONTENT" | "CONTEXT">("CONTENT"), [error, setError] = useState("");
  const start = async () => {
    try {
      setError("");
      LOCAL!.setEdition(edition);
      if (!await LOCAL!.importSave()) return;
      await hostAlone();
      onPaired();
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <YStack gap={10} marginTop={18}>
      <Text fontSize={20} fontWeight="700" color="$color12">Or host it on this phone alone</Text>
      <Small>{"No computer needed. Play DAEMONS in Delta on this phone; in Delta, hold the game, choose Export Save File and " +
        "save it to Files. Then choose it here. Which edition is it?"}</Small>
      <Choice<"CONTENT" | "CONTEXT"> value={edition} options={[["CONTENT", "CONTENT"], ["CONTEXT", "CONTEXT"]]} onPick={setEdition} />
      <Action label="Choose the save from Files" onPress={start} />
      {error ? <Small color="$color9">{error}</Small> : null}
    </YStack>
  );
}

// ---- C-27, C-48: on the phone, today's steps from Apple Health go to the walking goal ----
export async function sendTodaysSteps(): Promise<number | null> {
  if (Platform.OS !== "ios") return null;
  const HK = require("@kingstinct/react-native-healthkit");
  if (!HK.isHealthDataAvailable()) return null;
  await HK.requestAuthorization({ toRead: ["HKQuantityTypeIdentifierStepCount"] });
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const r = await HK.queryStatisticsForQuantity("HKQuantityTypeIdentifierStepCount", ["cumulativeSum"],
                                                { filter: { date: { startDate: midnight, endDate: new Date() } }, unit: "count" });
  const steps = Math.round(r?.sumQuantity?.quantity ?? 0);
  await api("/api/walk", { steps });
  return steps;
}
