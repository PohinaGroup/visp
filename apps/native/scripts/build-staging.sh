#!/usr/bin/env bash
# Builds the side-by-side VISP (TEST) apps against staging.
#
#   scripts/build-staging.sh ios
#   scripts/build-staging.sh android
#
# iOS: the committed ios/ project carries the production bundle identifier,
# and EAS never overrides it. So this prebuilds ios/ inside a throwaway git
# worktree with VISP_ENV=staging (which switches app.config.js to
# com.pohinagroup.visp.test), commits the generated project locally, and hands
# the worktree to EAS. The production checkout is never touched.
# Android: android/ is unmanaged and prebuilt on the EAS builder from this
# config, so no worktree is needed — the profile env alone is enough.
set -Eeuo pipefail

platform=${1:?usage: build-staging.sh ios|android}
case "$platform" in
ios | android) ;;
*) echo "unknown platform: $platform" >&2; exit 1 ;;
esac

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root/apps/native"

if [[ $platform == android ]]; then
	exec eas build --profile staging --platform android
fi

worktree=/tmp/visp-staging-native
git -C "$repo_root" worktree remove --force "$worktree" 2>/dev/null || true
git -C "$repo_root" worktree prune
git -C "$repo_root" worktree add "$worktree" HEAD

cleanup() {
	git -C "$repo_root" worktree remove --force "$worktree" 2>/dev/null || true
}
trap cleanup EXIT

(cd "$worktree" && bun install)
(
	cd "$worktree/apps/native"
	export VISP_ENV=staging
	bunx expo prebuild --platform ios --clean
	cd ios && pod install
	git add -A
	git -c user.name=staging -c user.email=staging@local commit -qm "staging prebuild"
	eas build --profile staging --platform ios
)
