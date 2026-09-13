# コードベース整理リファクタリング 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 未使用コードを削除し、コピーされたロジック（favicon 読み込み・イベント発火・フォルダ一覧・Undo move-back・履歴描画・モーダル）を共通モジュールへ集約する。挙動は変えない（BookmarkEditor のフォルダ選択バグ修正を除く）。

**Architecture:** 既存の `scripts/utils.ts` を正規の関数 API に格上げし、新規の小さなモジュール（`scripts/favicon.ts` / `scripts/bookmarkEvents.ts` / `scripts/dom.ts` / `UndoManager/moveBack.ts` / `components/HistoryList/` / `components/Dialog/`）を追加して各コンポーネントから差し替える。既存テストが参照する DOM の id / クラス名は維持する。

**Tech Stack:** TypeScript 5 (tsc のみ、バンドラなし) / Vitest 4 (happy-dom 環境。`test/setup.ts` が `document` を最小スタブで上書きするため、DOM を触るテストは JSDOM か happy-dom の `Window` を自前で用意する) / Biome (lint + format)

**Spec:** `docs/superpowers/specs/2026-09-14-codebase-cleanup-design.md`

## Global Constraints

- 各タスクの完了条件: `npm run test` / `npm run lint` / `npm run format:write` 適用後の `npm run format` / `npm run build:extension` がすべて成功する（CLAUDE.md の必須条件）
- `docs/external-specification.md` に書かれた挙動を変えない
- 既存テストが参照する DOM の id（`#edit-dialog` `#delete-dialog` `#error-dialog` `#folder-create-dialog` `#folder-rename-dialog` `#folder-delete-dialog` `#tab-group-confirm-dialog` `#bulk-confirm-dialog` `#bulk-move-dialog`）とクラス（`.edit-dialog-close` `.edit-dialog-cancel` `.edit-dialog-save` `.delete-dialog-confirm` `.folder-create-confirm` `.folder-rename-confirm` `.folder-delete-confirm` `.tab-group-confirm` `.bulk-move-confirm` `.folder-create-error` `.folder-rename-error` `.delete-warning` `.delete-bookmark-info`）は維持する
- `bookmarks-changed` イベントの `detail.action` 文字列は既存のまま
- import パスは `.js` 拡張子付き（tsc の ESM 出力に合わせる）
- コミットメッセージは日本語。末尾に以下を付ける:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014QvfihVbKbSFMaLkwLsCJB
  ```
- ブランチ: `refactor/cleanup`（作成済み）

## 全体チェックコマンド（各タスク末尾で実行）

```bash
npm run test && npm run lint && npm run format:write && npm run format && npm run build:extension
```

---

### Task 1: テストの壊れた型 import を修正する (D)

**Files:**
- Modify: `test/3layer-issues.test.ts:7`, `test/bookmark-delete.test.ts:4`, `test/bookmark-edit.test.ts:4`, `test/newtab.test.ts:3`, `test/newtab-integration.test.ts:9`, `test/search-debounce.test.ts:4`

**Interfaces:**
- Consumes: `src/types/bookmark.ts` の `BookmarkFolder`, `ChromeBookmarkNode`
- Produces: なし

- [ ] **Step 1: 現状を確認する**

Run: `grep -n "scripts/types" test/*.ts`
Expected: 6 行（上記ファイル）。`ls src/scripts/types*` は「no matches」

- [ ] **Step 2: import パスを置換する**

```bash
sed -i '' "s#'../src/scripts/types'#'../src/types/bookmark'#" \
  test/3layer-issues.test.ts test/bookmark-delete.test.ts test/bookmark-edit.test.ts \
  test/newtab.test.ts test/newtab-integration.test.ts test/search-debounce.test.ts
```

- [ ] **Step 3: 型が実際に解決されることを確認する**

Run: `npx tsc --noEmit -p tsconfig.json && grep -rn "scripts/types" test/ ; echo "exit=$?"`
Expected: grep はヒットなし（exit=1）。tsc はエラーなし

- [ ] **Step 4: 全体チェック**

Run: 全体チェックコマンド
Expected: 44 files / 581 tests passed、lint・format・build 成功

- [ ] **Step 5: コミット**

```bash
git add test/
git commit -m "テストの存在しない scripts/types への型 import を types/bookmark に修正"
```

---

### Task 2: utils.ts を正規 API に格上げし、ErrorHandler / HtmlUtils / 未使用の型・定数を削除する (A-1)

**Files:**
- Modify: `src/scripts/utils.ts`（全面書き換え）
- Modify: `src/constants/index.ts`（全面書き換え）
- Modify: `src/components/BookmarkDragAndDrop/index.ts:2,178`
- Delete: `src/services/ErrorHandler.ts`, `src/utils/HtmlUtils.ts`, `src/types/events.ts`, `src/types/index.ts`, `test/error-handler.test.ts`, `test/html-utils.test.ts`
- Test: `test/utils.test.ts`（escapeHtml のケースを追加）

**Interfaces:**
- Produces: `scripts/utils.ts` から `getFavicon(url): Promise<string>`, `processBookmarkTree`, `filterBookmarks`, `applyExpandedState`, `findFolderById`, `getTotalBookmarks`, `escapeHtml(text: string): string`, `getDomain(url: string): string`, `BookmarkService`, `FaviconService` を export（後続タスクはすべてここから import する）

- [ ] **Step 1: 削除対象が本当に未使用であることを確認する**

Run:
```bash
grep -rn "ErrorHandler\|HtmlUtils\|types/events\|types/index\|ERROR_MESSAGES\|CSS_CLASSES\|CHROME_EXTENSION_SCHEME\|BOOKMARK_ANIMATION_DURATION_MS" src test --include=*.ts
```
Expected: ヒットは `src/scripts/utils.ts`（import と再エクスポート）、`src/utils/HtmlUtils.ts` 自身、`src/services/ErrorHandler.ts` 自身、`src/components/BookmarkDragAndDrop/index.ts`（2 箇所）、`src/constants/index.ts` 自身、`test/error-handler.test.ts`、`test/html-utils.test.ts` のみ

- [ ] **Step 2: escapeHtml の失敗するテストを utils.test.ts に追加する**

`test/utils.test.ts` の `describe('escapeHtml'...` があればその中に、無ければファイル末尾に追加:

```ts
describe('escapeHtml (HtmlUtils から移管)', () => {
  it('& < > " \' をすべてエスケープする', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    );
  });

  it('空文字はそのまま返す', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('getDomain (HtmlUtils から移管)', () => {
  it('URL からホスト名を返す', () => {
    expect(getDomain('https://example.com/path?q=1')).toBe('example.com');
  });

  it('不正な URL は localhost を返す', () => {
    expect(getDomain('not a url')).toBe('localhost');
  });
});
```

- [ ] **Step 3: テストが現状でも通ることを確認する（委譲なので通る）**

Run: `npx vitest run test/utils.test.ts`
Expected: PASS（この 4 件は HtmlUtils 経由で既に通る。次で実装を移しても通り続けることを保証する目的）

- [ ] **Step 4: `src/scripts/utils.ts` を書き換える**

```ts
/**
 * ブックマーク処理・favicon・HTML エスケープの関数 API。
 * コンポーネントとテストはこのモジュールから import する。
 * BookmarkService / FaviconService はここで遅延生成したインスタンスを共有する。
 */

import { BookmarkService } from '../services/BookmarkService.js';
import { FaviconService } from '../services/FaviconService.js';
import type { BookmarkFolder, ChromeBookmarkNode } from '../types/bookmark.js';

let faviconService: FaviconService | null = null;
let bookmarkService: BookmarkService | null = null;

function getFaviconService(): FaviconService {
  if (!faviconService) {
    faviconService = new FaviconService();
  }
  return faviconService;
}

function getBookmarkService(): BookmarkService {
  if (!bookmarkService) {
    bookmarkService = new BookmarkService();
  }
  return bookmarkService;
}

/**
 * ページ URL に対応する favicon URL を返す。
 * FaviconService 自体は同期だが、呼び出し側（およびテストの mock）が
 * Promise を前提にしているため async のまま公開する。
 */
export async function getFavicon(url: string): Promise<string> {
  return getFaviconService().getFavicon(url);
}

export function processBookmarkTree(
  tree: ChromeBookmarkNode[]
): BookmarkFolder[] {
  return getBookmarkService().processBookmarkTree(tree);
}

export function filterBookmarks(
  folders: BookmarkFolder[],
  searchTerm: string
): BookmarkFolder[] {
  return getBookmarkService().filterBookmarks(folders, searchTerm);
}

export function applyExpandedState(
  folders: BookmarkFolder[],
  previous: BookmarkFolder[]
): void {
  getBookmarkService().applyExpandedState(folders, previous);
}

export function findFolderById(
  folders: BookmarkFolder[],
  id: string
): BookmarkFolder | null {
  return getBookmarkService().findFolderById(folders, id);
}

export function getTotalBookmarks(folder: BookmarkFolder): number {
  return getBookmarkService().getTotalBookmarks(folder);
}

/**
 * HTML の特殊文字をエスケープする。
 * textContent→innerHTML 方式は & < > のみをエスケープし " ' を残すため、
 * 属性値に埋め込むと属性インジェクション/属性値破壊が起きる (#96)。
 * & < > " ' をすべて明示的に置換する。
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * URL からホスト名を取り出す。不正な URL は 'localhost' を返す。
 */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'localhost';
  }
}

export { BookmarkService } from '../services/BookmarkService.js';
export { FaviconService } from '../services/FaviconService.js';
```

- [ ] **Step 5: `src/constants/index.ts` を書き換える**

```ts
/**
 * アプリケーション全体で使用する定数
 */

// UI関連
export const SEARCH_DEBOUNCE_MS = 300;

// Chrome のパーマネントルートフォルダ ID は固定でロケール非依存。
// タイトル文字列比較は多言語で壊れるため ID で判定する (#103)。
export const BOOKMARK_ROOT_IDS = {
  /** ブックマークバー */
  BOOKMARKS_BAR: '1',
  /** その他のブックマーク */
  OTHER: '2',
  /** モバイルのブックマーク */
  MOBILE: '3',
} as const;

// DOM セレクター
export const SELECTORS = {
  BOOKMARK_CONTAINER: '#bookmarkContainer',
  SEARCH_INPUT: '#searchInput',
  BOOKMARK_LINK: '.bookmark-link',
  FOLDER_HEADER: '.folder-header',
  BOOKMARK_FOLDER: '.bookmark-folder',
  BOOKMARK_ITEM: '.bookmark-item',
  FAVICON: '.bookmark-favicon',
  FAVICON_PLACEHOLDER: '.favicon-placeholder',
} as const;
```

- [ ] **Step 6: BookmarkDragAndDrop の HtmlUtils 参照を置換する**

`src/components/BookmarkDragAndDrop/index.ts` 2 行目:
```ts
import { HtmlUtils } from '../../utils/HtmlUtils.js';
```
→
```ts
import { escapeHtml } from '../../scripts/utils.js';
```
178 行目付近の `${HtmlUtils.escapeHtml(faviconSrc)}` → `${escapeHtml(faviconSrc)}`

- [ ] **Step 7: ファイルを削除する**

```bash
git rm src/services/ErrorHandler.ts src/utils/HtmlUtils.ts src/types/events.ts src/types/index.ts \
  test/error-handler.test.ts test/html-utils.test.ts
```

- [ ] **Step 8: 全体チェック**

Run: 全体チェックコマンド
Expected: 42 files passed（2 ファイル減）、lint・format・build 成功。`grep -rn "HtmlUtils\|ErrorHandler" src test` はヒットなし

- [ ] **Step 9: コミット**

```bash
git add -A
git commit -m "scripts/utils.ts を正規 API に格上げし、未使用の ErrorHandler / HtmlUtils / 型 / 定数を削除"
```

---

### Task 3: newtab-core / BookmarkFolder / BookmarkSelection / BookmarkFolderEvents の死んだコードを削除する (A-2)

**Files:**
- Modify: `src/scripts/newtab-core.ts`（全面書き換え）
- Modify: `src/components/BookmarkFolder/index.ts`（全面書き換え）
- Modify: `src/components/BookmarkSelection/index.ts`, `src/components/BookmarkSelection/BookmarkSelection.ts:10-15,48-56,219-224`
- Modify: `src/components/BookmarkFolder/BookmarkFolderEvents.ts:46-51,377,530,893-915`
- Test: `test/newtab-core.test.ts`, `test/folder-events-coverage.test.ts:151,192-197,548`, `test/bookmark-selection.test.ts:101`, `test/bookmark-id-identification.test.ts:161`

**Interfaces:**
- Consumes: なし
- Produces: `BookmarkFolderEvents` のコンストラクタ `constructor(selection?: BookmarkSelection)` は維持（テストが選択オブジェクトを注入する窓口になる）

- [ ] **Step 1: テストを先に書き換える（削除する API を使わない形に）**

`test/newtab-core.test.ts`: import を
```ts
import { displayBookmarksTestable } from '../src/scripts/newtab-core';
```
に変え、`describe('非推奨関数', ...)` ブロック全体（`updateFolderUI` / `updateBookmarkListUI` の 2 テスト）を削除する。

`test/folder-events-coverage.test.ts`:
- import に追加: `import { BookmarkSelection } from '../src/components/BookmarkSelection/BookmarkSelection';`
- 変数宣言に追加: `let selection: BookmarkSelection;`
- 151 行目 `events = new BookmarkFolderEvents();` →
  ```ts
  selection = new BookmarkSelection();
  events = new BookmarkFolderEvents(selection);
  ```
- 192-197 行目の `// === getSelection ===` コメントと `it('getSelection() は BookmarkSelection を返す', ...)` を削除
- 548 行目 `vi.spyOn(events.getSelection(), 'handleClick').mockReturnValue(true);` → `vi.spyOn(selection, 'handleClick').mockReturnValue(true);`

