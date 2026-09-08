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

if [[ -n ${S3_BUCKET:-} ]]; then
	response=$(curl --fail --silent --show-error --max-time 15 --include \
		-X OPTIONS -H "Origin: https://$2" \
		-H 'Access-Control-Request-Method: PUT' \
		-H 'Access-Control-Request-Headers: content-type' \
		"${S3_UPLOAD_ENDPOINT:-${S3_ENDPOINT:?}}/${S3_BUCKET}/typography/cors-check")
	printf '%s\n' "$response" | grep -Fiq "access-control-allow-origin: https://$2"
	printf 'ok: Typography storage accepts browser upload preflight\n'
fi
