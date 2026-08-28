# Releasing VISP

## Relay bonding updates

Changes under `deploy/relay/visp-bond` are deployed manually because the
application release job does not restart media services. Build and install the
gateway as described in [`README.md`](README.md), then run:

```bash
sudo systemctl daemon-reload
sudo systemctl restart visp-bond
sudo systemctl status --no-pager visp-bond
```

Restarting the gateway disconnects bonded publishers. Ordinary publishers on
UDP 8890 continue through MediaMTX. Roll back by reinstalling the previous
`visp-bond` binary and restarting only this unit.

`srtla_rec` is deployed the same way and on the same terms:

```bash
sudo systemctl daemon-reload
sudo systemctl restart srtla-rec
sudo systemctl status --no-pager srtla-rec
```

It must be running on every relay before a release that shows SRTLA URLs goes
out, because the portal offers `srtla://<relay>:5000` for every path. Restarting
it disconnects SRTLA publishers only.

Stable GitHub Releases are the production deployment interface. Publishing a
non-draft, non-prerelease tag named `vX.Y.Z` runs `.github/workflows/release.yml`
against that exact tagged commit. It deploys the API, portal, admin console,
native web app, OBS Remote web app, and documentation; and attaches the OBS
packages to the same GitHub Release. Mobile builds and store submissions run
separately: `.github/workflows/mobile.yml` builds and submits whichever of the
two mobile apps changed on every push to `main` touching `apps/native` or
`apps/obs-remote`. The commented release job remains available for
tag-driven mobile submissions.

## One-time app-server setup

The repository must be owned by `root` and already cloned at `/opt/visp` from
`PohinaGroup/visp`. Install the stable root-owned release bootstrap:

```bash
sudo install -m 0755 deploy/visp-release-bootstrap /usr/local/sbin/visp-release
```

The bootstrap checks out the requested release, installs that release's helper
under `/usr/local/libexec`, and executes it. Helper fixes therefore take effect
in the same release run without reinstalling the bootstrap.

Create these root-owned, mode `0600` files:

- `/etc/visp/app.env`, including
  `NATIVE_WEB_ORIGIN=https://stream.visp-stream.com`,
  `OBS_REMOTE_WEB_ORIGIN=https://remote.visp-stream.com`,
  `ADMIN_ORIGIN=https://admin.visp-stream.com`, and comma-separated
  `ADMIN_USER_IDS`.
- `/etc/visp/web.env`, containing the portal's build-time `VITE_*` values.
- `/etc/visp/native-web.env`, containing
  `EXPO_PUBLIC_SERVER_URL=https://APP_DOMAIN` and
  `EXPO_PUBLIC_RELAY_WEBRTC_URL=https://RELAY_DOMAIN`.
- `/etc/visp/obs-remote-web.env`, containing
  `EXPO_PUBLIC_SERVER_URL=https://APP_DOMAIN`.
- `/etc/visp/caddy.env`, containing `APP_DOMAIN`,
  `ADMIN_DOMAIN=admin.visp-stream.com`,
  `NATIVE_WEB_DOMAIN=stream.visp-stream.com`,
  `OBS_REMOTE_WEB_DOMAIN=remote.visp-stream.com`,
  `DOCS_DOMAIN=docs.visp-stream.com`, and the existing relay values.

Install the app Caddyfile and ensure the two systemd services already exist:

```bash
sudo install -m 0644 deploy/app/Caddyfile /etc/caddy/Caddyfile
sudo systemctl enable --now visp-server visp-web caddy
```

The admin app, native web app, OBS Remote web app, and Fumadocs are static
files. They do not have systemd services. Caddy serves
`/opt/visp/apps/admin/dist`, `/opt/visp/apps/native/dist`, and
`/opt/visp/apps/obs-remote/dist` with an `index.html` SPA fallback and
`/opt/visp/apps/fumadocs/.output/public` with `_shell.html` as its fallback.

Use `root` as the SSH deployment account; no separate deployment account or
sudoers rule is needed. Restrict root to key authentication over Tailscale and
restrict the ephemeral `tag:ci` identity to SSH on the app server only.

## GitHub production environment

Configure these environment variables:

- `DEPLOY_HOST`: app server Tailscale hostname or address.
- `DEPLOY_USER`: `root`.
- `APP_URL`: public portal origin, including `https://`.
- `ADMIN_URL`: `https://admin.visp-stream.com`.
- `RELAY_WEBRTC_URL`: public relay WebRTC origin.
- `NATIVE_WEB_URL`: `https://stream.visp-stream.com`.
- `OBS_REMOTE_WEB_URL`: `https://remote.visp-stream.com`.
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

Create DNS records for `admin.visp-stream.com`, `stream.visp-stream.com`,
`remote.visp-stream.com`, and `docs.visp-stream.com` before the first release so
Caddy can obtain their certificates.

## Publish a release

Before tagging, set the same `X.Y.Z` in:

- `apps/native/app.json`
- `apps/native/package.json`
- every `MARKETING_VERSION` entry in the committed iOS project
- `apps/obs-plugin/buildspec.json`
- `apps/obs-remote/app.json`
- `apps/obs-remote/package.json`

Create `vX.Y.Z` from a commit on `main`, then publish its GitHub Release. Draft
and prerelease publications are ignored. The workflow serializes releases and
first runs the repository tests, type checks, and all production builds.

The app-server bootstrap verifies the tag and 40-character commit SHA, locks the
host, refuses tracked changes, checks out the exact release, and executes that
release's helper. The helper installs frozen dependencies, migrates the database,
and builds all six app-server artifacts
before restarting either service. It validates Caddy before installing its
configuration, then restarts `visp-server` and `visp-web`, reloads Caddy, and
runs local smoke checks. Install, migration, or build failures therefore leave
the currently running services untouched. Database rollback remains manual and
migrations must stay backward-compatible.

## First-release acceptance

Confirm the portal and API are healthy. At `admin.visp-stream.com`, verify the
main login is reused, an admin can open the console, and an ordinary user is
denied. Then test a deep native-web route at `stream.visp-stream.com`, OAuth
return to that origin, and WebRTC through the configured relay. At
`remote.visp-stream.com`, confirm OBS Remote signs in with the same VISP
account and receives live OBS state. At `docs.visp-stream.com`, check `/docs`,
`/api/search`, `/llms.txt`, and `/llms-full.txt`.

In Expo, confirm Android reached Google Play production and iOS reached the
`VISP Internal` TestFlight group only when the EAS release job is enabled. In
the GitHub Release, confirm Windows, macOS, and Ubuntu OBS packages are present,
the macOS package is notarized, and every package matches `SHA256SUMS.txt`.

OBS Remote native store distribution, store promotion, OBS installation, OTA
updates, automatic database rollback, and relay-server restarts are outside this
release workflow.
