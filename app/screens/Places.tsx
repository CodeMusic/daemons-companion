// PLACES -- the devices under their makers, each one's settings, routines and remotes; the handheld's link. (C-157: out of App.tsx.)
import { useEffect, useState } from "react";
import { Input, Text, XStack, YStack } from "tamagui";
import { KIND_NAMES } from "../data";
import { DeviceSprite, lookFor, makerOf, MAKERS } from "../deviceSprites";
import { setPalette } from "../look";
import { ALONE, api, HANDHELD, HandheldNow, isAway, OFFLINE, redrawWidgetNow, WIDGET } from "../net";
import { Brand, Carried, DeviceRow, DeviceSettings, Link } from "../types";
import { Action, Art, Card, Choice, Eyebrow, Result, Small } from "../ui";
import { useApi } from "../useApi";
// a shared setting's row (a component of its own, so a redraw never builds the rows again)
const Row = (p: { label: string; children: React.ReactNode }) =>
  <YStack gap={4} marginTop={6}><Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color10">{p.label}</Text>{p.children}</YStack>;
export function DeviceSettingsCard({ ink }: { ink: string }) {
  const [s, setS] = useApi<DeviceSettings>("/api/device/settings");
  if (!s) return null;
  const set = async (patch: Partial<DeviceSettings>) => {
    const r = await api<DeviceSettings>("/api/device/settings", patch);
    setS(r); setPalette(r.palette);                                 // C-90: the app wears it at once
  };
  return (
    <Card>
      <Eyebrow>EVERY DEVICE'S SETTINGS</Eyebrow>
      <Small>Set here and carried to every board the next time it is linked; it keeps them when it is not. A device's own (tap it in YOUR DEVICES) win over these.</Small>
      <Row label="HOME, WHERE IT WAKES">
        <Choice<DeviceSettings["home"]> value={s.home} options={[["daemon", "The daemon"], ["today", "Today's step"]]} onPick={(home) => set({ home })} ink={ink} />
      </Row>
      <Row label="SLEEP WHEN LEFT ALONE">
        <Choice value={s.sleepAfter} options={[[30, "30 s"], [60, "1 min"], [120, "2 min"], [300, "5 min"], [0, "Never"]]}
                onPick={(sleepAfter) => set({ sleepAfter })} ink={ink} />
      </Row>
      <Row label="SOUND">
        <Choice value={s.sound ? s.volume : 0} options={[[0, "Off"], [20, "Quiet"], [40, "Middle"], [70, "Loud"]]}
                onPick={(v) => set(v === 0 ? { sound: false } : { sound: true, volume: v })} ink={ink} />
      </Row>
      <Row label="THE RING AT REST">
        <Choice value={s.ring} options={[[0, "Off"], [15, "Dim"], [33, "A third"], [60, "Bright"]]} onPick={(ring) => set({ ring })} ink={ink} />
        </Row>
        <Row label="THE DAY'S COLOURS -- EVERY SCREEN">
          <Choice<DeviceSettings["palette"]> value={s.palette ?? "checkpoint"} options={[["checkpoint", "The site's"], ["rainbow", "Rainbow"]]}
                  onPick={(palette) => set({ palette })} ink={ink} />
        </Row>
        <Row label="MEET OTHERS NEARBY">
          <Choice value={s.meet} options={[[true, "On"], [false, "Off"]]} onPick={(meet) => set({ meet })} ink={ink} />
      </Row>
        <Row label="LORA BAND -- THE WATCH AND THE T-DECK, AS BOUGHT">
          <Choice value={s.band ?? 433} options={[[433, "433 MHz"], [868, "868 MHz"], [915, "915 MHz"]]} onPick={(band) => set({ band })} ink={ink} />
      </Row>
    </Card>
  );
}

// C-160 (the user, 2026-10-18: "tap the device to open its specific settings -- sound style, volume (or mute), along with
// any other device specific settings"): one device's own settings over the shared ones (GET/POST /api/devices/<id>/settings,
// the CASINO session's) -- each row says whether it is this device's own or every device's, and goes back with one tap.
// A board's own SOUND page reports here too. Every word DRAFT.
type Own = DeviceSettings & { wakeSound?: string; face?: Face; faceSky?: boolean };
type OwnSettings = { device: string; shared: Own; own: Partial<Own>; settings: Own; keys: string[] };

