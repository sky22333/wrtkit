package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestEcosystemSettingsAreSeparate(t *testing.T) {
	a, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	router := testRouter(t, a)
	call := func(method, path, body string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	if w := call("PUT", "/api/settings", `{"mirrors":[{"name":"Imm","url":"https://imm.example"}]}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w := call("PUT", "/api/settings/ecosystem", `{"ecosystem":"openwrt"}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w := call("GET", "/api/settings", ""); !strings.Contains(w.Body.String(), "mirror.nju.edu.cn/openwrt") || strings.Contains(w.Body.String(), "imm.example") {
		t.Fatal(w.Body.String())
	}
	if w := call("PUT", "/api/settings", `{"mirrors":[{"name":"Open","url":"https://open.example"}]}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w := call("PUT", "/api/settings/ecosystem", `{"ecosystem":"immortalwrt"}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w := call("GET", "/api/settings", ""); !strings.Contains(w.Body.String(), "imm.example") || strings.Contains(w.Body.String(), "open.example") {
		t.Fatal(w.Body.String())
	}
	if w := call("PUT", "/api/settings/ecosystem", `{"ecosystem":"unknown"}`); w.Code != http.StatusBadRequest {
		t.Fatal(w.Code)
	}
}

func TestOpenWrtBuilderConfiguration(t *testing.T) {
	b := Build{Ecosystem: openwrt, Version: "25.12.6", Target: "x86/64", Mirror: "https://mirror.nju.edu.cn/openwrt"}
	if got := imageTag(b); got != "x86-64-25.12.6" {
		t.Fatal(got)
	}
	b.Version = "25.12-SNAPSHOT"
	if got := imageTag(b); got != "x86-64-25.12-SNAPSHOT" {
		t.Fatal(got)
	}
	script := builderScript(openwrt)
	for _, part := range []string{"cd /builder", "UPSTREAM_URL=\"$WRT_MIRROR\"", "bash ./setup.sh", "downloads.openwrt.org", "WRT_REVISION"} {
		if !strings.Contains(script, part) {
			t.Fatalf("missing %s", part)
		}
	}
	runtime := ecosystemMirrorScript(openwrt, b.Mirror)
	if strings.Contains(runtime, "imm_init") || !strings.Contains(runtime, "downloads.openwrt.org") || !strings.Contains(runtime, "/etc/apk/repositories.d/distfeeds.list") || !strings.Contains(runtime, "/etc/opkg/distfeeds.conf") {
		t.Fatal(runtime)
	}
}
