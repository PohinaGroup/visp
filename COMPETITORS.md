# Competitor analysis — Streamable.run and IRLToolkit

Researched 2026-08-26 from vendor sites. Streamable's own comparison page is
marketing, not neutral; claims sourced from it are marked *(their claim)*.
VISP's side is read off this repo and `apps/fumadocs/content/docs`, not the
landing page.

## The three products in one line each

| | Model | Price |
| --- | --- | --- |
| **IRLToolkit** | Cloud OBS instance per customer, GPU-backed, managed | $129/mo Standard, $179/mo Advanced, + add-ons |
| **Streamable.run** | Cloud OBS + a productised IRL control plane on top | $39/mo Intro (20 h), $119/mo Advanced, $179/mo Max |
| **VISP** | Self-hosted SRT/SRTLA relay + control plane; no cloud OBS, no compositing | Free during beta, you rent the VPS |

They sell a **rented studio in the cloud**. VISP sells a **transport pipe you
own**. That difference generates most of the feature gap below — several gaps
are consequences of a deliberate scope choice ("VISP does not host OBS"), not
oversights.

## Feature matrix

| Capability | VISP | Streamable | IRLToolkit |
| --- | --- | --- | --- |
| SRT ingest | ✅ | ✅ | ✅ |
| RTMP ingest | ✅ (fallback URL) | ✅ | ✅ |
| SRTLA bonding at the relay | ✅ (UDP 5000, BELABOX/Moblin) | ❌ not advertised | ❌ not advertised |
| App-side duplicate-link redundancy | ✅ (Wi-Fi + cellular, native) | — | — |
| First-party phone publisher app | ✅ iOS + Android + Apple Watch | ❌ (uses Larix/Moblin/IRLPro) | ❌ |
| Browser publisher (WebRTC/WHIP) | ✅ | ❌ | ❌ |
| H.265 ingest | ❌ H.264/AAC only | ~ | ✅ |
| Uncapped ingest bitrate/resolution | ❌ capped by relay encoder budget | ✅ on Max | ✅ on Advanced |
| Multistream to several platforms | ✅ Twitch/Kick/YouTube | ✅ any, incl. custom RTMP/SRT | ✅ 2–5 platforms |
| Arbitrary custom RTMP/SRT destination | ❌ | ✅ | ✅ |
| Edit/stop individual destinations mid-stream | ~ per-destination state, no live edit | ✅ *(their claim)* | ❌ *(their claim)* |
| Drop protection / BRB hold | ✅ (snapshot, image, or colour card) | ✅ + clips player | ✅ custom BRB |
| Clips player during a drop | ❌ | ✅ all plans | 💰 $5/mo add-on *(their claim)* |
| Cloud OBS / server-side scenes + overlays | ❌ by design | ✅ | ✅ |
| Browser sources, graphics, alerts on the server | ❌ | ✅ | ✅ |
| Multiple simultaneous ingests, PiP / camera switching | ❌ one publisher per path | ✅ 5–unlimited | ✅ multi-ingest |
| Switch ingest (desktop ↔ IRL) without ending stream | ❌ | ✅ | ✅ |
| Guest / collab ingest sharing | ❌ | ✅ friend requests, QR, mid-stream | ❌ support ticket *(their claim)* |
| Simultaneous vertical + horizontal output | ❌ | ✅ vertical editor | ❌ |
| VOD recording + download for editors | ❌ | ✅ on Max | ❌ |
| Team/moderator seats on the dashboard | ❌ (chat-command mods only) | ✅ 2–unlimited | ~ chat commands |
| Multi-platform chat bot | ✅ Twitch + Kick + YouTube, posts as you | ~ | ✅ Twitch only |
| Local-OBS remote control (scenes/start/stop) | ✅ signed plugin + Watch + web remote | n/a (OBS is theirs) | n/a |
| Managed provisioning | ❌ you run the box | ✅ ~30 s *(their claim)* | ✅ ~3 min *(their claim)* |
| DDoS protection | ❌ your VPS | ✅ Cloudflare *(their claim)* | ❌ *(their claim)* |
| Localisation | EN + FI docs | 12+ languages | EN |
| Self-host / own your keys | ✅ GPL-2.0 | ❌ | ❌ |

## What they have that VISP does not — ranked by how much it costs you

**1. Server-side compositing (cloud OBS).** The core of both products. Overlays,
text, browser sources, alerts, PiP — all rendered in the cloud, so the phone is
just a camera and the PC can be off *with graphics still on screen*. VISP's
equivalent requires the broadcaster's own OBS running at home. This is the
single biggest structural difference and the reason they can charge $129+.

