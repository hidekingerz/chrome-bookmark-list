# Chrome Bookmark List - 内部仕様書

## システム構成

### アーキテクチャ概要
```
Chrome Extension (Manifest V3)
├── Frontend (newtab.html + newtab.ts)
├── Components (コンポーネントベースアーキテクチャ)
│   ├── BookmarkFolder/ (フォルダーレンダリング・イベント処理)
│   ├── BookmarkItem/ (アイテムレンダリング)
│   └── BookmarkActions/ (編集・削除機能)
├── Types (強化された型定義)
│   ├── bookmark.ts (ブックマーク関連)
│   ├── events.ts (イベント関連)
│   └── index.ts (統合エクスポート)
├── Core Logic (newtab-core.ts - リファクタリング済み)
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
- **Chrome API**: Bookmarks API, Tabs API

## モジュール構成

### 1. エントリーポイント (newtab.ts)
**責務**: メイン処理の制御とイベント管理

```typescript
// 主要な処理フロー
document.addEventListener('DOMContentLoaded', async () => {
  1. DOM要素の取得・検証
  2. Faviconキャッシュの初期化
  3. Chrome Bookmarks APIからデータ取得
  4. ブックマークツリーの処理
  5. ブックマーク表示
  6. 検索イベントリスナーの設定
});
```

**主要機能**:
- `displayBookmarks()`: ブックマークの表示制御
- `loadFavicons()`: Favicon非同期読み込み
- 検索機能のイベントハンドリング

### 2. コンポーネント アーキテクチャ (Components/)
**責務**: 機能別に分離されたモジュラー設計

#### 2.1 BookmarkFolder コンポーネント

##### `BookmarkFolderRenderer.ts`
**責務**: フォルダーのHTML生成
- `renderFolder(folder, level)`: フォルダをHTMLに変換
- `renderFolderHeader()`: ヘッダー部分の生成
- `renderFolderIcon()`: アイコンの状態管理
- `renderFolderContent()`: コンテンツエリアの生成
- 階層レベルに応じたスタイリング

##### `BookmarkFolderEvents.ts`
**責務**: フォルダーのイベント処理
- `setupFolderClickHandler()`: イベント委譲による一元管理
- `handleFolderClick()`: フォルダクリック処理
- `updateFolderUI()` / `updateBookmarkListUI()`: UI状態同期
- 処理分岐:
  1. 編集ボタン → 編集ダイアログ表示
  2. 削除ボタン → 削除確認・実行
  3. ブックマークリンク → 新しいタブで開く
  4. フォルダヘッダー → 展開/折りたたみ

#### 2.2 BookmarkItem コンポーネント

##### `BookmarkItemRenderer.ts`
**責務**: ブックマークアイテムのHTML生成
- `renderBookmarkItem()`: 単一アイテムの生成
- `renderBookmarkActions()`: アクションボタン（編集・削除）
- `renderBookmarkList()`: アイテムリスト全体の生成

#### 2.3 BookmarkActions コンポーネント

##### `BookmarkEditor.ts`
**責務**: ブックマーク編集機能
- `handleBookmarkEdit()`: 編集処理のエントリーポイント
- `showEditDialog()`: モーダルダイアログの表示
- `setupEditDialogEvents()`: ダイアログのイベント処理
- Chrome Bookmarks APIとの連携（update, move）

##### `BookmarkDeleter.ts`
**責務**: ブックマーク削除機能
- `handleBookmarkDelete()`: 削除処理
- `showDeleteConfirmation()`: 確認ダイアログ
- `deleteBookmarkByUrl()`: Chrome API経由での削除

##### `BookmarkActions.ts`
**責務**: アクション機能の統合
- Editor と Deleter の統合インターフェース
- 統一されたAPIの提供

### 3. リファクタリング後のコア機能 (newtab-core.ts)
**責務**: 後方互換性の維持と新コンポーネントの統合

#### 後方互換性API
- `renderFolder()`: BookmarkFolderRenderer への委譲
- `setupFolderClickHandler()`: BookmarkFolderEvents への委譲
- `handleBookmarkEdit()` / `handleBookmarkDelete()`: BookmarkActions への委譲

#### 新しいコンポーネントAPI
- 個別コンポーネントクラスのエクスポート
- より細かい制御が可能な新しいインターフェース

### 3. ユーティリティ (utils.ts)
**責務**: データ処理とヘルパー機能

#### データ処理
##### `processBookmarkTree(tree: ChromeBookmarkNode[]): BookmarkFolder[]`
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

##### `filterBookmarks(folders: BookmarkFolder[], searchTerm: string): BookmarkFolder[]`
- 再帰的検索処理
- タイトル・URL両方での検索
- 検索時の自動展開

#### ヘルパー機能
- `findFolderById()`: フォルダID検索
- `getTotalBookmarks()`: 再帰的ブックマーク数カウント
- `escapeHtml()`: XSS対策
- `getDomain()`: URL正規化

#### Faviconキャッシュ
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

### 4. 強化された型定義システム (types/)
**責務**: 型安全性の向上と機能別型定義

#### 4.1 `bookmark.ts` - ブックマーク関連型
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

#### 4.2 `events.ts` - イベント関連型
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

#### 4.3 `index.ts` - 統合エクスポート
- 全ての型定義の一元管理
- 後方互換性のためのLegacy型の再エクスポート

## データフロー

### 1. 初期化フロー
```
Chrome Bookmarks API
    ↓ getTree()