// C-162, C-163 (the user, 2026-10-18, through the watch's session): the face a round screen shows at home, and the season
// behind its daemon with the weather in front -- only for the boards that draw the round face (the T-Watch S3, the Dial,
// the CoreS3; the wide boards' face is another). Each face as a small picture, drawn here with the device's own daemon.
type Face = "daemon" | "clock" | "virtue";
const ROUND_FACE = /^(t-watch-s3|m5-dial|m5-cores3)-/;
const FACES: [Face, string, string][] = [   // DRAFT
  ["daemon", "DAEMON", "the time above it"],
  ["clock", "CLOCK", "hands over it"],
  ["virtue", "VIRTUE", "the day's words"],
];
function FacePicture({ face, sky, daemon, ring }: { face: Face; sky: boolean; daemon: Carried | null | undefined; ring: string }) {
  const S = 56, seasonal = sky && face !== "virtue";
  return (
    <YStack position="relative" width={S} height={S} borderRadius={S} overflow="hidden" backgroundColor="#16181d" borderWidth={2}
            borderColor={ring} alignItems="center" justifyContent="center">
      {seasonal ? <YStack position="absolute" left={0} right={0} top={0} height={S} backgroundColor="#3a2318" /> : null}
      {seasonal ? <YStack position="absolute" left={-10} right={-10} bottom={-S * 0.55} height={S * 0.8} borderRadius={S} backgroundColor="#6b3a1c" /> : null}
      {face === "virtue" ? (
        <YStack alignItems="center" gap={3}>
          <Text fontFamily="$mono" fontSize={14} fontWeight="800" color="#f3f1ea">13:06</Text>
          <YStack width={32} height={3} backgroundColor="#c9c6bd" borderRadius={2} />
          <YStack width={20} height={3} backgroundColor="#7a7f88" borderRadius={2} />
        </YStack>
      ) : (<>
        {face === "daemon" ? <Text position="absolute" top={5} fontFamily="$mono" fontSize={9} fontWeight="800" color="#f3f1ea">13:06</Text> : null}
        <YStack marginTop={face === "daemon" ? 9 : 0}>
          {daemon ? <Art path={`/art/party/${daemon.slot}.png`} size={face === "daemon" ? 36 : 40} /> : <YStack width={24} height={24} borderRadius={24} backgroundColor="#5b6b8c" />}
        </YStack>
        {face === "clock" ? (<>
          <YStack position="absolute" width={3} height={18} backgroundColor="#f3f1ea" borderRadius={2} top={S / 2 - 2 - 18} left={S / 2 - 3.5}
                  style={{ transform: [{ translateY: 9 }, { rotate: "40deg" }, { translateY: -9 }] }} />
          <YStack position="absolute" width={3} height={12} backgroundColor="#f3f1ea" borderRadius={2} top={S / 2 - 2 - 12} left={S / 2 - 3.5}
                  style={{ transform: [{ translateY: 6 }, { rotate: "-60deg" }, { translateY: -6 }] }} />
          <YStack position="absolute" width={6} height={6} borderRadius={6} backgroundColor={ring} top={S / 2 - 5} left={S / 2 - 5} />
        </>) : null}
      </>)}
    </YStack>
  );
}
// one setting's row: its name, whether it is this device's own (and back to every device's in a tap), and its choice. A
// component of its own, not one made inside the card -- made there, every redraw of PLACES was a new kind of row, and
// React built each row and its pictures again
function OwnRow({ k, label, own, set, children }: { k: string | string[]; label: string; own: object;
                  set: (patch: Record<string, unknown>) => void; children: React.ReactNode }) {
  const keys = Array.isArray(k) ? k : [k], mine = keys.some((x) => x in own);
  return (
    <YStack gap={4} marginTop={8}>
      <XStack gap={8} alignItems="baseline" flexWrap="wrap">
        <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color10">{label}</Text>
        {mine ? <Text fontSize={12} color="$color9" cursor="pointer" role="button"
                      onPress={() => set(Object.fromEntries(keys.map((x) => [x, null])))}>{"this one's own · back to every device's"}</Text>
              : <Text fontSize={12} color="$color10">as every device</Text>}
      </XStack>
      {children}
    </YStack>
  );
}
function OwnSettingsCard({ id, ink, daemon }: { id: string; ink: string; daemon?: Carried | null }) {
  const [s, setS] = useState<OwnSettings | null>(null);
  const [said, setSaid] = useState("");
  const path = `/api/devices/${encodeURIComponent(id)}/settings`;
  useEffect(() => { api<OwnSettings>(path).then(setS).catch((e) => setSaid((e as Error).message)); }, [path]);
  if (!s) return said ? <Small color="$color8">{said}</Small> : <Small>Asking the companion…</Small>;
  const set = async (patch: Record<string, unknown>) => {
    try { const r = await api<Pick<OwnSettings, "own" | "settings">>(path, patch); setS((x) => x && { ...x, ...r }); setSaid(""); }
    catch (e) { setSaid((e as Error).message); }
  };
  const v = s.settings;
  return (
    <YStack backgroundColor="$color2" borderRadius={6} padding={12} gap={2} marginTop={6}>
      <Text fontFamily="$mono" fontSize={12} letterSpacing={2} color="$color11">ITS OWN SETTINGS</Text>
      <OwnRow own={s.own} set={set} k={["sound", "volume"]} label="SOUND">
        <Choice value={v.sound ? v.volume : 0} options={[[0, "Off"], [20, "Quiet"], [40, "Middle"], [70, "Loud"], [100, "Loudest"]]}
                onPick={(x) => set(x === 0 ? { sound: false } : { sound: true, volume: x })} ink={ink} />
      </OwnRow>
      <OwnRow own={s.own} set={set} k="wakeSound" label="THE WAKE JINGLE">
        <Choice value={v.wakeSound ?? "power"} options={[["power", "When it starts"], ["every", "Every time it wakes"]]}
                onPick={(wakeSound) => set({ wakeSound })} ink={ink} />
      </OwnRow>
      <OwnRow own={s.own} set={set} k="home" label="HOME, WHERE IT WAKES">
        <Choice<DeviceSettings["home"]> value={v.home} options={[["daemon", "The daemon"], ["today", "Today's step"]]} onPick={(home) => set({ home })} ink={ink} />
      </OwnRow>
      <OwnRow own={s.own} set={set} k="sleepAfter" label="SLEEP WHEN LEFT ALONE">
        <Choice value={v.sleepAfter} options={[[30, "30 s"], [60, "1 min"], [120, "2 min"], [300, "5 min"], [0, "Never"]]} onPick={(sleepAfter) => set({ sleepAfter })} ink={ink} />
      </OwnRow>
      <OwnRow own={s.own} set={set} k="ring" label="THE RING AT REST">
        <Choice value={v.ring} options={[[0, "Off"], [15, "Dim"], [33, "A third"], [60, "Bright"]]} onPick={(ring) => set({ ring })} ink={ink} />
      </OwnRow>
      {ROUND_FACE.test(id) ? (<>
        <OwnRow own={s.own} set={set} k="face" label="ITS FACE">
          <XStack gap={2} flexWrap="wrap">
            {FACES.map(([f, name, about]) => (
              <YStack key={f} role="button" cursor="pointer" width={68} gap={3} padding={2} borderRadius={6} alignItems="center"
                      borderWidth={2} borderColor={(v.face ?? "daemon") === f ? "$color9" : "transparent"} onPress={() => set({ face: f })}>
                <FacePicture face={f} sky={v.faceSky ?? true} daemon={daemon} ring="#833131" />
                <Text fontFamily="$mono" fontSize={12} fontWeight={(v.face ?? "daemon") === f ? "800" : "500"} color="$color12">{name}</Text>
                <Text fontSize={10} lineHeight={13} textAlign="center" color="$color10">{about}</Text>
              </YStack>
            ))}
          </XStack>
        </OwnRow>
        <OwnRow own={s.own} set={set} k="faceSky" label="SEASON AND WEATHER">
          <Choice value={v.faceSky ?? true} options={[[true, "On"], [false, "Off"]]} onPick={(faceSky) => set({ faceSky })} ink={ink} />
          <Small color="$color10">The season's sky behind the daemon and the weather in front, on the DAEMON and CLOCK faces.</Small>
        </OwnRow>
      </>) : null}
      {said ? <Small color="$color8">{said}</Small> : null}
    </YStack>
  );
}

