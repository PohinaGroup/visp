# VISP Reddit plan

Companion to [MARKETING.md](MARKETING.md), [YOUTUBE.md](YOUTUBE.md), and
[TIKTOK.md](TIKTOK.md). Community rules were checked 17 August 2026; re-check
them immediately before posting because moderators change them without notice.

Reddit rewards useful participation and punishes drive-by promotion. Use one
real personal account, disclose that you built VISP in every relevant post,
answer every good-faith comment, and never seed praise or coordinate votes.

Do not launch broadly until there is a 30–40 second uncut proof video and one
non-builder has completed setup. Upload the proof natively. Never lead with a
link card or use a URL shortener.

---

## Community matrix

| Community | Fit | Rule finding | Action |
| --- | --- | --- | --- |
| r/IRLstreaming | Excellent | No community-specific rules returned; sitewide spam rules apply | Participate first, then one transparent, feedback-led post |
| r/SideProject | Good launch/story fit | No community-specific rules returned | Post the build story once; no identical cross-posts |
| r/BetaTests | Good tester recruitment | No spam/low effort; account 24h+, 2+ karma | Structured test request |
| r/alphaandbetausers | Good tester recruitment | No community-specific rules returned | Concise beta request after participating |
| r/opensource | Good technical fit | Promotion allowed in moderation; `Promotional` flair; OSI license required; **AI-generated content is ban-worthy** | Write the final post personally from the outline below; never paste generated copy |
| r/selfhosted | Strong technical fit | Projects under 3 months only in the New Project Megathread | VISP first went public 18 July 2026; use the megathread until about 18 October 2026 |
| r/droidappshowcase | Actionable | One app post/week; real description and direct Play/GitHub link; verified email, 24h+, 2+ karma | Post once with the live Google Play listing |
| r/iOSApps | Actionable | 10 local karma; App Store link only; once/30 days | Earn local karma, then post listing `id6791948092` |
| r/KickStreaming | Strong provider fit | No selling; self-promotion in moderation; Kick content only | Ask mods first; pitch the free Kick workflow |
| r/streaming | Strong audience, high risk | Third-party tools require prior mod approval; unapproved ads risk permanent ban | Modmail first; post nothing without approval |
| r/obs | Strong audience, wrong venue for an ad | Self-promotion allowed only when required for help | Never launch-post; answer questions honestly and submit the plugin to OBS Resources |
| r/Twitch | Huge audience, closing | App/tool/service promotion ends after 1 September 2026 | Request permission now or write it off; never astroturf |
| r/VIDEOENGINEERING | Expert feedback | Rules not reliably retrievable | Ask mods before posting a technical demo |
| r/Twitch_Startup, r/NewTubers | Marginal | Varies | Answer questions only; no product posts |

## Posting sequence

Do not publish these on the same day or reuse identical posts.

1. Spend 7–10 days making useful, non-promotional comments in r/IRLstreaming,
   r/obs, r/selfhosted, and the app communities.
2. Post to r/BetaTests and recruit 3–5 testers.
3. Fix the first repeated setup failure, then record the proof video.
4. Post the result and limitations to r/IRLstreaming.
5. Three or four days later, post the builder story to r/SideProject.
6. Use the r/selfhosted New Project Megathread while the three-month window lasts.
7. Post once to r/droidappshowcase and r/iOSApps.

---

## Ready post: r/IRLstreaming

**Title**

```text
I built a free beta that streams your phone to Twitch, Kick and YouTube at once — or into your own OBS
```

**Body**

```text
Full disclosure: I built this.

Every time I looked at going live away from the desk, the choice was: rebuild my whole show on a phone, or pay $120–180/month for a cloud OBS box. I already own a computer. So I built VISP.

Two ways to use it:

1. Direct — the phone goes straight to Twitch, Kick, and YouTube, in any combination, at the same time. No PC involved. Each destination gets its own encode, so one platform choking doesn't take the others with it.
2. Your own OBS — the same feed shows up as a media source in the production you already built. Scenes, alerts, graphics, plugins, local recording, all untouched.

You can start with (1) and move to (2) later without switching tools.

Other things that are in there: iOS/Android/browser publishers, multiple phones as separate sources with their own mics, independently revocable credentials per device, a server-side chat bot that posts live/BRB/back alerts and answers !bitrate with your computer off, and OBS scene + start/stop control from the phone or an Apple Watch.

Your Twitch/Kick key never reaches the phone — Direct resolves it server-side only while output is running.

What it does not do: the app duplicates packets across Wi-Fi and cellular for resilience but does NOT aggregate their bandwidth. If you need real bonding, use Moblin or BELABOX — and you can point either at a VISP relay, which accepts SRTLA on UDP 5000. It also doesn't host OBS or promise zero drops; when the source dies, a BRB card holds the broadcast while the phone reconnects.

Free during beta, GPL-2.0.

30-second real demo: [UPLOAD NATIVE VIDEO OR GIF HERE]
Try it: https://visp-stream.com/?utm_source=reddit&utm_medium=organic&utm_campaign=direct_launch&utm_content=irlstreaming
Source: https://github.com/PohinaGroup/visp

I want feedback from people who actually stream IRL: where is this still worse than what you use now, and what would stop you from trying it on a real stream?
```

