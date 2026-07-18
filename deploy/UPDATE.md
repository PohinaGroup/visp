# Updating the API and portal

Run these steps on the **app box** only. Existing streams keep running across
API and portal restarts; do not restart MediaMTX for an app update.

SSH in over Tailscale as a user that can `sudo`.

## 1. Fetch the release

```bash
cd /opt/visp
sudo -u visp git fetch --prune
sudo -u visp git checkout <tag-or-branch>
sudo -u visp git pull --ff-only
```


## 2. Install dependencies

```bash
sudo bash -lc 'cd /opt/visp && bun install --frozen-lockfile'
```

## 3. Env files (only when they changed)

Compare the release examples with the live files and add any new keys:

- `/etc/visp/app.env` ← `apps/server/.env.example`
- `/etc/visp/web.env` ← `apps/web/.env.example`

Keep both `chmod 600` and root-owned. Runtime services read these via systemd;
the portal also needs `VITE_*` values **at build time**.

For the unified chat release, add `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET`, and
confirm the existing Twitch credentials are present. Register these production
URLs before enabling chat:

- Twitch OAuth: `https://APP_DOMAIN/api/auth/callback/twitch`
- Kick OAuth: `https://APP_DOMAIN/api/auth/oauth2/callback/kick`
- Kick webhook: `https://APP_DOMAIN/api/webhooks/kick`

For linked publishing devices, add a backed-up 32-byte key generated with
`openssl rand -base64 32` as `PUBLISH_URL_ENCRYPTION_KEY` before restarting the
API. Browser broadcasting also requires
`NATIVE_WEB_ORIGIN=https://stream.arvoitus.com`.

For stream snapshots, add `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
`S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`. The endpoint must be the public
HTTPS UpCloud S3 endpoint because relay uploads and dashboard image requests use
short-lived presigned URLs.

## 4. Migrate the database

```bash
sudo -u visp bash -lc '
  set -a
  source /etc/visp/app.env
  set +a
  cd /opt/visp && bun run db:migrate
'
```

Skip this step only when the release has no new migrations under
`packages/db/src/migrations`.

## 5. Build API and portal

Build just the server and web workspaces (avoids native / fumadocs):

```bash
sudo bash -lc '
  set -a
  source /etc/visp/web.env
  set +a
  cd /opt/visp && bun x turbo run build -F server -F web
'
```

Build the static browser broadcaster when its code or public values change:

```bash
sudo -u visp bash -lc '
  cd /opt/visp
  EXPO_PUBLIC_SERVER_URL=https://APP_DOMAIN \
  EXPO_PUBLIC_RELAY_WEBRTC_URL=https://RELAY_DOMAIN \
    bun run --cwd apps/native build:web
'
```

Set `NATIVE_WEB_DOMAIN=stream.arvoitus.com` in `/etc/visp/caddy.env`, install the
updated app Caddyfile, and reload Caddy. Re-run the portal build whenever
`apps/web` or its `VITE_*` values change. A pure API change
still needs the server build; a portal-only change still needs `web.env` sourced.

## 6. Restart services

```bash
sudo systemctl restart visp-server visp-web
sudo systemctl status visp-server visp-web --no-pager
```

Confirm nothing is crash-looping:

```bash
sudo journalctl -u visp-server -u visp-web -n 50 --no-pager
```

## 7. Smoke check

1. Open `https://APP_DOMAIN` and sign in.
2. Confirm the dashboard loads and an existing live path still shows ready.
3. Optional: `curl -fsS https://APP_DOMAIN/api/auth/ok` (or your usual health
   probe) if one is configured.

## Quick reference

| Change                         | Migrate | Build              | Restart              |
| ------------------------------ | ------- | ------------------ | -------------------- |
| API code only                  | if needed | server (+ deps)  | `visp-server`        |
| Portal code or `VITE_*`        | no      | web (+ deps)       | `visp-web`           |
| Schema / migrations            | yes     | as needed          | `visp-server`        |
| `/etc/visp/app.env` only       | no      | no                 | `visp-server`        |
| `/etc/visp/web.env` (`VITE_*`) | no      | web                | `visp-web`           |

Full two-box install and acceptance criteria: `deploy/README.md`.
The relay-side Caddy and MediaMTX WebRTC changes require the separate relay
rollout described there; restart MediaMTX only in a maintenance window.
