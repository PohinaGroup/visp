# Releasing VISP

Stable GitHub Releases are the production deployment interface. Publishing a
non-draft, non-prerelease tag named `vX.Y.Z` runs `.github/workflows/release.yml`
against that exact tagged commit. It deploys the API, portal, native web app,
and documentation; starts both EAS store submissions; and attaches the OBS
packages to the same GitHub Release.

## One-time app-server setup

The repository must be owned by `root` and already cloned at `/opt/visp` from
`PohinaGroup/visp`. Install the root-owned release entry point:

```bash
sudo install -m 0755 deploy/visp-release /usr/local/sbin/visp-release
```

Create these root-owned, mode `0600` files:

- `/etc/visp/app.env`, including
  `NATIVE_WEB_ORIGIN=https://stream.visp-stream.com`.
- `/etc/visp/web.env`, containing the portal's build-time `VITE_*` values.
- `/etc/visp/native-web.env`, containing
  `EXPO_PUBLIC_SERVER_URL=https://APP_DOMAIN` and
  `EXPO_PUBLIC_RELAY_WEBRTC_URL=https://RELAY_DOMAIN`.
- `/etc/visp/caddy.env`, containing `APP_DOMAIN`,
  `NATIVE_WEB_DOMAIN=stream.visp-stream.com`,
  `DOCS_DOMAIN=docs.visp-stream.com`, and the existing relay values.

Install the app Caddyfile and ensure the two systemd services already exist:

```bash
sudo install -m 0644 deploy/app/Caddyfile /etc/caddy/Caddyfile
sudo systemctl enable --now visp-server visp-web caddy
```

The native web app and Fumadocs are static files. They do not have systemd
services. Caddy serves `/opt/visp/apps/native/dist` with an `index.html` SPA
fallback and `/opt/visp/apps/fumadocs/.output/public` with `_shell.html` as its
fallback.

Use `root` as the SSH deployment account; no separate deployment account or
sudoers rule is needed. Restrict root to key authentication over Tailscale and
restrict the ephemeral `tag:ci` identity to SSH on the app server only.

## GitHub production environment

Configure these environment variables:

- `DEPLOY_HOST`: app server Tailscale hostname or address.
- `DEPLOY_USER`: `root`.
- `APP_URL`: public portal origin, including `https://`.
- `RELAY_WEBRTC_URL`: public relay WebRTC origin.
- `NATIVE_WEB_URL`: `https://stream.visp-stream.com`.
- `DOCS_URL`: `https://docs.visp-stream.com`.

Configure these environment secrets:

- `TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET` for an ephemeral tagged Tailscale
  identity.
- `DEPLOY_SSH_KEY` and a pinned `DEPLOY_KNOWN_HOSTS` entry.
- `EXPO_TOKEN` for EAS Build and Submit.

Configure the OBS macOS signing secrets at repository level because the OBS
workflow is also reusable:

- `MACOS_SIGNING_APPLICATION_IDENTITY`
- `MACOS_SIGNING_INSTALLER_IDENTITY`
- `MACOS_SIGNING_CERT` (base64-encoded `.p12`)
- `MACOS_SIGNING_CERT_PASSWORD`
- `MACOS_KEYCHAIN_PASSWORD`
- `MACOS_NOTARIZATION_USERNAME`
- `MACOS_NOTARIZATION_PASSWORD`

Create DNS records for `stream.visp-stream.com` and `docs.visp-stream.com` before the
first release so Caddy can obtain their certificates.

## Publish a release

Before tagging, set the same `X.Y.Z` in:

- `apps/native/app.json`
- `apps/native/package.json`
- every `MARKETING_VERSION` entry in the committed iOS project
- `apps/obs-plugin/buildspec.json`

Create `vX.Y.Z` from a commit on `main`, then publish its GitHub Release. Draft
and prerelease publications are ignored. The workflow serializes releases and
first runs the repository tests, type checks, and all production builds.

The app-server helper verifies the tag and 40-character commit SHA, locks the
host, refuses tracked changes, checks out the exact release, installs frozen
dependencies, migrates the database, and builds all four app-server artifacts
before restarting either service. It validates Caddy before installing its
configuration, then restarts `visp-server` and `visp-web`, reloads Caddy, and
runs local smoke checks. Install, migration, or build failures therefore leave
the currently running services untouched. Database rollback remains manual and
migrations must stay backward-compatible.

## First-release acceptance

Confirm the portal and API are healthy, then test a deep native-web route at
`stream.visp-stream.com`, OAuth return to that origin, and WebRTC through the
configured relay. At `docs.visp-stream.com`, check `/docs`, `/api/search`,
`/llms.txt`, and `/llms-full.txt`.

In Expo, confirm Android reached Play internal testing and iOS reached the
`VISP Internal` TestFlight group. In the GitHub Release, confirm Windows,
macOS, and Ubuntu OBS packages are present, the macOS package is notarized, and
every package matches `SHA256SUMS.txt`.

Store promotion to public production, OBS installation, OTA updates, automatic
database rollback, and relay-server restarts are intentionally outside this
release workflow.
