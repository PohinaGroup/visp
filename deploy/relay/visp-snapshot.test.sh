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
url=""; data=""; output=""
while [ $# -gt 0 ]; do
	case "$1" in
		--data) data="$2"; shift 2 ;;
		-*) case "$1" in --output) output="$2"; shift 2 ;; --header|--max-time|--upload-file|--request) shift 2 ;; *) shift ;; esac ;;
		*) url="$1"; shift ;;
	esac
done
case "$url" in
	*/direct-destinations-v3)
		printf 'v3 %s\n' "$data" >>"$FAKE_DESTINATIONS_LOG"
		test "${FAKE_SERVER_VERSION:-new}" = v3 || exit 22
		cat <<'JSON'
{"destinations":[{"outputId":"managed-twitch-landscape","kind":"managed","label":"twitch","role":"landscape","protocol":"rtmps","muxer":"flv","filter":null,"url":"rtmps://twitch.test/app/TWITCHKEY"},{"outputId":"160b40b3-4e27-4773-9941-1c93ec895906","kind":"custom","label":"SRT backup","role":"landscape","protocol":"srt","muxer":"mpegts","filter":null,"url":"srt://receiver.test:9000?streamid=CUSTOMKEY"},{"outputId":"260b40b3-4e27-4773-9941-1c93ec895906","kind":"custom","label":"Portrait RTMP","role":"portrait","protocol":"rtmp","muxer":"flv","filter":"crop=iw*0.3164:ih*1:iw*0.3418:ih*0,scale=1080:1920","url":"rtmp://receiver.test/app/PORTRAITKEY"}]}
JSON
		;;
	*/direct-destinations-v2)
		printf 'v2 %s\n' "$data" >>"$FAKE_DESTINATIONS_LOG"
		test "${FAKE_SERVER_VERSION:-new}" = new || exit 22
		printf '%s\n' "$data" >>"$FAKE_DESTINATIONS_LOG"
		# A provider the relay still holds is never resolved again.
		case "$data" in *'"twitch"'*) ;; *) printf 'twitch landscape - rtmps://twitch.test/app/TWITCHKEY\n' ;; esac
		case "$data" in *'"kick"'*) ;; *) test -f "$FAKE_PORTRAIT_REMOVED" || printf 'kick portrait crop=iw*0.3164:ih*1:iw*0.3418:ih*0,scale=1080:1920 rtmps://kick.test/app/KICKKEY\n' ;; esac
		case "$data" in *'"youtube"'*) ;; *) printf 'youtube landscape - rtmps://youtube.test/app/YOUTUBEKEY\n' ;; esac ;;
	*/direct-destinations)
		printf 'legacy %s\n' "$data" >>"$FAKE_DESTINATIONS_LOG"
		case "$data" in *'"twitch"'*) ;; *) printf 'twitch rtmps://twitch.test/app/TWITCHKEY\n' ;; esac
		case "$data" in *'"kick"'*) ;; *) printf 'kick rtmps://kick.test/app/KICKKEY\n' ;; esac
		case "$data" in *'"youtube"'*) ;; *) printf 'youtube rtmps://youtube.test/app/YOUTUBEKEY\n' ;; esac ;;
	*/direct-active)
		test "${FAKE_SERVER_VERSION:-new}" != old || exit 22
		printf '%s\n' "$data" >>"$FAKE_ACTIVE_LOG"
		case "$data" in *'"role":"portrait"'*) test ! -f "$FAKE_PORTRAIT_REMOVED" || exit 1 ;; esac ;;
	*/direct-active-v3)
		printf '%s\n' "$data" >>"$FAKE_ACTIVE_LOG"
		case "$data" in *'"outputId":"260b40b3-4e27-4773-9941-1c93ec895906"'*) test ! -f "$FAKE_PORTRAIT_REMOVED" || exit 1 ;; esac ;;
	*/hooks/brb-v3)
		printf '%s\n' "$data" >>"$FAKE_BRB_LOG"
		cat "$FAKE_BRB_REPLY" ;;
	*/hooks/source-plan)
		printf '%s\n' "$data" >>"$FAKE_STUDIO_PLAN_LOG"
		test ! -f "$FAKE_STUDIO_PLAN_FAIL" || exit 22
		cat "$FAKE_STUDIO_PLAN_REPLY" ;;
	*/hooks/brb)
		printf '%s\n' "$data" >>"$FAKE_BRB_LOG"
		for provider in twitch kick youtube; do
			case "$data" in *"\"provider\":\"$provider\""*)
				delay="$FAKE_BRB_DELAY_DIR/$provider"
				if test -f "$delay"; then rm -f "$delay"; sleep 3; fi
				read -r verb message payload background source <"$FAKE_BRB_REPLY"
				if test "$verb" = highlights; then
					payload="$(printf '%s' "$payload" | base64 -d |
						sed "1! s|$|?$provider|" |
						base64)"
					printf '%s %s %s %s %s\n' "$verb" "$message" "$payload" \
						"$background" "$source"
					exit 0
				fi ;;
			esac
		done
		cat "$FAKE_BRB_REPLY" ;;
	*/direct-state)
		printf '%s\n' "$data" >>"$FAKE_STATE_LOG"
		case "$data" in
			*'"provider":"kick","state":"stopped","role":"portrait"'*)
				count=0
				for pid_file in "$FAKE_PID_DIR"/*; do
					test -e "$pid_file" || continue
					kill -0 "${pid_file##*/}" 2>/dev/null && count=$((count + 1))
				done
				printf '%s\n' "$count" >>"$FAKE_STOP_ACK_LOG" ;;
		esac ;;
	*/direct-state-v3) printf '%s\n' "$data" >>"$FAKE_STATE_LOG" ;;
	*/hooks/brb-played) printf '%s\n' "$data" >>"$FAKE_PLAYED_LOG" ;;
	https://clips.test/*)
		if test -f "$FAKE_CLIP_DELAY"; then rm -f "$FAKE_CLIP_DELAY"; sleep 5; fi
		printf '%s' "${url##*/}" >"$output" ;;
	https://background.test/*) printf 'image' >"$output" ;;
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
		trap 'test -f "$FAKE_IGNORE_TERM" || { rm -f "$FAKE_PID_DIR/$$"; exit 0; }' TERM
		while test -f "$FAKE_LIVE_MARKER"; do sleep 0.2; done
		rm -f "$FAKE_PID_DIR/$$"
		exit 1 ;;
	*highlights*.mp4*) printf 'ts' >"${*: -1}"; rm -f "$FAKE_PID_DIR/$$"; exit 0 ;;
	*'-f concat'*)
		list=""; progress=""; previous=""; micros=0
		for argument in "$@"; do
			test "$previous" != -i || case "$argument" in *playlist.txt) list="$argument" ;; esac
			test "$previous" != -progress || progress="$argument"
			previous="$argument"
		done
		trap 'rm -f "$FAKE_PID_DIR/$$"; exit 0' TERM INT
		while true; do
			while read -r _ clip; do
				clip="${clip#\'}"; clip="${clip%\'}"
				printf 'out_time_us=%s\nprogress=continue\n' "$micros" >>"$progress"
				printf '%s %s %s\n' "$$" "${*: -1}" "$clip" >>"$FAKE_OUTPUT_LOG"
				micros=$((micros + 500000))
				sleep 0.3
			done <"$list"
		done ;;
