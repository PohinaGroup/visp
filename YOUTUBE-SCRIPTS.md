# VISP shooting scripts

Full voice-over and edit direction, ready to record. Idea slate and series rules
live in [YOUTUBE.md](YOUTUBE.md); claims are bound to the published posts in
`apps/web/content/blog/` and must not drift from them.

**Format:** `VO` is spoken verbatim. `EDIT` is what's on screen. `SUPER` is
burned-in text. Timings are targets, not locks — the demo stretches will run
long on the day and that's fine.

**Rules that apply to both scripts:**

- Every price gets an on-screen `Public list prices · checked August 2026` super
  the first time it appears. Prices move; the video should date itself honestly.
- Disclose in the first 30 seconds that you built VISP. Not in the description —
  out loud, on camera.
- Never say the competitor is bad. Both of these products are good and the
  script only works if the viewer believes you mean that.
- Show the free path failing at its real ceiling. A comparison where your own
  product never struggles is the one nobody believes.

**Claims checked against the code, August 2026.** Each of these is where a
script can drift into a lie; the file that settles it is named.

| Claim as spoken | Ground truth |
| --- | --- |
| "The relay encodes per destination" | One FFmpeg child per destination, `libx264 -preset veryfast -profile:v main`, AAC stereo 128k/48k — `deploy/relay/visp-snapshot:130-136`, loop at `:355`. Never stream-copied. |
| "Any combination it has capacity for" | Admission reserves one slot per destination against a **per-relay** cap and refuses the publish when full — `packages/api/src/direct.ts:788`. `DIRECT_MAX_FORWARDERS` (default 2) only bootstraps the first relay; the live cap is set per relay in the admin console. **Never promise a fixed number of simultaneous platforms in a script** — say "any combination it has capacity for" and let the fail-early check be the feature. |
| "The key never comes back to the phone" | Built in memory server-side, never returned to a client, never stored as a separate DB value — `packages/api/src/direct.ts:96-99`. Note the honest limit: keys **do** appear in FFmpeg's argv on the relay, which is why `deploy/README.md:106` requires `hidepid`. Don't claim the key exists nowhere. |
| "The bot runs on the servers" | `startChatBots` runs in `apps/server/src/index.ts` — the **app host**, not the relay. The relay only reports source state through MediaMTX hooks. Do not say "runs on the relay"; that was wrong in three published places and has been corrected. |
| "BRB holds the broadcast" | Real, and a held forwarder still burns an encoder slot — `packages/api/src/direct.ts:34`, `brb.ts:20`. It cannot hold forever. |
| "SRTLA bonding into the relay" | Shipped: `deploy/systemd/srtla-rec.service` runs upstream BELABOX `srtla_rec 5000 127.0.0.1 8890`, with an end-to-end test at `deploy/relay/srtla-rec.test.sh`. The URL is offered in the portal — `packages/api/src/relay.ts:464`. |
| "Our app doesn't aggregate" | Correct. The app uses SRT socket groups (broadcast/backup duplication), not SRTLA — see `PLAN-SRTLA.md`. Keep saying so until that plan ships. |
| "Commands like !bitrate" | `!bitrate !uptime !viewers !commands !discord`, plus mod-gated `!title` and custom commands — `packages/api/src/chat/commands.ts`. |

---

# Script 1 — "IRLToolkit alternatives: what the $129 actually buys"

**Target length:** 9–10 min · **Thumbnail:** an invoice split into three
line-items, one circled, text `YOU NEED ONE OF THESE`

**Angle:** don't argue about the price. Unbundle it. IRLToolkit sells three
things in one subscription; most buyers need exactly one of them, and that one
is the cheapest to replace.

**Source of truth:** `/blog/irltoolkit-alternative`.

---

### 0:00–0:30 · Cold open

**VO:**
> IRLToolkit is a hundred and twenty-nine dollars a month. A hundred and
> seventy-nine for the advanced plan. And I want to say this before anything
> else, because the rest of this video will make more sense if you know where I
> stand: it's a good product. It solves a real problem. For a lot of full-time
> IRL creators, that price is completely justified.
>
> It's also the wrong purchase for a lot of the people who make it. Not because
> it's overpriced — because they only need one of the three things it sells.

