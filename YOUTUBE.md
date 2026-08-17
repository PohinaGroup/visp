# VISP long-form YouTube plan

Companion to [MARKETING.md](MARKETING.md), [REDDIT.md](REDDIT.md), and
[TIKTOK.md](TIKTOK.md).
This file is only about 8–20 minute videos on the VISP channel.

**Staleness warning:** MARKETING.md (checked 19 July 2026) still says "do not
claim bonded internet" and pitches OBS-first. The product moved: Direct output
is now the default path (phone → relay → Twitch/Kick/YouTube, OBS optional),
and every relay accepts SRTLA on UDP 5000. The bonding claim is now defensible
**for SRTLA senders** (Moblin, BELABOX) and still **not** defensible for the
native app's SRT-group mode, which duplicates packets rather than aggregating
bandwidth. Keep that split straight in every script.

---

## What the channel is for

Long-form does one job shorts cannot: **remove the "will this actually work for
me?" objection before signup.** A viewer who watches 9 minutes of a real setup
has already done the setup in their head.

Two formats, different jobs:

| Format | Job | Success metric |
| --- | --- | --- |
| Commercial (demo-led) | Make someone want the workflow | Click-through to visp-stream.com |
| Tutorial (task-led) | Make someone finish setup | Setup completion, first picture |

Ratio: publish 2 tutorials for every 1 commercial. Tutorials earn search
traffic forever; commercials only work while they are being pushed.

### Honesty guardrails for every script

Burn these into the edit, not just the description:

- SRTLA bonding aggregates bandwidth. The native app's dual-link mode duplicates
  packets — more resilience, roughly double the mobile data, no extra headroom.
- Direct re-encodes per destination on the relay. The relay-to-OBS path does not.
- A dropped source is held by the BRB card or an OBS fallback scene. That is
  graceful recovery, not "never drops."
- One publisher per path. A second device cannot pre-connect for a seamless handoff.
- VISP never receives your Twitch or Kick stream key.

Say the limitation out loud in the same breath as the feature. On this audience
— people who have already been burned by a dropped IRL stream — the caveat is
the credibility.

---

## Tier 1 — the three tutorials that convert

### 1. "Stream to Twitch, Kick and YouTube at the same time — from your phone"

**Type:** tutorial · **Length:** 9–11 min · **Thumbnail:** phone in hand, three
platform logos, text `ONE PHONE → 3 PLATFORMS`

The highest-intent search on the whole list. Multistreaming from a phone with
no PC is a query people type with a credit card already out.

| Time | Beat |
| --- | --- |
| 0:00–0:35 | Cold open on the finished result: three browser windows, all live, one phone on a tripod. "No PC in this room. Let me show you how." |
| 0:35–1:20 | What Direct actually is: the phone encodes once, the relay makes a separate encode per destination. Whiteboard/diagram, 20 seconds max. |
| 1:20–2:00 | The honest bit: each destination costs relay CPU; your phone uploads once. And VISP never sees your stream key — you authorize with OAuth. |
| 2:00–4:30 | Sign in with Twitch. Authorize Direct per platform. Show the consent screen unedited, including the YouTube "creates a new public broadcast" behavior. |
| 4:30–6:30 | Install the app, pick camera + mic, confirm READY, Go Live. Show the capacity reservation failing gracefully if you can trigger it. |
| 6:30–8:00 | Verify all three say **Live**. Cut to each platform's actual player. Show the chat bot's "Now live." message landing in all three chats. |
| 8:00–9:30 | Settings worth touching on day one: bitrate, latency profile, mic selection. Everything else stays default — say that explicitly. |
| 9:30–10:30 | "What if you want OBS in the path?" 40-second teaser → next video. CTA. |

**Description hook:** the three-platform simultaneity, the no-stream-key claim,
and a chapter list. Chapters matter more than tags for this one.

---

### 2. "Turn any phone into an OBS camera — from anywhere in the world"

**Type:** tutorial · **Length:** 12–14 min · **Thumbnail:** split frame, phone
outdoors / OBS at a desk, text `PHONE → OBS, ANYWHERE`

