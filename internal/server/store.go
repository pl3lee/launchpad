package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unicode/utf8"
)

type App struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	URL   string `json:"url"`
	Icon  string `json:"icon"`
	Color string `json:"color"`
}

type Grid struct {
	Revision uint64 `json:"revision"`
	Apps     []App  `json:"apps"`
}

type store struct {
	mu   sync.Mutex
	path string
	grid Grid
}

var errConflict = errors.New("Your apps changed on another device. Reload to get the latest version.")
var icons = map[string]bool{"youtube": true, "netflix": true, "spotify": true, "plex": true, "play": true, "music": true, "headphones": true, "navigation": true, "map": true, "globe": true, "home": true, "cloud": true, "radio": true, "gamepad": true, "bookmark": true, "tv": true}
var colors = map[string]bool{"coral": true, "mint": true, "violet": true, "amber": true, "blue": true, "silver": true}

func defaults() Grid {
	return Grid{Revision: 1, Apps: []App{
		{"youtube", "YouTube", "https://www.youtube.com", "youtube", "coral"},
		{"netflix", "Netflix", "https://www.netflix.com", "netflix", "coral"},
		{"plex", "Plex", "https://app.plex.tv", "plex", "amber"},
		{"spotify", "Spotify", "https://open.spotify.com", "spotify", "mint"},
		{"abrp", "A Better Routeplanner", "https://abetterrouteplanner.com", "navigation", "blue"},
		{"pocket-casts", "Pocket Casts", "https://play.pocketcasts.com", "headphones", "violet"},
		{"maps", "Google Maps", "https://maps.google.com", "map", "mint"},
	}}
}

func newStore(dir string) (*store, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	s := &store{path: filepath.Join(dir, "apps.json")}
	b, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		s.grid = defaults()
		if err := s.write(s.grid); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	} else {
		if err := json.Unmarshal(b, &s.grid); err != nil {
			return nil, fmt.Errorf("read saved grid: %w", err)
		}
		if err := validateApps(s.grid.Apps); err != nil {
			return nil, fmt.Errorf("invalid saved grid: %w", err)
		}
	}
	return s, nil
}
func (s *store) get() Grid {
	s.mu.Lock()
	defer s.mu.Unlock()
	return Grid{s.grid.Revision, append([]App{}, s.grid.Apps...)}
}
func (s *store) update(g Grid) (Grid, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if g.Revision != s.grid.Revision {
		return Grid{}, errConflict
	}
	if err := validateApps(g.Apps); err != nil {
		return Grid{}, err
	}
	g.Revision++
	if g.Apps == nil {
		g.Apps = []App{}
	}
	if err := s.write(g); err != nil {
		return Grid{}, err
	}
	s.grid = g
	return g, nil
}

// Rename only a fully written, synced file; a failed save preserves the old grid.
func (s *store) write(g Grid) error {
	b, err := json.MarshalIndent(g, "", "  ")
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(s.path), ".apps-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), s.path)
}
func validateApps(apps []App) error {
	if len(apps) > 100 {
		return errors.New("You can save up to 100 apps.")
	}
	seen := map[string]bool{}
	for _, a := range apps {
		if a.ID == "" || len(a.ID) > 80 || seen[a.ID] {
			return errors.New("Each app needs a unique ID.")
		}
		seen[a.ID] = true
		if strings.TrimSpace(a.Name) == "" || utf8.RuneCountInString(a.Name) > 60 {
			return errors.New("App names must be between 1 and 60 characters.")
		}
		u, err := url.Parse(a.URL)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Hostname() == "" || u.User != nil || len(a.URL) > 2048 {
			return errors.New("Enter a valid http:// or https:// URL without embedded credentials.")
		}
		if !icons[a.Icon] || !colors[a.Color] {
			return errors.New("Choose an available icon and color.")
		}
	}
	return nil
}
