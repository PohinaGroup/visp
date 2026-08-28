#!/usr/bin/env bash
#
# Exercises the SRTLA ingest path end to end, in one container: a real SRT
# publisher reaches a real MediaMTX through srtla_send and srtla_rec. Guards the
# two things that would silently break IRL bonding in production:
#   * two links must land in one group at the receiver, or bonding is just a
#     slower single link;
#   * the stream ID must survive the srtla hop untouched, because that is the
#     only thing MediaMTX authenticates a publisher with. A receiver that
#     mangled or replaced it would still pass a "did any video arrive" check
#     against an unauthenticated server, so the wrong secret is tested too.
#
# The sender is upstream's own srtla_send, built from the same pinned commit as
# the receiver we ship.

set -eu

root="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
build_image="visp-srtla-build:test"
test_image="visp-srtla-rec:test"

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

docker build --target build -f "$root/deploy/relay/srtla-rec/Dockerfile" \
	-t "$build_image" "$root" >/dev/null 2>&1 ||
	fail "the srtla build stage did not build"

# MediaMTX brings the SRT server and FFmpeg; the build stage brings both srtla
# binaries. Building it here keeps the pinned commit in one place.
printf 'FROM bluenviron/mediamtx:1-ffmpeg\nCOPY --from=%s /src/srtla_rec /src/srtla_send /usr/local/bin/\n' \
	"$build_image" | docker build -t "$test_image" - >/dev/null 2>&1 ||
	fail "the test image did not build"

cat >"$work/container.sh" <<'CONTAINER'
set -eu

cat >/tmp/mediamtx.yml <<'YML'
logLevel: info
api: no
metrics: no
pprof: no
playback: no
rtsp: no
rtmp: no
hls: no
webrtc: no
srt: yes
srtAddress: :8890
authMethod: internal
authInternalUsers:
  - user: tester
    pass: secret
    permissions:
      - action: publish
        path: bootstrap
paths:
  all_others:
YML

publish() {
	ffmpeg -hide_banner -loglevel error -re \
		-f lavfi -i testsrc=size=320x240:rate=15 \
		-f lavfi -i anullsrc=r=48000:cl=stereo \
		-c:v libx264 -preset ultrafast -tune zerolatency -c:a aac -t 4 \
		-f mpegts "srt://127.0.0.1:6000?streamid=publish:bootstrap:tester:$1&pkt_size=1316"
}

/mediamtx /tmp/mediamtx.yml >/tmp/mediamtx.log 2>&1 &
# Every 127.0.0.0/8 address is local on Linux, so two of them stand in for two
# network links without touching the container's interfaces.
printf '127.0.0.1\n127.0.0.2\n' >/tmp/ips
sleep 2
srtla_rec 5000 127.0.0.1 8890 >/tmp/rec.log 2>&1 &
sleep 1
srtla_send 6000 127.0.0.1 5000 /tmp/ips >/tmp/send.log 2>&1 &
sleep 3

publish secret || echo "PUBLISH_FAILED"
sleep 1
publish wrong-secret >/dev/null 2>&1 && echo "BAD_SECRET_ACCEPTED"

echo "=== receiver ==="
cat /tmp/rec.log
echo "=== mediamtx ==="
cat /tmp/mediamtx.log
CONTAINER

output="$(docker run --rm -i --entrypoint sh "$test_image" -s <"$work/container.sh" 2>&1)" ||
	fail "the container run did not complete:
$output"

case "$output" in
	*PUBLISH_FAILED*)
		fail "the publisher could not reach MediaMTX through srtla:
$output" ;;
	*BAD_SECRET_ACCEPTED*)
		fail "a wrong secret published anyway; the stream ID is not being checked:
$output" ;;
esac

groups="$(printf '%s' "$output" | grep -o 'group 0x[0-9a-f]* registered' | sort -u | wc -l)"
test "$groups" -eq 1 ||
	fail "expected both links in one group, the receiver made $groups:
$output"

links="$(printf '%s' "$output" | grep -c '(group 0x[0-9a-f]*): connection registration')"
test "$links" -eq 2 ||
	fail "expected 2 registered links, saw $links:
$output"

printf '%s' "$output" | grep -q "is publishing to path 'bootstrap'" ||
	fail "the stream ID did not survive the srtla hop:
$output"

printf 'ok: two srtla links carried an authenticated SRT publish into MediaMTX\n'
exit 0