The original wedge, and still the video that converts the OBS creator who
already has scenes, alerts, and graphics they refuse to abandon.

| Time | Beat |
| --- | --- |
| 0:00–0:30 | Finished workflow first: phone outside, OBS at home showing it as a real media source inside an existing overlay-heavy scene. |
| 0:30–1:30 | Frame the problem honestly: mobile encoder apps rebuild your show on a phone. This does the opposite — the phone is just a camera; the studio stays home. |
| 1:30–3:00 | Create a publishing device. Explain independently revocable credentials and why that matters when you hand a phone to a friend. |
| 3:00–5:30 | Install the OBS 31 plugin. Tools → VISP Remote Control → sign in with browser → approve the code. Say plainly: the plugin dials out, it opens no inbound port on your machine. |
| 5:30–7:30 | One-click media source import. Then show the manual path (copy the SRT read URL into a Media Source) for anyone who won't install a plugin. |
| 7:30–9:30 | Import the scene collection JSON: Scene, Fallback, one source per path. Show the black preview and the "wait a few seconds" reality — do not cut that out. |
| 9:30–11:30 | Control OBS from the phone: scene switch, start/stop. Then the same from remote.visp-stream.com and the Apple Watch. |
| 11:30–13:00 | The read-credential trap: **Rotate read** invalidates every existing Media Source. When to use it, when not to. |
| 13:00–14:00 | Recap + link to the fallback video. |

---

### 3. "Your IRL stream will drop. Here's how to make viewers not care."

**Type:** tutorial · **Length:** 10–12 min · **Thumbnail:** a BRB card with a
red `SIGNAL LOST` badge, text `IT DROPPED. NOBODY LEFT.`

The single most emotionally loaded problem in IRL. Also the most over-promised
category on YouTube, which is exactly why an honest version wins.

| Time | Beat |
| --- | --- |
| 0:00–0:45 | Kill the phone's connection on camera. Viewer-side player keeps running on the BRB card. Chat gets "Signal dropped — back shortly." Reconnect. Total elapsed shown on a timer. |
| 0:45–2:00 | Set expectations: nothing keeps the *camera* alive through a dead zone. The goal is that the *broadcast* survives and the audience is told what's happening. |
| 2:00–4:00 | Direct path: the BRB card, the chat bot's dropped/back messages with `{downtime}`, and how "stream ended" differs from "signal dropped." |
| 4:00–7:00 | OBS path: Advanced Scene Switcher macros. **Media** conditions, not Source conditions — explain the deadlock, it is the mistake everyone makes. Playing for 2s → live scene; Stopped for 3s → Fallback. Show the flapping that happens without debounce. |
| 7:00–9:00 | Latency tuning as prevention: run the dashboard probe on the network you'll actually use, apply the profile multiplier (wired 3× / Wi-Fi 4× / cellular 6× RTT), and show what an under-tuned cellular buffer looks like on the destination. |
| 9:00–11:00 | Three real-world drills: elevator, tunnel, crowded venue. Report what actually happened, including anything that went badly. |
| 11:00–12:00 | "The next level is bonding" → next video. |

Leave one failure in the final cut. A tutorial where everything works first try
reads as an ad.

---

## Tier 2 — the two commercials

### 4. "I ran a full IRL show for a day with nothing but a phone"

**Type:** commercial (documentary) · **Length:** 15–18 min · **Thumbnail:**
you outdoors, phone rigged, text `NO BACKPACK. NO PC.`

Not a feature tour — a day. Coffee shop, transit, a walk with genuinely bad
coverage, an indoor venue, home at the end. The product appears only when it's
being used. Cut in real chat reactions. Show the moments it struggled.

Structure it as chapters by location, not by feature. Every VISP appearance is
a 15–30 second insert: switching scenes from the wrist while holding a coffee,
the BRB card catching a tunnel, `!bitrate` answering a chat backseater.

End on the honest summary card: what worked, what didn't, what it cost in
mobile data. This is the video the affiliate hardware reviewers will reference.

---

### 5. "Moblin vs IRL Pro vs VISP — pick the right one, honestly"

