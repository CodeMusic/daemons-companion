# DAEMONS companion -- privacy

*Last updated 31 October 2026. This covers the DAEMONS companion app for iPhone, iPad and Mac, its site and its
server.*

**DAEMONS companion collects nothing for its developer.** There are no accounts, no analytics, no advertising and no
tracking. What the app knows stays on your devices: on the device itself when it hosts your daemon alone, or on a
companion server you run on your own computer.

## What the app reads, and where it goes

| | what | where it goes |
|---|---|---|
| **Apple Health** | today's step count, read only, with your permission | your own companion server, or nowhere when the device hosts alone. Never used for advertising, never written. |
| **Microphone** | only while you hold TALK, or play the flute in the SONGBOOK | TALK's words are turned into text on your own companion server. The flute listens only for how loud you breathe; nothing is kept or sent. |
| **Bluetooth** | a link to an optional handheld you own, and meeting other companions nearby | the handheld itself. A meeting beacon carries a kind of daemon and a random tag that changes every hour -- no name, no account, no location. |
| **Local network** | finding and reaching your companion server | your own computer, at home or over your own private network (Tailscale). |
| **Your game** | the FireRed or LeafGreen file you choose from Files | it is read on the device to make DAEMONS from it, and kept there. Nothing of it leaves the device. |
| **Your goals, routines and saves** | what you enter, and your game's save | the device, and your own companion server when paired. |

## Things the app downloads

To make and play DAEMONS, the app downloads the DAEMONS patch and its release list from GitHub, and the emulator from
EmulatorJS's public servers. These are ordinary downloads: they send nothing about you, though, like any website,
those servers see your device's internet address.

## Services you choose to connect

Your companion server can be connected, by you, to other services -- an AI model for your daemon's voice, Home
Assistant, the weather for a city you set. Those connections run from your own server, and what you send them is
governed by that service's own terms. None is connected by default.

## Children

The app asks for no personal information and is suitable for all ages.

## Changes and questions

If this policy changes, the new version will be published here with a new date. Questions:
[open an issue](https://github.com/CodeMusic/daemons-companion/issues).
