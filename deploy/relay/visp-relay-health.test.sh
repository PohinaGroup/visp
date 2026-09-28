#!/bin/sh
# The collector reads procfs, so it only runs on Linux: exercise it in a
# container against a stub sink and check the JSON body it posts.
set -eu

root="$(cd "$(dirname "$0")/../.." && pwd)"

docker run --rm --interactive --volume "$root/deploy/relay:/deploy:ro" \
	alpine:3.21 sh >/dev/null <<'CONTAINER'
set -eu
apk add --quiet bash curl

(printf 'HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n' \
	| nc -l -p 8080 >/tmp/request) &
sleep 1

APP_ORIGIN=http://127.0.0.1:8080 HOOK_SECRET=secret RELAY_NAME=relay-test \
	bash /deploy/visp-relay-health
wait

grep -q 'X-Hook-Secret: secret' /tmp/request
body=$(tail -n 1 /tmp/request)
echo "$body" | grep -q '"relay":"relay-test"'
# Every numeric field must be a bare number: an empty read would emit
# "load1":, which parses on no server and shows on no admin page.
for key in cpuCount load1 load5 load15 memTotalKb memAvailableKb \
	diskTotalKb diskAvailableKb uptimeSeconds; do
	echo "$body" | grep -qE "\"$key\":[0-9]+(\.[0-9]+)?[,}]" \
		|| { echo "missing or malformed $key in $body" >&2; exit 1; }
done
CONTAINER

printf 'ok: visp-relay-health posts a complete host sample\n'
