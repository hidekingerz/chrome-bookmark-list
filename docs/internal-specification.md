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
│   ├── TabController/ (タブ切り替え制御)
│   ├── HistoryPanel/ (最近の履歴タブ・検索機能)
│   ├── RecentlyClosedPanel/ (最近閉じたタブ・復元機能)
│   └── CalendarHistoryPanel/ (カレンダー履歴タブ・検索機能)
├── Types (強化された型定義)
│   └── bookmark.ts (ブックマーク関連)
├── Core Logic (newtab-core.ts - 薄い関数 API)
├── History API (history.ts - 履歴データ取得)
├── Utility Functions (utils.ts)
└── Styling (styles.css)
```

### 技術スタック

- **言語**: TypeScript 7.0
- **ビルドツール**: TypeScript Compiler (tsc)
- **テストフレームワーク**: Vitest 5.0
- **DOM環境**: Happy DOM / JSDOM
- **CSS**: Vanilla CSS (Grid + Flexbox)
- **Chrome API**: Bookmarks API, History API, Sessions API, _favicon API
- **コード品質**: Biome (lint & format)
- **アクセシビリティ検査**: axe-core（テストと実ブラウザ）

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
│   │   │   ├── BookmarkEditor.ts            # ブックマークの編集
│   │   │   ├── BookmarkDeleter.ts           # ブックマークの削除
│   │   │   ├── FolderCreator.ts             # フォルダの作成
│   │   │   ├── FolderRenamer.ts             # フォルダ名の変更
│   │   │   ├── FolderDeleter.ts             # フォルダの削除（中身ごと。Undo で作り直す）
│   │   │   ├── TabGroupOpener.ts            # 複数の URL をタブグループにまとめて開く
│   │   │   └── index.ts                     # 統合クラス
│   │   ├── BookmarkDragAndDrop/ # ドラッグ&ドロップ機能
│   │   │   ├── index.ts                     # D&D機能本体（移動・並び替え・フォルダ移動）
│   │   │   └── Autoscroller.ts              # ドラッグ中の画面端でのオートスクロール
│   │   ├── BookmarkSelection/   # 複数選択と一括操作
│   │   │   ├── BookmarkSelection.ts         # 選択の管理、ツールバー、一括移動・一括削除
│   │   │   └── index.ts                     # エクスポート
│   │   ├── ContextMenu/         # コンテキストメニュー
│   │   │   └── index.ts                     # メニューの開閉とキー操作
│   │   ├── KeyboardShortcuts/   # キーボードショートカット
│   │   │   └── index.ts                     # フォーカス移動と各ショートカット
│   │   ├── ShortcutHelp/        # ショートカット一覧
│   │   │   └── index.ts                     # 一覧ダイアログ
│   │   ├── Toast/               # トースト（画面下部の通知）
│   │   │   └── index.ts                     # 表示・自動で消える・アクションボタン
│   │   ├── TabController/       # タブ切り替え制御
│   │   │   ├── TabController.ts             # タブ制御本体
│   │   │   └── index.ts                     # エクスポート
│   │   ├── HistoryPanel/        # 最近の履歴タブ
│   │   │   ├── HistoryPanel.ts              # 履歴パネル本体
│   │   │   └── index.ts                     # エクスポート
│   │   ├── RecentlyClosedPanel/ # 最近閉じたタブ
│   │   │   ├── RecentlyClosedPanel.ts       # 最近閉じたタブパネル本体
│   │   │   └── index.ts                     # エクスポート
│   │   ├── CalendarHistoryPanel/ # カレンダー履歴タブ
│   │   │   ├── CalendarHistoryPanel.ts      # カレンダーパネル本体
│   │   │   └── index.ts                     # エクスポート
│   │   ├── Dialog/              # モーダルダイアログ共通基盤
│   │   │   └── index.ts                     # openDialog / confirmDialog / alertDialog / errorDialog / showDialogError
│   │   ├── HistoryList/         # 履歴系パネル共通の行描画
│   │   │   └── index.ts                     # renderHistoryListItem / formatDateTime / matchesSearchTerm
│   │   └── UndoManager/         # Undo 機能
│   │       ├── index.ts                     # Undo本体
│   │       ├── moveBack.ts                  # 1 件の Undo の move index 補正
│   │       └── restoreOrder.ts              # 複数まとめた操作の Undo（操作前の並びを控えて戻す）
│   ├── types/                   # 強化された型定義
│   │   └── bookmark.ts          # ブックマーク関連型
│   ├── services/                # サービス層（ビジネスロジック）
│   │   ├── BookmarkService.ts   # ブックマーク処理とAPI操作
│   │   └── FaviconService.ts    # Favicon取得（Chrome _favicon API）
│   ├── utils/                   # コンポーネント共通のヘルパー
│   │   └── bookmarkResolver.ts  # data-bookmark-id を優先してノードを同定する
│   ├── constants/               # アプリケーション定数
│   │   └── index.ts             # 定数定義（検索デバウンス、ルート ID、セレクター）
│   ├── scripts/                 # スクリプトファイル
│   │   ├── newtab.ts            # メインエントリーポイント
│   │   ├── newtab-core.ts       # コア関数 API
│   │   ├── searchInput.ts       # 検索入力のデバウンス
│   │   ├── history.ts           # 履歴取得API
│   │   ├── favicon.ts           # favicon 遅延読み込み (loadFavicons)
│   │   ├── bookmarkEvents.ts    # bookmarks-changed イベント発火
│   │   ├── dom.ts               # DOM ヘルパー (isEditableElement / overlayHost)
│   │   └── utils.ts             # ブックマーク処理・favicon・エスケープの関数 API
│   ├── manifest.json            # 拡張機能マニフェスト
│   ├── newtab.html              # 新しいタブページHTML
│   ├── styles.css               # スタイルシート
│   └── icons/                   # アイコンファイル
├── test/                        # テストファイル（機能ごとに *.test.ts。一覧は test/ を参照）
│   ├── setup.ts                 # テスト設定（chrome / localStorage / document のスタブ）
│   └── helpers/                 # テスト用の共通部品
│       ├── fake-bookmarks.ts    # 並び順を持つ chrome.bookmarks の代役
│       ├── axe.ts               # axe-core をテスト用の DOM で実行する
│       └── dialog-polyfill.ts   # JSDOM に無い <dialog> の showModal() / close() の代役
├── docs/                        # ドキュメント
│   ├── internal-specification.md # 内部仕様書
│   ├── external-specification.md # 外部仕様書
│   └── TESTING_GUIDE.md         # テストガイド
├── dist/                        # ビルド成果物（拡張機能用）
├── build.sh                     # ビルドスクリプト
├── package.json                 # Node.js依存関係
├── tsconfig.json                # TypeScript設定
├── vitest.config.mts            # テスト設定
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
  id: string;            // Chrome ブックマークノードの ID（同じ URL が複数あっても一意に同定する）
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

---

## モジュール構成

### 1. エントリーポイント (newtab.ts)
**責務**: メイン処理の制御とイベント管理

```typescript
// 主要な処理フロー
document.addEventListener('DOMContentLoaded', async () => {
  1. DOM要素の取得・検証
  2. 履歴パネル・最近閉じたタブパネル・カレンダーパネルの初期化（各タブパネル内に構築）
  3. タブコントローラーの初期化（タブ選択時に各パネルのデータを遅延読み込み）
     - 'history' → HistoryPanel.activate()
     - 'recently-closed' → RecentlyClosedPanel.activate()
     - 'calendar' → CalendarHistoryPanel.activate()
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
- `_tabController: TabController`: タブ切り替え制御インスタンス
- `_historyPanel: HistoryPanel`: 最近の履歴パネル インスタンス
- `_recentlyClosedPanel: RecentlyClosedPanel`: 最近閉じたタブパネル インスタンス
- `_calendarHistoryPanel: CalendarHistoryPanel`: カレンダー履歴パネル インスタンス
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
- `handleSave()`: 入力の検証と保存（`updateBookmark()` / `moveBookmark()`）
- Chrome Bookmarks APIとの連携（update, move）

**BookmarkDeleter.ts** - ブックマーク削除機能:
- `handleBookmarkDelete()`: 削除処理
- `showDeleteConfirmation()`: 確認ダイアログ
- 削除は `chrome.bookmarks.remove` を直接呼び、Undo では元の位置へ作り直す

**BookmarkActions/index.ts** - アクション機能の統合:
- Editor と Deleter の統合インターフェース
- 統一されたAPIの提供

**ダイアログ**: 編集・削除確認・フォルダ作成/リネーム/削除・大量タブ確認・一括削除/移動の各モーダルは `components/Dialog` の `openDialog` / `confirmDialog` / `alertDialog` で生成する（overlay 生成・ESC・close 時の keydown 解除を一元管理。同時に開くのは 1 つ）。エラー通知もこの基盤で行い、ブラウザ標準の `alert()` は使わない。操作の失敗は `errorDialog(message)` の「エラー」ダイアログで知らせる。使う場面は、ブックマークの削除・移動・並び替え、フォルダの作成の準備・削除・移動・並び替え、編集の準備と閉じた後の保存の失敗、操作の対象（編集するブックマーク、名前変更・削除するフォルダ）が既に無いとき、一括操作（ツールバーの移動・削除、複数選択のドラッグ）が 1 件も成功しなかったとき、「元に戻す」の失敗（`Toast` のアクションの失敗）、最近閉じたタブの復元の失敗、タブグループ作成の失敗、タブを開く操作の失敗（`BookmarkFolderEvents` の `reportTabFailure`）、「URLをコピー」の失敗、個別の通知を持たないメニュー項目の失敗（`ContextMenu`）、操作後の再読み込みの失敗（`newtab.ts` の `reloadBookmarks`）、一括移動の移動先フォルダ一覧の取得の失敗。入力中のダイアログ内で起きた失敗（編集・フォルダ作成・リネームの入力不備や保存の失敗）は `showDialogError` でそのダイアログ内に表示する。

**一括操作の数え方**: 一括操作は、対象を先にすべて同定してから 1 件ずつ処理し、途中で失敗しても残りを続ける。既に無くなっていた対象と、処理に失敗した対象は「失敗」に数える。1 件以上成功したら「N 件を…しました（M 件は失敗）」のトースト（成功分は Undo 可能）、0 件なら「エラー」ダイアログ。Undo は、操作の前に `restoreOrder.ts` の `snapshotChildOrder()` で控えた並びへ `restoreChildOrder()` で戻す。

**複数選択のキー**: `BookmarkSelection` は選択をブックマークごとに持つ。キーは項目の `data-bookmark-id`（Chrome のノード ID）で、ID を持たない項目だけ URL を使う。同じ URL のブックマークが複数あっても別々に選択でき、再描画後の `refresh()` は同じ ID の項目へハイライトを付け直す。

**ダイアログとキーボードショートカット**: `.edit-dialog-overlay` があるか `.shortcut-help-dialog[open]` が開いている間、`KeyboardShortcuts` は ↑/↓・Enter・Delete・F2・? を処理しない（背後の一覧を操作しない）。`alertDialog` は開いたときに OK ボタンへフォーカスを移す。

**ショートカット一覧**: `ShortcutHelp` だけは `Dialog` の基盤を使わず、ネイティブの `<dialog closedby="any">` を `showModal()` で開く。`Esc` と外側のクリックで閉じる動作、背後を操作できなくすること、閉じた後のフォーカスの戻しはブラウザに任せる。要素の後始末は `close` イベントで行う（閉じるボタン・`Esc`・外側のクリックのどれでも同じ経路）。ダイアログの中の `Esc` は `stopPropagation()` して、`BookmarkSelection` の選択解除に届かせない（閉じる既定の動作は止めない）。

**名前の入力欄の Enter**: `FolderCreator` / `FolderRenamer` の入力欄は、`keydown` の `Enter` で決定する。`event.isComposing` が true のとき（日本語入力の変換確定）は何もしない。

#### 2.4 BookmarkDragAndDrop コンポーネント

**BookmarkDragAndDrop/index.ts** - ドラッグ&ドロップ機能:
- `initialize()`: D&D機能の初期化とイベントリスナー設定
- `handleDragStart()`: ドラッグ開始時の処理とデータ設定
- `handleDragOver()`: ドラッグオーバー時のUI更新とハイライト
- `handleDrop()`: ドロップ時のブックマーク移動処理
- `moveBookmark()`: Chrome Bookmarks APIを使用した実際の移動
- `makeBookmarksDraggable()`: ブックマークアイテムにdraggable属性を設定
- 視覚的フィードバック（ドロップインジケーター、ハイライト効果）

#### 2.5 TabController コンポーネント

**TabController.ts** - タブ切り替え制御:
- `.tab-button[data-tab]` と `#tab-panel-<id>` の表示状態を制御
- `onActivate(tab, handler)`: タブ選択時に実行するハンドラーを登録（履歴データの遅延読み込みに使用）
- `activate(tab)`: タブのアクティブ化、`aria-selected`/`hidden` 属性の更新、登録済みハンドラの実行

#### 2.6 HistoryPanel コンポーネント

**HistoryPanel.ts** - 最近の履歴タブ:
- 与えられたコンテナ要素内にUIを構築
- 過去7日間の履歴表示（最大50件）
- 履歴の検索・フィルタリング
- `activate()`: タブ選択時に履歴を読み込んで描画
- タイトル・URLは `escapeHtml` でエスケープし、リンクは `data-url` + `chrome.tabs.create` で開く（XSS対策）
- 行のマークアップは `components/HistoryList` の `renderHistoryListItem()` で生成（`.history-item` 系クラスに統一）。favicon は `scripts/favicon.ts` の `loadFavicons()` で読み込む

#### 2.7 CalendarHistoryPanel コンポーネント

**CalendarHistoryPanel.ts** - カレンダー履歴タブ:
- 与えられたコンテナ要素内にカレンダーとタイムラインを構築
- 当月のカレンダー表示と履歴インジケーター
- 日付選択で当日のタイムラインを時間帯ごとに表示、ドメイン統計を集計
- `activate()`: タブ選択時に当月の履歴を読み込んでカレンダーを描画
- タイトル・URL・ドメインは `escapeHtml` でエスケープし、リンクは `data-url` + `chrome.tabs.create` で開く（XSS対策）
- 行のマークアップは `components/HistoryList` の `renderHistoryListItem()` で生成（`.history-item` 系クラスに統一）。favicon は `scripts/favicon.ts` の `loadFavicons()` で読み込む
- タイムライン内は `.history-timeline .history-item` のスコープ付き CSS でコンパクト表示

#### 2.8 RecentlyClosedPanel コンポーネント

**RecentlyClosedPanel.ts** - 最近閉じたタブ:
- 与えられたコンテナ要素内にUIを構築
- `chrome.sessions.getRecentlyClosed()` による最大約25件の一覧表示
- 単体タブのみ対象（`session.tab` が存在するエントリのみ。windowエントリは除外）
- 自拡張の New Tab ページ（`chrome-extension://<id>/` で始まるURLと `chrome://newtab`）は除外
- タブの復元（`chrome.sessions.restore`）に失敗したら「エラー」ダイアログで知らせ、一覧を読み込み直す
- 同一 URL は最新のもののみ表示（`Set` による重複排除）
- 各タブのタイトル、ドメイン、favicon、閉じた時刻（`lastModified * 1000` ms変換）をメタ行表示
- `activate()`: タブ選択時に一覧を読み込んで描画（毎回再取得）
- 行クリックでイベント委譲により `chrome.sessions.restore(sessionId)` を呼び出し、復元後に一覧を再読み込み
- タイトル・URL・sessionId は `escapeHtml` でエスケープ（XSS対策）
- 検索フィルタは提供しない
- 行のマークアップは `components/HistoryList` の `renderHistoryListItem()` で生成（`.history-item` 系クラスに統一）。favicon は `scripts/favicon.ts` の `loadFavicons()` で読み込む

#### 2.9 Dialog コンポーネント

**Dialog/index.ts** - モーダルダイアログ共通基盤:
- `openDialog({ id, title, bodyHtml, buttons, onClose })`: overlay を生成し、×・ESC・各ボタンを配線。戻り値 `{ element, close }`
- `confirmDialog(...)`: キャンセル / 確定の 2 ボタン。確定で `true`
- `alertDialog(...)`: OK ボタンのみ
- `errorDialog(message)`: エラー通知用の `alertDialog`（id は `error-dialog`、タイトルは「エラー」）
- `showDialogError(handle, message)`: ダイアログ内 `.dialog-error` にエラー表示
- 開く前に既存 overlay をすべて除去し、`close()` は冪等。document の keydown リスナーは `close()` で必ず解除（#100）

#### 2.10 HistoryList コンポーネント

**HistoryList/index.ts** - 履歴系 3 パネル共通の行描画:
- `renderHistoryListItem(view)`: `.history-item` 1 件の HTML（title / url / meta / attributes をエスケープ）
- `formatDateTime()` / `formatTimeWithSeconds()`: ja-JP ロケールの日時整形
- `matchesSearchTerm(item, term)`: title / url の大文字小文字を無視した部分一致

### 3. コア関数 API (newtab-core.ts)
**責務**: newtab.ts とテストから使う薄い関数 API
- `renderFolder()`: BookmarkFolderRenderer への委譲
- `setupFolderClickHandler()`: BookmarkFolderEvents への委譲
- `displayBookmarksTestable()`: テスト用の表示関数
- `handleBookmarkEdit()` / `handleBookmarkDelete()`: BookmarkActions への委譲

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
- `getAllFolders()`: 仮想ルート id=0 を除くすべてのフォルダ（フォルダ選択 UI 用）

#### 4.2 FaviconService
**責務**: Chrome _favicon API を用いた Favicon URL の生成（同期処理）
- `getFavicon(url: string): string`: Chrome _favicon API によるローカル favicon URL を返す
- Chrome がローカルに favicon を保有していれば実 favicon、未保有の場合は Chrome のデフォルトアイコンを返す
- chrome.runtime が利用できない場合は SVG プレースホルダーを返す
- プライバシー重視（外部APIサービス不使用・ホスト名の外部流出防止）

### 5. スクリプト層のヘルパー (scripts/)
- `favicon.ts` `loadFavicons(container, imgSelector, urlAttr = 'data-favicon-url')`: img と同じ親要素内の `.favicon-placeholder` を切り替える favicon 遅延読み込み
- `bookmarkEvents.ts` `dispatchBookmarksChanged(action)`: `bookmarks-changed` イベントの発火（action は `BookmarksChangedAction` の union 型）
- `dom.ts` `isEditableElement(el)`: 入力欄 / contenteditable にフォーカスがあるか
- `dom.ts` `overlayHost()`: 画面に重ねて出す部品（複数選択のツールバー、コンテキストメニュー）の置き場所。`main` があればその中、無ければ `body`

### 6. 定数管理 (Constants/)
**責務**: アプリケーション全体で使用する定数の一元管理
- 検索デバウンス時間 (SEARCH_DEBOUNCE_MS)
- Chrome のパーマネントルート ID (BOOKMARK_ROOT_IDS)
- DOM セレクター (SELECTORS)

### 7. 関数 API (utils.ts)
**責務**: コンポーネントとテストが使うブックマーク処理・favicon・HTML エスケープの関数 API。BookmarkService / FaviconService を遅延生成して共有する
- `getFavicon()` / `processBookmarkTree()` / `filterBookmarks()` / `applyExpandedState()` / `findFolderById()` / `getTotalBookmarks()` / `getAllFolders()`: Service への委譲
- `escapeHtml()`: & < > " ' をすべてエスケープ (#96)
- `getDomain()`: URL からホスト名（不正 URL は 'localhost'）

### 8. 主要関数の処理概要

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

#### Favicon取得

**Favicon URL 生成**:
```typescript
// Chrome _favicon API によるローカル取得（同期処理）
export function getFavicon(url: string): string
```

**取得方針**:
1. **Chrome _favicon API**: `chrome.runtime.getURL('/_favicon/?pageUrl=<url>&size=32')` によるローカル取得
2. **フォールバック**: chrome.runtime が利用できない場合は SVG プレースホルダーアイコン

**セキュリティ方針**:
- 外部APIサービス（Google Favicon API等）は使用しない
- ホスト名の外部流出を防止（Chrome ローカル取得のため）
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
    ↓ HistoryPanel.renderHistory() / CalendarHistoryPanel.renderTimeline()
履歴HTML文字列（escapeHtmlでエスケープ済み）
    ↓ innerHTML
DOM表示
    ↓ イベント委譲（タイトルクリック → chrome.tabs.create）
イベントリスナー設定完了

Chrome Sessions API
    ↓ getRecentlyClosed()
Session[] （tab エントリのみ抽出・除外・重複排除）
    ↓ RecentlyClosedPanel.render()
HTML文字列（escapeHtmlでエスケープ済み）
    ↓ innerHTML
DOM表示
    ↓ イベント委譲（行クリック → chrome.sessions.restore() → 再読み込み）
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
    ↓ updateExpandIcon() / updateBookmarkListElement()
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
- **Chrome内部キャッシュ活用**: Chrome が favicon をローカルにキャッシュするため、拡張側での重複取得防止処理は不要
- **適切なスコープ管理**: メモリリーク防止

### 3. 検索最適化
- **リアルタイム処理**: 入力に応じたフィルタリング。ブックマーク検索は連続入力をまとめるため `SEARCH_DEBOUNCE_MS`（300ms）のデバウンスを挟む（履歴・カレンダーの検索は即時）
- **効率的な再帰処理**: 深い階層への対応

---

## セキュリティ実装

### XSS対策
```typescript
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

### 権限最小化
- 機能に必要な Chrome Extension 権限のみ（`bookmarks` / `history` / `favicon` / `sessions` / `tabs` / `tabGroups`。用途は外部仕様書の「必要条件」を参照）
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
- chrome.runtime が利用できない場合は SVG プレースホルダーアイコン表示
- 外部APIサービスを使用しないことによる堅牢性向上

---

## テスト概要

### テスト構成
- **総計760テスト**（テストファイル76件）: ユニットテスト・コンポーネントテスト・統合テストで構成
- **カバレッジ**: 文 98.26% / 分岐 91.16%（`npm run test:coverage` のしきい値は文 95% / 分岐 85%）
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

- **TypeScript 7.0** - 型安全なJavaScript開発
- **Vitest 5.0** - 高速なテストフレームワーク（ユニットテスト・統合テスト）
- **Manifest V3** - 最新のChrome拡張機能仕様
- **Vanilla JavaScript/TypeScript** - フレームワークを使用しない軽量実装
- **CSS Grid & Flexbox** - モダンなレイアウト
- **Chrome Bookmarks API** - ブックマークデータへのアクセス
- **Chrome History API** - 履歴データへのアクセス
- **Chrome Sessions API** - 最近閉じたタブの取得（`chrome.sessions.getRecentlyClosed()`）と復元（`chrome.sessions.restore()`）。
  返される `Session.tab` の URL/タイトルを読むには `tabs` 権限が必要（無いと Chrome がスクラブする）
- **Chrome _favicon API** - favicon 取得（`chrome.runtime.getURL('/_favicon/...')`、外部通信なし）
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

- `npm test` - Vitestでテストを一度だけ実行
- `npm run test:watch` - 監視モードでテストを実行
- `npm run test:coverage` - カバレッジレポートを生成
- `npm run test:mutation` - ミューテーションテストを全体に実行（@mizchi/mutator、Node.js 24以上が必要。結果は `.mutator/` に保存）
- `npm run test:mutation:diff` - main との差分だけを対象にミューテーションテストを実行
- `mutator.accepted.json` - 受け入れたミュータントの記録。型のために要る到達しない分岐と、結果が変わらない書き換え（等価）を、理由つきで載せている。足すときは `npx mutator accept <key> --reason "<理由>"`
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
├── scripts/        # コンパイル済みJS（エントリーは scripts/newtab.js）
├── components/     # コンパイル済みJS（UIコンポーネント）
├── services/       # コンパイル済みJS（サービス）
├── constants/      # コンパイル済みJS（定数）
├── types/          # コンパイル済みJS（型定義）
├── utils/          # コンパイル済みJS（共通ユーティリティ）
├── styles.css      # スタイルシート
├── manifest.json   # 拡張機能マニフェスト
└── icons/          # アイコンファイル
```

### CI/CD パイプライン

GitHub Actionsを使用した自動化されたCI/CDパイプライン:

#### GitHub Actions ワークフロー

- **トリガー**: `main`・`develop`・`feature/*` ブランチへのプッシュ、`main`ブランチへのプルリクエスト
- **Node.js バージョン**: 22
- **実行内容**:
  1. **テスト**: すべてのユニットテスト・統合テストを実行
  2. **カバレッジ**: テストカバレッジレポートを生成
  3. **ビルド**: TypeScriptのコンパイルと拡張機能のビルド
  4. **型チェック**: TypeScriptの静的型チェック
  5. **Lint & Format**: Biomeによるコード品質チェック
  6. **アーティファクト**: ビルドされた拡張機能をGitHub Actionsアーティファクトとして保存

#### ローカル開発での検証

```bash
# すべてのテストを実行
npm test

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
2. **DOM更新コスト**: 大規模データでの再描画負荷

### 今後の改善予定
1. **仮想スクロール**: 大量データ対応
2. **インクリメンタル更新**: 差分更新による高速化

---

*最終更新: 2025年9月*