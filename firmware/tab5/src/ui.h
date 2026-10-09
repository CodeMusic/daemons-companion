#pragma once
// C-77: the control center's screens -- the app's TODAY, GOALS, DAEMON, INDEX and DEVICES, and SETTINGS (Wi-Fi and
// pairing), drawn from what the Tab5 keeps, in the day's colours. Every word on them is DRAFT.
void uiBegin();
void uiLoop();      // every pass of loop(): redraw what changed, the status bar once a second
int uiStartRotation();   // C-96: the way up the Tab5 was left in (PORTRAIT unless it was set otherwise)
