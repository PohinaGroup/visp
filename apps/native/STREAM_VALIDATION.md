# Stream validation

Run each case on a release build and retain the destination recording plus a screen recording of the phone.

| Case | Setup | Pass condition |
| --- | --- | --- |
| Relay recovery | Start a stream, disable all uplinks for 20 seconds, then restore one. | The stream reconnects without another Go Live tap; bitrate resumes below its ceiling and recovers gradually. |
| Stop during recovery | Repeat the outage, press Stop while reconnecting, then restore the uplink. | The phone stays idle and no later connection attempt occurs. |
| Constrained uplink | Limit upload below the selected preset's floor for two minutes. | The warning appears after sustained congestion; restarting at Reliable 720p30 materially improves destination playback. |
| Audio route loss | Stream through an external microphone, unplug it, then reconnect it. | The phone warns about the missing selected microphone and the destination recording documents the actual fallback route. |
| Endurance | Stream for 45 minutes with stabilization, captions, chat, and hosted isolation enabled. | Record thermal state, output FPS, frame drops, AV sync, reconnects, and destination playback at 0, 15, 30, and 45 minutes. |

For hosted isolation, include a clapper or spoken visual cue at the start and end. Compare its video frame to the audio transient in the destination recording. Repeat after forcing the hosted processor offline and after it recovers.
