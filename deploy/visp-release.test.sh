#!/usr/bin/env bash
# Patterns quote $vars literally on purpose: they match script text.
# shellcheck disable=SC2016
set -eu

root="$(cd "$(dirname "$0")" && pwd)"

# Upstreams must be ready before Caddy reload so reverse_proxy routes do not 502.
release=$(
	awk '/systemctl restart visp-server visp-web visp-typography-worker/,/echo "VISP /' \
		"$root/visp-release"
)
printf '%s\n' "$release" | grep -q 'systemctl restart visp-server visp-web visp-typography-worker'
grep -q 'systemctl enable visp-typography-worker' "$root/visp-release"
printf '%s\n' "$release" | grep -q 'systemctl reload caddy'
test "$(printf '%s\n' "$release" | grep -n 'systemctl reload caddy' | head -1 | cut -d: -f1)" \
	-gt "$(printf '%s\n' "$release" | grep -n '127.0.0.1:3001' | head -1 | cut -d: -f1)"
printf '%s\n' "$release" | grep -q 'visp-caddy-static-smoke.sh'
printf '%s\n' "$release" | grep -q '\$NATIVE_WEB_DOMAIN'
printf '%s\n' "$release" | grep -q '\$MULTICHAT_DOMAIN'
printf '%s\n' "$release" | grep -q '\$TYPOGRAPHY_DOMAIN'

staging=$(
	awk '/systemctl restart visp-server-staging visp-web-staging visp-typography-worker-staging/,/echo "VISP staging/' \
		"$root/visp-staging-release"
)
printf '%s\n' "$staging" | grep -q 'systemctl reload caddy'
test "$(printf '%s\n' "$staging" | grep -n 'systemctl reload caddy' | head -1 | cut -d: -f1)" \
	-gt "$(printf '%s\n' "$staging" | grep -n '127.0.0.1:3101' | head -1 | cut -d: -f1)"
printf '%s\n' "$staging" | grep -q 'stream.staging.visp-stream.com'
printf '%s\n' "$staging" | grep -q 'multichat.staging.visp-stream.com'
printf '%s\n' "$staging" | grep -q 'typography.staging.visp-stream.com'
printf '%s\n' "$staging" | grep -q 'visp-typography-smoke.sh'
grep -q 'docs/get-started/index.html' "$root/visp-build-outputs"
grep -q 'apps/web/.output/server/index.mjs' "$root/visp-build-outputs"
grep -q 'visp-build-outputs' "$root/visp-release"
grep -q 'visp-build-outputs' "$root/visp-staging-release"

# Production installs the CI-built site bundle instead of building on the host:
# the bundle is validated and checked against the host env files before the
# migration, and swapped in only after it. The bootstrap passes the bundle
# path through and still accepts two arguments for pre-bundle tags.
grep -q 'turbo run build' "$root/visp-release" && exit 1
grep -q 'build:web' "$root/visp-release" && exit 1
grep -q -- '--no-same-owner' "$root/visp-release"
grep -qF "grep -Ev '^apps/[^/]+/(dist|\\.output)(/|\$)'" "$root/visp-release"
unpack_line=$(grep -n 'tar -xzf "$bundle"' "$root/visp-release" | head -1 | cut -d: -f1)
baked_line=$(grep -n '^assert_baked "$native_web_env"' "$root/visp-release" | head -1 | cut -d: -f1)
swap_line=$(grep -n 'mv "$dir" "$target"' "$root/visp-release" | head -1 | cut -d: -f1)
prod_migrate_line=$(grep -n 'db:migrate; then' "$root/visp-release" | head -1 | cut -d: -f1)
test -n "$unpack_line" && test -n "$baked_line" && test -n "$swap_line"
test "$unpack_line" -lt "$baked_line"
test "$baked_line" -lt "$prod_migrate_line"
test "$prod_migrate_line" -lt "$swap_line"
grep -q '\[\[ $# -eq 2 || $# -eq 3 \]\]' "$root/visp-release-bootstrap"
grep -q 'exec "$helper" "$@"' "$root/visp-release-bootstrap"
grep -q 'visp-sites.tar.gz' "$root/../.github/workflows/release.yml"
grep -q 'VITE_API_URL' "$root/../turbo.json"

# Migrations run (and abort the release on failure) before any restart, and
# bypass turbo so MIGRATION_* overrides from app.env reach the migrator.
migrate_line=$(grep -n 'db:migrate' "$root/visp-release" | grep -v '^[0-9]*:#' | head -1 | cut -d: -f1)
restart_line=$(grep -n 'systemctl restart visp-server' "$root/visp-release" | head -1 | cut -d: -f1)
test -n "$migrate_line"
test "$migrate_line" -lt "$restart_line"
grep -q 'if ! run_with_env "$app_env" "$bun" run --cwd "$repo/packages/db" db:migrate; then' "$root/visp-release"
grep -q 'fail "database migration failed; services were not restarted"' "$root/visp-release"

test -f "$root/visp-caddy-static-smoke.sh"
grep -q -- '--resolve' "$root/visp-caddy-static-smoke.sh"
grep -q -- '--retry-all-errors' "$root/visp-caddy-static-smoke.sh"

printf 'ok: release installs the CI site bundle, migrates before restarting, waits for upstreams before Caddy reload and smoke-checks static vhosts\n'
