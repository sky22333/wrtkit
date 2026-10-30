package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestValidation(t *testing.T) {
	for _, tc := range []struct {
		v  string
		ok bool
	}{{"23.05.0", true}, {"24.11.1", true}, {"25.12-SNAPSHOT", true}, {"23.04.9", false}, {"25.13.0", false}, {"23.05.0/../../x", false}} {
		if validVersion.MatchString(tc.v) != tc.ok {
			t.Errorf("version %q", tc.v)
		}
	}
	b := Build{Version: "25.12.2", Target: "x86/64", Profile: "generic", Mirror: "https://mirror.example.org/immortalwrt", Address: "192.168.1.1/24", Packages: []string{"luci"}}
	if e := validate(b); e != nil {
		t.Fatal(e)
	}
	b.Packages = []string{"luci;reboot"}
	if validate(b) == nil {
		t.Fatal("accepted shell metacharacters")
	}
	for _, m := range []string{"http://mirror.example.org", "https://mirror.example.org/../../x", "https://user:pass@mirror.example.org"} {
		if validMirror(m) {
			t.Errorf("accepted %s", m)
		}
	}
}
func TestAPIWithMirror(t *testing.T) {
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/.versions.json":
			w.Write([]byte(`{"stable_version":"25.12.2","versions_list":["25.12.2","23.05.0","22.03.7"]}`))
		case "/releases/25.12.2/.overview.json":
			w.Write([]byte(`{"profiles":[{"id":"generic","target":"x86/64","titles":[{"vendor":"Acme","model":"Router"}]}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()
	a, e := New(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	defer a.Close()
	a.client = upstream.Client()
	router := a.Router()
	req := httptest.NewRequest("GET", "/api/versions?mirror="+upstream.URL, nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatal(rec.Code, rec.Body.String())
	}
	var payload struct {
		Versions []string `json:"versions"`
	}
	if e = json.Unmarshal(rec.Body.Bytes(), &payload); e != nil {
		t.Fatal(e)
	}
	if strings.Contains(strings.Join(payload.Versions, ","), "22.03") || !strings.Contains(strings.Join(payload.Versions, ","), "25.12.2") {
		t.Fatal(payload)
	}
	req = httptest.NewRequest("GET", "/api/devices?version=25.12.2&mirror="+upstream.URL+"&q=acme", nil)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "generic") {
		t.Fatal(rec.Code, rec.Body.String())
	}
	req = httptest.NewRequest("PUT", "/api/settings", strings.NewReader(`{"mirrors":[{"name":"测试源","url":"https://mirror.example.org"}]}`))
	req.Header.Set("Origin", "https://evil.example")
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != 403 {
		t.Fatal("cross-origin request allowed", rec.Code)
	}
}

func TestPackageIndexes(t *testing.T) {
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/profiles.json"):
			_, _ = w.Write([]byte(`{"arch_packages":"x86_64","profiles":{"generic":{}}}`))
		case strings.HasSuffix(r.URL.Path, "/luci/index.json"):
			_, _ = w.Write([]byte(`{"architecture":"x86_64","packages":{"luci-app-ddns":"1.0"}}`))
		case strings.HasSuffix(r.URL.Path, "/base/index.json"):
			_, _ = w.Write([]byte(`{"architecture":"x86_64","packages":{"busybox":"1.2"}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()
	a, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	a.client = upstream.Client()
	req := httptest.NewRequest("GET", "/api/packages?version=25.12.2&target=x86%2F64&profile=generic&mirror="+upstream.URL, nil)
	rec := httptest.NewRecorder()
	a.Router().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatal(rec.Code, rec.Body.String())
	}
	var result struct {
		Items    []packageItem `json:"items"`
		Warnings []string      `json:"warnings"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Items) != 2 || result.Items[0].Name != "busybox" || len(result.Warnings) != 5 {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestPreflightPinsImage(t *testing.T) {
	const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/profiles.json"):
			_, _ = w.Write([]byte(`{"version_code":"r38135-test","profiles":{"generic":{}}}`))
		case strings.HasSuffix(r.URL.Path, "/tags/x86-64-openwrt-25.12.2"):
			_, _ = w.Write([]byte(`{"digest":"` + digest + `"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()
	a, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	a.client = upstream.Client()
	a.hubBase = upstream.URL
	b := Build{Mirror: upstream.URL, Version: "25.12.2", Target: "x86/64", Profile: "generic"}
	image, revision, err := a.preflight(context.Background(), b)
	if err != nil || image != "immortalwrt/imagebuilder@"+digest || revision != "r38135-test" {
		t.Fatalf("image=%s error=%v", image, err)
	}
	b.Profile = "missing"
	if _, _, err = a.preflight(context.Background(), b); err == nil {
		t.Fatal("unknown profile accepted")
	}
}
func TestDevicesPagination(t *testing.T) {
	profiles := make([]map[string]any, 205)
	for i := range profiles {
		profiles[i] = map[string]any{"id": fmt.Sprintf("device-%03d", i), "target": "x86/64"}
	}
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"profiles": profiles})
	}))
	defer upstream.Close()
	a, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	a.client = upstream.Client()
	req := httptest.NewRequest("GET", "/api/devices?version=25.12.2&page=3&mirror="+upstream.URL, nil)
	rec := httptest.NewRecorder()
	a.Router().ServeHTTP(rec, req)
	var result struct {
		Total int `json:"total"`
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	if err = json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 200 || result.Total != 205 || len(result.Items) != 5 || result.Items[0].ID != "device-200" {
		t.Fatalf("status=%d result=%+v", rec.Code, result)
	}
}