esac
# exec, so SIGTERM reaches this pid the way it reaches a real FFmpeg. A bash
# wrapper would sit on the signal until its foreground child returned.
exec sleep 600
FAKE

cat >"$work/bin/ffprobe" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$FAKE_FFPROBE_LOG"
file="${*: -1}"
grep -q bad "$file" 2>/dev/null && exit 1
case "$*" in
	*stream=codec_name,width,height*) printf 'h264\n1920\n1080\n' ;;
	*stream=codec_type*) grep -q one "$file" && printf 'audio\n' ;;
	*stream=codec_type*) : ;;
	*format=duration*) printf '0.5\n' ;;
esac
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
export FAKE_PLAYED_LOG="$work/played.log"
export FAKE_FFPROBE_LOG="$work/ffprobe.log"
export FAKE_OUTPUT_LOG="$work/output.log"
export FAKE_STUDIO_PLAN_LOG="$work/studio-plan.log"
export FAKE_STUDIO_PLAN_REPLY="$work/studio-plan-reply"
export FAKE_STUDIO_PLAN_FAIL="$work/studio-plan-fail"
export FAKE_BRB_REPLY="$work/brb-reply"
export FAKE_PID_DIR="$work/pids"
export FAKE_LIVE_MARKER="$work/run/path-1.live"
export FAKE_ACTIVE_LOG="$work/active.log"
export FAKE_STOP_ACK_LOG="$work/stop-ack.log"
export FAKE_PORTRAIT_REMOVED="$work/portrait-removed"
export FAKE_IGNORE_TERM="$work/ignore-term"
export FAKE_SERVER_VERSION=new
export FAKE_BRB_DELAY_DIR="$work/brb-delay"
export FAKE_CLIP_DELAY="$work/clip-delay"
export HOOK_SECRET=test-secret STUDIO_MEDIA_PASSWORD=test-media-secret RTSP_PORT=8554
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
: >"$FAKE_ACTIVE_LOG"
: >"$FAKE_STOP_ACK_LOG"
: >"$FAKE_PLAYED_LOG"
: >"$FAKE_FFPROBE_LOG"
: >"$FAKE_OUTPUT_LOG"
: >"$FAKE_STUDIO_PLAN_LOG"
printf 'source path-1\n' >"$FAKE_STUDIO_PLAN_REPLY"
# "Be right back" over a solid card: no background URL, so no download either.
printf 'brb QmUgcmlnaHQgYmFjaw== - color\n' >"$FAKE_BRB_REPLY"

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

