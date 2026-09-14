package server

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

type Config struct{ Addr, DataDir, PIN, Origin string }

func ConfigFromEnv() (Config, error) {
	c := Config{Addr: os.Getenv("LISTEN_ADDR"), DataDir: os.Getenv("DATA_DIR"), PIN: os.Getenv("PIN"), Origin: strings.TrimRight(os.Getenv("APP_ORIGIN"), "/")}
	if c.Addr == "" {
		c.Addr = ":8080"
	}
	if c.DataDir == "" {
		c.DataDir = "./data"
	}
	return c, validateConfig(c)
}
func validateConfig(c Config) error {
	if len(c.PIN) > 128 {
		return errors.New("PIN must contain at most 128 digits")
	}
	for _, v := range c.PIN {
		if v < '0' || v > '9' {
			return errors.New("PIN must contain only ASCII digits 0-9, or be empty to disable protection")
		}
	}
	if c.Origin != "" {
		u, err := url.Parse(c.Origin)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Hostname() == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.User != nil {
			return errors.New("APP_ORIGIN must be an http(s) origin, e.g. https://launchpad.example.com")
		}
	}
	return nil
}

type Server struct {
	cfg        Config
	store      *store
	token      string
	pinHash    [32]byte
	handler    http.Handler
	attemptsMu sync.Mutex
	attempts   int
	window     time.Time
}

func New(c Config, assets fs.FS) (*Server, error) {
	if err := validateConfig(c); err != nil {
		return nil, err
	}
	s, err := newStore(c.DataDir)
	if err != nil {
		return nil, err
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	a := &Server{cfg: c, store: s, token: hex.EncodeToString(b), pinHash: sha256.Sum256([]byte(c.PIN))}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { jsonResponse(w, 200, map[string]bool{"ok": true}) })
	mux.HandleFunc("GET /api/state", a.state)
	mux.HandleFunc("POST /api/login", a.login)
	mux.HandleFunc("POST /api/logout", a.logout)
	mux.HandleFunc("PUT /api/apps", a.save)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { fail(w, 404, "Not found.") })
	files := http.FileServerFS(assets)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			fail(w, http.StatusMethodNotAllowed, "Method not allowed.")
			return
		}
		if r.URL.Path != "/" && !strings.HasPrefix(r.URL.Path, "/assets/") && r.URL.Path != "/favicon.svg" {
			http.NotFound(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		files.ServeHTTP(w, r)
	})
	a.handler = mux
	return a, nil
}
func (a *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
	if strings.HasPrefix(r.URL.Path, "/api/") {
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != "GET" && r.Method != "HEAD" {
			// JSON plus a custom header prevents cross-origin HTML form submissions.
			if r.Header.Get("X-Launchpad") != "1" || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
				fail(w, 403, "Request origin is not allowed.")
				return
			}
			if origin := r.Header.Get("Origin"); origin != "" {
				u, err := url.Parse(origin)
				allowed := err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host == r.Host
				if a.cfg.Origin != "" {
					allowed = origin == a.cfg.Origin
				}
				if !allowed {
					fail(w, 403, "Request origin is not allowed.")
					return
				}
			}
		}
	}
	a.handler.ServeHTTP(w, r)
}
func (a *Server) authenticated(r *http.Request) bool {
	if a.cfg.PIN == "" {
		return true
	}
	c, err := r.Cookie("launchpad_session")
	return err == nil && subtle.ConstantTimeCompare([]byte(c.Value), []byte(a.token)) == 1
}
func (a *Server) state(w http.ResponseWriter, r *http.Request) {
	if !a.authenticated(r) {
		jsonResponse(w, 200, map[string]any{"authenticated": false, "pinEnabled": true})
		return
	}
	g := a.store.get()
	jsonResponse(w, 200, map[string]any{"authenticated": true, "pinEnabled": a.cfg.PIN != "", "apps": g.Apps, "revision": g.Revision})
}
func (a *Server) allowAttempt() bool {
	a.attemptsMu.Lock()
	defer a.attemptsMu.Unlock()
	if time.Since(a.window) >= time.Minute {
		a.window = time.Now()
		a.attempts = 0
	}
	if a.attempts >= 10 {
		return false
	}
	a.attempts++
	return true
}
func (a *Server) login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PIN string `json:"pin"`
	}
	if !decode(w, r, &body) {
		return
	}
	if a.cfg.PIN != "" {
		if !a.allowAttempt() {
			w.Header().Set("Retry-After", "60")
			fail(w, 429, "Too many attempts. Try again in one minute.")
			return
		}
		h := sha256.Sum256([]byte(body.PIN))
		if subtle.ConstantTimeCompare(h[:], a.pinHash[:]) != 1 {
			fail(w, 401, "That PIN isn’t right. Try again.")
			return
		}
		http.SetCookie(w, a.cookie(r, a.token, 34560000))
	}
	a.state(w, withCookie(r, a.token))
}
func withCookie(r *http.Request, token string) *http.Request {
	c := r.Clone(r.Context())
	c.Header = r.Header.Clone()
	c.Header.Del("Cookie")
	c.AddCookie(&http.Cookie{Name: "launchpad_session", Value: token})
	return c
}
func (a *Server) cookie(r *http.Request, value string, maxAge int) *http.Cookie {
	return &http.Cookie{Name: "launchpad_session", Value: value, Path: "/", HttpOnly: true, Secure: r.TLS != nil || strings.HasPrefix(a.cfg.Origin, "https://"), SameSite: http.SameSiteStrictMode, MaxAge: maxAge}
}
func (a *Server) logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, a.cookie(r, "", -1))
	jsonResponse(w, 200, map[string]bool{"ok": true})
}
func (a *Server) save(w http.ResponseWriter, r *http.Request) {
	if !a.authenticated(r) {
		fail(w, 401, "Unlock your launchpad to save changes.")
		return
	}
	var g Grid
	if !decode(w, r, &g) {
		return
	}
	if err := validateApps(g.Apps); err != nil {
		fail(w, 400, err.Error())
		return
	}
	updated, err := a.store.update(g)
	if errors.Is(err, errConflict) {
		fail(w, 409, err.Error())
		return
	}
	if err != nil {
		log.Printf("save grid: %v", err)
		fail(w, 500, "Couldn’t save your apps. Check the server’s storage and try again.")
		return
	}
	jsonResponse(w, 200, updated)
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		fail(w, 415, "Use application/json.")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 256*1024)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		fail(w, 400, "Invalid request body.")
		return false
	}
	if err := d.Decode(&struct{}{}); err != io.EOF {
		fail(w, 400, "Invalid request body.")
		return false
	}
	return true
}
func jsonResponse(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, map[string]string{"error": message})
}