## Ready post: r/BetaTests

**Title**

```text
[Web/iOS/Android] Test a phone-to-Twitch/Kick/YouTube streaming workflow — free beta
```

**Body**

```text
I am looking for 5 streamers who can test one complete workflow:

1. Sign in with Twitch, Kick, or Google.
2. Authorize one or more destinations.
3. Go live from a phone or browser and confirm every destination reports Live.
4. Interrupt the connection on purpose and confirm the BRB card holds the broadcast.
5. Optional, if you use OBS: add the same feed to OBS and switch a scene from the phone.

VISP is a free beta. It does not host OBS, does not aggregate bandwidth in its own app, and never receives your Twitch/Kick stream key.

Time needed: about 20 minutes.
Platforms: current Chrome/Edge/Safari; a physical iPhone or Android for the native app.
Feedback wanted: minutes to first picture, the first confusing step, delay/stability, and whether you would trust it for a real stream.

Demo: [VIDEO]
Test: https://visp-stream.com/?utm_source=reddit&utm_medium=organic&utm_campaign=direct_launch&utm_content=betatests
Source/docs: https://github.com/PohinaGroup/visp and https://docs.visp-stream.com

I built VISP and will be in the thread answering questions and fixing reproducible setup problems.
```

## Ready post: r/SideProject

**Title**

```text
I built an open-source alternative to $150/month cloud OBS, for people who already own a computer
```

**Body**

```text
Cloud OBS services charge $120–180/month, largely to rent you a computer. Most streamers already own one. That gap is the whole product.

VISP is a relay and control plane that does two things:

- Direct: a phone or browser publishes to an authenticated relay, which encodes and forwards to Twitch, Kick, and YouTube simultaneously. No PC required.
- OBS: the same contribution feed appears as a media source in the creator's own OBS, so their existing scenes, alerts, and plugins keep working.

Also in there: independently revocable per-device credentials, a server-side chat bot that runs with the creator's computer off, SRTLA ingest so BELABOX/Moblin rigs can bond into it, an OBS plugin that dials out instead of opening a port, and iOS/Android/browser publishers.

GPL-2.0, free during beta. It does not host OBS, does not aggregate bandwidth in its own app, and does not touch provider stream keys.

Live: https://visp-stream.com/?utm_source=reddit&utm_medium=organic&utm_campaign=direct_launch&utm_content=sideproject
Source: https://github.com/PohinaGroup/visp

The thing I am testing now is not "does SRT work." It is whether someone with no interest in relays can reach a live picture in under ten minutes. If you stream at all, I'd value the one step that looks most likely to lose you.
```

## Ready comment: r/selfhosted New Project Megathread

```text
VISP — a GPL-2.0, self-hosted SRT/SRTLA/RTMP relay and control plane for remote live streaming.

MediaMTX for media, PostgreSQL plus an Elysia/tRPC app for auth and device state, a TanStack portal, iOS/Android/browser publishers, a dedicated OBS Remote surface, and an outbound-WSS OBS plugin. Publishing devices get independently revocable credentials; the relay can either pass the contribution feed to your OBS untouched or run a per-destination encode straight to Twitch/Kick/YouTube. Relays accept SRTLA on UDP 5000, so an existing BELABOX or Moblin rig can bond into it.

Publish URLs are encrypted for authenticated re-reveal and separately stored as Argon2id hashes for relay auth. The OBS plugin opens no inbound port. Deployment is one app host plus one or more capacity-managed relay hosts, with systemd and Caddy templates in the repo.

Current limits: no bandwidth aggregation in our own app, no hosted OBS, no billing yet. The project first became public on 18 July 2026, so I am posting only in this thread as required.

Repo: https://github.com/PohinaGroup/visp
Docs: https://docs.visp-stream.com
Hosted beta: https://visp-stream.com/?utm_source=reddit&utm_medium=organic&utm_campaign=direct_launch&utm_content=selfhosted_megathread

I built it and would especially value feedback on the deployment/security model or the first-run broadcaster flow.
```

## Factual outline: r/opensource

Do not paste AI-generated copy into r/opensource. Write the final post personally
and include:

- `Promotional` flair.
- Why you personally built it: the cloud-OBS price gap.
- The GPL-2.0 repository link.
- What is open: server, portal, native clients, OBS plugin, and deployment templates.
- The architecture in one paragraph.
- Honest limits: no aggregation in-app, no hosted OBS, no billing.
- One concrete contribution request, such as Windows OBS packaging or SRTLA in
  the native app.
- Disclosure that you are the maintainer.

## Ready post: r/droidappshowcase