wait_for_count() {
	local pattern="$1" expected="$2" attempts=$((${3:-10} * 5)) count
	while test "$attempts" -gt 0; do
		count="$(grep -- '-f flv' "$FAKE_FFMPEG_LOG" | grep -c "$pattern" || true)"
		test "$count" -eq "$expected" && return 0
		sleep 0.2
		attempts=$((attempts - 1))
	done
	return 1
}

live_children() {
	local pid count=0
	for pid in $(ls "$FAKE_PID_DIR"); do
		kill -0 "$pid" 2>/dev/null && count=$((count + 1))
	done
	printf '%s' "$count"
}

wait_for_hold_cleanup() {
	for _ in {1..40}; do
		test "$(live_children)" -ne 0 ||
			test -e "$VISP_RUN_DIR/path-1-highlights" || return 0
		sleep 0.25
	done
	return 1
}

wait_for_live_children() {
	local expected="$1"
	for _ in {1..40}; do
		test "$(live_children)" -ne "$expected" || return 0
		sleep 0.25
	done
	return 1
}

start_script() {
	# MediaMTX starts runOnAvailable with Setpgid, so give the script its own
	# process group here too — otherwise its "kill 0" would signal this runner.
	perl -e 'use POSIX qw(setsid); setsid(); exec @ARGV' \
		bash "$root/visp-snapshot" http://app.test path-1 srt &
}

touch "$FAKE_LIVE_MARKER"
start_script
script_pid=$!
sleep 3

forwards="$(grep -c -- '-f flv' "$FAKE_FFMPEG_LOG" || true)"
test "$forwards" -eq 3 || fail "expected 3 forwarders, started $forwards"
test "$(grep -- '-f flv' "$FAKE_FFMPEG_LOG" | grep -c '@127.0.0.1:8554/path-1')" -eq 3 ||
	fail "startup did not use raw ingest before compositor health"
grep -- '-frames:v' "$FAKE_FFMPEG_LOG" | grep -q 'rtsp://studio%3Apath-1:' ||
	fail "snapshot reader did not URL-encode its scoped Studio identity"

printf 'program path-1\n' >"$FAKE_STUDIO_PLAN_REPLY"
wait_for_count '@127.0.0.1:8554/studio/path-1' 3 ||
	fail "healthy compositor did not switch running forwarders to program"

before_plan_failure="$(grep -c -- '-f flv' "$FAKE_FFMPEG_LOG")"
touch "$FAKE_STUDIO_PLAN_FAIL"
sleep 6
test "$(grep -c -- '-f flv' "$FAKE_FFMPEG_LOG")" -eq "$before_plan_failure" ||
	fail "a transient Studio plan failure restarted running forwarders"
