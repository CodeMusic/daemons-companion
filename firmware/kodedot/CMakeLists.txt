# C-424: DAEMONS on the Kode Dot -- a kodeOS app on kode-sdk (docs/KODEDOT.md).
#
# This file is Kode's app template's (kodediy/kode-app-template), kept as it is so a newer SDK's template can be laid
# over it: the chip named before anything is fetched, the board's settings fetched rather than copied, and a clean
# checkout configured twice (once, thrown away, only so the component manager fetches kbsp's sdkconfig.board).
# The template's comments explain each step; they are shortened here.
cmake_minimum_required(VERSION 3.22)

# The chip has to be known before kbsp's board file exists: without it ESP-IDF guesses `esp32`, caches it and refuses
# every later pass.
set(IDF_TARGET esp32p4)

# Never write flash, PSRAM or cache facts here: kbsp describes the board and travels with the SDK.
set(KBSP_BOARD
    "${CMAKE_CURRENT_LIST_DIR}/managed_components/kodediy__kbsp/sdkconfig.board")

if(NOT EXISTS "${KBSP_BOARD}" AND NOT KBSP_FETCH_PASS)
    message(STATUS "Fetching the SDK and the board settings (first build only)")
    execute_process(
        COMMAND "${CMAKE_COMMAND}" -G "${CMAKE_GENERATOR}"
                -S "${CMAKE_CURRENT_LIST_DIR}"
                -B "${CMAKE_BINARY_DIR}/kbsp_fetch"
                -DKBSP_FETCH_PASS=ON
                "-DSDKCONFIG=${CMAKE_BINARY_DIR}/kbsp_fetch/sdkconfig"
        RESULT_VARIABLE KBSP_FETCH_RC)
    file(REMOVE_RECURSE "${CMAKE_BINARY_DIR}/kbsp_fetch")
    if(NOT EXISTS "${KBSP_BOARD}")
        message(FATAL_ERROR
            "The SDK could not be fetched (cmake ended with ${KBSP_FETCH_RC}). "
            "Read the first error above: usually GitHub could not be reached, "
            "or the version in main/idf_component.yml does not exist.")
    endif()
endif()

if(EXISTS "${KBSP_BOARD}")
    set(SDKCONFIG_DEFAULTS
        "${KBSP_BOARD};${CMAKE_CURRENT_LIST_DIR}/sdkconfig.defaults")
else()
    # The throwaway configure, which runs without the board settings.
    set(SDKCONFIG_DEFAULTS "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.defaults")
endif()

# What the launcher prints under the name. Raised for every build the Dot is given.
if(NOT DEFINED PROJECT_VER)
    set(PROJECT_VER "00.00.01")
endif()

include($ENV{IDF_PATH}/tools/cmake/project.cmake)

# The app's identity on the Dot: the launcher tracks it by this name, and the image is build/daemons.bin.
project(daemons)
