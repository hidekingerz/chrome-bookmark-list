# ARCHITECTURE — 技術スタックとフォルダ構成

> エージェントが DISCOVER を高速化するためのプロジェクト知識。毎周ゼロから推測させない。
> ※ ループの作業ディレクトリ（cwd）は**リポジトリルート**。ループ用ドキュメントは `loop/` 配下。

## スタック

- 言語 / ランタイム: TypeScript 5 / Chrome 拡張（Manifest V3, New Tab 置き換え）
- フレームワーク: なし（素の TS + DOM）
- テスト: Vitest 4（環境: happy-dom、globals 有効、`test/setup.ts` で Chrome API をモック）
- Lint / Format: Biome 2（`biome.json`。lineWidth 80 / space 2 / single quote / semicolons）
- パッケージマネージャ: npm

## 主要ディレクトリ

```
src/
  components/   UI コンポーネント群（BookmarkFolder, ContextMenu, HistoryPanel, UndoManager 等）
  services/     BookmarkService / FaviconService / ErrorHandler（← 低カバレッジ）
  scripts/      newtab-core.ts / history.ts / utils.ts / newtab.ts（エントリ）
  utils/        HtmlUtils.ts（← 最低カバレッジ 15%）
  constants/    定数
  types/        型定義
  manifest.json / newtab.html / styles.css / icons/   （静的アセット。テスト対象外）
test/           全テスト（フラット配置・機能名.test.ts）。例: utils.test.ts, bookmark-*.test.ts
  setup.ts      Chrome API モック（chrome.bookmarks / tabs / storage / history 等）
docs/           internal-specification.md / external-specification.md（仕様の正）
dist/           ビルド成果物（gitignore・Biome 除外）
```

## 重要な慣習

- テストは `src/` と同階層ではなく **`test/` 配下にフラットに** 機能名で置く（例: `test/foo.test.ts`）。
  新規テストもこの慣習に従う。
- テストは `src/` から相対 import するか `@`（= `./src`）エイリアスで import する（`vitest.config.ts`）。
- Chrome API（`chrome.*`）はグローバルにモック済み（`test/setup.ts`）。新 API を使うコードを
  テストする場合は setup のモックを拡張する（既存モックを壊さないこと）。
- DOM は happy-dom。`document` / `window` は利用可能。

## ビルド / 実行 / 検証コマンド

- インストール: `npm install`（通常は不要。`node_modules` 済み）
- **VERIFY（毎周の品質ゲート＝速い静的検査）**: `npm run lint && npm run format && npm run test`
  - `npm run lint` … `biome lint .`（lint 違反で非0終了）
  - `npm run format` … `biome format .`（整形漏れで非0終了。非変更チェック）
  - `npm run test` … `vitest run`（全テスト pass。※ coverage しきい値はここでは課されない）
  - 整形漏れがあれば `npm run format:write`、lint 自動修正は `npm run lint:fix` で直してから再検証する。
  - 注: `npm run check`（= `biome check .`）は既存コードの import 並び順（organizeImports assist）
    まで赤にするためベースラインが緑にならない。VERIFY には使わず lint/format を使うこと。
- **完了ゲートの追加項目（重い・完了判定のみ）**:
  - `npm run test:coverage` … coverage 収集 + **しきい値判定**（Statements 95% / Branches 85%。
    `vitest.config.ts` の `coverage.thresholds`。未達なら非0終了）。
  - `npm run build:extension` … `./build.sh`（npm install + tsc + 静的ファイルを dist へコピー）。成功必須。
- MCP 検証: このプロジェクトでは**使わない**（静的ゲートのみ）。

## カバレッジの確認方法

- `npm run test:coverage` の末尾に Coverage summary（Statements/Branches/Functions/Lines）が出る。
- ファイル別の未到達行は同出力の表（右端 "Uncovered Line #s"）で分かる。低い順に攻める。

## 参照（改変しない）

- `docs/internal-specification.md` / `docs/external-specification.md` … 挙動の正解。テストが仕様と
  食い違う場合は仕様を正とする（テスト側を直す）。