rm -f "$FAKE_STUDIO_PLAN_FAIL"

printf 'source path-1\n' >"$FAKE_STUDIO_PLAN_REPLY"
wait_for_count '@127.0.0.1:8554/path-1' 6 ||
	fail "stale compositor did not switch running forwarders to passthrough"

printf 'source phone-b\n' >"$FAKE_STUDIO_PLAN_REPLY"
wait_for_count '@127.0.0.1:8554/phone-b' 3 4 ||
	fail "handover did not switch every running forwarder to the replacement"
while read -r args; do
	case "$args" in
		*'rtmps://twitch.test/app/TWITCHKEY'|*'rtmps://kick.test/app/KICKKEY'|*'rtmps://youtube.test/app/YOUTUBEKEY'|*'srt://receiver.test:9000?streamid=CUSTOMKEY'|*'rtmp://receiver.test/app/PORTRAITKEY') ;;
		*) fail "handover changed a destination URL: $args" ;;
	esac
done <<<"$(grep -- '-f flv\|-f mpegts' "$FAKE_FFMPEG_LOG" | grep '@127.0.0.1:8554/phone-b')"
printf 'source path-1\n' >"$FAKE_STUDIO_PLAN_REPLY"
wait_for_count '@127.0.0.1:8554/path-1' 9 4 ||
	fail "replacement loss did not switch every forwarder back to the owner"

test "$(grep -- '-f flv' "$FAKE_FFMPEG_LOG" | grep -c -- '-vf crop=' || true)" -eq 5 ||
	fail "every portrait source switch must preserve its crop filter"
grep -q -- '-vf crop=iw\*0.3164:ih\*1:iw\*0.3418:ih\*0,scale=1080:1920' "$FAKE_FFMPEG_LOG" ||
	fail "portrait crop filter was not passed to FFmpeg"
grep -q '^v2 ' "$FAKE_DESTINATIONS_LOG" ||
	fail "the relay did not negotiate the versioned destination contract"


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
rm -f "$FAKE_LIVE_MARKER"
printf 'offline\n' >"$FAKE_STUDIO_PLAN_REPLY"
sleep 4

# The ingest is gone and the card is up: this is "never drop again" working.
test "$(live_children)" -eq 3 ||
	fail "the BRB card did not take over: $(live_children) of 3 encoders running; brb=$(tr '\n' '|' <"$FAKE_BRB_LOG"); ffmpeg=$(tr '\n' '|' <"$FAKE_FFMPEG_LOG")"
grep -q '"provider":"twitch","state":"brb"' "$FAKE_STATE_LOG" ||
	fail "twitch BRB was not reported"
brb_forwards="$(grep -c -- '-f flv' "$FAKE_FFMPEG_LOG" || true)"
test "$brb_forwards" -eq 18 ||
	fail "expected 15 switched live + 3 BRB encodes, saw $brb_forwards"
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
touch "$FAKE_LIVE_MARKER"
# A compromised plan response must not turn Direct into an arbitrary RTSP
# client. This URL starts with the old string allow-list but resolves elsewhere.
printf 'program rtsp://127.0.0.1:8554@169.254.169.254/studio/path-1\n' >"$FAKE_STUDIO_PLAN_REPLY"
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
test "$(grep -c -- '-f flv' "$FAKE_FFMPEG_LOG")" -eq 21 ||
	fail "reconnect did not resume the live encode in place"
test "$(grep -- '-f flv' "$FAKE_FFMPEG_LOG" | grep -c '@127.0.0.1:8554/path-1')" -eq 12 ||
	fail "an untrusted Studio plan escaped the local RTSP namespace"
test "$(live_children)" -eq 3 ||
	fail "reconnect left $(live_children) encoders against 3 stream keys"

# The dashboard ends the stream: the next tick tells the relay to let go.
printf 'stop\n' >"$FAKE_BRB_REPLY"
kill -TERM "$script_pid" 2>/dev/null || true
wait "$script_pid" 2>/dev/null || true
rm -f "$FAKE_LIVE_MARKER"
sleep 5

