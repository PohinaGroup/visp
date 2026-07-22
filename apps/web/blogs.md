# VISP blog editorial brief

The six launch articles below are published from `content/blog`. This brief is
the source for positioning and future updates. It is for Twitch and Kick
creators who use OBS and want to bring
phones or remote guests into an existing home-studio production. Comparisons
should help readers choose the right workflow, including cases where another
product is the better fit. VISP should not be presented as a universal
replacement for every mobile-streaming tool.

VISP is a self-hosted SRT/RTMP relay and control plane. It gives publishing
devices independently revocable access, brings their feeds into OBS, and lets a
remote creator control OBS without exposing an inbound control port. VISP does
not currently bond network connections or transcode video.

## Rival map

| Product | Relationship to VISP | Editorial angle |
| --- | --- | --- |
| [VDO.Ninja](https://docs.vdo.ninja/) | Direct overlap for bringing remote cameras and guests into OBS | VDO.Ninja is browser-first and commonly uses peer-to-peer WebRTC for very low latency. VISP uses authenticated relay paths and is built around persistent publishing devices feeding a home OBS studio. |
| [BELABOX](https://belabox.net/) | Direct overlap for IRL contribution to OBS | BELABOX focuses on dedicated or DIY encoders, SRTLA network bonding, dynamic bitrate, and cloud relays. It is the stronger fit when several connections must act as one resilient uplink. |
| [LiveU Solo](https://solohelp.liveu.tv/hc/en-us/articles/16672822061339-Overview-of-the-Solo-PRO) | Higher-cost hardware alternative for field contribution | LiveU Solo combines a hardware encoder with its cloud bonding service. Compare its appliance workflow and bonding guarantees with VISP's phone-to-existing-OBS workflow, not as if the products have identical scope. |
| [Larix Broadcaster](https://softvelum.com/larix/) | Complementary encoder and partial app alternative | Larix is a mature mobile encoder with SRT, RTMP, adaptive bitrate, and other professional controls. It can publish into VISP, so articles should cover the combination as well as the app comparison. |
| [Moblin](https://github.com/eerimoq/moblin) | Complementary iOS encoder and partial app alternative | Moblin is an open-source IRL streaming app supporting protocols including SRT, SRTLA, RTMP, RIST, and WHIP. Like Larix, it can be a VISP video source instead of an either-or rival. |
| [Speedify](https://speedify.com/irl-streaming-connection-bonding-software/) | Complementary network layer | Speedify bonds connections for applications running above it. It addresses a capability VISP does not provide and may be part of a more resilient VISP setup. |
| [Streamlabs Mobile](https://support.streamlabs.com/hc/en-us/articles/4413175147931-Mobile-Live-Streaming-Guide) | Partial alternative for going live directly from a phone | Streamlabs Mobile emphasizes fast direct publishing, overlays, and multistreaming. VISP is for creators who want the phone to remain a source inside their existing OBS production. |

## Launch articles

### 1. VDO.Ninja vs VISP: Which Is Better for Bringing Remote Cameras Into OBS?

This buyer's guide compares two ways to get a remote camera into OBS. VDO.Ninja
is browser-first: a creator or guest opens a link, publishes through WebRTC,
and OBS receives the feed through a browser source. Its peer-to-peer design is
a strong choice when very low latency, quick guest onboarding, and no account
setup matter most.

VISP takes a different route. A phone, browser, or third-party encoder
publishes to an authenticated relay path, and OBS reads that path as a media
source. Each publishing device has revocable access, the OBS plugin can add
devices and accept remote controls, and the creator's Twitch or Kick stream
key stays on the home studio. That makes VISP a better fit for repeat field
cameras and an OBS production that should remain stable between sessions.

The conclusion should be situational rather than declaring a winner. Choose
VDO.Ninja for lightweight, interactive guest calls and minimum latency; choose
VISP for managed device paths, SRT contribution, and a repeatable
phone-to-studio workflow. They can also coexist: VDO.Ninja can handle a live
conversation while VISP carries dedicated field cameras into the same OBS
production.

### 2. VISP vs BELABOX vs LiveU Solo: Choosing an IRL Streaming Setup

This article helps an IRL creator choose between using a phone with VISP, a
BELABOX encoder, or LiveU Solo hardware. Start from the production goal rather
than a feature-count table: all three can contribute field video, but they
solve different budgets, reliability requirements, and operational workflows.

BELABOX and LiveU Solo are the stronger choices when genuine network bonding
is required. They can use multiple cellular, Wi-Fi, or wired connections to
survive an individual link degrading, with BELABOX offering a configurable
software/hardware ecosystem and LiveU offering an integrated commercial
appliance and cloud service. VISP does not bond connections and should not be
marketed as equivalent resilience.

VISP fits creators who already have scenes, alerts, destinations, and an
operator in OBS and want a phone or browser to become a remote camera without
rebuilding that studio. The comparison should finish with a simple decision:
use VISP for an approachable phone-to-home-OBS workflow, BELABOX for flexible
enthusiast or professional bonded IRL rigs, and LiveU Solo when dedicated
hardware and a supported bonding service justify the cost.

### 3. How to Keep Your Stream Live When the Mobile Network Drops

No single setting can make a mobile stream literally impossible to drop. This
guide should instead explain the layers that keep a brief field interruption
from ending the viewer-facing broadcast. Start with a conservative bitrate,
enable adaptive bitrate in the phone encoder, use SRT's packet recovery, and
set enough SRT latency for the real network's round-trip time and jitter.

The next layer is recovery. Configure the publishing app and the OBS media
source to reconnect automatically, then use an OBS fallback scene while the
field feed is unavailable. VISP keeps the destination broadcast in the home
studio, so OBS can continue showing a holding scene, local content, alerts, and
audio while the phone reconnects instead of terminating the platform stream.

End with the boundary of this setup. SRT can recover lost packets and tolerate
short disruptions, but it cannot create bandwidth where none exists. Creators
who regularly cross dead zones or need protection from an entire carrier
failing should add actual network bonding through BELABOX, LiveU, Speedify, or
another appropriate bonding system.

### 4. How to Use Your Phone as a Remote Camera in OBS

This tutorial follows the whole signal chain: the phone captures H.264 video
and AAC audio, publishes through the VISP native app over SRT or through the
browser publisher over WebRTC, the VISP relay exposes the authenticated feed
to OBS, and OBS sends the finished production to Twitch or Kick. Keeping the
destination at home means existing scenes, alerts, graphics, and stream keys
do not move to the phone.

The practical walkthrough should cover signing in, creating or claiming a
publishing device, importing the generated OBS scene collection or adding the
device with the OBS plugin, and checking audio before going live. It should
also show the manual Larix or Moblin path for creators who prefer a third-party
encoder.

Finish with remote operation: the field creator can follow chat and stream
status and can send authenticated start, stop, or scene commands through the
VISP OBS plugin. OBS opens no public control port, and the phone never needs
the Twitch or Kick stream key.

### 5. How to Build a Multi-Phone IRL Stream in OBS

This guide turns multiple phones into independent OBS sources rather than
combining them in a video-call layout. Give every phone its own VISP publishing
device and relay path, with its own camera, microphone, and revocable
credential. OBS then receives one media source per path and can place each in a
separate scene or compose several into a single view.

Use a concrete two-phone example: one operator carries the roaming camera and
microphone while a second phone provides a stable wide shot of the venue. The
home producer can cut between them, create picture-in-picture, mute an unused
microphone, or leave one feed ready as backup without changing the stream's
destination.

The article should also set expectations. Each phone needs enough upload
capacity, only one publisher can own a given path at a time, and separate
devices should not share credentials. If synchronized cameras, bonded uplinks,
or server-side mixing are required, explain that those needs go beyond VISP's
current scope.

### 6. How to Bring a Remote Guest Into OBS Without Sharing Your Stream Key

This article presents remote guests as temporary publishing devices, not as
co-owners of the broadcast account. The producer creates a guest device and
sends the guest through the VISP browser-publishing flow. The guest grants
camera and microphone access and publishes to that device's relay path; the
Twitch or Kick destination remains configured only in the producer's OBS.

In OBS, the producer adds the guest feed as a media source or uses the VISP
plugin to add it to a scene. They retain control over layout, audio, fallback
content, and when the guest appears on air. After the appearance, revoking or
rotating that device's publishing access does not affect the producer's other
cameras or OBS read credential.

The guide should be explicit about fit. This workflow is good for a remote
camera or contributor who needs to send a clean feed into an existing
production. A conversational panel in which guests need to see and hear one
another may be better served by VDO.Ninja or another call platform, potentially
alongside VISP for dedicated field feeds.

## Editorial workflow

Each post lives at `content/blog/<slug>/index.mdx` with its cover, diagrams, and
screenshots beside it. Frontmatter supplies the title, search description,
publication date, and cover alt text. Every committed post is public; there is
no draft or scheduling layer.

Before changing a comparison, recheck product capabilities against the
official sources above. Keep claims dated through `updatedAt` when facts change,
omit volatile prices, and make VISP's lack of transcoding and network bonding
clear wherever those capabilities affect the recommendation.

New posts should answer one search intent, use a unique 1200×630 cover, include
descriptive alt text for every image, link to primary sources, cross-link only
to relevant VISP guides, and end with a contextual invitation to try VISP.

Use `https://docs.visp-stream.com` for implementation details instead of
duplicating reference documentation in a blog post. Every article should link
to its relevant setup page; the Fumadocs navigation links back to the blog.
Both domains publish their own canonical URLs, robots file, and sitemap.
The marketing site also publishes `/llms.txt`, which links every article and
the Fumadocs `/llms-full.txt` corpus.
