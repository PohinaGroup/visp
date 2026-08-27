#!/usr/bin/env bash
set -eu

root="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

bun build --compile "$root/visp-compositor.ts" --outfile "$work/visp-compositor" >/dev/null
test -x "$work/visp-compositor"
if "$work/visp-compositor" >"$work/out" 2>&1; then
	printf 'FAIL: compositor started without its deployment contract\n' >&2
	exit 1
fi
grep -q 'usage: visp-compositor' "$work/out"
grep -q 'STUDIO_MEDIA_USER' "$root/../../apps/server/.env.example"
grep -q 'User=visp-compositor' "$root/../systemd/visp-compositor@.service"
grep -q '^MemoryMax=' "$root/../systemd/visp-compositor@.service"
grep -q '^CPUQuota=' "$root/../systemd/visp-compositor@.service"
grep -q '^TasksMax=' "$root/../systemd/visp-compositor@.service"
! grep -q 'EnvironmentFile=/etc/visp/relay.env' "$root/../systemd/visp-compositor@.service"
grep -q 'EnvironmentFile=/run/visp/compositor-%i.env' "$root/../systemd/visp-compositor@.service"
! grep -q 'process.env.HOOK_SECRET' "$root/visp-compositor.ts"
grep -q 'ExecStartPre=/usr/local/libexec/visp-compositor-egress-check' "$root/../systemd/visp-compositor@.service"
grep -q 'nft list table inet visp_compositor' "$root/visp-compositor-egress-check"
printf 'ok: compositor is a standalone binary with explicit media credentials\n'
