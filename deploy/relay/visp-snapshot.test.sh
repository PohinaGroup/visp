#!/usr/bin/env bash
#
# Exercises visp-snapshot against fake curl/ffmpeg binaries. Guards the failures
# that are worst in production and invisible in review:
#   * a stream-copy or missing-audio regression in the distribution encode,
#     on the BRB card as much as on the live one;
#   * a forwarder that does not survive the ingest drop, which is the whole
#     point of "never drop again";
#   * two forwarders against one stream key after the publisher reconnects.

set -eu

root="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
# Forwarders outlive the script by design, so they also outlive a failed
# assertion here: tear them down before the fake binaries go away.
trap 'status=$?; pkill -f "visp-snapshot http://app.test" 2>/dev/null || true; pkill -f "$work/bin/ffmpeg" 2>/dev/null || true; sleep 1; rm -rf "$work"; exit "$status"' EXIT

mkdir -p "$work/bin" "$work/pids" "$work/run"
export PATH="$work/bin:$PATH"

cat >"$work/bin/curl" <<'FAKE'
#!/usr/bin/env bash
url=""; data=""
while [ $# -gt 0 ]; do
	case "$1" in
		--data) data="$2"; shift 2 ;;
		-*) case "$1" in --header|--max-time|--upload-file|--request|--output) shift 2 ;; *) shift ;; esac ;;
		*) url="$1"; shift ;;
	esac
done
case "$url" in
	*/direct-destinations)
		printf '%s\n' "$data" >>"$FAKE_DESTINATIONS_LOG"
		# A provider the relay still holds is never resolved again.
		case "$data" in *'"twitch"'*) exit 0 ;; esac
		printf 'twitch rtmps://twitch.test/app/TWITCHKEY\n'
		printf 'kick rtmps://kick.test/app/KICKKEY\n'
		printf 'youtube rtmps://youtube.test/app/YOUTUBEKEY\n' ;;
	*/hooks/brb)
		printf '%s\n' "$data" >>"$FAKE_BRB_LOG"
		cat "$FAKE_BRB_REPLY" ;;
	*/direct-state) printf '%s\n' "$data" >>"$FAKE_STATE_LOG" ;;
esac
exit 0
FAKE

# Records argv, then behaves like the process it stands in for: the live encode
# ends when the publisher goes away (a real RTSP read hits EOF), the BRB card
# runs until it is killed, and the snapshot grab exits immediately.
cat >"$work/bin/ffmpeg" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$FAKE_FFMPEG_LOG"
case "$*" in *-frames:v*) exit 1 ;; esac
touch "$FAKE_PID_DIR/$$"
case "$*" in
	*rtsp://*)
		while test -f "$FAKE_LIVE_MARKER"; do sleep 0.2; done
		rm -f "$FAKE_PID_DIR/$$"
		exit 1 ;;
esac
# exec, so SIGTERM reaches this pid the way it reaches a real FFmpeg. A bash
# wrapper would sit on the signal until its foreground child returned.
exec sleep 600
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
export FAKE_BRB_LOG="$work/brb.log"
export FAKE_DESTINATIONS_LOG="$work/destinations.log"
export FAKE_BRB_REPLY="$work/brb-reply"
export FAKE_PID_DIR="$work/pids"
export FAKE_LIVE_MARKER="$work/run/path-1.live"
export HOOK_SECRET=test-secret RTSP_PORT=8554
export VISP_RUN_DIR="$work/run"
export BRB_TICK_SECONDS=1
# Only the presence of the file is checked before drawtext is added, so a stub
# is enough to exercise the branch that renders the message.
export BRB_FONT="$work/font.ttf"
: >"$BRB_FONT"
: >"$FAKE_FFMPEG_LOG"
: >"$FAKE_STATE_LOG"
: >"$FAKE_BRB_LOG"
: >"$FAKE_DESTINATIONS_LOG"
# "Be right back" over a solid card: no background URL, so no download either.
printf 'brb QmUgcmlnaHQgYmFjaw== - color\n' >"$FAKE_BRB_REPLY"

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

live_children() {
	local pid count=0
	for pid in $(ls "$FAKE_PID_DIR"); do
		kill -0 "$pid" 2>/dev/null && count=$((count + 1))
	done
	printf '%s' "$count"
}

