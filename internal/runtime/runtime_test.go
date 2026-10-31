package runtime

import (
	"archive/tar"
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDockerPullStreamError(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/version" {
			_, _ = w.Write([]byte(`{"ApiVersion":"1.52"}`))
			return
		}
		_, _ = w.Write([]byte(`{"error":"manifest unknown"}`))
	}))
	defer s.Close()
	d := &Docker{http: s.Client(), api: "v1.41"}
	d.http.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		req.URL.Host = strings.TrimPrefix(s.URL, "http://")
		return http.DefaultTransport.RoundTrip(req)
	})
	err := d.Run(context.Background(), Spec{Image: "example:bad"}, &bytes.Buffer{}, t.TempDir())
	if err == nil || !strings.Contains(err.Error(), "manifest unknown") {
		t.Fatal(err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestExtract(t *testing.T) {
	var b bytes.Buffer
	w := tar.NewWriter(&b)
	data := []byte("firmware")
	w.WriteHeader(&tar.Header{Name: "output/image.bin", Mode: 0600, Size: int64(len(data))})
	w.Write(data)
	w.Close()
	if err := extract(&b, t.TempDir()); err != nil {
		t.Fatal(err)
	}
}

func TestDockerBuildFlow(t *testing.T) {
	var uploaded, cleaned bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.URL.Path {
		case "GET /version":
			_, _ = w.Write([]byte(`{"ApiVersion":"1.41"}`))
		case "POST /v1.41/images/create":
			_, _ = w.Write([]byte("{\"status\":\"pulled\"}\n"))
		case "POST /v1.41/containers/create":
			_, _ = w.Write([]byte(`{"Id":"container1"}`))
		case "PUT /v1.41/containers/container1/archive":
			tr := tar.NewReader(r.Body)
			h, e := tr.Next()
			if e != nil || h.Name != "wrtkit/run.sh" {
				t.Errorf("bad archive: %v %v", h, e)
			} else {
				uploaded = true
			}
		case "POST /v1.41/containers/container1/start":
			w.WriteHeader(http.StatusNoContent)
		case "GET /v1.41/containers/container1/logs":
			_, _ = w.Write([]byte{1, 0, 0, 0, 0, 0, 0, 3, 'o', 'k', '\n'})
		case "POST /v1.41/containers/container1/wait":
			_, _ = w.Write([]byte(`{"StatusCode":0}`))
		case "GET /v1.41/containers/container1/archive":
			tw := tar.NewWriter(w)
			data := []byte("firmware")
			_ = tw.WriteHeader(&tar.Header{Name: "output/image.bin", Mode: 0644, Size: int64(len(data))})
			_, _ = tw.Write(data)
			_ = tw.Close()
		case "DELETE /v1.41/containers/container1":
			cleaned = true
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Errorf("unexpected request: %s %s", r.Method, r.URL)
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	d := &Docker{http: server.Client(), api: "v1.41"}
	d.http.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		req.URL.Host = strings.TrimPrefix(server.URL, "http://")
		return http.DefaultTransport.RoundTrip(req)
	})
	out := t.TempDir()
	var logs bytes.Buffer
	err := d.Run(context.Background(), Spec{Image: "test:image", Files: map[string][]byte{"wrtkit/run.sh": []byte("echo ok")}}, &logs, out)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(out, "image.bin"))
	if err != nil || string(data) != "firmware" {
		t.Fatalf("artifact %q: %v", data, err)
	}
	if !uploaded || !cleaned || !strings.Contains(logs.String(), "ok") {
		t.Fatalf("uploaded=%v cleaned=%v log=%q", uploaded, cleaned, logs.String())
	}
}

func TestDockerCleanupScopesResources(t *testing.T) {
	id := "abcdef0123456789abcdef01"
	digest := "sha256:" + strings.Repeat("a", 64)
	var deleted []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/version":
			_, _ = w.Write([]byte(`{"ApiVersion":"1.52"}`))
		case r.URL.Path == "/v1.52/images/json":
			_, _ = w.Write([]byte(`[{"RepoDigests":["other.example/repo@` + digest + `"]}]`))
		case r.URL.Path == "/v1.52/containers/json":
			_, _ = w.Write([]byte(`[{"Id":"owned","Names":["/wrtkit-` + id + `"],"Labels":{"io.wrtkit.job":"` + id + `"}},{"Id":"foreign","Names":["/other"],"Labels":{"io.wrtkit.job":"` + id + `"}}]`))
		case r.Method == "DELETE":
			deleted = append(deleted, r.URL.Path)
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Errorf("unexpected %s %s", r.Method, r.URL)
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	d := &Docker{http: server.Client()}
	d.http.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		req.URL.Host = strings.TrimPrefix(server.URL, "http://")
		return http.DefaultTransport.RoundTrip(req)
	})
	err := d.RemoveJobContainer(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	if len(deleted) != 1 || deleted[0] != "/v1.52/containers/owned" {
		t.Fatal(deleted)
	}
}
func TestRemoveImageMissingIsSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/version" {
			_, _ = w.Write([]byte(`{"ApiVersion":"1.52"}`))
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()
	d := &Docker{http: server.Client()}
	d.http.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		req.URL.Host = strings.TrimPrefix(server.URL, "http://")
		return http.DefaultTransport.RoundTrip(req)
	})
	if err := d.RemoveImage(context.Background(), "example/image@sha256:"+strings.Repeat("a", 64)); err != nil {
		t.Fatal(err)
	}
}