`test/bookmark-selection.test.ts:101` と `test/bookmark-id-identification.test.ts:161`: `selection.initialize(container);` → `selection.refresh(container);`

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run test/newtab-core.test.ts test/folder-events-coverage.test.ts test/bookmark-selection.test.ts test/bookmark-id-identification.test.ts`
Expected: newtab-core / folder-events-coverage / bookmark-selection / bookmark-id-identification はすべて PASS（`refresh` と注入コンストラクタは既に存在するため）。ここで失敗するなら書き換えミス

- [ ] **Step 3: `src/scripts/newtab-core.ts` を書き換える**

```ts
/**
 * newtab.ts とテストから使う薄い関数 API。
 * BookmarkFolderRenderer / BookmarkFolderEvents / BookmarkActions への委譲のみを行う。
 */

import { BookmarkActions } from '../components/BookmarkActions/index.js';
import { BookmarkFolderEvents } from '../components/BookmarkFolder/BookmarkFolderEvents.js';
import { BookmarkFolderRenderer } from '../components/BookmarkFolder/BookmarkFolderRenderer.js';
import type { BookmarkFolder } from '../types/bookmark.js';

const folderRenderer = new BookmarkFolderRenderer();
const folderEvents = new BookmarkFolderEvents();
const bookmarkActions = new BookmarkActions();

/**
 * フォルダを HTML に変換する
 */
export function renderFolder(folder: BookmarkFolder, level = 0): string {
  return folderRenderer.renderFolder(folder, level);
}

/**
 * フォルダクリックのイベントハンドラーを設定する
 */
export function setupFolderClickHandler(
  container: HTMLElement,
  allBookmarks: BookmarkFolder[]
): void {
  folderEvents.setupFolderClickHandler(container, allBookmarks);
}

/**
 * ブックマークを指定コンテナに表示する（テストから使う）
 */
export async function displayBookmarksTestable(
  folders: BookmarkFolder[],
  container: HTMLElement
): Promise<void> {
  if (folders.length === 0) {
    container.innerHTML =
      '<div class="no-results">ブックマークが見つかりませんでした。</div>';
    return;
  }

  container.innerHTML = folderRenderer.renderFolders(folders);
  folderEvents.setupFolderClickHandler(container, folders);
}

/**
 * ブックマーク削除の処理を行う
 */
export async function handleBookmarkDelete(
  deleteBtn: HTMLElement
): Promise<void> {
  return bookmarkActions.handleDelete(deleteBtn);
}

/**
 * ブックマーク編集の処理を行う
 */
export async function handleBookmarkEdit(editBtn: HTMLElement): Promise<void> {
  return bookmarkActions.handleEdit(editBtn);
}
```

- [ ] **Step 4: `src/components/BookmarkFolder/index.ts` を書き換える**

```ts
/**
 * ブックマークフォルダー関連のクラスのエクスポート
 */

