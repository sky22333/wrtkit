package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProxySettingsAndHTTPRequests(t *testing.T) {
	app, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()
	hits := 0
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"ok":true}`)
	}))
	defer proxy.Close()
	put := func(value string, status int) {
		t.Helper()
		data, _ := json.Marshal(map[string]string{"proxy": value})
		req := httptest.NewRequest("PUT", "/api/settings/proxy", bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		out := httptest.NewRecorder()
		app.Router().ServeHTTP(out, req)
		if out.Code != status {
			t.Fatalf("proxy %q: %d %s", value, out.Code, out.Body.String())
		}
	}
	put(proxy.URL, 200)
	var result map[string]bool
	if err := app.fetch(t.Context(), "http://proxy-test.invalid/data", &result); err != nil || !result["ok"] || hits != 1 {
		t.Fatalf("HTTP proxy not used: %v %#v hits=%d", err, result, hits)
	}
	put("socks5://127.0.0.1:1080", 200)
	put("http://user:pass@localhost:1080", 400)
	put("socks5://localhost:99999", 400)
	put("", 200)
	if app.proxyURL != nil {
		t.Fatal("proxy should be disabled")
	}
}

func TestSOCKS5Proxy(t *testing.T) {
	app, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	done := make(chan error, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			done <- err
			return
		}
		defer conn.Close()
		header := make([]byte, 2)
		if _, err = io.ReadFull(conn, header); err != nil {
			done <- err
			return
		}
		methods := make([]byte, int(header[1]))
		if _, err = io.ReadFull(conn, methods); err != nil {
			done <- err
			return
		}
		if _, err = conn.Write([]byte{5, 0}); err != nil {
			done <- err
			return
		}
		req := make([]byte, 4)
		if _, err = io.ReadFull(conn, req); err != nil {
			done <- err
			return
		}
		var length int
		switch req[3] {
		case 1:
			length = 4
		case 4:
			length = 16
		case 3:
			b := []byte{0}
			if _, err = io.ReadFull(conn, b); err != nil {
				done <- err
				return
			}
			length = int(b[0])
		default:
			done <- fmt.Errorf("invalid address type")
			return
		}
		if _, err = io.CopyN(io.Discard, conn, int64(length+2)); err != nil {
			done <- err
			return
		}
		if _, err = conn.Write([]byte{5, 0, 0, 1, 127, 0, 0, 1, 0, 80}); err != nil {
			done <- err
			return
		}
		buf := make([]byte, 4096)
		if _, err = conn.Read(buf); err != nil {
			done <- err
			return
		}
		_, err = io.WriteString(conn, "HTTP/1.1 200 OK\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}")
		done <- err
	}()
	u, err := parseProxy("socks5://" + listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	app.proxyURL = u
	var result map[string]bool
	if err = app.fetch(t.Context(), "http://example.invalid/test", &result); err != nil || !result["ok"] {
		t.Fatalf("SOCKS5: %v", err)
	}
	if err = <-done; err != nil && !strings.Contains(err.Error(), "closed") {
		t.Fatal(err)
	}
}
