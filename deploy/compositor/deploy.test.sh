#!/usr/bin/env bash
set -eu

root="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# `! cmd` never trips `set -e`, so negative assertions go through this.
refute() {
	if "$@"; then
		printf 'FAIL: unexpectedly succeeded: %s\n' "$*" >&2
		exit 1
	fi
}

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
refute grep -q 'EnvironmentFile=/etc/visp/relay.env' "$root/../systemd/visp-compositor@.service"
grep -q 'EnvironmentFile=/run/visp/compositor-%i.env' "$root/../systemd/visp-compositor@.service"
grep -q 'Environment=HOME=/tmp/visp-studio-%i' "$root/../systemd/visp-compositor@.service"
refute grep -q 'process.env.HOOK_SECRET' "$root/visp-compositor.ts"
grep -q 'ExecStartPre=+/usr/local/libexec/visp-compositor-egress-check' "$root/../systemd/visp-compositor@.service"
grep -q 'Requires=.*visp-compositor-firewall.service' "$root/../systemd/visp-compositor@.service"
grep -q 'nft list table inet visp_compositor' "$root/visp-compositor-egress-check"
grep -q 'ExecStart=/usr/sbin/nft -f /etc/visp/visp-compositor.nft' "$root/../systemd/visp-compositor-firewall.service"
for option in ProtectProc=invisible ProtectKernelTunables=true ProtectKernelModules=true \
	ProtectControlGroups=true LockPersonality=true RestrictRealtime=true SystemCallArchitectures=native; do
	grep -qx "$option" "$root/../systemd/visp-compositor@.service"
done
# Chromium needs /proc/meminfo and its namespace sandbox.
refute grep -q '^ProcSubset=' "$root/../systemd/visp-compositor@.service"
refute grep -q '^RestrictNamespaces=' "$root/../systemd/visp-compositor@.service"

# The ruleset replaces itself atomically and admits only the loopback services
# the worker uses, before rejecting the rest of loopback.
nft_rules="$root/visp-compositor.nft"
grep -qx 'delete table inet visp_compositor' "$nft_rules"
refute grep -q 'daddr 127.0.0.0/8 accept' "$nft_rules"
refute grep -Eq '"visp-compositor" (udp|tcp) dport 53 accept' "$nft_rules"
loopback_reject="$(grep -n 'ip daddr 127.0.0.0/8 reject' "$nft_rules" | cut -d: -f1)"
test -n "$loopback_reject"
for allowed in 'ip daddr 127.0.0.53 udp dport 53 accept' 'ip daddr 127.0.0.1 tcp dport 8554 accept' \
	'ip daddr 127.0.0.1 udp dport 20000-29999 accept'; do
	line="$(grep -nF "$allowed" "$nft_rules" | cut -d: -f1)"
	test -n "$line" && test "$line" -lt "$loopback_reject"
done
grep -q 'ip6 daddr ::1 reject' "$nft_rules"
grep -q 'STUDIO_PORT_MIN = 20_000' "$root/ports.ts"
grep -q 'STUDIO_PORT_MAX = 29_999' "$root/ports.ts"
refute grep -q 'reuse=1' "$root/visp-compositor.ts" "$root/ports.ts"
grep -q -- '--remote-debugging-pipe' "$root/browser.ts"
refute grep -q -- '--remote-debugging-port' "$root/browser.ts"

# Egress check: firewall present, a usable resolver, ports outside ephemeral range.
mkdir "$work/bin"
printf '#!/bin/sh\nexit 0\n' >"$work/bin/nft"
chmod +x "$work/bin/nft"
egress() { PATH="$work/bin:$PATH" bash "$root/visp-compositor-egress-check" "$@" >/dev/null 2>&1; }
printf '32768 60999\n' >"$work/ports-default"
printf '10000 60999\n' >"$work/ports-overlap"
printf 'nameserver 127.0.0.53\noptions edns0\n' >"$work/resolved"
printf 'nameserver 1.1.1.1' >"$work/public"
printf 'nameserver 100.100.100.100\nnameserver 10.0.0.2\n' >"$work/private"
egress "$work/resolved" "$work/ports-default"
egress "$work/public" "$work/ports-default"
refute egress "$work/private" "$work/ports-default"
refute egress "$work/resolved" "$work/ports-overlap"
printf '#!/bin/sh\nexit 1\n' >"$work/bin/nft"
refute egress "$work/resolved" "$work/ports-default"
printf 'ok: compositor is a standalone binary with explicit media credentials\n'