func TestRecognizeFirmware(t *testing.T) {
	for _, tc := range []struct {
		name string
		want bool
	}{{"openwrt-sysupgrade.bin", true}, {"disk.img.gz", true}, {"factory.itb", true}, {"sha256sums", false}, {"profiles.json", false}, {"firmware.manifest", false}} {
		if got := isFirmware(tc.name); got != tc.want {
			t.Errorf("isFirmware(%q)=%v", tc.name, got)
		}
	}
}

func TestQuickSecretsNotPersisted(t *testing.T) {
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) }))
	defer upstream.Close()
	a, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	a.client = upstream.Client()
	body := `{"ecosystem":"immortalwrt","version":"25.12.2","target":"x86/64","profile":"generic","mirror":"` + upstream.URL + `","wifi_ssid":"wifi","wifi_password":"wireless-secret","root_password":"root-secret","ppp_username":"private-user","ppp_password":"ppp-secret"}`
	req := httptest.NewRequest("POST", "/api/jobs", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	a.Router().ServeHTTP(rec, req)
	if rec.Code != 201 {
		t.Fatal(rec.Code, rec.Body.String())
	}
	var row string
	if err = a.db.QueryRow(`SELECT request FROM jobs LIMIT 1`).Scan(&row); err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"wireless-secret", "root-secret", "ppp-secret", "private-user"} {
		if strings.Contains(row, secret) {
			t.Fatalf("persisted %s", secret)
		}
	}
}

func TestUpstreamFeedDiscoveryAndProxyClassification(t *testing.T) {
	got := parseFeeds("# comment\nsrc-git-full base https://github.com/example/base.git^abc\nsrc-git luci https://github.com/example/luci.git\nsrc-git proxy-extra https://github.com/example/proxy.git\nsrc-git luci https://example.invalid\nsrc-git ../bad https://example.invalid\n")
	if strings.Join(got, ",") != "base,luci,proxy-extra" {
		t.Fatal(got)
	}
	for _, name := range []string{"luci-app-openclash", "luci-app-passwall", "sing-box", "luci-app-homeproxy", "luci-i18n-ssr-plus-zh-cn", "mihomo", "luci-app-daed"} {
		if categoryFor(name) != "proxy" {
			t.Error(name)
		}
	}
	if categoryFor("busybox") != "" {
		t.Fatal("busybox misclassified")
	}
}
func TestDefaultMirrorSources(t *testing.T) {
	if !validMirror("https://downloads.immortalwrt.org") {
		t.Fatal("official source must be selectable")
	}
	if validMirror("https://sysupgrade.immortalwrt.org") {
		t.Fatal("unexpected official service accepted")
	}
	mirrors := defaultMirrors()
	if len(mirrors) < 5 || mirrors[0].URL == "https://downloads.immortalwrt.org" {
		t.Fatal(mirrors)
	}
}