```text
Title: [Dev] VISP — stream your Android phone to Twitch, Kick and YouTube at once, or into your home OBS

I built VISP for streamers who don't want to pay for a cloud PC or rebuild their show on a phone. The Android app publishes the selected camera and mic over SRT; from there VISP either sends it straight to Twitch/Kick/YouTube or hands it to your own OBS as a media source. It also shows chat, edits stream info, and can switch scenes or start/stop a paired OBS.

Free during beta, GPL-2.0. It does not aggregate mobile connections or host OBS.

Android: [GOOGLE PLAY LINK]
Demo: [NATIVE VIDEO]
Source: https://github.com/PohinaGroup/visp

I'm the developer. The feedback I need most is battery and thermal behavior after 30 minutes, and reconnect behavior when moving between Wi-Fi and mobile data. Please include device model and Android version in any report.
```

---

## Modmail template

Use for r/streaming, r/KickStreaming, and r/VIDEOENGINEERING.

```text
Subject: Permission request — transparent VISP beta demo/feedback post

Hi mods,

I built VISP, a free and open-source relay that streams a phone to Twitch, Kick, and YouTube, or routes it into the creator's own OBS. I'd like to post one native 30-second demonstration, disclose my affiliation in the first line, list the product's limitations, and ask for technical workflow feedback. The post would carry one product link and one GitHub link — no giveaway, affiliate link, vote request, or repeated promotion.

Proposed title:
"I built a free beta that streams your phone to Twitch, Kick and YouTube at once — or into your own OBS"

Proposed full text: [PASTE THE EXACT DRAFT]

Would this be allowed here, and is there a preferred flair or recurring thread? I won't post without approval.

Thanks,
Joni
```

## Comment response bank

**How is this different from Moblin/IRL Pro?**

```text
Those are strong mobile encoders and I'm not claiming VISP invented phone streaming. The difference is what happens after the phone: VISP is the relay and control layer — per-device revocable paths, per-destination encoding to Twitch/Kick/YouTube, a server-side chat bot, and authenticated OBS control. Moblin can also publish straight into VISP, so it's not either-or. If you already have a relay setup you like, you may not need this.
```

**Does it bond cellular connections?**

```text
Partly, and I want to be precise because this gets overclaimed constantly. Our relays accept SRTLA on UDP 5000, so if you run Moblin or a BELABOX box you get real bonding into VISP today. Our own app does not do SRTLA yet — it can duplicate packets over Wi-Fi and cellular, which buys you failover and roughly doubles your mobile data, but does not add the two connections' bandwidth together. If aggregation is a hard requirement, use a tool built for it.
```

**Do you get my Twitch/Kick stream key?**

```text
No. With Direct, VISP resolves the authorized destination credential server-side only while output is running, holds it in memory, and never returns it to the publishing device, so a lost or borrowed phone leaks nothing. With the OBS path, the key never leaves your OBS at all. For YouTube, Direct creates a new broadcast and uses its ingest destination.
```

**What happens when mobile data drops?**

```text
On Direct, a BRB card holds the destination broadcast and the chat bot posts that the signal dropped, then posts again with the downtime when it recovers. With OBS, a fallback scene does the same job. Either way the camera can drop — the point is that the broadcast doesn't have to end with it. I don't claim the feed never drops.
```

**Is it really self-hosted?**

```text
The full server, portal, clients, OBS plugin, and deployment templates are GPL-2.0 in the repo. The hosted beta is the easiest way to try it; self-hosting is one app host plus one or more relay hosts, aimed at technical operators. Docs: https://docs.visp-stream.com/docs/self-hosting
```

**How much will it cost after beta?**

```text
Honestly: not decided yet. It's free now, there's no credit card, and I'd rather say "undecided" than invent a number. The benchmark I'm designing against is that cloud OBS runs $120–180/month and you already own a computer, so it has to be far below that to make sense. Self-hosting stays free regardless — that's what GPL-2.0 is for.
```

---

## Before you post

- [ ] Re-read the community rules and current pinned threads.
- [ ] Confirm the account meets age, karma, and local-karma requirements.
- [ ] Disclose `I built this` in the opening line.
- [ ] Upload the proof video natively with no other platform's watermark.
- [ ] Replace every placeholder and verify every link.
- [ ] Keep one product link and one source link; use no shortener.
- [ ] State the relevant limits: no in-app aggregation, no hosted OBS, no zero-drop promise.
- [ ] Use the subreddit-specific UTM `utm_content` value.
- [ ] Stay available to answer comments after posting.
- [ ] Record visits, signups, first pictures, and repeated setup failures.

## Rule links

- r/obs: https://www.reddit.com/r/obs/about/rules
- r/IRLstreaming: https://www.reddit.com/r/IRLstreaming/about/rules
- r/KickStreaming: https://www.reddit.com/r/KickStreaming/about/rules
- r/streaming: https://www.reddit.com/r/streaming/about/rules
- r/selfhosted: https://www.reddit.com/r/selfhosted/about/rules
- r/opensource: https://www.reddit.com/r/opensource/about/rules
- r/BetaTests: https://www.reddit.com/r/BetaTests/about/rules
- r/droidappshowcase: https://www.reddit.com/r/droidappshowcase/about/rules
- r/iOSApps: https://www.reddit.com/r/iOSApps/about/rules
- r/Twitch change: https://www.reddit.com/r/Twitch/comments/1uy704w/rtwitch_upcoming_rule_change_for_app_tool_service/