export function DeviceScreen({ ink }: { ink: string }) {
  const [mine, setMine] = useState<string | null>(null);   // C-160: the device whose own settings are open
  const [link, setLink] = useState<Link | null>(null);
  const [error, setError] = useState("");
  const [ran, setRan] = useState<number | null>(null);
  const [ssid, setSsid] = useState(""), [pass, setPass] = useState(""), [wifiSent, setWifiSent] = useState<number | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]), [brand, setBrand] = useState<string>(""), [at, setAt] = useState(0);
  const [tried, setTried] = useState<number | null>(null), [kept, setKept] = useState<number | null>(null);
  const [managed, setManaged] = useState<number | null>(null), [forgot, setForgot] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null), [newName, setNewName] = useState("");   // C-59
  useEffect(() => {
    // While this tab is open: every 1.5 s at home. Away, every 15 s, and never a second ask while one is out -- each is a
    // run of the relay, and a companion that cannot be reached holds each for the relay's whole minute (2026-10-08: 624
    // runs in a day, all failing). While the companion is away altogether, what was kept is shown and nothing is asked.
    let busy = false, last = 0, shown = "";
    const poll = () => {
      if (busy || OFFLINE && Date.now() - last < 60000 || isAway() && Date.now() - last < 15000) return;
      busy = true; last = Date.now();
      // only when something changed: a redraw for nothing re-made every row under the finger (the user, 2026-10-11)
      api<Link>("/api/device/link").then((l) => {
        const now = JSON.stringify(l);
        if (now !== shown) { shown = now; setLink(l); }
        setError("");
      }).catch((e) => setError(e.message))
        .finally(() => { busy = false; });
    };
    poll();
    const t = setInterval(poll, 1500);
    api<Brand[]>("/api/ir/brands").then(setBrands).catch(() => {});
    return () => clearInterval(t);
  }, []);
  // a poll that failed keeps what was shown, with a word -- the whole tab swapped for the error and back was the flicker
  if (!link) return <Small>{error || "Loading…"}</Small>;
  const run = async (routine: string) => setRan((await api<{ id: number }>("/api/device/run", { routine })).id);
  // C-51: a brand's remote -- try its POWER, and keep the whole remote (its volume buttons come with it)
  const sets = brands.find((b) => b.brand === brand)?.sets ?? [];
  const set = sets[at];
  const tryPower = async () => setTried((await api<{ id: number }>("/api/device/ir",
    { protocol: set.protocol, code: set.power, bits: set.bits, repeat: set.repeat, label: `${set.label} POWER` })).id);
  const keepRemote = async () => setKept((await api<{ id: number }>("/api/device/remote", { op: "add", brand, label: set.label })).id);
  const manage = async (op: "activate" | "remove", index: number) =>
    setManaged((await api<{ id: number }>("/api/device/remote", { op, index })).id);
  const rename = async (index: number) => {   // C-59: the user's own name for a remote
    setManaged((await api<{ id: number }>("/api/device/remote", { op: "rename", index, name: newName })).id);
    setRenaming(null);
  };
  // C-93: added to the list every device shares -- each learns it the next time it is in touch
  const sendWifi = async () => { await api("/api/networks", { ssid, password: pass }); setSsid(""); setPass(""); setWifiSent(-1); };
  return (
    <YStack gap={14}>
      {error ? <Small color="$color10">{`Not updated just now: ${error}`}</Small> : null}
      {HANDHELD && !ALONE ? <HandheldCard ink={ink} /> : null}
      {ALONE ? null : (   /* C-111: a handheld links to a companion on a computer */
      <Card borderLeftWidth={6} borderLeftColor={link.linked ? "$color9" : "$color5"}>
        <Eyebrow>THE HANDHELD</Eyebrow>
        <Text fontSize={20} fontWeight="600" color="$color12">
          {link.linked ? `Linked, by ${link.via === "usb" ? "its cable" : link.via === "phone" ? "a phone (Bluetooth)" : "Wi-Fi"}` : "Not linked"}
        </Text>
        <Small>{link.linked ? link.firmware
          : "Plug it in and run ./linkCompanion.sh, or let it join your Wi-Fi (below)."}</Small>
        {link.battery ? <Small color={link.battery.percent <= 15 && !link.battery.usb ? "$red10" : undefined}>
          {`Battery ${link.battery.percent}%${link.battery.charging ? ", charging" : link.battery.full ? ", full" : link.battery.usb ? ", plugged in" : ""}`}
          {` (as of ${new Date(link.battery.at).toLocaleTimeString()})`}</Small> : null}
      </Card>
      )}

      {link.devices && link.devices.length ? (                // C-80: every device the companion has heard, by its own name
        <Card>
          <Eyebrow>YOUR DEVICES</Eyebrow>
          {/* C-80: a daemon in each -- SEND them in the game, SYNC, then choose here which device carries which (DRAFT) */}
          <Small>{(link.away ?? []).length > 1 || link.devices.length > 1
            ? "Each device hosts a daemon of its own. SEND them from the party in the game, SYNC, and choose here which goes where."
            : "SEND a daemon from the party in the game and SYNC: it goes to your device."}</Small>
          {/* C-100 (DRAFT) */}
          {WIDGET ? <Small>{"Your phone can host one too: add the DAEMONS widget to your home screen, and it appears here as This phone's widget."}</Small> : null}
          {/* C-130: under each maker's name, and a picture of each device beside it */}
          {MAKERS.map((maker) => ({ maker, ds: link.devices!.filter((d) => makerOf(d.kind) === maker) })).filter((g) => g.ds.length).map((g) => (
          <YStack key={g.maker} marginTop={10}>
          <Text fontFamily="$mono" fontSize={12} letterSpacing={2} color="$color10" borderBottomWidth={1} borderColor="$color6"
                paddingBottom={2}>{g.maker.toUpperCase()}</Text>
          {g.ds.map((d) => (
            <XStack key={d.id} gap={12} marginTop={8} alignItems="flex-start">
            <DeviceSprite kind={d.kind} size={52} dim={!d.here} />
            <YStack gap={4} flex={1}>
              <XStack justifyContent="space-between" alignItems="baseline" gap={8} cursor="pointer" role="button"
                      onPress={() => setMine(mine === d.id ? null : d.id)}>
                <Text fontSize={15} fontWeight="600" color={d.here ? "$color12" : "$color10"}>
                  {`${lookFor(d.kind)?.name ?? KIND_NAMES[d.kind] ?? d.kind}${d.here ? "" : " (away)"}`}</Text>
                <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color9">{mine === d.id ? "CLOSE" : "ITS SETTINGS ›"}</Text>
              </XStack>
              <Small>{[d.here ? `here, by ${d.via === "usb" ? "its cable" : d.via === "phone" ? "the phone"
                                           : d.via === "relay" ? "its own Wi-Fi, away" : "Wi-Fi"}`
                                : `last heard ${new Date(d.lastSeen).toLocaleString()}`,
                       d.battery ? `battery ${d.battery.percent}%${d.battery.charging ? ", charging" : ""}` : null,
                       d.firmware ? `firmware ${d.firmware}` : null,                               // C-91
                       d.id].filter(Boolean).join(" · ")}</Small>
              <Text fontSize={14} color="$color12">
                {d.daemon ? `Hosts ${d.daemon.nickname || d.daemon.name}, Lv. ${d.daemon.level}` : "Hosts no daemon"}</Text>
              {(link.away ?? []).length ? (
                <Choice<number | null> value={d.daemon?.personality ?? null}
                  options={[...(link.away ?? []).map((a): [number | null, string] => [a.personality, a.nickname || a.name]), [null, "None"]]}
                  onPick={async (personality) => {
                    const v = await api<{ devices: DeviceRow[]; away: Carried[] }>("/api/devices/carry", { id: d.id, personality });
                    setLink((l) => l && { ...l, devices: v.devices, away: v.away });
                    redrawWidgetNow();                                               // C-100
                  }} ink={ink} />
              ) : null}
              {mine === d.id ? <OwnSettingsCard id={d.id} ink={ink} daemon={d.daemon} /> : null}
            </YStack>
            </XStack>
          ))}
          </YStack>
          ))}
        </Card>
      ) : null}

      {link.linked ? (
        <Card>
          <Eyebrow>ITS ROUTINES</Eyebrow>
          <Small>Run any of them from here. The board shows it running, and its answer comes back below.</Small>
          {link.routines.filter((t) => t.routines.length).map((t) => (
            <YStack key={t.name} gap={2} marginTop={6}>
              <Text fontFamily="$mono" fontSize={12} letterSpacing={1} color="$color10">{t.name} ({t.radio})</Text>
              <XStack gap={8} flexWrap="wrap">
                {t.routines.filter((r) => r !== "JOIN A NETWORK").map((r) =>
                  <Action key={r} label={r} onPress={() => run(`${t.name}/${r}`)} ink={ink} />)}
              </XStack>
            </YStack>
          ))}
          <Result link={link} id={ran} />
        </Card>
      ) : null}

      <DeviceSettingsCard ink={ink} />

      <Card>
        <Eyebrow>ITS REMOTES</Eyebrow>
        <Small>{`The remotes the board has learned -- on the board, FLARE then TEACH A REMOTE (power, volume up, volume down), or add one here by its brand. FLARE's buttons send from the one in use.`}</Small>
        {link.remotes.remotes.length === 0 ? <Small color="$color10">None learned yet.</Small> : null}
        {link.remotes.remotes.map((r, i) => (
          <XStack key={i} alignItems="center" gap={8} flexWrap="wrap" paddingVertical={4}>
            <Text flex={1} minWidth={140} fontSize={15} fontWeight={i === link.remotes.active ? "700" : "400"} color="$color12">
              {`${r.name}${i === link.remotes.active ? "  (in use)" : ""}`}</Text>
            <Text fontFamily="$mono" fontSize={11} color="$color10">
              {["POWER", "VOL +", "VOL -"].map((b, k) => r.buttons[k] ? b : `no ${b}`).join(" · ")}</Text>
            {i !== link.remotes.active ? <Action label="Use it" onPress={() => manage("activate", i)} ink={ink} /> : null}
            <Action label="Rename" onPress={() => { setRenaming(i); setNewName(r.name); }} ink={ink} />
            <Action label="Remove" onPress={() => manage("remove", i)} ink={ink} />
            {renaming === i ? (
              <XStack width="100%" gap={8} alignItems="center" flexWrap="wrap">
                <Input flex={1} minWidth={160} value={newName} onChangeText={setNewName} maxLength={16} autoFocus
                       placeholder="a name, up to 16 letters" backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={15} />
                <Action label="Save" onPress={() => rename(i)} ink={ink} />
                <Action label="Cancel" onPress={() => setRenaming(null)} ink={ink} />
              </XStack>
            ) : null}
          </XStack>
        ))}
        <Result link={link} id={managed} />
        <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color10" marginTop={8}>ADD ONE BY BRAND</Text>
        <XStack gap={8} flexWrap="wrap">
          {brands.map((b) => (
            <YStack key={b.brand} role="button" cursor="pointer" borderRadius={3} paddingHorizontal={14} paddingVertical={8}
                    borderWidth={1} borderColor={brand === b.brand ? "$color9" : "$color6"}
                    backgroundColor={brand === b.brand ? "$color9" : "$color1"} hoverStyle={{ borderColor: "$color9" }}
                    onPress={() => { setBrand(b.brand); setAt(0); setTried(null); setKept(null); }}>
              <Text fontSize={13} fontWeight={brand === b.brand ? "700" : "400"} color={brand === b.brand ? ink : "$color12"}>{b.brand}</Text>
            </YStack>
          ))}
        </XStack>
        {set ? (
          <YStack gap={4} marginTop={6}>
            <Small>{`Point the board's end at your TV and try its POWER${sets.length > 1 ? ` (${at + 1} of ${sets.length})` : ""}. If the TV answers, keep the remote: its volume buttons come with it.`}</Small>
            <XStack gap={8} flexWrap="wrap">
              <Action label="Try its POWER" onPress={tryPower} ink={ink} />
              <Action label="It worked: keep this remote" onPress={keepRemote} ink={ink} />
              {sets.length > 1 ? <Action label="Next" onPress={() => { setAt((at + 1) % sets.length); setTried(null); }} ink={ink} /> : null}
            </XStack>
            <Result link={link} id={kept ?? tried} />
            {!link.linked ? <Small>The board is not linked, so nothing will send yet.</Small> : null}
          </YStack>
        ) : null}
      </Card>

      <Card>
        <Eyebrow>EVERY DEVICE'S NETWORKS</Eyebrow>
        <Small>One list for all your devices (DRAFT): a network learned on any of them, or added here, is learned by every
          one the next time it is in touch, and one forgotten is forgotten by all. Each joins whichever it is near.</Small>
        {(link.shared ?? link.networks).length === 0 ? <Small color="$color10">None learned yet.</Small> : null}
        {(link.shared ?? link.networks).map((n, i) => (
          <XStack key={`${i}:${n}`} alignItems="center" gap={8} paddingVertical={2}>
            <Text flex={1} fontSize={15} fontWeight={n === link.currentNetwork ? "700" : "400"} color="$color12">
              {`${n}${n === link.currentNetwork ? "  (on it now)" : ""}`}</Text>
            <Action label="Forget everywhere" onPress={async () => setForgot((await api<{ id: number }>("/api/device/network", { op: "forget", ssid: n })).id)} ink={ink} />
          </XStack>
        ))}
        <Result link={link} id={forgot} />
        {!link.lan.open ? <Small color="$color9">For the board to reach this computer over Wi-Fi, the server has to listen
          on your network: set "host": "0.0.0.0" in server/config.json and restart the companion.</Small> : null}
        <XStack gap={8} flexWrap="wrap" marginTop={4}>
          <Input flexGrow={1} minWidth={160} value={ssid} onChangeText={setSsid} placeholder="network name"
                 backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={13} />
          <Input flexGrow={1} minWidth={160} value={pass} onChangeText={setPass} placeholder="password" secureTextEntry
                 backgroundColor="$color1" borderColor="$color6" color="$color12" fontSize={13} />
          <Action label="Add for every device" onPress={sendWifi} ink={ink} />
        </XStack>
        {wifiSent === -1 ? <Small>Added. Each device learns it when it is next in touch.</Small> : null}
        <Small color="$color10">A password goes only to a device that proves itself: down its cable, or over Wi-Fi with its
          own key (a board gets one the first time it is linked by cable). Never over the phone's Bluetooth.</Small>
      </Card>
    </YStack>
  );
}