func TestMirrorRequestsIdentifyWrtKit(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.UserAgent() != "WrtKit/1.0" {
			http.Error(w, "unexpected client", http.StatusForbidden)
			return
		}
		fmt.Fprint(w, `{"ok":true}`)
	}))
	defer upstream.Close()
	a, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	var response struct {
		OK bool `json:"ok"`
	}
	if err := a.fetch(context.Background(), upstream.URL, &response); err != nil || !response.OK {
		t.Fatalf("request failed: %v, result: %+v", err, response)
	}
}

func TestMirrorSourceSettings(t *testing.T) {
	a, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	router := a.Router()
	call := func(method, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/settings", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	defaultResponse := call("GET", "")
	if defaultResponse.Code != 200 || !strings.Contains(defaultResponse.Body.String(), `"name":"南京大学"`) {
		t.Fatal(defaultResponse.Body.String())
	}
	valid := `{"mirrors":[{"name":" 自定义 ","url":"https://mirror.example.org/immortalwrt/"},{"name":"备用","url":"https://other.example.org"}]}`
	if w := call("PUT", valid); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call("GET", ""); w.Code != 200 || !strings.Contains(w.Body.String(), `"name":"自定义","url":"https://mirror.example.org/immortalwrt"`) || !strings.Contains(w.Body.String(), `"name":"备用"`) {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, invalid := range []string{
		`{"mirrors":[]}`,
		`{"mirrors":[{"name":" ","url":"https://example.com"}]}`,
		`{"mirrors":[{"name":"a","url":"http://example.com"}]}`,
		`{"mirrors":[{"name":"a","url":"https://example.com/"},{"name":"b","url":"https://example.com"}]}`,
		`{"mirrors":["https://example.com"]}`,
	} {
		if w := call("PUT", invalid); w.Code != 400 {
			t.Fatalf("accepted %s: %d %s", invalid, w.Code, w.Body.String())
		}
	}
	if w := call("GET", ""); !strings.Contains(w.Body.String(), `"name":"自定义"`) {
		t.Fatal("invalid request changed saved settings", w.Body.String())
	}
}

func TestOfficialMirrorIsExplicit(t *testing.T) {
	a, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	fromMirror := httptest.NewRequest("GET", "https://mirror.example.org/a", nil)
	toOfficial := httptest.NewRequest("GET", "https://downloads.immortalwrt.org/a", nil)
	if a.client.CheckRedirect(toOfficial, []*http.Request{fromMirror}) == nil {
		t.Fatal("third-party source redirected to official without selection")
	}
	fromOfficial := httptest.NewRequest("GET", "https://downloads.immortalwrt.org/a", nil)
	if err := a.client.CheckRedirect(toOfficial, []*http.Request{fromOfficial}); err != nil {
		t.Fatal(err)
	}
}

func TestRejectPackageSelectionRemovalConflict(t *testing.T) {
	b := Build{Version: "25.12.2", Target: "x86/64", Profile: "generic", Mirror: "https://mirror.example.org/immortalwrt", Packages: []string{"luci-i18n-ddns-zh-cn"}, Remove: []string{"luci-i18n-ddns-zh-cn"}}
	if err := validate(b); err == nil {
		t.Fatal("accepted contradictory package selection")
	}
}