**EDIT:** Cold open on the pricing page, real, unedited, scrolled slowly.
Cut to you on camera for the second paragraph. No music yet.

**SUPER:** `$129 / mo — Standard` · `$179 / mo — Advanced` ·
`Public list prices · checked August 2026`

---

### 0:30–1:00 · Disclosure and the promise

**VO:**
> Quick disclosure: I build a free thing that competes with part of this. I'll
> show you exactly which part, and I'll be just as clear about the parts it
> doesn't touch — because if you buy the wrong tool off the back of my video,
> you'll be back in a month and I'll have wasted your money and my credibility.
>
> So here's the whole video in one sentence: that subscription is three products
> in a trench coat, and you should find out which one you're actually buying.

**EDIT:** Straight to camera. Then a three-slice invoice graphic building in as
the last line lands — hold it, it's the spine of the video.

---

### 1:00–3:15 · Unbundling the invoice

**VO:**
> Item one: a computer you don't own.
>
> Cloud OBS means OBS is running on somebody else's machine, so yours can be
> off. No power bill, no machine to babysit, no "did I leave it running." For
> most people I talk to, this is the actual purchase. This is the thing they're
> paying for. Hold that thought, because it's also the cheapest one to replace.
>
> Item two: scenes, overlays, and alerts — in the cloud.
>
> Starting screens. Sponsor bugs. A chat overlay. Someone switching scenes while
> you walk. If your show has production value beyond "here's my camera," this is
> the real reason to pay, and I'm not going to pretend otherwise.
>
> Item three: SRTLA bonding.
>
> Multiple network connections aggregated into one pipe. Not two copies of your
> stream — one stream, split across two links, so weak connections add up
> instead of taking turns. If your stream is your income and your route is
> unpredictable, this isn't a luxury. It's insurance.
>
> Three products. One bill. Now — which one is yours?

**EDIT:** One panel of the invoice graphic lights per item, the other two dim.
Under each, 10–15 seconds of literal b-roll: a home PC powering off; a
scene-heavy stream with overlays and a sponsor bug; a two-link connection graph
with one link dying and the bitrate holding.

**SUPER (per item):** `1 · A COMPUTER YOU DON'T OWN` · `2 · CLOUD SCENES` ·
`3 · BONDING`

---

### 3:15–5:30 · Replacing item one for free

**VO:**
> If your answer is item one — you just don't want a PC running at home — that
> stopped needing a subscription.
>
> Here's what I built instead. The phone sends one feed to a relay. The relay
> does the encoding and delivers it straight to Twitch, Kick, or YouTube — any
> combination the relay has encoder capacity for, and it checks that *before*
> you go live rather than failing once viewers are watching. There's no OBS
> anywhere in that path — not in your house, not in the cloud. Nothing to rent,
> because there's no computer in the middle to rent.

*(demo, largely carried by the footage)*

> Sign in. Authorize the platforms — and watch this, because it matters: the
> stream key is resolved on the server while the output is running, and it never
> comes back to the phone. There's no key field. There's nothing to paste. If I
> lose this phone in a crowd, nothing leaks.
>
> Camera, mic, Go Live. That's the whole setup.

**EDIT:** Screen recording, unedited, including the waits. Three platform players
side by side going Live in sequence — hold on all three lit up for a beat.
Push in on the destination list to show there is no key field.

**SUPER:** `NO PC IN THE PATH` · `FREE DURING BETA`

---

### 5:30–6:45 · The drop, and the honest ceiling

**VO:**
> Second thing you were paying for, quietly: what happens when the signal dies.
>
> Watch. I'm killing the connection on purpose.

*(beat — let it play, no VO over the drop)*

