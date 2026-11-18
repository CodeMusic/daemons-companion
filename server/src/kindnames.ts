// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-405: each kind of device's name, for those data/devices.json does not draw -- one table for the app (app/state/data.ts
// re-exports it) and the hub (devicenames.ts), so THE ENGINE ROOM says a device's name exactly as the app does.
export const KIND_NAMES: Record<string, string> = { "t-embed-cc1101": "T-Embed CC1101", "t-embed": "T-Embed",
                                             "t-embed-si4732": "T-Embed SI4732", "t-watch-s3": "T-Watch S3", "t-watch-ultra": "T-Watch Ultra", "t-glass": "T-Glass",
                                             "m5-sticks3": "M5StickS3", "m5-cores3": "M5Stack CoreS3",
                                             "m5-fire": "M5Stack Fire", "m5go": "M5GO", "m5-tab5": "M5Stack Tab5", "m5-dial": "M5Stack Dial",
                                             "iphone-widget": "This phone's widget" };