Raw ChromeBookmarkNode[]
    ↓ processBookmarkTree()
BookmarkFolder[] (内部形式)
    ↓ renderFolder()
HTML文字列
    ↓ innerHTML
DOM表示
    ↓ setupFolderClickHandler()
イベントリスナー設定完了
```

### 2. インタラクションフロー

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

## 状態管理

### グローバル状態
- `allBookmarks: BookmarkFolder[]`: 全ブックマークデータ
- `faviconCache: Map<string, string>`: Faviconキャッシュ

### ローカル状態
- `folder.expanded: boolean`: 各フォルダの展開状態
- DOM要素のクラス状態 (`.expanded`, `.collapsed`)

### 状態同期
- データ状態とUI状態の双方向同期
- イベント発生時の即座な状態更新

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

## エラーハンドリング

### Chrome API エラー
```typescript
try {
  const bookmarkTree = await chrome.bookmarks.getTree();
  // 処理
} catch (error) {
  console.error('ブックマークの取得に失敗', error);
  // フォールバック表示
}
```

### DOM操作エラー
- 要素存在チェック
- Null安全なアクセス
- グレースフルデグラデーション

### Favicon取得エラー
- プレースホルダーアイコン表示
- キャッシュ無効データの処理
- ネットワークエラー対応
- 外部APIサービスを使用しないことによる堅牢性向上

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

## テスト戦略

### ユニットテスト
- **utils.test.ts**: データ処理関数（23テスト）
- **bookmark-delete.test.ts**: 削除機能（6テスト）
- **bookmark-edit.test.ts**: 編集機能（9テスト）
- **カバレッジ**: 主要ロジック100%

### 統合テスト
- **newtab-integration.test.ts**: フォルダクリック機能（13テスト）
- **3layer-issues.test.ts**: 深い階層の特殊ケース（4テスト）
- **integration.test.ts**: Chrome API連携（7テスト）
- **newtab.test.ts**: 基本機能（3テスト）

### テスト環境
- **Vitest**: 高速実行（総計65テスト）
- **JSDOM**: 実DOM環境シミュレーション
- **Chrome API Mock**: 拡張機能API模擬
- **コンポーネント別テスト**: リファクタリング後の各コンポーネントをテスト

### リファクタリング後のテスト戦略
- **後方互換性テスト**: 既存のAPIが正常に動作することを確認
- **新コンポーネントテスト**: 各コンポーネントクラスの独立テスト
- **統合テスト**: コンポーネント間の連携テスト

## ビルドプロセス

### 開発コマンド
```bash
npm run dev          # 監視モード
npm run build        # TypeScriptコンパイル
npm run build:extension  # 拡張機能パッケージング
npm test            # テスト実行
```

### 成果物
```
dist/
├── newtab.html     # エントリーHTML
├── newtab.js       # コンパイル済みJS
├── styles.css      # スタイルシート
├── manifest.json   # 拡張機能マニフェスト
└── icons/          # アイコンファイル
```

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

## リファクタリング成果（v1.4.0）

### アーキテクチャ改善
1. **モジュラー設計**: 590行の巨大ファイルを機能別コンポーネントに分割
2. **責務の分離**: HTML生成、イベント処理、編集・削除機能を独立化
3. **型安全性向上**: 詳細なinterface定義とイベント型を追加
4. **後方互換性**: 既存APIを維持しながら段階的移行を実現

### コード品質向上
- **保守性**: 各コンポーネントが独立してテスト・修正可能
- **再利用性**: コンポーネントクラスとして独立したモジュール
- **可読性**: 機能ごとに整理されたファイル構造
- **拡張性**: 新機能追加時の影響範囲を限定

### パフォーマンス
- **ビルド時間**: TypeScriptコンパイルの最適化
- **テスト実行**: 65テスト全て通過、高速実行
- **バンドルサイズ**: モジュール分割による効率的な読み込み

### 新機能
- **ブックマーク編集**: 名前変更、URL変更、フォルダ移動
- **ブックマーク削除**: 確認ダイアログ付き削除機能
- **レスポンシブデザイン**: 1600px以上で3カラム表示
