# Keep in step with deploy/relay/mediamtx.version (checked by
# deploy/relay/mediamtx.test.sh) so the local relay runs what production runs.
FROM bluenviron/mediamtx:1.19.3-ffmpeg

# jq and openssl are what select the v3 destination contract and the scoped
# Studio credentials; without them the hook silently takes the legacy path.
RUN apk add --no-cache bash coreutils curl jq openssl procps
COPY deploy/relay/visp-snapshot /usr/local/libexec/visp-snapshot
