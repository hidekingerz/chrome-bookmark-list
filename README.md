# Chrome Bookmark List

新しいタブでブックマークをフォルダ別に一覧表示するChrome拡張機能

![Chrome Bookmark List Screenshot](screenshot.png)

## 機能

- 📁 ブックマークをフォルダ別にグループ表示
- 🔄 フォルダの展開・折りたたみ機能
- 📊 階層構造の表示（親フォルダ→子フォルダ）
- 🔍 リアルタイム検索機能（検索時は自動展開）
- 🎨 モダンで美しいUI
- ⚡ 高速なブックマークアクセス
- 📱 レスポンシブデザイン
- 🖼️ Favicon表示とキャッシュ機能
- 🔒 プライバシー重視（外部APIサービス不使用）

## ディレクトリ構造

```
chrome-bookmark-list/
├── src/                    # TypeScriptソースファイル
│   ├── manifest.json       # 拡張機能マニフェスト
│   ├── newtab.html         # 新しいタブページHTML
│   ├── newtab.ts           # メインTypeScript
│   ├── types.ts            # TypeScript型定義
│   ├── styles.css          # スタイルシート
│   └── icons/              # アイコンファイル
├── dist/                   # ビルド成果物（拡張機能用）
├── build.sh                # ビルドスクリプト
├── package.json            # Node.js依存関係
├── tsconfig.json           # TypeScript設定
├── screenshot.png          # スクリーンショット
└── README.md               # このファイル
```

## インストール方法

### 1. リポジトリのクローンと依存関係のインストール
```bash
git clone <このリポジトリのURL>
cd chrome-bookmark-list
npm install
```

### 2. プロジェクトのビルド
```bash
npm run build:extension
```

### 3. Chrome拡張機能として読み込み
1. Chromeで `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. **`dist`フォルダ**を選択（ビルド成果物が含まれています）
5. 新しいタブを開くと、ブックマーク一覧が表示されます

## 使用方法

1. 新しいタブを開く
2. ブックマークがフォルダ別に階層表示される
3. **サブフォルダの確認**: 各フォルダ内に薄紫色の背景でサブフォルダ一覧を表示
4. **サブフォルダの展開**: 📁アイコン付きのサブフォルダ名をクリックして内容を展開・折りたたみ
5. **ブックマークを開く**: ブックマークをクリックして新しいタブでページを開く
6. **検索**: 検索バーでブックマークタイトルやURLを素早く検索（検索時は関連フォルダが自動展開）

## 開発

このプロジェクトは以下の技術を使用しています：

- **TypeScript** - 型安全なJavaScript開発
- **Vitest** - 高速なテストフレームワーク（ユニットテスト・統合テスト）
- **Manifest V3** - 最新のChrome拡張機能仕様
- **Vanilla JavaScript/TypeScript** - フレームワークを使用しない軽量実装
- **CSS Grid & Flexbox** - モダンなレイアウト
- **Chrome Bookmarks API** - ブックマークデータへのアクセス
- **Happy DOM** - テスト環境でのDOM操作
- **JSDOM** - 統合テスト用のDOM環境

### 開発コマンド

- `npm run build` - TypeScriptをコンパイル
- `npm run build:extension` - 拡張機能をビルド（dist/フォルダに出力）
- `npm run dev` - TypeScriptの監視モード（ファイル変更時に自動再コンパイル）
- `npm run clean` - ビルド成果物をクリーンアップ

### テストコマンド

- `npm test` - Vitestでテストを実行（監視モード）
- `npm run test:run` - テストを一度だけ実行
- `npm run test:coverage` - カバレッジレポートを生成
- `npm run test:ui` - Vitestの可視化UIでテストを実行

## TypeScript化について

このプロジェクトはJavaScriptからTypeScriptに移植されました。主な改善点：

- **型安全性**: 実行時エラーを減らし、開発時にバグを発見
- **IntelliSense**: エディタでの自動補完とドキュメント表示
- **リファクタリング支援**: 安全な変数名変更や構造変更
- **モダンな開発環境**: 最新のJavaScript機能を安全に使用

### 型定義

- `BookmarkItem`: 個別のブックマーク情報
- `BookmarkFolder`: フォルダとサブフォルダの階層構造
- `ChromeBookmarkNode`: Chrome API からのデータ型
- `FaviconCacheData`: Favicon キャッシュデータ

### テスト

プロジェクトには包括的なテストスイートが含まれています：

#### ユニットテスト (`test/utils.test.ts`)
- ブックマークツリーの処理
- フォルダ検索機能
- ブックマーク数カウント
- 検索・フィルタリング機能
- HTMLエスケープ
- ドメイン抽出
- Faviconキャッシュ

#### 統合テスト (`test/integration.test.ts`)
- メイン機能の動作確認
- 検索機能の統合テスト
- Chrome API との連携
- DOM操作のテスト

#### テスト環境
- **Vitest**: 高速なテストランナー
- **Happy DOM**: 軽量なDOM環境
- **JSDOM**: 完全なDOM環境（統合テスト用）
- **Chrome API モック**: 拡張機能API のシミュレーション

テストカバレッジレポートは `coverage/index.html` で確認できます。

## CI/CD

このプロジェクトにはGitHub Actionsを使用した自動化されたCI/CDパイプラインが設定されています。

### GitHub Actions ワークフロー

- **トリガー**: `main`と`develop`ブランチへのプッシュ、`main`ブランチへのプルリクエスト
- **Node.js バージョン**: 18, 20, 22でのマトリックステスト
- **実行内容**:
  1. **テスト**: すべてのユニットテスト・統合テストを実行
  2. **カバレッジ**: テストカバレッジレポートを生成（Node.js 20のみ）
  3. **ビルド**: TypeScriptのコンパイルと拡張機能のビルド
  4. **型チェック**: TypeScriptの静的型チェック
  5. **アーティファクト**: ビルドされた拡張機能をGitHub Actionsアーティファクトとして保存

### ローカル開発での検証

```bash
# すべてのテストを実行
npm run test:run

# TypeScriptの型チェック
npx tsc --noEmit

# 拡張機能をビルド
npm run build:extension
```

## ライセンス

Apache License 2.0 - 詳細は [LICENSE](LICENSE) ファイルを参照してください。