test "$(live_children)" -eq 0 ||
	fail "$(live_children) forwarder(s) ignored the stop"
grep -q '"provider":"twitch","state":"stopped"' "$FAKE_STATE_LOG" ||
	fail "the stop was not reported"
test -z "$(ls -A "$VISP_RUN_DIR" | grep '\.lock$' || true)" ||
	fail "a forwarder lock outlived its forwarder"

# A configured removal stops only portrait and frees its encoder slot.
touch "$FAKE_IGNORE_TERM"
touch "$FAKE_LIVE_MARKER"
start_script
script_pid=$!
for _ in {1..50}; do
	removal_children="$(live_children)"
	test "$removal_children" -ne 3 || break
	sleep 0.1
done
test "$removal_children" -eq 3 ||
	fail "removal fixture started $removal_children encoders instead of 3"
: >"$FAKE_STOP_ACK_LOG"
touch "$FAKE_PORTRAIT_REMOVED"
sleep 3
test "$(live_children)" -eq 3 ||
	fail "TERM-ignoring portrait exited before the force-stop timeout"
test "$(grep -c '"'"'"provider":"kick","state":"stopped","role":"portrait"'"'"' "$FAKE_STATE_LOG" || true)" -eq 0 ||
	fail "portrait stop was acknowledged while its TERM-ignoring encoder lived"
for _ in {1..120}; do
	removal_children="$(live_children)"
	test "$removal_children" -ne 2 || break
	sleep 0.1
done
test "$removal_children" -eq 2 ||
	fail "portrait removal left $removal_children live encoders instead of 2 landscapes"
grep -q '"provider":"kick","state":"stopped","role":"portrait"' "$FAKE_STATE_LOG" ||
	fail "portrait removal was not reported"
for _ in {1..20}; do
	test -s "$FAKE_STOP_ACK_LOG" && break
	sleep 0.1
done
stop_ack_count="$(tail -n 1 "$FAKE_STOP_ACK_LOG")"
test "$stop_ack_count" -eq 2 ||
	fail "portrait stop was acknowledged with $stop_ack_count encoders still present"
kill -TERM "$script_pid" 2>/dev/null || true
wait "$script_pid" 2>/dev/null || true
rm -f "$FAKE_LIVE_MARKER"
rm -f "$FAKE_IGNORE_TERM"
sleep 5

# A new relay rolling out before the app must consume the old two-field
# landscape contract and must not require the new desired-state hook.
rm -f "$FAKE_PORTRAIT_REMOVED"
printf 'brb QmUgcmlnaHQgYmFjaw== - color\n' >"$FAKE_BRB_REPLY"
export FAKE_SERVER_VERSION=old
before_forwards="$(grep -c -- '-f flv' "$FAKE_FFMPEG_LOG" || true)"
before_active="$(wc -l <"$FAKE_ACTIVE_LOG" | tr -d ' ')"
touch "$FAKE_LIVE_MARKER"
start_script
script_pid=$!
sleep 3
after_forwards="$(grep -c -- '-f flv' "$FAKE_FFMPEG_LOG" || true)"
test "$((after_forwards - before_forwards))" -eq 3 ||
	fail "new relay did not consume the old server's landscape destinations"
sleep 3
test "$(wc -l <"$FAKE_ACTIVE_LOG" | tr -d ' ')" -eq "$before_active" ||
	fail "legacy fallback polled a hook that does not exist on the old server"
printf 'stop\n' >"$FAKE_BRB_REPLY"
kill -TERM "$script_pid" 2>/dev/null || true
wait "$script_pid" 2>/dev/null || true
rm -f "$FAKE_LIVE_MARKER"
sleep 5

# A later BRB snapshots a video playlist. It loops in order, mutes only when
# requested, draws the message only when overlay is on, and reports each start.
: >"$FAKE_FFMPEG_LOG"
: >"$FAKE_PLAYED_LOG"
: >"$FAKE_OUTPUT_LOG"
playlist="$(printf '1 1\nbad 500 https://clips.test/bad\none 500 https://clips.test/one\ntwo 500 https://clips.test/two' | base64)"
printf 'highlights QmUgcmlnaHQgYmFjaw== %s https://background.test/card image\n' \
	"$playlist" >"$FAKE_BRB_REPLY"
