#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFO_PLIST="$ROOT_DIR/work/mochi-md-native/Info.plist"
DIST_DIR="$ROOT_DIR/dist"
APP_DIR="$DIST_DIR/Mochi MD.app"
VERSION="$(plutil -extract CFBundleShortVersionString raw -o - "$INFO_PLIST")"

rm -rf "$DIST_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

clang -fobjc-arc \
  -framework Cocoa \
  -framework WebKit \
  "$ROOT_DIR/work/mochi-md-native/MochiMD.m" \
  -o "$APP_DIR/Contents/MacOS/MochiMD"

cp "$INFO_PLIST" "$APP_DIR/Contents/Info.plist"
cp -R "$ROOT_DIR/outputs/mochi-md" "$APP_DIR/Contents/Resources/web"
cp "$ROOT_DIR/outputs/MochiMD-0.3.5.icns" "$APP_DIR/Contents/Resources/"
cp "$ROOT_DIR/outputs/MochiMD-Markdown.icns" "$APP_DIR/Contents/Resources/"

codesign --force --deep --sign - "$APP_DIR"
ditto -c -k --sequesterRsrc --keepParent "$APP_DIR" "$DIST_DIR/Mochi MD-macOS.zip"

echo "Built Mochi MD $VERSION"
echo "$DIST_DIR/Mochi MD.app"
echo "$DIST_DIR/Mochi MD-macOS.zip"
