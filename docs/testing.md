# Validation

The initial implementation was checked with:

```sh
pnpm --dir web install --frozen-lockfile
pnpm --dir web run build
go test -race ./...
go vet ./...
docker compose up -d --build
```

Go tests cover optional authentication, leading zeroes in PINs, secure cookie attributes, restart invalidation, re-login with an expired cookie, protected writes, persistent and empty grids, concurrent edit conflicts, rejected URL schemes, request origin and payload checks, rate limiting, invalid configuration, failed disk writes, corrupt saved files, and public route boundaries.

Browser checks exercised the production frontend served by Go: wrong and correct PINs, session persistence across reloads, adding an app with an icon and color, renaming, dragging, move buttons, removing an app, and locking. Desktop and narrow phone layouts were inspected, including dialog focus, Escape dismissal, overflow, and browser console errors.

A separate Docker check signed in, changed the grid, restarted the container, verified that the old cookie was rejected and the grid survived, signed in again, and restored the original grid. The non-root container passed its health check with a read-only root filesystem.

The expanded icon picker was checked by rendering all 109 icons, filtering Web apps and General, searching for Home Assistant, checking an empty search, and saving/reloading an app with the new logo. Layouts at 375px and 320px were inspected. The Go API test saves every catalog icon and reloads the persisted grid; unknown icon IDs remain rejected.

These checks used desktop Chromium with resized viewports. Actual Tesla hardware, vehicle-specific browser restrictions, and third-party streaming playback have not been tested. Before a release, check opening and returning from a shortcut, PIN entry, and touch reordering in a parked vehicle.
