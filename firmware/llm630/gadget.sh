#!/bin/sh
# C-458 (docs/ZEROKIT.md 1): the Kit's OTG port (J4) as a network to whatever it is plugged into -- the Zero's USB-A, or a
# computer -- beside the ADB M5Stack's image already offers there. One USB function more in the gadget the image makes
# (CDC-NCM; ECM if this kernel lacks NCM), fixed MAC addresses so the far side's interface is always named the same
# (enx027700000001 on the Zero), and 10.77.0.2/30 on this side. Run as root at boot by daemons-kit-gadget.service; safe
# to run again. ADB stays: its function is kept in the same configuration.
set -eu
G=/sys/kernel/config/usb_gadget
HOST_MAC=02:77:00:00:00:01   # the Zero's end (or the computer's)
DEV_MAC=02:77:00:00:00:02    # this end
ADDR=10.77.0.2/30

[ -d $G ] || { mount -t configfs none /sys/kernel/config 2>/dev/null || true; }
[ -d $G ] || { echo "no USB gadget configfs here"; exit 1; }

# the gadget the image made (for ADB), else one of our own
gadget=$(ls -d $G/*/ 2>/dev/null | head -n1 | sed 's:/$::')
if [ -z "$gadget" ]; then
  gadget=$G/daemons
  mkdir -p $gadget/strings/0x409 $gadget/configs/c.1/strings/0x409
  echo 0x1d6b > $gadget/idVendor; echo 0x0104 > $gadget/idProduct
  echo "DAEMONS" > $gadget/strings/0x409/manufacturer; echo "LLM630 Kit" > $gadget/strings/0x409/product
  echo "the Kit" > $gadget/configs/c.1/strings/0x409/configuration
  echo 500 > $gadget/configs/c.1/MaxPower
fi
config=$(ls -d $gadget/configs/*/ | head -n1 | sed 's:/$::')

net=""
for kind in ncm ecm rndis; do
  if [ -d $gadget/functions/$kind.usb0 ] || mkdir $gadget/functions/$kind.usb0 2>/dev/null; then net=$kind; break; fi
done
[ -n "$net" ] || { echo "this kernel offers no USB network function (ncm, ecm or rndis)"; exit 1; }
f=$gadget/functions/$net.usb0

if [ ! -e $config/$net.usb0 ]; then
  udc=$(cat $gadget/UDC 2>/dev/null || true)
  [ -n "$udc" ] && echo "" > $gadget/UDC
  echo $HOST_MAC > $f/host_addr 2>/dev/null || true
  echo $DEV_MAC > $f/dev_addr 2>/dev/null || true
  ln -s $f $config/
  [ -n "$udc" ] || udc=$(ls /sys/class/udc | head -n1)
  echo "$udc" > $gadget/UDC
fi

ifname=$(cat $f/ifname 2>/dev/null || echo usb0)
ip link set "$ifname" up
ip addr show dev "$ifname" | grep -q "${ADDR%/*}" || ip addr add $ADDR dev "$ifname"
# the Zero shares its internet when it can (kitlink.sh); a route that fails is no matter
ip route show default | grep -q . || ip route add default via 10.77.0.1 dev "$ifname" metric 900 2>/dev/null || true
echo "gadget: $net on $ifname, $ADDR (ADB kept)"
