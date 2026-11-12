// C-350: SETTINGS' THEME tab -- light or dark (C-144), the day's palette (C-90), the accents from the game (C-349) and the
// hemisphere a month's season turns by (C-355). Every new word DRAFT.
import { useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { LOOK, Look, setLook, setPalette } from "../../state/look";
import { ACCENT_PLACES } from "../../tamagui.config";
import { type AccentMode, type HemisphereSetting, sameAccent, setAccent, setHemisphere, useAccentSetting, useUnlocked, wornAccent } from "../../state/accent";
import { DeviceSettings } from "../../state/types";
import { api, ON_PHONE } from "../../platform/net";
import { useApi } from "../../platform/useApi";
import { Card, Choice, Eyebrow, Small, useDay } from "../../ui/ui";
import { AccentBand } from "../../ui/accentBand";

const Label = ({ children }: { children: string }) =>
  <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color10" marginTop={6}>{children}</Text>;

export function ThemeSettings({ ink }: { ink: string }) {
  const [look, seeLook] = useState(LOOK);
  const [dev, setDev] = useApi<DeviceSettings>("/api/device/settings");
  const palette = async (p: DeviceSettings["palette"]) => {
    const r = await api<DeviceSettings>("/api/device/settings", { palette: p });
    setDev(r); setPalette(r.palette);                                   // C-90: the app wears it at once
  };
  const { hemisphere } = useAccentSetting();
  return (
    <YStack gap={14}>
      <Card>
        <Eyebrow>THE DAY'S COLOUR</Eyebrow>
        <Label>{ON_PHONE ? "LIGHT OR DARK -- AUTO AS THE PHONE IS SET" : "LIGHT OR DARK -- AUTO AS THIS COMPUTER IS SET"}</Label>
        <Choice<Look> value={look} options={[["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]]}
                      onPick={(l) => { setLook(l); seeLook(l); }} ink={ink} />
        {dev ? <>
          <Label>THE WEEK'S PALETTE -- EVERY SCREEN AND DEVICE</Label>
          <Choice<DeviceSettings["palette"]> value={dev.palette ?? "checkpoint"} options={[["checkpoint", "The site's"], ["rainbow", "Rainbow"]]}
                                             onPick={palette} ink={ink} />
        </> : null}
      </Card>
      <AccentsCard ink={ink} />
      <Card>
        <Eyebrow>THE MONTH'S SEASON</Eyebrow>
        <Small>A month's tone turns with the year where you are: CONTENT keeps the north's, CONTEXT the south's. DRAFT</Small>
        <Choice<HemisphereSetting> value={hemisphere} onPick={setHemisphere} ink={ink}
                                   options={[["edition", "As the edition"], ["north", "North"], ["south", "South"]]} />
      </Card>
    </YStack>
  );
}

// C-349: IN STEP WITH THE GAME first, then the places the save has unlocked, then OFF
function AccentsCard({ ink }: { ink: string }) {
  const { mode } = useAccentSetting();
  const u = useUnlocked();
  const day = useDay();
  const worn = wornAccent(mode, u);
  const all = Object.keys(ACCENT_PLACES).length;
  return (
    <Card>
      <Eyebrow>ACCENTS FROM THE GAME</Eyebrow>
      <Small>Every place in the game has its own colours. Each one you reach and save in is yours to wear over the day's colour. The day's colour stays on TODAY's day card. DRAFT</Small>
      <Choice<"sync" | "off"> value={typeof mode === "string" ? mode : ("" as never)} ink={ink} onPick={setAccent}
                              options={[["sync", "In step with the game"], ["off", "Off: the day's colour alone"]]} />
      <Small>{!u ? "Shown when the companion reads your save."
        : mode === "sync" ? (worn ? `Wearing ${worn.place}, where you last saved.` : u.here ? `${u.here} has no colours of its own yet.` : "Save in the game to wear where you are.")
        : mode === "off" ? "Only the day's colour." : worn ? `Wearing ${worn.place}.` : "That place is not unlocked in this save."}</Small>
      {u ? <>
        <Label>{`UNLOCKED -- ${u.unlocked.length} OF ${all}`}</Label>
        <YStack gap={6}>
          {u.unlocked.map((place) => {
            const c = ACCENT_PLACES[place];
            const on = sameAccent(mode, { place });
            return (
              <XStack key={place} role="button" cursor="pointer" alignItems="center" gap={10} padding={8} borderRadius={6}
                      borderWidth={on ? 2 : 1} borderColor={on ? day.colour : "$color6"} backgroundColor="$color1"
                      hoverStyle={{ borderColor: "$color9" }} onPress={() => setAccent({ place } as AccentMode)}>
                <YStack width={64} borderRadius={2} overflow="hidden"><AccentBand colours={c} height={14} /></YStack>
                <Text flex={1} fontFamily="$mono" fontSize={12} fontWeight={on ? "700" : "400"} color="$color12">{place}</Text>
                {u.here === place ? <Text fontFamily="$mono" fontSize={10} letterSpacing={1} color="$color10">SAVED HERE</Text> : null}
                {c.breathe ? <Text fontFamily="$mono" fontSize={10} letterSpacing={1} color="$color10">BREATHES</Text> : null}
              </XStack>
            );
          })}
        </YStack>
        {all > u.unlocked.length ? <Small>{`${all - u.unlocked.length} more to find in the game.`}</Small> : null}
      </> : null}
    </Card>
  );
}
