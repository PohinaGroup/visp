# VISP managed compositor

Install Bun, FFmpeg, and Chromium on the relay host. Install the worker and its
systemd template, then create the unprivileged service account:

```sh
sudo useradd --system --no-create-home --shell /usr/sbin/nologin visp-compositor
bun build --compile visp-compositor.ts --outfile /tmp/visp-compositor
sudo install -D -m 0755 /tmp/visp-compositor /usr/local/libexec/visp-compositor
sudo install -D -m 0755 visp-compositor-egress-check /usr/local/libexec/visp-compositor-egress-check
sudo nft -f visp-compositor.nft
sudo install -D -m 0644 ../systemd/visp-compositor@.service \
  /etc/systemd/system/visp-compositor@.service
sudo systemctl daemon-reload
```

The compiled executable bundles the Studio URL policy, browser interception,
and worker state modules; it does not import files from the application clone
at runtime. The trusted relay hook derives per-path hook and media credentials
from the app-matching secrets in `relay.env`, writes them to a mode-0600
`/run/visp/compositor-<path>.env`, and removes that file when ingest ends. The
worker never receives either global secret. FFmpeg publishes only to its exact
authenticated local `studio/<path>` RTSP namespace; the URL reported back to
Direct contains no credentials.

The relay hook starts one compositor per active path. To exercise one directly:

```sh
STUDIO_WORKER_TOKEN=... bun visp-compositor.ts https://api.visp.example path-1 \
  rtsp://127.0.0.1:8554/path-1 rtsp://127.0.0.1:8554/studio/path-1
```

The worker polls the last saved desired state every second. One stable FFmpeg
publisher owns the local MediaMTX Studio namespace; replaceable renderers feed
it over a per-path loopback MPEG-TS socket, so Save, scene transitions, alerts,
and browser refreshes do not disconnect the program publisher. Health is
reported only while both the stable publisher and its renderer are running and
the RTSP program has become readable. Direct forwarders use that program while
the rollout flag, account mode, and health all permit it; otherwise they use raw
ingest. Chromium keeps its OS sandbox and gets a DNS-pinned public host with all
other host resolution blocked. Production units must additionally deny private
network egress for the compositor service account.

The shipped unit caps each worker at 2 GiB, three CPU cores, and 256 tasks.
Calibrate those values using a systemd drop-in after measuring the largest
accepted 1080p graph; do not remove the caps.

PNG assets are accepted only after complete CRC, zlib, decoded scanline, and
filter validation. Standard non-interlaced grayscale, RGB, indexed,
grayscale-alpha, and RGBA PNG bit-depth combinations are supported; interlaced
PNGs must be converted before upload.
