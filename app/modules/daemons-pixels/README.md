# daemons-pixels -- native only, and in use

**C-147** (commit 7d3b31c). This module has **no `index.ts` and nothing in TypeScript imports it, on purpose**: it has
no JavaScript side at all. Settled by C-291 (2026-11-04).

It is an `ExpoAppDelegateSubscriber` (`ios/DaemonsPixelsDelegate.swift`, named in `expo-module.config.json`). At
launch it tells every `UIImageView` to enlarge by repeating pixels (`layer.magnificationFilter = .nearest`), so the
companion's pixel art -- the daemons, the MARKS, the player, the GUIDE's cover -- stays sharp on the phone instead of
being smoothed. The site gets the same from CSS (`image-rendering: pixelated`).

Expo's autolinking finds it in `modules/`: it is in `ios/Podfile.lock` (`DaemonsPixels (from
../modules/daemons-pixels/ios)`) and in the generated `ExpoModulesProvider.swift`. **Deleting it would quietly blur
every picture on the iPhone and iPad.** iOS only; no Android side.
