# App and relay deployment

This guide is for production operators. The public docs version lives at
[`apps/fumadocs/content/docs/self-hosting.mdx`](../apps/fumadocs/content/docs/self-hosting.mdx).
For local development, use [`DEVELOPMENT.md`](../DEVELOPMENT.md).

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

1. Install Tailscale, Caddy, `curl`, `ffmpeg`, CMake, a C compiler, mbedTLS
   development headers, and the pinned MediaMTX binary.
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

   Replace the example origin and Tailscale address. Set
   `MTX_WEBRTCADDITIONALHOSTS=relay.example.com` to the relay's public hostname.
   MediaMTX maps the `MTX_*` variables to the matching YAML settings.

	VISP Direct is the default Twitch/Kick output and uses distribution-encode
	knobs from the same file.
   Defaults are `libx264` at 6000 kbps and 30 fps; set them from a measured
   CPU-per-forwarder number on this box, not from a guess:

   ```text
   DIRECT_VIDEO_ENCODER=libx264
   DIRECT_VIDEO_BITRATE_KBPS=6000
   DIRECT_VIDEO_FPS=30
   ```

	The matching per-relay cap is configured in the admin console. The
	bootstrap-only `DIRECT_MAX_FORWARDERS` value initializes the default relay.
	Twitch + Kick on one source counts as two.
	Set this cap from a real simultaneous-encode test. Direct admission reserves
	one slot per destination before the publisher is accepted; a full relay
	rejects the new publish instead of starting without a platform output.

   The bonded SRT gateway accepts these optional limits from the same file:

   ```text
   VISP_BOND_MAX_GROUPS=64
   VISP_BOND_MAX_LINKS=2
   VISP_BOND_IDLE_TIMEOUT_MS=15000
   ```

   **Direct puts platform stream keys in FFmpeg's argv.** FFmpeg has no
   environment or stdin form for an output URL, and `/proc/<pid>/cmdline` is
   world-readable by default. MediaMTX runs as root here, so `hidepid` keeps
   any *non-root* local process from reading the forwarders' command lines.
   Apply it live — running streams are unaffected — and persist it:

   ```bash
   sudo mount -o remount,hidepid=invisible /proc
   findmnt -no OPTIONS /proc   # expect hidepid=invisible

   printf 'proc /proc proc rw,nosuid,nodev,noexec,relatime,hidepid=invisible 0 0\n' \
     | sudo tee -a /etc/fstab
   sudo systemctl daemon-reload
   ```

   Do not add `gid=` unless that group already exists; the remount fails if it
   does not. This is defence in depth: with root as the only account on the
   box it changes little today, but it bounds the blast radius the moment any
   unprivileged service runs here.
4. Build libsrt 1.5.4 with bonding and mbedTLS, then build the gateway:

   ```bash
   cmake -S libsrt-1.5.4 -B libsrt-1.5.4/build \
     -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/usr/local \
     -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
     -DENABLE_APPS=OFF -DENABLE_BONDING=ON -DENABLE_ENCRYPTION=ON \
     -DUSE_ENCLIB=mbedtls
   cmake --build libsrt-1.5.4/build --target install
   sudo ldconfig

   cmake -S deploy/relay/visp-bond -B /tmp/visp-bond-build \
     -DCMAKE_BUILD_TYPE=Release
   cmake --build /tmp/visp-bond-build
   sudo install -m 0755 /tmp/visp-bond-build/visp-bond \
     /usr/local/bin/visp-bond
   ```

   Before enabling phone bonding, prove the group protocol with upstream's
   bench tool:

   ```bash
   srt-live-transmit \
     'srt://:8891?groupconnect=1&mode=listener' \
     'srt://127.0.0.1:8890?streamid=publish:SLUG:HANDLE:SECRET'
   ```

   Install and enable `systemd/mediamtx.service` and
   `systemd/visp-bond.service`. The gateway forwards the original stream ID,
   so MediaMTX HTTP authentication is unchanged. MediaMTX sees bonded
   publishers as `127.0.0.1`; use the gateway's client-address log for the
   real source.

   Use Caddy's packaged systemd unit with
   `relay/Caddyfile`; install `systemd/caddy-relay.conf` as the packaged unit's
   `caddy.service.d/visp.conf` drop-in and set `RELAY_DOMAIN` and `APP_DOMAIN` in
   `/etc/visp/caddy.env`.
5. Permit public UDP 8890, UDP 8891, TCP 1935, TCP 443, and both UDP and TCP
   8189. Permit
   TCP 9997 and SSH only on the Tailscale interface. Mirror the same rules in
   the UpCloud firewall. Port 8189 carries WebRTC media; TCP is the fallback
   when UDP is blocked.
6. In Tailscale ACLs, allow only the app box to reach relay TCP 9997.

The Control API deliberately excludes only the `api` action from HTTP auth. It
is still protected by its Tailscale bind, ACL, and host firewall. Metrics and
pprof stay disabled.

## 3. App box

