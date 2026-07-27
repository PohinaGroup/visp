#!/usr/bin/env bash
#
# Exercises visp-snapshot against fake curl/ffmpeg binaries. Guards the two
# failures that are worst in production and invisible in review:
#   * a stream-copy or missing-audio regression in the distribution encode;
#   * forwarders that survive MediaMTX's stop and double-publish on restart.

set -eu

root="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'status=$?; rm -rf "$work"; exit "$status"' EXIT

mkdir -p "$work/bin" "$work/pids"
export PATH="$work/bin:$PATH"

cat >"$work/bin/curl" <<'FAKE'
#!/usr/bin/env bash
url=""; data=""
while [ $# -gt 0 ]; do
	case "$1" in
		--data) data="$2"; shift 2 ;;
		-*) case "$1" in --header|--max-time|--upload-file|--request) shift 2 ;; *) shift ;; esac ;;
		*) url="$1"; shift ;;
	esac
done
case "$url" in
	*/direct-destinations)
		printf 'twitch rtmps://twitch.test/app/TWITCHKEY\n'
		printf 'kick rtmps://kick.test/app/KICKKEY\n' ;;
	*/direct-state) printf '%s\n' "$data" >>"$FAKE_STATE_LOG" ;;
esac
exit 0
FAKE

# Records argv, then blocks like a running forwarder. The snapshot grab (which
# passes -frames:v) exits immediately so the outer loop just sleeps.
cat >"$work/bin/ffmpeg" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$FAKE_FFMPEG_LOG"
case "$*" in *-frames:v*) exit 1 ;; esac
touch "$FAKE_PID_DIR/$$"
sleep 600
FAKE

cat >"$work/bin/timeout" <<'FAKE'
#!/usr/bin/env bash
shift
exec "$@"
FAKE

# GNU mktemp --suffix is not available on the macOS host running this test.
cat >"$work/bin/mktemp" <<'FAKE'
#!/usr/bin/env bash
case "${1:-}" in
	--suffix=*) f="$(/usr/bin/mktemp)"; mv "$f" "$f${1#--suffix=}"; printf '%s\n' "$f${1#--suffix=}" ;;
	-d) /usr/bin/mktemp -d ;;
	*) /usr/bin/mktemp ;;
esac
FAKE

chmod +x "$work/bin/"*

export FAKE_FFMPEG_LOG="$work/ffmpeg.log"
export FAKE_STATE_LOG="$work/state.log"
export FAKE_PID_DIR="$work/pids"
export HOOK_SECRET=test-secret RTSP_PORT=8554
: >"$FAKE_FFMPEG_LOG"
: >"$FAKE_STATE_LOG"

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

# MediaMTX starts runOnReady with Setpgid, so give the script its own process
# group here too — otherwise its "kill 0" would signal this test runner.
perl -e 'use POSIX qw(setsid); setsid(); exec @ARGV' \
	bash "$root/visp-snapshot" http://app.test path-1 srt &
script_pid=$!
sleep 3

forwards="$(grep -c -- '-f flv' "$FAKE_FFMPEG_LOG" || true)"
test "$forwards" -eq 2 || fail "expected 2 forwarders, started $forwards"

# No pipeline: a subshell here would swallow every failure below.
while read -r args; do
	case "$args" in
		*"-c:v copy"*|*"-c copy"*) fail "destination was stream-copied: $args" ;;
	esac
	case "$args" in *libx264*) ;; *) fail "no video distribution encode: $args" ;; esac
	# Both native encoders emit mono at different sample rates; Kick wants stereo.
	case "$args" in
		*"-c:a aac -ac 2 -b:a 128k -ar 48000"*) ;;
		*) fail "no stereo audio encode: $args" ;;
	esac
done <<<"$(grep -- '-f flv' "$FAKE_FFMPEG_LOG")"

grep -q '"provider":"twitch","state":"starting"' "$FAKE_STATE_LOG" ||
	fail "twitch start was not reported"
grep -q '"provider":"kick","state":"starting"' "$FAKE_STATE_LOG" ||
	fail "kick start was not reported"

if grep -q 'TWITCHKEY\|KICKKEY' "$FAKE_STATE_LOG"; then
	fail "a stream key reached the state hook"
fi

started_pids="$(ls "$FAKE_PID_DIR" | wc -l | tr -d ' ')"
test "$started_pids" -eq 2 || fail "expected 2 live ffmpeg children, saw $started_pids"

# Signal only the script, not the group. MediaMTX does signal the whole group
# on its own terminate, which would hide the bug: the trap has to tear the
# children down itself, or any other exit path orphans them and
# runOnReadyRestart brings up a second set against the same stream key.
kill -TERM "$script_pid" 2>/dev/null || true
wait "$script_pid" 2>/dev/null || true
sleep 2

orphans=0
for pid in $(ls "$FAKE_PID_DIR"); do
	kill -0 "$pid" 2>/dev/null && orphans=$((orphans + 1))
done
test "$orphans" -eq 0 || fail "$orphans forwarder(s) survived MediaMTX stop"

printf 'ok: 2 distribution-encoded forwarders, no orphans, no keys in state\n'
exit 0
