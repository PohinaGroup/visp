# Developing VISP

This guide covers the TypeScript monorepo, documentation site, native client,
and database. The OBS plugin has additional platform toolchains documented in
[`apps/obs-plugin/README.md`](apps/obs-plugin/README.md).

## Prerequisites

- Bun 1.3.14 or newer (the pinned version is in `package.json`)
- PostgreSQL 17 or newer
- Docker with Compose for the integration suite
- A Twitch application for Twitch login
- A Kick application to exercise Kick login, chat, and metadata
- A physical phone or development-build-compatible simulator for the native app

Install all workspace dependencies from the repository root:

```bash
bun install
```

## Local PostgreSQL

The example server URL expects a database named `visp` on port 5432 with the
username and password `visp`. Use an existing PostgreSQL installation or start a
local container:

```bash
docker run --name visp-postgres \
  --env POSTGRES_USER=visp \
  --env POSTGRES_PASSWORD=visp \
  --env POSTGRES_DB=visp \
  --publish 5432:5432 \
  --detach postgres:17-alpine
```

On later runs, restart that container with `docker start visp-postgres`.

## Environment files

Create local files from the tracked examples:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
cp apps/native/.env.example apps/native/.env.local
```

All blank values in `apps/server/.env` must be filled because server environment
validation runs at startup. Important groups are:

- `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `CORS_ORIGIN`
  configure the database and browser authentication boundary.
- `TWITCH_*` and `KICK_*` configure provider OAuth and APIs. Development values
  may be placeholders only when the matching provider flow is not exercised.
- `HOOK_SECRET`, `MEDIAMTX_API_URL`, `RELAY_HOST`, and `RELAY_PING_URL` connect
  the app to a relay. The checked-in example addresses are safe placeholders;
  relay-dependent features will fail until they point to a running relay.
- `S3_*` configures private snapshot storage. Non-empty placeholders let the
  server boot, but snapshot operations require a compatible S3 service.
- `PUBLISH_URL_ENCRYPTION_KEY` must be exactly 32 random bytes encoded as
  canonical base64. Generate it with:

  ```bash
  openssl rand -base64 32
  ```

Never commit the resulting `.env` files.

The browser reads `VITE_SERVER_URL`, `VITE_RELAY_PING_URL`, and optional
`VITE_RYBBIT_SITE_ID` at build time. A physical phone cannot reach your
computer through `127.0.0.1`; set `EXPO_PUBLIC_SERVER_URL` to your computer's
LAN or tunnel address instead.

### OAuth callbacks

Register these local callback URLs with the providers you use:

```text
Twitch: http://127.0.0.1:3000/api/auth/callback/twitch
Kick:   http://127.0.0.1:3000/api/auth/oauth2/callback/kick
```

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

For normal portal/API work, use two terminals:

| Process | Command | Address |
| --- | --- | --- |
| API | `bun run dev:server` | `http://127.0.0.1:3000` |
| Portal | `bun run dev:web` | `http://127.0.0.1:3001` |
| Documentation | `bun run --cwd apps/fumadocs dev` | `http://localhost:4000` |
| Expo dev server | `bun run --cwd apps/native dev` | shown by Expo |

`bun run dev` starts every workspace development task through Turborepo,
including the API, portal, Expo, and documentation site. Use it only when you
actually want the entire workspace running.

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
| Shared UI primitives | `packages/ui/src` |
| Native screens and device behavior | `apps/native/src` |
| Native SRT bridge | `apps/native/modules/visp-srt` |
| OBS remote control | `apps/obs-plugin` |
| Operator/broadcaster docs | `apps/fumadocs/content/docs` |

Environment variables are validated centrally in `packages/env`; add new
variables there and to the relevant `.env.example` in the same change. Keep
secrets out of logs and extend the redaction list in `apps/server/src/app.ts`
when introducing a new credential-shaped field.

## Troubleshooting

- **The server exits during import:** a required value in `apps/server/.env` is
  blank or invalid. The error names the rejected variable.
- **The portal cannot authenticate:** confirm the API is on port 3000,
  `VITE_SERVER_URL` matches it, and `CORS_ORIGIN` is the exact portal origin.
- **A phone cannot connect:** `localhost` and `127.0.0.1` refer to the phone.
  Use an address reachable from the phone and allow the API port through the
  host firewall.
- **RTT or relay actions fail:** the example relay URLs are placeholders. Point
  them at a running MediaMTX/Caddy relay or ignore those features during UI-only
  work.
- **Integration tests cannot bind port 55432:** stop the process already using
  that port, then rerun the suite.
