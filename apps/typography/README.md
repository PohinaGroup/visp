# Typography

The editor uploads a video, shows word-level captions, and requests an MP4 export from the VISP server. The server handles transcription, storage, and rendering.

Run `bun run --cwd apps/typography dev` from the repository root. Set `VITE_API_URL` to the portal origin for the environment you use. The default is `https://visp-stream.com`.

Run `bun run --cwd apps/typography build` to type-check and build the static site.
