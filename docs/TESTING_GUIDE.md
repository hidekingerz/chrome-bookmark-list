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

### テスト構成（総計754テスト・76ファイル）

主なものを挙げる。全ファイルは `test/` を参照。

#### ユニット・コンポーネントテスト
- **utils.test.ts** (34テスト): データ処理関数、検索・フィルタリング、Favicon の URL 生成
- **bookmark-delete.test.ts** (12テスト): 削除機能の包括的テスト
- **bookmark-edit.test.ts** (9テスト): 編集機能の包括的テスト
- **history.test.ts** (9テスト): 履歴API機能のテスト
- **history-panel.test.ts** (20テスト): 最近の履歴パネルと検索・XSSエスケープのテスト
- **calendar-history-panel.test.ts** (30テスト): カレンダー履歴パネルのテスト
- **tab-controller.test.ts** (7テスト): タブ切り替え制御のテスト
- **multi-select-order.test.ts**: 複数のブックマークをまとめて移動・並び替え・削除した後と、「元に戻す」の後の並び順
- **error-notification.test.ts**: 操作の失敗を「エラー」ダイアログで知らせること
- **duplicate-url-selection.test.ts**: 同じ URL のブックマークが複数あるときの選択と一括操作
- **a11y-axe.test.ts**: axe-core によるアクセシビリティの自動検査
- **render-escaping.test.ts**: ブックマーク名・フォルダ名・URL の HTML エスケープ

#### 統合テスト
- **integration.test.ts** (7テスト): Chrome API連携とDOM操作
- **newtab-integration.test.ts** (18テスト): フォルダクリック機能と履歴パネルの統合テスト
- **newtab.test.ts** (3テスト): フォルダのクリックによる開閉
- **3layer-issues.test.ts** (4テスト): 深い階層の特殊ケース

### テスト戦略の詳細

#### 1. ユニットテスト
**目的**: 個別の機能とコンポーネントの動作を保証

**対象**:
- データ処理関数: `processBookmarkTree()`, `filterBookmarks()`
- ヘルパー関数: `escapeHtml()`, `getFavicon()`
- 各コンポーネントクラス: `BookmarkFolderRenderer`, `BookmarkEditor`, `BookmarkDeleter`, `TabController`
- 履歴関連機能: `HistoryPanel`, `CalendarHistoryPanel`, 履歴API

#### 2. 統合テスト
**目的**: コンポーネント間の連携とシステム全体の動作を検証

**対象**:
- Chrome API との連携
- DOM操作とイベントハンドリング
- フォルダクリック機能の統合動作
- 履歴パネルとメイン画面の連携

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

テスト環境は `test/setup.ts` で初期化されます。`setup.ts` は DOM を用意しません。置くのは次のスタブだけです。

- `chrome`（`bookmarks` / `tabs` / `tabGroups` / `storage` / `runtime` / `sessions`）: 各メソッドが `vi.fn()`
- `localStorage`、`alert`、`Image`
- `document`: `createElement('div')` だけを持つ最小のスタブ（HTML エスケープ用）

実際の DOM が要るテストは、テストの中で Happy DOM の `Window`（または JSDOM）を作り、`beforeEach` で `globalThis.document` / `globalThis.window` を差し替えて、`afterEach` で元に戻します。

```typescript
import { Window } from 'happy-dom';
import { afterEach, beforeEach } from 'vitest';

let win: Window;
let savedDocument: typeof globalThis.document;
let savedWindow: typeof globalThis.window;

beforeEach(() => {
  win = new Window({ url: 'chrome-extension://test-id/newtab.html' });
  savedDocument = globalThis.document;
  savedWindow = globalThis.window;
  globalThis.document = win.document as unknown as Document;
  globalThis.window = win as unknown as typeof globalThis.window;
});

afterEach(() => {
  globalThis.document = savedDocument;
  globalThis.window = savedWindow;
});
```

### 並び順を持つ `chrome.bookmarks` の代役

