package server

import (
	"encoding/json"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"testing"

	cryptsha512 "github.com/sergeymakinen/go-crypt/sha512"
)

func TestQuickScriptVersionsAndSecrets(t *testing.T) {
	b := Build{Version: "25.12.2", Address: "192.168.2.1/24", RootPassword: "S3cret!", WifiSSID: "name'$(touch /tmp/unwanted)", WifiPassword: "password123", PPPUsername: "account'quoted", PPPPassword: "p@ssword"}
	if err := validateQuick(b); err != nil {
		t.Fatal(err)
	}
	s, err := quickScript(b)
	if err != nil {
		t.Fatal(err)
	}
	for _, x := range []string{"network.lan.ipaddr='192.168.2.1/24'", "uci -q delete network.lan.netmask", "name'\\''$(touch /tmp/unwanted)", "account'\\''quoted", "config_foreach configure_ap wifi-iface"} {
		if !strings.Contains(s, x) {
			t.Errorf("missing %q", x)
		}
	}
	if strings.Contains(s, b.RootPassword) {
		t.Fatal("plaintext root password in script")
	}
	hash := regexp.MustCompile(`\$6\$rounds=100000\$[A-Za-z0-9./]+\$[A-Za-z0-9./]+`).FindString(s)
	if hash == "" || cryptsha512.Check(hash, b.RootPassword) != nil {
		t.Fatal("invalid password hash", hash)
	}
	b.Version = "24.10.5"
	s, err = quickScript(b)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(s, "network.lan.netmask='255.255.255.0'") || strings.Contains(s, "network.lan.ipaddr='192.168.2.1/24'") {
		t.Fatal(s)
	}
}
func TestQuickValidation(t *testing.T) {
	for _, b := range []Build{{WifiSSID: "test"}, {WifiSSID: "x", WifiPassword: "short"}, {PPPUsername: "x"}, {RootFSSize: 32}, {RootFSSize: 40000}, {Theme: "bad"}, {Theme: "luci-theme-argon", Remove: []string{"luci-theme-argon"}}, {PPPUsername: "u", PPPPassword: "p", Remove: []string{"ppp-mod-pppoe"}}} {
		if validateQuick(b) == nil {
			t.Errorf("accepted %+v", b)
		}
	}
}
func TestDiskImage(t *testing.T) {
	for _, tc := range []struct {
		body string
		want bool
	}{{`{"images":[{"name":"foo-sysupgrade.img.gz","type":"sysupgrade"}]}`, true}, {`{"images":[{"name":"foo-combined.img.gz","type":"combined"}]}`, true}, {`{"images":[{"name":"foo-sysupgrade.bin","type":"sysupgrade"}]}`, false}, {`{"images":[{"name":"foo-rootfs.img.gz","type":"rootfs"}]}`, false}} {
		if diskImage(json.RawMessage(tc.body)) != tc.want {
			t.Error(tc.body)
		}
	}
}

func TestQuickScriptShellSyntax(t *testing.T) {
	shell, err := exec.LookPath("sh")
	if err != nil && runtime.GOOS == "windows" {
		shell = `C:\Program Files\Git\bin\bash.exe`
		if _, err = os.Stat(shell); err != nil {
			t.Skip("no POSIX shell")
		}
	} else if err != nil {
		t.Skip("no POSIX shell")
	}
	script, err := quickScript(Build{Version: "25.12.2", WifiSSID: "name'!", WifiPassword: "pass12345", PPPUsername: "user", PPPPassword: "test", RootPassword: "root-secret"})
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(shell, "-n")
	cmd.Stdin = strings.NewReader(script)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("shell syntax: %v %s", err, out)
	}
}

func TestThemeScriptUsesExistingAssets(t *testing.T) {
	for _, name := range []string{"luci-theme-argon", "luci-theme-material"} {
		if err := validateQuick(Build{Theme: name}); err != nil {
			t.Fatal(err)
		}
		script := themeScript(name)
		if !strings.Contains(script, "/luci-static/"+strings.TrimPrefix(name, "luci-theme-")) || !strings.Contains(script, "[ -d ") {
			t.Fatal(script)
		}
	}
	if validateQuick(Build{Theme: "luci-theme-foo;reboot"}) == nil {
		t.Fatal("invalid theme accepted")
	}
}