1. Install PostgreSQL, Bun, Node.js 20+, Tailscale, and Caddy; clone `PohinaGroup/visp` as
   `root` into `/opt/visp`. The API runs under Node (`dist/index.mjs`); the portal
   and release tooling use Bun. Both services run as `root`.
2. Fill `/etc/visp/app.env` from `apps/server/.env.example`, including the
   Twitch, Kick, and Google application credentials and snapshot bucket settings. Use
   the relay's Tailscale address for `MEDIAMTX_API_URL`, generate
   `PUBLISH_URL_ENCRYPTION_KEY` with `openssl rand -base64 32`, back it up with
   the other application secrets, set `ADMIN_ORIGIN=https://admin.visp-stream.com`
   and `ADMIN_USER_IDS` to the comma-separated Better Auth user IDs that need
   break-glass access, set the per-user `MAX_PATHS_PER_USER` cap, and run
   `bun run db:migrate`.
3. Fill `/etc/visp/web.env` from `apps/web/.env.example`; build with those public
   values available to Vite. Put the native web app's public build values in the
   root-owned, mode `0600` file `/etc/visp/native-web.env`:

   ```text
   EXPO_PUBLIC_SERVER_URL=https://app.example.com
   EXPO_PUBLIC_RELAY_WEBRTC_URL=https://relay.example.com
   ```

   Put the OBS Remote web app's public build value in
   `/etc/visp/obs-remote-web.env`:

   ```text
   EXPO_PUBLIC_SERVER_URL=https://app.example.com
   ```
4. Install and enable `visp-server.service` and `visp-web.service`. Use Caddy's
   packaged unit with `app/Caddyfile`; install `systemd/caddy-app.conf` as its
   `caddy.service.d/visp.conf` drop-in and set `APP_DOMAIN`,
   `ADMIN_DOMAIN=admin.visp-stream.com`,
   `NATIVE_WEB_DOMAIN=stream.visp-stream.com`,
   `OBS_REMOTE_WEB_DOMAIN=remote.visp-stream.com`,
   `DOCS_DOMAIN=docs.visp-stream.com`, and `RELAY_PUBLIC_IPS` in
   `/etc/visp/caddy.env`. `RELAY_PUBLIC_IPS` is the space-separated list of
   every relay's public IP. Caddy serves `apps/admin/dist`, `apps/native/dist`,
   `apps/obs-remote/dist`, and `apps/fumadocs/.output/public` directly; these
   static sites need no runtime service. Add
   `NATIVE_WEB_ORIGIN=https://stream.visp-stream.com` and
   `OBS_REMOTE_WEB_ORIGIN=https://remote.visp-stream.com` to
   `/etc/visp/app.env`.
5. Register `https://APP_DOMAIN/api/auth/callback/twitch` in the Twitch developer
   console. In the Kick developer dashboard, register
   `https://APP_DOMAIN/api/auth/oauth2/callback/kick` as the OAuth redirect URL
   and `https://APP_DOMAIN/api/webhooks/kick` as the webhook URL. The Kick app
   needs the `user:read` scope; chat delivery uses the server's app token and
   `chat.message.sent` webhook subscriptions. Expose only public TCP 443; allow
   SSH only over Tailscale. Mirror the rules in UpCloud. Add DNS for
   `admin.visp-stream.com`, `stream.visp-stream.com`,
   `remote.visp-stream.com`, and `docs.visp-stream.com` before Caddy obtains
   their certificates.
6. Install the stable release bootstrap as a root-owned executable:

   ```bash
   sudo install -m 0755 deploy/visp-release-bootstrap /usr/local/sbin/visp-release
   ```

   Configure root key authentication over Tailscale and the GitHub production
   environment described in [`UPDATE.md`](UPDATE.md).

### Google OAuth and YouTube Direct

Create one **Web application** OAuth client in the production Google Cloud
project:

1. Enable **YouTube Data API v3** under **APIs & Services → Library**.
2. Configure **Google Auth Platform → Branding**, choose the production
   **Audience**, and add `openid`, `email`, `profile`, and
   `https://www.googleapis.com/auth/youtube.force-ssl` under **Data Access**.
   An external public app must complete Google's verification for the YouTube
   scope. Keep named accounts under **Test users** until verification is done.
3. Under **Clients**, create a **Web application** client. For a deployment
   whose `APP_DOMAIN` is `visp-stream.com`, enter:

   ```text
   Authorized JavaScript origin:
   https://visp-stream.com

   Authorized redirect URI:
   https://visp-stream.com/api/auth/callback/google
   ```

   For another deployment replace `visp-stream.com` with the exact
   `APP_DOMAIN`. Origins never include a path or trailing callback. Better Auth
   handles OAuth server-side; the origin does not receive Google tokens.
4. Store the generated credentials only in `/etc/visp/app.env`:

   ```text
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   ```

   The web, native, OBS Remote, and admin clients all return through this one
   server callback. Do not create mobile OAuth clients and do not put the
   secret in Vite or Expo environment files.
