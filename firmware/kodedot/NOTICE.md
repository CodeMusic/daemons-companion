# Licences of firmware/kodedot

This folder is the Kode Dot's DAEMONS app (C-424). It links Kode's SDK, which is GPL-3.0-or-later, so **this folder is
GPL-3.0-or-later too**. The rest of daemons-companion is not under this licence; only the files in this folder are.

## The code in this folder

Copyright (C) 2026 the authors of daemons-companion.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public
License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

The file `LICENSE` holds the full text of the GNU General Public License, version 3.

### Additional permission under GNU GPL version 3 section 7

If you modify this Program, or any covered work, by linking or combining it with the RF Abstraction Layer (RFAL) and the
ST25R3916 driver of STMicroelectronics (or a modified version of those libraries), containing parts covered by the terms
of the STMicroelectronics SLA0051 licence, the licensors of this Program grant you additional permission to convey the
resulting work. Corresponding Source for a non-source form of such a combination shall include the source code for the
parts of RFAL and of the ST25R3916 driver used as well as that of the covered work.

*(Kode's app template asks every app to give this permission, as its own NOTICE.md does, so an app can be shared with
the SDK's NFC in it.)*

## What came from Kode

`CMakeLists.txt`, `sdkconfig.defaults`, `.gitignore`, `appdata/icon.png` (a placeholder) and the shape of
`main/daemons_ao.c` follow Kode's app template (kodediy/kode-app-template) and its `display_lvgl` example
(kodediy/kode-sdk), Copyright (C) 2026 Kode, GPL-3.0-or-later.

This licence gives no right to use the names Kode, Kode Dot, kodeOS and Kody as trademarks.

## The SDK

The SDK is not in this folder: ESP-IDF's component manager fetches it at the version `main/idf_component.yml` pins.
Its own `NOTICE.md` says which licence applies to each of its parts.