> The camera's gone. The broadcast isn't. There's a BRB card holding it, and the
> bot has already told chat what happened — and that bot runs on the servers, not
> on anything I'm carrying, so it works with my computer off and my phone in my
> pocket. When the signal comes back, it posts again with how long I was out.
>
> That used to be a paid feature. It isn't any more.
>
> Now here's where it stops. That was a dropout. It recovered. But if I walk
> somewhere with genuinely no coverage, or where one carrier can't carry the
> bitrate at all — nothing on this screen saves me. The BRB card holds the
> broadcast, and I'm still standing in a field with no stream.

**EDIT:** Two-camera: phone screen and viewer-side player, side by side, with a
running timer. Do not cut the dead air during the drop — let it be uncomfortable.
Then a second clip: a real dead zone where recovery takes long enough to be a
problem. Leave that in.

**SUPER:** `BRB card · chat alert · from the relay` then `THIS IS THE CEILING`

---

### 6:45–8:15 · Who should still pay

**VO:**
> So let's be honest about who should close this video and go buy the
> subscription.
>
> One. You need bonding, from one device, in your pocket. My app duplicates your
> connection across Wi-Fi and cellular — that survives a link dropping out, but
> two half-speed connections do not add up to one fast one. They never will. If
> you need bandwidth and you can't carry a second box, buy a service that bonds
> inside its own app.
>
> Two. A moderator runs your show while you walk. Cloud OBS with dashboard
> access is built for exactly that, and I have nothing that does it.
>
> Three. Your show is scene-heavy and you're never near a computer. That's cloud
> OBS. That's the whole product.
>
> Four. Downtime costs you money. If one lost sponsored stream costs more than a
> month of subscription, you're not buying features, you're buying someone to
> call. That's worth a hundred and twenty-nine dollars and I won't pretend it
> isn't.
>
> And one more, because people get this backwards — if what you actually need is
> bonding, I'd rather you spent that money on a BELABOX box than on a
> subscription. It's yours, it's a one-time cost, and it publishes straight into
> my relay over SRTLA. Real aggregation, on the free tier, because the bonding
> is happening in the hardware you own.

**EDIT:** Four cards, one per reason, on screen as you say them. Then a hard cut
to a BELABOX box being pointed at a VISP SRTLA URL — this beat needs real
footage, not a diagram.

**SUPER:** `Moblin / BELABOX → SRTLA → UDP 5000`

---

### 8:15–9:15 · How to actually test it

**VO:**
> If you want to settle this properly, test it — but test it fairly, because
> almost nobody does.
>
> Same route. Same phone. Same resolution, same target bitrate. Run the free path
> first and write down three things: where the connection got unstable, whether
> the phone got hot, and whether anyone in chat actually missed the overlays.
> Then trial the paid service on that same route.
>
> Change one thing at a time. If you swap the route and the encoder together,
> you've learned nothing.
>
> And watch the finished broadcast, not the preview on your phone. The preview
> always looks fine. The broadcast is what your viewers get.
>
> You might find out cloud OBS fixed your production but not your weak signal.
> Or that bonding fixed the route and nobody missed the scenes. Those are
> completely different purchases, and after one afternoon you'll know which one
> you're making.

**EDIT:** Simple checklist card, items ticking on. Split-screen of phone preview
vs the actual platform player during a rough patch — the difference sells the
point better than the VO does.

---

### 9:15–9:45 · Close

**VO:**
> IRLToolkit is better if you need a studio you don't operate. That's real, and
> it's most of what the price is.
>
> But if what you needed was just a computer you don't own — you already have
> one. It's the phone.
>
> Try the free one first. Worst case, you find out exactly which line on that
> invoice you're paying for.

**EDIT:** Back to the three-slice invoice, item one struck through. Product mark,
URL, and the honest-limits card held for a full three seconds.

**SUPER:** `visp-stream.com · free during beta · GPL-2.0`
`App duplicates links, it does not aggregate. No hosted OBS. No zero-drop claim.`

---

# Script 2 — "Streamable.run vs VISP: two signal paths"

