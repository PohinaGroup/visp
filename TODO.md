
Custom RTMP + more destinations
Chat bot alerts
SRTLA (or a clear Moblin/BELABOX path)
Billing tiers




# TODO - SRTLA
## Install the receiver on **every** relay box

This is manual, like `visp-bond` — the release workflow does not restart media services. On each relay:

```bash
git clone https://github.com/BELABOX/srtla.git /tmp/srtla
git -C /tmp/srtla checkout 37862da3d0c13b46956efd3f88877053293d97d6
make -C /tmp/srtla srtla_rec
sudo install -m 0755 /tmp/srtla/srtla_rec /usr/local/bin/srtla_rec

sudo install -m 0644 /opt/visp/deploy/systemd/srtla-rec.service \
  /etc/systemd/system/srtla-rec.service
sudo systemctl daemon-reload
sudo systemctl enable --now srtla-rec
sudo systemctl status --no-pager srtla-rec
```

Then open **UDP 5000** in both the host firewall and the UpCloud firewall.

## 3. Verify on the relay before touching the app

```bash
sudo journalctl -u srtla-rec -n 20
```

You want `srtla_rec is now running` and, at startup, `Trying to connect to SRT at 127.0.0.1:8890... success`. If it says it can't reach the SRT server, MediaMTX isn't up — fix that first, the receiver will still start but nothing will publish.

## 4. Ship the app release

Publish a `vX.Y.Z` GitHub Release as usual. **Order matters:** the portal now advertises `srtla://<relay>:5000` for every path, so if step 2 hasn't happened on a relay, users of that relay get a dead link. Steps 2–3 on all relays, then the release.

## 5. Test with a real phone

In Moblin: paste the SRTLA link from the setup wizard (or dashboard → Advanced → *Bonding two connections with BELABOX or Moblin?*) as the stream URL, then enable both Wi-Fi and mobile under **Settings → Streams → your stream → SRT(LA)**. Go live, confirm the path shows as publishing, then turn Wi-Fi off mid-stream — the feed should survive on cellular alone.

## 6. Commit

Two things to know before you do:

- **Your index is already fully staged** — I didn't run `git add`, but everything is sitting in it, including your pre-existing Apple Watch branch changes (`project.pbxproj`, `Info.plist`, the watch app icon). Those are genuinely yours, not biome collateral: biome ignores all three paths (I verified). You probably want them in a separate commit, so `git reset` first and stage deliberately.
- You're on `agent/apple-watch-irl-streaming`, which is unrelated to this work. Consider branching off `main` for the SRTLA change.

The SRTLA files are: `deploy/relay/srtla-rec/Dockerfile`, `deploy/relay/srtla-rec.test.sh`, `deploy/systemd/srtla-rec.service`, `compose.yml`, `deploy/README.md`, `deploy/UPDATE.md`, `packages/api/src/relay.ts`, `packages/api/src/relay.test.ts`, `apps/web/src/components/credential-reveal.tsx`, `apps/web/src/components/dashboard/path-row.tsx`, `apps/web/src/routes/_auth/setup.tsx`, `apps/fumadocs/content/docs/broadcaster-setup{,.fi}.mdx`, `scripts/test-integration.sh`.

One caveat worth repeating: don't run `bun run check` at the repo root — it rewrites 100+ unrelated files. Scope biome to the files you touched.