# Developing VISP

This guide covers the TypeScript monorepo, documentation site, broadcaster and
OBS Remote Expo clients, and database. The OBS plugin has additional platform toolchains documented in
[`apps/obs-plugin/README.md`](apps/obs-plugin/README.md).

## Prerequisites

- Bun 1.3.14 or newer (the pinned version is in `package.json`)
- Node.js 24 or newer (required by Portless)
- Docker with Compose
- A Twitch application for Twitch login
- A Kick application to exercise Kick login, chat, and metadata
- A Google OAuth web client with YouTube Data API v3 enabled for YouTube Direct
- A physical phone or compatible simulator for either Expo app

Install all workspace dependencies from the repository root:

```bash
bun install
```

## Local services

The normal development command manages PostgreSQL 18, MinIO, MediaMTX, and the
local relay gateway:

```bash
bun run dev:local
```

Compose data volumes persist across restarts. Ctrl+C stops the API, portal,
admin console, OBS Remote web app, and docs; `bun run dev:local:down` stops the
containers without deleting their data.

## Environment files

`bun run dev:local` creates missing server, web, and OBS Remote env files from
the tracked examples, generates missing local secrets, and reports every invalid
value. The broadcaster env remains explicit because it needs a device-reachable
address:

```bash
cp apps/native/.env.example apps/native/.env.local
```

The launcher supplies local service values at runtime. Blank Twitch, Kick, or Google
credentials are reported and only affect those provider flows. Direct server
commands still require every schema-required value. Important groups are:

- `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`,
  `ADMIN_ORIGIN`, and `ADMIN_USER_IDS` configure the database, browser
  authentication boundary, and break-glass admin access.
- `TWITCH_*`, `KICK_*`, and `GOOGLE_*` configure provider OAuth and APIs. Development values
  may be placeholders only when the matching provider flow is not exercised.
- `AI_GATEWAY_API_KEY` authenticates the server-side Seppo setup assistant with
  Vercel AI Gateway. Create the key in Vercel and never expose it as a `VITE_*`
  variable.
- Optional `ELEVENLABS_API_KEY` enables account-gated hosted captions and audio
  isolation. Add `ELEVENLABS_VOICE_ID` to enable hosted chat text-to-speech.
  Without them, the app uses on-device fallbacks or hides the hosted option.
- `HOOK_SECRET`, `MEDIAMTX_API_URL`, `RELAY_HOST`, and `RELAY_PING_URL` connect
  the app to the local MediaMTX and Portless relay domains.
- `S3_*` configures private snapshot storage. The launcher points these values
  at its MinIO service.
- `PUBLISH_URL_ENCRYPTION_KEY` must be exactly 32 random bytes encoded as
  canonical base64. Generate it with:

  ```bash
  openssl rand -base64 32
  ```

The default relay uses `127.0.0.1`. To exercise multi-relay assignment, register
the second Compose relay in Admin with host `127.0.0.2`, Control API
`http://127.0.0.2:9997`, and ping URL
`http://relay2.visp.localhost:8082/ping`.

Never commit the resulting `.env` files.

The browser reads `VITE_SERVER_URL` and optional `VITE_RYBBIT_SITE_ID` at
build time. A physical phone cannot reach your
computer through `127.0.0.1`; set `EXPO_PUBLIC_SERVER_URL` to your computer's
LAN or tunnel address instead.

### OAuth callbacks

Register these local callback URLs with the providers you use:

```text
Twitch: https://api.visp.localhost/api/auth/callback/twitch
Kick:   https://api.visp.localhost/api/auth/oauth2/callback/kick
Google: http://localhost:3000/api/auth/google-local-callback
```

Apple needs no callback URL. It runs only in the iOS app, which hands Better
Auth an identity token straight from the native sheet, so there is no browser
redirect, no Services ID, and no `.p8` client secret. The one setup step lives
outside this repo: enable the **Sign In with Apple** capability on App ID
`com.pohinagroup.visp` in the Apple Developer portal, or the entitlement that
`ios.usesAppleSignIn` generates will fail to sign. The audience Better Auth
verifies against is the bundle identifier hardcoded in `packages/auth/src/index.ts`;
keep it equal to `ios.bundleIdentifier` in `apps/native/app.json`.

