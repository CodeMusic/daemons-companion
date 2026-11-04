// The beside split's pieces (C-288: out of App.tsx): the knobs, the dividers and the edges.
import { useRef } from "react";
import { PanResponder } from "react-native";
import { Text, YStack } from "tamagui";

// C-260: beside, the game and the companion share the window -- a divider to drag between them, and each side can be
// put away (the other takes the whole window); putting one away while the other is away brings that one back
export type Away = "none" | "game" | "companion";

export function Knob({ label, onPress, hint }: { label: string; onPress: () => void; hint: string }) {
  return (
    <YStack role="button" cursor="pointer" aria-label={hint} width={22} height={34} borderRadius={4} alignItems="center" justifyContent="center"
            backgroundColor="$color9" onPress={onPress}>
      <Text fontSize={16} lineHeight={18} fontWeight="700" color="$color1">{label}</Text>
    </YStack>
  );
}

// a sideways pull, for both dividers: the pan is made once; the drag it calls is this render's. A tap is the knobs'.
function useDrag(drag: (dx: number, done: boolean) => void) {
  const latest = useRef(drag); latest.current = drag;
  return useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3, onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => latest.current(g.dx, false), onPanResponderRelease: (_, g) => latest.current(g.dx, true),
    onPanResponderTerminate: (_, g) => latest.current(g.dx, true),
  })).current;
}

const Grip = () => <YStack gap={4} paddingVertical={12}>{[0, 1, 2, 3, 4].map((i) => <YStack key={i} width={4} height={4} borderRadius={2} backgroundColor="$color9" />)}</YStack>;

export function Divider({ drag, putAway }: { drag: (dx: number, done: boolean) => void; putAway: (side: Away) => void }) {
  const pan = useDrag(drag);
  return (
    <YStack width={24} backgroundColor="$color3" borderLeftWidth={1} borderRightWidth={1} borderColor="$color6"
            alignItems="center" justifyContent="center" gap={10} cursor="col-resize" {...pan.panHandlers}>
      <Knob label="‹" hint="put the game away" onPress={() => putAway("game")} />
      <Grip />
      <Knob label="›" hint="put the companion away" onPress={() => putAway("companion")} />
    </YStack>
  );
}

export function Edge({ side, putAway }: { side: "left" | "right"; putAway: (side: Away) => void }) {
  // the strip at the edge the hidden side went to: bring it back, or swap which side is away
  return (
    <YStack width={28} backgroundColor="$color3" borderColor="$color6" borderLeftWidth={side === "right" ? 1 : 0} borderRightWidth={side === "left" ? 1 : 0}
            alignItems="center" justifyContent="center" gap={10}>
      <Knob label={side === "left" ? "›" : "‹"} hint={side === "left" ? "bring the game back" : "bring the companion back"} onPress={() => putAway("none")} />
      <Knob label={side === "left" ? "»" : "«"} hint={side === "left" ? "the game alone" : "the companion alone"} onPress={() => putAway(side === "left" ? "companion" : "game")} />
    </YStack>
  );
}

// C-268: DEVELOPER MODE's LOGS at the right, beside the companion -- its own divider to drag, and a › that puts it away
// (a ‹ at the right edge brings it back)
export function LogsDivider({ drag, putAway }: { drag: (dx: number, done: boolean) => void; putAway: () => void }) {
  const pan = useDrag(drag);
  return (
    <YStack width={24} backgroundColor="$color3" borderLeftWidth={1} borderRightWidth={1} borderColor="$color6"
            alignItems="center" justifyContent="center" gap={10} cursor="col-resize" {...pan.panHandlers}>
      <Grip />
      <Knob label="›" hint="put the logs away" onPress={putAway} />
    </YStack>
  );
}

export function LogsEdge({ bringBack }: { bringBack: () => void }) {
  return (
    <YStack width={28} backgroundColor="$color3" borderColor="$color6" borderLeftWidth={1} alignItems="center" justifyContent="center">
      <Knob label="‹" hint="bring the logs back" onPress={bringBack} />
    </YStack>
  );
}
