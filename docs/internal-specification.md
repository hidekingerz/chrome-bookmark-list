# Chrome Bookmark List - 内部仕様書

## システム構成

### アーキテクチャ概要
```
Chrome Extension (Manifest V3)
├── Frontend (newtab.html + newtab.ts)
├── Core Logic (newtab-core.ts)
├── Utility Functions (utils.ts)
├── Type Definitions (types.ts)
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

### 2. コア機能 (newtab-core.ts)
**責務**: UI生成とインタラクション処理

#### 主要関数

##### `renderFolder(folder: BookmarkFolder, level: number): string`
- フォルダをHTMLに変換
- 階層レベルに応じたスタイリング
- 条件分岐:
  - サブフォルダあり: `.has-subfolders`クラス
  - ブックマークのみ: `.has-bookmarks`クラス

##### `setupFolderClickHandler(container: HTMLElement, allBookmarks: BookmarkFolder[]): void`
- フォルダクリックイベントの一元管理
- イベント委譲パターンを使用
- 処理分岐:
  1. ブックマークリンク → 新しいタブで開く
  2. サブフォルダありフォルダ → サブフォルダ表示切り替え
  3. ブックマークのみフォルダ → ブックマークリスト表示切り替え

##### `updateFolderUI()` / `updateBookmarkListUI()`
- UI状態の同期処理
- DOM要素の表示/非表示制御
- アイコン状態の更新

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

// 非同期取得とキャッシュ保存
export async function getFavicon(url: string): Promise<string>
```

### 4. 型定義 (types.ts)
**責務**: TypeScript型安全性の確保

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

interface ChromeBookmarkNode {
  id: string;
  title: string;
  url?: string;
  children?: ChromeBookmarkNode[];
}
```

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
- 外部通信の制限

## テスト戦略

### ユニットテスト
- **utils.test.ts**: データ処理関数
- **カバレッジ**: 主要ロジック100%

### 統合テスト
- **newtab-integration.test.ts**: フォルダクリック機能
- **3layer-issues.test.ts**: 深い階層の特殊ケース
- **integration.test.ts**: Chrome API連携

### テスト環境
- **Vitest**: 高速実行
- **JSDOM**: 実DOM環境シミュレーション
- **Chrome API Mock**: 拡張機能API模擬

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
