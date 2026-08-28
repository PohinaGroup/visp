# Staging environment

Staging runs on the same two hosts as production, fully isolated by ports,
databases, secrets, and hostnames. Production is never touched by staging
deploys: staging deploys from `main` (`.github/workflows/staging.yml`), while
production deploys only from `vX.Y.Z` release tags.

| | Production | Staging |
| --- | --- | --- |
| Portal + API | visp-stream.com (:3000/:3001) | staging.visp-stream.com (:3100/:3101) |
| Static sites | admin/stream/remote/docs.visp-stream.com | *.staging.visp-stream.com |
| Relay (MediaMTX) | visp-relay 87.58.146.41 | app box 87.58.145.161, same ports |
| Database | UpCloud `visp` | UpCloud `visp_staging` (same instance) |
| Repo checkout | /opt/visp (tags) | /opt/visp-staging (main) |
| Env files | /etc/visp/*.env | /etc/visp-staging/*.env |
| Release command | `visp-release vX.Y.Z <sha>` | `visp-staging-release` (no args) |
| Native app | VISP, com.pohinagroup.visp | VISP (TEST), com.pohinagroup.visp.test |

Why the staging relay lives on the app box: publish URLs hardcode the shared
MediaMTX ports (8890 SRT, 5000 SRTLA, 1935 RTMP, 8189 WebRTC — see the
`ponytail` note in `packages/api/src/relay.ts`), so a second relay on the
relay box would need per-relay port columns. The app box has every port free,
so staging MediaMTX + `srtla_rec` run there unchanged.

## 1. DNS (Namecheap)

Add these A records for `visp-stream.com`:

| Host | Value |
| --- | --- |
| staging | 87.58.145.161 |
| admin.staging | 87.58.145.161 |
| stream.staging | 87.58.145.161 |
| remote.staging | 87.58.145.161 |
| docs.staging | 87.58.145.161 |
| relay-staging | 87.58.146.41 |

Wait for propagation (`dig +short staging.visp-stream.com`), then confirm
each URL answers with a valid certificate. Caddy retries issuance
automatically once records exist.

## 2. UpCloud: staging snapshot bucket

The staging app temporarily reuses production snapshot credentials (its
object keys use their own UUIDs and the bucket expires snapshots after one
day, so nothing collides). To finish isolation:

1. Create a managed object storage bucket, e.g. `visp-staging-snapshots`,
   in the same region as the production bucket.
2. Create an access key scoped to that bucket only.
3. On the app box, replace the `S3_*` block in `/etc/visp-staging/app.env`
   with the new bucket values and restart `visp-server-staging`.

## 3. UpCloud firewall (87.58.145.161)

The staging relay exposes ingest ports on the app box's public IP. Allow:

- UDP 8890 (SRT publish/read)
- UDP 5000 (SRTLA)
- UDP and TCP 8189 (WebRTC media)
- TCP 1935 (RTMP)

443 (HTTPS) and the Tailscale-only SSH rule already exist. The host `ufw` is
inactive; UpCloud's firewall is the edge.

## 4. OAuth applications

Reuse the production applications; add staging callbacks:

- **Twitch** app: add redirect
  `https://staging.visp-stream.com/api/auth/callback/twitch`.
- **Kick** app: add redirect
  `https://staging.visp-stream.com/api/auth/oauth2/callback/kick`.
  Kick apps accept one webhook URL, which stays pointed at production —
  staging Kick webhooks are not available. Everything else (login, chat via
  API polling) works; create a second Kick application only if you need
  webhook testing in staging.
- **Google Cloud**: add to the existing web client — authorized JavaScript
  origin `https://staging.visp-stream.com`, redirect URI
  `https://staging.visp-stream.com/api/auth/callback/google`. Add the
  staging domains under Branding if the consent screen restricts domains.
- **Google iOS client** for the TEST app: create an **iOS** OAuth client with
  bundle ID `com.pohinagroup.visp.test`. Put its client ID into the EAS
  staging profile (`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in
  `apps/native/eas.json` → `build.staging.env`) — iOS TEST builds cannot
  sign in with Google until this exists.
- **Apple**: in the Apple Developer portal, register App ID
  `com.pohinagroup.visp.test` with **Sign In with Apple** enabled. EAS
  auto-registers the App ID during the first iOS build; verify the
  capability after the first build.

## 5. GitHub `staging` environment

Create environment `staging` (Settings → Environments) with the same secret
and variable names the `production` environment uses:

- Secrets: `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`, `DEPLOY_SSH_KEY`,
  `DEPLOY_KNOWN_HOSTS`.
- Variables: `DEPLOY_HOST` (Tailscale hostname of the app box, e.g.
  `visp-app.tail1c5ca1.ts.net`), `DEPLOY_USER=root`.

Until `DEPLOY_HOST` is set, the deploy job skips cleanly. After that, every
push to `main` deploys staging; `workflow_dispatch` redeploys on demand.

## 6. First admin sign-in (break-glass access)

The staging database starts empty, so `ADMIN_USER_IDS` cannot be copied from
production (user IDs are regenerated).

1. Sign in at <https://staging.visp-stream.com> with your Twitch/Google
   account.
2. On the app box, read the new user ID:
   `set -a; . /etc/visp-staging/app.env; set +a; psql "$DATABASE_URL" -c 'select id, email from app_user join "user" using (id);'`
3. Put that ID in `/etc/visp-staging/app.env` as both `ADMIN_USER_IDS` and
   `VISP_CHAT_BOT_USER_ID`, then `systemctl restart visp-server-staging`.
4. Open <https://admin.staging.visp-stream.com>, confirm access, and set the
   default relay's **public IP** to `87.58.145.161` (it is seeded as
   `pending`).

## 7. Build and install the (TEST) apps

Devices claimed by a staging build are labeled `(TEST)` in the portal device
list (suffix added in `apps/native/src/lib/use-publish-provisioning.ts` from
`EXPO_PUBLIC_VISP_ENV`).

Android (side-by-side APK):

```bash
cd apps/native
eas build --profile staging --platform android
```

iOS (side-by-side; prebuilds in a throwaway git worktree, never touches the
committed `ios/` project):

```bash
cd apps/native
scripts/build-staging.sh ios
```

Both install next to the production apps because the TEST builds use bundle
identifier `com.pohinagroup.visp.test`. First iOS build needs EAS credentials
for the new bundle ID (EAS registers it via App Store Connect automatically).

## 8. End-to-end acceptance

1. Portal: sign in, create a device — name ends in `(TEST)` and the publish
   URL points at `87.58.145.161` / `relay-staging` ports 8890/5000/1935.
2. Native TEST app: claim, start a camera stream, confirm the path goes live
   and the snapshot appears (after step 2's bucket).
3. Actions: start/stop from portal and OBS Remote staging, secret rotation,
   and reconciliation — all only touch staging data.
4. OBS: point a reader at the staging SRT URL; confirm end-to-end latency and
   stop behavior.
5. Confirm production still streams normally on visp-relay.

## Operations

- **Deploy staging**: push to `main` (automatic) or run
  `sudo /usr/local/sbin/visp-staging-release` on the app box.
- **Logs**: `journalctl -u visp-server-staging -u visp-web-staging -f`;
  relay: `journalctl -u mediamtx-staging -u srtla-rec-staging -f`.
- **Shared with production**: host resources, Caddy process (staging vhosts
  live in `/etc/caddy/staging/*.caddy`, imported by the tracked Caddyfile),
  UpCloud DB instance (separate databases), OAuth applications (separate
  callbacks), snapshot bucket (until step 2).
- **Isolated from production**: secrets, database data, relay registration,
  publish URLs, devices, and releases.
- **Deferred**: `visp-bond` staging (bonded-SRT tests) — build the gateway on
  the app box if needed; OBS plugin staging pairing.
