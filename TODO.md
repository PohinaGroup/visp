**1. Put the stream on the dashboard.** The first thing on `dashboard-page.tsx:106` is a settings question ("Primary operational mode"). The daily job is *am I up, how healthy, stop*. Everything needed already exists: `studio/whep-preview.tsx` (live video), `snapshots.ts` (still frames, used by BRB), and `paths.list` already returns `linkStats` per path. Hoist a single live tile above the fold — picture + bitrate/RTT + one End button. No new backend.

**2. Make bitrate a meter, not a string.** `path-row.tsx:45` renders link stats as text buried in the devices card. The brand mark is literally a level meter and `linkStats` already polls every 3s. A 60s bitrate sparkline with the existing tally/caution/signal colors is the thing that makes it feel like broadcast gear instead of a settings page. ~30 lines, no new data.

**3. Demote the mode picker.** "Direct vs Home Studio" is a setup decision being re-asked every session, at the top, on the busiest surface. It belongs in setup/advanced — which is what the progressive-disclosure rule you set already says.

**4. Pre-flight before Go Live.** The lander promises "fail early, before viewers arrive" (`routes/index.tsx`), but the dashboard never shows that check passing. Surface the auth/ownership/capacity check as a visible green readiness row. Turns an invisible backend virtue into the reason people trust it.

**5. Lander: one 8-second loop of a real go-live** replacing the three static shots in `productShots`. Static screenshots of a live-video product undersell it.