**Type:** commercial (comparison) · **Length:** 12–15 min · **Thumbnail:**
three logos, text `WHICH ONE, ACTUALLY?`

Comparison videos are the highest-converting long-form format in this niche and
the most abused. Win by giving ground: name the cases where Moblin or IRL Pro
is the better choice and mean it.

Axes to compare on camera, each with a live demo:

1. Where the production lives (on the phone vs at home vs on the relay).
2. Multistreaming without a PC.
3. Bonding: Moblin/BELABOX SRTLA into a VISP relay is the *same protocol* — say
   that clearly, it makes VISP look confident rather than defensive.
4. Remote control surface (phone, browser, watch).
5. Cost and lock-in: hosted beta vs GPL-2.0 self-hosting.
6. Who should NOT use VISP: single-platform phone streamers with no OBS and no
   interest in one — Moblin direct is simpler and that's fine.

Give credit generously. The IRL community is small and it talks.

---

## Tier 3 — evergreen search and authority

### 6. "Bond Wi-Fi + 5G properly: SRTLA into your own relay"

**Type:** tutorial · **Length:** 12–15 min · **Thumbnail:** two signal bars
merging into one, text `TWO LINKS. ONE STREAM.`

The video the affiliate program was designed to sit next to.

- The distinction that earns trust in the first 90 seconds: duplicating a stream
  over two links doubles your data bill and buys you failover; SRTLA sends each
  packet once and scores links by in-flight window, so you actually gain headroom.
  Say which one the VISP native app currently does (duplication) and which one
  the relay accepts from third-party senders (SRTLA, UDP 5000).
- Moblin setup: paste the `srtla://` URL, enable connections under
  Settings → Streams → SRT(LA).
- BELABOX setup: receiver server = relay host, port 5000, same stream ID.
- Latency: tune as if the *weakest* link carried the stream alone — the cellular
  row, 6× RTT, 600 ms minimum.
- Fallback: if UDP 5000 is blocked on the venue's network, plain SRT on 8890
  still works without bonding. Demo that.
- Real bandwidth test: walk a route, show the per-link graph, show a link dying
  and the stream surviving.

### 7. "Why your IRL stream stutters — SRT latency explained in 10 minutes"

**Type:** tutorial (educational) · **Length:** 10 min · **Thumbnail:** a jagged
bitrate graph, text `IT'S NOT YOUR BITRATE`

Pure evergreen SEO. Teach RTT, jitter, retransmission, and why cellular needs a
fat buffer. VISP appears once, as the probe tool that does the math for you.
This video should be genuinely useful to someone who never signs up — that is
what makes it rank and what makes the channel trustworthy.

### 8. "Build your own IRL streaming backend for the price of a coffee"

**Type:** tutorial (technical) · **Length:** 18–20 min · **Thumbnail:** a
terminal beside a phone feed, text `SELF-HOSTED. GPL-2.0.`

Aimed at the self-hoster/video-engineer segment. Low volume, high credibility,
and it converts the people who write the comments that convince everyone else.

VPS → deploy templates → MediaMTX + Caddy + systemd → firewall ports (8890 SRT,
5000 SRTLA, RTMP, WebRTC) → acceptance test → point the phone at it. Then the
honest close: here is what the hosted beta does for you that this doesn't, and
here is what you get that hosted can't give you (your box, your rules, your data).

### 9. "Your stream answers chat while your phone is in your pocket"

**Type:** tutorial · **Length:** 8 min · **Thumbnail:** a phone face-down in a
pocket, chat overlay live, text `IT RUNS WITHOUT YOU`

Small, focused, and it sells a feature people don't know to look for. The chat
bot runs server-side — on the app host, not the relay and not your phone — so it
works with your computer off. Messages post as your own account. Cover the alert
table (live / dropped / back / ended), the command set (`!bitrate`, `!uptime`,
`!viewers`, `!commands`, `!discord`, and mod-gated `!title`), custom wording, and
the chat overlay Browser Source with `&debug=1`. Then the remote surfaces: phone,
remote.visp-stream.com, and the watch.

### 10. "I built an IRL streaming platform — here's what broke" (dev log)

