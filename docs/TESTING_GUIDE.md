# Chrome Bookmark List - テストガイド

このドキュメントは、Chrome Bookmark List プロジェクトのテストに関する包括的なガイドです。

プロジェクトのアーキテクチャやモジュール構成については、[internal-specification.md](./internal-specification.md) を参照してください。

## 目次

1. [テスト戦略](#テスト戦略)
2. [テスト環境](#テスト環境)
3. [テストの実行方法](#テストの実行方法)
4. [テスト構成](#テスト構成)
5. [手動テスト](#手動テスト)
6. [トラブルシューティング](#トラブルシューティング)

---

## テスト戦略

### 概要

このプロジェクトでは、ユニットテストと統合テストを組み合わせた多層的なテスト戦略を採用しています。

### テスト構成（総計103テスト）

#### ユニットテスト（70テスト）
- **utils.test.ts** (23テスト): データ処理関数、検索・フィルタリング、Faviconキャッシュ
- **bookmark-delete.test.ts** (6テスト): 削除機能の包括的テスト
- **bookmark-edit.test.ts** (9テスト): 編集機能の包括的テスト
- **history.test.ts** (9テスト): 履歴API機能のテスト
- **history-sidebar.test.ts** (23テスト): 履歴サイドバーと検索機能のテスト

#### 統合テスト（33テスト）
- **integration.test.ts** (7テスト): Chrome API連携とDOM操作
- **newtab-integration.test.ts** (19テスト): フォルダクリック機能と履歴サイドバーの統合テスト
- **newtab.test.ts** (3テスト): 基本機能の動作確認
- **3layer-issues.test.ts** (4テスト): 深い階層の特殊ケース

### テスト戦略の詳細

#### 1. ユニットテスト
**目的**: 個別の機能とコンポーネントの動作を保証

**対象**:
- データ処理関数: `processBookmarkTree()`, `filterBookmarks()`
- ヘルパー関数: `escapeHtml()`, `getFavicon()`
- 各コンポーネントクラス: `BookmarkFolderRenderer`, `BookmarkEditor`, `BookmarkDeleter`
- 履歴関連機能: `HistorySidebar`, 履歴API

#### 2. 統合テスト
**目的**: コンポーネント間の連携とシステム全体の動作を検証

**対象**:
- Chrome API との連携
- DOM操作とイベントハンドリング
- フォルダクリック機能の統合動作
- 履歴サイドバーとメイン画面の連携

#### 3. 互換性テスト
**目的**: 既存のAPIとインターフェースの動作を保証

**対象**:
- `newtab-core.ts`の委譲API: `renderFolder()`, `setupFolderClickHandler()`
- 既存のDOM構造とイベントハンドリング
- 外部から使用されるインターフェース

---

## テスト環境

### 使用技術

- **Vitest**: 高速なテストランナー
- **Happy DOM**: 軽量なDOM環境（ユニットテスト）
- **JSDOM**: 完全なDOM環境（統合テスト）
- **Chrome API Mock**: 拡張機能API模擬

### 環境設定

テスト環境は `test/setup.ts` で初期化されます：

```typescript
// DOM環境の設定
import { beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

beforeEach(() => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.document = dom.window.document;
  global.window = dom.window;
});
```

---

## テストの実行方法

### 基本的なテストコマンド

```bash
# 開発時の監視モード
npm test

# テストを一度だけ実行
npm run test:run

# カバレッジレポートを生成
npm run test:coverage

# Vitestの可視化UIでテストを実行
npm run test:ui
```

### 特定のテストファイルを実行

```bash
# ユーティリティのテストのみ実行
npm run test:run -- utils.test.ts

# 統合テストのみ実行
npm run test:run -- integration.test.ts

# パターンマッチングで複数ファイル実行
npm run test:run -- --run bookmark-*.test.ts
```

### カバレッジレポートの確認

```bash
npm run test:coverage
```

カバレッジレポートは `coverage/index.html` で確認できます。

---

## テスト構成

### 1. ユニットテスト詳細

#### utils.test.ts (23テスト)
**対象**: データ処理とヘルパー関数
- `processBookmarkTree()`: ブックマークツリーの変換
- `filterBookmarks()`: 検索フィルタリング
- `findFolderById()`: フォルダID検索
- `escapeHtml()`: XSS対策
- `getFavicon()`: Faviconキャッシュシステム

#### bookmark-delete.test.ts (6テスト)
**対象**: ブックマーク削除機能
- 削除確認ダイアログの表示
- Chrome API との連携
- UI更新の検証
- エラーハンドリング

#### bookmark-edit.test.ts (9テスト)
**対象**: ブックマーク編集機能
- 編集ダイアログの表示
- フォーム検証
- Chrome API との連携
- フォルダ移動機能

#### history.test.ts (9テスト)
**対象**: 履歴API機能
- 履歴データの取得
- 日付範囲フィルタリング
- データ変換処理
- API エラーハンドリング

#### history-sidebar.test.ts (23テスト)
**対象**: 履歴サイドバー
- サイドバーの開閉
- 履歴アイテムの表示
- 検索機能
- UI インタラクション

### 2. 統合テスト詳細

#### integration.test.ts (7テスト)
**対象**: Chrome API連携とDOM操作
- Chrome Bookmarks API の統合
- DOM要素の生成と操作
- イベントリスナーの設定
- API エラーの処理

#### newtab-integration.test.ts (19テスト)
**対象**: フォルダクリック機能と履歴サイドバーの統合
- フォルダの展開/折りたたみ
- 複数階層の処理
- 履歴サイドバーとの連携
- 検索機能の統合

#### newtab.test.ts (3テスト)
**対象**: 基本機能の動作確認
- アプリケーションの初期化
- 基本的なDOM構造
- エラーハンドリング

#### 3layer-issues.test.ts (4テスト)
**対象**: 深い階層の特殊ケース
- 3層以上の深いフォルダ構造
- 階層レベルの表示
- パフォーマンス問題の検証
- エッジケースの処理

---

## 手動テスト

### 1. 開発者向けテスト

#### 自動化テスト（推奨）
```bash
npm test
```
- 包括的なユニットテストと統合テストを実行（103テスト）
- フォルダクリック機能、ブックマーク表示、履歴サイドバー、エラーハンドリングをテスト

#### 手動テスト（Chrome拡張機能として）
1. **拡張機能をビルド**
   ```bash
   npm run build:extension
   ```

2. **Chromeに読み込む**
   - Chrome で `chrome://extensions/` を開く
   - 「デベロッパーモード」をオンにする
   - 「パッケージ化されていない拡張機能を読み込む」をクリック
   - `dist` フォルダを選択

3. **動作確認**
   - 新しいタブを開く
   - ブックマークフォルダの展開/折りたたみをテスト
   - ブックマークリンクのクリックをテスト
   - 検索機能をテスト
   - 履歴サイドバー（🕐ボタン）をテスト
   - 履歴サイドバー内の検索機能をテスト

### 2. 主要な機能テスト項目

#### 基本機能
- ✅ フォルダクリックで展開/折りたたみ
- ✅ ネストしたサブフォルダの操作
- ✅ ブックマークリンクのクリックで新しいタブが開く
- ✅ 検索機能でフィルタリング
- ✅ ブックマークが見つからない場合の表示

#### 履歴機能
- ✅ 履歴サイドバーの開閉機能
- ✅ 履歴アイテムの表示（過去7日間）
- ✅ 履歴内検索機能
- ✅ 履歴からのページアクセス

#### 編集・削除機能
- ✅ ブックマーク編集ダイアログの表示
- ✅ 名前とURL の変更
- ✅ フォルダ移動機能
- ✅ 削除確認ダイアログ
- ✅ 削除後のUI更新

#### パフォーマンス
- ✅ 大量ブックマークでの表示性能
- ✅ 検索時のレスポンス
- ✅ Favicon読み込み速度

### 3. エッジケースのテスト

#### データ構造
- 空のフォルダ
- 深い階層構造（3層以上）
- 特殊文字を含むブックマーク名
- 長いURL
- 無効なURL

#### エラーケース
- Chrome API エラー
- ネットワークエラー
- DOM操作エラー
- 無効なブックマークデータ

---

## トラブルシューティング

### 1. テストが失敗する場合

#### よくある原因
- **DOM環境の問題**: Happy DOM または JSDOM の設定を確認
- **Chrome API Mock**: モックが正しく設定されているか確認
- **非同期処理**: `await` の使用を確認
- **スコープ問題**: テスト間でのデータ共有を確認

#### デバッグ方法
```bash
# より詳細なログを出力
npm run test:run -- --reporter=verbose

# 特定のテストのみ実行
npm run test:run -- --run specific-test.ts

# デバッグモードで実行
npm run test:run -- --inspect-brk
```

### 2. 手動テストで問題が発生した場合

1. **まずは自動テストを実行**: `npm test`
2. **ブラウザの開発者ツールでコンソールエラーを確認**
3. **拡張機能を再読み込み**: Chrome拡張機能ページで「更新」ボタンをクリック
4. **キャッシュをクリア**: ブラウザキャッシュとローカルストレージをクリア

### 3. パフォーマンステスト

#### 大量データでのテスト
```bash
# 大量のブックマークを作成してテスト
# テストデータは test/fixtures/ に配置
npm run test:run -- performance.test.ts
```

#### メモリリークの確認
```bash
# Chrome DevTools でメモリプロファイリング
# 1. 拡張機能を開く
# 2. DevTools > Memory タブ
# 3. Take heap snapshot
# 4. 操作を繰り返す
# 5. 再度 snapshot を取得して比較
```

---

## CI/CD での自動テスト

### GitHub Actions での実行

プロジェクトのCI/CDパイプラインでは、以下のテストが自動実行されます：

```yaml
- name: Run Tests
  run: npm run test:run

- name: Generate Coverage
  run: npm run test:coverage

- name: Type Check
  run: npx tsc --noEmit
```

### テストレポート

- **テスト結果**: GitHub Actions の Summary に表示
- **カバレッジ**: Node.js 20 環境でのみ生成
- **アーティファクト**: 失敗時のログとスクリーンショット

---

## 今後の改善予定

### 1. E2E テストの導入
- **Playwright** または **Cypress** を使用
- ブラウザ環境での完全な統合テスト
- 実際のChrome拡張機能としてのテスト

### 2. Visual Regression テスト
- **Chromatic** または **Percy** を使用
- UI の視覚的な変更を検出
- レスポンシブデザインの検証

### 3. パフォーマンステスト
- **Lighthouse CI** を使用
- 読み込み速度の測定
- メモリ使用量の監視

---

*最終更新: 2024年7月*