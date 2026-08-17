# VISP Founding Creator Program

## Goal

Get VISP tested on real IRL-streaming hardware, by people who will say publicly
what is wrong with it, before VISP Pro launches. Start with a 90-day,
invite-only pilot for five YouTube creators who publish hands-on backpack,
bonding, mobile encoder, or remote-production content.

## Pilot offer

- **Access:** VISP Pro free for life once it launches, for every accepted
  founding creator, regardless of what they conclude about the product.
- **Early hardware access:** Everything unlocked before public Pro launch, plus
  a 30-minute technical onboarding.
- **Editorial terms:** Honest opinions, no required script, and no approval of
  conclusions. VISP may only check unpublished content for factual errors.
- **Disclosure:** Every placement must clearly state that the creator received
  VISP Pro for free, and follow YouTube's paid-promotion rules and applicable
  law. Free product is a material connection even without commission.

**No commission today.** VISP Pro is not built, no billing provider is wired
up, and there is no revenue to share. The public page says this outright rather
than advertising a rate we cannot pay. If an affiliate program launches later,
founding creators are told first, and its terms — commission basis,
attribution, payout threshold, prohibited promotion — get written here then.

## Who to recruit

Prioritize creators who meet all of these criteria:

1. Have published an IRL backpack, mobile bonding, SRT, BELABOX, Moblin, or
   remote OBS setup video in the last 12 months.
2. Demonstrate hardware on a real stream instead of only reading specifications.
3. Receive substantive setup and buying questions in their comments.
4. Publish in English, Finnish, or another market VISP can currently support.
5. Are willing to test VISP before recommending it.

Audience fit and viewer trust matter more than subscriber count. Exclude coupon
channels, generic software roundups, and creators asking for guaranteed praise.

Track candidates in a simple sheet with: channel, contact, relevant video,
average views on the last five relevant videos, audience geography, outreach
date, status, affiliate code, and notes.

## Creator package

Each accepted creator receives:

- a Pro test account and a 30-minute technical onboarding;
- a one-page facts sheet covering supported inputs, outputs, latency tradeoffs,
  pricing, and known limitations;
- test scenarios: phone-only stream, backpack/SRT stream, connection drop, and
  OBS handoff;
- direct access to one VISP contact for factual and setup questions.

Do not require a dedicated video. Accept a build video, setup update, comparison,
description link, or pinned comment when VISP is genuinely relevant.

## Referral tracking

There is none, deliberately. No links, no codes, no cookies, no attribution
window — nothing to track until there is a paid subscription to attribute.

When VISP Pro and a billing provider exist, use that provider's native
affiliate or coupon support. Do not build custom payout infrastructure. Before
any of it ships, the privacy policy and cookie consent flow must describe
referral tracking; today they correctly describe only the application form.

## Applications

`/affiliate` (and `/fi/affiliate`) writes to `affiliate_application` and posts
the application to `APPLICATION_WEBHOOK_URL` — a Discord or Slack incoming
webhook. Unset that variable and applications land in the database only, where
nobody will see them. There is no admin UI and no application status column;
five creators do not need one. Reply to applicants by hand.

## Outreach

Subject: Test VISP in your next IRL streaming build

> Hi [name] — your [specific video/build] is exactly the kind of real-world
> setup VISP is built for. VISP sends a phone or backpack feed through an
> SRT/RTMP relay to Twitch, Kick, YouTube, or OBS. We're preparing VISP Pro and
> inviting five hardware-focused creators to test it first. Founding creators
> keep Pro free for life, with no required script and no positive-review
> clause — we would rather hear what breaks. Would you be open to a short setup
> session and an honest test?

Send no more than two follow-ups. Personalize the first sentence with a real
detail from the creator's setup; bulk outreach is a poor fit for this niche.

## Pilot operation

1. Set `APPLICATION_WEBHOOK_URL` so applications are actually seen.
2. Approve a short founding creator agreement covering the lifetime Pro grant,
   disclosure, termination, and data use. No commission clause is needed yet.
3. Recruit and onboard five creators before public Pro launch.
4. Give each creator at least two weeks to test on real hardware.
5. Review results 30, 60, and 90 days after the first content goes live.
6. Honor the lifetime Pro grant whether or not a creator keeps publishing. It
   costs one account and buys the program its credibility.

## Scorecard

The pilot's output is product truth, not attributed revenue — and without
tracking there is no attributed revenue to count. Review per creator:

- bugs and hardware incompatibilities found before public launch;
- setup steps that needed a human to explain them;
- whether the creator chose to publish, and what they concluded;
- support time spent per creator.

Expand beyond five creators only when the pilot has stopped surfacing new
product problems. Revisit commission only once VISP Pro bills real customers;
until then there is nothing to share, and a rate card would be a promise
without a product behind it.