**Type:** community · **Length:** 15–20 min · quarterly, not scheduled tightly

For r/selfhosted, r/VIDEOENGINEERING, and HN spillover. Talk about the SRT
socket-group dead end and the move to SRTLA, encoder capacity reservation,
why the OBS plugin dials out instead of listening, credential rotation design.
Show real code. This is the video that makes technical viewers trust the rest
of the channel — and it is the cheapest one to make, because it's just you
talking about work you already did.

---

## Tier 4 — the "before you buy" series

The strongest format VISP has, because it is the only one where being honest
and being persuasive are the same move. Each video sits in front of a purchase
the viewer is already researching, concedes that the thing they're about to buy
is genuinely better, and then points out that the free option costs nothing to
try first.

**The format, fixed across all six:**

1. **Open on the price card.** Real numbers, held on screen for two full seconds.
2. **Concede the category outright, early and without hedging.** "Backpacks are
   better." Not "backpacks have their place." The concession is the hook — a
   viewer who expected an ad stays for the one that isn't.
3. **Show the free path working**, with its actual ceiling visible.
4. **Name who should still buy the thing**, specifically enough that it's useful.
5. **Close on the same line every time:** *"[X] is better. Try this first —
   it's free."*

Never attack the category. These are tools people saved up for, and half the
audience already owns one. The video that sneers at their purchase loses them
in the first thirty seconds; the video that respects it and offers a free test
gets shared by the people who own both.

Publish these as a labelled series with consistent thumbnails — a price card,
struck through. It compounds: someone who finds one goes looking for the rest.

### 11. Before you buy the backpack

**Length:** 10–12 min · **Thumbnail:** a bonded backpack rig beside two phones,
text `€2,000 vs €0`

Price card: a bonded backpack build — encoder, modems, two data plans, battery,
the bag — against "a phone you own + a phone in a drawer." Then the honest line,
said to camera: **"Backpacks are better. Try this first — it's free."**

Show the free path on a real walk: one phone, Direct to two platforms, the BRB
card catching a dead spot. Then show the ceiling honestly — the moment where a
backpack would have kept going and the phone didn't. Do not cut that moment.

Who should still buy the backpack: anyone streaming for money in unpredictable
coverage, anyone under a contract where a dropped feed costs them, anyone
already at the ceiling you just demonstrated. And if they do buy one — point it
at a VISP relay on UDP 5000, because SRTLA lands there and the chat bot, BRB
card, and OBS control come along with it. That last beat turns a lost sale into
a user.

### 12. Before you renew the cloud OBS subscription

**Length:** 10 min · **Thumbnail:** a renewal invoice, text `$1,548/YEAR`

The most direct money video on the channel. IRLToolkit at $129–179/mo and
Streamable.run at $120–180/mo, against a computer already sitting in the room.

Concede first: **cloud OBS is better if you don't own a capable PC, if you
travel without one, or if you don't want to keep a machine running and updated.**
That is a real segment and it should hear itself described accurately.

Then the free path: the same feed into your own OBS, with your existing scenes,
alerts, plugins, and local recording. Show the electricity and hardware costs
you're not counting, out loud, because someone in the comments will.

Close: "Cloud OBS is better if you don't own the computer. You do. Try this
first — it's free."

### 13. Before you buy a second SIM

**Length:** 9–11 min · **Thumbnail:** two SIM cards, text `DO YOU NEED THIS?`

The most technically honest video in the series, and the one that will get
argued about — which is fine.

Price card: a second data plan, twelve months, plus whatever bonding service
sits on top. Then the distinction, drawn slowly and with a diagram:

- **Duplicating** a stream across two links (what the VISP app does today) buys
  failover and costs roughly double the mobile data. No extra headroom.
- **Aggregating** with SRTLA (Moblin, BELABOX) sends each packet once and
  actually adds the two links together.

Concede plainly: **if you need bandwidth, a second SIM with SRTLA is the answer
and our app is not it yet.** Then show the diagnostic that matters — is your
problem coverage or capacity? Most people assume capacity and have a coverage
problem, which a second SIM on the same carrier does nothing for.

Close: "A second SIM with SRTLA is better. Find out whether you need it first —
that part's free."

