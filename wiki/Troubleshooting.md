# Troubleshooting

## The widget says *Looking for your companion...* and stays there

1. **Open the app once, paired.** The app is what hands the widget the companion's address and key. A widget that
   says *Open DAEMONS and pair this phone with your companion.* has not been given them yet.
2. **Allow the Local Network.** Settings, Privacy & Security, **Local Network**, and switch on DAEMONS companion.
   Without it neither the app nor the widget reaches the companion at home.
3. **Remove the widget and add it again.** A widget kept from an older build can stay stuck.
4. Check the companion is running and open to your network (the site, SETTINGS, PAIR A PHONE).

*No daemon here* is different: the companion answered, and the widget hosts no daemon yet. SEND one in the game, SYNC,
and choose it for the widget under DEVICE, YOUR DEVICES ([Host on your phone](Host-on-your-phone#7-choose-the-daemon-it-hosts)).

## A press on the widget says *Kept until home answers.*

The companion could not be reached when you pressed. Nothing is lost: the press is kept on the phone and sent the
next time the app opens and reaches the companion. If this happens **at home**:

- Is the server running, and the computer awake? `./bindCompanion.sh always` keeps both
  ([Running the companion](Running-the-companion#keep-it-running)).
- Has the computer's address moved? See the next section.

## *Away from the companion* while you are at home

The app shows a toast at the foot (and, dismissed, a small **AWAY** at the top right) when it cannot reach the
companion and is showing what it kept. At home, the usual cause is that **your computer's address changed** and the
phone is still asking the old one.

- **Pair again by name**: the site, SETTINGS, PAIR A PHONE, **Show a code**, and on the phone type
  `<your-computer>.local:4730` instead of the number. A name survives the address moving. (SETTINGS on the phone says
  which address it is paired with.)
- **Stop it moving**: a DHCP reservation on your router, and a **Fixed** private Wi-Fi address on the computer
  ([Away from home](Away-from-home#a-fixed-address-at-home)).
- **The relay names the computer by address too.** If you use one, its Forward node has to say the computer's current
  address ([Away from home](Away-from-home#the-limit-the-relay-reaches-your-computer-at-its-home-address-c-88)).

## Many slow runs in n8n

A run of *Succeeded in 1m 0.0xs* is the relay's 60-second **timeout**: the companion did not answer it. The app asks
the relay one request at a time until it answers, and rests it 30 seconds after a failure, so you should see one run
per try ([Away from home](Away-from-home#reading-n8ns-executions)). If they keep coming, the relay cannot reach your
computer: check its address in the Forward node.

## SYNC says something unexpected

- **Close the game first.** A running emulator writes its own copy of the save back over the companion's.
- *"This save belongs to a different game…"* -- the companion is married to the first save you SYNCed; another game's
  save is shown but never written.
- No SEND in the game's menu? SYNC once first: the first SYNC links the save.

## A board looks dead after flashing

Screen dark, nothing on the cable: it is waiting in its bootloader, and its battery keeps it powered when unplugged.
**Press RST once.** If an upload cannot connect at all, hold BOOT, press and release RST, let go of BOOT, and run it
again. More on [Flashing and linking](Flashing-and-linking#recovery).

## A phone build runs out of disk

`./bindCompanion.sh phone` generates an Xcode project, installs its pods and builds a Release build into
`app/ios/build`, which takes several gigabytes. **Leave about 5 GB free** before you start. If a build fails part-way
on a full disk, free space and run it again; deleting `app/ios` makes the next run generate the project afresh.

## Still stuck

[docs/FIELD-GUIDE.md](https://github.com/CodeMusic/daemons-companion/blob/main/docs/FIELD-GUIDE.md) walks through
everything with what you should see at each step. The server's log is `.logs/server.log`.
