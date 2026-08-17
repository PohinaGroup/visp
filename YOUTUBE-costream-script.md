# "Send your OBS to your co-streamer AND to Twitch — one upload"

**Type:** tutorial · **Length:** 9–10 min · **Slot:** Tier 1 companion to video 2
in [YOUTUBE.md](YOUTUBE.md) · **Thumbnail:** two OBS windows side by side, one
arrow splitting to a friend's PC and to Twitch, text `ONE UPLOAD. TWO PLACES.`

**Search intent:** "how to send OBS to another OBS", "co-stream guest camera
OBS", "OBS to friend low latency", "NDI over internet".

**The one-line limitation to state on camera:** your friend receives your
contribution feed with SRT buffer added — this is low latency, not zero latency,
and it does not replace a voice call for timing.

Bracketed lines are direction. Everything else is spoken.

---

## 0:00–0:40 — Cold open, finished result first

> [Two-machine split screen. LEFT: my OBS, a normal overlay-heavy scene, "LIVE"
> in the status bar. RIGHT: my friend's OBS on a different machine, in a
> different city, with my full program feed sitting in their scene as a source
> next to their own camera. THIRD window: the actual Twitch player, live.]

This is my OBS. This is my friend's OBS — different city, different machine.
My whole production, overlays and all, is sitting inside *their* scene as a
source they can move, crop and switch.

> [Cut to Twitch player, unmuted for two seconds.]

And at the same time, that exact same output is live on my Twitch.

One upload from my PC. Two places. My upstream doesn't know the difference.

Here's the whole setup, and here's the part that's going to annoy you, because
there is one.

---

## 0:40–1:45 — Why the obvious ways are bad

> [Screen recording of each bad option, five seconds each. Be fair to them.]

If you've co-streamed before, you've tried these.

**Discord screen share.** Free, it's already open, and it looks like it. You are
handing your friend a re-compressed 1080p at whatever Discord feels like today,
and you cannot key or crop it cleanly.

**Your friend capturing your Twitch page in a browser source.** This actually
looks fine — it's the platform encode. But you're now twenty to thirty seconds
behind yourself, so nobody can react to anything, and you've added a full
transcode round trip.

**A second output in OBS.** This is the one people assume works. It doesn't
solve it — RTMP goes to a *server*, and your friend's OBS isn't a server. And
even if you point it at one, you're now uploading your show twice from the same
connection.

> [Ping the upload meter to show a doubled upload.]

**NDI over the internet.** Great on a LAN. Over the internet it's a VPN project
and a bad evening.

What we actually want: upload **once**, and have something else do the fanning
out. That's the whole idea.

---

## 1:45–2:30 — What's actually happening

> [Simple diagram, no animation budget. Three boxes.]

Your OBS publishes one SRT feed to a relay. From there two things happen,
independently.

One: **Direct** takes that feed and does a separate distribution encode straight
to Twitch. Your stream key never leaves the relay — you'll see how in a second.

Two: your friend opens a **read URL** as a Media Source in their OBS and pulls
the same feed down. That path is never transcoded. What they get is your
contribution feed exactly as you sent it.

> [Highlight the split point on the diagram.]

Two consumers, one upload. And they're independent — if Twitch throws a fit,
your friend's source keeps playing, and vice versa.

Say it the honest way: your friend is *not* watching what Twitch viewers watch.
They're watching the feed Twitch is encoded *from*. Usually that's better.
Always it's different.

---

## 2:30–4:15 — Setup part one: OBS → the relay

> [Portal, unedited, including the waiting.]

Sign in to the portal. Twitch, Kick or Google, whatever you already have.

**Video sources → Add device.** Name it something you'll recognise at 2am —
mine's "Studio PC". Copy the URL.

