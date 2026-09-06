# Add a US relay and move existing devices

Use one US relay alongside Finland. Keep the app and database where they are.
The new relay handles ingest, Direct encoding, OBS reads, and browser media locally.
No database migration is required for regional selection.

1. Measure a few US users before choosing the location. Record streaming RTT,
   packet loss, disconnects, and video delay. Compare US East and West users.
   Use the same devices and networks for the post-rollout comparison.

2. Provision a Linux x86_64 server in the chosen US location. Match the existing
   relay's OS and prerequisites from [Relay box](README.md#2-relay-box).
   Size CPU and bandwidth for the expected concurrent Direct encodes. Start with
   a conservative forwarder cap and raise it after a simultaneous-stream test.
   Use a dedicated relay hostname, for example `relay-us.visp-stream.com`.
   Point its DNS A record directly at the US server. Add AAAA only if IPv6 works.
   Keep the media hostname outside an HTTP CDN proxy.

3. Join the server to Tailscale. Allow the app host to reach its TCP 9997 Control
   API. Allow the CI identity to reach SSH, with the same restrictions as Finland.
   Open public UDP 5000, 8890, and 8891; TCP 1935 and 443; and TCP/UDP 8189.
   Match the host firewall and cloud firewall. Keep 8554 on loopback and 9997 on
   Tailscale. Allow the certificate challenge method used by the existing Caddy
   installation, including TCP 80 if using HTTP challenges.

4. Clone the repository into `/opt/visp` on the US host and check out the release
   containing this change. Configure the existing release SSH user and verified
   host key as described in [UPDATE.md](UPDATE.md). Install the bootstrap:

   ```sh
   cd /opt/visp
   sudo install -D -m 0755 deploy/visp-relay-release-bootstrap /usr/local/sbin/visp-relay-release
   sudo install -d -m 0700 /etc/visp
   sudoedit /etc/visp/relay.env
   ```

   Set these values using the US server's addresses and the existing production
   app's secrets. Copy secrets securely from the current configuration; do not
   generate different values for the second relay.

   ```dotenv
   APP_ORIGIN=https://visp-stream.com
   HOOK_SECRET=<same value as the app and Finland relay>
   STUDIO_MEDIA_PASSWORD=<same value as the app and Finland relay>
   MTX_AUTHHTTPADDRESS=https://visp-stream.com/api/mediamtx/auth
   MTX_APIADDRESS=<US_TAILSCALE_IP>:9997
   MTX_WEBRTCADDITIONALHOSTS=relay-us.visp-stream.com
   MTX_WEBRTCALLOWORIGINS=https://visp-stream.com,https://stream.visp-stream.com
   DIRECT_VIDEO_ENCODER=libx264
   DIRECT_VIDEO_BITRATE_KBPS=6000
   DIRECT_VIDEO_FPS=30
   ```

   Preserve any additional Direct/BRB settings your Finland relay requires.
   If Cloud Studio is enabled, install the compositor and its firewall from
   [compositor/README.md](compositor/README.md), then set
   `STUDIO_COMPOSITOR_UNIT=visp-compositor@`. The relay release helper does not
   build or update the compositor. Install the same compositor version on both
   hosts whenever its code changes.

5. Create `/etc/visp/caddy.env` on the US host:

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

6. On the app host, append the US server's actual outbound public IP to
   `RELAY_PUBLIC_IPS` in `/etc/visp/caddy.env`. Keep Finland's IP in that list.
   If relay callbacks use IPv6, include that outbound address too. Restart Caddy
   to load the changed systemd environment:

   ```sh
   sudo systemctl restart caddy
   ```

   Leave `RELAY_HOST`, `MEDIAMTX_API_URL`, and `RELAY_PING_URL` in `app.env`
   pointing to Finland. They initialize the existing `default` relay.
   Keep its database name `default`; renaming it creates another default row on
   the next app startup. Its forwarder cap is still supplied by
   `DIRECT_MAX_FORWARDERS` at app startup.

7. In GitHub, open **Settings > Environments > production**. Add the variable
   `RELAY_DEPLOY_TARGETS` with both SSH hosts and public HTTPS origins:

   ```json
   [
     {"host":"<FINLAND_TAILSCALE_HOST_OR_IP>","url":"https://relay.visp-stream.com"},
     {"host":"<US_TAILSCALE_HOST_OR_IP>","url":"https://relay-us.visp-stream.com"}
   ]
   ```

   Replace every placeholder. Keep `DEPLOY_USER` and `DEPLOY_SSH_KEY` valid on
   both hosts. Append the verified US SSH host key to `DEPLOY_KNOWN_HOSTS`.
   This variable replaces the single relay target list, so include Finland.
   Without it, releases continue to use `RELAY_DEPLOY_HOST` and
   `RELAY_WEBRTC_URL`. Changed relay components deploy sequentially to each
   target; a failed host does not cancel the other host's deployment.

