package server

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func shellPath(p string) string {
	p = filepath.ToSlash(p)
	if runtime.GOOS == "windows" && len(p) > 2 && p[1] == ':' {
		return "/" + strings.ToLower(p[:1]) + p[2:]
	}
	return p
}
func TestMirrorScriptAcrossPackageManagerLayouts(t *testing.T) {
	shell, err := exec.LookPath("sh")
	if err != nil && runtime.GOOS == "windows" {
		shell = `C:\Program Files\Git\bin\bash.exe`
		_, err = os.Stat(shell)
	}
	if err != nil {
		t.Skip("POSIX shell unavailable")
	}
	for _, tc := range []struct{ name, path, key string }{
		{"23.05", "opkg/distfeeds.conf", "opkg_mirror"},
		{"24.10", "opkg/distfeeds.conf", "opkg_mirror"},
		{"25.12", "apk/repositories.d/distfeeds.list", "apk_mirror"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			file := filepath.Join(dir, filepath.FromSlash(tc.path))
			if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
				t.Fatal(err)
			}
			original := "https://downloads.immortalwrt.org/releases/" + tc.name + "/packages/x\nhttps://mirrors.vsean.net/openwrt/releases/" + tc.name + "/packages/y\nhttps://third-party.example/custom\n"
			if err := os.WriteFile(file, []byte(original), 0600); err != nil {
				t.Fatal(err)
			}
			log := filepath.Join(dir, "uci.log")
			script := mirrorScript("https://mirror.example.org/immortalwrt")
			script = strings.ReplaceAll(script, "/etc/opkg/distfeeds.conf", shellPath(filepath.Join(dir, "opkg/distfeeds.conf")))
			script = strings.ReplaceAll(script, "/etc/apk/repositories.d/distfeeds.list", shellPath(filepath.Join(dir, "apk/repositories.d/distfeeds.list")))
			stub := "uci() { printf '%s\\n' \"$*\" >> " + shellQuote(shellPath(log)) + "; case \"$*\" in *'get system.@imm_init[0]'*) return 1;; *) return 0;; esac; }\n"
			script = strings.Replace(script, "#!/bin/sh\n", "#!/bin/sh\n"+stub, 1)
			cmd := exec.Command(shell)
			cmd.Stdin = strings.NewReader(script)
			if out, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("script failed: %v %s", err, out)
			}
			got, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			text := string(got)
			if strings.Contains(text, "downloads.immortalwrt.org") || strings.Contains(text, "mirrors.vsean.net") || strings.Count(text, "https://mirror.example.org/immortalwrt/releases/") != 2 || !strings.Contains(text, "https://third-party.example/custom") {
				t.Fatalf("wrong feeds: %s", text)
			}
			commands, err := os.ReadFile(log)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(string(commands), "."+tc.key+"=https://mirror.example.org/immortalwrt") {
				t.Fatalf("wrong uci changes %s", commands)
			}
		})
	}
}

func TestFirmwareFilesIncludeSelectedMirror(t *testing.T) {
	b := Build{Version: "25.12.2", Mirror: "https://mirrors.zju.edu.cn/immortalwrt", Script: "#!/bin/sh\r\nexit 0\r\n"}
	files, err := firmwareFiles(b)
	if err != nil {
		t.Fatal(err)
	}
	script := string(files["wrtkit/files/etc/uci-defaults/09-wrtkit-mirror"])
	if !strings.Contains(script, "mirror='https://mirrors.zju.edu.cn/immortalwrt'") {
		t.Fatal("selected mirror missing from firmware defaults")
	}
	if got := string(files["wrtkit/files/etc/uci-defaults/99-custom.sh"]); got != "#!/bin/sh\nexit 0\n" {
		t.Fatal("custom script changed", got)
	}
}

func TestRequestedDefaultMirrorSources(t *testing.T) {
	want := map[string]bool{
		"https://mirrors.ustc.edu.cn/immortalwrt":   false,
		"https://mirrors.cernet.edu.cn/immortalwrt": false,
		"https://mirrors.vsean.net/openwrt":         false,
	}
	for _, preset := range defaultMirrors() {
		if _, ok := want[preset.URL]; ok {
			want[preset.URL] = true
			files, err := firmwareFiles(Build{Version: "25.12.2", Mirror: preset.URL})
			if err != nil || !strings.Contains(string(files["wrtkit/files/etc/uci-defaults/09-wrtkit-mirror"]), "mirror='"+preset.URL+"'") {
				t.Fatalf("selected mirror %s not embedded: %v", preset.URL, err)
			}
		}
	}
	for source, found := range want {
		if !found {
			t.Errorf("missing preset %s", source)
		}
	}
}