> [Show the copy button. Blur the secret in post, and say you're blurring it.]

That's an SRT URL with your publish credential in the stream ID. It's blurred
here because it *is* the credential. Treat it like a stream key.

Now OBS. **Settings → Stream → Service: Custom.** Paste that whole URL into
Server. Leave Stream Key **empty** — the credential is already in the URL.

> [Show the empty stream key field. This is the step everyone gets wrong.]

That's it on my side. Start Streaming.

> [Cut to portal, path goes live. Do not cut the four-second wait.]

Portal says the path is live.

Two things worth knowing before you build a workflow on this. One device, one
credential — if you make a second device for your laptop, rotating one doesn't
touch the other. And **one publisher per path at a time.** The first connection
owns it. A second machine cannot quietly pre-connect and take over for a smooth
handoff. If you want a handoff, you want two paths.

---

## 4:15–5:15 — Setup part two: Twitch, without a stream key

> [Dashboard → Direct output.]

**Direct output** on the dashboard. Next to Twitch, **Authorize streaming**.

> [Show the consent screen completely unedited.]

Read that screen. That's the point of this section: I am never pasting a stream
key anywhere. At stream start VISP fetches the key with the consent I just gave,
builds the destination in memory, hands it to the forwarding process, and drops
it when the stream stops. It doesn't come back to the browser, it doesn't come
back to the phone app.

Enable Twitch on the device. Go live.

> [Cut to the Twitch player. Show the "Live" state on the destination card.]

Live. And here's the cost, since every destination has one: each platform you
enable is another encode running on the relay. Your PC still uploads once — that
number does not move — but the relay is doing more work per destination.

One rule, and it's the one that will bite you: **do not also point OBS's own
stream output at Twitch.** That's two publishers on one stream key and Twitch
will kill one of them. Direct owns Twitch now. OBS's job is just to publish to
the relay.

---

## 5:15–6:45 — Setup part three: your friend's side

This is the part they do, and it takes about ninety seconds.

> [Switch to the friend's machine. Actually a second machine, actually a second
> person if you can get them. Their voice on the call sells this whole video.]

**Advanced → OBS read credentials → Reveal read URLs.** Copy the read URL for
this path and send it to them.

> [Show the reveal, blur the secret again.]

On their side: **Sources → Add → Media Source.** Uncheck **Local File**. Paste
the read URL into Input. Set Input Format to `mpegts`. Turn buffering down.

> [Show the black preview.]

Now it's black. Give it a few seconds. This is normal, don't panic, don't
restart it.

> [Wait it out on camera. Feed appears.]

There's my show, inside their scene, as a real source. They can crop it, scale
it, put it in a frame, switch away from it.

Faster alternative if you're setting up more than one path: the portal will
generate a whole scene collection JSON with a Media Source per path and a
Fallback scene, and your friend imports it in one go. **Scene Collection →
Import.** Same result, less clicking.

Now the caveat, and it's a real one: **the read credential is account-wide.**
Handing your friend a read URL is handing them a credential tied to your
account, not a per-guest key with an expiry. Give it to people you'd give your
house key to. And if you ever hit **Rotate read**, understand that it
invalidates *every* Media Source you've ever built, including your own. Rotate
it after a collab if you want to, just do it when you're not about to go live.

---

## 6:45–7:45 — Audio, and the delay nobody warns you about

> [Audio meters visible on both machines.]

Two things will make this sound bad if you skip them.

**First: what you send is your program mix.** That includes your mic. If your
friend takes that feed *and* you're both on Discord, they're hearing you twice,
slightly offset, and it sounds like a haunted house.

> [Demo the echo for three seconds. It's funnier than describing it.]

Fix it the way broadcast has fixed it forever: one source of your voice. Either
they mute you on Discord and take your voice from the feed, or you send them a
mix without your mic. Pick one, decide before you go live, not on air.

**Second: the delay is real.** I measured mine.

> [Clock on my screen, clock on their capture, both in frame. Give the real
> number: `[MEASURED: ___ ms]`. Do not round it in your favour.]

That's the SRT buffer plus their player buffer. It's low latency. It is not zero
latency, and if you both try to be spontaneous over it you will talk over each
other. Voice stays on the call, where it's fast. Video comes down this pipe.

You can tune the buffer down, and the dashboard has a probe that measures your
actual round trip and does the maths — wired is three times RTT, minimum
120 milliseconds. Tune it on the network you'll actually be on. Under-tune it
and you don't get a faster stream, you get a stuttering one.

---

## 7:45–8:45 — Break it on purpose

Nothing here survives your internet dying. What it *can* do is fail politely.

> [Pull the ethernet cable on the sending machine. Real cable, on camera.]

Watch three windows.

> [Friend's OBS: source stops. Their Advanced Scene Switcher macro flips to a
> Fallback scene after the debounce. Twitch: whatever actually happens —
> show it truthfully, including anything ugly.]

Their side switched to a fallback scene on its own. That's Advanced Scene
Switcher — and one detail, because it's the mistake everyone makes: use a
**Media** condition, not a Source condition. Source checks visibility and can
deadlock. Media checks playback. Playing for two seconds to switch in, stopped
for three seconds to switch out. Without the debounce it flaps.

> [Plug it back in. Timer on screen showing total elapsed.]

Back. Total gap: `[REAL NUMBER]`.

> [Leave in whatever went wrong. If the reconnect was slow, say so.]

---

## 8:45–9:30 — Recap and CTA

So: one upload from your PC, publishing once to a relay. Twitch gets a proper
distribution encode and never sees a pasted stream key. Your friend gets your
clean contribution feed as a real source they can composite.

The things I'd want you to remember, all of them the annoying ones:

- Direct owns Twitch. Don't point OBS at Twitch as well.
- The read credential is account-wide, and rotating it kills every Media Source.
- One publisher per path. No seamless handoff.
- There is a delay. Keep voice on the call.

And if you want it both directions — them appearing in your show too — it's the
same setup mirrored: they create their own device, they publish, you take their
read URL. Two paths, two uploads, one each.

> [Diagram: the mirrored version, five seconds.]

VISP is free during beta, it's GPL-2.0 if you'd rather run the whole relay
yourself, and there's a video on doing exactly that.

> [End card. Link to video 2 — "Turn any phone into an OBS camera" — for anyone
> who wants a remote *camera* rather than a remote *program feed*.]

---

## Shot list

| Shot | Notes |
| --- | --- |
| Two machines, genuinely separate | A VM on the same box will look fake and the latency number will be a lie |
| Friend's real voice on the call | The single highest-value thing in this video |
| Upload meter during OBS publish | Proves the "one upload" claim |
| Twitch consent screen, uncut | The no-stream-key claim needs to be seen, not said |
| Black Media Source preview + the wait | Do not cut this; it's the #1 support question |
| Echo demo, unfixed then fixed | Three seconds, no more |
| Clock-to-clock latency measurement | Real number, both clocks in one frame |
| Cable pull + fallback switch + recovery timer | Leave the failure in |

## Description

```text
Send your OBS program feed to a co-streamer's OBS and to Twitch at the same
time — with one upload from your PC.

VISP is free during beta — https://visp-stream.com/?utm_source=youtube&utm_medium=organic&utm_campaign=longform&utm_content=costream
Docs: https://docs.visp-stream.com
Source (GPL-2.0): https://github.com/PohinaGroup/visp

What this does NOT do: it does not remove latency. Your friend receives your
feed with an SRT buffer added — low latency, not zero. Keep voice chat on a
separate call.

Chapters:
0:00 The result
0:40 Why Discord, browser sources and NDI don't cut it
1:45 How it actually works
2:30 OBS → relay
4:15 Twitch without a stream key
5:15 Your friend's side
6:45 Audio and latency
7:45 Pulling the cable on purpose
8:45 Recap
```