export { BookmarkFolderEvents } from './BookmarkFolderEvents.js';
export { BookmarkFolderRenderer } from './BookmarkFolderRenderer.js';
```

- [ ] **Step 5: BookmarkSelection の整理**

`src/components/BookmarkSelection/index.ts` を 1 行に:
```ts
export { BookmarkSelection } from './BookmarkSelection.js';
```

`src/components/BookmarkSelection/BookmarkSelection.ts`:
- 10 行目 `export interface SelectedBookmark {` → `interface SelectedBookmark {`（export を外す）
- 48-56 行目の `initialize(container: HTMLElement): void { ... }` メソッドと直前の JSDoc を削除
- 219-224 行目の JSDoc `選択中の URL 一覧 (テスト用)` → `選択中の URL 一覧`

- [ ] **Step 6: BookmarkFolderEvents の整理**

`src/components/BookmarkFolder/BookmarkFolderEvents.ts`:
- 46-51 行目の `getSelection()` メソッドと JSDoc を削除
- 377 行目 `await this.copyToClipboard(url, title);` → `await this.copyToClipboard(url);`
- 530 行目 `private async copyToClipboard(url: string, _title: string): Promise<void> {` → `private async copyToClipboard(url: string): Promise<void> {`
- 893-915 行目の `findFolder` を次に置換:
  ```ts
  /**
   * フォルダを ID で検索する
   */
  private findFolder(
    allBookmarks: BookmarkFolder[],
    folderId: string
  ): BookmarkFolder | null {
    return findFolderById(allBookmarks, folderId);
  }
  ```

- [ ] **Step 7: 参照が残っていないことを確認する**

Run: `grep -rn "getSelection\|\.initialize(container\|SelectedBookmark\|updateFolderUI\|updateBookmarkListUI\|class BookmarkFolder " src test`
Expected: ヒットなし

- [ ] **Step 8: 全体チェック**

Run: 全体チェックコマンド
Expected: すべて成功。テスト数は newtab-core の 2 件と folder-events-coverage の 1 件が減る

- [ ] **Step 9: コミット**

```bash
git add -A
git commit -m "newtab-core の deprecated 関数、BookmarkFolder ラッパー、テスト専用 API、到達不能なフォールバックを削除"
```

---

### Task 4: `bookmarks-changed` 発火を `scripts/bookmarkEvents.ts` に集約する (B-2)

**Files:**
- Create: `src/scripts/bookmarkEvents.ts`
- Test: `test/bookmark-events.test.ts`
- Modify: `src/components/BookmarkActions/BookmarkEditor.ts`, `BookmarkDeleter.ts`, `FolderCreator.ts`, `FolderDeleter.ts`, `FolderRenamer.ts`, `src/components/BookmarkSelection/BookmarkSelection.ts`, `src/components/BookmarkDragAndDrop/index.ts`

**Interfaces:**
- Produces: `dispatchBookmarksChanged(action: BookmarksChangedAction): void`、型 `BookmarksChangedAction`

- [ ] **Step 1: 失敗するテストを書く**

`test/bookmark-events.test.ts`:
```ts
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dispatchBookmarksChanged } from '../src/scripts/bookmarkEvents';

describe('dispatchBookmarksChanged', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    Object.defineProperty(globalThis, 'document', {
      value: dom.window.document,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'CustomEvent', {
      value: dom.window.CustomEvent,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    dom.window.close();
  });

  it('document に bookmarks-changed を detail.action 付きで発火する', () => {
    const received: string[] = [];
    dom.window.document.addEventListener('bookmarks-changed', (e) => {
      received.push((e as CustomEvent<{ action: string }>).detail.action);
    });

    dispatchBookmarksChanged('edit');
    dispatchBookmarksChanged('undo-folder-reorder');

    expect(received).toEqual(['edit', 'undo-folder-reorder']);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run test/bookmark-events.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

`src/scripts/bookmarkEvents.ts`:
```ts
/**
 * ブックマークの変更を newtab.ts に通知するイベント。
 * newtab.ts はこれを受けてブックマーク一覧を再読み込みする。
 */

export type BookmarksChangedAction =
  | 'edit'
  | 'delete'
  | 'move'
  | 'bulk-delete'
  | 'bulk-move'
  | 'folder-create'
  | 'folder-rename'
  | 'folder-delete'
  | 'folder-move'
  | `undo-${string}`;

export function dispatchBookmarksChanged(action: BookmarksChangedAction): void {
  document.dispatchEvent(
    new CustomEvent('bookmarks-changed', { detail: { action } })
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run test/bookmark-events.test.ts`
Expected: PASS

- [ ] **Step 5: 7 クラスの private メソッドを置換する**

対象 7 ファイルすべてで、次の private メソッド（JSDoc があればそれも）を削除する:
```ts
  private dispatchBookmarksChanged(action: string): void {
    const event = new CustomEvent('bookmarks-changed', { detail: { action } });
    document.dispatchEvent(event);
  }
```
各ファイル先頭に import を追加し、`this.dispatchBookmarksChanged(` を `dispatchBookmarksChanged(` に置換する:
```ts
import { dispatchBookmarksChanged } from '../../scripts/bookmarkEvents.js';
```

```bash
for f in src/components/BookmarkActions/BookmarkEditor.ts src/components/BookmarkActions/BookmarkDeleter.ts \
  src/components/BookmarkActions/FolderCreator.ts src/components/BookmarkActions/FolderDeleter.ts \
  src/components/BookmarkActions/FolderRenamer.ts src/components/BookmarkSelection/BookmarkSelection.ts \
  src/components/BookmarkDragAndDrop/index.ts; do
  sed -i '' 's/this\.dispatchBookmarksChanged(/dispatchBookmarksChanged(/g' "$f"
done
```
メソッド本体の削除と import 追加は手で行う（`BookmarkDeleter.ts` は JSDoc `ブックマーク変更通知イベントを発火する` も削除）。

- [ ] **Step 6: BookmarkDragAndDrop のインライン 5 箇所を置換する**

`src/components/BookmarkDragAndDrop/index.ts` で次の 4 パターンを置換:

```ts
            const e = new CustomEvent('bookmarks-changed', {
              detail: { action: 'undo-bulk-reorder' },
            });
            document.dispatchEvent(e);
```
→ `dispatchBookmarksChanged('undo-bulk-reorder');`

```ts
            const e = new CustomEvent('bookmarks-changed', {
              detail: { action: 'undo-bookmark-reorder' },
            });
            document.dispatchEvent(e);
```
→ `dispatchBookmarksChanged('undo-bookmark-reorder');`

```ts
            const e = new CustomEvent('bookmarks-changed', {
              detail: { action: 'undo-bulk-move' },
            });
            document.dispatchEvent(e);
```
→ `dispatchBookmarksChanged('undo-bulk-move');`

```ts
            const event = new CustomEvent('bookmarks-changed', {
              detail: { action: 'undo-move' },
            });
            document.dispatchEvent(event);
```
→ `dispatchBookmarksChanged('undo-move');`

`refreshBookmarkList()` は次に置換:
```ts
  /**
   * ブックマークリストを再読み込みする
   */
  private async refreshBookmarkList(): Promise<void> {
    dispatchBookmarksChanged('move');
  }
```

- [ ] **Step 7: 残りがないことを確認する**

Run: `grep -rn "new CustomEvent('bookmarks-changed'" src`
Expected: `src/scripts/bookmarkEvents.ts` の 1 箇所のみ

- [ ] **Step 8: 全体チェック → コミット**

Run: 全体チェックコマンド
Expected: すべて成功

```bash
git add -A
git commit -m "bookmarks-changed の発火を scripts/bookmarkEvents.ts に集約"
```

---

### Task 5: `isEditableElement` を `scripts/dom.ts` に集約する (B-5)

**Files:**
- Create: `src/scripts/dom.ts`
- Test: `test/dom.test.ts`
- Modify: `src/components/KeyboardShortcuts/index.ts:68,288-297`, `src/components/UndoManager/index.ts:43,112-121`, `src/components/BookmarkSelection/BookmarkSelection.ts:425-437`

**Interfaces:**
- Produces: `isEditableElement(el: Element | null): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`test/dom.test.ts`:
```ts
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isEditableElement } from '../src/scripts/dom';

describe('isEditableElement', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM(
      '<!DOCTYPE html><html><body><input id="i"><textarea id="t"></textarea><select id="s"></select><div id="d"></div><div id="ce" contenteditable="true"></div></body></html>'
    );
  });

  afterEach(() => {
    dom.window.close();
  });

  it('input / textarea / select は編集中要素', () => {
    const doc = dom.window.document;
    expect(isEditableElement(doc.getElementById('i'))).toBe(true);
    expect(isEditableElement(doc.getElementById('t'))).toBe(true);
    expect(isEditableElement(doc.getElementById('s'))).toBe(true);
  });

  it('contenteditable は編集中要素', () => {
    const el = dom.window.document.getElementById('ce') as HTMLElement;
    // JSDOM は isContentEditable を実装しないため明示的に付与する
    Object.defineProperty(el, 'isContentEditable', { value: true });
    expect(isEditableElement(el)).toBe(true);
  });

  it('通常の div と null は編集中要素ではない', () => {
    expect(isEditableElement(dom.window.document.getElementById('d'))).toBe(
      false
    );
    expect(isEditableElement(null)).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run test/dom.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

`src/scripts/dom.ts`:
```ts
/**
 * DOM に関する小さなヘルパー
 */

/**
 * フォーカス中の要素がテキスト入力を受け付けるか。
 * キーボードショートカット・ESC・Undo が、入力欄でのタイピングを横取りしないために使う。
 */
export function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  return (el as HTMLElement).isContentEditable === true;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run test/dom.test.ts`
Expected: PASS

- [ ] **Step 5: 3 箇所を置換する**

`src/components/KeyboardShortcuts/index.ts`:
- import 追加: `import { isEditableElement } from '../../scripts/dom.js';`
- 68 行目 `const isEditable = this.isEditableElement(active);` → `const isEditable = isEditableElement(active);`
- 288-297 行目の `private isEditableElement(...)` メソッドを削除

`src/components/UndoManager/index.ts`:
- import 追加: `import { isEditableElement } from '../../scripts/dom.js';`
- 43 行目 `if (this.isEditableElement(active)) return;` → `if (isEditableElement(active)) return;`
- 112-121 行目の `private isEditableElement(...)` メソッドを削除

`src/components/BookmarkSelection/BookmarkSelection.ts` の `ensureKeydownHandler` 内:
```ts
      // 入力欄にフォーカスがあるときはスキップ
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          active.isContentEditable
        ) {
          return;
        }
      }
```
→
```ts
      // 入力欄にフォーカスがあるときはスキップ
      if (isEditableElement(document.activeElement)) return;
```
import 追加: `import { isEditableElement } from '../../scripts/dom.js';`

- [ ] **Step 6: 全体チェック → コミット**

Run: `grep -rn "isEditableElement" src` → 定義 1 + 利用 3 の 4 行。全体チェックコマンド → すべて成功

```bash
git add -A
git commit -m "isEditableElement を scripts/dom.ts に集約"
```

---

### Task 6: `getAllFolders` を BookmarkService に集約し、BookmarkEditor のフォルダ選択バグを直す (B-3)

**Files:**
- Modify: `src/services/BookmarkService.ts`（`findFolderById` の直前にメソッド追加）
- Modify: `src/scripts/utils.ts`（関数 export 追加）
- Test: `test/bookmark-service.test.ts`（ケース追加）
- Modify: `src/components/BookmarkActions/BookmarkEditor.ts:56-74,106-114`, `src/components/BookmarkActions/FolderCreator.ts:28-45`, `src/components/BookmarkSelection/BookmarkSelection.ts:634-651`

**Interfaces:**
- Produces: `BookmarkService.getAllFolders(): Promise<ChromeBookmarkNode[]>`、`scripts/utils.ts` の `getAllFolders(): Promise<ChromeBookmarkNode[]>`

- [ ] **Step 1: 失敗するテストを書く**

`test/bookmark-service.test.ts` の末尾（最外 `describe` の内側）に追加:
```ts
  describe('getAllFolders', () => {
    it('仮想ルート id=0 を除き、フォルダのみを深さ優先で返す', async () => {
      vi.mocked(chrome.bookmarks.getTree).mockResolvedValue([
        {
          id: '0',
          title: '',
          children: [
            {
              id: '1',
              title: 'ブックマークバー',
              children: [
                { id: '10', title: 'GitHub', url: 'https://github.com' },
                { id: '11', title: 'Work', children: [] },
              ],
            },
            { id: '2', title: 'その他のブックマーク', children: [] },
          ],
        },
      ] as chrome.bookmarks.BookmarkTreeNode[]);

      const folders = await new BookmarkService().getAllFolders();

      expect(folders.map((f) => f.id)).toEqual(['1', '11', '2']);
    });
  });
```
（ファイル先頭に `vi` の import が無ければ `import { ..., vi } from 'vitest';` に追加。`BookmarkService` の import は既存）

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run test/bookmark-service.test.ts`
Expected: FAIL（`getAllFolders is not a function`）

- [ ] **Step 3: 実装する**

`src/services/BookmarkService.ts` の `findFolderById` の直前に追加:
```ts
  /**
   * ブックマークツリー内のすべてのフォルダを深さ優先で返す。
   * id='0' はツリーの仮想ルートで、ここを親に指定した create / move は
   * Chrome API で必ず失敗するため候補から除外する。
   */
  async getAllFolders(): Promise<ChromeBookmarkNode[]> {
    const tree = (await chrome.bookmarks.getTree()) as ChromeBookmarkNode[];
    const folders: ChromeBookmarkNode[] = [];
    const collect = (nodes: ChromeBookmarkNode[]) => {
      for (const node of nodes) {
        if (node.children && !node.url) {
          if (node.id !== '0') {
            folders.push(node);
          }
          collect(node.children);
        }
      }
    };
    collect(tree);
    return folders;
  }
```

`src/scripts/utils.ts` の `getTotalBookmarks` の直後に追加:
```ts
export async function getAllFolders(): Promise<ChromeBookmarkNode[]> {
  return getBookmarkService().getAllFolders();
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run test/bookmark-service.test.ts`
Expected: PASS

- [ ] **Step 5: 3 箇所の private `getAllFolders` を削除して置換する**

`src/components/BookmarkActions/BookmarkEditor.ts`:
- 1 行目 import を `import { escapeHtml, getAllFolders } from '../../scripts/utils.js';`
- `const allFolders = await this.getAllFolders();` → `const allFolders = await getAllFolders();`
- 56-74 行目の `private async getAllFolders()` と JSDoc を削除
- `createDialogHTML` 内の option 生成を次に置換（id をエスケープする）:
  ```ts
    const folderOptions = folders
      .map(
        (folder) => `
        <option value="${escapeHtml(folder.id)}" ${folder.id === bookmark.parentId ? 'selected' : ''}>
          ${escapeHtml(folder.title)}
        </option>
      `
      )
      .join('');
  ```

`src/components/BookmarkActions/FolderCreator.ts`:
- import を `import { escapeHtml, getAllFolders } from '../../scripts/utils.js';`
- `const folders = await this.getAllFolders();` → `const folders = await getAllFolders();`
- 28-45 行目の `private async getAllFolders()` を削除

`src/components/BookmarkSelection/BookmarkSelection.ts`:
- import を `import { escapeHtml, getAllFolders } from '../../scripts/utils.js';`
- `const folders = await this.getAllFolders();` → `const folders = await getAllFolders();`
- 634-651 行目の `private async getAllFolders()` を削除

- [ ] **Step 6: 編集ダイアログに仮想ルートが出ないことを検証するテストを追加する**

`test/bookmark-editor.test.ts` の既存 `describe` 内に追加（このファイルは `mockChrome.bookmarks.getTree` に id '0' を含むツリーを与えている）:
```ts
  it('フォルダ選択に仮想ルート id=0 の選択肢が含まれない', async () => {
    const editBtn = document.querySelector('.bookmark-edit-btn') as HTMLElement;
    await editor.handleBookmarkEdit(editBtn);

    const options = Array.from(
      document.querySelectorAll('#edit-folder option')
    ).map((o) => (o as HTMLOptionElement).value);
    expect(options).not.toContain('0');
    expect(options.length).toBeGreaterThan(0);
  });
```
（`editor` / `.bookmark-edit-btn` の変数名・セレクタは同ファイルの既存テストに合わせる。ファイルを開いて既存の `handleBookmarkEdit` 呼び出し例をコピーすること）

Run: `npx vitest run test/bookmark-editor.test.ts`
Expected: PASS

- [ ] **Step 7: 全体チェック → コミット**

Run: `grep -rn "private async getAllFolders" src` → ヒットなし。全体チェックコマンド → すべて成功

```bash
git add -A
git commit -m "getAllFolders を BookmarkService に集約し、編集ダイアログの仮想ルート混入とエスケープ漏れを修正"
```

---

### Task 7: Undo 用 move-back を `UndoManager/moveBack.ts` に集約する (B-4)

**Files:**
- Create: `src/components/UndoManager/moveBack.ts`
- Test: `test/move-back.test.ts`
- Modify: `src/components/BookmarkDragAndDrop/index.ts`（`reorderBookmark` / `reorderFolder` の undo クロージャ）

**Interfaces:**
- Produces: `moveBackForUndo(id: string, parentId: string, index: number): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**

`test/move-back.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { moveBackForUndo } from '../src/components/UndoManager/moveBack';

describe('moveBackForUndo', () => {
  beforeEach(() => {
    vi.mocked(chrome.bookmarks.get).mockReset();
    vi.mocked(chrome.bookmarks.move).mockReset();
    vi.mocked(chrome.bookmarks.move).mockResolvedValue(
      {} as chrome.bookmarks.BookmarkTreeNode
    );
  });

  it('同一親内で現在位置が戻り先より前なら index を +1 して move する', async () => {
    vi.mocked(chrome.bookmarks.get).mockResolvedValue([
      { id: 'b1', title: 't', parentId: 'p', index: 0 },
    ] as chrome.bookmarks.BookmarkTreeNode[]);

    await moveBackForUndo('b1', 'p', 2);

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('b1', {
      parentId: 'p',
      index: 3,
    });
  });

  it('現在位置が戻り先より後なら index をそのまま使う', async () => {
    vi.mocked(chrome.bookmarks.get).mockResolvedValue([
      { id: 'b1', title: 't', parentId: 'p', index: 5 },
    ] as chrome.bookmarks.BookmarkTreeNode[]);

    await moveBackForUndo('b1', 'p', 2);

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('b1', {
      parentId: 'p',
      index: 2,
    });
  });

  it('別の親にいる場合は補正しない', async () => {
    vi.mocked(chrome.bookmarks.get).mockResolvedValue([
      { id: 'b1', title: 't', parentId: 'other', index: 0 },
    ] as chrome.bookmarks.BookmarkTreeNode[]);

    await moveBackForUndo('b1', 'p', 2);

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('b1', {
      parentId: 'p',
      index: 2,
    });
  });

  it('get が失敗しても index をそのまま使って move する', async () => {
    vi.mocked(chrome.bookmarks.get).mockRejectedValue(new Error('gone'));

    await moveBackForUndo('b1', 'p', 2);

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('b1', {
      parentId: 'p',
      index: 2,
    });
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run test/move-back.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

`src/components/UndoManager/moveBack.ts`:
```ts
/**
 * 並び替えの Undo でノードを元の位置に戻す。
 *
 * chrome.bookmarks.move は同じ親内の移動で index を「元の配列での目標位置」と
 * 解釈し、現在位置 < index のとき最終位置を index - 1 に補正する。
 * 戻り先 = index を保証するため、現在位置が戻り先より前なら index + 1 を渡す。
 */
export async function moveBackForUndo(
  id: string,
  parentId: string,
  index: number
): Promise<void> {
  let undoIndex = index;
  try {
    const [now] = await chrome.bookmarks.get(id);
    if (
      now?.parentId === parentId &&
      now.index !== undefined &&
      now.index < undoIndex
    ) {
      undoIndex = undoIndex + 1;
    }
  } catch {
    // 取得失敗時は index のまま (フォールバック)
  }
  await chrome.bookmarks.move(id, { parentId, index: undoIndex });
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run test/move-back.test.ts`
Expected: PASS

- [ ] **Step 5: BookmarkDragAndDrop の 2 箇所を置換する**

import 追加: `import { moveBackForUndo } from '../UndoManager/moveBack.js';`

`reorderBookmark` の undo クロージャ内:
```ts
            let undoIndex = originalIndex ?? 0;
            try {
              const [now] = await chrome.bookmarks.get(source.id);
              if (
                now?.parentId === originalParentId &&
                now.index !== undefined &&
                now.index < undoIndex
              ) {
                undoIndex = undoIndex + 1;
              }
            } catch {
              // フォールバック
            }
            await chrome.bookmarks.move(source.id, {
              parentId: originalParentId,
              index: undoIndex,
            });
```
→
```ts
            await moveBackForUndo(source.id, originalParentId, originalIndex ?? 0);
```

`reorderFolder` の undo クロージャ内（`// Undo 時、source の現在位置によって…` のコメントから `await chrome.bookmarks.move(folderId, {...});` まで）:
→
```ts
            await moveBackForUndo(folderId, originalParentId, originalIndex ?? 0);
```

- [ ] **Step 6: 全体チェック → コミット**

Run: `grep -n "undoIndex" src/components/BookmarkDragAndDrop/index.ts` → ヒットなし。全体チェックコマンド → すべて成功（`test/bookmark-reorder-dnd.test.ts` と `test/folder-reorder.test.ts` の Undo テストが通ること）

```bash
git add -A
git commit -m "Undo の move index 補正を UndoManager/moveBack.ts に集約"
```

---

### Task 8: favicon 遅延読み込みを `scripts/favicon.ts` に集約する (B-1)

**Files:**
- Create: `src/scripts/favicon.ts`
- Test: `test/favicon-loader.test.ts`
- Modify: `src/scripts/newtab.ts:144-193`, `src/components/HistoryPanel/HistoryPanel.ts`, `src/components/RecentlyClosedPanel/RecentlyClosedPanel.ts`, `src/components/CalendarHistoryPanel/CalendarHistoryPanel.ts`, `src/components/BookmarkItem/BookmarkItemRenderer.ts:19`
- Test（修正）: `test/history-panel.test.ts`, `test/calendar-history-panel.test.ts`

**Interfaces:**
- Produces: `loadFavicons(container: ParentNode, imgSelector: string, urlAttr?: string): Promise<void>`（`urlAttr` 既定 `'data-favicon-url'`）
- マークアップ規約: `<img class="… hidden" data-favicon-url="…">` と `.favicon-placeholder` は**同じ親要素**の直下に置く

- [ ] **Step 1: 失敗するテストを書く**

`test/favicon-loader.test.ts`:
```ts
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFavicons } from '../src/scripts/favicon';
import { getFavicon } from '../src/scripts/utils';

vi.mock('../src/scripts/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/scripts/utils')>();
  return { ...actual, getFavicon: vi.fn() };
});
const mockGetFavicon = vi.mocked(getFavicon);

describe('loadFavicons', () => {
  let dom: JSDOM;
  let container: HTMLElement;

  beforeEach(() => {
    mockGetFavicon.mockReset();
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="c"></div></body></html>');
    container = dom.window.document.getElementById('c') as HTMLElement;
    container.innerHTML = `
      <div class="icon">
        <span class="favicon-placeholder">🔗</span>
        <img class="fav hidden" data-favicon-url="https://a.example" alt="">
      </div>
      <div class="icon">
        <img class="fav hidden" data-favicon-url="" alt="">
        <span class="favicon-placeholder">🔗</span>
      </div>`;
  });

  afterEach(() => {
    dom.window.close();
  });

  it('URL のある img だけ getFavicon を呼び、onload で表示を切り替える', async () => {
    mockGetFavicon.mockResolvedValue('data:image/png;base64,ok');

    await loadFavicons(container, '.fav');

    expect(mockGetFavicon).toHaveBeenCalledTimes(1);
    expect(mockGetFavicon).toHaveBeenCalledWith('https://a.example');

    const [img] = Array.from(container.querySelectorAll<HTMLImageElement>('.fav'));
    const placeholder = img.parentElement?.querySelector('.favicon-placeholder') as HTMLElement;
    expect(img.src).toBe('data:image/png;base64,ok');

    img.onload?.({} as Event);
    expect(img.classList.contains('hidden')).toBe(false);
    expect(placeholder.style.display).toBe('none');

    img.onerror?.({} as Event);
    expect(placeholder.textContent).toBe('🌐');
    expect(placeholder.style.display).toBe('');
  });

  it('getFavicon が失敗したら placeholder を 🌐 にして表示する', async () => {
    mockGetFavicon.mockRejectedValue(new Error('no favicon'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await loadFavicons(container, '.fav');

    const placeholder = container.querySelector('.favicon-placeholder') as HTMLElement;
    expect(placeholder.textContent).toBe('🌐');
    expect(placeholder.style.display).toBe('');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('urlAttr を指定すると別の属性から URL を読む', async () => {
    mockGetFavicon.mockResolvedValue('data:image/png;base64,ok');
    container.innerHTML = `<div><img class="fav hidden" data-domain-url="https://d.example"><span class="favicon-placeholder">🌐</span></div>`;

    await loadFavicons(container, '.fav', 'data-domain-url');

    expect(mockGetFavicon).toHaveBeenCalledWith('https://d.example');
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run test/favicon-loader.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

`src/scripts/favicon.ts`:
```ts
import { getFavicon } from './utils.js';

/**
 * container 内の favicon 画像を非同期に読み込む。
 *
 * - `imgSelector` にマッチする img の `urlAttr` 属性からページ URL を取る（空なら何もしない）
 * - プレースホルダは img と同じ親要素の直下にある `.favicon-placeholder`
 *   （img 一覧と placeholder 一覧を index で突き合わせる方式はマークアップ変更で
 *   静かにズレるため採らない）
 * - 読み込み成功で img を表示し placeholder を隠す。失敗時は placeholder に 🌐 を出す
 *   （表示スタイルは CSS に任せ、inline の display 値を空に戻すだけ）
 */
export async function loadFavicons(
  container: ParentNode,
  imgSelector: string,
  urlAttr = 'data-favicon-url'
): Promise<void> {
  const images = Array.from(
    container.querySelectorAll<HTMLImageElement>(imgSelector)
  );

  await Promise.allSettled(
    images.map(async (img) => {
      const url = img.getAttribute(urlAttr);
      if (!url) return;

      const placeholder =
        img.parentElement?.querySelector<HTMLElement>('.favicon-placeholder') ??
        null;
      const showPlaceholder = () => {
        if (!placeholder) return;
        placeholder.textContent = '🌐';
        placeholder.style.display = '';
      };

      try {
        const faviconUrl = await getFavicon(url);
        img.onload = () => {
          img.classList.remove('hidden');
          if (placeholder) placeholder.style.display = 'none';
        };
        img.onerror = showPlaceholder;
        img.src = faviconUrl;
      } catch (error) {
        console.warn('Favicon 読み込みエラー:', url, error);
        showPlaceholder();
      }
    })
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run test/favicon-loader.test.ts`
Expected: PASS

- [ ] **Step 5: 各所の属性名を `data-favicon-url` に揃える**

- `src/components/BookmarkItem/BookmarkItemRenderer.ts` 19 行目: `<img class="bookmark-favicon hidden" alt="" data-bookmark-url="${safeUrl}">` → `<img class="bookmark-favicon hidden" alt="" data-favicon-url="${safeUrl}">`
- `src/components/HistoryPanel/HistoryPanel.ts` `renderHistoryItem`: `data-history-url="${safeUrl}"` → `data-favicon-url="${safeUrl}"`
- `src/components/RecentlyClosedPanel/RecentlyClosedPanel.ts` `renderItem`: `data-tab-url="${safeUrl}"` → `data-favicon-url="${safeUrl}"`
- `src/components/CalendarHistoryPanel/CalendarHistoryPanel.ts` `renderTimelineItem`: `data-timeline-url="${safeUrl}"` → `data-favicon-url="${safeUrl}"`
- 同 `renderHourGroup` のドメイン統計: `<img class="domain-favicon hidden" data-domain="${safeDomain}" alt="favicon">` → `<img class="domain-favicon hidden" data-favicon-url="https://${safeDomain}" alt="favicon">`

Run: `grep -rn "data-bookmark-url\|data-history-url\|data-tab-url\|data-timeline-url\|data-domain=" src test`
Expected: `src` 側のヒットは `.bookmark-item` / ボタンの `data-bookmark-url`（識別用。favicon の img 以外）のみ。test 側のヒットは次の Step で直す

- [ ] **Step 6: 5 つのローダーを置換する**

`src/scripts/newtab.ts`:
- import 追加: `import { loadFavicons } from './favicon.js';`
- `import { applyExpandedState, filterBookmarks, getFavicon, processBookmarkTree } from './utils.js';` から `getFavicon` を外す
- `displayBookmarks` 末尾 `await loadFavicons(bookmarkContainer);` → `await loadFavicons(bookmarkContainer, '.bookmark-favicon');`
- 148-193 行目の `async function loadFavicons(container?: HTMLElement)` 関数全体と JSDoc を削除

`src/components/HistoryPanel/HistoryPanel.ts`:
- import: `import { loadFavicons } from '../../scripts/favicon.js';`、`getFavicon` の import を外す
- `renderHistory` 末尾 `this.loadFavicons();` → `void loadFavicons(this.container, '.history-favicon');`
- `private async loadFavicons()` メソッドを削除

`src/components/RecentlyClosedPanel/RecentlyClosedPanel.ts`:
- import: `import { loadFavicons } from '../../scripts/favicon.js';`、`getFavicon` の import を外す
- `render` 末尾 `void this.loadFavicons();` → `void loadFavicons(this.container, '.history-favicon');`
- `private async loadFavicons()` メソッドを削除

`src/components/CalendarHistoryPanel/CalendarHistoryPanel.ts`:
- import: `import { loadFavicons } from '../../scripts/favicon.js';`、`getFavicon` の import を外す
- `renderTimeline` 末尾:
  ```ts
    this.loadTimelineFavicons();
    this.loadDomainFavicons();
  ```
  →
  ```ts
    void loadFavicons(this.container, '.timeline-favicon');
    void loadFavicons(this.container, '.domain-favicon');
  ```
- `private async loadTimelineFavicons()` と `private async loadDomainFavicons()` を削除

- [ ] **Step 7: テストの属性名と display 期待値を更新する**

`test/history-panel.test.ts`:
- `getAttribute('data-history-url')` → `getAttribute('data-favicon-url')`（3 箇所。テスト名の「data-history-url が空の…」も「data-favicon-url が空の…」に）
- `expect(placeholder?.style.display).toBe('block');` と `expect(placeholder.style.display).toBe('block');` → `toBe('')`

`test/calendar-history-panel.test.ts`:
- `expect(placeholder.style.display).toBe('block');` → `toBe('')`
- `expect(placeholder.style.display).toBe('inline-block');` → `toBe('')`
- `expect(timelinePlaceholder.style.display).toBe('block');` → `toBe('')`
- `expect(domainPlaceholder.style.display).toBe('inline-block');` → `toBe('')`

Run: `npx vitest run test/history-panel.test.ts test/calendar-history-panel.test.ts test/recently-closed-panel.test.ts`
Expected: PASS

- [ ] **Step 8: 全体チェック → コミット**

Run: `grep -rn "Favicon 読み込みエラー" src` → `src/scripts/favicon.ts` の 1 箇所のみ。全体チェックコマンド → すべて成功

```bash
git add -A
git commit -m "favicon の遅延読み込みを scripts/favicon.ts に集約し data-favicon-url に統一"
```

---

### Task 9: 履歴系 3 パネルの描画を `components/HistoryList/` に統一する (B-6)

**Files:**
- Create: `src/components/HistoryList/index.ts`
- Test: `test/history-list.test.ts`
- Modify: `src/components/HistoryPanel/HistoryPanel.ts`, `src/components/RecentlyClosedPanel/RecentlyClosedPanel.ts`, `src/components/CalendarHistoryPanel/CalendarHistoryPanel.ts`, `src/styles.css`
- Test（修正）: `test/calendar-history-panel.test.ts`

**Interfaces:**
- Consumes: Task 8 の `loadFavicons`、`scripts/utils.ts` の `escapeHtml`
- Produces:
  ```ts
  interface HistoryListItemView { url: string; title: string; subtitle: string; meta: Array<{ className: string; text: string }>; attributes?: Record<string, string>; }
  renderHistoryListItem(view: HistoryListItemView): string
  formatDateTime(epochMs: number): string          // 'YYYY/M/D HH:MM'
  formatTimeWithSeconds(epochMs: number): string   // 'HH:MM:SS'
  matchesSearchTerm(item: { title: string; url: string }, term: string): boolean
  ```
- マークアップ: `.history-item > .history-item-icon(.history-favicon[data-favicon-url] + .favicon-placeholder) + .history-item-content(.history-item-title[data-url] + .history-item-url + .history-item-meta)`

- [ ] **Step 1: 失敗するテストを書く**

`test/history-list.test.ts`:
```ts
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  formatTimeWithSeconds,
  matchesSearchTerm,
  renderHistoryListItem,
} from '../src/components/HistoryList/index';

function render(html: string): HTMLElement {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`);
  return dom.window.document.body;
}

describe('renderHistoryListItem', () => {
  it('title / url / meta をエスケープして描画する', () => {
    const body = render(
      renderHistoryListItem({
        url: 'https://example.com/?a=1&b=2',
        title: '<img src=x onerror=alert(1)>',
        subtitle: 'example.com',
        meta: [
          { className: 'history-item-date', text: '2022/1/1 09:00' },
          { className: 'history-item-count', text: '訪問回数: 5' },
        ],
      })
    );

    const item = body.querySelector('.history-item') as HTMLElement;
    expect(item).not.toBeNull();
    expect(item.querySelector('.history-item-title img')).toBeNull();
    expect(item.querySelector('.history-item-title')?.textContent).toBe(
      '<img src=x onerror=alert(1)>'
    );
    expect(item.querySelector('.history-item-title')?.getAttribute('data-url')).toBe(
      'https://example.com/?a=1&b=2'
    );
    expect(item.querySelector('.history-favicon')?.getAttribute('data-favicon-url')).toBe(
      'https://example.com/?a=1&b=2'
    );
    expect(item.querySelector('.history-item-url')?.textContent).toBe('example.com');
    expect(item.querySelector('.history-item-date')?.textContent).toBe('2022/1/1 09:00');
    expect(item.querySelector('.history-item-count')?.textContent).toBe('訪問回数: 5');
  });

  it('meta が空なら .history-item-meta を描画しない', () => {
    const body = render(
      renderHistoryListItem({ url: 'https://a', title: 'A', subtitle: 'a', meta: [] })
    );
    expect(body.querySelector('.history-item-meta')).toBeNull();
  });

  it('attributes をルート要素に付与する', () => {
    const body = render(
      renderHistoryListItem({
        url: 'https://a',
        title: 'A',
        subtitle: 'a',
        meta: [],
        attributes: { 'data-session-id': 's"1' },
      })
    );
    expect(body.querySelector('.history-item')?.getAttribute('data-session-id')).toBe('s"1');
  });
});

describe('formatDateTime / formatTimeWithSeconds', () => {
  it('日付 時刻 の形式で返す', () => {
    expect(formatDateTime(1640995200000)).toMatch(/^\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{2}$/);
  });

  it('秒付き時刻を返す', () => {
    expect(formatTimeWithSeconds(1640995200000)).toMatch(/^\d{1,2}:\d{2}:\d{2}$/);
  });
});

describe('matchesSearchTerm', () => {
  const item = { title: 'GitHub Home', url: 'https://github.com' };

  it('空・空白のみの検索語は常に一致', () => {
    expect(matchesSearchTerm(item, '')).toBe(true);
    expect(matchesSearchTerm(item, '   ')).toBe(true);
  });

  it('title または url に大文字小文字を無視して部分一致', () => {
    expect(matchesSearchTerm(item, 'github')).toBe(true);
    expect(matchesSearchTerm(item, 'HOME')).toBe(true);
    expect(matchesSearchTerm(item, 'gitlab')).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run test/history-list.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

`src/components/HistoryList/index.ts`:
```ts
import { escapeHtml } from '../../scripts/utils.js';

/**
 * 履歴系パネル（最近の履歴 / 最近閉じたタブ / カレンダーのタイムライン）で
 * 共通に使う 1 行分の表示データ。
 */
export interface HistoryListItemView {
  /** クリック先 URL（title の data-url と favicon の data-favicon-url に使う） */
  url: string;
  title: string;
  /** URL 行に表示する文字列（URL 全体 or ドメイン） */
  subtitle: string;
  /** メタ行。空なら描画しない */
  meta: Array<{ className: string; text: string }>;
  /** ルート要素に付ける追加属性（例: data-session-id）。値はエスケープされる */
  attributes?: Record<string, string>;
}

/**
 * 履歴アイテム 1 件の HTML を返す。favicon は loadFavicons(container, '.history-favicon') で読み込む。
 */
export function renderHistoryListItem(view: HistoryListItemView): string {
  const safeUrl = escapeHtml(view.url);
  const attrs = Object.entries(view.attributes ?? {})
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join('');
  const metaHtml =
    view.meta.length > 0
      ? `<div class="history-item-meta">${view.meta
          .map(
            (m) => `<span class="${m.className}">${escapeHtml(m.text)}</span>`
          )
          .join('')}</div>`
      : '';

  return `
      <div class="history-item"${attrs}>
        <div class="history-item-icon">
          <img class="history-favicon hidden" data-favicon-url="${safeUrl}" alt="favicon">
          <span class="favicon-placeholder">🌐</span>
        </div>
        <div class="history-item-content">
          <a href="#" class="history-item-title" data-url="${safeUrl}">${escapeHtml(view.title)}</a>
          <div class="history-item-url">${escapeHtml(view.subtitle)}</div>${metaHtml}
        </div>
      </div>
    `;
}

/** 'YYYY/M/D HH:MM'（ja-JP ロケール） */
export function formatDateTime(epochMs: number): string {
  const date = new Date(epochMs);
  return `${date.toLocaleDateString('ja-JP')} ${date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/** 'HH:MM:SS'（ja-JP ロケール） */
export function formatTimeWithSeconds(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** title または url に検索語が大文字小文字を無視して部分一致するか。空の検索語は常に一致 */
export function matchesSearchTerm(
  item: { title: string; url: string },
  term: string
): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return (
    item.title.toLowerCase().includes(needle) ||
    item.url.toLowerCase().includes(needle)
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run test/history-list.test.ts`
Expected: PASS

- [ ] **Step 5: HistoryPanel を置換する**

`src/components/HistoryPanel/HistoryPanel.ts`:
- import を次に:
  ```ts
  import { getRecentHistory, type HistoryItem } from '../../scripts/history.js';
  import { loadFavicons } from '../../scripts/favicon.js';
  import {
    formatDateTime,
    matchesSearchTerm,
    renderHistoryListItem,
  } from '../HistoryList/index.js';
  ```
  （`escapeHtml` の import は不要になるので外す）
- `renderHistoryItem` を次に置換:
  ```ts
  private renderHistoryItem(item: HistoryItem): string {
    return renderHistoryListItem({
      url: item.url,
      title: item.title,
      subtitle: item.url,
      meta: [
        { className: 'history-item-date', text: formatDateTime(item.lastVisitTime) },
        { className: 'history-item-count', text: `訪問回数: ${item.visitCount}` },
      ],
    });
  }
  ```
- `filterHistory` を次に置換:
  ```ts
  private filterHistory(searchTerm: string): void {
    this.filteredHistoryItems = this.historyItems.filter((item) =>
      matchesSearchTerm(item, searchTerm)
    );
    this.renderHistory();
  }
  ```

- [ ] **Step 6: RecentlyClosedPanel を置換する**

`src/components/RecentlyClosedPanel/RecentlyClosedPanel.ts`:
- import を次に:
  ```ts
  import { loadFavicons } from '../../scripts/favicon.js';
  import { formatDateTime, renderHistoryListItem } from '../HistoryList/index.js';
  ```
  （`escapeHtml` の import は不要になるので外す。`getDomain` は不正 URL で `localhost` を返し、既存挙動「不正 URL は URL をそのまま表示」と異なるため使わない）
- `renderItem` を次に置換:
  ```ts
  private renderItem(tab: RecentlyClosedTab): string {
    let domain: string;
    try {
      domain = new URL(tab.url).hostname;
    } catch {
      domain = tab.url;
    }
    return renderHistoryListItem({
      url: tab.url,
      title: tab.title,
      subtitle: domain,
      // 閉じた時刻（履歴パネルと同じ体裁）。無ければメタ行なし
      meta: tab.closedAt
        ? [{ className: 'history-item-date', text: formatDateTime(tab.closedAt) }]
        : [],
      attributes: { 'data-session-id': tab.sessionId },
    });
  }
  ```

- [ ] **Step 7: CalendarHistoryPanel を置換する**

`src/components/CalendarHistoryPanel/CalendarHistoryPanel.ts`:
- import に追加:
  ```ts
  import {
    formatTimeWithSeconds,
    matchesSearchTerm,
    renderHistoryListItem,
  } from '../HistoryList/index.js';
  ```
  （`escapeHtml` はドメイン統計で引き続き使うので残す）
- `setupEventListeners` のクリック委譲 `closest('.timeline-item-title')` → `closest('.history-item-title')`
- `renderTimeline` の検索フィルタ:
  ```ts
    let items = dayHistory.items;
    if (this.searchTerm.trim()) {
      const lowercaseSearchTerm = this.searchTerm.toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(lowercaseSearchTerm) ||
          item.url.toLowerCase().includes(lowercaseSearchTerm)
      );
    }
  ```
  →
  ```ts
    const items = dayHistory.items.filter((item) =>
      matchesSearchTerm(item, this.searchTerm)
    );
  ```
- `renderTimeline` 末尾の `void loadFavicons(this.container, '.timeline-favicon');` → `void loadFavicons(this.container, '.history-favicon');`
- `renderTimelineItem` を次に置換:
  ```ts
  private renderTimelineItem(item: HistoryItem): string {
    return renderHistoryListItem({
      url: item.url,
      title: item.title,
      subtitle: item.url,
      meta: [
        { className: 'history-item-date', text: formatTimeWithSeconds(item.lastVisitTime) },
        { className: 'history-item-count', text: `訪問回数: ${item.visitCount}` },
      ],
    });
  }
  ```

- [ ] **Step 8: CSS を更新する**

`src/styles.css`:
- `.timeline-domain-stats .favicon-placeholder,\n.timeline-item-icon .favicon-placeholder {` → `.timeline-domain-stats .favicon-placeholder {`
- `.timeline-item { ... }` から `.timeline-favicon.hidden { ... }` までのブロック（`.timeline-item`, `.timeline-item:hover`, `.timeline-item-icon`, `.timeline-item-content`, `.timeline-item-title`, `.timeline-item-title:hover`, `.timeline-item-url`, `.timeline-item-meta`, `.timeline-item-time`, `.timeline-item-count`, `.timeline-favicon`, `.timeline-favicon.hidden`）を削除し、同じ位置に次を置く:
  ```css
  /* タイムライン内の履歴アイテムはコンパクト表示（.history-item の共通マークアップにスコープ付きで上書き） */
  .history-timeline .history-item {
    padding: 12px;
    background: var(--surface-2);
    box-shadow: none;
    transition: background-color var(--transition);
  }

  .history-timeline .history-item:hover {
    transform: none;
    box-shadow: none;
  }

  .history-timeline .history-item-icon,
  .history-timeline .history-favicon {
    width: 16px;
    height: 16px;
  }

  .history-timeline .history-item-icon .favicon-placeholder {
    display: inline-flex;
    width: 16px;
    height: 16px;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    flex-shrink: 0;
  }

  .history-timeline .history-favicon {
    border-radius: 3px;
  }

  .history-timeline .history-item-title {
    font-size: 13px;
  }

  .history-timeline .history-item-url {
    font-size: 11px;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .history-timeline .history-item-meta {
    font-size: 10px;
  }
  ```

- [ ] **Step 9: カレンダーのテストのセレクタを更新する**

`test/calendar-history-panel.test.ts` で置換:
```bash
sed -i '' \
  -e "s/'\.timeline-item-title img'/'.history-item-title img'/g" \
  -e "s/'\.timeline-item-title'/'.history-item-title'/g" \
  -e "s/'\.timeline-item'/'.history-item'/g" \
  -e "s/'\.timeline-favicon'/'.history-favicon'/g" \
  -e "s/'\.timeline-item-icon \.favicon-placeholder'/'.history-item-icon .favicon-placeholder'/g" \
  test/calendar-history-panel.test.ts
```

Run: `grep -n "timeline-item\|timeline-favicon" test/*.ts src/components/*/*.ts src/styles.css`
Expected: ヒットなし

- [ ] **Step 10: 全体チェック → コミット**

Run: `npx vitest run test/history-panel.test.ts test/recently-closed-panel.test.ts test/calendar-history-panel.test.ts test/newtab-integration.test.ts` → PASS。全体チェックコマンド → すべて成功

```bash
git add -A
git commit -m "履歴系 3 パネルの描画を components/HistoryList に統一し timeline-item 系マークアップを廃止"
```

---

### Task 10: `components/Dialog/` を新設する (C-1)

**Files:**
- Create: `src/components/Dialog/index.ts`
- Test: `test/dialog.test.ts`

**Interfaces:**
- Consumes: `scripts/utils.ts` の `escapeHtml`
- Produces:
  ```ts
  interface DialogButton { label: string; className: string; onClick: (close: () => void) => void; autofocus?: boolean; }
  interface DialogOptions { id: string; title: string; bodyHtml: string; buttons: DialogButton[]; onClose?: () => void; }
  interface DialogHandle { element: HTMLElement; close: () => void; }
  openDialog(options: DialogOptions): DialogHandle
  confirmDialog(options: { id: string; title: string; bodyHtml: string; confirmLabel: string; confirmClassName: string }): Promise<boolean>
  alertDialog(options: { id: string; title: string; bodyHtml: string }): Promise<void>
  showDialogError(handle: DialogHandle | null, message: string): void   // bodyHtml 内の .dialog-error に表示
  ```
- 生成マークアップ: `<div id={id} class="edit-dialog-overlay"><div class="edit-dialog" role="dialog" aria-modal="true"><div class="edit-dialog-header"><h3>{title}</h3><button class="edit-dialog-close" type="button">×</button></div><div class="edit-dialog-content">{bodyHtml}</div><div class="edit-dialog-actions">{buttons}</div></div></div>`

- [ ] **Step 1: 失敗するテストを書く**

`test/dialog.test.ts`:
```ts
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alertDialog,
  confirmDialog,
  openDialog,
  showDialogError,
} from '../src/components/Dialog/index';

describe('Dialog', () => {
  let dom: JSDOM;
  let doc: Document;

  function keydownCount(): { active: () => number; restore: () => void } {
    const active = new Set<EventListenerOrEventListenerObject>();
    const realAdd = doc.addEventListener.bind(doc);
    const realRemove = doc.removeEventListener.bind(doc);
    doc.addEventListener = ((type: string, l: EventListenerOrEventListenerObject, o?: unknown) => {
      if (type === 'keydown') active.add(l);
      return realAdd(type, l, o as AddEventListenerOptions);
    }) as typeof doc.addEventListener;
    doc.removeEventListener = ((type: string, l: EventListenerOrEventListenerObject, o?: unknown) => {
      if (type === 'keydown') active.delete(l);
      return realRemove(type, l, o as EventListenerOptions);
    }) as typeof doc.removeEventListener;
    return {
      active: () => active.size,
      restore: () => {
        doc.addEventListener = realAdd;
        doc.removeEventListener = realRemove;
      },
    };
  }

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'chrome-extension://test/newtab.html',
    });
    doc = dom.window.document;
    Object.defineProperty(globalThis, 'document', { value: doc, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'KeyboardEvent', { value: dom.window.KeyboardEvent, writable: true, configurable: true });
  });

  afterEach(() => {
    dom.window.close();
  });

  it('overlay / role=dialog / タイトル / ボタンを描画する', () => {
    openDialog({
      id: 'x-dialog',
      title: 'タイトル <b>',
      bodyHtml: '<p class="body">本文</p>',
      buttons: [{ label: 'OK', className: 'x-ok', onClick: (close) => close() }],
    });

    const overlay = doc.getElementById('x-dialog') as HTMLElement;
    expect(overlay.classList.contains('edit-dialog-overlay')).toBe(true);
    expect(overlay.querySelector('.edit-dialog')?.getAttribute('role')).toBe('dialog');
    expect(overlay.querySelector('h3')?.textContent).toBe('タイトル <b>');
    expect(overlay.querySelector('.edit-dialog-content .body')?.textContent).toBe('本文');
    expect(overlay.querySelector('.edit-dialog-actions .x-ok')?.textContent).toBe('OK');
  });

  it('× / ESC / close() のどれで閉じても keydown が解除され onClose は 1 回だけ', () => {
    const onClose = vi.fn();
    const tracker = keydownCount();

    const h1 = openDialog({ id: 'd1', title: 't', bodyHtml: '', buttons: [], onClose });
    expect(tracker.active()).toBe(1);
    (doc.querySelector('#d1 .edit-dialog-close') as HTMLElement).click();
    expect(doc.getElementById('d1')).toBeNull();
    expect(tracker.active()).toBe(0);
    h1.close();
    expect(onClose).toHaveBeenCalledTimes(1);

    openDialog({ id: 'd2', title: 't', bodyHtml: '', buttons: [], onClose });
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(doc.getElementById('d2')).toBeNull();
    expect(tracker.active()).toBe(0);
    expect(onClose).toHaveBeenCalledTimes(2);

    tracker.restore();
  });

  it('開くときに既存の overlay をすべて除去する', () => {
    openDialog({ id: 'a', title: 't', bodyHtml: '', buttons: [] });
    openDialog({ id: 'b', title: 't', bodyHtml: '', buttons: [] });
    expect(doc.querySelectorAll('.edit-dialog-overlay')).toHaveLength(1);
    expect(doc.getElementById('a')).toBeNull();
  });

  it('ボタンの onClick は close を受け取り、呼ばなければ開いたまま', () => {
    let calls = 0;
    openDialog({
      id: 'k',
      title: 't',
      bodyHtml: '',
      buttons: [{ label: 'stay', className: 'stay', onClick: () => { calls++; } }],
    });
    (doc.querySelector('.stay') as HTMLElement).click();
    expect(calls).toBe(1);
    expect(doc.getElementById('k')).not.toBeNull();
  });

  it('autofocus のボタンにフォーカスする', () => {
    openDialog({
      id: 'f',
      title: 't',
      bodyHtml: '',
      buttons: [
        { label: 'a', className: 'a', onClick: (c) => c() },
        { label: 'b', className: 'b', autofocus: true, onClick: (c) => c() },
      ],
    });
    expect(doc.activeElement?.classList.contains('b')).toBe(true);
  });

  it('confirmDialog は確定で true、キャンセル / ESC で false', async () => {
    const p1 = confirmDialog({ id: 'c', title: 't', bodyHtml: '', confirmLabel: '削除', confirmClassName: 'go' });
    (doc.querySelector('#c .go') as HTMLElement).click();
    await expect(p1).resolves.toBe(true);

    const p2 = confirmDialog({ id: 'c', title: 't', bodyHtml: '', confirmLabel: '削除', confirmClassName: 'go' });
    expect(doc.activeElement?.classList.contains('edit-dialog-cancel')).toBe(true);
    (doc.querySelector('#c .edit-dialog-cancel') as HTMLElement).click();
    await expect(p2).resolves.toBe(false);

    const p3 = confirmDialog({ id: 'c', title: 't', bodyHtml: '', confirmLabel: '削除', confirmClassName: 'go' });
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(p3).resolves.toBe(false);
  });

  it('alertDialog は OK（.edit-dialog-cancel）で解決する', async () => {
    const p = alertDialog({ id: 'e', title: 'エラー', bodyHtml: '<p>x</p>' });
    (doc.querySelector('#e .edit-dialog-cancel') as HTMLElement).click();
    await expect(p).resolves.toBeUndefined();
    expect(doc.getElementById('e')).toBeNull();
  });

  it('showDialogError は .dialog-error にメッセージを表示する', () => {
    const h = openDialog({
      id: 'err',
      title: 't',
      bodyHtml: '<div class="dialog-error" style="display:none"></div>',
      buttons: [],
    });
    showDialogError(h, '失敗しました');
    const el = doc.querySelector('#err .dialog-error') as HTMLElement;
    expect(el.textContent).toBe('失敗しました');
    expect(el.style.display).toBe('block');
    // null ハンドルでも例外にしない
    showDialogError(null, 'x');
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run test/dialog.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

`src/components/Dialog/index.ts`:
```ts
import { escapeHtml } from '../../scripts/utils.js';

/**
 * モーダルダイアログの共通基盤。
 *
 * - overlay の生成、×・ESC・ボタンの配線、document の keydown リスナー解除を一手に担う
 *   (#100: どの経路で閉じてもリスナーを残さない)
 * - 同時に開くのは 1 つ。開く前に既存の overlay をすべて除去する
 * - Enter で確定する挙動は持たない。入力欄を持つ呼び出し側が input に keydown を付ける
 */

export interface DialogButton {
  label: string;
  /** ボタンに付与するクラス（既存テストが参照するクラス名をここで維持する） */
  className: string;
  /** クリック時。close を呼ばなければダイアログは開いたまま（バリデーション失敗時など） */
  onClick: (close: () => void) => void;
  /** 開いた直後にフォーカスするか */
  autofocus?: boolean;
}

export interface DialogOptions {
  /** overlay の id（既存テストが参照する id を維持する） */
  id: string;
  title: string;
  bodyHtml: string;
  buttons: DialogButton[];
  /** 閉じられたとき（×・ESC・ボタン・close() のどの経路でも 1 回だけ）呼ばれる */
  onClose?: () => void;
}

export interface DialogHandle {
  element: HTMLElement;
  close: () => void;
}

export function openDialog(options: DialogOptions): DialogHandle {
  for (const existing of document.querySelectorAll('.edit-dialog-overlay')) {
    existing.remove();
  }

  const buttonsHtml = options.buttons
    .map(
      (button, index) =>
        `<button type="button" class="${button.className}" data-dialog-button="${index}">${escapeHtml(button.label)}</button>`
    )
    .join('');

  document.body.insertAdjacentHTML(
    'beforeend',
    `
      <div id="${options.id}" class="edit-dialog-overlay">
        <div class="edit-dialog" role="dialog" aria-modal="true">
          <div class="edit-dialog-header">
            <h3>${escapeHtml(options.title)}</h3>
            <button class="edit-dialog-close" type="button">×</button>
          </div>
          <div class="edit-dialog-content">${options.bodyHtml}</div>
          <div class="edit-dialog-actions">${buttonsHtml}</div>
        </div>
      </div>
    `
  );

  const element = document.getElementById(options.id) as HTMLElement;
  let closed = false;

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown);
    element.remove();
    options.onClose?.();
  };

  document.addEventListener('keydown', onKeydown);
  element
    .querySelector('.edit-dialog-close')
    ?.addEventListener('click', () => close());

  options.buttons.forEach((button, index) => {
    const el = element.querySelector<HTMLElement>(
      `[data-dialog-button="${index}"]`
    );
    el?.addEventListener('click', () => button.onClick(close));
    if (button.autofocus) el?.focus();
  });

  return { element, close };
}

/**
 * キャンセル / 確定の 2 ボタン確認ダイアログ。確定で true、それ以外で false。
 * 開いた直後はキャンセルにフォーカスする（誤操作防止 + a11y）。
 */
export function confirmDialog(options: {
  id: string;
  title: string;
  bodyHtml: string;
  confirmLabel: string;
  confirmClassName: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let confirmed = false;
    openDialog({
      id: options.id,
      title: options.title,
      bodyHtml: options.bodyHtml,
      buttons: [
        {
          label: 'キャンセル',
          className: 'edit-dialog-cancel',
          autofocus: true,
          onClick: (close) => close(),
        },
        {
          label: options.confirmLabel,
          className: options.confirmClassName,
          onClick: (close) => {
            confirmed = true;
            close();
          },
        },
      ],
      onClose: () => resolve(confirmed),
    });
  });
}

/**
 * OK ボタンだけの通知ダイアログ。閉じられたら解決する。
 * OK ボタンのクラスは既存テストとの互換のため edit-dialog-cancel。
 */
export function alertDialog(options: {
  id: string;
  title: string;
  bodyHtml: string;
}): Promise<void> {
  return new Promise((resolve) => {
    openDialog({
      id: options.id,
      title: options.title,
      bodyHtml: options.bodyHtml,
      buttons: [
        {
          label: 'OK',
          className: 'edit-dialog-cancel',
          onClick: (close) => close(),
        },
      ],
      onClose: () => resolve(),
    });
  });
}

/**
 * bodyHtml 内の .dialog-error にエラーメッセージを表示する（ダイアログは開いたまま）。
 */
export function showDialogError(
  handle: DialogHandle | null,
  message: string
): void {
  const el = handle?.element.querySelector<HTMLElement>('.dialog-error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run test/dialog.test.ts`
Expected: PASS

- [ ] **Step 5: 全体チェック → コミット**

Run: 全体チェックコマンド → すべて成功

```bash
git add -A
git commit -m "モーダルダイアログの共通基盤 components/Dialog を追加"
```

---

### Task 11: 確認・通知ダイアログ 6 箇所を Dialog に移行する (C-2)

**Files:**
- Modify: `src/components/BookmarkActions/BookmarkDeleter.ts`, `FolderDeleter.ts`, `TabGroupOpener.ts`, `src/components/BookmarkSelection/BookmarkSelection.ts`
- Test（修正）: `test/listener-leak.test.ts`

**Interfaces:**
- Consumes: Task 10 の `confirmDialog` / `alertDialog`
- 維持するメソッド名（テストが private 呼び出しする）: `BookmarkSelection.showConfirmDialog(message, title)`, `BookmarkSelection.showMoveDialog(folders, count)`（後者は Task 12）, `TabGroupOpener.confirmManyTabs(count, folderName)`

- [ ] **Step 1: テストが private メソッド経由で触る箇所を確認する**

Run: `grep -n "setupDeleteDialogEvents\|setupErrorDialogEvents\|setupDialogEvents\|setupEditDialogEvents\|closeDialog\|closeEditDialog" test/*.ts`
Expected: `test/listener-leak.test.ts` のみ

- [ ] **Step 2: listener-leak テストの該当 4 件を書き換える**

`test/listener-leak.test.ts` で、`insertDialog` ヘルパーを削除し、次の 4 テストを置換する（DnD のテストと Editor / Creator / Renamer / bulk-move のテストは Task 12 で扱うので触らない）:

```ts
  it('BookmarkDeleter: 削除確認をキャンセルで閉じても keydown が残らない', async () => {
    const deleter = new BookmarkDeleter();
    const tracker = trackDocumentKeydown();
    const p = (
      deleter as unknown as {
        showDeleteConfirmation: (t: string) => Promise<boolean>;
      }
    ).showDeleteConfirmation('t');
    expect(tracker.activeCount()).toBe(1);
    click('#delete-dialog .edit-dialog-cancel');
    await expect(p).resolves.toBe(false);
    expect(tracker.activeCount()).toBe(0);
    tracker.restore();
  });

  it('BookmarkDeleter: エラーダイアログを OK で閉じても keydown が残らない', async () => {
    const deleter = new BookmarkDeleter();
    const tracker = trackDocumentKeydown();
    const p = (
      deleter as unknown as { showErrorDialog: (m: string) => Promise<void> }
    ).showErrorDialog('失敗');
    expect(tracker.activeCount()).toBe(1);
    click('#error-dialog .edit-dialog-cancel');
    await p;
    expect(tracker.activeCount()).toBe(0);
    tracker.restore();
  });

  it('FolderDeleter: 削除確認をキャンセルで閉じても keydown が残らない', async () => {
    const deleter = new FolderDeleter();
    const tracker = trackDocumentKeydown();
    const p = (
      deleter as unknown as {
        showConfirmation: (t: string, b: number, f: number) => Promise<boolean>;
      }
    ).showConfirmation('t', 1, 0);
    expect(tracker.activeCount()).toBe(1);
    click('#folder-delete-dialog .edit-dialog-cancel');
    await expect(p).resolves.toBe(false);
    expect(tracker.activeCount()).toBe(0);
    tracker.restore();
  });
```
（`TabGroupOpener` と `BookmarkSelection: 一括削除確認` のテストは呼び出し方が変わらないのでそのまま。ただし `insertDialog` を削除した後に他テストが `insertDialog` を使っていないことを `grep -n insertDialog test/listener-leak.test.ts` で確認する。Task 12 で Editor / Creator / Renamer の 3 テストを書き換えるまで `insertDialog` は残しておく）

- [ ] **Step 3: BookmarkDeleter を移行する**

`src/components/BookmarkActions/BookmarkDeleter.ts`:
- import 追加: `import { alertDialog, confirmDialog } from '../Dialog/index.js';`
- `showDeleteConfirmation` 以降（`createDeleteDialogHTML`, `setupDeleteDialogEvents`, `showErrorDialog`, `createErrorDialogHTML`, `setupErrorDialogEvents`）をすべて次に置換:
  ```ts
  /**
   * 削除確認ダイアログを表示する
   */
  private showDeleteConfirmation(title: string): Promise<boolean> {
    return confirmDialog({
      id: 'delete-dialog',
      title: 'ブックマークを削除',
      bodyHtml: `
            <div class="delete-confirmation-message">
              <p>以下のブックマークを削除しますか？</p>
              <div class="delete-bookmark-info">
                <strong>${escapeHtml(title)}</strong>
              </div>
              <p class="delete-warning">この操作は取り消せません。</p>
            </div>
      `,
      confirmLabel: '削除',
      confirmClassName: 'delete-dialog-confirm',
    });
  }

  /**
   * エラーダイアログを表示する
   */
  private showErrorDialog(message: string): Promise<void> {
    return alertDialog({
      id: 'error-dialog',
      title: 'エラー',
      bodyHtml: `
            <div class="error-message">
              <p>❌ ${escapeHtml(message)}</p>
            </div>
      `,
    });
  }
  ```

- [ ] **Step 4: FolderDeleter を移行する**

`src/components/BookmarkActions/FolderDeleter.ts`:
- import 追加: `import { confirmDialog } from '../Dialog/index.js';`
- `showConfirmation` / `createDialogHTML` / `setupDialogEvents` を次に置換:
  ```ts
  private showConfirmation(
    title: string,
    bookmarkCount: number,
    folderCount: number
  ): Promise<boolean> {
    const contentWarning =
      bookmarkCount > 0 || folderCount > 0
        ? `<p class="delete-warning">中の ${bookmarkCount}件のブックマーク${
            folderCount > 0 ? ` と ${folderCount}件のサブフォルダ` : ''
          } も削除されます。</p>`
        : '';

    return confirmDialog({
      id: 'folder-delete-dialog',
      title: 'フォルダを削除',
      bodyHtml: `
            <div class="delete-confirmation-message">
              <p>以下のフォルダを削除しますか？</p>
              <div class="delete-bookmark-info">
                <strong>${escapeHtml(title)}</strong>
              </div>
              ${contentWarning}
            </div>
      `,
      confirmLabel: '削除',
      confirmClassName: 'delete-dialog-confirm folder-delete-confirm',
    });
  }
  ```

- [ ] **Step 5: TabGroupOpener を移行する**

`src/components/BookmarkActions/TabGroupOpener.ts`:
- import 追加: `import { confirmDialog } from '../Dialog/index.js';`
- `confirmManyTabs` / `createConfirmDialogHTML` を次に置換:
  ```ts
  /**
   * 大量タブを開く前の確認ダイアログを表示する。
   */
  private confirmManyTabs(count: number, folderName: string): Promise<boolean> {
    return confirmDialog({
      id: 'tab-group-confirm-dialog',
      title: '多数のタブを開きますか？',
      bodyHtml: `
            <p>「${escapeHtml(folderName)}」内の <strong>${count}件</strong> のブックマークを一度に開きます。</p>
            <p class="delete-warning">処理に時間がかかる場合があります。</p>
      `,
      confirmLabel: '開く',
      confirmClassName: 'edit-dialog-save tab-group-confirm',
    });
  }
  ```

- [ ] **Step 6: BookmarkSelection の一括削除確認を移行する**

`src/components/BookmarkSelection/BookmarkSelection.ts`:
- import 追加: `import { confirmDialog } from '../Dialog/index.js';`（Task 12 で `openDialog` も追加する）
- `showConfirmDialog` を次に置換:
  ```ts
  private showConfirmDialog(message: string, title: string): Promise<boolean> {
    return confirmDialog({
      id: 'bulk-confirm-dialog',
      title,
      bodyHtml: `
              <div class="delete-confirmation-message">
                <p>${escapeHtml(message)}</p>
                <p class="delete-warning">削除後 5 秒以内であれば「元に戻す」で復元できます。</p>
              </div>
      `,
      confirmLabel: '削除',
      confirmClassName: 'delete-dialog-confirm',
    });
  }
  ```

- [ ] **Step 7: 全体チェック → コミット**

Run: `npx vitest run test/listener-leak.test.ts test/bookmark-delete.test.ts test/folder-delete.test.ts test/tab-group-opener.test.ts test/bookmark-selection.test.ts test/folder-events-coverage.test.ts` → PASS。全体チェックコマンド → すべて成功

```bash
git add -A
git commit -m "確認・通知ダイアログを components/Dialog の confirmDialog / alertDialog に移行"
```

---

### Task 12: 入力フォーム系ダイアログ 4 箇所を Dialog に移行する (C-3)

**Files:**
- Modify: `src/components/BookmarkActions/BookmarkEditor.ts`, `FolderCreator.ts`, `FolderRenamer.ts`, `src/components/BookmarkSelection/BookmarkSelection.ts`（`showMoveDialog`）
- Test（修正）: `test/listener-leak.test.ts`

**Interfaces:**
- Consumes: Task 10 の `openDialog` / `showDialogError`、型 `DialogHandle`
- 維持するメソッド名: `BookmarkEditor.showEditDialog(bookmark, folders)`, `FolderCreator.showDialog(folders, defaultParentId?)`, `FolderRenamer.showDialog(target, siblings)`, `BookmarkSelection.showMoveDialog(folders, count)`

- [ ] **Step 1: listener-leak テストの残り 3 件を書き換え、`insertDialog` を削除する**

```ts
  it('BookmarkEditor: 編集ダイアログをキャンセルで閉じても keydown が残らない', () => {
    const editor = new BookmarkEditor();
    const bookmark: ChromeBookmarkNode = {
      id: 'b1',
      title: 't',
      url: 'https://ex.com',
      parentId: '1',
    };
    const tracker = trackDocumentKeydown();
    (
      editor as unknown as {
        showEditDialog: (b: ChromeBookmarkNode, f: ChromeBookmarkNode[]) => void;
      }
    ).showEditDialog(bookmark, [{ id: '1', title: 'bar' }]);
    expect(tracker.activeCount()).toBe(1);
    click('#edit-dialog .edit-dialog-cancel');
    expect(tracker.activeCount()).toBe(0);
    tracker.restore();
  });

  it('FolderCreator: 作成ダイアログをキャンセルで閉じても keydown が残らない', () => {
    const creator = new FolderCreator();
    const tracker = trackDocumentKeydown();
    (
      creator as unknown as {
        showDialog: (f: ChromeBookmarkNode[], p?: string) => void;
      }
    ).showDialog([{ id: '1', title: 'bar' }]);
    expect(tracker.activeCount()).toBe(1);
    click('#folder-create-dialog .edit-dialog-cancel');
    expect(tracker.activeCount()).toBe(0);
    tracker.restore();
  });

  it('FolderRenamer: 名前変更ダイアログをキャンセルで閉じても keydown が残らない', () => {
    const renamer = new FolderRenamer();
    const target: ChromeBookmarkNode = { id: 'f1', title: 'x' };
    const tracker = trackDocumentKeydown();
    (
      renamer as unknown as {
        showDialog: (t: ChromeBookmarkNode, s: ChromeBookmarkNode[]) => void;
      }
    ).showDialog(target, []);
    expect(tracker.activeCount()).toBe(1);
    click('#folder-rename-dialog .edit-dialog-cancel');
    expect(tracker.activeCount()).toBe(0);
    tracker.restore();
  });
```
`function insertDialog(...)` を削除する。Run: `grep -n insertDialog test/listener-leak.test.ts` → ヒットなし

- [ ] **Step 2: BookmarkEditor を移行する**

`src/components/BookmarkActions/BookmarkEditor.ts`:
- import 追加: `import { type DialogHandle, openDialog } from '../Dialog/index.js';`
- フィールド `private editKeydownHandler: ((e: KeyboardEvent) => void) | null = null;` とそのコメントを `private dialog: DialogHandle | null = null;` に置換
- `showEditDialog` / `createDialogHTML` / `setupEditDialogEvents` を次に置換:
  ```ts
  /**
   * 編集ダイアログを表示する
   */
  private showEditDialog(
    bookmark: ChromeBookmarkNode,
    folders: ChromeBookmarkNode[]
  ): void {
    const folderOptions = folders
      .map(
        (folder) => `
        <option value="${escapeHtml(folder.id)}" ${folder.id === bookmark.parentId ? 'selected' : ''}>
          ${escapeHtml(folder.title)}
        </option>
      `
      )
      .join('');

    this.dialog = openDialog({
      id: 'edit-dialog',
      title: 'ブックマークを編集',
      bodyHtml: `
            <div class="edit-form-group">
              <label for="edit-title">名前:</label>
              <input type="text" id="edit-title" value="${escapeHtml(bookmark.title)}" />
            </div>
            <div class="edit-form-group">
              <label for="edit-url">URL:</label>
              <input type="url" id="edit-url" value="${escapeHtml(bookmark.url || '')}" />
            </div>
            <div class="edit-form-group">
              <label for="edit-folder">フォルダー:</label>
              <select id="edit-folder">
                ${folderOptions}
              </select>
            </div>
      `,
      buttons: [
        {
          label: 'キャンセル',
          className: 'edit-dialog-cancel',
          onClick: (close) => close(),
        },
        {
          label: '保存',
          className: 'edit-dialog-save',
          onClick: () => {
            void this.handleSave(bookmark);
          },
        },
      ],
      onClose: () => {
        this.dialog = null;
      },
    });

    // 開いた直後にタイトル入力欄へフォーカス (a11y)
    const titleInput = this.dialog.element.querySelector<HTMLInputElement>(
      '#edit-title'
    );
    titleInput?.focus();
    titleInput?.select();
  }
  ```
- `handleSave` 内の `this.closeEditDialog();` → `this.dialog?.close();`
- `closeEditDialog()` メソッドと JSDoc を削除

- [ ] **Step 3: FolderCreator を移行する**

`src/components/BookmarkActions/FolderCreator.ts`:
- import 追加: `import { type DialogHandle, openDialog, showDialogError } from '../Dialog/index.js';`
- フィールド `private keydownHandler ...` とコメント → `private dialog: DialogHandle | null = null;`
- `showDialog` / `createDialogHTML` / `setupDialogEvents` を次に置換:
  ```ts
  private showDialog(
    folders: ChromeBookmarkNode[],
    defaultParentId?: string
  ): void {
    // ルートフォルダ（id=0 など）は表示用に明示的にラベルを付与する
    const folderOptions = folders
      .map((folder) => {
        const selected = folder.id === defaultParentId ? 'selected' : '';
        const label = folder.title || `(ルート: ${folder.id})`;
        return `<option value="${escapeHtml(folder.id)}" ${selected}>${escapeHtml(label)}</option>`;
      })
      .join('');

    this.dialog = openDialog({
      id: 'folder-create-dialog',
      title: '新しいフォルダを作成',
      bodyHtml: `
            <div class="edit-form-group">
              <label for="folder-create-name">フォルダ名:</label>
              <input type="text" id="folder-create-name" placeholder="新しいフォルダ" />
            </div>
            <div class="edit-form-group">
              <label for="folder-create-parent">親フォルダ:</label>
              <select id="folder-create-parent">
                ${folderOptions}
              </select>
            </div>
            <div class="dialog-error folder-create-error" style="display:none; color: var(--danger); margin-top: 8px;"></div>
      `,
      buttons: [
        {
          label: 'キャンセル',
          className: 'edit-dialog-cancel',
          onClick: (close) => close(),
        },
        {
          label: '作成',
          className: 'edit-dialog-save folder-create-confirm',
          onClick: () => {
            void this.handleConfirm();
          },
        },
      ],
      onClose: () => {
        this.dialog = null;
      },
    });

    const nameInput = this.dialog.element.querySelector<HTMLInputElement>(
      '#folder-create-name'
    );
    nameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.handleConfirm();
      }
    });
    nameInput?.focus();
  }
  ```
- `handleConfirm` 内:
  - `const errorEl = document.querySelector('.folder-create-error') as HTMLElement | null;` の宣言を削除
  - `this.closeDialog();` → `this.dialog?.close();`
  - `this.showError(errorEl, 'フォルダの作成に失敗しました。');` → `showDialogError(this.dialog, 'フォルダの作成に失敗しました。');`
- `showError` メソッドと `closeDialog` メソッドを削除

- [ ] **Step 4: FolderRenamer を移行する**

`src/components/BookmarkActions/FolderRenamer.ts`:
- import 追加: `import { type DialogHandle, openDialog, showDialogError } from '../Dialog/index.js';`
- フィールド `private keydownHandler ...` とコメント → `private dialog: DialogHandle | null = null;`
- `showDialog` / `createDialogHTML` / `setupDialogEvents` を次に置換:
  ```ts
  private showDialog(
    target: ChromeBookmarkNode,
    siblings: ChromeBookmarkNode[]
  ): void {
    this.dialog = openDialog({
      id: 'folder-rename-dialog',
      title: 'フォルダ名を変更',
      bodyHtml: `
            <div class="edit-form-group">
              <label for="folder-rename-name">新しいフォルダ名:</label>
              <input type="text" id="folder-rename-name" value="${escapeHtml(target.title)}" />
            </div>
            <div class="dialog-error folder-rename-error" style="display:none; color: var(--danger); margin-top: 8px;"></div>
      `,
      buttons: [
        {
          label: 'キャンセル',
          className: 'edit-dialog-cancel',
          onClick: (close) => close(),
        },
        {
          label: '保存',
          className: 'edit-dialog-save folder-rename-confirm',
          onClick: () => {
            void this.handleConfirm(target, siblings);
          },
        },
      ],
      onClose: () => {
        this.dialog = null;
      },
    });

    const input = this.dialog.element.querySelector<HTMLInputElement>(
      '#folder-rename-name'
    );
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.handleConfirm(target, siblings);
      }
    });
    input?.focus();
    input?.select();
  }
  ```
- `handleConfirm` 内:
  - `const errorEl = document.querySelector('.folder-rename-error') as HTMLElement | null;` を削除
  - `this.closeDialog();`（2 箇所）→ `this.dialog?.close();`
  - `this.showError(errorEl, '…')`（3 箇所）→ `showDialogError(this.dialog, '…')`
- `showError` と `closeDialog` を削除

- [ ] **Step 5: BookmarkSelection の一括移動ダイアログを移行する**

`src/components/BookmarkSelection/BookmarkSelection.ts`:
- import を `import { confirmDialog, openDialog } from '../Dialog/index.js';`
- `showMoveDialog` を次に置換:
  ```ts
  private showMoveDialog(
    folders: ChromeBookmarkNode[],
    count: number
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const folderOptions = folders
        .map((folder) => {
          const label = folder.title || `(ルート: ${folder.id})`;
          return `<option value="${escapeHtml(folder.id)}">${escapeHtml(label)}</option>`;
        })
        .join('');

      let result: string | null = null;
      openDialog({
        id: 'bulk-move-dialog',
        title: `${count} 件のブックマークを移動`,
        bodyHtml: `
              <div class="edit-form-group">
                <label for="bulk-move-parent">移動先フォルダ:</label>
                <select id="bulk-move-parent">
                  ${folderOptions}
                </select>
              </div>
        `,
        buttons: [
          {
            label: 'キャンセル',
            className: 'edit-dialog-cancel',
            onClick: (close) => close(),
          },
          {
            label: '移動',
            className: 'edit-dialog-save bulk-move-confirm',
            onClick: (close) => {
              const select = document.getElementById(
                'bulk-move-parent'
              ) as HTMLSelectElement | null;
              result = select?.value ?? null;
              close();
            },
          },
        ],
        onClose: () => resolve(result),
      });
    });
  }
  ```

- [ ] **Step 6: 手書きのダイアログ配線が残っていないことを確認する**

Run: `grep -rn "edit-dialog-overlay\|insertAdjacentHTML('beforeend'" src`
Expected: `src/components/Dialog/index.ts` と `BookmarkSelection.ts` の ESC ガード（`document.querySelector('.edit-dialog-overlay')`）のみ

- [ ] **Step 7: 全体チェック → コミット**

Run: `npx vitest run test/listener-leak.test.ts test/bookmark-editor.test.ts test/bookmark-edit.test.ts test/folder-create.test.ts test/folder-rename.test.ts test/bookmark-selection.test.ts test/folder-events-coverage.test.ts` → PASS。全体チェックコマンド → すべて成功

```bash
git add -A
git commit -m "入力フォーム系ダイアログを components/Dialog の openDialog に移行"
```

---

### Task 13: ドキュメント更新と最終検証

**Files:**
- Modify: `docs/internal-specification.md`
- Modify（該当があれば）: `docs/TESTING_GUIDE.md`

- [ ] **Step 1: ディレクトリ構造（55-133 行付近）を更新する**

- `ErrorHandler.ts` / `HtmlUtils.ts` / `types/events.ts` / `types/index.ts` の行を削除
- `components/` に追加:
  ```
  │   │   ├── Dialog/              # モーダルダイアログ共通基盤
  │   │   │   └── index.ts                     # openDialog / confirmDialog / alertDialog
  │   │   ├── HistoryList/         # 履歴系パネル共通の行描画
  │   │   │   └── index.ts                     # renderHistoryListItem / formatDateTime / matchesSearchTerm
  ```
- `UndoManager/` に `moveBack.ts  # Undo の move index 補正` を追加
- `scripts/` に追加し、`utils.ts` の説明を変える:
  ```
  │   │   ├── favicon.ts           # favicon 遅延読み込み (loadFavicons)
  │   │   ├── bookmarkEvents.ts    # bookmarks-changed イベント発火
  │   │   ├── dom.ts               # DOM ヘルパー (isEditableElement)
  │   │   └── utils.ts             # ブックマーク処理・favicon・エスケープの関数 API
  ```
- アーキテクチャ概要ツリー（22-43 行）の `Legacy Types (types.ts - 後方互換性)` 行を削除し、`Core Logic (newtab-core.ts - リファクタリング済み)` を `Core Logic (newtab-core.ts - 薄い関数 API)` に

- [ ] **Step 2: コンポーネント節を更新する**

- 「2.1 BookmarkFolder」の `updateFolderUI() / updateBookmarkListUI(): UI状態同期` 行を削除
- 「2.3 BookmarkActions」に追記:
  ```
  **ダイアログ**: 編集・削除確認・エラー通知・フォルダ作成/リネーム/削除・大量タブ確認・一括削除/移動の各モーダルは `components/Dialog` の `openDialog` / `confirmDialog` / `alertDialog` で生成する（overlay 生成・ESC・close 時の keydown 解除を一元管理。同時に開くのは 1 つ）。
  ```
- 「2.6 HistoryPanel」「2.7 CalendarHistoryPanel」「2.8 RecentlyClosedPanel」の末尾に共通で追記:
  ```
  - 行のマークアップは `components/HistoryList` の `renderHistoryListItem()` で生成（`.history-item` 系クラスに統一）。favicon は `scripts/favicon.ts` の `loadFavicons()` で読み込む
  ```
  2.7 にはさらに `タイムライン内は .history-timeline .history-item のスコープ付き CSS でコンパクト表示` を追記
- 2.8 の末尾に新節を追加:
  ```
  #### 2.9 Dialog コンポーネント

  **Dialog/index.ts** - モーダルダイアログ共通基盤:
  - `openDialog({ id, title, bodyHtml, buttons, onClose })`: overlay を生成し、×・ESC・各ボタンを配線。戻り値 `{ element, close }`
  - `confirmDialog(...)`: キャンセル / 確定の 2 ボタン。確定で `true`
  - `alertDialog(...)`: OK ボタンのみ
  - `showDialogError(handle, message)`: ダイアログ内 `.dialog-error` にエラー表示
  - 開く前に既存 overlay をすべて除去し、`close()` は冪等。document の keydown リスナーは `close()` で必ず解除（#100）

  #### 2.10 HistoryList コンポーネント

  **HistoryList/index.ts** - 履歴系 3 パネル共通の行描画:
  - `renderHistoryListItem(view)`: `.history-item` 1 件の HTML（title / url / meta / attributes をエスケープ）
  - `formatDateTime()` / `formatTimeWithSeconds()`: ja-JP ロケールの日時整形
  - `matchesSearchTerm(item, term)`: title / url の大文字小文字を無視した部分一致
  ```

- [ ] **Step 3: newtab-core / サービス / ユーティリティ / 定数 / レガシー節を書き換える**

- 「3. リファクタリング後のコア機能 (newtab-core.ts)」→ 見出しを「3. コア関数 API (newtab-core.ts)」にし、本文を:
  ```
  **責務**: newtab.ts とテストから使う薄い関数 API
  - `renderFolder()`: BookmarkFolderRenderer への委譲
  - `setupFolderClickHandler()`: BookmarkFolderEvents への委譲
  - `displayBookmarksTestable()`: テスト用の表示関数
  - `handleBookmarkEdit()` / `handleBookmarkDelete()`: BookmarkActions への委譲
  ```
- 「4.1 BookmarkService」に `- getAllFolders(): 仮想ルート id=0 を除くすべてのフォルダ（フォルダ選択 UI 用）` を追加
- 「4.3 ErrorHandler」節を削除
- 「5. ユーティリティ層 (Utils/)」を次に置換:
  ```
  ### 5. スクリプト層のヘルパー (scripts/)
  - `favicon.ts` `loadFavicons(container, imgSelector, urlAttr = 'data-favicon-url')`: img と同じ親要素内の `.favicon-placeholder` を切り替える favicon 遅延読み込み
  - `bookmarkEvents.ts` `dispatchBookmarksChanged(action)`: `bookmarks-changed` イベントの発火（action は `BookmarksChangedAction` の union 型）
  - `dom.ts` `isEditableElement(el)`: 入力欄 / contenteditable にフォーカスがあるか
  ```
- 「6. 定数管理」の箇条書きを `- 検索デバウンス時間 (SEARCH_DEBOUNCE_MS)` `- Chrome のパーマネントルート ID (BOOKMARK_ROOT_IDS)` `- DOM セレクター (SELECTORS)` の 3 つに
- 「7. レガシーユーティリティ (utils.ts)」→ 「7. 関数 API (utils.ts)」:
  ```
  **責務**: コンポーネントとテストが使うブックマーク処理・favicon・HTML エスケープの関数 API。BookmarkService / FaviconService を遅延生成して共有する
  - `getFavicon()` / `processBookmarkTree()` / `filterBookmarks()` / `applyExpandedState()` / `findFolderById()` / `getTotalBookmarks()` / `getAllFolders()`: Service への委譲
  - `escapeHtml()`: & < > " ' をすべてエスケープ (#96)
  - `getDomain()`: URL からホスト名（不正 URL は 'localhost'）
  ```
- 「8. 既存ユーティリティ関数（後方互換性維持）」の見出しを「8. 主要関数の処理概要」に変え、本文はそのまま

- [ ] **Step 4: TESTING_GUIDE と PRIVACY 以外の docs に削除したファイル名が残っていないか確認する**

Run: `grep -n "ErrorHandler\|HtmlUtils\|error-handler.test\|html-utils.test\|timeline-item\|updateFolderUI\|レガシー" docs/*.md README.md`
Expected: `docs/superpowers/` 配下以外はヒットなし。残っていれば該当行を削除または上記に合わせて書き換える

- [ ] **Step 5: 最終検証**

```bash
npm run test && npm run test:coverage && npm run lint && npm run format && npm run build:extension
```
Expected: すべて成功。coverage は statements ≥ 95% / branches ≥ 85%（閾値未達なら非 0 終了する）

Run: `git status --short` → 未コミットの変更なし（次でコミットするドキュメントを除く）

- [ ] **Step 6: コミット**

```bash
git add docs/
git commit -m "内部仕様書をリファクタリング後のモジュール構成に更新"
```

---

## 自己レビュー結果

- **仕様カバレッジ**: D → Task 1。A → Task 2, 3。B-1 → Task 8。B-2 → Task 4。B-3 → Task 6。B-4 → Task 7。B-5 → Task 5。B-6 → Task 9。C → Task 10-12。ドキュメント → Task 13。仕様の「`getSelectedUrls()` は残しコメントだけ外す」→ Task 3 Step 5
- **型の一貫性**: `loadFavicons(container, imgSelector, urlAttr?)` は Task 8 で定義し Task 9 で同じ形で使用。`DialogHandle` / `openDialog` / `confirmDialog` / `alertDialog` / `showDialogError` は Task 10 で定義し Task 11, 12 で同名・同シグネチャで使用。`dispatchBookmarksChanged` は Task 4 で定義し以降のタスクでも同名
- **順序依存**: Task 8（favicon）は Task 9（HistoryList のマークアップが `data-favicon-url` 前提）より先。Task 10 は Task 11, 12 より先。それ以外は独立
