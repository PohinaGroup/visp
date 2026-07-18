# Two-box deployment

This guide is for production operators. For local development, use
[`DEVELOPMENT.md`](../DEVELOPMENT.md).

This directory contains templates, not host-specific secrets. Keep `/etc/visp/*.env`
root-readable (`chmod 600`) and replace every example domain, IP, and Tailscale
address before enabling a service.

## 1. Prove the relay with static credentials

Install MediaMTX **v1.19.2**. For Linux amd64, the pinned archive SHA-256 is:

```text
f9c601cc303ceca8fad2883917b022882672c5bc56311e92dbceb16e5f20c60c  mediamtx_v1.19.2_linux_amd64.tar.gz
```

Download both the archive and `checksums.sha256` from the official v1.19.2
release, then run:

```bash
grep 'mediamtx_v1.19.2_linux_amd64.tar.gz' checksums.sha256 | sha256sum --check
sudo install -m 0755 mediamtx /usr/local/bin/mediamtx
```

Start with `relay/mediamtx.static-auth.yml`, replace both bootstrap passwords,
and verify one real SRT publisher and reader against `bootstrap`. Confirm that
disconnecting either side behaves as expected. Only then install
`relay/mediamtx.yml` and enable HTTP authentication.

## 2. Relay box

1. Install Tailscale, Caddy, `curl`, `ffmpeg`, and the pinned MediaMTX binary.
2. Install the snapshot hook and final config:

   ```bash
   sudo install -D -m 0755 deploy/relay/visp-snapshot \
     /usr/local/libexec/visp-snapshot
   sudo install -D -m 0644 deploy/relay/mediamtx.yml \
     /etc/mediamtx/mediamtx.yml
   ```

   RTSP binds only to `127.0.0.1`; do not expose TCP 8554.
3. Put the relay secret and deployment-specific addresses in
   `/etc/visp/relay.env`:

   ```text
   HOOK_SECRET=replace-with-a-random-secret
   APP_ORIGIN=https://app.example.com
   MTX_AUTHHTTPADDRESS=https://app.example.com/api/mediamtx/auth
   MTX_APIADDRESS=100.64.0.10:9997
   ```

   Replace the example origin and Tailscale address. MediaMTX maps the
   `MTX_*` variables to the matching YAML settings.
4. Install `systemd/mediamtx.service`. Use Caddy's packaged systemd unit with
   `relay/Caddyfile`; install `systemd/caddy-relay.conf` as the packaged unit's
   `caddy.service.d/visp.conf` drop-in and set `RELAY_DOMAIN` and `APP_DOMAIN` in
   `/etc/visp/caddy.env`.
5. Permit public UDP 8890, TCP 1935, and TCP 443. Permit TCP 9997 and SSH only on
   the Tailscale interface. Mirror the same rules in the UpCloud firewall.
6. In Tailscale ACLs, allow only the app box to reach relay TCP 9997.

The Control API deliberately excludes only the `api` action from HTTP auth. It
is still protected by its Tailscale bind, ACL, and host firewall. Metrics and
pprof stay disabled.

## 3. App box

1. Install PostgreSQL, Bun, Tailscale, and Caddy; create the unprivileged `visp`
   account and deploy the monorepo to `/opt/visp`.
2. Fill `/etc/visp/app.env` from `apps/server/.env.example`, including the
   Twitch and Kick application credentials and snapshot bucket settings. Use
   the relay's Tailscale address for `MEDIAMTX_API_URL`, generate
   `PUBLISH_URL_ENCRYPTION_KEY` with `openssl rand -base64 32`, back it up with
   the other application secrets, and run `bun run db:migrate`.
3. Fill `/etc/visp/web.env` from `apps/web/.env.example`; build with those public
   values available to Vite.
4. Install and enable `visp-server.service` and `visp-web.service`. Use Caddy's
   packaged unit with `app/Caddyfile`; install `systemd/caddy-app.conf` as its
   `caddy.service.d/visp.conf` drop-in and set `APP_DOMAIN` and
   `RELAY_PUBLIC_IP` in `/etc/visp/caddy.env`.
