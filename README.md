# VISP

VISP is a self-hosted SRT/SRTLA/RTMP relay and control plane for remote live
streaming. Broadcasters sign in with Twitch, Kick, or Google, create independently
revocable publishing devices, and send one H.264/AAC feed to MediaMTX. Direct
then distribution-encodes that feed to Twitch, Kick, or YouTube — one FFmpeg
forwarder per destination, against a per-relay encoder cap. OBS can optionally
read the original contribution feed for monitoring, recording, and scenes.

## Architecture

| Component | Responsibility |
| --- | --- |
| Relay host | MediaMTX ingest/read, `srtla_rec` SRTLA ingest (UDP 5000), `visp-bond` SRT-group gateway (UDP 8891), Direct FFmpeg forwarders and BRB card, Caddy RTT probe, stream snapshots, Tailscale-only Control API |
| App host | PostgreSQL, Elysia/tRPC API, Better Auth, portal, admin console, provider integrations |
| Native app | iOS/Android camera publishing, chat, stream metadata, OBS controls |
| OBS Remote | Dedicated iOS/Android/web scene and stream control surface |
| OBS plugin | Authenticated outbound WSS for pushed commands and state; opens no inbound port |

Publish URLs are encrypted for authenticated re-reveal and also stored as
Argon2id hashes for relay authentication. Read credentials are one-time rotation
results. The app is required when a new media connection is authenticated, but
an established stream survives an app outage. Direct never returns a platform
stream key to a publishing device; keys are resolved server-side while output
runs. The chat bot also runs on the app host — the relay reports source state
through hooks and the app host posts the messages, so alerts work with the
broadcaster's computer off.

## Quick start

Requirements: Bun 1.3.14+, Node.js 24+, Docker with Compose, and provider
credentials for any OAuth flow you want to use.

```bash
bun install
bun run dev:local
```

The launcher creates missing env files, generates local secrets, validates all
values, starts PostgreSQL 18, MinIO, MediaMTX, and Caddy through Compose, applies
migrations, and starts the API, portal, admin console, OBS Remote web app, and
docs. Missing Twitch, Kick, or Google credentials are reported without preventing
unrelated local work.

Open the portal at <https://visp.localhost>, the API at
<https://api.visp.localhost>, admin console at
<https://admin.visp.localhost>, docs at <https://docs.visp.localhost>, and
OBS Remote at <http://localhost:8083>. MinIO is available at
<https://minio.visp.localhost>.
Stop the application with Ctrl+C; infrastructure stays available for quick
restarts. Run `bun run dev:local:down` to stop it. See
[DEVELOPMENT.md](DEVELOPMENT.md) for environment variables, native development,
migrations, tests, and troubleshooting.

## Project layout

```text
apps/server       Elysia API, machine endpoints, hooks, and reconciliation
apps/web          TanStack Start portal
apps/admin        Internal support console
apps/native       Expo development-build client and native SRT module
apps/obs-remote   Dedicated Expo OBS control surface
apps/obs-plugin   OBS Studio remote-control plugin
apps/fumadocs     Broadcaster and operator documentation site
packages/api      Relay, chat, snapshots, OBS, and tRPC domain logic
packages/auth     Better Auth and Twitch/Kick/Google OAuth configuration
packages/db       Drizzle schema and forward migrations
packages/env      Validated server and browser environments
packages/ui       Shared UI components
deploy            MediaMTX, Caddy, systemd, and multi-relay deployment templates
```

## Verification

```bash
bun test
bun run test:integration
bun run check-types
bun run build
bun run test:e2e
```

Browser smoke tests require the local stack (`bun run dev:local`) and a one-time
Playwright browser install (`bun run test:e2e:install`). See
[DEVELOPMENT.md](DEVELOPMENT.md) for details.

The integration suite starts a disposable PostgreSQL container on port 55432
and removes it when the run finishes. OBS plugin builds and tests are documented
in [apps/obs-plugin/README.md](apps/obs-plugin/README.md).

## Operations and user documentation

- [Development guide](DEVELOPMENT.md)
- [Self-hosting](apps/fumadocs/content/docs/self-hosting.mdx) ([deploy templates](deploy/README.md))
- [Production updates](deploy/UPDATE.md)
- [Broadcaster and operator docs](apps/fumadocs/content/docs)

## Scope

VISP does not host OBS or bill users. It assigns paths across capacity-managed
MediaMTX relays. One publisher owns a path at a time; the first connection
remains active and later publishers are rejected.

Direct is the default Twitch/Kick/YouTube output. It distribution-encodes on the relay
and resolves the provider destination with OAuth consent. Keys are held only
while the forwarding process runs, are never returned to client apps, and are
never stored as separate database values. YouTube broadcasts are public,
created automatically, and use auto-start/auto-stop. The optional relay-to-OBS path never
transcodes and OBS reads the contribution feed, not the platform encode.

## License

VISP is licensed under [GPL-2.0](LICENSE). Third-party components retain their
own copyright and license notices.