**Target length:** 8–9 min · **Thumbnail:** two signal-chain diagrams stacked,
one with a box circled, text `DO YOU NEED THE BOX?`

**Angle:** not a feature table. An architecture comparison. Streamable.run puts
a compositor in the path; VISP takes it out. Everything else follows from that
one difference — including the part where a compositor is the right call.

**Source of truth:** `/blog/streamable-run-vs-visp`.

---

### 0:00–0:30 · Cold open

**VO:**
> These two products look like competitors and they're really not. They're two
> different shapes.
>
> Streamable.run runs a full OBS in the cloud — your camera goes there, it gets
> composed with scenes and overlays, and the finished program goes out to the
> platform. What I build takes the compositor out of the path entirely. Phone,
> relay, platform.
>
> Every difference in price, in features, in what breaks — comes out of that one
> structural choice. So let's start there instead of with a feature table.

**EDIT:** Two clean signal-chain diagrams, drawn on screen as you describe them,
stacked. Leave both up. This graphic is the whole video and it should be good.

**SUPER:**
`Streamable.run: encoder → ingest → cloud OBS → platform`
`VISP Direct: phone → relay encode → platform`

---

### 0:30–1:00 · Disclosure

**VO:**
> I built one of these, so treat everything I say accordingly. What I'll do to
> earn it is be specific about the two things Streamable.run does that I have no
> answer to at all — and one of them will probably decide this for you.

**EDIT:** Straight to camera, no graphics. Short, then move.

---

### 1:00–2:30 · What the compositor is for

**VO:**
> A cloud OBS is a production computer you rent. Your feed arrives, it gets
> composed — scenes, browser sources, alerts, overlays — and someone who is not
> you can drive it while you're outside.
>
> That last part is the bit people underrate. A remote operator can cut to a BRB
> scene the moment your coverage dies, run sponsor graphics, pull in another
> source, and watch the output while you're busy walking and talking. If your
> channel has a producer, or a mod who does that job, the compositor is doing
> real work every single stream.
>
> That's what the monthly bill replaces: a computer, its power, its internet, and
> some of the operational work around it.

**EDIT:** Real footage of a produced IRL stream — overlays, sponsor bug, scene
cut. Then a mod dashboard view. Borrow nothing proprietary; shoot your own
equivalent or use clearly-credited public marketing material.

---

### 2:30–4:15 · What happens when you delete it

**VO:**
> Now take the compositor out.
>
> The phone encodes once and sends one feed to a relay. The relay re-encodes it
> per destination and delivers it — Twitch, Kick, YouTube, in any combination it
> has encoder capacity for. One phone upload, however many platforms.
>
> No computer at home. No computer in the cloud. There's no compositor to rent
> because there's no compositor.
>
> And if the program *is* just the camera — a walk, a ride, an event, a
> talking-head segment — then a compositor was never changing the picture. It was
> a cost and an extra thing that can break, sitting between you and the platform.

*(demo)*

> And when you do want production, the same feed reads into your own OBS as a
> media source. Your scenes, your alerts, your plugins, your local recording.
> Simple sessions stay simple; produced sessions get the full studio. Same tool.

**EDIT:** Screen recording of Direct going live to multiple platforms. Then a cut
to OBS at home pulling the same contribution feed into a real overlay-heavy
scene. The transition between those two shots is the strongest 5 seconds in the
video — hold it.

**SUPER:** `One upload. Per-destination encode.`

---

### 4:15–6:00 · The distinction that should decide it

**VO:**
> Here's the part I said would probably decide this for you, and it's the one
> that gets lied about most in this category. So slowly:
>
> **Bonding** coordinates multiple connections so their capacity adds up. Two
> weak links become one usable link. It keeps a high-bitrate stream moving where
> no single carrier could carry it alone.
>
> **Packet duplication** — which is what my app does — sends the same data down
> both links. Lose one, delivery continues. That's genuinely useful. But the
> stream still has to fit through either link on its own. Two 2-megabit
> connections do not become a 4-megabit connection. They stay two 2-megabit
> connections carrying identical copies of the same thing, and you pay for both.
>
> Those are different words for different behavior, and the marketing in this
> whole industry blurs them constantly. If your route has places where one
> carrier genuinely can't sustain your bitrate, you need the first one, and I do
> not have it in my app.
>
> What I do have is the relay accepting SRTLA. So if you already run Moblin, or
> you own a BELABOX box, you get real aggregation into my free tier today —
> because the bonding is happening in your encoder, not mine.
>
> If you don't want to carry a second device: pay Streamable.run. That's the
> honest answer.