8. Release the app, portal, and browser broadcaster using the normal production
   release workflow. Deploy the new Caddy `/ping` configuration to Finland too;
   the workflow now detects and deploys that component. Existing media component
   updates restart relay services, so schedule them outside active broadcasts.
   Check **Actions > Mobile > Build and submit VISP** after merging to `main`.
   That workflow detects `apps/native` changes and submits Android to Google
   Play production and iOS to App Store Connect. It requires the production
   `EXPO_TOKEN` secret and configured EAS/store credentials. If it did not run,
   use **Actions > Mobile > Run workflow** on the branch containing this change.
   A manual run builds both apps when OBS Remote is linked. Finish iOS App Store
   review/release in App Store Connect for public users, or distribute the build
   through TestFlight for pilots. Publishing a GitHub release alone does not
   update installed phone apps.

9. In VISP Admin, create the US relay with these fields:

   ```text
   Name: us-1
   Region: US East (use the actual location)
   Public host: relay-us.visp-stream.com
   Public IP: <US_PUBLIC_IP>
   Control API URL: http://<US_TAILSCALE_IP>:9997
   Ping URL: https://relay-us.visp-stream.com/ping
   Path capacity: <your chosen device limit>
   Max forwarders: <your tested simultaneous encode limit>
   ```

   New records start disabled. Leave the US relay disabled until the checks in
   step 10 pass. The public IP field does not update the app's Caddy allowlist.
   Enabling makes the relay available for new assignments immediately.

10. Before enabling it, check connectivity from the app host:

    ```sh
    curl --fail --max-time 5 http://<US_TAILSCALE_IP>:9997/v3/paths/list
    curl --fail --max-time 5 -I https://relay-us.visp-stream.com/ping
    curl --fail --max-time 5 -I -H 'Origin: https://stream.visp-stream.com' https://relay-us.visp-stream.com/ping
    ```

    Expect valid API JSON and HTTP 204 with `Access-Control-Allow-Origin: *` for
    the public probe. Enable the relay, then use a US pilot account to publish.
    Check SRT, bonded SRT/SRTLA where used, browser publishing, OBS reads,
    authenticated previews, Direct output, and BRB recovery. Verify the US host
    carries media and runs its own encoders. The app still handles authentication
    and control requests in Finland, which can affect setup time.

11. Move existing devices while offline. Stop all sources, close OBS readers and
    previews, and end Direct/BRB outputs. Wait at least one minute after the last
    publisher connection. In the updated phone or browser app, open
    **Settings > Advanced > Relay region > Find best relay** and confirm the move.
    Alternatively, expand the device in the portal and choose **Move to …**.
    The native action measures from the actual publishing device; a remote portal
    browser measures its own network.

    Update external publisher and OBS receiving URLs after each move. A portal
    move also requires refreshing the destination in the VISP app. The app's
    **Find best relay** action refreshes its saved URL even when the region already
    matches. Device IDs, native installation IDs, output settings, and device
    history remain attached. Old stream addresses stop working. Move every device
    used for Direct handover to the same relay before resuming the broadcast.

12. Compare the pilot's streaming RTT, packet loss, disconnects, and video delay
    against step 1. Confirm Finland users still select Finland. Test a failed
    probe and a full or drained relay. Then invite the remaining US users to move.
    Keep SRT buffer settings unchanged during this comparison; lower them only
    after a separate loss/recovery test.

13. To stop new US assignments, click **Drain** in Admin. Keep the relay enabled
    so existing streams and reconciliation continue. To return a device to
    Finland, stop it and repeat the portal move. Moves fail closed when the old
    relay cannot confirm that the path is offline; restore its Control API before
    retrying. Draining does not transfer live streams. Remove a host from
    `RELAY_DEPLOY_TARGETS` only when it no longer needs release updates.

The workflow matrix follows [GitHub's matrix documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations).
Offline verification uses the exact-path endpoint in the
[pinned MediaMTX API](https://github.com/bluenviron/mediamtx/blob/v1.19.3/api/openapi.yaml).
