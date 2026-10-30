package server

import (
	"encoding/json"
	"fmt"
	"net"
	"strconv"
	"strings"
	"unicode/utf8"

	cryptsha512 "github.com/sergeymakinen/go-crypt/sha512"
)

func shellQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'" }
func diskImage(raw json.RawMessage) bool {
	var p struct {
		Images []struct {
			Name string `json:"name"`
			Type string `json:"type"`
		} `json:"images"`
	}
	if json.Unmarshal(raw, &p) != nil {
		return false
	}
	for _, i := range p.Images {
		n := strings.ToLower(i.Name)
		if (strings.HasSuffix(n, ".img") || strings.HasSuffix(n, ".img.gz") || strings.HasSuffix(n, ".img.zst")) && (strings.Contains(i.Type, "combined") || i.Type == "sysupgrade") {
			return true
		}
	}
	return false
}
func validateQuick(b Build) error {
	for _, s := range []string{b.WifiSSID, b.WifiPassword, b.RootPassword, b.PPPUsername, b.PPPPassword} {
		if !utf8.ValidString(s) || strings.ContainsAny(s, "\x00\r\n") {
			return fmt.Errorf("配置内容不能包含换行或空字符")
		}
	}
	if len(b.WifiSSID) > 32 {
		return fmt.Errorf("Wi-Fi 名称不能超过 32 字节")
	}
	if (b.WifiSSID == "") != (b.WifiPassword == "") {
		return fmt.Errorf("请同时填写 Wi-Fi 名称和密码")
	}
	if b.WifiPassword != "" && (len(b.WifiPassword) < 8 || len(b.WifiPassword) > 63) {
		return fmt.Errorf("Wi-Fi 密码必须为 8 到 63 字节")
	}
	if (b.PPPUsername == "") != (b.PPPPassword == "") {
		return fmt.Errorf("请同时填写 PPPoE 账号和密码")
	}
	if len(b.RootPassword) > 128 || len(b.PPPUsername) > 256 || len(b.PPPPassword) > 256 {
		return fmt.Errorf("密码或账号过长")
	}
	if b.RootFSSize != 0 && (b.RootFSSize < 64 || b.RootFSSize > 32768) {
		return fmt.Errorf("根分区大小需在 64 到 32768 MiB 之间")
	}
	for _, removed := range b.Remove {
		if removed == b.Theme && b.Theme != "" {
			return fmt.Errorf("不能同时选择和移除同一个主题")
		}
		if removed == "ppp-mod-pppoe" && b.PPPUsername != "" {
			return fmt.Errorf("PPPoE 配置需要 ppp-mod-pppoe 软件包")
		}
	}
	if b.Theme != "" && (!strings.HasPrefix(b.Theme, "luci-theme-") || !validPart.MatchString(b.Theme) || len(b.Theme) > 128) {
		return fmt.Errorf("不支持的主题")
	}
	return nil
}
func quickScript(b Build) (string, error) {
	var s strings.Builder
	s.WriteString("#!/bin/sh\nset -e\n")
	if b.Hostname != "" {
		s.WriteString("uci set system.@system[0].hostname=" + shellQuote(b.Hostname) + "\n")
	}
	if b.Address != "" {
		ip, n, _ := net.ParseCIDR(b.Address)
		major, _ := strconv.Atoi(b.Version[:2])
		month, _ := strconv.Atoi(b.Version[3:5])
		if major > 25 || (major == 25 && month >= 12) {
			s.WriteString("uci set network.lan.ipaddr=" + shellQuote(b.Address) + "\nuci -q delete network.lan.netmask || true\n")
		} else {
			s.WriteString("uci set network.lan.ipaddr=" + shellQuote(ip.String()) + "\nuci set network.lan.netmask=" + shellQuote(net.IP(n.Mask).String()) + "\n")
		}
	}
	if b.Timezone != "" {
		s.WriteString("uci set system.@system[0].zonename=" + shellQuote(b.Timezone) + "\nuci set system.@system[0].timezone=" + shellQuote(zones[b.Timezone]) + "\n")
	}
	if b.RootPassword != "" {
		hash, e := cryptsha512.NewHash(b.RootPassword, 100000)
		if e != nil {
			return "", e
		}
		s.WriteString("sed -i " + shellQuote("s|^root:[^:]*:|root:"+hash+":|") + " /etc/shadow\n")
	}
	if b.PPPUsername != "" {
		s.WriteString("if [ \"$(uci -q get network.wan)\" = interface ]; then\n uci set network.wan.proto='pppoe'\n uci set network.wan.username=" + shellQuote(b.PPPUsername) + "\n uci set network.wan.password=" + shellQuote(b.PPPPassword) + "\nelse echo '未检测到 WAN 接口，跳过 PPPoE' >&2; fi\n")
	}
	if b.WifiSSID != "" {
		s.WriteString("if [ -f /etc/config/wireless ]; then\n . /lib/functions.sh\n configure_ap() { local section=\"$1\" mode device network; config_get mode \"$section\" mode; [ \"$mode\" = ap ] || return 0; config_get network \"$section\" network; case \" $network \" in *\" lan \"*) ;; *) return 0 ;; esac; config_get device \"$section\" device; [ -n \"$device\" ] || return 0; uci set \"wireless.$device.disabled=0\"; uci set \"wireless.$section.disabled=0\"; uci set \"wireless.$section.encryption=psk2\"; uci set \"wireless.$section.ssid=\"" + shellQuote(b.WifiSSID) + "; uci set \"wireless.$section.key=\"" + shellQuote(b.WifiPassword) + "; }\n config_load wireless\n config_foreach configure_ap wifi-iface\nelse echo '未检测到无线配置，跳过 Wi-Fi' >&2; fi\n")
	}
	s.WriteString("uci commit\nexit 0\n")
	return s.String(), nil
}

// Themes register themselves in their uci-defaults scripts; apply the choice afterwards.
func themeScript(theme string) string {
	name := strings.TrimPrefix(theme, "luci-theme-")
	return "#!/bin/sh\nset -e\ndir=" + shellQuote("/luci-static/"+name) + "\nif [ -d \"/www$dir\" ] && uci -q get luci.main >/dev/null; then\n uci set \"luci.main.mediaurlbase=$dir\"\n uci commit luci\nelse echo '未找到主题目录，保留当前主题' >&2; fi\nexit 0\n"
}
