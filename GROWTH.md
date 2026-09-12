# Recruit VISP's first creator test batch

Prepared 2026-09-12. Drafts only. No invitations sent, budget spent, or users acquired by this work.

## Run a small IRL creator experiment

Start with creators who already explain phone streaming or remote OBS setups.
Ask them to test one broadcast with VISP. Use the existing five-creator pilot
rather than building another acquisition feature.

The repository already has a bilingual landing page, setup articles, app-store
links, and a creator application form. Traffic, conversion, and retention data
were not available during this review. Creator outreach is a hypothesis to test,
not a finding that search or onboarding is underperforming.

The live homepage advertises phone streaming to Twitch, Kick, or YouTube and a
free beta. The login, download, and affiliate URLs returned HTTP 200 when checked.
This checks availability, not successful authentication or broadcasting.
See the [homepage](https://visp-stream.com/),
[downloads](https://visp-stream.com/download), and
[creator pilot](https://visp-stream.com/affiliate).

## Contact these five creators

YouTube's public oEmbed responses verified the titles and channel identities
below. Fit is inferred from those topics, not from a full review of each video.
Audience size, recent activity, interest, and existing VISP relationships remain
unverified. Check prior correspondence before sending.

| Priority | Creator and evidence | Test to propose | Contact status |
| --- | --- | --- | --- |
| 1 | [SHOT BY ALLDAY](https://www.youtube.com/@ShotByALLDAY), [three-phone Moblin/Moblink tutorial](https://www.youtube.com/watch?v=JgY39RJoJ-s) | One phone-to-platform walk using VISP | `Dan@allday.nyc`, published on [his website](https://allday.nyc/) |
| 2 | [cliffcreates](https://www.youtube.com/@cliffcreates), [Moblin to Twitch, Kick, and YouTube tutorial](https://www.youtube.com/watch?v=8oNq_Khj_Rg) | One street-photography broadcast from a phone | [His Kick profile](https://kick.com/cliffcreates/about) links his channels and community. Business contact still needs verification. |
| 3 | [Emerald Audiovisual](https://www.youtube.com/@EmeraldAudiovisual), [self-hosted OBS tutorial](https://www.youtube.com/watch?v=xoDdfiVRJHc) | Phone feed into existing OBS, including remote scene control | Business contact still needs verification on the linked channel. |
| 4 | [Neighborhood Of Music Streamer Talk and Tech](https://www.youtube.com/@NeighborhoodOfMusicTech), [BELABOX hardware tour](https://www.youtube.com/watch?v=Sa9bDZoOqfY) | Compare setup effort for a phone feed into OBS | Business contact still needs verification on the linked channel. |
| 5 | [nutty](https://www.youtube.com/@nuttylmao), [OBSBOT Talent IRL setup video](https://www.youtube.com/watch?v=WeTXKqFnOF4) | Demonstrate VISP's phone-to-OBS workflow | Business contact still needs verification on the linked channel. |

Do not assume that an existing backpack or external camera works unchanged with
VISP. Agree on the test setup before onboarding. The invitation offers a test,
not an endorsement or a guaranteed pilot place.

## Send the first invitation

Recipient: Dan@allday.nyc

Subject: A VISP phone-streaming test for ALLDAY

Hi Dan,

Your three-phone Moblin/Moblink tutorial looks relevant to a test I'm putting
together. I build VISP, an IRL streaming app that sends a phone feed to Twitch,
Kick, or YouTube. You can also bring the feed into your own OBS.

Would you try one short walk with VISP and tell me where setup or the stream
breaks down? It's free during beta. I'm interested in whether you'd use it again.

We're also selecting five founding creators. The published offer includes free
VISP Pro when it launches, for as long as VISP exists, in exchange for testing
and an honest verdict. There's no positive-review requirement or commission.

Details: https://visp-stream.com/affiliate?utm_source=allday&utm_medium=creator_outreach&utm_campaign=creator_pilot_2026_09

Interested in a test?

Joni

## Prepare the next four invitations

Use the first invitation's product description, pilot terms, question, and
signature. Replace the greeting, opening, test request, subject, and link with
the matching row. Verify each business contact before sending.

| Creator | Subject | Opening and test request | Campaign source |
| --- | --- | --- | --- |
| cliffcreates | A VISP test for your next photography stream | Your Moblin tutorial covers the same platforms VISP sends to. Would you try VISP for one street-photography broadcast and tell me what gets in the way? | `cliffcreates` |
| Emerald Audiovisual | Test VISP with your existing OBS setup | Your self-hosted OBS tutorial is relevant to VISP's remote-camera workflow. Would you test a phone feed into your own OBS, including switching scenes remotely, and report the setup friction? | `emerald_audiovisual` |
| Neighborhood Of Music | A phone-to-OBS test alongside your BELABOX setup | Your BELABOX hardware tour caught my attention. Would you test a VISP phone feed into OBS and compare the setup effort with your usual workflow? | `neighborhood_of_music` |
| nutty | VISP phone-to-OBS test idea | Your OBSBOT Talent IRL setup video looks relevant to a phone-based test. Would you try bringing a VISP phone feed into your existing OBS scenes and tell me what is missing? | `nutty` |

Use `https://visp-stream.com/affiliate?utm_source=SOURCE&utm_medium=creator_outreach&utm_campaign=creator_pilot_2026_09`, replacing `SOURCE` with the row's value.

## Turn interest into a second stream

1. After send approval, invite Dan first. Verify the other business contacts and send the remaining invitations individually.
2. For each interested creator, record their phone, destination, and whether they need OBS. Agree on a test time before promising live assistance.
3. Use the [existing setup guide](apps/fumadocs/content/docs/get-started.mdx). Verify picture and audio on the destination player. A connected relay feed alone does not prove a successful broadcast.
4. Ask the creator to complete a ten-minute stream and record any failure. Agree on the audience beforehand: the documented YouTube Direct workflow creates a public broadcast.
5. Ask whether they would use VISP again. Invite them to do a second stream within seven days without help.
6. After a successful test, ask for an introduction to one streamer with the same setup problem. Get separate permission before quoting feedback or publishing footage.

For this experiment, aim for two completed tests from five invitations and at
least one repeat streamer. These are decision thresholds, not growth forecasts.
If nobody replies, revise the audience or invitation before expanding the list.
If people reply but cannot complete a stream, fix the observed blocker first.

## Record outcomes without building a dashboard

The web app already emits `lander_cta`, `sign_in`, and `direct_authorized` events.
These do not establish that a new user completed a broadcast. UTM links label
the campaign; cross-device attribution and reporting have not been verified.
For this small batch, record replies and confirmed tests manually.

| Creator | Sent | Replied | First destination-verified stream | Second stream within 7 days | Blocker or feedback |
| --- | --- | --- | --- | --- | --- |
| ALLDAY | Not sent | | | | |
| cliffcreates | Not sent | | | | |
| Emerald Audiovisual | Not sent | | | | |
| Neighborhood Of Music | Not sent | | | | |
| nutty | Not sent | | | | |

Do not spend on ads or add more articles for this experiment. Reconsider those
channels after the first batch shows which setup succeeds and why users return.
