# Add a relay region and move existing devices

Use this runbook to add relays in new regions next to Finland, for example
**US East** and one Asia relay (**Singapore** or **Tokyo**, chosen from user
measurements). Repeat it once per region. The app, database, and admin stay in
Finland. Each new relay handles ingest, Direct encoding, OBS reads, Cloud Studio
composition, and browser media locally. No database migration is required for
regional selection.

The examples use three relays:

| Relay name | Region (Admin) | Public host |
| --- | --- | --- |
| `default` | `Finland` | `relay.visp-stream.com` |
| `us-east-1` | `US East` | `relay-us.visp-stream.com` |
| `sg-1` or `tyo-1` | `Singapore` or `Tokyo` | `relay-sg.visp-stream.com` / `relay-tyo.visp-stream.com` |

## How new devices pick a relay

Understand this before enabling a far-away relay, because enabling makes it a
candidate for new assignments immediately.

1. **Measured preference.** Before creating a device, the phone app, browser
   publisher, portal (**Add device**, setup wizard, advanced setup) probe every
   enabled, undrained relay's `/ping` URL and send the fastest relay's ID. The
   native app also re-assigns its unused first path to the measured relay when
   it links. **Settings > Advanced > Relay region > Find best relay** and the
   portal's **Move to …** use the same probe for existing devices.
2. **Relays the user already owns.** Keeps a person's devices together so
   Direct handover works.
3. **Same region.** The home region is the measured relay's region, else the
   region most of the user's devices use, else `DEFAULT_RELAY_REGION` in
   `app.env`, else the `default` relay's region. Region names compare
   case-insensitively, so `us-east` and `US East` are different regions but
   `US East` and `us east` are not; use one spelling per region.
4. **The `default` relay**, then **any other relay**.

Ties go to the least-loaded relay (fewest active paths). Disabled, drained, and
full relays (`capacity_paths` reached) are never candidates. A user with an
active Direct session, BRB, or reservation can only receive paths on that
session's relay.

The account's first path is created on its first portal or app request,
before any client can measure, so it uses steps 2–4: a new account without a
measurement lands in the default region rather than on the emptiest relay
worldwide. Its first linked device then moves that unused path to the measured
relay. There is no edge GeoIP signal: the app's Caddy does not add a country
header, and none is needed for this.

Before adding the first extra region:

- In Admin, set the `default` relay's **Region** to `Finland`. Keep its
  **Name** `default`; renaming it creates a new default row on the next app
  start. The app's startup bootstrap does not overwrite the region.
- Optionally set `DEFAULT_RELAY_REGION=Finland` in `/etc/visp/app.env` and
  restart the API. Leave it unset to follow the `default` relay's region.

Portal and app pickers translate common codes (`us-east-1`, `sin`, `ap-northeast-1`,
`fi`) to "US East", "Singapore", "Tokyo", and "Finland", and show any other
display name as typed. Prefer typing the display name in Admin.

## 1. Measure and choose the location

Measure a few users in the target region before choosing the location. Record
streaming RTT, packet loss, disconnects, and video delay from the devices and
networks they actually stream from. For the US, compare East and West users;
for Asia, compare Singapore and Tokyo against where your Asian users are
(Southeast Asia/Australia favours Singapore; Japan/Korea/Taiwan favours Tokyo).
Reuse the same devices and networks for the post-rollout comparison in step 12.

## 2. Size the server

