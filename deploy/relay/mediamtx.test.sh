#!/usr/bin/env bash
set -eu

root="$(cd "$(dirname "$0")" && pwd)"
grep -Fq 'webrtcAllowOrigins: ["https://visp-stream.com", "https://stream.visp-stream.com"]' "$root/mediamtx.yml"
grep -Fq 'MTX_WEBRTCALLOWORIGINS=https://visp-stream.com,https://stream.visp-stream.com' "$root/../README.md"
printf 'ok: web and native-web production origins can signal WHEP on the relay\n'