5. Register `https://APP_DOMAIN/api/auth/callback/twitch` in the Twitch developer
   console. In the Kick developer dashboard, register
   `https://APP_DOMAIN/api/auth/oauth2/callback/kick` as the OAuth redirect URL
   and `https://APP_DOMAIN/api/webhooks/kick` as the webhook URL. The Kick app
   needs the `user:read` scope; chat delivery uses the server's app token and
   `chat.message.sent` webhook subscriptions. Expose only public TCP 443; allow
   SSH only over Tailscale. Mirror the rules in UpCloud.

Do not put the MediaMTX auth or hook routes behind a CDN or WAF. Caddy accepts
them only from the relay's direct public IP, and the hook endpoints additionally
require the shared secret. The public Kick webhook is a separate route protected
by Kick's RSA signature, timestamp window, and replay detection. Caddy proxies
the native chat WebSocket directly to the API; no special WebSocket directive is
needed.

## 4. Configure snapshot storage

Use a private UpCloud Managed Object Storage bucket with its public HTTPS S3
endpoint. The app credential needs GET, HEAD, PUT, and DELETE access only to the
`snapshots/` prefix. Keep bucket versioning disabled so overwrites do not retain
history.

Configure this lifecycle rule through the UpCloud control panel or a compatible
S3 client so stopped paths disappear from storage after one day:

```json
{
  "Rules": [
    {
      "ID": "ExpireVispSnapshots",
      "Status": "Enabled",
      "Prefix": "snapshots/",
      "Expiration": { "Days": 1 }
    }
  ]
}
```

If versioning was previously enabled, suspend it and add
`"NoncurrentVersionExpiration": { "NoncurrentDays": 1 }` to the rule. Verify
the rule and keep the bucket private before enabling the relay hook. The relay
receives only 60-second presigned PUT URLs; S3 access keys remain on the app box.

## 5. Install and pair the OBS plugin

Deploy the updated `app/Caddyfile` and apply the database migrations before
pairing OBS. `/api/obs/control` must be publicly reachable over HTTPS: the OBS
plugin calls it from the broadcaster's computer and authenticates with its
pairing token, not the relay IP allowlist.

Build the plugin on the operating system that runs OBS. For a local macOS test:

```bash
cd apps/obs-plugin
cmake --preset macos
cmake --build --preset macos
ctest --test-dir build_macos -C RelWithDebInfo
mkdir -p "$HOME/Library/Application Support/obs-studio/plugins"
cp -R build_macos/RelWithDebInfo/visp-obs.plugin \
  "$HOME/Library/Application Support/obs-studio/plugins/"
```

Windows uses the `windows-x64` preset. After building, stage its OBS directory
with `cmake --install build_x64 --config RelWithDebInfo --prefix dist`, then copy
`dist/visp-obs` to
`C:\ProgramData\obs-studio\plugins\visp-obs`. On Linux, build with the
`ubuntu-x86_64` preset and copy `build_x86_64/visp-obs.so` to
`~/.config/obs-studio/plugins/visp-obs/bin/64bit/`; copy `data/` beside `bin/`.
These are the layouts from the [OBS plugin guide](https://obsproject.com/kb/plugins-guide).

Then pair one OBS installation:

1. Open **OBS remote control** in the VISP web dashboard and generate a token.
2. Start OBS once. Its log reports the exact generated `config.ini` path.
3. Close OBS and put the downloaded values in that file:

   ```ini
   [visp]
   control_url=https://APP_DOMAIN/api/obs/control
   token=the-token-shown-by-visp
   ```

4. Restart OBS. The dashboard should show **Connected** within a few seconds;
   test both start and stop from web or native.

OBS must already have a working streaming service and stream key. The plugin
only invokes OBS's existing start and stop actions. Treat `config.ini` as a
machine credential and rotate the token if it is exposed. Local macOS builds
are ad-hoc signed; sign and notarize release builds before distributing them to
other users.

## 6. Maintenance and acceptance

Restart the API or portal at any time. Restart MediaMTX only in a maintenance
window because it ends active streams. The accepted app-outage behavior is:
existing streams continue, while new publish/read connections fail authentication.

Before production, run the acceptance sequence in `apps/fumadocs/content/docs/index.mdx`:
SRT publish/read, RTMP publish/read, state reconciliation, app-outage behavior,
independent secret rotations, and an OBS scene import.

For snapshot acceptance, start two publishing paths and confirm that each keeps
one `snapshots/{pathId}.jpg` object whose modification time advances every
minute. Confirm the OBS remote-control card refreshes both images, stopping a
path hides its tile, and the lifecycle rule is scoped only to `snapshots/`.
