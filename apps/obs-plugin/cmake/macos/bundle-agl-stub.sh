#!/usr/bin/env bash
set -euo pipefail

target=$1
stub=$2

macos_dir="$(dirname "${target}")"
stub_path="${macos_dir}/libAGL_stub.dylib"
bundle_dir="$(dirname "$(dirname "${macos_dir}")")"

cp "${stub}" "${stub_path}"

if otool -L "${target}" | grep -Fq '@rpath/AGL.framework/Versions/A/AGL'; then
  install_name_tool -change @rpath/AGL.framework/Versions/A/AGL \
    @loader_path/libAGL_stub.dylib "${target}"
fi

sign_identity="${EXPANDED_CODE_SIGN_IDENTITY:-${CODESIGN_IDENT:--}}"

if [[ "${sign_identity}" == "-" ]]; then
  codesign --force --sign - "${stub_path}"
else
  # install_name_tool invalidates signatures; re-sign nested code and the bundle
  # with the release identity so notarization sees a consistent Developer ID tree.
  codesign --force --sign "${sign_identity}" --timestamp --options runtime "${stub_path}"
  codesign --force --sign "${sign_identity}" --timestamp --options runtime "${target}"
  codesign --force --sign "${sign_identity}" --timestamp --options runtime "${bundle_dir}"
fi
