# VISP OBS Remote

Dedicated iOS, Android, and web control surface for the VISP OBS plugin. It uses
the same Twitch or Kick VISP account as the dashboard and Native app.

## Development

Set the API origin:

```sh
cp apps/obs-remote/.env.example apps/obs-remote/.env.local
```

For a physical phone, set `EXPO_PUBLIC_SERVER_URL` to the development machine's
LAN IP. Then run from the repository root:

```sh
bun install
bun run dev:obs-remote
```

The app uses the `obsremote://` deep-link scheme. Native sessions are managed by
Better Auth in Expo SecureStore; web sessions use secure HTTP-only cookies.
`bun run dev:local` also serves the web app at `http://localhost:8083`.

## OBS setup

1. Install the VISP OBS plugin.
2. In OBS, open **Tools → VISP Remote Control**.
3. Sign in through the browser and approve the device with the same VISP account.
4. Open this app. OBS connection state and scenes arrive over an authenticated
   WebSocket; stream and scene commands use authenticated tRPC mutations.

Both the plugin and OBS Remote first authenticate over HTTPS to obtain separate
30-second, one-use WebSocket tickets. Long-lived account and machine credentials
are never placed in WebSocket URLs.

OBS makes only outbound HTTPS/WSS connections. No OBS port or OBS WebSocket
password is exposed to the internet.

## Checks

```sh
bun run --cwd apps/obs-remote test
bun run --cwd apps/obs-remote check-types
bun run --cwd apps/obs-remote lint
bun run --cwd apps/obs-remote build
```

Static web deployments must use an origin allowed by the server's Better Auth
and CORS configuration through `OBS_REMOTE_WEB_ORIGIN`.
`EXPO_PUBLIC_SERVER_URL` is embedded at build time.

Release versions are synchronized in `app.json`, `package.json`, the broadcaster
app, and the OBS plugin by `bun run version:bump`. The focused
`.github/workflows/obs-remote.yml` workflow tests the app and uploads web, iOS,
and Android Expo exports. Those exports verify bundling only: there is currently
no OBS Remote production hostname, EAS project, store submission, APK, AAB, or
IPA distribution.