移動・並び替え・削除とその「元に戻す」は、`chrome.bookmarks.move` などの呼び出しの列ではなく、**操作の後にフォルダの中がどう並んでいるか**を確かめます。`test/helpers/fake-bookmarks.ts` の `installFakeBookmarks()` は、`setup.ts` のモックの上に、並び順を持つ代役を載せます。

```typescript
import { installFakeBookmarks } from './helpers/fake-bookmarks';

const bookmarks = installFakeBookmarks([
  {
    id: '1',
    title: 'ブックマークバー',
    children: [
      { id: '10', title: '仕事', children: [{ id: '101', title: 'A', url: 'https://a.example.com/' }] },
    ],
  },
]);

// 画面を操作したあと
expect(bookmarks.titles('10')).toEqual(['A']);
```

代役は実際の Chrome と同じ規則で動きます。`move` の `index` は、同じフォルダの中では「動かす前の並びでの位置」です（今より後ろを指すと、最終的な位置は `index - 1`）。子の数を超える `index` は `Index out of bounds.`、無い id は `Can't find bookmark for id.` で失敗します。呼び出しの列だけを確かめるテストは、この規則に起因する並び順の不具合を見逃します。

### アクセシビリティの自動検査（axe-core）

`test/a11y-axe.test.ts` は、実際の `src/newtab.html` に本物のレンダラが描いた一覧を載せ、ダイアログ・ツールバー・メニュー・パネルを本物のコードで開いた状態を [axe-core](https://github.com/dequelabs/axe-core) にかけます。違反が 1 件でもあればテストが失敗します。`npm run test` に含まれます。

```typescript
import { axeViolations } from './helpers/axe';

expect(await axeViolations(dom.window)).toEqual([]);
```

- **ここで守れるもの**: 名前（`aria-label` / `aria-labelledby`）、role、aria 属性、ランドマークの違反
- **ここで守れないもの**: 文字のコントラスト。テスト用の DOM は配色を計算できないため、`color-contrast` のルールは無効にしてあります
- 画面や部品を足したときは、その状態を開くテストを `a11y-axe.test.ts` に足します
- axe が検出しない属性（ダイアログ内のエラー文の `role="alert"`、フォルダ見出しの名前、「エラー」ダイアログのフォーカス）は、同じファイルの個別のテストで確かめます

文字のコントラスト（外部仕様「アクセシビリティ」の 4.5:1）は、ビルドした `dist/` を拡張機能として読み込んだ実際の Chrome で axe を実行して確かめます。PR 前の検証（dokumi スキルの実ブラウザ検証）は、`axe-core` がプロジェクトにあるとこの検査を行います。配色（`src/styles.css` のトークン）を変えたときは、ライトとダークの両方で確かめてください。

---

## テストの実行方法

### 基本的なテストコマンド

```bash
# テストを一度だけ実行
npm test

# 開発時の監視モード
npm run test:watch

# カバレッジレポートを生成
npm run test:coverage

# Vitestの可視化UIでテストを実行
npm run test:ui
```

### 特定のテストファイルを実行

```bash
# ユーティリティのテストのみ実行
npm test -- utils.test.ts

# 統合テストのみ実行
npm test -- integration.test.ts

# パターンマッチングで複数ファイル実行
npm test -- bookmark-
```

### カバレッジレポートの確認

```bash
npm run test:coverage
```

カバレッジレポートは `coverage/index.html` で確認できます。

---

## テスト構成

### 1. ユニットテスト詳細

#### utils.test.ts (34テスト)
**対象**: データ処理とヘルパー関数
- `processBookmarkTree()`: ブックマークツリーの変換
- `filterBookmarks()`: 検索フィルタリング
- `findFolderById()`: フォルダID検索
- `escapeHtml()`: XSS対策
- `getFavicon()`: Chrome の `_favicon` API の URL 生成

#### bookmark-delete.test.ts (12テスト)
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

保存先フォルダを変えたときの移動は `bookmark-editor.test.ts` で確かめる。

#### history.test.ts (9テスト)
**対象**: 履歴API機能
- 履歴データの取得
- 日付範囲フィルタリング
- データ変換処理
- API エラーハンドリング

#### history-panel.test.ts (20テスト)
**対象**: 最近の履歴パネル
- パネルの初期化（コンテナ内へのUI構築）
- 履歴アイテムの表示
- 検索機能
- XSSエスケープ（悪意あるタイトルの無害化）
- タイトルクリックでのタブオープン

#### calendar-history-panel.test.ts (30テスト)
**対象**: カレンダー履歴パネル
- カレンダー描画と月切り替え
- 日付選択とタイムライン表示
- ドメイン統計・時間帯ナビゲーション
- XSSエスケープ・タイトルクリックでのタブオープン

#### tab-controller.test.ts (7テスト)
**対象**: タブ切り替え制御
- 初期アクティブタブの認識
- タブ切り替え時の表示・aria属性更新
- activateハンドラの呼び出し

### 2. 統合テスト詳細

#### integration.test.ts (7テスト)
**対象**: Chrome API連携とDOM操作
- Chrome Bookmarks API の統合
- DOM要素の生成と操作
- イベントリスナーの設定
- 空のブックマークツリーと階層構造の処理

#### newtab-integration.test.ts (18テスト)
**対象**: フォルダクリック機能と履歴パネルの統合
- フォルダの展開/折りたたみ
- 複数階層の処理
- 履歴パネルとの連携
- 検索機能の統合

#### newtab.test.ts (3テスト)
**対象**: フォルダのクリック（本物のレンダラとイベント処理を動かす）
- サブフォルダを持つフォルダの開閉とアイコンの切り替え
- ブックマークのリンクをクリックしてもフォルダは折りたたまれない
- サブフォルダもブックマークも無いフォルダは、クリックしても何も起こらない

#### 3layer-issues.test.ts (4テスト)
**対象**: 深い階層の特殊ケース
- 3層構造の初期の展開状態と描画
- 1層目のフォルダをクリックしたときの、2層目以降の表示
- 2層目のフォルダをクリックしたときに、3層目だけが折りたたまれること

---

## 手動テスト

### 1. 開発者向けテスト

#### 自動化テスト（推奨）
```bash
npm test
```
- 包括的なユニットテストと統合テストを実行（754テスト）
- フォルダクリック機能、ブックマーク表示、タブ切り替え、履歴パネル、エラーハンドリングをテスト

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
   - タブ切り替え（ブックマーク / 最近の履歴 / カレンダー）をテスト
   - 各履歴タブ内の検索機能をテスト
   - OSの配色設定を切り替えてダークモード表示を確認

### 2. 主要な機能テスト項目

#### 基本機能
- ✅ フォルダクリックで展開/折りたたみ
- ✅ ネストしたサブフォルダの操作
- ✅ ブックマークリンクのクリックで新しいタブが開く
- ✅ 検索機能でフィルタリング
- ✅ ブックマークが見つからない場合の表示

#### 履歴機能
- ✅ タブ切り替えによる履歴表示
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
npm test -- --reporter=verbose

# 特定のテストのみ実行
npm test -- specific-test.ts

# デバッグモードで実行
npm test -- --inspect-brk
```

### 2. 手動テストで問題が発生した場合

1. **まずは自動テストを実行**: `npm test`
2. **ブラウザの開発者ツールでコンソールエラーを確認**
3. **拡張機能を再読み込み**: Chrome拡張機能ページで「更新」ボタンをクリック
4. **キャッシュをクリア**: ブラウザキャッシュとローカルストレージをクリア

### 3. パフォーマンステスト

#### 大量データでのテスト
```bash
# 大量データ用の自動テストは用意していない。
# Chrome に大量のブックマークを作成し、拡張機能を読み込んで手動で確認する
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
- name: Run tests
  run: npm run test

- name: Generate Coverage
  run: npm run test:coverage

- name: Type Check
  run: npx tsc --noEmit
```

### テストレポート

- **テスト結果**: GitHub Actions の Summary に表示
- **カバレッジ**: Node.js 22 環境で生成
- **アーティファクト**: ビルドした拡張機能（`dist/`）

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