**EDIT:** Two animated diagrams, deliberately slow. Diagram A: one packet stream
splitting across two links, both bars filling, throughput adding. Diagram B: two
identical streams, both bars full, throughput flat. Put the numbers on screen —
`2 + 2 = 4` vs `2 + 2 = 2`. Then real footage: Moblin's SRTLA config pointed at
a VISP URL.

**SUPER:** `AGGREGATION ≠ DUPLICATION` · `SRTLA ingest · UDP 5000`

---

### 6:00–7:00 · Cost, counted properly

**VO:**
> On price — compare it to the system it replaces, not to another subscription.
>
> Count the production computer, the relay capacity, the operator access, the
> support, and any encoder or extra data plan you'd need either way. If building
> and babysitting your own OBS host would eat hours you'd otherwise be paid for,
> the subscription is the cheaper path. That's a real calculation and it doesn't
> always land where I'd like it to.
>
> Then count the cost of failure, because it's not the same number for everyone.
> A full-time creator paying for a managed workflow and someone to call is being
> rational — one lost sponsored stream costs more than a month of service. Someone
> testing whether they even enjoy IRL streaming should not be carrying that fixed
> cost before they know.

**EDIT:** A cost sheet building line by line — including the lines that favor
paying. Ending totals stay on screen without a winner declared.

---

### 7:00–8:00 · The decision, out loud

**VO:**
> So:
>
> Pay Streamable.run when a remote producer switches your scenes. When overlays
> and holding screens are in every show. When bonding is genuinely required on
> the routes you actually walk. When downtime has a number attached to it.
>
> Start with mine when the camera *is* the program. When you want to find out if
> IRL streaming is even your thing. When you use OBS sometimes but not every
> session. When one connection can carry a sensible bitrate. When keeping the
> stream key off the device you're carrying matters to you.
>
> And you don't have to decide up front. Start with the smaller system, run a few
> real streams on your actual route, and see which piece is missing. If it turns
> out to be remote scene control or bonding, you'll be buying a subscription with
> evidence instead of a guess — and you'll know precisely which feature you're
> paying for.

**EDIT:** Two columns of criteria, filling in as spoken. Both columns end equally
full — do not make yours longer. That symmetry is the argument.

---

### 8:00–8:30 · Close

**VO:**
> Streamable.run is a managed remote studio. Mine is transport and delivery.
>
> When the studio is doing real work, pay for it. When it isn't, the shorter
> signal path wins.
>
> It's free during beta. Go find out which one you are.

**EDIT:** Back to the two signal-chain diagrams from the cold open, side by side,
neither struck through. Product mark, URL, limits card, three full seconds.

**SUPER:** `visp-stream.com · free during beta · GPL-2.0`
`No cloud OBS. App duplicates links, it does not aggregate. No zero-drop claim.`

---

## Notes for the edit bay

- **The concession beats are the retention.** Do not trim 6:45–8:15 in script 1
  or 4:15–6:00 in script 2 for pace. Those are the sections that make the rest
  believable, and they're where a skeptical viewer decides to trust the video.
- **Don't score the drop tests.** Music under a signal failure reads as staged.
  Let the silence sit.
- **Prices go stale.** Both scripts pin them with an on-screen date. When
  `COMPARISON_CHECKED` in `apps/web/src/lib/comparison.ts` moves, add a pinned
  comment rather than re-cutting.
- **Description for both:** link the matching blog post first, then the product
  and repo. The post carries the full table and the video carries the argument;
  each should send people to the other.
