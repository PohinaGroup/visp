#!/usr/bin/env bash
set -euo pipefail

# An anonymous request must reach the API, not the portal's HTML fallback.
response=$(curl --silent --show-error --max-time 15 --include \
	-H "Origin: https://${2:?typography domain required}" \
	"https://${1:?API domain required}/api/typography/projects")
printf '%s\n' "$response" | grep -Eq '^HTTP/[^ ]+ 401'
printf '%s\n' "$response" | grep -Fiq "access-control-allow-origin: https://$2"
printf '%s\n' "$response" | grep -Fq '"error":"Authentication required"'
printf 'ok: Typography API routing, authentication, and CORS\n'
