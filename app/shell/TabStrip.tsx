// The companion's tabs, under its header. (C-288: out of App.tsx.) Too many for the width, they scroll, and a › shows
// there are more and takes you to them, and goes once the last is in view
import { useRef, useState } from "react";
import { ScrollView, Text, XStack, YStack } from "tamagui";
import { SHOWN_TABS, TABS } from "../state/types";

export function TabStrip({ tab, setTab, tabs = SHOWN_TABS }: { tab: (typeof TABS)[number]; setTab: (t: (typeof TABS)[number]) => void;
                                                                tabs?: readonly (typeof TABS)[number][] }) {
  const strip = useRef<any>(null);
  const size = useRef({ seen: 0, whole: 0, at: 0 });
  const [more, setMore] = useState(false);
  const [narrow, setNarrow] = useState(false);              // C-156: a phone's width -- the six share it, a size smaller
  const measure = () => { const z = size.current; setMore(z.whole - z.seen - z.at > 4); };
  return (
    <YStack position="relative">
      <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={32}
                  contentContainerStyle={narrow ? { flexGrow: 1 } : undefined}
                  onLayout={(e: any) => { size.current.seen = e.nativeEvent.layout.width; setNarrow(size.current.seen < 560); measure(); }}
                  onContentSizeChange={(w: number) => { size.current.whole = w; measure(); }}
                  onScroll={(e: any) => { size.current.at = e.nativeEvent.contentOffset.x; measure(); }}>
        <XStack gap={narrow ? 10 : 20} marginTop={12} paddingRight={more ? 28 : 0} role="tablist"
                flexGrow={narrow ? 1 : 0} justifyContent={narrow ? "space-between" : "flex-start"}>
          {tabs.map((t) => (
            <YStack key={t} paddingVertical={10} borderBottomWidth={3} cursor="pointer" role="tab"
                    aria-selected={tab === t} borderBottomColor={tab === t ? "$color9" : "transparent"}
                    onPress={() => setTab(t)}>
              <Text fontFamily="$mono" fontSize={narrow ? 11 : 12} letterSpacing={narrow ? 0.6 : 1.5} fontWeight={tab === t ? "700" : "400"}
                    color={tab === t ? "$color12" : "$color10"}>{t === "dev" ? "</>" : t.toUpperCase()}</Text>
            </YStack>
          ))}
        </XStack>
      </ScrollView>
      {more ? (
        <YStack position="absolute" right={0} top={12} bottom={3} width={32} alignItems="flex-end" justifyContent="center"
                backgroundColor="$color1" cursor="pointer" role="button" aria-label="more tabs"
                onPress={() => strip.current?.scrollToEnd?.({ animated: true })}>
          <Text fontSize={20} lineHeight={20} color="$color9">›</Text>
        </YStack>
      ) : null}
    </YStack>
  );
}
