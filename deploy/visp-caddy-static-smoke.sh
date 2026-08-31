#!/usr/bin/env bash
# Verify Caddy serves static SPA vhosts over loopback HTTPS after reload.
set -Eeuo pipefail

fail() {
	echo "visp-caddy-static-smoke: $*" >&2
	exit 1
}

[[ $# -gt 0 ]] || fail "usage: visp-caddy-static-smoke.sh <domain> [...]"

for domain; do
	if ! curl --retry 10 --retry-delay 1 --retry-max-time 20 --retry-all-errors \
		--fail --silent --show-error --insecure \
		--resolve "${domain}:443:127.0.0.1" \
		"https://${domain}/" >/dev/null; then
		fail "Caddy did not serve https://${domain}/"
	fi
done
