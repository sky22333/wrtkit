package server

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"wrtkit/internal/runtime"
)

type fakeEngine struct {
	present    bool
	fail       bool
	removed    []string
	containers []string
}

func (*fakeEngine) Check(context.Context) error                          { return nil }
func (f *fakeEngine) ImagePresent(context.Context, string) (bool, error) { return f.present, nil }
func (f *fakeEngine) RemoveImage(_ context.Context, s string) error {
	if f.fail {
		return errors.New("image in use")
	}
	f.removed = append(f.removed, s)
	f.present = false
	return nil
}
func (f *fakeEngine) RemoveJobContainer(_ context.Context, s string) error {
	f.containers = append(f.containers, s)
	return nil
}
func (*fakeEngine) Run(context.Context, runtime.Spec, io.Writer, string) error { return nil }
func addFixtureJob(t *testing.T, a *App, id, ref string, owned bool) {
	t.Helper()
	_, err := a.db.Exec(`INSERT INTO jobs VALUES(?,?,?,?,?,?)`, id, "success", "完成", "", "2026-01-01", `{}`)
	if err != nil {
		t.Fatal(err)
	}
	if ref != "" {
		_, err = a.db.Exec(`INSERT OR IGNORE INTO managed_images(ref,owned) VALUES(?,?)`, ref, owned)
		if err != nil {
			t.Fatal(err)
		}
		_, err = a.db.Exec(`INSERT INTO job_images VALUES(?,?)`, id, ref)
		if err != nil {
			t.Fatal(err)
		}
	}
	dir := filepath.Join(a.dir, "builds", id, "output")
	if err = os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(dir, "firmware.bin"), []byte("data"), 0600); err != nil {
		t.Fatal(err)
	}
}
func TestCleanupKeepsSharedThenRemovesOwnedImage(t *testing.T) {
	a, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	f := &fakeEngine{present: true}
	a.engine = func() runtime.Engine { return f }
	ref := "immortalwrt/imagebuilder@sha256:" + strings.Repeat("a", 64)
	one := "111111111111111111111111"
	two := "222222222222222222222222"
	addFixtureJob(t, a, one, ref, true)
	addFixtureJob(t, a, two, ref, true)
	call := func(id string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("DELETE", "/api/jobs/"+id, bytes.NewBufferString(`{"remove_image":true}`))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		a.Router().ServeHTTP(w, r)
		return w
	}
	w := call(one)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"shared"`) || len(f.removed) != 0 {
		t.Fatal(w.Code, w.Body.String(), f)
	}
	j, err := a.job(one)
	if err != nil || j.Status != "cleaned" {
		t.Fatal(j, err)
	}
	if _, err = os.Stat(filepath.Join(a.dir, "builds", one, "output")); !os.IsNotExist(err) {
		t.Fatal("output retained", err)
	}
	w = call(two)
	if w.Code != 200 || len(f.removed) != 1 || f.removed[0] != ref || len(f.containers) != 2 {
		t.Fatal(w.Code, w.Body.String(), f)
	}
}
func TestCleanupRetainsArtifactsWhenImageRemovalFails(t *testing.T) {
	a, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	f := &fakeEngine{present: true, fail: true}
	a.engine = func() runtime.Engine { return f }
	id := "aaaaaaaaaaaaaaaaaaaaaaaa"
	ref := "registry.example/immortalwrt/imagebuilder@sha256:" + strings.Repeat("a", 64)
	addFixtureJob(t, a, id, ref, true)
	r := httptest.NewRequest("DELETE", "/api/jobs/"+id, strings.NewReader(`{"remove_image":true}`))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	a.Router().ServeHTTP(w, r)
	if w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
	if _, err = os.Stat(filepath.Join(a.dir, "builds", id, "output", "firmware.bin")); err != nil {
		t.Fatal("artifact lost", err)
	}
}
func TestRegistryPrefix(t *testing.T) {
	for _, tc := range []struct {
		in, want string
		valid    bool
	}{{"", "", true}, {"https://mirror.example.org/ns/", "mirror.example.org/ns", true}, {"registry.local:5000", "registry.local:5000", true}, {"http://mirror.example.org", "", false}, {"evil.example/a/../b", "", false}, {"mirror.example/@x", "", false}, {"mirror", "", false}} {
		got, err := normalizeRegistry(tc.in)
		if (err == nil) != tc.valid || got != tc.want {
			t.Errorf("%q => %q %v", tc.in, got, err)
		}
	}
	canonical := "immortalwrt/imagebuilder@sha256:" + strings.Repeat("a", 64)
	if got := imageReference("mirror.example.org", canonical); got != "mirror.example.org/"+canonical {
		t.Fatal(got)
	}
}

func TestArtifactSizesAreBytes(t *testing.T) {
	a, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	id := "aaaaaaaaaaaaaaaaaaaaaaaa"
	addFixtureJob(t, a, id, "", false)
	r := httptest.NewRequest("GET", "/api/jobs/"+id+"/files", nil)
	w := httptest.NewRecorder()
	a.Router().ServeHTTP(w, r)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"size":4`) {
		t.Fatalf("files: %d %s", w.Code, w.Body.String())
	}
}