5. Deploy, load `/etc/visp/app.env` into the shell, and run the token migration
   from `/opt/visp` before restarting `visp-server`:

   ```bash
   set -a
   . /etc/visp/app.env
   set +a
   bun apps/server/scripts/encrypt-oauth-tokens.ts --dry-run
   bun apps/server/scripts/encrypt-oauth-tokens.ts
   systemctl restart visp-server
   ```

   Better Auth encrypts all newly written access and refresh tokens; this one-time command
   encrypts older provider rows. Keep `BETTER_AUTH_SECRET` backed up because it
   is the encryption key.

VISP requests offline access and explicit consent. YouTube Direct creates a
public broadcast for each publishing session, binds it to a reusable managed
stream, and enables automatic start and stop. One enabled destination consumes
one relay forwarder slot; Twitch, Kick, and YouTube together require three free
slots in that relay's configured `maxForwarders`.

Do not put the MediaMTX auth or hook routes behind a CDN or WAF. Caddy accepts
them only from the relays' direct public IPs, and the hook endpoints additionally
require the shared secret. The public Kick webhook is a separate route protected
by Kick's RSA signature, timestamp window, and replay detection. Caddy proxies
the native chat WebSocket directly to the API; no special WebSocket directive is
needed.

## Adding relay N

Provision every additional relay from the same `relay/mediamtx.yml`, Caddyfile,
systemd units, firewall rules, and Tailscale ACLs described above. Give it a
distinct `RELAY_DOMAIN`, public IP, and `MTX_APIADDRESS`/`MTX_WEBRTCADDITIONALHOSTS`
values in `/etc/visp/relay.env`; keep the same `HOOK_SECRET` as the app and other
relays. Add its public IP to the space-separated `RELAY_PUBLIC_IPS` value on the
app host and reload Caddy.

Then register the relay in VISP Admin with its public host, Tailscale-only
Control API URL, `/ping` URL, region, path capacity, Direct forwarder capacity,
and public IP. Draining stops new assignments without moving existing paths;
disabling also removes the relay from reconciliation.

Relays are mutually trusted through the shared hook secret. Add per-relay hook
secrets only if that trust boundary changes.

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
pairing OBS. `/api/obs/*` and `/api/auth/*` must be publicly reachable over
HTTPS, and the proxy must preserve WebSocket upgrades for `/api/obs/live`. The
plugin uses HTTPS for browser pairing, device setup, and a one-use socket ticket,
then authenticated outbound WSS for live control.

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

1. In OBS, open **Tools → VISP Remote Control** and click **Sign in with
   browser**.
2. Sign in to VISP, approve the displayed code, then return to OBS. The plugin
   can now list devices, add Media Sources, and create an OBS publishing
   device.

For legacy recovery, generate a token in the VISP dashboard. Start OBS once so
its log reports the exact generated `config.ini` path, close OBS, and put the
downloaded values in that file:

```ini
[visp]
control_url=https://APP_DOMAIN/api/obs/control
token=the-token-shown-by-visp
```

Restart OBS after a manual import. The dashboard should show **Connected**
within a few seconds; test both start and stop from web or native.
The configured `control_url` remains an HTTPS API base; current plugins derive
`/api/obs/live-ticket` and `/api/obs/live` from it. `POST /api/obs/control`
remains only for older polling clients.

OBS must already have a working streaming service and stream key. The plugin
only invokes OBS's existing start and stop actions. Treat `config.ini` as a
machine credential and rotate the token if it is exposed. Local macOS builds
are ad-hoc signed; sign and notarize release builds before distributing them to
other users.

## 6. Maintenance and acceptance

Normal releases are published as stable `vX.Y.Z` GitHub Releases. The unified
workflow deploys the exact tag to this app box, starts EAS distribution, and
attaches OBS packages. See [`UPDATE.md`](UPDATE.md) for configuration and the
release checklist.

Restart the API or portal at any time. Restart MediaMTX only in a maintenance
window because it ends active streams. The accepted app-outage behavior is:
existing streams continue, while new publish/read connections fail authentication.
Restart `visp-bond` only in a maintenance window because it ends bonded
publishers; ordinary UDP 8890 publishers are unaffected.

Deploy the API auth/CORS change first, then the static sites and Caddy rules.
Verify `admin.visp-stream.com` reuses the main login, permits an admin, and
denies an ordinary user. Apply the MediaMTX WebRTC configuration in a
maintenance window. Test current Chrome or Edge and Safari over HTTPS: OAuth
must return to `https://stream.visp-stream.com/`; camera and microphone
selection must work; Go Live must mark the path live and update its snapshot;
and OBS must continue to read that path over SRT with H.264/Opus. Stop must
release the publisher and media devices. Finally block UDP 8189 at the client
and prove TCP ICE fallback.

Before production, also run the acceptance sequence in
`apps/fumadocs/content/docs/self-hosting.mdx`: SRT publish/read, RTMP
publish/read, state reconciliation, app-outage behavior, independent secret
rotations, and an OBS scene import.

For snapshot acceptance, start two publishing paths and confirm that each keeps
one `snapshots/{pathId}.jpg` object whose modification time advances every
minute. Confirm the OBS remote-control card refreshes both images, stopping a
path hides its tile, and the lifecycle rule is scoped only to `snapshots/`.
