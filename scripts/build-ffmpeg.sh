#!/usr/bin/env bash
# Builds a minimal, static, LGPL-only ffmpeg + ffprobe for one Tauri target and puts them in
# src-tauri/binaries/ with the target-triple suffix Tauri expects for sidecars.
#
# Grabby never re-encodes video: ffmpeg only merges streams (stream copy) and, for non-AAC audio
# from non-YouTube sites, encodes AAC. So: no GPL parts, no external libs, no network, no devices,
# a single encoder (aac). All decoders/demuxers/muxers stay, so any site's streams can be merged.
#
# Usage: scripts/build-ffmpeg.sh <target-triple>
#   aarch64-apple-darwin | x86_64-apple-darwin   (on a Mac, either arch: the other one is cross-compiled)
#   x86_64-pc-windows-msvc                         (on Linux/Mac with mingw-w64, or in an MSYS2 MINGW64 shell)
set -euo pipefail

FFMPEG_VERSION="9.0.2"
FFMPEG_SHA256="8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e"
MACOS_MIN="11.0"

TARGET="${1:?usage: build-ffmpeg.sh <target-triple>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/.cache/ffmpeg"
BIN_DIR="$ROOT/src-tauri/binaries"
JOBS="$(sysctl -n hw.ncpu 2>/dev/null || nproc)"

case "$TARGET" in
  aarch64-apple-darwin)
    ARCH_FLAGS=(--arch=arm64 --cc="clang -arch arm64" --enable-cross-compile
      --extra-cflags="-mmacosx-version-min=$MACOS_MIN" --extra-ldflags="-mmacosx-version-min=$MACOS_MIN")
    EXE="" ;;
  x86_64-apple-darwin)
    # x86 SIMD needs nasm and only speeds up decoding, which stream copy doesn't do
    ARCH_FLAGS=(--arch=x86_64 --cc="clang -arch x86_64" --enable-cross-compile --disable-x86asm
      --extra-cflags="-mmacosx-version-min=$MACOS_MIN" --extra-ldflags="-mmacosx-version-min=$MACOS_MIN")
    EXE="" ;;
  x86_64-pc-windows-msvc)
    # -static: no libgcc/libwinpthread DLLs next to the exe
    ARCH_FLAGS=(--target-os=mingw32 --arch=x86_64 --disable-x86asm --extra-ldflags="-static -static-libgcc")
    if [[ "$(uname -s)" != MINGW* ]]; then
      ARCH_FLAGS+=(--enable-cross-compile --cross-prefix=x86_64-w64-mingw32-)
    fi
    EXE=".exe" ;;
  *)
    echo "Unsupported target: $TARGET" >&2
    exit 1 ;;
esac

# Source: pinned version, checked against a pinned hash
mkdir -p "$CACHE"
TARBALL="$CACHE/ffmpeg-$FFMPEG_VERSION.tar.xz"
if [[ ! -f "$TARBALL" ]]; then
  curl -sSfL -o "$TARBALL" "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz"
fi
ACTUAL_SHA256="$( (sha256sum "$TARBALL" 2>/dev/null || shasum -a 256 "$TARBALL") | cut -d' ' -f1)"
if [[ "$ACTUAL_SHA256" != "$FFMPEG_SHA256" ]]; then
  echo "ffmpeg source checksum mismatch: $ACTUAL_SHA256" >&2
  exit 1
fi

# Fresh build dir per target: configure results differ between targets
BUILD="$CACHE/build-$TARGET"
rm -rf "$BUILD"
mkdir -p "$BUILD"
tar -xf "$TARBALL" -C "$BUILD" --strip-components=1
cd "$BUILD"

# No --enable-gpl / --enable-version3 / --enable-nonfree: the result is LGPL 2.1+
./configure \
  "${ARCH_FLAGS[@]}" \
  --enable-static --disable-shared \
  --disable-autodetect --disable-network --disable-doc --disable-debug \
  --disable-avdevice --disable-devices --disable-hwaccels \
  --disable-programs --enable-ffmpeg --enable-ffprobe \
  --disable-encoders --enable-encoder=aac \
  --enable-small

make -j"$JOBS"

mkdir -p "$BIN_DIR"
cp "ffmpeg$EXE" "$BIN_DIR/ffmpeg-$TARGET$EXE"
cp "ffprobe$EXE" "$BIN_DIR/ffprobe-$TARGET$EXE"
echo "Built ffmpeg $FFMPEG_VERSION for $TARGET -> $BIN_DIR"
