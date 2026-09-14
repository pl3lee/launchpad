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

These checks used desktop Chromium with resized viewports. Actual Tesla hardware, vehicle-specific browser restrictions, and third-party streaming playback have not been tested. Before a release, check opening and returning from a shortcut, PIN entry, and touch reordering in a parked vehicle.
