# Multi-chat

The dashboard saves public Twitch, Kick, and TikTok channel settings. The `/overlay` page connects to the VISP server and displays their messages in an OBS browser source.

Run `bun run --cwd apps/multichat dev` from the repository root. Set `VITE_SERVER_URL` when the API is not at `https://api.visp.localhost`.

Run `bun run --cwd apps/multichat build` to type-check and build the static site.
