# VISP

VISP is a self-hosted SRT/RTMP relay and control plane for remote live
streaming. Broadcasters sign in with Twitch or Kick, create independently
revocable publishing devices, send one H.264/AAC feed to MediaMTX, and read it
from OBS. The native app can publish directly from a phone, and the OBS plugin
allows authenticated remote start and stop control.

## Architecture

| Component | Responsibility |
| --- | --- |
| Relay host | MediaMTX ingest/read, Caddy RTT probe, stream snapshots, Tailscale-only Control API |
| App host | PostgreSQL, Elysia/tRPC API, Better Auth, TanStack Start portal, provider integrations |
| Native app | iOS/Android camera publishing, chat, stream metadata, OBS controls |
| OBS plugin | Polls the API for authenticated start/stop commands; opens no inbound port |

Publish URLs are encrypted for authenticated re-reveal and also stored as
Argon2id hashes for relay authentication. Read credentials are one-time rotation
results. The app is required when a new media connection is authenticated, but
an established stream survives an app outage.

## Quick start

Requirements: Bun 1.3.14+, PostgreSQL 17+, and provider credentials for any
OAuth flow you want to use.

```bash
bun install
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
```

Fill every blank value in `apps/server/.env`, generate
`PUBLISH_URL_ENCRYPTION_KEY` with `openssl rand -base64 32`, then prepare the
database:

```bash
bun run db:migrate
```

Run the API and portal in separate terminals:

```bash
bun run dev:server
bun run dev:web
```

The API listens on <http://127.0.0.1:3000> and the portal on
<http://127.0.0.1:3001>. See [DEVELOPMENT.md](DEVELOPMENT.md) for PostgreSQL
setup, OAuth callbacks, environment variables, native development, migrations,
tests, and troubleshooting.

## Project layout

```text
apps/server       Elysia API, machine endpoints, hooks, and reconciliation
apps/web          TanStack Start portal
apps/native       Expo development-build client and native SRT module
apps/obs-plugin   OBS Studio remote-control plugin
apps/fumadocs     Broadcaster and operator documentation site
packages/api      Relay, chat, snapshots, OBS, and tRPC domain logic
packages/auth     Better Auth and Twitch/Kick OAuth configuration
packages/db       Drizzle schema and forward migrations
packages/env      Validated server and browser environments
packages/ui       Shared UI components
deploy            MediaMTX, Caddy, systemd, and two-host deployment templates
```

## Verification

```bash
bun test
bun run test:integration
bun run check-types
bun run build
```

The integration suite starts a disposable PostgreSQL container on port 55432
and removes it when the run finishes. OBS plugin builds and tests are documented
in [apps/obs-plugin/README.md](apps/obs-plugin/README.md).

## Operations and user documentation

- [Development guide](DEVELOPMENT.md)
- [Production deployment](deploy/README.md)
- [Production updates](deploy/UPDATE.md)
- [Broadcaster and operator docs](apps/fumadocs/content/docs)

## Scope

VISP does not transcode, handle Twitch or Kick stream keys, host OBS, bill
users, or horizontally scale MediaMTX. One publisher owns a path at a time; the
first connection remains active and later publishers are rejected.

## License

VISP is licensed under [GPL-2.0](LICENSE). Third-party components retain their
own copyright and license notices.