The native iOS app keeps `voip` in `UIBackgroundModes` for live Picture-in-Picture
via `AVPictureInPictureVideoCallViewController`. That is intentional; do not
remove it when scrubbing unused background modes for App Review.

### Google and YouTube credentials

1. Open [Google Cloud Console](https://console.cloud.google.com/), create or
   select the project that owns VISP, then open **APIs & Services → Library**
   and enable **YouTube Data API v3**.
2. Open **Google Auth Platform** and configure **Branding** and **Audience**.
   Choose **External** unless every VISP user belongs to one Google Workspace
   organization. While the app is in testing, add each Google account that
   will test YouTube Direct as a test user.
3. Under **Data Access**, add `openid`, `email`, `profile`, and
   `https://www.googleapis.com/auth/youtube.force-ssl`. Google requires review
   before an external production app can broadly request the YouTube scope.
4. Open **Clients → Create client → Web application**. Add these development
   values exactly:

   ```text
   Authorized JavaScript origin:
   http://localhost:3000

   Authorized redirect URI:
   http://localhost:3000/api/auth/google-local-callback
   ```

   Google rejects custom `.localhost` subdomains because they are not a
   registrable private domain. The loopback endpoint immediately forwards the
   response to Better Auth at
   `https://api.visp.localhost/api/auth/callback/google`, preserving the normal
   VISP session cookie. An origin contains only scheme and host; never put the
   callback path in it.
5. For native Google sign-in on a physical device, create a separate **iOS**
   OAuth client (Google Cloud Console → Clients → Create client → iOS) with
   bundle ID `com.pohinagroup.visp`. Google does not accept LAN IP redirect
   URIs, so the native app uses `@react-native-google-signin/google-signin` and
   exchanges an ID token with Better Auth instead of browser redirects.
6. Copy the generated values into the untracked `apps/server/.env`:

   ```text
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_IOS_CLIENT_ID=...apps.googleusercontent.com
   ```

   `dev:local` copies the web and iOS client IDs into `apps/native/.env.local`
   as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
   A physical phone cannot reach `https://api.visp.localhost`; `dev:local` also
   sets `EXPO_PUBLIC_SERVER_URL` to `http://LAN_IP:3000`. Rebuild the native
   dev client after adding the iOS client ID (`bun run --cwd apps/native ios`).
7. Restart `bun run dev:local`, sign in with Google, and authorize YouTube from
   Direct. VISP requests explicit consent and offline access so it can refresh
   the token when a stream starts unattended.

## Database workflow

Apply existing migrations before starting the server:

```bash
bun run db:migrate
```

When changing files under `packages/db/src/schema`, generate and inspect a
forward migration, then apply it locally:

```bash
bun run db:generate
bun run db:migrate
```

`bun run db:push` directly synchronizes a disposable development database; do
not use it as a substitute for a committed migration. Inspect local data with:

```bash
bun run db:studio
```

Drizzle reads `DATABASE_URL` from `apps/server/.env`.

## Running the project

For normal portal/API work, use the one-stop launcher:

| Process | Command | Address |
| --- | --- | --- |
| Complete local stack | `bun run dev:local` | `https://visp.localhost` |
| API | managed by the launcher | `https://api.visp.localhost` |
| Admin console | managed by the launcher | `https://admin.visp.localhost` |
| Docs | managed by the launcher | `https://docs.visp.localhost` |
| OBS Remote web | managed by the launcher | `http://localhost:8083` |
| Relay | managed by the launcher | `https://relay.visp.localhost` |
| MinIO console | managed by the launcher | `https://minio.visp.localhost` |
| PostgreSQL | managed by the launcher | `127.0.0.1:54320` |
| Expo dev server | `bun run --cwd apps/native dev` | shown by Expo |

`bun run dev` starts every workspace development task through Turborepo,
including the API, portal, admin console, Expo, and documentation site. Use it
only when you actually want the entire workspace running.

### OBS Remote

The one-stop launcher serves the web control surface on port 8083. Run it alone
with `bun run dev:obs-remote`. For a physical device, set
`EXPO_PUBLIC_SERVER_URL=http://LAN_IP:3000` in
`apps/obs-remote/.env.local`, then use its `ios` or `android` script. Native OAuth
returns through the `obsremote://` scheme; browser auth requires
`OBS_REMOTE_WEB_ORIGIN` to exactly match the web origin.

### Native app

Expo Go cannot load the local SRT module. Use a development build; use a
physical device when testing real camera and microphone streaming:

```bash
bun run --cwd apps/native ios
bun run --cwd apps/native android
```

The iOS project is committed because it includes HaishinKit integration and
inline Swift. Android is generated from `app.json` and the RootEncoder config
plugin. See [`apps/native/README.md`](apps/native/README.md) before regenerating
either project.

### Documentation site

Fumadocs content lives in `apps/fumadocs/content/docs`. Add a page there and add
its slug to the adjacent `meta.json`; generated route files are ignored.

## Tests and checks

```bash
# All Bun unit tests
bun test

# PostgreSQL-backed machine/auth/hook tests; manages compose.test.yml itself
bun run test:integration

# TypeScript across all workspaces
bun run check-types

# Production builds across all workspaces
bun run build

# Apply Biome formatting and safe fixes
bun run check
```

The integration suite binds PostgreSQL to `127.0.0.1:55432`, uses a tmpfs data
directory, and runs `docker compose down --volumes` on exit.

## Where changes belong

| Change | Primary location |
| --- | --- |
| HTTP routes, hooks, server lifecycle | `apps/server/src` |
| tRPC procedures and relay business rules | `packages/api/src` |
| Authentication/provider configuration | `packages/auth/src` |
| Database schema and migrations | `packages/db/src` |
| Browser routes and components | `apps/web/src` |
| Admin support console | `apps/admin/src` |
| Shared UI primitives | `packages/ui/src` |
| Native screens and device behavior | `apps/native/src` |
| Native SRT bridge | `apps/native/modules/visp-srt` |
| OBS Remote interface | `apps/obs-remote/src` |
| OBS-side remote transport | `apps/obs-plugin` |
| Operator/broadcaster docs | `apps/fumadocs/content/docs` |

Environment variables are validated centrally in `packages/env`; add new
variables there and to the relevant `.env.example` in the same change. Keep
secrets out of logs and extend the redaction list in `apps/server/src/app.ts`
when introducing a new credential-shaped field.

## Troubleshooting

- **The server exits during import:** a required value in `apps/server/.env` is
  blank or invalid. The error names the rejected variable.
- **The portal cannot authenticate:** confirm `https://api.visp.localhost` is
  available and `CORS_ORIGIN` is exactly `https://visp.localhost`.
- **The admin console denies access:** sign in through the main portal, then
  confirm the account has role `admin` or its user ID is in `ADMIN_USER_IDS`.
- **A phone cannot connect:** `localhost` and `127.0.0.1` refer to the phone.
  Use an address reachable from the phone and allow API port 3000 through the
  host firewall.
- **OBS Remote web cannot authenticate:** confirm it uses port 8083 and
  `OBS_REMOTE_WEB_ORIGIN` exactly matches `http://localhost:8083`.
- **OBS Remote stays disconnected:** verify the API supports the `/api/obs/live`
  WebSocket upgrade and use HTTPS/WSS outside localhost.
- **RTT or relay actions fail:** run `bun run dev:local`, then check
  `docker compose ps` and `docker compose logs mediamtx gateway`.
- **Integration tests cannot bind port 55432:** stop the process already using
  that port, then rerun the suite.
