
## Billing (Direct monetization)

Deferred from PLAN.md §3. Start Polar account approval before coding.

- [ ] Add `billing_subscription` row (Polar customer/subscription IDs, product,
      status, period end, cancel-at-period-end, `provider_modified_at`)
- [ ] Polar webhooks: verify signature, map `external_customer_id`, reject unknown
      products, upsert by subscription ID, ignore stale events; redact signature
      header in logs
- [ ] Change `canUseDirect()` from `direct_beta` to active subscription check
- [ ] Mid-stream lapse policy: finish live session; block new Direct starts after
      lapse
- [ ] Cancel Polar subscription in `user.deleteUser.beforeDelete` before snapshot
      cleanup
- [ ] Decide tax-inclusive vs exclusive pricing before creating the Polar product
- [ ] Web checkout only in native apps unless Apple External Purchase Link
      entitlement is obtained
- [ ] Update “free beta” marketing surfaces and terms when charging starts

## Scale and enterprise

PLAN1 covers path caps, rate limiting, multi-relay assignment, and auth-cache
invalidation for horizontal app instances.

- [ ] Chat at scale: shared subscription layer or sticky sessions for in-process
      Twitch WebSockets
- [ ] OBS control latency: reduce cross-instance database-poll delay
- [ ] Live path relay reassignment (today: drain stops new assignments; existing
      paths stay put)
- [ ] Batch/optimize `reconcilePathState` for large path counts
- [ ] Usage quotas beyond path count: bandwidth, egress, snapshot storage,
      stream-hours
- [ ] More handle-allocation candidates before hard failure on display-name
      collision
- [ ] User-visible relay region selection or latency-based assignment
- [ ] Admin: forwarder utilization, cap-refusal alerts, per-relay health SLOs

## Product polish and docs

- [ ] Fumadocs accuracy pass: Direct transcodes and uses OAuth stream keys;
      bonding is native; limits and multi-relay behavior
- [ ] Stream-key and “no transcode” copy sweep on remaining surfaces (login, blog
      CTAs, Seppo prompts, comparison assets)
- [ ] Finnish (`.fi.mdx`) parity for Direct, bonding, and updated limits
- [ ] GitHub repo launch hygiene: README screenshot/GIF, topics, Discussions,
      issue templates
- [ ] OBS Resources plugin submission
- [ ] Windows OBS packaging community test

## Marketing and growth

30-day objective: 15 qualified beta users → 8 setup complete → 5 real streams →
3 testimonials. See [MARKETING.md](MARKETING.md).

- [ ] Configure Rybbit funnel and UTM attribution
- [ ] Execute channel sequence (Reddit participation → r/BetaTests → r/IRLstreaming
      → mod-approved posts elsewhere)
- [ ] X/Threads/Bluesky launch thread; proof-led Reels/Shorts (native uploads)
- [ ] YouTube long-form setup guide
- [ ] Five creator outreach emails + Discord showcase (mod-approved)
- [ ] Product Hunt and Show HN after launch gates are met
- [ ] Refresh proof points for Direct, bonding, and stream-key consent
- [ ] Standard beta follow-up survey and permissioned quotes

## Compliance and trust

- [ ] Privacy policy billing section before Polar goes live
- [ ] Verify cookie/analytics consent covers Rybbit when enabled
- [ ] End-to-end test: account deletion cancels billing and revokes relay
      credentials
- [ ] Verify Twitch simulcasting and Kick Partner multistreaming warnings match
      in-product UI and docs
