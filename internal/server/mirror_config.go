package server

func ecosystemMirrorScript(ecosystem, mirror string) string {
	if ecosystem != openwrt {
		return mirrorScript(mirror)
	}
	return `#!/bin/sh
set -eu
mirror=` + shellQuote(mirror) + `
for file in /etc/opkg/distfeeds.conf /etc/apk/repositories.d/distfeeds.list; do
 if [ -f "$file" ]; then sed -i "s|https\?://downloads.openwrt.org|$mirror|g" "$file"; fi
done
exit 0
`
}

// mirrorScript configures both the live package-manager repository file and
// ImmortalWrt's persistent initialization setting before upstream defaults run.
// Detecting the files rather than relying on release numbers supports opkg and apk.
func mirrorScript(mirror string) string {
	return `#!/bin/sh
set -eu
mirror=` + shellQuote(mirror) + `
uci -q get 'system.@imm_init[0]' >/dev/null || uci -q add system imm_init >/dev/null
if [ -f /etc/opkg/distfeeds.conf ]; then
 uci -q set "system.@imm_init[0].opkg_mirror=$mirror"
 sed -i -e "s|https://downloads.immortalwrt.org|$mirror|g" -e "s|https://mirrors.vsean.net/openwrt|$mirror|g" -e "s|https://immortalwrt.kyarucloud.moe|$mirror|g" /etc/opkg/distfeeds.conf
fi
if [ -f /etc/apk/repositories.d/distfeeds.list ]; then
 # Prevent an old opkg setting from being renamed over the selected apk mirror
 # by ImmortalWrt's 99-default-settings-chinese during a preserved-config upgrade.
 if [ ! -f /etc/opkg/distfeeds.conf ]; then uci -q delete "system.@imm_init[0].opkg_mirror" || true; fi
 uci -q set "system.@imm_init[0].apk_mirror=$mirror"
 sed -i -e "s|https://downloads.immortalwrt.org|$mirror|g" -e "s|https://mirrors.vsean.net/openwrt|$mirror|g" -e "s|https://immortalwrt.kyarucloud.moe|$mirror|g" /etc/apk/repositories.d/distfeeds.list
fi
uci -q commit system
exit 0
`
}
