// C-189: the one rule SYNC has always had -- the game is not running while its save is written (docs/ONEAPP.md).
// With the game beside the companion (the iPad's split), the game is still playing when SYNC is asked for, so the game
// hands its save over first: GAME (screens/Game.tsx) fills these in while it plays, and local.ts holds the game around
// a SYNC -- the newest save taken out and the game paused, then the save SYNC wrote put back in and the game going on.
export const GATE = {
  hold: async (): Promise<void> => {},      // the game's save into daemons.sav, the game paused (nothing when no game)
  release: (): void => {},                  // the save as written back into the game, which goes on
};
