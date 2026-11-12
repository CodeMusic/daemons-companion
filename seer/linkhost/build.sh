#!/bin/bash
# C-221: build the link host -- mGBA 0.10.5 as a library (its tarball checked by hash, the one Homebrew's mGBA uses),
# then linkhost.c against it. macOS (arm64) or Linux; needs cmake, ninja and a C compiler. DRAFT, a spike.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/daemons-linkhost"
VER=0.10.5
SHA=91d6fbd32abcbdf030d58d3f562de25ebbc9d56040d513ff8e5c19bee9dacf14
mkdir -p "$CACHE"
TGZ="$CACHE/mgba-$VER.tar.gz"
[ -f "$TGZ" ] || curl -sSL -o "$TGZ" "https://github.com/mgba-emu/mgba/archive/refs/tags/$VER.tar.gz"
GOT=$( (shasum -a 256 "$TGZ" 2>/dev/null || sha256sum "$TGZ") | cut -d' ' -f1)
[ "$GOT" = "$SHA" ] || { echo "mgba-$VER.tar.gz is not the release (sha256 $GOT)"; exit 1; }
SRC="$CACHE/mgba-$VER"
[ -d "$SRC" ] || tar xzf "$TGZ" -C "$CACHE"
OFF="-DBUILD_QT=OFF -DBUILD_SDL=OFF -DBUILD_STATIC=ON -DBUILD_SHARED=OFF -DBUILD_GL=OFF -DBUILD_GLES2=OFF -DBUILD_GLES3=OFF
     -DUSE_FFMPEG=OFF -DUSE_LIBZIP=OFF -DUSE_MINIZIP=OFF -DUSE_PNG=OFF -DUSE_LZMA=OFF -DUSE_SQLITE3=OFF -DUSE_EDITLINE=OFF
     -DUSE_ELF=OFF -DUSE_DEBUGGERS=OFF -DUSE_LUA=OFF -DENABLE_SCRIPTING=OFF -DUSE_EPOXY=OFF -DUSE_DISCORD_RPC=OFF
     -DUSE_GDB_STUB=OFF -DM_CORE_GB=OFF"
[ -f "$SRC/build/libmgba.a" ] || {
  # mGBA 0.10.5 asks for CMake 3.1, which CMake 4 no longer accepts without the policy floor
  cmake -S "$SRC" -B "$SRC/build" -G Ninja -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_BUILD_TYPE=Release $OFF >/dev/null
  ninja -C "$SRC/build" >/dev/null
}
EXTRA=""; [ "$(uname)" = Darwin ] && EXTRA="-framework CoreFoundation"
# NDEBUG as the library was built: GBASIOLockstepNode has fields only without it
cc -O2 -std=gnu11 -DNDEBUG -DM_CORE_GBA -DUSE_PTHREADS -DUSE_ZLIB -DBUILD_STATIC -D_DARWIN_C_SOURCE -D_GNU_SOURCE \
   -I"$SRC/include" -I"$SRC/build/include" -I"$SRC/src" -o "$HERE/linkhost" "$HERE/linkhost.c" "$SRC/build/libmgba.a" \
   -lz -lpthread -lm $EXTRA
echo "built $HERE/linkhost"