mkdir -p "$FAKE_BRB_DELAY_DIR"
touch "$FAKE_BRB_DELAY_DIR/twitch" "$FAKE_BRB_DELAY_DIR/kick" \
	"$FAKE_BRB_DELAY_DIR/youtube"
start_script
script_pid=$!
wait_for_live_children 3 || fail "pre-tick test did not start live outputs"
kill -TERM "$script_pid" 2>/dev/null || true
wait "$script_pid" 2>/dev/null || true
sleep 1
test "$(live_children)" -eq 0 ||
	fail "hold output started before the first eligibility tick"
for _ in {1..40}; do
	test "$(grep 'path-1-.*\.img.*-f flv' "$FAKE_FFMPEG_LOG" | grep -c .)" -lt 3 ||
		test "$(grep -- '-f concat' "$FAKE_FFMPEG_LOG" | grep -- '-f flv' | grep -c .)" -lt 3 || break
	sleep 0.25
done
test "$(grep 'path-1-.*\.img.*-f flv' "$FAKE_FFMPEG_LOG" | grep -c .)" -eq 3 ||
	fail "the image fallback was not used while highlights prepared"
highlight_outputs="$(grep -- '-f concat' "$FAKE_FFMPEG_LOG" | grep -- '-f flv' || true)"
test "$(printf '%s\n' "$highlight_outputs" | grep -c .)" -eq 3 ||
	fail "highlights did not keep one destination encoder: ffprobe=$(tr '\n' '|' <"$FAKE_FFPROBE_LOG") ffmpeg=$(tr '\n' '|' <"$FAKE_FFMPEG_LOG")"
first_output="$(grep -n 'path-1-.*\.img.*-f flv' "$FAKE_FFMPEG_LOG" | head -n 1 | cut -d: -f1 || true)"
first_normalization="$(grep -n 'highlights.*\.mp4' "$FAKE_FFMPEG_LOG" | head -n 1 | cut -d: -f1)"
test -n "$first_output" && test "$first_output" -lt "$first_normalization" ||
	fail "the still hold did not start before highlight preparation"
printf '%s\n' "$highlight_outputs" | grep -q -- '-stream_loop -1' ||
	fail "highlight playlist does not loop continuously"
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
	complete=1
	for key in TWITCHKEY KICKKEY YOUTUBEKEY; do
		test "$(awk -v key="$key" '$2 ~ key' "$FAKE_OUTPUT_LOG" | head -n 3 | wc -l | tr -d ' ')" -eq 3 || complete=0
	done
	test "$complete" -eq 0 || break
	sleep 0.25
done
for key in TWITCHKEY KICKKEY YOUTUBEKEY; do
	output="$(awk -v key="$key" '$2 ~ key { print $1, $3 }' "$FAKE_OUTPUT_LOG")"
	test "$(printf '%s\n' "$output" | awk '{ print $1 }' | sort -u | grep -c .)" -eq 1 ||
		fail "$key reopened its output connection between clips"
	sequence="$(printf '%s\n' "$output" | head -n 3 | awk '{ print $2 }' | sed 's|.*/||' | tr '\n' ' ')"
	test "$sequence" = "0.ts 1.ts 0.ts " ||
		fail "$key did not output continuously across the playlist boundary: $sequence"
done
if printf '%s\n' "$highlight_outputs" | grep -q -- '-an'; then
	fail "muted highlights removed the required AAC output"
fi
normalizations="$(grep 'highlights.*\.mp4' "$FAKE_FFMPEG_LOG" | grep -v -- '-f flv' || true)"
test "$(printf '%s\n' "$normalizations" | grep -c anullsrc)" -eq 2 ||
	fail "clips were not normalized exactly once per path with silence"
grep -q 'format=duration.*highlights.*1.mp4' "$FAKE_FFPROBE_LOG" ||
	fail "a valid sub-second clip was not probed deterministically"
grep -q 'highlights.*0.mp4' "$FAKE_FFPROBE_LOG" ||
	fail "an invalid clip was not probed before playback"
printf '%s\n' "$highlight_outputs" | grep -q 'drawtext=textfile=' ||
	fail "highlight overlay was not rendered"
