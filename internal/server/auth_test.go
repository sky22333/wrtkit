package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type authenticatedHandler struct {
	handler http.Handler
	cookie  *http.Cookie
}

func (h authenticatedHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	r.AddCookie(h.cookie)
	h.handler.ServeHTTP(w, r)
}
func testRouter(t *testing.T, a *App) http.Handler {
	t.Helper()
	h := a.Router()
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBufferString(`{"username":"testadmin","password":"test-password-123"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("login: %d %s", w.Code, w.Body.String())
	}
	cookies := w.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("missing session cookie")
	}
	return authenticatedHandler{h, cookies[0]}
}
func TestAuthenticationLifecycle(t *testing.T) {
	a, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	h := a.Router()
	request := func(method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, bytes.NewBufferString(body))
		r.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	if w := request("GET", "/api/jobs", "", nil); w.Code != 401 {
		t.Fatal(w.Code)
	}
	if w := request("GET", "/api/auth/status", "", nil); w.Code != 200 || !bytes.Contains(w.Body.Bytes(), []byte(`"initialized":false`)) {
		t.Fatal(w.Code, w.Body.String())
	}
	w := request("POST", "/api/auth/login", `{"username":"admin","password":"long-password-1"}`, nil)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly {
		t.Fatal(cookies)
	}
	cookie := cookies[0]
	if w = request("GET", "/api/jobs", "", cookie); w.Code != 200 {
		t.Fatal(w.Code)
	}
	if w = request("POST", "/api/auth/login", `{"username":"other","password":"long-password-2"}`, nil); w.Code != 401 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = request("POST", "/api/auth/logout", "{}", cookie); w.Code != 200 {
		t.Fatal(w.Code)
	}
	if w = request("GET", "/api/jobs", "", cookie); w.Code != 401 {
		t.Fatal(w.Code)
	}
}

func TestFirstAdministratorIsUnique(t *testing.T) {
	a, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	h := a.Router()
	start := make(chan struct{})
	results := make(chan int, 2)
	for _, user := range []string{"first", "second"} {
		go func(user string) {
			<-start
			r := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBufferString(`{"username":"`+user+`","password":"secure-password-1"}`))
			r.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			results <- w.Code
		}(user)
	}
	close(start)
	one, two := <-results, <-results
	if !((one == 200 && two == 401) || (one == 401 && two == 200)) {
		t.Fatalf("unexpected results %d %d", one, two)
	}
	var count int
	if err = a.db.QueryRow(`SELECT count(*) FROM admin`).Scan(&count); err != nil || count != 1 {
		t.Fatal(count, err)
	}
}

func TestArgon2idPasswordPersistence(t *testing.T) {
	dir := t.TempDir()
	password := strings.Repeat("中文密码", 8)
	body, _ := json.Marshal(map[string]string{"username": "administrator", "password": password})
	login := func(a *App, payload []byte) int {
		t.Helper()
		r := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(payload))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		a.Router().ServeHTTP(w, r)
		return w.Code
	}
	a, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}
	if code := login(a, body); code != 200 {
		t.Fatal(code)
	}
	var hash string
	if err = a.db.QueryRow(`SELECT password_hash FROM admin WHERE id=1`).Scan(&hash); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hash, "$argon2id$v=19$m=19456,t=2,p=1$") || strings.Contains(hash, password) {
		t.Fatal("password was not stored as Argon2id")
	}
	a.Close()
	a, err = New(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	if code := login(a, body); code != 200 {
		t.Fatalf("correct password after restart: %d", code)
	}
	wrong, _ := json.Marshal(map[string]string{"username": "administrator", "password": password + "wrong"})
	if code := login(a, wrong); code != 401 {
		t.Fatalf("wrong password: %d", code)
	}
}
func TestPasswordLengthUnicode(t *testing.T) {
	cases := []struct {
		name, password string
		status         int
	}{
		{"5 ASCII", strings.Repeat("a", 5), 400},
		{"6 ASCII", strings.Repeat("a", 6), 200},
		{"5 Chinese", strings.Repeat("密", 5), 400},
		{"6 Chinese", strings.Repeat("密", 6), 200},
		{"64 emoji", strings.Repeat("🔐", 64), 200},
		{"65 emoji", strings.Repeat("🔐", 65), 400},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			a, err := New(t.TempDir())
			if err != nil {
				t.Fatal(err)
			}
			defer a.Close()
			body, _ := json.Marshal(map[string]string{"username": "admin", "password": tc.password})
			r := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
			r.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			a.Router().ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("got %d: %s", w.Code, w.Body.String())
			}
		})
	}
}
