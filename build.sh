#!/bin/bash

# TypeScript型定義とTypeScriptコンパイラをインストール
echo "Installing dependencies..."
npm install

# TypeScriptをコンパイル
echo "Compiling TypeScript..."
npm run build

# distディレクトリが存在しない場合は作成
if [ ! -d "dist" ]; then
    mkdir dist
fi

# HTML、CSS、アイコン、manifestファイルをdistにコピー
echo "Copying static files..."
cp src/newtab.html dist/
cp src/styles.css dist/
cp src/manifest.json dist/

# iconsディレクトリをコピー
if [ -d "src/icons" ]; then
    cp -r src/icons dist/
fi

echo "Build complete! Chrome extension files are in the 'dist' directory."
echo "To install the extension:"
echo "1. Open Chrome and go to chrome://extensions/"
echo "2. Enable 'Developer mode'"
echo "3. Click 'Load unpacked' and select the 'dist' folder"
