#!/usr/bin/env bash
set -eu

root="$(cd "$(dirname "$0")" && pwd)"

# Upstreams must be ready before Caddy reload so reverse_proxy routes do not 502.
release=$(
	awk '/systemctl restart visp-server visp-web/,/echo "VISP /' \
		"$root/visp-release"
)
printf '%s\n' "$release" | grep -q 'systemctl restart visp-server visp-web'
printf '%s\n' "$release" | grep -q 'systemctl reload caddy'
test "$(printf '%s\n' "$release" | grep -n 'systemctl reload caddy' | head -1 | cut -d: -f1)" \
	-gt "$(printf '%s\n' "$release" | grep -n '127.0.0.1:3001' | head -1 | cut -d: -f1)"
printf '%s\n' "$release" | grep -q 'visp-caddy-static-smoke.sh'
printf '%s\n' "$release" | grep -q '\$NATIVE_WEB_DOMAIN'

staging=$(
	awk '/systemctl restart visp-server-staging/,/echo "VISP staging/' \
		"$root/visp-staging-release"
)
printf '%s\n' "$staging" | grep -q 'systemctl reload caddy'
test "$(printf '%s\n' "$staging" | grep -n 'systemctl reload caddy' | head -1 | cut -d: -f1)" \
	-gt "$(printf '%s\n' "$staging" | grep -n '127.0.0.1:3101' | head -1 | cut -d: -f1)"
printf '%s\n' "$staging" | grep -q 'stream.staging.visp-stream.com'

test -f "$root/visp-caddy-static-smoke.sh"
grep -q -- '--resolve' "$root/visp-caddy-static-smoke.sh"
grep -q -- '--retry-all-errors' "$root/visp-caddy-static-smoke.sh"

printf 'ok: release waits for upstreams before Caddy reload and smoke-checks static vhosts\n'