**2. Multiple live ingests and switching between them.** Both let a streamer run
phone + desktop OBS + a second camera into one server and cut between them
without ending the broadcast. VISP enforces one publisher per path and hands
Direct ownership over only when the previous owner is *offline* — a visible drop
to viewers. For a streamer whose show is "start at desk, go outside, come back",
this is a hard blocker.

**3. Clips player as the drop filler.** VISP's BRB card is a still (snapshot,
uploaded image, or colour). Streamable plays highlight clips, which keeps
viewers from leaving during a dropout. Cheap to want, moderately cheap to build
on the existing BRB forwarder — it is already a running FFmpeg process holding
the output.

**4. Arbitrary RTMP/SRT destinations.** VISP hardcodes Twitch/Kick/YouTube
(`DIRECT_PROVIDERS`, and three boolean columns on the `path` table). No
X/Twitter, Rumble, TikTok, Instagram, custom CDN, or a client's own ingest.
Schema change plus a key-storage decision, since the OAuth-only "we never hold a
key" property does not survive custom destinations.

**5. Collab / guest ingests.** Streamable's friend-request + QR ingest sharing
lets two streamers merge feeds mid-stream. VISP has no notion of another
account's device publishing into your path.

**6. Vertical + horizontal simultaneously.** Streamable's vertical editor
reframes the existing broadcast into a second, portrait output. VISP already runs
one FFmpeg encode per destination, so a crop/scale filter chain is not far off —
but "which part of the frame" needs a UI and, realistically, some auto-framing.

**7. VOD recording and editor download.** No recording on VISP at all. MediaMTX
can record natively; the missing parts are storage, retention, and a download UI.

**8. Team seats.** No way to give a producer or moderator dashboard access
without handing over the account. VISP's `appUser` model is single-tenant per
broadcaster.

**9. Managed everything.** Instant provisioning, uptime SLA-ish claims, DDoS
protection, live support appointments, 12+ languages. VISP's answer is "you run
the box, and at 2am you are on call" — stated honestly in `WHY_VISP.md`, which is
the right call, but it is still a reason a $179/mo customer picks them.

**10. Headroom.** Uncapped bitrate/resolution and H.265 ingest on their top
tiers. VISP is H.264/AAC only and caps encodes per relay.

## What VISP has that neither of them does

- **SRTLA bonding terminated at the relay** — real link aggregation from a
  BELABOX/Moblin sender, not just failover. Their answer to bad connection is
  buffering and BRB; VISP's is more uplink.
- **A first-party publisher app** on iOS, Android, browser, and Apple Watch, with
  floating multi-platform chat, viewer counts, title/category editing, burned-in
  subtitles, and audio isolation. Both competitors send you to third-party
  encoders.
- **Stream keys never leave the server** — OAuth-resolved at forward time, never
  returned to a client, never stored as a separate value. On a cloud-OBS product
  you paste your key into someone else's machine.
- **Multi-platform chat bot that runs server-side** — Twitch, Kick *and* YouTube,
  posting as the broadcaster, working with the PC off. IRLToolkit's bot is Twitch
  only.
- **Remote control of the broadcaster's own OBS** — outbound WSS, no port
  forwarding. Irrelevant to them, valuable for the hybrid home-studio streamer.
- **Self-hosting, GPL-2.0, and a VPS bill instead of a subscription.** At
  $119–179/mo, twelve months of Streamable is roughly a decade of a small VPS.

## Read

VISP is not losing to these on transport — on transport it is ahead (SRTLA,
first-party app, key custody). It loses on **production**: compositing, multiple
cameras, switching without dropping, and filler content during outages. Those
are what an IRL streamer with an audience is actually paying $129/mo for.

Two coherent strategies:

- **Stay a pipe.** Lean harder into SRTLA, the app, key custody, and price. Sell
  to the streamer who already has a home OBS and does not want a subscription.
  Cheapest gaps to close in this framing: clips player (3), custom destinations
  (4), recording (7).
- **Grow a production layer.** Add server-side compositing and multi-ingest
  switching. That is a different product with a different cost base — GPU
  relays, per-customer state — and it is a direct fight with two funded
  incumbents.

The gaps worth closing regardless of strategy, because they are cheap relative to
what they unlock: **clips player**, **custom RTMP/SRT destinations**, and
**seamless ingest handover** (item 2 — even without compositing, letting a second
device take over a live path without tearing down the forwarder is mostly a
MediaMTX-path and ownership-logic problem).

## Sources

- <https://streamable.run/> · <https://streamable.run/pricing> ·
  <https://streamable.run/blog/streamable-vs-irltoolkit-comparison>
- <https://irltoolkit.com/> · <https://irltoolkit.com/features> ·
  <https://irltoolkit.com/pricing>
- Adjacent, not covered here: <https://streamrun.com/>
