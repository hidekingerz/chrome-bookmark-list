#!/bin/bash
# Chrome ウェブストアに提出する ZIP を作る。
# dist/ をビルドし直し、動作に要らないファイル（ソースマップ、macOS の .DS_Store や
# ._ で始まる付属ファイル）を除いて、manifest.json が ZIP の一番上に来るように固める。
set -euo pipefail

cd "$(dirname "$0")"

./build.sh

VERSION=$(node -p "require('./src/manifest.json').version")
OUTPUT="chrome-bookmark-list-v${VERSION}.zip"

rm -f "$OUTPUT"
(
  cd dist
  # -X: macOS の拡張属性（__MACOSX/ の元）を入れない
  zip -qrX "../$OUTPUT" . \
    -x '*.map' \
    -x '*.DS_Store' \
    -x '._*' -x '*/._*'
)

echo "Packaged: $OUTPUT ($(du -h "$OUTPUT" | cut -f1), $(unzip -Z1 "$OUTPUT" | wc -l | tr -d ' ') files)"
