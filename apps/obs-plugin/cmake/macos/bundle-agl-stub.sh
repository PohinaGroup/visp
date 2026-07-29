#!/usr/bin/env bash
set -euo pipefail

target=$1
stub=$2

cp "${stub}" "$(dirname "${target}")/libAGL_stub.dylib"

if otool -L "${target}" | grep -Fq '@rpath/AGL.framework/Versions/A/AGL'; then
  install_name_tool -change @rpath/AGL.framework/Versions/A/AGL \
    @loader_path/libAGL_stub.dylib "${target}"
fi

codesign --force --sign - "$(dirname "${target}")/libAGL_stub.dylib"
