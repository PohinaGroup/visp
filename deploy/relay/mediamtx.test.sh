#!/usr/bin/env bash
set -eu

root="$(cd "$(dirname "$0")" && pwd)"
grep -Fq 'webrtcAllowOrigins: ["https://visp-stream.com", "https://stream.visp-stream.com"]' "$root/mediamtx.yml"
grep -Fq 'MTX_WEBRTCALLOWORIGINS=https://visp-stream.com,https://stream.visp-stream.com' "$root/../README.md"
printf 'ok: web and native-web production origins can signal WHEP on the relay\n'

# The local relay image must run the MediaMTX release production pins.
# shellcheck disable=SC1091
. "$root/mediamtx.version"
grep -Fqx "FROM bluenviron/mediamtx:${MEDIAMTX_VERSION}-ffmpeg" "$root/../local/mediamtx.Dockerfile"
printf 'ok: local relay image matches MediaMTX %s\n' "$MEDIAMTX_VERSION"

# /run/visp holds per-path credentials; clips belong on disk, not tmpfs.
for unit in mediamtx mediamtx-staging; do
	grep -Fqx 'RuntimeDirectoryMode=0700' "$root/../systemd/$unit.service"
	grep -Eqx 'CacheDirectory=visp(-staging)?' "$root/../systemd/$unit.service"
done
printf 'ok: relay runtime directory is private and highlight clips are disk-backed\n'