for _ in 1 2 3 4 5 6 7 8; do
	test "$(wc -l <"$FAKE_PLAYED_LOG" | tr -d ' ')" -ge 2 && break
	sleep 0.25
done
test "$(wc -l <"$FAKE_PLAYED_LOG" | tr -d ' ')" -ge 2 ||
	fail "highlight starts were not reported from FFmpeg progress"
grep -q '"ordinal":1' "$FAKE_PLAYED_LOG" ||
	fail "playback progress did not report the first real start: $(tr '\n' '|' <"$FAKE_PLAYED_LOG")"
if grep -q '"token":' "$FAKE_PLAYED_LOG"; then
	fail "legacy sleep-simulated playback tokens were reported"
fi
printf 'stop\n' >"$FAKE_BRB_REPLY"
wait_for_hold_cleanup || fail "highlight hold did not clean up"

# Unmuted keeps source audio, fills missing audio with silence, and can omit the overlay.
: >"$FAKE_FFMPEG_LOG"
playlist="$(printf '0 0\none 500 https://clips.test/one\ntwo 500 https://clips.test/two' | base64)"
printf 'highlights QmUgcmlnaHQgYmFjaw== %s - snapshot\n' "$playlist" >"$FAKE_BRB_REPLY"
start_script
script_pid=$!
wait_for_live_children 3 || fail "unmuted test did not start live outputs"
printf 'snapshot' >"$VISP_RUN_DIR/path-1.jpg"
kill -TERM "$script_pid" 2>/dev/null || true
wait "$script_pid" 2>/dev/null || true
for _ in {1..40}; do
	grep 'highlights.*0.mp4' "$FAKE_FFMPEG_LOG" | grep -q -- '-map 0:a:0' &&
		grep 'highlights.*1.mp4' "$FAKE_FFMPEG_LOG" | grep -q anullsrc &&
		grep 'path-1-.*\.img.*-f flv' "$FAKE_FFMPEG_LOG" | grep -q 'boxblur=12:2' && break
	sleep 0.25
done
grep 'highlights.*0.mp4' "$FAKE_FFMPEG_LOG" | grep -q -- '-map 0:a:0' ||
	fail "unmuted source audio was not retained"
grep 'highlights.*1.mp4' "$FAKE_FFMPEG_LOG" | grep -q anullsrc ||
	fail "audio-less clip did not receive stereo silence"
overlay_off_outputs="$(grep -- '-f concat' "$FAKE_FFMPEG_LOG" | grep -- '-f flv' || true)"
if printf '%s\n' "$overlay_off_outputs" | grep -q drawtext; then
	fail "overlay-off highlights still rendered the message"
fi
grep 'path-1-.*\.img.*-f flv' "$FAKE_FFMPEG_LOG" | grep -q 'boxblur=12:2' ||
	fail "the snapshot fallback was not retained while highlights prepared"
printf 'stop\n' >"$FAKE_BRB_REPLY"
wait_for_hold_cleanup || fail "snapshot highlight hold did not clean up"

# An all-invalid playlist retains the configured image fallback.
: >"$FAKE_FFMPEG_LOG"
playlist="$(printf '1 1\nbad 500 https://clips.test/bad' | base64)"
printf 'highlights QmUgcmlnaHQgYmFjaw== %s https://background.test/card image\n' \
	"$playlist" >"$FAKE_BRB_REPLY"
start_script
script_pid=$!
wait_for_live_children 3 || fail "invalid-playlist test did not start live outputs"
kill -TERM "$script_pid" 2>/dev/null || true
wait "$script_pid" 2>/dev/null || true
for _ in {1..40}; do
	grep 'path-1-.*\.img.*-f flv' "$FAKE_FFMPEG_LOG" >/dev/null &&
		grep -q 'highlights.*0.mp4' "$FAKE_FFPROBE_LOG" && break
	sleep 0.25
done
grep 'path-1-.*\.img.*-f flv' "$FAKE_FFMPEG_LOG" >/dev/null ||
	fail "failed preparation did not retain the configured image fallback"
if grep -- '-f concat' "$FAKE_FFMPEG_LOG" >/dev/null; then
	fail "an all-invalid playlist replaced the configured fallback"