// ---- C-53: pairing this phone with the companion -- the address the site shows, and its code, once ----
// ---- C-55, on the phone: the handheld over Bluetooth -- pair it once, and the phone carries its link from then on ----
export function HandheldCard({ ink }: { ink: string }) {
  const [h, setH] = useState<HandheldNow | null>(null);
  useEffect(() => HANDHELD!.watch(setH), []);
  if (!h) return null;
  const head = h.phase === "linked" ? `Linked to ${h.name}` : h.phase === "lost" ? "Out of range"
    : h.phase === "looking" ? "Looking…" : h.phase === "pairing" ? "Pairing…" : "Not paired";
  return (
    <Card borderLeftWidth={6} borderLeftColor={h.phase === "linked" ? "$color9" : "$color5"}>
      <Eyebrow>THE HANDHELD, ON THIS PHONE</Eyebrow>
      <Text fontSize={20} fontWeight="600" color="$color12">{head}</Text>
      <Small>{h.phase === "linked"
        ? (h.companion ? "This phone carries its link: its goal, its daemon and its routines, wherever you both go."
                       : "The companion is out of reach. The handheld keeps going, and what it does waits here.")
        : h.note || "Pair it once: on the handheld, ROUTINES, WHISPER, PAIR MY PHONE. Then press Pair below and type the code it shows."}</Small>
      {h.waiting ? <Small>{`${h.waiting} waiting for the companion`}</Small> : null}
      <XStack gap={8} flexWrap="wrap">
        {h.phase === "none" || h.phase === "lost" ? <Action label="Pair the handheld" ink={ink} onPress={() => HANDHELD!.pair()} /> : null}
        {h.phase !== "none" ? <Action label="Forget it" ink={ink} onPress={() => HANDHELD!.forget()} /> : null}
      </XStack>
    </Card>
  );
}
