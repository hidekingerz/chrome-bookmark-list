---
name: release-prep
description: リリース用のバージョン更新を行う。package.json と src/manifest.json の version を同期して引き上げ、ビルドが通ることを確認する。バージョンを上げたいとき（例「v4.0.1 にして」「パッチを上げて」）に使用する。
disable-model-invocation: true
---

# release-prep

拡張機能のバージョンを引き上げるスキル。`package.json` と `src/manifest.json` の **version は必ず一致**させる必要がある（Chrome ウェブストアは manifest の version を、開発側は package.json を参照するため）。片方だけ更新する事故を防ぐ。

## 引数

- パッチ/マイナー/メジャー、または具体的なバージョン番号（例 `4.0.2`）。
  - 指定がなければ現在の version を提示し、どう上げるか確認する。

## 実行手順

1. **現在バージョンの確認**
   ```bash
   grep '"version"' package.json src/manifest.json
   ```
   両者が一致していることを前提確認する（ずれていたら先に指摘）。

2. **新バージョンの決定**
   - semver に従って次バージョンを算出（patch: x.y.Z+1 / minor: x.Y+1.0 / major: X+1.0.0）。
   - 直近の git tag やコミット履歴（`git log --oneline -5`）も参考にする。

3. **両ファイルの version を更新**
   - `package.json` の `"version"`
   - `src/manifest.json` の `"version"`
   - 必ず**同じ値**にする。

4. **ビルド確認**
   ```bash
   npm run build:extension
   ```
   成功し、`dist/manifest.json` に新バージョンが反映されることを確認する。

5. **コミット**
   - 変更内容を `git diff` で提示し、ユーザーの承認を得てからコミットする。
   - コミットメッセージ例: `vX.Y.Z へバージョンを上げる`（既存の履歴の書式に合わせる）。

## 注意

- version 以外のコード変更はこのスキルでは行わない（純粋にリリース準備のみ）。
- リリース前の品質確認が必要なら `/ship-check` の併用を案内する。
