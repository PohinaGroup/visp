#!/bin/sh
set -eu

root="$(cd "$(dirname "$0")/../.." && pwd)"
image="visp-bond:test"

docker build -f "$root/deploy/relay/visp-bond/Dockerfile" \
	-t "$image" "$root" >/dev/null
docker run --rm --interactive --entrypoint sh "$image" >/dev/null <<'CONTAINER'
timeout 2 sh -c '
	visp-bond &
	pid=$!
	sleep 1
	kill -TERM "$pid"
	wait "$pid"
	test $? -eq 143
'
CONTAINER

printf 'ok: visp-bond stops on SIGTERM without waiting for SIGKILL\n'