Provision a Linux x86_64 server. Match the existing relay's OS and prerequisites
from [Relay box](README.md#2-relay-box). Use a dedicated relay hostname and
point its DNS A record directly at the server. Add AAAA only if IPv6 works.
Keep the media hostname outside an HTTP CDN proxy.

**CPU.** Direct runs a full `libx264` distribution encode per live device
(outputs with matching settings share one encode). As a starting estimate,
budget about **two dedicated vCPUs per concurrent 1080p30 6000 kbps `veryfast`
encode**, plus one vCPU for MediaMTX, SRTLA, snapshots, and the OS. Each Cloud
Studio compositor worker is capped at three cores and 2 GiB on top of that. Do
not trust the estimate: run simultaneous encodes on the actual box, watch for
dropped frames and CPU steal, and set **Max forwarders** in Admin to the number
that held. Avoid shared-vCPU plans for encode capacity.

**Bandwidth.** Each live device uses its ingest bitrate inbound, plus the
Direct output bitrate once per destination, plus every OBS reader and preview
outbound. A 6000 kbps output is about 2.7 GB per hour per destination.

**Egress cost (Asia).** Bandwidth in Singapore and Tokyo is usually far more
expensive than in Finland or the US: smaller included traffic and higher
per-TB overage at most providers. Estimate monthly traffic from expected
streaming hours × outputs × bitrate before ordering, and set a provider billing
alert. Keep path capacity on the Asia relay conservative at first.

## 3. Network and firewall

Join the server to Tailscale. Allow the app host to reach its TCP 9997 Control
API. Allow the CI identity to reach SSH, with the same restrictions as Finland.
Open public UDP 5000, 8890, and 8891; TCP 1935 and 443; and TCP/UDP 8189.
Match the host firewall and cloud firewall. Keep 8554 on loopback and 9997 on
Tailscale. Allow the certificate challenge method used by the existing Caddy
installation, including TCP 80 if using HTTP challenges.

## 4. Relay configuration

Clone the repository into `/opt/visp` on the new host and check out the current
release. Configure the existing release SSH user and verified host key as
described in [UPDATE.md](UPDATE.md). Install the bootstrap:

```sh
cd /opt/visp
sudo install -D -m 0755 deploy/visp-relay-release-bootstrap /usr/local/sbin/visp-relay-release
sudo install -d -m 0700 /etc/visp
sudoedit /etc/visp/relay.env
```

Set these values using the new server's addresses and the existing production
app's secrets. Copy secrets securely from the current configuration; do not
generate different values for additional relays.

```dotenv
APP_ORIGIN=https://visp-stream.com
RELAY_NAME=us-east-1
HOOK_SECRET=<same value as the app and Finland relay>
STUDIO_MEDIA_PASSWORD=<same value as the app and Finland relay>
MTX_AUTHHTTPADDRESS=https://visp-stream.com/api/mediamtx/auth
MTX_APIADDRESS=<RELAY_TAILSCALE_IP>:9997
MTX_WEBRTCADDITIONALHOSTS=relay-us.visp-stream.com
MTX_WEBRTCALLOWORIGINS=https://visp-stream.com,https://stream.visp-stream.com
DIRECT_VIDEO_ENCODER=libx264
DIRECT_VIDEO_BITRATE_KBPS=6000
DIRECT_VIDEO_FPS=30
```

`RELAY_NAME` must equal the relay name registered in step 9, or Admin shows no
host metrics. Preserve any additional Direct/BRB settings your Finland relay
requires.

**Cloud Studio compositor (manual, per relay).** If Cloud Studio is enabled,
install the compositor worker, its hardened systemd template, and its egress
firewall on this host from [compositor/README.md](compositor/README.md), then
set `STUDIO_COMPOSITOR_UNIT=visp-compositor@` in `relay.env`. The relay release
helper does not build, install, or update the compositor. Install the same
compositor version on **every** relay whenever its code changes; with three
relays that is three manual installs.

## 5. Relay Caddy and media components

Create `/etc/visp/caddy.env` on the new host:

```dotenv
RELAY_DOMAIN=relay-us.visp-stream.com
APP_DOMAIN=visp-stream.com
```

Install the initial Caddy configuration before the first release-helper run:

```sh
sudo chmod 600 /etc/visp/relay.env /etc/visp/caddy.env
sudo install -d /etc/caddy/staging
sudo touch /etc/caddy/staging/.empty.caddy
sudo install -m 0644 deploy/relay/Caddyfile /etc/caddy/Caddyfile
sudo install -D -m 0644 deploy/systemd/caddy-relay.conf /etc/systemd/system/caddy.service.d/visp.conf
sudo systemctl daemon-reload
sudo systemctl enable --now caddy
```

Follow the `/proc` credential protection step in [README.md](README.md#2-relay-box)
on this host too. Install the media components from the checked-out release:

```sh
sudo bash deploy/visp-relay-release production mediamtx srtla-rec visp-bond caddy
sudo systemctl enable mediamtx srtla-rec visp-bond
```

## 6. Allow the relay's callbacks on the app host

MediaMTX authentication and path hooks come from each relay's outbound public
IP. On the app host, set `RELAY_PUBLIC_IPS` in `/etc/visp/caddy.env` to the
space-separated list of **all** relays, for example with three hosts:

```dotenv
RELAY_PUBLIC_IPS=<FINLAND_PUBLIC_IP> <US_EAST_PUBLIC_IP> <ASIA_PUBLIC_IP>
```

If relay callbacks use IPv6, include those outbound addresses too. Restart
Caddy to load the changed systemd environment:

```sh
sudo systemctl restart caddy
```

Leave `RELAY_HOST`, `MEDIAMTX_API_URL`, and `RELAY_PING_URL` in `app.env`
pointing to Finland. They initialize the existing `default` relay. Its
forwarder cap is still supplied by `DIRECT_MAX_FORWARDERS` at app startup.

## 7. Release targets

In GitHub, open **Settings > Environments > production**. Set the variable
`RELAY_DEPLOY_TARGETS` with every relay's SSH host and public HTTPS origin:

```json
[
  {"host":"<FINLAND_TAILSCALE_HOST_OR_IP>","url":"https://relay.visp-stream.com"},
  {"host":"<US_EAST_TAILSCALE_HOST_OR_IP>","url":"https://relay-us.visp-stream.com"},
  {"host":"<ASIA_TAILSCALE_HOST_OR_IP>","url":"https://relay-sg.visp-stream.com"}
]
```

Replace every placeholder. Keep `DEPLOY_USER` and `DEPLOY_SSH_KEY` valid on all
hosts. Append each new host's verified SSH host key to `DEPLOY_KNOWN_HOSTS`.
This variable replaces the single relay target list, so always include Finland.
Without it, releases use `RELAY_DEPLOY_HOST` and `RELAY_WEBRTC_URL`. Changed
relay components deploy sequentially to each target; a failed host does not
cancel the others.

## 8. Release the clients

Release the app, portal, and browser broadcaster with the normal production
release workflow; the region-aware assignment and relay probes ship with them.
Existing media component updates restart relay services, so schedule them
outside active broadcasts. The relay helper refuses to restart while a relay
has live paths, forwarders or BRB holds unless it is given `--force`.

Check **Actions > Mobile > Build and submit VISP** after merging to `main`.
That workflow detects `apps/native` changes and submits Android to Google Play
production and iOS to App Store Connect. It requires the production
`EXPO_TOKEN` secret and configured EAS/store credentials. If it did not run, use
**Actions > Mobile > Run workflow**. Finish iOS App Store review/release in App
Store Connect, or distribute through TestFlight for pilots. Publishing a GitHub
release alone does not update installed phone apps; older apps still probe and
send a preference when linking.

## 9. Register the relay (disabled)

In VISP Admin, create the relay:

```text
Name: us-east-1
Region: US East            (or Singapore / Tokyo — one spelling per region)
Public host: relay-us.visp-stream.com
Public IP: <RELAY_PUBLIC_IP>
Control API URL: http://<RELAY_TAILSCALE_IP>:9997
Ping URL: https://relay-us.visp-stream.com/ping
Path capacity: <your chosen device limit>
Max forwarders: <your tested simultaneous encode limit>
```

New records start disabled. Leave the relay disabled until step 10 passes. The
public IP field does not update the app's Caddy allowlist (step 6 does).

## 10. Verify, then enable

From the app host:

```sh
curl --fail --max-time 5 http://<RELAY_TAILSCALE_IP>:9997/v3/paths/list
curl --fail --max-time 5 -I https://relay-us.visp-stream.com/ping
curl --fail --max-time 5 -I -H 'Origin: https://stream.visp-stream.com' https://relay-us.visp-stream.com/ping
```

Expect valid API JSON and HTTP 204 with `Access-Control-Allow-Origin: *` for
the public probe.

**Control API reachability.** The MediaMTX Control API on TCP 9997 has no
authentication of its own: anyone who reaches it can add, change and delete
paths, kick publishers and read every path's configuration. Its only
protection is the Tailscale bind, the Tailscale ACL and the host firewall, so
confirm the ACL before enabling the relay:

1. In the Tailscale ACL policy, the only rule granting `<RELAY>:9997` names the
   app host (its tag or address). No `*`, `autogroup:member`, `tag:ci` or
   other relay may match it. Use the admin console's **Preview rules** for the
   relay to list every source allowed on 9997.
2. From a tailnet device that is **not** the app host (for example a laptop or
   the CI tag), this must time out or be refused:

   ```sh
   curl --max-time 5 http://<RELAY_TAILSCALE_IP>:9997/v3/paths/list
   ```

3. From the app host the same command must succeed (the first command above).
4. On the relay, `ss -ltn 'sport = :9997'` shows a listener on the Tailscale
   address only, never `0.0.0.0` or the public interface.

Repeat steps 1 and 2 whenever the ACL policy changes. Enable the relay, then publish with a pilot account in that
region. Check SRT, bonded SRT/SRTLA where used, browser publishing, OBS reads,
authenticated previews, Direct output, Cloud Studio (if enabled), and BRB
recovery. Verify the new host carries the media and runs its own encoders.

**Authentication round trip.** The app still runs in Finland. MediaMTX calls
`/api/mediamtx/auth` there before every **new** publish or read connection, and
path hooks report there. Expect roughly **+100 ms per new connection from US
East and +250 ms from Singapore or Tokyo**, plus slower portal and app API
requests. Established streams are unaffected: media never leaves the regional
relay after the connection is authorized. Reconnect storms (for example
cellular bonding flapping) feel the delay most.

## 11. Move existing devices while offline

Stop all sources, close OBS readers and previews, and end Direct/BRB outputs.
Wait at least one minute after the last publisher connection. In the updated
phone or browser app, open **Settings > Advanced > Relay region > Find best
relay** and confirm the move. Alternatively, expand the device in the portal
and choose **Move to …**. The native action measures from the actual publishing
device; a remote portal browser measures its own network.

Update external publisher and OBS receiving URLs after each move. A portal move
also requires refreshing the destination in the VISP app. The app's **Find best
relay** action refreshes its saved URL even when the region already matches.
Device IDs, native installation IDs, output settings, and device history remain
attached. Old stream addresses stop working. Move every device used for Direct
handover to the same relay before resuming the broadcast. Existing devices are
never moved automatically.

## 12. Compare and roll out

Compare the pilot's streaming RTT, packet loss, disconnects, and video delay
against step 1. Confirm that:

- a new Finnish account without a measurement still lands in Finland;
- a new account in the new region selects the new relay when its client probes;
- a failed probe falls back to the default region;
- a full or drained relay falls back to another relay in the same region, then
  to the `default` relay.

Then invite the remaining users in that region to move. Keep SRT buffer
settings unchanged during this comparison; lower them only after a separate
loss/recovery test.

## 13. Drain or remove a region

To stop new assignments to a relay, click **Drain** in Admin. Keep it enabled
so existing streams and reconciliation continue. New users in that region then
fall back to other relays in the region, then the `default` relay. To return a
device to Finland, stop it and repeat the portal move. Moves fail closed when
the old relay cannot confirm that the path is offline; restore its Control API
before retrying. Draining does not transfer live streams. Remove a host from
`RELAY_DEPLOY_TARGETS` and `RELAY_PUBLIC_IPS` only when it no longer serves any
device.

The workflow matrix follows [GitHub's matrix documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations).
Offline verification uses the exact-path endpoint in the
[pinned MediaMTX API](https://github.com/bluenviron/mediamtx/blob/v1.19.3/api/openapi.yaml).
