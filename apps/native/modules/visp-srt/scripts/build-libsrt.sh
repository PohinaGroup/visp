#!/usr/bin/env bash
set -euo pipefail

SRT_VERSION=1.5.4
MBEDTLS_VERSION=2.28.9
SRT_SHA256=d0a8b600fe1b4eaaf6277530e3cfc8f15b8ce4035f16af4a5eb5d4b123640cdd
MBEDTLS_SHA256=e4dbcf86a4fb31506482888560f02b161e0ecfb82fee0643abcfc86abee5817e
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
MODULE_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
VENDOR_DIR="$MODULE_DIR/vendor"
BUILD_DIR="${VISP_LIBSRT_BUILD_DIR:-$MODULE_DIR/.build-libsrt}"
SOURCE_DIR="$BUILD_DIR/sources"

download() {
  local url=$1 archive=$2 sha=$3
  if [[ ! -f "$archive" ]]; then
    curl --fail --location --retry 3 "$url" --output "$archive"
  fi
  echo "$sha  $archive" | shasum -a 256 --check
}

prepare_sources() {
  mkdir -p "$SOURCE_DIR"
  download \
    "https://github.com/Haivision/srt/archive/refs/tags/v${SRT_VERSION}.tar.gz" \
    "$SOURCE_DIR/srt.tar.gz" "$SRT_SHA256"
  download \
    "https://github.com/Mbed-TLS/mbedtls/archive/refs/tags/v${MBEDTLS_VERSION}.tar.gz" \
    "$SOURCE_DIR/mbedtls.tar.gz" "$MBEDTLS_SHA256"
  if [[ ! -d "$SOURCE_DIR/srt-$SRT_VERSION" ]]; then
    tar -xzf "$SOURCE_DIR/srt.tar.gz" -C "$SOURCE_DIR"
  fi
  if [[ ! -d "$SOURCE_DIR/mbedtls-$MBEDTLS_VERSION" ]]; then
    tar -xzf "$SOURCE_DIR/mbedtls.tar.gz" -C "$SOURCE_DIR"
  fi
}

build_mbedtls() {
  local name=$1 toolchain=$2 prefix=$3
  shift 3
  cmake -S "$SOURCE_DIR/mbedtls-$MBEDTLS_VERSION" -B "$BUILD_DIR/mbedtls-$name" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
    -DCMAKE_INSTALL_PREFIX="$prefix" \
    -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
    -DENABLE_PROGRAMS=OFF \
    -DENABLE_TESTING=OFF \
    ${toolchain:+-DCMAKE_TOOLCHAIN_FILE="$toolchain"} \
    "$@"
  cmake --build "$BUILD_DIR/mbedtls-$name" --target install --parallel
}

build_srt() {
  local name=$1 toolchain=$2 prefix=$3 shared=$4
  shift 4
  rm -rf "$BUILD_DIR/srt-$name"
  cmake -S "$SOURCE_DIR/srt-$SRT_VERSION" -B "$BUILD_DIR/srt-$name" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
    -DCMAKE_INSTALL_PREFIX="$prefix" \
    -DCMAKE_PREFIX_PATH="$prefix" \
    -DMBEDTLS_PREFIX="$prefix" \
    -DMBEDTLS_INCLUDE_DIR="$prefix/include" \
    -DMBEDTLS_LIB="$prefix/lib/libmbedtls.a" \
    -DMBEDCRYPTO_LIB="$prefix/lib/libmbedcrypto.a" \
    -DMBEDX509_LIB="$prefix/lib/libmbedx509.a" \
    -DSTATIC_MBEDTLS=ON \
    -DENABLE_APPS=OFF \
    -DENABLE_BONDING=ON \
    -DENABLE_ENCRYPTION=ON \
    -DENABLE_SHARED="$shared" \
    -DENABLE_STATIC="$([[ "$shared" == ON ]] && echo OFF || echo ON)" \
    -DUSE_ENCLIB=mbedtls \
    ${toolchain:+-DCMAKE_TOOLCHAIN_FILE="$toolchain"} \
    "$@"
  cmake --build "$BUILD_DIR/srt-$name" --target install --parallel
}

write_module_map() {
  local include=$1
  mkdir -p "$include"
  cat >"$include/module.modulemap" <<'EOF'
module libsrt {
  umbrella "srt"
  export *
}
EOF
}

build_ios() {
  command -v xcodebuild >/dev/null
  local xcframework="$VENDOR_DIR/ios/libsrt.xcframework"
  local args=()
  for platform in iphoneos iphonesimulator; do
    local name="ios-${platform}"
    local prefix="$BUILD_DIR/install-$name"
    local sdk
    sdk=$(xcrun --sdk "$platform" --show-sdk-path)
    local cmake_args=(
      -DCMAKE_SYSTEM_NAME=iOS
      -DCMAKE_OSX_ARCHITECTURES=arm64
      -DCMAKE_OSX_DEPLOYMENT_TARGET=16.4
      -DCMAKE_OSX_SYSROOT="$sdk"
    )
    build_mbedtls "$name" "" "$prefix" "${cmake_args[@]}"
    build_srt "$name" "" "$prefix" OFF "${cmake_args[@]}"
    libtool -static -o "$prefix/lib/libsrt-bonding.a" \
      "$prefix/lib/libsrt.a" \
      "$prefix/lib/libmbedcrypto.a" \
      "$prefix/lib/libmbedtls.a" \
      "$prefix/lib/libmbedx509.a"
    write_module_map "$prefix/include"
    args+=(-library "$prefix/lib/libsrt-bonding.a" -headers "$prefix/include")
  done
  rm -rf "$xcframework"
  mkdir -p "$(dirname "$xcframework")"
  xcodebuild -create-xcframework "${args[@]}" -output "$xcframework"
  local package_artifact="$MODULE_DIR/vendor/haishinkit/Artifacts/libsrt.xcframework"
  rm -rf "$package_artifact"
  cp -R "$xcframework" "$package_artifact"
}

build_android() {
  local ndk="${ANDROID_NDK_HOME:-${ANDROID_NDK_ROOT:-}}"
  [[ -n "$ndk" && -f "$ndk/build/cmake/android.toolchain.cmake" ]] || {
    echo "ANDROID_NDK_HOME must point to an Android NDK" >&2
    exit 1
  }
  local toolchain="$ndk/build/cmake/android.toolchain.cmake"
  for abi in arm64-v8a armeabi-v7a x86_64; do
    local name="android-${abi}"
    local prefix="$BUILD_DIR/install-$name"
    local cmake_args=(-DANDROID_ABI="$abi" -DANDROID_PLATFORM=android-24)
    build_mbedtls "$name" "$toolchain" "$prefix" "${cmake_args[@]}"
    build_srt "$name" "$toolchain" "$prefix" ON "${cmake_args[@]}"
    mkdir -p "$VENDOR_DIR/android/jniLibs/$abi"
    cp "$prefix/lib/libsrt.so" "$VENDOR_DIR/android/jniLibs/$abi/libsrt.so"
  done
  rm -rf "$VENDOR_DIR/include"
  cp -R "$BUILD_DIR/install-android-arm64-v8a/include" "$VENDOR_DIR/include"
}

prepare_sources
case "${1:-all}" in
  ios) build_ios ;;
  android) build_android ;;
  all) build_ios; build_android ;;
  *) echo "usage: $0 [ios|android|all]" >&2; exit 2 ;;
esac
