# "Why VISP" — 70s voice + edit script

**Type:** positioning · **Length:** ~70s · **Use:** pinned short, site hero loop,
first thing anyone sees. Same five beats as `TIKTOK.md`: **problem → credit the
incumbent → the swap → the limit → CTA.** Told as a first-person reason — why
*I* wanted this — not a product pitch.

**Production:** Filmed **indoors only** — desk, phone screen, laptop lid shut,
portal UI. Build the edit from **still photos and screen grabs**, not acted
scenes. No walking outdoors, no "to camera" sincerity takes, no backpack
theatre. Cut pictures on the VO; hold each frame long enough to read. Barlow
SemiBold for spoken lines, IBM Plex Mono for every number and HUD callout. No
neon, no gradients. Color only for signal state — green live, amber degraded,
red lost. Flat delivery, unhurried, never sell. Budget ~2.2 words/second; the
script is written to that, leave the air in.

Bracketed lines are direction. Everything else is spoken.

---

| Time | Shot | On-screen | VO |
|---|---|---|---|
| 0:00–0:06 | Still: phone on a desk tripod. Price crop of a backpack encoder next to it (or stamped over). | `no €2000 backpack` | "I wanted to IRL stream without buying a two-thousand-euro backpack." |
| 0:06–0:14 | Screen record of the bitrate HUD dipping amber and recovering — or three stills from a real run. No outdoor B-roll. | `SRTLA · 2 modems bonded` | "So I run it from my phone. Two connections bonded — when one drops, the other carries it. The stream doesn't." |
| 0:14–0:24 | Photo montage, fair and clean: backpack encoder product shot → hosted-relay dashboard. Hold each ~3s. No acting. | — | "Those backpacks are good. Hosted relays are good too. I wasn't trying to dunk on them — I just didn't want the bill." |
| 0:24–0:32 | Screen: `docker compose up`. Then the portal at your own domain. | `my box · my keys` | "So I put a relay on a cheap VPS I rent. My box, my keys, pocket money a month." |
| 0:32–0:44 | Diagram or portal still: one feed → Twitch, Kick, YouTube. Key field masked. Prefer a flat graphic if the UI is busy. | `1 upload → 3 platforms` / `key never leaves the relay` | "I upload once. The relay encodes out to each platform. My stream key stays on the relay — it never comes back to the phone." |
| 0:44–0:52 | Split still: chat bot "stream lost" alert on the phone · closed laptop on the same desk. | `PC off` | "Chat alerts run on the server. My PC can be off." |
| 0:52–1:02 | Two title cards only — no face, no gesture. Hold the silence between them. | `not zero latency` / `I run the box` | "Where it loses: it's low latency, not zero — there's an SRT buffer. And at 2am, I'm the one on call for my own relay." |
| 1:02–1:10 | End card. MeterMark. | `VISP · open source · GPL-2.0` | "I open-sourced it. Free during beta. Works tonight." |

---

**Edit notes.**

- Picture-led: if a beat can be a photo or a UI still, do not film a person
  performing it. Motion only where the product moves (HUD recovery, terminal,
  portal).
- Indoor only. Desk light, phone screen, laptop — no street, no park, no car.
- Personal VO, not brand VO. Keep saying *I* / *my*. The credit beat is sincere —
  do not undercut the product photos with a smirk cut.
- Stamp a real backpack price on 0:00 if you show one (`LiveU Solo` / `TVU` /
  whatever you actually compared against · source · month). No fake numbers.
- The bitrate dip at 0:06 must be from a real run. If it takes eight seconds to
  come back, show eight seconds.
- Never show an unmasked stream key on screen, even a fake one — the claim is
  the product.
- Silence under the limit beat. No bed, no music sting. Title cards only.
- Caption: "I wanted IRL without a €2000 backpack. One upload, my own relay, keys
  stay on it. Not zero latency — and I'm my own on-call. Free during beta."

Skipped: a longer feature-tour cut and a Finnish VO pass — add when this one
proves out on retention.