### 14. Before you buy a new phone

**Length:** 8–10 min · **Thumbnail:** a phone with a thermal warning, text
`IT'S PROBABLY NOT THE PHONE`

Price card: a flagship upgrade against a €15 phone cooler and a bitrate change.

Concede: **if your phone throttles ten minutes into every stream, a newer one
genuinely fixes that.** Then work the cheaper causes first — resolution and
bitrate above what the encoder can sustain, case on, direct sun, charging while
streaming, background apps. Show a real thermal curve before and after each
change, on camera, with a timer.

The ceiling: show the phone that still dies at twenty minutes no matter what,
and say the upgrade is the right call.

### 15. Before you buy a hardware encoder

**Length:** 11–13 min · **Thumbnail:** a LiveU Solo beside a phone, text
`WHEN HARDWARE WINS`

Price card: LiveU Solo or an equivalent appliance plus its bonding service,
against a phone and a free account.

Concede immediately and specifically: **dedicated hardware with a supported
bonding service is what you buy when a dropped feed has a cost attached** —
client work, live events, anything contractual. An appliance that boots into
one job beats a phone that also receives calls.

Then the free path, and where it genuinely competes: a repeat field camera for
a home production, a second angle, a solo creator's IRL walk. Show both running
the same route side by side and let the footage make the argument.

Close: "Hardware is better when it has to be. If it doesn't have to be yet —
try this first, it's free."

### 16. Before you buy the camera and the capture card

**Length:** 9–11 min · **Thumbnail:** a mirrorless rig beside a phone, text
`CAN YOU TELL?`

Price card: camera, lens, capture card, cables, and a dummy battery against a
phone on a €20 gimbal.

Blind-test it on camera: same scene, same lighting, phone and mirrorless, no
labels until the reveal. Be genuinely fair — shoot the conditions where the
real camera wins (low light, shallow depth, long lens) as well as the ones
where nobody can tell.

Concede: **for a static studio shot, a real camera is worth it and the
difference is visible.** For a moving IRL feed at IRL bitrates, most of that
quality is gone before it reaches the viewer — show the encode eating it.

Close on the series line, and on the actual point: the sensor was never the
bottleneck, the uplink was.

---

## Production kit — shoot once, cut many

One two-day shoot supplies most of the list. Capture masters, cut per video.

**Must-have footage:**

- Screen recording: full first-run flow, unedited, including waits and failures.
- Screen recording: OBS with a real overlay-heavy scene collection, plugin
  install, scene collection import, ASS macro editing.
- Outdoor walk with a genuine coverage hole, filmed from a second camera so the
  drop and the recovery are visible in the real world, not just on a dashboard.
- Destination-side capture of Twitch, Kick, and YouTube players during a drop.
- Per-link SRTLA graph during a walk where one link dies.
- Two phones, two mics, one OBS production, audio meters visible.
- Wrist/watch scene switch, shot tight.

**Per-video description template:**

```text
[One sentence on what the viewer will be able to do after watching.]

VISP is free during beta — https://visp-stream.com/?utm_source=youtube&utm_medium=organic&utm_campaign=longform&utm_content=<slug>
Docs: https://docs.visp-stream.com
Source (GPL-2.0): https://github.com/PohinaGroup/visp

What this does NOT do: [the specific limitation for this video, in one line.]

Chapters:
0:00 ...
```

**Publish order:** 1 → 2 → 12 → 3 → 11 → 6 → 5 → 4, then Tier 3 and the rest of
the "before you buy" series as filler. Ship the Direct multistream tutorial
first: highest search intent, shortest path from watch to signup, cheapest to
produce. Slot 12 (cloud OBS renewal) third — it's the money argument the landing
page already makes, so the video and the site reinforce each other.

Two extra shots the "before you buy" series needs: a locked-off price-card
setup you can re-shoot per video with different numbers, and at least one clip
per video of the free path **failing** at its real ceiling. Without that second
one the concession reads as false modesty.

**Cadence:** one long-form every two weeks is plenty. Each one yields 3–5
shorts from the same masters, which is where MARKETING.md picks it up.