fi
printf 'stop\n' >"$FAKE_BRB_REPLY"
wait_for_hold_cleanup || fail "failed highlight hold did not clean up"

# A slow preparation that loses its final user must not publish a cache later.
: >"$FAKE_FFMPEG_LOG"
printf 'highlights QmUgcmlnaHQgYmFjaw== %s https://background.test/card image\n' \
	"$playlist" >"$FAKE_BRB_REPLY"
touch "$FAKE_CLIP_DELAY"
start_script
script_pid=$!
wait_for_live_children 3 || fail "slow-preparation test did not start live outputs"
kill -TERM "$script_pid" 2>/dev/null || true
wait "$script_pid" 2>/dev/null || true
for _ in {1..40}; do
	test -e "$FAKE_CLIP_DELAY" || break
	sleep 0.25
done
printf 'stop\n' >"$FAKE_BRB_REPLY"
wait_for_hold_cleanup || fail "slow highlight hold did not clean up"
sleep 6
test ! -e "$VISP_RUN_DIR/path-1-highlights" ||
	fail "the stopped preparation republished the shared highlight cache"

# A stop-first tick must not reconnect the destination after ingest disappears.
: >"$FAKE_FFMPEG_LOG"
printf 'stop\n' >"$FAKE_BRB_REPLY"
start_script
script_pid=$!
wait_for_live_children 3 || fail "stop-first test did not start live outputs"
kill -TERM "$script_pid" 2>/dev/null || true
wait "$script_pid" 2>/dev/null || true
sleep 2
test "$(grep -c -- '-f flv' "$FAKE_FFMPEG_LOG")" -eq 3 ||
	fail "a stop-first tick opened hold output"

# V3 carries stable output ids and selects the container from the protocol.
export FAKE_SERVER_VERSION=v3
: >"$FAKE_FFMPEG_LOG"
: >"$FAKE_STATE_LOG"
printf 'stop\n' >"$FAKE_BRB_REPLY"
touch "$FAKE_LIVE_MARKER"
start_script
script_pid=$!
wait_for_live_children 3 || fail "v3 did not start managed and custom outputs"
test "$(grep -c -- '-f flv' "$FAKE_FFMPEG_LOG" || true)" -eq 2 ||
	fail "v3 RTMP outputs did not use FLV"
test "$(grep -c -- '-f mpegts' "$FAKE_FFMPEG_LOG" || true)" -eq 1 ||
	fail "v3 SRT output did not use MPEG-TS"
grep -- '-f flv' "$FAKE_FFMPEG_LOG" | grep -q -- '-vf crop=iw\*0.3164:ih\*1:iw\*0.3418:ih\*0,scale=1080:1920' ||
	fail "v3 custom portrait filter was not passed to FFmpeg"
grep -q '"outputId":"160b40b3-4e27-4773-9941-1c93ec895906","state":"starting"' "$FAKE_STATE_LOG" ||
	fail "custom output state did not use its opaque id"
if grep -q 'CUSTOMKEY' "$FAKE_STATE_LOG" "$FAKE_BRB_LOG"; then
	fail "the custom destination credential reached a callback"
fi
touch "$FAKE_PORTRAIT_REMOVED"
for _ in {1..70}; do
	test "$(live_children)" -ne 2 || break
	sleep 0.1
done
test "$(live_children)" -eq 2 ||
	fail "custom portrait removal affected another v3 output"
for _ in {1..40}; do
	grep -q '"outputId":"260b40b3-4e27-4773-9941-1c93ec895906","state":"stopped"' "$FAKE_STATE_LOG" && break
	sleep 0.1
done
grep -q '"outputId":"260b40b3-4e27-4773-9941-1c93ec895906","state":"stopped"' "$FAKE_STATE_LOG" ||
	fail "custom portrait removal was not acknowledged"
kill -TERM "$script_pid" 2>/dev/null || true
wait "$script_pid" 2>/dev/null || true
rm -f "$FAKE_LIVE_MARKER"
wait_for_hold_cleanup || fail "v3 outputs did not stop cleanly"

printf 'ok: BRB held the stream up, resumed in place, and let go on stop\n'
exit 0
