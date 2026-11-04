// The beside split's sizes and drags (C-288: out of App.tsx's Shell).
import { useRef, useState } from "react";
import { LayoutAnimation } from "react-native";
import { ON_PHONE } from "../net";
import { keepSplit, splitKept } from "../game/away";
import { keepLogsWidth, logsWidth } from "../game/dev";       // C-268
import type { Away } from "./panes";

// C-189: an iPad on its side is one screen -- the game on the left, always playing, and the companion beside it on the
// right (GAME is no longer a tab there); upright, and on a phone, GAME is one more tab
export const isBeside = (width: number, height: number) =>
  ON_PHONE && width > height && Math.min(width, height) >= 700;   // an iPad; a big phone on its side is 440 high

// C-268: DEVELOPER MODE's LOGS at the right -- how wide, put away or not, and the room it takes from the companion
export function useLogsPane(width: number, beside: boolean, devOn: boolean) {
  const [logsAway, setLogsAway] = useState(false);
  const [logsW, setLogsW] = useState(() => (ON_PHONE ? logsWidth() ?? 320 : 320));
  const showLogs = beside && devOn && !logsAway;
  const fitLogs = (w: number) => Math.round(Math.max(220, Math.min(width * 0.4, w)));
  const logsRoom = beside && devOn ? (logsAway ? 28 : fitLogs(logsW) + 24) : 0;
  const logsFrom = useRef<number | null>(null);
  const dragLogs = (dx: number, done: boolean) => {         // the logs' divider dragged left widens the logs
    if (logsFrom.current === null) logsFrom.current = fitLogs(logsW);
    const w = fitLogs(logsFrom.current - dx);
    setLogsW(w);
    if (done) { logsFrom.current = null; keepLogsWidth(w); }
  };
  const logsPutAway = (on: boolean) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setLogsAway(on); };
  return { logsAway, showLogs, logsWidth: fitLogs(logsW), logsRoom, dragLogs, logsPutAway };
}

// C-260: the companion's width beside the game, as dragged and kept, and which side is put away
export function useSplitPane(width: number, beside: boolean, logsRoom: number) {
  const [away, setAway] = useState<Away>("none");            // C-260: which side is put away
  const [split, setSplit] = useState<number | null>(() => (ON_PHONE ? splitKept() : null));   // the companion's width, as dragged
  const fit = (w: number) => Math.round(Math.max(300, Math.min(width - 340 - logsRoom, w)));
  const besideWidth = fit(split ?? Math.min(480, width * 0.42));
  const gameAway = beside && away === "game", companionAway = beside && away === "companion";
  const putAway = (side: Away) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setAway(side); };
  const dragFrom = useRef<number | null>(null);
  const drag = (dx: number, done: boolean) => {             // the divider dragged left widens the companion
    if (dragFrom.current === null) dragFrom.current = besideWidth;
    const w = fit(dragFrom.current - dx);
    setSplit(w);
    if (done) { dragFrom.current = null; keepSplit(w); }
  };
  return { away, besideWidth, gameAway, companionAway, putAway, drag };
}
