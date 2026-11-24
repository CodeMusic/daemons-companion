# C-378: DAEMONS on the Cardputer Zero, and the Linux boards after it (C-457: ZERO_BOARD) -- one C++ program, built on a computer with an
# SDL window (to write and play it before the device is in hand) and on the device itself with /dev/fb0 and evdev.
# The plan is docs/CARDPUTERZERO.md. `./build.sh` runs this.
cmake_minimum_required(VERSION 3.16)
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)   # mGBA 0.10.5 asks for 3.1, which CMake 4 no longer takes as it is
project(daemons_zero C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif()

# The side: on Linux the device's own screen and keys; anywhere else an SDL window. -DZERO_DEVICE=OFF on a Linux
# computer gives the window there too.
if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  option(ZERO_DEVICE "the device's screen and keys (/dev/fb0, evdev) rather than an SDL window" ON)
else()
  set(ZERO_DEVICE OFF)
endif()

# ---- what it is built from: pinned, checked by hash, fetched when built, never kept here --------------------------
# mGBA (MPL-2.0) is the core EmulatorJS runs in the app and the playground; LovyanGFX (FreeBSD) is the boards' own
# drawing; miniaudio (MIT-0) is the device's own sound library; ArduinoJson (MIT) is what the boards read JSON with.
include(FetchContent)
set(FETCHCONTENT_QUIET ON)
if(POLICY CMP0135)
  cmake_policy(SET CMP0135 NEW)   # what is fetched is dated when it is unpacked, so a new pin rebuilds
endif()
FetchContent_Declare(mgba
  URL https://github.com/mgba-emu/mgba/archive/refs/tags/0.10.5.tar.gz
  URL_HASH SHA256=91d6fbd32abcbdf030d58d3f562de25ebbc9d56040d513ff8e5c19bee9dacf14
  SOURCE_SUBDIR not-added-here)
FetchContent_Declare(lovyangfx
  URL https://github.com/lovyan03/LovyanGFX/archive/refs/tags/1.1.16.tar.gz
  URL_HASH SHA256=42e10e66cf8010e6801e66738eb5a55b4756b6ab655e75ac66307ca1f1b21dc2
  SOURCE_SUBDIR not-added-here)
FetchContent_Declare(miniaudio
  URL https://github.com/mackron/miniaudio/archive/refs/tags/0.11.21.tar.gz
  URL_HASH SHA256=6afb5c231613d2fab4f1c668b7243ff9a7d6d78a7f5a2692c133f026fe508506
  SOURCE_SUBDIR not-added-here)
FetchContent_MakeAvailable(mgba lovyangfx miniaudio)

set(ARDUINOJSON_H ${CMAKE_BINARY_DIR}/_deps/arduinojson/ArduinoJson.h)
if(NOT EXISTS ${ARDUINOJSON_H})
  file(DOWNLOAD https://github.com/bblanchon/ArduinoJson/releases/download/v7.2.1/ArduinoJson-v7.2.1.h ${ARDUINOJSON_H}
       EXPECTED_HASH SHA256=ce2b125e00b019d4ec43d4428eefb31d35a5d30e7d267d914aa2423fc1432725)
endif()

# mGBA as a library alone (its LIBMGBA_ONLY: no frontends, no dependencies), the GBA core only
set(M_CORE_GB OFF CACHE BOOL "" FORCE)
set(M_CORE_GBA ON CACHE BOOL "" FORCE)
add_subdirectory(${mgba_SOURCE_DIR} ${mgba_BINARY_DIR} EXCLUDE_FROM_ALL)

# LovyanGFX's drawing and its built-in fonts (the boards' Font0 and the rest). Its Japanese, Chinese and Korean fonts
# (118 MB of source) are not compiled: each of their symbols gets a weak empty stand-in, written here from its headers,
# so lgfx_fonts.cpp links without them -- and the device can build this in its 512 MB.
set(LGFX ${lovyangfx_SOURCE_DIR}/src)
file(GLOB LGFX_SRC ${LGFX}/lgfx/utility/*.c ${LGFX}/lgfx/v1/*.cpp ${LGFX}/lgfx/v1/misc/*.cpp
     ${LGFX}/lgfx/v1/panel/Panel_Device.cpp ${LGFX}/lgfx/v1/panel/Panel_FrameBufferBase.cpp)
set(LGFX_STUBS ${CMAKE_BINARY_DIR}/lgfx_font_stubs.c)
file(GLOB LGFX_BIG_FONT_HEADERS ${LGFX}/lgfx/Fonts/efont/*.h ${LGFX}/lgfx/Fonts/IPA/*.h)
set(STUBS "/* written by CMakeLists.txt: the big fonts' symbols, weak and empty -- never drawn with */\n#include <stdint.h>\n")
foreach(h ${LGFX_BIG_FONT_HEADERS})
  file(STRINGS ${h} lines REGEX "^extern const uint8_t [a-z0-9_]+\\[\\];")
  foreach(l ${lines})
    string(REGEX REPLACE "^extern const uint8_t ([a-z0-9_]+)\\[\\];.*" "\\1" name "${l}")
    string(APPEND STUBS "__attribute__((weak)) const uint8_t ${name}[1] = { 0 };\n")
  endforeach()
endforeach()
file(WRITE ${LGFX_STUBS}.new "${STUBS}")
file(COPY_FILE ${LGFX_STUBS}.new ${LGFX_STUBS} ONLY_IF_DIFFERENT)

# patches.json as built in: the companion's own (server/data/), or the copy tools/install.sh puts beside the source on
# the device -- read when the program cannot reach GitHub, and never newer than the one it fetches
if(EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/patches.json)
  set(ZERO_PATCHES_JSON ${CMAKE_CURRENT_SOURCE_DIR}/patches.json)
else()
  set(ZERO_PATCHES_JSON ${CMAKE_CURRENT_SOURCE_DIR}/../../server/data/patches.json)
endif()

# C-457: the board this is built for -- src/boards/<ZERO_BOARD>.cpp, its screen, keys and name (docs/PIBOARDS.md)
set(ZERO_BOARD cardputer-zero CACHE STRING "the Linux board: cardputer-zero, gamepi20, gamehat, uconsole")
if(NOT EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/src/boards/${ZERO_BOARD}.cpp)
  message(FATAL_ERROR "no board called ${ZERO_BOARD}: src/boards/ has the ones there are")
endif()
message(STATUS "board: ${ZERO_BOARD}")

find_package(CURL REQUIRED)
find_package(Threads REQUIRED)

# C-515: when and from what it was built, written at each configure (build.sh configures every build); only version.cpp
# is compiled again
string(TIMESTAMP ZERO_BUILT "%s" UTC)
set(ZERO_COMMIT "$ENV{ZERO_VERSION}")
if(NOT ZERO_COMMIT)
  set(ZERO_COMMIT local)
endif()
configure_file(src/version.cpp.in ${CMAKE_BINARY_DIR}/version.cpp @ONLY)

set(SRC
  src/main.cpp
  src/update.cpp
  ${CMAKE_BINARY_DIR}/version.cpp
  src/paths.cpp
  src/keys.cpp
  src/canvas.cpp
  src/sound.cpp
  src/game/hash.cpp
  src/game/bps.cpp
  src/game/rom.cpp
  src/game/emu.cpp
  src/hub/http.cpp
  src/hub/hub.cpp
  src/hub/mirror.cpp
  src/pages/home.cpp
  src/pages/play.cpp
  src/pages/make.cpp
  src/pages/pair.cpp
  src/pages/parts.cpp
  src/pages/care.cpp
  src/pages/step.cpp
  src/pages/party.cpp
  src/pages/say.cpp
  src/pages/caps.cpp
  src/pages/rollcall.cpp
  src/pages/talk.cpp
  src/pages/kit.cpp
  src/pages/engine.cpp
  src/pages/dashboard.cpp
  src/sites/eudaimonia.cpp
  src/sites/commons.cpp
  src/pages/account.cpp
  src/apps.cpp
  src/kit/stackflow.cpp
  src/kit/kit.cpp
  src/kit/policy.cpp
  src/caps/bus.cpp
  src/caps/cc1101.cpp
  src/caps/cap.cpp
  src/caps/longwave.cpp
  src/boards/pad.cpp
  src/boards/${ZERO_BOARD}.cpp)

if(ZERO_DEVICE)
  list(APPEND SRC src/hal/device.cpp)
  # LovyanGFX picks its platform by what it can include: SDL's headers win over the framebuffer if they are present
  include(CheckIncludeFileCXX)
  check_include_file_cxx(SDL2/SDL.h ZERO_HAS_SDL_HEADERS)
  if(ZERO_HAS_SDL_HEADERS)
    find_package(SDL2 REQUIRED)
    list(APPEND LGFX_SRC ${LGFX}/lgfx/v1/platforms/sdl/common.cpp)
    set(LGFX_LIBS SDL2::SDL2)
  else()
    list(APPEND LGFX_SRC ${LGFX}/lgfx/v1/platforms/framebuffer/common.cpp)
  endif()
else()
  find_package(SDL2 REQUIRED)
  list(APPEND SRC src/hal/window.cpp)
  list(APPEND LGFX_SRC ${LGFX}/lgfx/v1/platforms/sdl/common.cpp)
  set(LGFX_LIBS SDL2::SDL2)
endif()

add_library(lgfx STATIC ${LGFX_SRC} ${LGFX_STUBS})
target_include_directories(lgfx SYSTEM PUBLIC ${LGFX})   # its own warnings stay its own
target_compile_definitions(lgfx PUBLIC LGFX_USE_V1)
target_compile_options(lgfx PRIVATE -w -ffunction-sections -fdata-sections)
target_link_libraries(lgfx PUBLIC ${LGFX_LIBS} Threads::Threads)

add_executable(daemons-zero ${SRC})
target_include_directories(daemons-zero PRIVATE src ${CMAKE_SOURCE_DIR}/.. ${CMAKE_BINARY_DIR}/_deps/arduinojson ${miniaudio_SOURCE_DIR})
target_compile_options(daemons-zero PRIVATE -Wall -Wextra -Wno-unused-parameter -Wno-missing-field-initializers)
target_compile_definitions(daemons-zero PRIVATE ZERO_DEVICE=$<BOOL:${ZERO_DEVICE}> M_CORE_GBA BUILD_STATIC
  ZERO_PATCHES_JSON="${ZERO_PATCHES_JSON}"
  ARDUINOJSON_STRING_LENGTH_SIZE=4)   # C-380: a save travels as one base64 string of 175 KB; ArduinoJson stops at 64 KB
target_link_libraries(daemons-zero PRIVATE mgba lgfx CURL::libcurl Threads::Threads ${CMAKE_DL_LIBS})
if(APPLE)
  target_link_libraries(daemons-zero PRIVATE "-framework CoreFoundation" "-framework CoreAudio" "-framework AudioToolbox"
                        -Wl,-dead_strip)
else()
  target_link_libraries(daemons-zero PRIVATE m -Wl,--gc-sections)
endif()

# The checks that need no device: BPS against vectors written by DAEMONS' own encoder, and the hashes
enable_testing()
add_executable(zero-tests test/tests.cpp src/game/hash.cpp src/game/bps.cpp src/kit/stackflow.cpp src/kit/policy.cpp)
target_include_directories(zero-tests PRIVATE src ${CMAKE_SOURCE_DIR}/.. ${CMAKE_BINARY_DIR}/_deps/arduinojson)
target_compile_definitions(zero-tests PRIVATE ARDUINOJSON_STRING_LENGTH_SIZE=4)
add_test(NAME bps COMMAND zero-tests ${CMAKE_CURRENT_SOURCE_DIR}/test)
