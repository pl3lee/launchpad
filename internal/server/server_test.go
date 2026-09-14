package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
)

func testServer(t *testing.T, pin string) *Server {
	t.Helper()
	s, err := New(Config{DataDir: t.TempDir(), PIN: pin}, fstest.MapFS{"index.html": {Data: []byte("<html>Launchpad</html>")}})
	if err != nil {
		t.Fatal(err)
	}
	return s
}
func request(s *Server, method, path string, body any, cookie *http.Cookie) *httptest.ResponseRecorder {
	var b io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		b = bytes.NewReader(raw)
	}
	r := httptest.NewRequest(method, path, b)
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-Launchpad", "1")
	if cookie != nil {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}
func loginCookie(t *testing.T, s *Server, pin string) *http.Cookie {
	t.Helper()
	w := request(s, "POST", "/api/login", map[string]string{"pin": pin}, nil)
	if w.Code != 200 {
		t.Fatalf("login: %d %s", w.Code, w.Body)
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatal("missing session cookie")
	}
	return cookies[0]
}
func TestIconCatalogSavesAndSurvivesRestart(t *testing.T) {
	s := testServer(t, "")
	// Exercise every picker ID through the save API, in batches below the grid limit.
	var apps []App
	for name := range icons {
		apps = append(apps, App{ID: name, Name: name, URL: "https://example.com", Icon: name, Color: "silver"})
	}
	for start := 0; start < len(apps); start += 100 {
		end := min(start+100, len(apps))
		g := Grid{Revision: s.store.get().Revision, Apps: apps[start:end]}
		w := request(s, "PUT", "/api/apps", g, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("save catalog icons: %d %s", w.Code, w.Body)
		}
		reloaded, err := newStore(s.cfg.DataDir)
		if err != nil {
			t.Fatalf("restart with catalog icons: %v", err)
		}
		got := reloaded.get().Apps
		if len(got) != len(g.Apps) {
			t.Fatal("restart lost apps")
		}
		for i := range got {
			if got[i].Icon != g.Apps[i].Icon {
				t.Fatal("restart changed icon")
			}
		}
	}
	for _, name := range []string{"not-an-icon", "constructor", "../home", "https://example.com/icon.svg"} {
		g := Grid{Revision: s.store.get().Revision, Apps: []App{{ID: "bad", Name: "Bad icon", URL: "https://example.com", Icon: name, Color: "silver"}}}
		if w := request(s, "PUT", "/api/apps", g, nil); w.Code != http.StatusBadRequest {
			t.Fatalf("accepted unknown icon %q: %d", name, w.Code)
		}
	}
}