start_script() {
	# MediaMTX starts runOnAvailable with Setpgid, so give the script its own
	# process group here too — otherwise its "kill 0" would signal this runner.
	perl -e 'use POSIX qw(setsid); setsid(); exec @ARGV' \
		bash "$root/visp-snapshot" http://app.test path-1 srt &
}

start_script
script_pid=$!
sleep 3

forwards="$(grep -c -- '-f flv' "$FAKE_FFMPEG_LOG" || true)"
test "$forwards" -eq 3 || fail "expected 3 forwarders, started $forwards"

grep -q '"provider":"twitch","state":"starting"' "$FAKE_STATE_LOG" ||
	fail "twitch start was not reported"
grep -q '"provider":"kick","state":"starting"' "$FAKE_STATE_LOG" ||
	fail "kick start was not reported"
grep -q '"provider":"youtube","state":"starting"' "$FAKE_STATE_LOG" ||
	fail "youtube start was not reported"

test "$(live_children)" -eq 3 ||
	fail "expected 3 live ffmpeg children, saw $(live_children)"

# Signal only the script, not the group — MediaMTX does signal the whole group
# on its own terminate, which would hide the bug either way. The forwarders are
# started under job control precisely so this does not reach them.
kill -TERM "$script_pid" 2>/dev/null || true
wait "$script_pid" 2>/dev/null || true
sleep 4

# The ingest is gone and the card is up: this is "never drop again" working.
test "$(live_children)" -eq 3 ||
	fail "the BRB card did not take over: $(live_children) of 3 encoders running"
grep -q '"provider":"twitch","state":"brb"' "$FAKE_STATE_LOG" ||
	fail "twitch BRB was not reported"
brb_forwards="$(grep -c -- '-f flv' "$FAKE_FFMPEG_LOG" || true)"
test "$brb_forwards" -eq 6 ||
	fail "expected 3 live + 3 BRB encodes, saw $brb_forwards"
grep -q 'anullsrc' "$FAKE_FFMPEG_LOG" || fail "the BRB card carries no audio"
# textfile=, never text=: user text must not reach a filtergraph or a shell word.
grep -q 'drawtext=textfile=' "$FAKE_FFMPEG_LOG" ||
	fail "the BRB card carries no message"
if grep -q 'drawtext=text=' "$FAKE_FFMPEG_LOG"; then
	fail "user text was inlined into the filtergraph"
fi
grep -q 'Be right back' "$VISP_RUN_DIR/path-1-twitch.txt" ||
	fail "the message was not decoded to the text file"

# Every encode, live or card, must look the same to the platform.
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

if grep -q 'TWITCHKEY\|KICKKEY\|YOUTUBEKEY' "$FAKE_STATE_LOG"; then
	fail "a stream key reached the state hook"
fi
if grep -q 'TWITCHKEY\|KICKKEY\|YOUTUBEKEY' "$FAKE_BRB_LOG"; then
	fail "a stream key reached the BRB hook"
fi

# The publisher reconnects. The held forwarders must be named in "skip", or the
# app resolves them again and mints a second broadcast against the same key.
start_script
script_pid=$!
sleep 3

second="$(tail -n 1 "$FAKE_DESTINATIONS_LOG")"
for provider in twitch kick youtube; do
	case "$second" in
		*"\"$provider\""*) ;;
		*) fail "$provider was not skipped on reconnect: $second" ;;
	esac
done
test "$(grep -c -- '-f flv' "$FAKE_FFMPEG_LOG")" -eq 9 ||
	fail "reconnect did not resume the live encode in place"
test "$(live_children)" -eq 3 ||
	fail "reconnect left $(live_children) encoders against 3 stream keys"

# The dashboard ends the stream: the next tick tells the relay to let go.
printf 'stop\n' >"$FAKE_BRB_REPLY"
kill -TERM "$script_pid" 2>/dev/null || true
wait "$script_pid" 2>/dev/null || true
sleep 5

test "$(live_children)" -eq 0 ||
	fail "$(live_children) forwarder(s) ignored the stop"
grep -q '"provider":"twitch","state":"stopped"' "$FAKE_STATE_LOG" ||
	fail "the stop was not reported"
test -z "$(ls -A "$VISP_RUN_DIR" | grep '\.lock$' || true)" ||
	fail "a forwarder lock outlived its forwarder"

printf 'ok: BRB held the stream up, resumed in place, and let go on stop\n'
exit 0
