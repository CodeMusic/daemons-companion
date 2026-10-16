#pragma once
// The devices as they look -- written by firmware/common/device_sprites.py from its own list (do not edit by hand).
// Each shape is a rectangle on a 32x32 grid, in tenths: x, y, w, h, corner radius, and its colour (0xRRGGBB).
#include <stdint.h>
struct DeviceShape { int16_t x, y, w, h, r; uint32_t c; };
struct DeviceLook { const char *kind, *maker, *name; const DeviceShape *shapes; uint8_t n; };
static const char *const DEVICE_MAKERS[] = { "LilyGO", "M5Stack", "Espressif", "This phone" };
static const int DEVICE_MAKER_N = 4;
static const DeviceShape DEVICE_SHAPES_0[] = { {150, 0, 20, 30, 0, 0x9AA0A8}, {90, 20, 140, 290, 70, 0x1F2125}, {110, 50, 100, 110, 10, 0x22313F}, {120, 60, 80, 90, 5, 0x46A8E0}, {110, 185, 100, 100, 50, 0xFF6AA8}, {118, 193, 84, 84, 42, 0x2B2E33}, {135, 210, 50, 50, 25, 0x17181B}, {230, 80, 10, 40, 0, 0x8B8F97} };
static const DeviceShape DEVICE_SHAPES_1[] = { {10, 100, 300, 120, 60, 0x2A2C31}, {40, 130, 160, 60, 10, 0x22313F}, {50, 140, 140, 40, 5, 0x46A8E0}, {205, 115, 90, 90, 45, 0xFF6AA8}, {213, 123, 74, 74, 37, 0x2B2E33}, {227, 137, 46, 46, 23, 0x17181B} };
static const DeviceShape DEVICE_SHAPES_2[] = { {30, 30, 10, 80, 0, 0xB8BDC4}, {25, 20, 20, 20, 10, 0xB8BDC4}, {10, 100, 300, 120, 60, 0x2A2C31}, {40, 130, 160, 60, 10, 0x22313F}, {50, 140, 140, 40, 5, 0x46A8E0}, {205, 115, 90, 90, 45, 0xFF6AA8}, {213, 123, 74, 74, 37, 0x2B2E33}, {227, 137, 46, 46, 23, 0x17181B} };
static const DeviceShape DEVICE_SHAPES_3[] = { {100, 0, 120, 70, 10, 0x121315}, {100, 250, 120, 70, 10, 0x121315}, {60, 50, 200, 220, 40, 0x1C1D21}, {80, 70, 160, 180, 20, 0x22313F}, {90, 80, 140, 160, 10, 0x46A8E0}, {260, 130, 20, 60, 10, 0x5A5D63} };
static const DeviceShape DEVICE_SHAPES_4[] = { {40, 10, 240, 300, 40, 0x3C3F45}, {60, 30, 200, 130, 10, 0x22313F}, {70, 40, 180, 110, 5, 0x46A8E0}, {145, 170, 30, 30, 15, 0xE8E8E8}, {65, 215, 20, 20, 5, 0x1D1E22}, {93, 215, 20, 20, 5, 0x1D1E22}, {121, 215, 20, 20, 5, 0x1D1E22}, {149, 215, 20, 20, 5, 0x1D1E22}, {177, 215, 20, 20, 5, 0x1D1E22}, {205, 215, 20, 20, 5, 0x1D1E22}, {233, 215, 20, 20, 5, 0x1D1E22}, {65, 243, 20, 20, 5, 0x1D1E22}, {93, 243, 20, 20, 5, 0x1D1E22}, {121, 243, 20, 20, 5, 0x1D1E22}, {149, 243, 20, 20, 5, 0x1D1E22}, {177, 243, 20, 20, 5, 0x1D1E22}, {205, 243, 20, 20, 5, 0x1D1E22}, {233, 243, 20, 20, 5, 0x1D1E22}, {65, 271, 20, 20, 5, 0x1D1E22}, {93, 271, 20, 20, 5, 0x1D1E22}, {121, 271, 20, 20, 5, 0x1D1E22}, {149, 271, 20, 20, 5, 0x1D1E22}, {177, 271, 20, 20, 5, 0x1D1E22}, {205, 271, 20, 20, 5, 0x1D1E22}, {233, 271, 20, 20, 5, 0x1D1E22} };
static const DeviceShape DEVICE_SHAPES_5[] = { {0, 80, 320, 160, 10, 0x1A1C1F}, {35, 95, 250, 130, 5, 0x22313F}, {45, 105, 230, 110, 0, 0x46A8E0}, {10, 100, 20, 20, 5, 0x8B8F97}, {10, 190, 20, 20, 5, 0x8B8F97}, {290, 100, 20, 20, 5, 0x8B8F97}, {290, 190, 20, 20, 5, 0x8B8F97}, {295, 150, 10, 10, 5, 0x4CD964} };
static const DeviceShape DEVICE_SHAPES_6[] = { {0, 90, 320, 140, 15, 0x141518}, {25, 105, 250, 110, 5, 0x05070A}, {32, 112, 236, 96, 0, 0x5B8CFF}, {290, 110, 20, 25, 5, 0x8B8F97}, {290, 185, 20, 25, 5, 0x8B8F97} };
static const DeviceShape DEVICE_SHAPES_7[] = { {10, 50, 300, 220, 20, 0xD9DBD8}, {30, 70, 130, 80, 5, 0x22313F}, {36, 76, 118, 68, 0, 0x46A8E0}, {180, 70, 110, 50, 10, 0xF08A24}, {30, 165, 22, 22, 5, 0x2B2D32}, {59, 165, 22, 22, 5, 0x2B2D32}, {88, 165, 22, 22, 5, 0x2B2D32}, {117, 165, 22, 22, 5, 0x2B2D32}, {146, 165, 22, 22, 5, 0x2B2D32}, {175, 165, 22, 22, 5, 0x2B2D32}, {204, 165, 22, 22, 5, 0x2B2D32}, {233, 165, 22, 22, 5, 0x2B2D32}, {262, 165, 22, 22, 5, 0x2B2D32}, {30, 194, 22, 22, 5, 0x2B2D32}, {59, 194, 22, 22, 5, 0x2B2D32}, {88, 194, 22, 22, 5, 0x2B2D32}, {117, 194, 22, 22, 5, 0x2B2D32}, {146, 194, 22, 22, 5, 0x2B2D32}, {175, 194, 22, 22, 5, 0x2B2D32}, {204, 194, 22, 22, 5, 0x2B2D32}, {233, 194, 22, 22, 5, 0x2B2D32}, {262, 194, 22, 22, 5, 0x2B2D32}, {30, 223, 22, 22, 5, 0x2B2D32}, {59, 223, 22, 22, 5, 0x2B2D32}, {88, 223, 22, 22, 5, 0x2B2D32}, {117, 223, 22, 22, 5, 0x2B2D32}, {146, 223, 22, 22, 5, 0x2B2D32}, {175, 223, 22, 22, 5, 0x2B2D32}, {204, 223, 22, 22, 5, 0x2B2D32}, {233, 223, 22, 22, 5, 0x2B2D32}, {262, 223, 22, 22, 5, 0x2B2D32} };
static const DeviceShape DEVICE_SHAPES_8[] = { {270, 0, 15, 60, 0, 0xB8BDC4}, {10, 50, 300, 220, 20, 0x34363B}, {30, 70, 130, 80, 5, 0x22313F}, {36, 76, 118, 68, 0, 0x46A8E0}, {180, 70, 110, 50, 10, 0xF08A24}, {30, 165, 22, 22, 5, 0x1A1B1E}, {59, 165, 22, 22, 5, 0x1A1B1E}, {88, 165, 22, 22, 5, 0x1A1B1E}, {117, 165, 22, 22, 5, 0x1A1B1E}, {146, 165, 22, 22, 5, 0x1A1B1E}, {175, 165, 22, 22, 5, 0x1A1B1E}, {204, 165, 22, 22, 5, 0x1A1B1E}, {233, 165, 22, 22, 5, 0x1A1B1E}, {262, 165, 22, 22, 5, 0x1A1B1E}, {30, 194, 22, 22, 5, 0x1A1B1E}, {59, 194, 22, 22, 5, 0x1A1B1E}, {88, 194, 22, 22, 5, 0x1A1B1E}, {117, 194, 22, 22, 5, 0x1A1B1E}, {146, 194, 22, 22, 5, 0x1A1B1E}, {175, 194, 22, 22, 5, 0x1A1B1E}, {204, 194, 22, 22, 5, 0x1A1B1E}, {233, 194, 22, 22, 5, 0x1A1B1E}, {262, 194, 22, 22, 5, 0x1A1B1E}, {30, 223, 22, 22, 5, 0x1A1B1E}, {59, 223, 22, 22, 5, 0x1A1B1E}, {88, 223, 22, 22, 5, 0x1A1B1E}, {117, 223, 22, 22, 5, 0x1A1B1E}, {146, 223, 22, 22, 5, 0x1A1B1E}, {175, 223, 22, 22, 5, 0x1A1B1E}, {204, 223, 22, 22, 5, 0x1A1B1E}, {233, 223, 22, 22, 5, 0x1A1B1E}, {262, 223, 22, 22, 5, 0x1A1B1E} };
static const DeviceShape DEVICE_SHAPES_9[] = { {100, 20, 120, 280, 30, 0x2E3035}, {115, 40, 90, 140, 10, 0x22313F}, {125, 50, 70, 120, 5, 0x46A8E0}, {130, 210, 60, 50, 15, 0x1A1B1E}, {220, 90, 15, 60, 5, 0x2F7FE0} };
static const DeviceShape DEVICE_SHAPES_10[] = { {30, 30, 260, 260, 30, 0x2B2D32}, {60, 80, 200, 160, 10, 0x22313F}, {70, 90, 180, 140, 5, 0x46A8E0}, {150, 45, 20, 20, 10, 0x0C0C0E} };
static const DeviceShape DEVICE_SHAPES_11[] = { {20, 20, 280, 280, 40, 0xD63A2F}, {40, 40, 240, 240, 30, 0x3A3C42}, {60, 60, 200, 150, 10, 0x22313F}, {70, 70, 180, 130, 5, 0x46A8E0}, {75, 230, 40, 20, 10, 0x8B8F97}, {140, 230, 40, 20, 10, 0x8B8F97}, {205, 230, 40, 20, 10, 0x8B8F97} };
static const DeviceShape DEVICE_SHAPES_12[] = { {20, 20, 280, 280, 40, 0xE4E4E2}, {26, 80, 12, 160, 6, 0xFF9A3C}, {282, 80, 12, 160, 6, 0xFF9A3C}, {40, 40, 240, 240, 30, 0x3A3C42}, {60, 60, 200, 150, 10, 0x22313F}, {70, 70, 180, 130, 5, 0x46A8E0}, {75, 230, 40, 20, 10, 0x8B8F97}, {140, 230, 40, 20, 10, 0x8B8F97}, {205, 230, 40, 20, 10, 0x8B8F97} };
static const DeviceShape DEVICE_SHAPES_13[] = { {10, 10, 300, 300, 150, 0xE6E6E4}, {35, 35, 250, 250, 125, 0xF08A24}, {65, 65, 190, 190, 95, 0x22313F}, {75, 75, 170, 170, 85, 0x46A8E0} };
static const DeviceShape DEVICE_SHAPES_14[] = { {0, 50, 320, 220, 30, 0x2A2C31}, {20, 70, 280, 180, 10, 0x22313F}, {26, 76, 268, 168, 5, 0x46A8E0}, {155, 55, 10, 10, 5, 0x0C0C0E} };
static const DeviceShape DEVICE_SHAPES_15[] = { {10, 200, 300, 110, 20, 0x2EC4D8}, {30, 20, 260, 240, 40, 0xEFEFED}, {55, 45, 210, 155, 10, 0x22313F}, {65, 55, 190, 135, 5, 0x46A8E0}, {149, 217, 22, 22, 11, 0xE8463A}, {154, 222, 12, 12, 6, 0xEFEFED}, {86, 29, 7, 7, 4, 0x55585E}, {226, 29, 7, 7, 4, 0x55585E} };
static const DeviceShape DEVICE_SHAPES_16[] = { {90, 10, 140, 300, 40, 0x1B1C20}, {100, 25, 120, 270, 30, 0x46A8E0}, {120, 60, 80, 80, 20, 0xFFFFFF}, {135, 75, 50, 50, 10, 0x46A8E0}, {140, 35, 40, 10, 5, 0x1B1C20} };
static const DeviceLook DEVICE_LOOKS[] = {
  { "t-embed-cc1101", "LilyGO", "T-Embed CC1101", DEVICE_SHAPES_0, 8 },
  { "t-embed", "LilyGO", "T-Embed", DEVICE_SHAPES_1, 6 },
  { "t-embed-si4732", "LilyGO", "T-Embed SI4732", DEVICE_SHAPES_2, 8 },
  { "t-watch-s3", "LilyGO", "T-Watch S3", DEVICE_SHAPES_3, 6 },
  { "t-deck", "LilyGO", "T-Deck", DEVICE_SHAPES_4, 25 },
  { "t-display-pro", "LilyGO", "T-Display-S3 Pro", DEVICE_SHAPES_5, 8 },
  { "t-display-amoled", "LilyGO", "T-Display-S3 AMOLED", DEVICE_SHAPES_6, 5 },
  { "m5-cardputer", "M5Stack", "Cardputer", DEVICE_SHAPES_7, 31 },
  { "m5-cardputer-adv", "M5Stack", "Cardputer ADV", DEVICE_SHAPES_8, 32 },
  { "m5-sticks3", "M5Stack", "StickS3", DEVICE_SHAPES_9, 5 },
  { "m5-cores3", "M5Stack", "CoreS3", DEVICE_SHAPES_10, 4 },
  { "m5-fire", "M5Stack", "Fire", DEVICE_SHAPES_11, 7 },
  { "m5go", "M5Stack", "M5GO", DEVICE_SHAPES_12, 9 },
  { "m5-dial", "M5Stack", "Dial", DEVICE_SHAPES_13, 4 },
  { "m5-tab5", "M5Stack", "Tab5", DEVICE_SHAPES_14, 4 },
  { "esp32-s3-box-3", "Espressif", "ESP32-S3-BOX-3", DEVICE_SHAPES_15, 8 },
  { "iphone-widget", "This phone", "This phone's widget", DEVICE_SHAPES_16, 5 },
};
static const int DEVICE_LOOK_N = 17;
static const char *const DEVICE_ALIASES[][2] = { { "t-deck-plus", "t-deck" } };
static const int DEVICE_ALIAS_N = 1;
