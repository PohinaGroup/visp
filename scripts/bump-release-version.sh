#!/usr/bin/env bash
# Sync the release version across native app + OBS plugin files.
# Usage:
#   scripts/bump-release-version.sh              # interactive
#   scripts/bump-release-version.sh 1.2.3        # set explicit version
#   scripts/bump-release-version.sh --prompt     # yes/no then ask for version
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

app_json="apps/native/app.json"
native_pkg="apps/native/package.json"
pbxproj="apps/native/ios/VISP.xcodeproj/project.pbxproj"
buildspec="apps/obs-plugin/buildspec.json"

version_re='^[0-9]+\.[0-9]+\.[0-9]+$'

current_version="$(jq -r .expo.version "$app_json")"

if [[ ! "$current_version" =~ $version_re ]]; then
	echo "error: could not read current version from $app_json" >&2
	exit 1
fi

# Prefer /dev/tty so the prompt works under git hooks (stdin is often not a TTY).
can_prompt() {
	{ true <>/dev/tty; } 2>/dev/null || [[ -t 0 ]]
}

ask() {
	local prompt="$1" reply=""
	if { true <>/dev/tty; } 2>/dev/null; then
		printf '%s' "$prompt" >/dev/tty
		read -r reply </dev/tty || return 1
	elif [[ -t 0 ]]; then
		printf '%s' "$prompt"
		read -r reply || return 1
	else
		return 1
	fi
	printf '%s' "$reply"
}

prompt_for_update() {
	local reply
	reply="$(ask "Release version is currently ${current_version}. Update it for this commit? [y/N] ")" || return 1
	[[ "$reply" =~ ^[Yy]([Ee][Ss])?$ ]]
}

ask_new_version() {
	local default next
	IFS=. read -r major minor patch <<<"$current_version"
	default="${major}.${minor}.$((patch + 1))"
	next="$(ask "New version [${default}]: ")" || next=""
	if [[ -z "$next" ]]; then
		next="$default"
	fi
	printf '%s' "$next"
}

set_version() {
	local version="$1"

	if [[ ! "$version" =~ $version_re ]]; then
		echo "error: version must match X.Y.Z (got: $version)" >&2
		exit 1
	fi

	if [[ "$version" == "$current_version" ]]; then
		echo "Version is already $version; nothing to update."
		return 0
	fi

	tmp="$(mktemp)"
	jq --indent 2 --arg v "$version" '.expo.version = $v' "$app_json" >"$tmp"
	mv "$tmp" "$app_json"

	tmp="$(mktemp)"
	jq --indent 2 --arg v "$version" '.version = $v' "$native_pkg" >"$tmp"
	mv "$tmp" "$native_pkg"

	tmp="$(mktemp)"
	jq --indent 4 --arg v "$version" '.version = $v' "$buildspec" >"$tmp"
	mv "$tmp" "$buildspec"

	sed -i.bak -E "s/^([[:space:]]*MARKETING_VERSION = )[^;]+;/\1${version};/" "$pbxproj"
	rm -f "${pbxproj}.bak"

	echo "Updated release version: $current_version → $version"
	echo "  - $app_json (expo.version)"
	echo "  - $native_pkg (version)"
	echo "  - $pbxproj (MARKETING_VERSION)"
	echo "  - $buildspec (version)"

	if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
		local pending_tag_file
		pending_tag_file="$(git rev-parse --git-dir)/VISP_PENDING_RELEASE_TAG"
		git add -- "$app_json" "$native_pkg" "$pbxproj" "$buildspec"
		printf '%s\n' "$version" >"$pending_tag_file"
		echo "Will create annotated tag v${version} after this commit succeeds."
	fi
}

create_pending_tag() {
	local git_dir pending version tag branch head_version

	git_dir="$(git rev-parse --git-dir)"
	pending="${git_dir}/VISP_PENDING_RELEASE_TAG"

	if [[ ! -f "$pending" ]]; then
		return 0
	fi

	if [[ "${SKIP_VERSION_TAG:-}" == "1" ]]; then
		rm -f "$pending"
		return 0
	fi

	version="$(tr -d '[:space:]' <"$pending")"
	rm -f "$pending"

	if [[ ! "$version" =~ $version_re ]]; then
		echo "warning: ignoring invalid pending release tag: ${version}" >&2
		return 0
	fi

	head_version="$(jq -r .expo.version "$app_json")"
	if [[ "$head_version" != "$version" ]]; then
		echo "warning: pending tag v${version} does not match HEAD version ${head_version}; skipping tag" >&2
		return 0
	fi

	if ! git diff-tree --no-commit-id --name-only -r HEAD | grep -qx "$app_json"; then
		echo "warning: ${app_json} was not part of HEAD; skipping tag v${version}" >&2
		return 0
	fi

	tag="v${version}"
	if git rev-parse "refs/tags/${tag}" >/dev/null 2>&1; then
		echo "Tag ${tag} already exists; skipping."
		return 0
	fi

	branch="$(git branch --show-current 2>/dev/null || true)"
	if [[ "$branch" != "main" ]]; then
		echo "warning: not on main (on '${branch:-detached}'); skipping automatic tag ${tag}" >&2
		echo "Create it later with: git tag -a ${tag} -m 'VISP ${tag}'" >&2
		return 0
	fi

	git tag -a "$tag" -m "VISP ${tag}"
	echo "Created annotated tag ${tag} → $(git rev-parse --short HEAD)"
	echo "Push when ready:"
	echo "  git push origin main"
	echo "  git push origin ${tag}"
}

mode="${1:-}"

case "$mode" in
--prompt)
	if [[ "${SKIP_VERSION_PROMPT:-}" == "1" ]]; then
		exit 0
	fi
	if ! can_prompt; then
		exit 0
	fi
	if ! prompt_for_update; then
		exit 0
	fi
	set_version "$(ask_new_version)"
	;;
--tag-pending)
	create_pending_tag
	;;
"")
	if ! can_prompt; then
		echo "error: no TTY available; pass a version like: $0 1.2.3" >&2
		exit 1
	fi
	if ! prompt_for_update; then
		exit 0
	fi
	set_version "$(ask_new_version)"
	;;
-h | --help)
	cat <<'EOF'
Sync the VISP release version across:

  apps/native/app.json                         expo.version
  apps/native/package.json                     version
  apps/native/ios/VISP.xcodeproj/project.pbxproj  MARKETING_VERSION
  apps/obs-plugin/buildspec.json               version

Usage:
  scripts/bump-release-version.sh              Interactive yes/no + version
  scripts/bump-release-version.sh --prompt     Same, for pre-commit use
  scripts/bump-release-version.sh 1.2.3        Set version non-interactively
  scripts/bump-release-version.sh --tag-pending
      Create vX.Y.Z after a version-bump commit (used by post-commit)

After a successful version-bump commit on main, the post-commit hook creates:
  git tag -a vX.Y.Z -m 'VISP vX.Y.Z'

Set SKIP_VERSION_PROMPT=1 to skip the pre-commit prompt.
Set SKIP_VERSION_TAG=1 to skip automatic tagging.
EOF
	;;
*)
	set_version "$mode"
	;;
esac
