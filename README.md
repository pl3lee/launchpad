# Launchpad

A small, self-hosted homepage for your favorite web apps, designed for Tesla browser screens and comfortable on a phone or desktop. One instance, one shared grid, no accounts.

- Add, edit, remove, and reorder websites using touch, mouse, or keyboard.
- Search 109 bundled icons, including webapp logos and general symbols, and choose from six colors. No external favicon service or font requests.
- Optionally protect the page with a numeric PIN.
- Keep your grid in a Docker volume, across browser sessions and app restarts.
- Run a single Go binary with the React frontend embedded inside it.

> **Security disclaimer:** The PIN provides only basic protection against casual access. It is not strong security and should not be relied on to protect sensitive information. Do not store sensitive information, passwords, API keys, or URLs containing secret tokens in Launchpad.

## Run with Docker Compose

```sh
cp .env.example .env
docker compose up -d --build
```

Open **http://localhost:8080**. The first run includes seven editable shortcuts. Removing all of them gives you an empty grid; restarts never restore deleted defaults.

To require a PIN, set `PIN="012345"` in `.env` and run `docker compose up -d` again. An empty PIN disables authentication, including protection of editing controls. Do not commit `.env`.

### Reach it from your car

For use away from your home network, put Launchpad behind an HTTPS reverse proxy at an address the car can reach. Set these values in `.env`:

```dotenv
PIN="012345"
APP_ORIGIN=https://launchpad.example.com
```

Replace the example address and PIN. A Caddy proxy running on the host can use:

```caddyfile
launchpad.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

The hostname must resolve to your proxy, and the proxy must be reachable. For a proxy on the same Docker network, connect it to the Compose network and use `launchpad:8080` instead. Forward the original `Host` header. Serve the app at the root of its hostname, not a subpath. `APP_ORIGIN` enables Secure cookies when HTTPS terminates at the proxy; forwarded headers alone are not trusted.

For direct access on a trusted LAN, set `BIND_ADDRESS=0.0.0.0` and open `http://<server-lan-address>:8080`. Only leave `APP_ORIGIN` empty for HTTP or set it to that exact origin. Use HTTPS for a PIN-protected instance exposed to the internet.

## How it works

Tap an app to open its URL in the same tab. Use browser Back to return. **Add an app** accepts a name, website URL, icon, and color. URLs without a scheme use HTTPS. HTTP URLs are supported for local services.

**Edit apps** exposes app editing and reorder controls. Drag the tile’s icon/name area to move an app (hold briefly on touchscreens), use its left/right buttons, or focus the tile and press Space, arrow keys, then Space to drop (Escape cancels). The separate **Edit** button changes its name, URL, icon, or color without automatically opening the keyboard. Changes save immediately. All devices use the same grid. Returning to the page refreshes it; conflicting edits are rejected with a reload prompt instead of overwriting newer changes.

The launcher opens normal websites. It does not bypass Tesla browser restrictions, third-party sign-in, subscriptions, DRM, or restrictions while driving. Individual services may not work in every vehicle browser. This project is independent and is not affiliated with Tesla or the linked services.

Drag an app into the fixed **trash** target to remove it. **Undo** restores the most recently removed app during the current page session. For keyboard removal, focus a tile, press Space to pick it up, Delete to target the trash, and Space to drop; Escape cancels. Arrow keys continue to reorder apps.

### Icons

The icon picker includes 61 webapp logos from [Simple Icons](https://simpleicons.org) and 48 general icons from [Lucide](https://lucide.dev). Search by name or topic, or filter to **Web apps** or **General**. Selected icons keep the tile's chosen color. All icons are bundled into the frontend; no CDN or icon service is required.

The picker and Go validator share `internal/server/icon-catalog.json`. To add an icon, add its label and search keywords there and its static import and mapping in `web/src/icons.tsx`. TypeScript checks that every catalog entry has an icon.

### PIN sessions

The PIN is configured only through the environment and is never stored in the cookie or grid file. A successful login sets an opaque, cryptographically random token in a persistent HttpOnly, SameSite=Strict cookie. The token is generated anew each time the Go process starts. Restarting the process invalidates all previous sessions; changing a PIN takes effect when the container is recreated.

The browser may expire or clear its own cookies (the requested lifetime is 400 days). Otherwise, it stays signed in across browser restarts until the app restarts or you choose **Lock launchpad**. Lock clears the current browser's cookie; it does not sign out other browsers. PIN attempts are limited to ten per minute across the single instance. The grid API requires authentication when a PIN is configured; the static login shell and health check are public.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PIN` | Empty | Optional PIN, ASCII digits only; leading zeroes are preserved. |
| `APP_ORIGIN` | Empty | Exact public origin, e.g. `https://launchpad.example.com`; enables Secure cookies for HTTPS. |
| `BIND_ADDRESS` | `127.0.0.1` | Compose host binding; `0.0.0.0` allows LAN access. |
| `PORT` | `8080` | Compose host port. |
| `DATA_DIR` | `./data` | Go storage directory; Compose sets `/data`. |
| `LISTEN_ADDR` | `:8080` | Go listen address inside the container. |

A single process owns a JSON file, written with an atomic rename. There is no database server. Run only one replica against a data directory. Up to 100 apps are supported. Stored URLs may point to local services; the server never fetches those URLs. There are no analytics, telemetry, or remote fonts.

## Updates and backups

```sh
git pull
docker compose up -d --build
```

The named volume `launchpad-data` holds `/data/apps.json`. A normal `docker compose down` preserves it; `docker compose down -v` deletes it.

Back up the grid with:

```sh
docker compose cp launchpad:/data/apps.json ./apps.backup.json
```

To restore, stop the app, copy the backup into the volume, and start it again:

```sh
docker compose stop launchpad
docker compose run --rm -T --no-deps --entrypoint sh launchpad -c 'cat > /data/apps.json' < apps.backup.json
docker compose up -d
```

Backups contain names and URLs, never the PIN or session token. The app refuses to overwrite an invalid grid file on startup. `GET /healthz` supplies the container health check.

## Develop

Requires Go 1.26+, Node.js 24+, and pnpm 10.33.0 (pinned in `web/package.json`). With a Node.js 24 installation that includes Corepack, run `corepack enable` to enable pnpm.

```sh
pnpm --dir web install --frozen-lockfile
pnpm --dir web run build
go run .
```

Build the frontend before Go: `go:embed` requires `web/dist`. The server reads environment variables directly; it does not load `.env` outside Docker Compose. For example, `PIN=012345 go run .` starts a protected local instance.

For frontend hot reload, leave Go running on port 8080 and start Vite in another terminal:

```sh
pnpm --dir web run dev
```

Open the Vite URL printed in the terminal. Its `/api` requests proxy to Go. Keep `APP_ORIGIN` unset for local HTTP development.

Validation and a standalone build:

```sh
pnpm --dir web run build
pnpm --dir web test
go test -race ./...
go vet ./...
go build -trimpath -o launchpad .
```

The production container runs as a non-root user with a read-only root filesystem and a writable data volume. Frontend build tools are absent from the final image. CI builds the frontend, tests Go with the race detector, and builds the Docker image.

## License

MIT. See [LICENSE](LICENSE). App names and recognizable marks belong to their respective owners. Bundled fonts are distributed under their upstream SIL Open Font Licenses. Lucide uses the ISC license; Simple Icons uses CC0 with individual brand terms described in its [disclaimer](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md). Simple Icons' license and disclaimer are included in `web/public/assets`.