func TestPINSessionAndRestart(t *testing.T) {
	s := testServer(t, "0012")
	w := request(s, "GET", "/api/state", nil, nil)
	if strings.Contains(w.Body.String(), "youtube") || !strings.Contains(w.Body.String(), `"authenticated":false`) {
		t.Fatalf("locked state leaked apps: %s", w.Body)
	}
	if w := request(s, "POST", "/api/login", map[string]string{"pin": "12"}, nil); w.Code != 401 {
		t.Fatal("leading zeros were discarded")
	}
	c := loginCookie(t, s, "0012")
	if c.Value == "0012" || !c.HttpOnly || c.SameSite != http.SameSiteStrictMode || c.MaxAge <= 0 {
		t.Fatalf("unsafe cookie: %+v", c)
	}
	if w := request(s, "GET", "/api/state", nil, c); !strings.Contains(w.Body.String(), `"authenticated":true`) {
		t.Fatal(w.Body)
	}
	restarted, err := New(s.cfg, fstest.MapFS{"index.html": {Data: []byte("ok")}})
	if err != nil {
		t.Fatal(err)
	}
	if w := request(restarted, "GET", "/api/state", nil, c); !strings.Contains(w.Body.String(), `"authenticated":false`) {
		t.Fatal("session survived restart")
	}
	// An expired cookie must not interfere with signing in again.
	if w := request(restarted, "POST", "/api/login", map[string]string{"pin": "0012"}, c); !strings.Contains(w.Body.String(), `"authenticated":true`) {
		t.Fatalf("relogin failed: %s", w.Body)
	}
	if w := request(s, "POST", "/api/logout", map[string]string{}, c); w.Result().Cookies()[0].MaxAge != -1 {
		t.Fatal("logout did not clear cookie")
	}
}
func TestPINOptionalAndSavePersists(t *testing.T) {
	s := testServer(t, "")
	if w := request(s, "GET", "/api/state", nil, nil); !strings.Contains(w.Body.String(), `"authenticated":true`) {
		t.Fatal(w.Body)
	}
	g := s.store.get()
	g.Apps = []App{{"custom", "Local app", "http://192.168.1.20:8123", "home", "mint"}}
	w := request(s, "PUT", "/api/apps", g, nil)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	saved, err := newStore(s.cfg.DataDir)
	if err != nil {
		t.Fatal(err)
	}
	if got := saved.get(); got.Apps[0].Name != "Local app" || got.Revision != 2 {
		t.Fatal(got)
	}
	// Deliberately empty grids stay empty, including after a restart.
	g = saved.get()
	g.Apps = []App{}
	if w := request(s, "PUT", "/api/apps", g, nil); w.Code != 200 {
		t.Fatal(w.Body)
	}
	saved, err = newStore(s.cfg.DataDir)
	if err != nil || len(saved.get().Apps) != 0 {
		t.Fatal("empty grid was replaced with defaults")
	}
}
func TestProtectedSaveAndSecureCookie(t *testing.T) {
	s := testServer(t, "1234")
	s.cfg.Origin = "https://launchpad.example.com"
	if w := request(s, "PUT", "/api/apps", s.store.get(), nil); w.Code != 401 {
		t.Fatal("save was not protected")
	}
	if c := loginCookie(t, s, "1234"); !c.Secure {
		t.Fatal("HTTPS origin did not set Secure")
	}
}
func TestConflictingSaves(t *testing.T) {
	s := testServer(t, "")
	g := s.store.get()
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); codes <- request(s, "PUT", "/api/apps", g, nil).Code }()
	}
	wg.Wait()
	close(codes)
	got := map[int]int{}
	for code := range codes {
		got[code]++
	}
	if got[200] != 1 || got[409] != 1 {
		t.Fatal(got)
	}
}
func TestRejectUnsafeApps(t *testing.T) {
	for _, raw := range []string{"javascript:alert(1)", "data:text/html,test", "file:///etc/passwd", "https://user:password@example.com", "https://", "//example.com"} {
		t.Run(raw, func(t *testing.T) {
			s := testServer(t, "")
			g := s.store.get()
			g.Apps[0].URL = raw
			if w := request(s, "PUT", "/api/apps", g, nil); w.Code != 400 {
				t.Fatal(w.Code, w.Body)
			}
		})
	}
	s := testServer(t, "")
	g := s.store.get()
	g.Apps = append(g.Apps, g.Apps[0])
	if w := request(s, "PUT", "/api/apps", g, nil); w.Code != 400 {
		t.Fatal("duplicate ids accepted")
	}
}
func TestRequestBoundaries(t *testing.T) {
	s := testServer(t, "")
	for _, test := range []struct {
		name, origin, fetchSite, header, content, body string
		want                                           int
	}{
		{"cross origin", "https://evil.example", "", "1", "application/json", "{}", 403},
		{"cross site", "", "cross-site", "1", "application/json", "{}", 403},
		{"missing custom header", "", "", "", "application/json", "{}", 403},
		{"form", "", "", "1", "application/x-www-form-urlencoded", "pin=1", 415},
		{"trailing json", "", "", "1", "application/json", "{} {}", 400},
		{"unknown field", "", "", "1", "application/json", `{"extra":true}`, 400},
		{"too large", "", "", "1", "application/json", `{"pin":"` + strings.Repeat("1", 300000) + `"}`, 400},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "/api/login", strings.NewReader(test.body))
			r.Header.Set("Origin", test.origin)
			r.Header.Set("Sec-Fetch-Site", test.fetchSite)
			r.Header.Set("X-Launchpad", test.header)
			r.Header.Set("Content-Type", test.content)
			w := httptest.NewRecorder()
			s.ServeHTTP(w, r)
			if w.Code != test.want {
				t.Fatalf("got %d, want %d", w.Code, test.want)
			}
		})
	}
}
func TestRateLimit(t *testing.T) {
	s := testServer(t, "1234")
	for i := 0; i < 10; i++ {
		if w := request(s, "POST", "/api/login", map[string]string{"pin": "9999"}, nil); w.Code != 401 {
			t.Fatal(w.Code)
		}
	}
	w := request(s, "POST", "/api/login", map[string]string{"pin": "1234"}, nil)
	if w.Code != 429 || w.Header().Get("Retry-After") == "" {
		t.Fatal("rate limit missing")
	}
}
func TestInvalidConfig(t *testing.T) {
	for _, pin := range []string{"abc", "12 34", "１２３４", "-123", "12\n"} {
		if err := validateConfig(Config{PIN: pin}); err == nil {
			t.Errorf("accepted invalid PIN %q", pin)
		}
	}
	for _, origin := range []string{"example.com", "https://example.com/path", "https://user@example.com", "ftp://example.com"} {
		if err := validateConfig(Config{Origin: origin}); err == nil {
			t.Errorf("accepted invalid origin %q", origin)
		}
	}
}
func TestFailedSavePreservesMemoryAndDisk(t *testing.T) {
	s := testServer(t, "")
	g := s.store.get()
	originalPath := s.store.path
	before, err := os.ReadFile(originalPath)
	if err != nil {
		t.Fatal(err)
	}
	// Renaming a file over a directory fails on both supported platforms.
	s.store.path = s.cfg.DataDir
	g.Apps[0].Name = "Changed"
	if _, err := s.store.update(g); err == nil {
		t.Fatal("expected disk failure")
	}
	if s.store.get().Apps[0].Name == "Changed" {
		t.Fatal("failed save changed memory")
	}
	after, _ := os.ReadFile(originalPath)
	if !bytes.Equal(before, after) {
		t.Fatal("failed save changed disk")
	}
}
func TestCorruptDataIsNotOverwritten(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "apps.json")
	raw := []byte("broken")
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := newStore(dir); err == nil {
		t.Fatal("corrupt file accepted")
	}
	got, _ := os.ReadFile(path)
	if !bytes.Equal(raw, got) {
		t.Fatal("corrupt file overwritten")
	}
}
func TestStaticAndAPIHeaders(t *testing.T) {
	s := testServer(t, "")
	for _, path := range []string{"/", "/healthz", "/api/state"} {
		w := request(s, "GET", path, nil, nil)
		if w.Code != 200 || w.Header().Get("Content-Security-Policy") == "" {
			t.Fatal(path, w.Code)
		}
	}
	for _, path := range []string{"/data/apps.json", "/api/missing", "/.env"} {
		if w := request(s, "GET", path, nil, nil); w.Code != 404 {
			t.Fatal(fmt.Sprintf("%s: %d", path, w.Code))
		}
	}
	if w := request(s, "GET", "/api/state", nil, nil); w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("API response can be cached")
	}
}
