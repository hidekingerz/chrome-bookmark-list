# Chrome Bookmark List - 内部仕様書

## 目次

1. [システム構成](#システム構成)
2. [アーキテクチャ設計](#アーキテクチャ設計)
3. [モジュール構成](#モジュール構成)
4. [データフローと状態管理](#データフローと状態管理)
5. [パフォーマンス最適化](#パフォーマンス最適化)
6. [セキュリティ実装](#セキュリティ実装)
7. [テスト概要](#テスト概要)
8. [開発環境とツール](#開発環境とツール)
9. [ビルドとデプロイ](#ビルドとデプロイ)
10. [既知の課題と制限](#既知の課題と制限)
11. [リファクタリング成果](#リファクタリング成果)

---

## システム構成

### アーキテクチャ概要

```
Chrome Extension (Manifest V3)
├── Frontend (newtab.html + newtab.ts)
├── Components (コンポーネントベースアーキテクチャ)
│   ├── BookmarkFolder/ (フォルダーレンダリング・イベント処理)
│   ├── BookmarkItem/ (アイテムレンダリング)
│   ├── BookmarkActions/ (編集・削除機能)
│   └── HistorySidebar/ (履歴サイドバー・検索機能)
├── Types (強化された型定義)
│   ├── bookmark.ts (ブックマーク関連)
│   ├── events.ts (イベント関連)
│   └── index.ts (統合エクスポート)
├── Core Logic (newtab-core.ts - リファクタリング済み)
├── History API (history.ts - 履歴データ取得)
├── Utility Functions (utils.ts)
├── Legacy Types (types.ts - 後方互換性)
└── Styling (styles.css)
```

### 技術スタック

- **言語**: TypeScript 5.4.5
- **ビルドツール**: TypeScript Compiler (tsc)
- **テストフレームワーク**: Vitest 1.6.0
- **DOM環境**: Happy DOM / JSDOM
- **CSS**: Vanilla CSS (Grid + Flexbox)
- **Chrome API**: Bookmarks API, History API
- **コード品質**: Biome (lint & format)

### ディレクトリ構造

```
chrome-bookmark-list/
├── src/                         # TypeScriptソースファイル
│   ├── components/              # コンポーネントアーキテクチャ（v1.4.0+）
│   │   ├── BookmarkFolder/      # フォルダー関連コンポーネント
│   │   │   ├── BookmarkFolderRenderer.ts    # HTML生成
│   │   │   ├── BookmarkFolderEvents.ts      # イベント処理
│   │   │   └── index.ts                     # 統合インターフェース
│   │   ├── BookmarkItem/        # アイテム関連コンポーネント
│   │   │   └── BookmarkItemRenderer.ts      # アイテムHTML生成
│   │   ├── BookmarkActions/     # アクション機能
│   │   │   ├── BookmarkEditor.ts            # 編集機能
│   │   │   ├── BookmarkDeleter.ts           # 削除機能
│   │   │   └── index.ts                     # 統合クラス
│   │   ├── BookmarkDragAndDrop/ # ドラッグ&ドロップ機能
│   │   │   └── index.ts                     # D&D機能本体
│   │   └── HistorySidebar/      # 履歴サイドバー機能
│   │       ├── HistorySidebar.ts            # 履歴サイドバー本体
│   │       └── index.ts                     # エクスポート
│   ├── types/                   # 強化された型定義
│   │   ├── bookmark.ts          # ブックマーク関連型
│   │   ├── events.ts            # イベント関連型
│   │   └── index.ts             # 統合エクスポート
│   ├── services/                # サービス層（ビジネスロジック）
│   │   ├── BookmarkService.ts   # ブックマーク処理とAPI操作
│   │   ├── FaviconService.ts    # Favicon取得とキャッシュ管理
│   │   └── ErrorHandler.ts      # エラーハンドリングと通知
│   ├── utils/                   # ユーティリティクラス
│   │   └── HtmlUtils.ts         # HTML操作とDOM関連ユーティリティ
│   ├── constants/               # アプリケーション定数
│   │   └── index.ts             # 定数定義（エラーメッセージ、CSS、セレクター等）
│   ├── scripts/                 # スクリプトファイル
│   │   ├── newtab.ts            # メインエントリーポイント
│   │   ├── newtab-core.ts       # リファクタリング済みコア機能
│   │   ├── newtab-core-original.ts # レガシーコア機能（後方互換性維持）
│   │   ├── history.ts           # 履歴取得API
│   │   └── utils.ts             # レガシー互換ユーティリティ関数
│   ├── manifest.json            # 拡張機能マニフェスト
│   ├── newtab.html              # 新しいタブページHTML
│   ├── styles.css               # スタイルシート
│   └── icons/                   # アイコンファイル
├── test/                        # テストファイル
│   ├── setup.ts                 # テスト設定
│   ├── utils.test.ts            # ユーティリティテスト（23テスト）
│   ├── bookmark-delete.test.ts  # 削除機能テスト（6テスト）
│   ├── bookmark-edit.test.ts    # 編集機能テスト（9テスト）
│   ├── history.test.ts          # 履歴API テスト（9テスト）
│   ├── history-sidebar.test.ts  # 履歴サイドバーテスト（23テスト）
│   ├── integration.test.ts      # 統合テスト（7テスト）
│   ├── newtab-integration.test.ts # フォルダクリックテスト（19テスト）
│   ├── newtab.test.ts           # 基本機能テスト（3テスト）
│   └── 3layer-issues.test.ts    # 深い階層テスト（4テスト）
├── docs/                        # ドキュメント
│   ├── internal-specification.md # 内部仕様書
│   ├── external-specification.md # 外部仕様書
│   └── TESTING_GUIDE.md         # テストガイド
├── dist/                        # ビルド成果物（拡張機能用）
├── build.sh                     # ビルドスクリプト
├── package.json                 # Node.js依存関係
├── tsconfig.json                # TypeScript設定
├── vitest.config.ts             # テスト設定
├── biome.json                   # Biome設定
└── README.md                    # プロジェクト概要
```

---

## アーキテクチャ設計

### コンポーネントベースアーキテクチャ

機能別コンポーネントに分割し、モジュラー設計を採用。

#### 設計原則
1. **単一責任の原則**: 各コンポーネントは特定の機能のみを担当
2. **疎結合**: コンポーネント間の依存関係を最小化
3. **高凝集**: 関連する機能をひとつのコンポーネントにまとめる
4. **後方互換性**: 既存APIを維持しながら段階的移行

#### 強化された型定義システム

**bookmark.ts** - ブックマーク関連型:
```typescript
interface BookmarkItem {
  title: string;
  url: string;
  favicon: string | null;
}

interface BookmarkFolder {
  id: string;
  title: string;
  bookmarks: BookmarkItem[];
  subfolders: BookmarkFolder[];
  expanded: boolean;
}

interface BookmarkUpdateData {
  title: string;
  url: string;
}

interface BookmarkMoveData {
  parentId: string;
}

interface ChromeBookmarkNode extends chrome.bookmarks.BookmarkTreeNode {
  children?: ChromeBookmarkNode[];
}
```

**events.ts** - イベント関連型:
```typescript
interface BookmarkClickEventData {
  url: string;
  title: string;
}

interface FolderToggleEventData {
  folderId: string;
  expanded: boolean;
  level: number;
}

interface BookmarkEditEventData {
  url: string;
  currentTitle: string;
}

interface BookmarkDeleteEventData {
  url: string;
  title: string;
}

interface BookmarkDataAttributes {
  'data-bookmark-url': string;
  'data-bookmark-title': string;
  'data-folder-id'?: string;
  'data-level'?: string;
}
```

---

## モジュール構成

### 1. エントリーポイント (newtab.ts)
**責務**: メイン処理の制御とイベント管理

```typescript
// 主要な処理フロー
document.addEventListener('DOMContentLoaded', async () => {
  1. DOM要素の取得・検証
  2. Faviconキャッシュの初期化
  3. 履歴サイドバーの初期化
  4. ドラッグ&ドロップ機能の初期化
  5. ブックマーク変更イベントリスナー設定
  6. Chrome Bookmarks APIからデータ取得
  7. ブックマークツリーの処理
  8. ブックマーク表示
  9. 検索イベントリスナーの設定
});
```

**グローバル変数**:
- `allBookmarks: BookmarkFolder[]`: 全ブックマークデータ
- `_historySidebar: HistorySidebar`: 履歴サイドバー インスタンス
- `bookmarkDragAndDrop: BookmarkDragAndDrop`: D&D機能インスタンス

**主要機能**:
- `displayBookmarks()`: ブックマークの表示制御
- `loadFavicons()`: Favicon非同期読み込み
- `reloadBookmarks()`: ブックマーク再読み込み
- 検索機能のイベントハンドリング

### 2. コンポーネント アーキテクチャ (Components/)
**責務**: 機能別に分離されたモジュラー設計

#### 2.1 BookmarkFolder コンポーネント

**BookmarkFolderRenderer.ts** - フォルダーのHTML生成:
- `renderFolder(folder, level)`: フォルダをHTMLに変換
- `renderFolderHeader()`: ヘッダー部分の生成
- `renderFolderIcon()`: アイコンの状態管理
- `renderFolderContent()`: コンテンツエリアの生成
- 階層レベルに応じたスタイリング

**BookmarkFolderEvents.ts** - フォルダーのイベント処理:
- `setupFolderClickHandler()`: イベント委譲による一元管理
- `handleFolderClick()`: フォルダクリック処理
- `updateFolderUI()` / `updateBookmarkListUI()`: UI状態同期
- 処理分岐:
  1. 編集ボタン → 編集ダイアログ表示
  2. 削除ボタン → 削除確認・実行
  3. ブックマークリンク → 新しいタブで開く
  4. フォルダヘッダー → 展開/折りたたみ

#### 2.2 BookmarkItem コンポーネント

**BookmarkItemRenderer.ts** - ブックマークアイテムのHTML生成:
- `renderBookmarkItem()`: 単一アイテムの生成
- `renderBookmarkActions()`: アクションボタン（編集・削除）
- `renderBookmarkList()`: アイテムリスト全体の生成

#### 2.3 BookmarkActions コンポーネント

**BookmarkEditor.ts** - ブックマーク編集機能:
- `handleBookmarkEdit()`: 編集処理のエントリーポイント
- `showEditDialog()`: モーダルダイアログの表示
- `setupEditDialogEvents()`: ダイアログのイベント処理
- Chrome Bookmarks APIとの連携（update, move）

**BookmarkDeleter.ts** - ブックマーク削除機能:
- `handleBookmarkDelete()`: 削除処理
- `showDeleteConfirmation()`: 確認ダイアログ
- `deleteBookmarkByUrl()`: Chrome API経由での削除

**BookmarkActions.ts** - アクション機能の統合:
- Editor と Deleter の統合インターフェース
- 統一されたAPIの提供

#### 2.4 BookmarkDragAndDrop コンポーネント

**BookmarkDragAndDrop.ts** - ドラッグ&ドロップ機能:
- `initialize()`: D&D機能の初期化とイベントリスナー設定
- `handleDragStart()`: ドラッグ開始時の処理とデータ設定
- `handleDragOver()`: ドラッグオーバー時のUI更新とハイライト
- `handleDrop()`: ドロップ時のブックマーク移動処理
- `moveBookmark()`: Chrome Bookmarks APIを使用した実際の移動
- `makeBookmarksDraggable()`: ブックマークアイテムにdraggable属性を設定
- 視覚的フィードバック（ドロップインジケーター、ハイライト効果）

#### 2.5 HistorySidebar コンポーネント

**HistorySidebar.ts** - 履歴サイドバー機能:
- 過去7日間の履歴表示
- 履歴の検索・フィルタリング
- サイドバーの開閉制御

### 3. リファクタリング後のコア機能 (newtab-core.ts)
**責務**: 新コンポーネントアーキテクチャへの統合インターフェース

#### 主要クラスの統合
- `BookmarkFolderRenderer`: フォルダのHTML生成
- `BookmarkFolderEvents`: フォルダクリックイベント処理

#### 後方互換性API
- `renderFolder()`: BookmarkFolderRenderer への委譲
- `setupFolderClickHandler()`: BookmarkFolderEvents への委譲
- `displayBookmarksTestable()`: テスト用の表示関数

#### レガシーコア機能 (newtab-core-original.ts)
**責務**: 元の実装を保持（段階的移行のため）
- 独立した実装として保持
- 現在は使用されていないが後方互換性のために保持

### 4. サービス層 (Services/)
**責務**: ビジネスロジックとChrome API操作の抽象化

#### 4.1 BookmarkService
**責務**: ブックマークの処理とChrome Bookmarks API操作
- `getBookmarkTree()`: Chrome APIからブックマークツリー取得
- `processBookmarkTree()`: Chrome形式から内部形式への変換
- `findFolderById()`: フォルダID検索
- `filterBookmarks()`: 検索条件によるフィルタリング
- `moveBookmark()`: ブックマーク移動
- `updateBookmark()`: ブックマーク更新
- `deleteBookmark()`: ブックマーク削除

#### 4.2 FaviconService
**責務**: Faviconの取得とキャッシュ管理
- `initCache()`: キャッシュの初期化とChrome Storage連携
- `getFavicon()`: Favicon取得（キャッシュ優先）
- `fetchFavicon()`: 複数戦略による実際の取得
  1. 標準パス（/favicon.ico）
  2. HTML解析
  3. Google Favicon API
- キャッシュ機能（7日間有効期限）
- プライバシー重視（外部API最小使用）

#### 4.3 ErrorHandler
**責務**: エラーハンドリングとユーザー通知の統一管理
- `handleBookmarkOperation()`: ブックマーク操作エラー処理
- `handleFaviconError()`: Favicon取得エラー処理（軽微扱い）
- `handleGenericError()`: 一般的なエラー処理
- ユーザーフレンドリーなエラーメッセージ生成
- 開発用デバッグ機能

### 5. ユーティリティ層 (Utils/)
**責務**: DOM操作とHTML関連のヘルパー機能

#### 5.1 HtmlUtils
**責務**: 安全なHTML操作とDOM関連ユーティリティ
- `escapeHtml()`: XSS対策のHTML エスケープ
- `getDomain()`: URL正規化
- `createSafeHtml()`: 安全なHTML生成
- `toggleVisibility()`: 要素表示制御
- `addEventListenerSafely()`: 安全なイベントリスナー追加
- `getDataAttribute()`: データ属性の安全な取得
- `truncateText()`: テキスト省略
- `isValidUrl()`: URL有効性チェック

### 6. 定数管理 (Constants/)
**責務**: アプリケーション全体で使用する定数の一元管理
- Favicon関連定数（キャッシュキー、有効期限、タイムアウト）
- UI関連定数（アニメーション時間、検索デバウンス）
- Chrome API関連定数（除外フォルダ、スキーム）
- エラーメッセージ定数
- CSSクラス名定数
- DOMセレクター定数

### 7. レガシーユーティリティ (utils.ts)
**責務**: レガシー互換性のためのユーティリティ関数（新コードではServiceクラス使用推奨）

#### サービスインスタンス管理
- `getFaviconService()`: FaviconServiceのシングルトンインスタンス取得
- `getBookmarkService()`: BookmarkServiceのシングルトンインスタンス取得

#### レガシー互換関数（@deprecatedマーク付き）
- `initFaviconCache()`: FaviconService.initCache()への委譲
- `getFavicon()`: FaviconService.getFavicon()への委譲
- `processBookmarkTree()`: BookmarkService.processBookmarkTree()への委譲
- `filterBookmarks()`: BookmarkService.filterBookmarks()への委譲
- `findFolderById()`: BookmarkService.findFolderById()への委譲
- `getTotalBookmarks()`: BookmarkService.getTotalBookmarks()への委譲
- `escapeHtml()`: HtmlUtils.escapeHtml()への委譲
- `getDomain()`: HtmlUtils.getDomain()への委譲

### 8. 既存ユーティリティ関数（後方互換性維持）

#### データ処理
**processBookmarkTree(tree: ChromeBookmarkNode[]): BookmarkFolder[]**:
```typescript
// 再帰的フォルダ構造構築
function buildFolderStructure(node: ChromeBookmarkNode, level: number = 0): BookmarkFolder {
  // フォルダオブジェクト作成
  // 子要素の処理（ブックマーク/サブフォルダ）
  // expanded状態の初期化
}
```

**処理ロジック**:
1. Chrome APIの生データを内部データ構造に変換
2. ブックマークバー直下の特別処理
3. 初期展開状態設定（全て展開）

**filterBookmarks(folders: BookmarkFolder[], searchTerm: string): BookmarkFolder[]**:
- 再帰的検索処理
- タイトル・URL両方での検索
- 検索時の自動展開

#### ヘルパー機能
- `findFolderById()`: フォルダID検索
- `getTotalBookmarks()`: 再帰的ブックマーク数カウント
- `escapeHtml()`: XSS対策
- `getDomain()`: URL正規化

#### Faviconキャッシュシステム
```typescript
// キャッシュ設計
const faviconCache = new Map<string, string>();
const CACHE_EXPIRY_DAYS = 7;

// 非同期取得とキャッシュ保存（セキュリティ重視）
export async function getFavicon(url: string): Promise<string>
```

**Favicon取得戦略**:
1. **キャッシュ確認**: 既存のキャッシュから高速取得
2. **標準パス試行**: `/favicon.ico`, `/favicon.png`, `/favicon.svg`
3. **HTML解析**: `<link rel="icon">` タグからの検出
4. **デフォルト表示**: SVGプレースホルダーアイコン

**セキュリティ方針**:
- 外部APIサービス（Google Favicon API等）は使用しない
- ホスト名の外部流出を防止
- 内部ネットワークの情報保護を優先

---

## データフローと状態管理

### 初期化フロー

```
Chrome Bookmarks API
    ↓ getTree()
Raw ChromeBookmarkNode[]
    ↓ processBookmarkTree()
BookmarkFolder[] (内部形式)
    ↓ renderFolder()
HTML文字列
    ↓ DOM挿入
表示完了

Chrome History API
    ↓ search()
HistoryItem[]
    ↓ HistorySidebar.renderHistory()
履歴HTML文字列
    ↓ innerHTML
DOM表示
    ↓ setupFolderClickHandler()
イベントリスナー設定完了
```

### インタラクションフロー

#### フォルダクリック
```
ユーザークリック
    ↓ Event Delegation
setupFolderClickHandler()
    ↓ closest('.folder-header')
フォルダ要素特定
    ↓ data-folder-id
findFolderById()
    ↓ folder.expanded = !folder.expanded
状態更新
    ↓ updateFolderUI() / updateBookmarkListUI()
DOM更新
```

#### 検索処理
```
ユーザー入力
    ↓ input event
searchTerm取得
    ↓ filterBookmarks()
フィルタリング済みデータ
    ↓ displayBookmarks()
DOM再描画
```

### 状態管理

#### グローバル状態
- `allBookmarks: BookmarkFolder[]`: 全ブックマークデータ
- `faviconCache: Map<string, string>`: Faviconキャッシュ

#### ローカル状態
- `folder.expanded: boolean`: 各フォルダの展開状態
- DOM要素のクラス状態 (`.expanded`, `.collapsed`)

#### 状態同期
- データ状態とUI状態の双方向同期
- イベント発生時の即座な状態更新

---

## パフォーマンス最適化

### 1. レンダリング最適化
- **Event Delegation**: 単一リスナーでの効率的イベント処理
- **innerHTML一括更新**: DOM操作の最小化
- **遅延Favicon読み込み**: 初期表示速度の向上

### 2. メモリ最適化
- **Faviconキャッシュ**: 重複取得の防止
- **localStorage活用**: ブラウザ再起動時のキャッシュ持続
- **適切なスコープ管理**: メモリリーク防止

### 3. 検索最適化
- **リアルタイム処理**: 入力即座のフィルタリング
- **効率的な再帰処理**: 深い階層への対応

---

## セキュリティ実装

### XSS対策
```typescript
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

### 権限最小化
- 必要最小限の Chrome Extension 権限
- 外部通信の制限（セキュリティ強化）
- 外部APIサービスへの依存なし

### エラーハンドリング

**Chrome API エラー**:
```typescript
try {
  const bookmarkTree = await chrome.bookmarks.getTree();
  // 処理
} catch (error) {
  console.error('ブックマークの取得に失敗', error);
  // フォールバック表示
}
```

**DOM操作エラー**:
- 要素存在チェック
- Null安全なアクセス
- グレースフルデグラデーション

**Favicon取得エラー**:
- プレースホルダーアイコン表示
- キャッシュ無効データの処理
- ネットワークエラー対応
- 外部APIサービスを使用しないことによる堅牢性向上

---

## テスト概要

### テスト構成
- **総計103テスト**: ユニットテスト（70）+ 統合テスト（33）
- **カバレッジ**: 主要ロジック100%
- **テストツール**: Vitest + Happy DOM/JSDOM
- **CI/CD**: GitHub Actions での自動実行

### テスト戦略
1. **ユニットテスト**: 個別機能とコンポーネントの動作保証
2. **統合テスト**: コンポーネント間の連携とシステム全体の検証
3. **互換性テスト**: 既存APIとインターフェースの動作保証

詳細なテスト実行方法とトラブルシューティングについては、[TESTING_GUIDE.md](./TESTING_GUIDE.md) を参照してください。

---

## 開発環境とツール

### 技術スタック詳細

- **TypeScript 5.4.5** - 型安全なJavaScript開発
- **Vitest 1.6.0** - 高速なテストフレームワーク（ユニットテスト・統合テスト）
- **Manifest V3** - 最新のChrome拡張機能仕様
- **Vanilla JavaScript/TypeScript** - フレームワークを使用しない軽量実装
- **CSS Grid & Flexbox** - モダンなレイアウト
- **Chrome Bookmarks API** - ブックマークデータへのアクセス
- **Chrome History API** - 履歴データへのアクセス
- **Happy DOM** - テスト環境でのDOM操作
- **JSDOM** - 統合テスト用のDOM環境
- **Biome** - 高速なlint & format

### 開発コマンド

- `npm run build` - TypeScriptをコンパイル
- `npm run build:extension` - 拡張機能をビルド（dist/フォルダに出力）
- `npm run dev` - TypeScriptの監視モード（ファイル変更時に自動再コンパイル）
- `npm run clean` - ビルド成果物をクリーンアップ
- `npm run lint` - Biomeによるlint実行
- `npm run format` - Biomeによるformat実行

### テストコマンド

- `npm test` - Vitestでテストを実行（監視モード）
- `npm run test:run` - テストを一度だけ実行
- `npm run test:coverage` - カバレッジレポートを生成
- `npm run test:ui` - Vitestの可視化UIでテストを実行

---

## ビルドとデプロイ

### ビルドプロセス

```bash
npm run dev          # 監視モード
npm run build        # TypeScriptコンパイル
npm run build:extension  # 拡張機能パッケージング
npm test            # テスト実行
```

### ビルド成果物

```
dist/
├── newtab.html     # エントリーHTML
├── newtab.js       # コンパイル済みJS
├── styles.css      # スタイルシート
├── manifest.json   # 拡張機能マニフェスト
└── icons/          # アイコンファイル
```

### CI/CD パイプライン

GitHub Actionsを使用した自動化されたCI/CDパイプライン:

#### GitHub Actions ワークフロー

- **トリガー**: `main`と`develop`ブランチへのプッシュ、`main`ブランチへのプルリクエスト
- **Node.js バージョン**: 18, 20, 22でのマトリックステスト
- **実行内容**:
  1. **テスト**: すべてのユニットテスト・統合テストを実行
  2. **カバレッジ**: テストカバレッジレポートを生成（Node.js 20のみ）
  3. **ビルド**: TypeScriptのコンパイルと拡張機能のビルド
  4. **型チェック**: TypeScriptの静的型チェック
  5. **Lint & Format**: Biomeによるコード品質チェック
  6. **アーティファクト**: ビルドされた拡張機能をGitHub Actionsアーティファクトとして保存

#### ローカル開発での検証

```bash
# すべてのテストを実行
npm run test:run

# TypeScriptの型チェック
npx tsc --noEmit

# コード品質チェック
npm run lint
npm run format

# 拡張機能をビルド
npm run build:extension
```

---

## 既知の課題と制限

### 技術的制約
1. **Chrome API依存**: 他ブラウザとの互換性なし
2. **同期API制限**: 非同期処理の複雑性
3. **Manifest V3制約**: 新しい制限への対応

### パフォーマンス制限
1. **大量データ**: 数千のブックマークでの性能劣化
2. **Favicon取得**: ネットワーク依存の遅延
3. **DOM更新コスト**: 大規模データでの再描画負荷

### 今後の改善予定
1. **仮想スクロール**: 大量データ対応
2. **バックグラウンド処理**: Favicon事前取得
3. **インクリメンタル更新**: 差分更新による高速化

---

*最終更新: 2025年9月*