# コードベース整理リファクタリング 設計書

- 日付: 2026-09-14
- ブランチ: `refactor/cleanup`
- リリース想定: 挙動変更なし（ただしバグ修正を1件含む。version bump は別途）

## 背景 / ゴール

v1.4 でのコンポーネント化以降、「後方互換」「レガシー」と名付けられた層や、
一度作られたが使われなかったユーティリティが残っている。加えて、機能追加のたびに
モーダル・favicon 読み込み・`bookmarks-changed` 発火などが各コンポーネントへコピーされ、
同じロジックが最大 9 箇所に散っている。

このリファクタリングのゴールは次の 4 点。

1. 到達不能・未使用のコードを削除し、「正規の API はどれか」を 1 つに定める
2. コピーされたロジックを共通モジュールに集約し、修正が 1 箇所で済むようにする
3. モーダルダイアログのライフサイクル（生成・ESC・クローズ・リスナー解除）を 1 箇所で管理する
4. テストの壊れた型 import を修正する

外部仕様（`docs/external-specification.md`）に記載された挙動は変えない。

## 進め方

D → A → B → C の順に、それぞれ独立したコミット群として進める。各段階の完了条件は
`npm run test` / `npm run lint` / `npm run format` / `npm run build:extension` がすべて成功すること。
途中で止めても壊れた状態にならないよう、段階間に依存を作らない。

## D. テストの型 import 修正

`test/` の 6 ファイルが存在しない `../src/scripts/types` を型 import している。
型のみの import は esbuild が消すため実行時には表面化していないが、`../src/types/bookmark` に付け替える。

対象: `3layer-issues` / `bookmark-delete` / `bookmark-edit` / `newtab` / `newtab-integration` / `search-debounce`

## A. 未使用コードの削除

### 削除するもの

| 対象 | 理由 |
|---|---|
| `src/services/ErrorHandler.ts` と `test/error-handler.test.ts` | `src/` からの利用なし（`scripts/utils.ts` の再エクスポートのみ） |
| `src/utils/HtmlUtils.ts` と `test/html-utils.test.ts` | `escapeHtml` / `getDomain` 以外は利用なし。2 関数は `scripts/utils.ts` に移す |
| `src/types/events.ts`、`src/types/index.ts` | import 元なし |
| `src/constants/index.ts` の `ERROR_MESSAGES` / `CSS_CLASSES` / `CHROME_EXTENSION_SCHEME` / `BOOKMARK_ANIMATION_DURATION_MS` | 利用なし |
| `src/components/BookmarkFolder/index.ts` の `BookmarkFolder` ラッパークラス | 生成箇所なし。index は再エクスポートのみ残す |
| `src/components/BookmarkSelection/index.ts` の `SelectedBookmark` 再エクスポートと型定義 | 利用なし |
| `src/scripts/newtab-core.ts` の `updateFolderUI` / `updateBookmarkListUI` | 警告を出すだけの空関数。対応テストも削除 |
| `src/scripts/newtab-core.ts` の再エクスポート群 | `BookmarkActions/index.ts` と `BookmarkFolder/index.ts` に重複 |
| `BookmarkFolderEvents.findFolder` のフォールバック探索 | `findFolderById` が既に再帰するため到達不能 |
| `BookmarkSelection.initialize()`、`BookmarkFolderEvents.getSelection()` | テストからのみ到達。テストは `refresh()` 等に書き換える |
| `BookmarkFolderEvents.copyToClipboard` の未使用引数 `_title` | 呼び出し側も合わせて修正 |

### `scripts/utils.ts` の扱い（採用: 正規の関数 API に格上げ）

- 現状は「レガシー互換」を名乗っているが、実際には全コンポーネントとテストの `vi.mock` がこのモジュールを向いている
- `@deprecated` 表記とファイル冒頭の「レガシー」説明を外し、ブックマーク操作・favicon・HTML エスケープの関数 API として位置付ける
- `escapeHtml` / `getDomain` は `HtmlUtils` から実装を移し、`HtmlUtils` 自体は削除する
- `ErrorHandler` / `HtmlUtils` の再エクスポートを削除する
- 不採用案: `scripts/utils.ts` を廃止して各コンポーネントが Service を直接 import する案。テストの mock 書き換えが 4 ファイルに及び、得られるものが少ない

### `BookmarkSelection` の可視性整理

`toggle()` / `selectOnly()` は内部からしか呼ばれないが、テストが直接呼んでいる可能性があるため
**削除も private 化もしない**（テスト専用 API の整理は `initialize()` / `getSelection()` に限る）。
`getSelectedUrls()` はテストが選択状態を検証する唯一の窓口なので残し、「テスト用」のコメントだけ外す。

## B. 重複ロジックの共通化

### B-1. favicon 遅延読み込み: `src/scripts/favicon.ts`

```ts
export async function loadFavicons(
  container: ParentNode,
  imgSelector: string,
  urlAttr: string
): Promise<void>;
```

- `container.querySelectorAll(imgSelector)` を走査し、`img.getAttribute(urlAttr)` で URL を取得
- プレースホルダは **img の直後の兄弟要素**（`.favicon-placeholder`）から取る。従来の「img 一覧と placeholder 一覧を index で突き合わせる」方式はマークアップ変更で静かにズレるため廃止する
- 成功時: `hidden` を外し placeholder を隠す。失敗時: placeholder に 🌐 を表示する（表示スタイルは CSS 側で決め、`display: 'inline-block'` の分岐は持たない）
- `Promise.allSettled` で待つ
- 置換対象 5 箇所: `newtab.ts`、`HistoryPanel`、`RecentlyClosedPanel`、`CalendarHistoryPanel`（timeline と domain の 2 箇所）
- domain favicon は URL 属性に `https://${domain}` を入れておくことで同じ関数で扱う（属性名は `data-favicon-url` に統一）

### B-2. `bookmarks-changed` 発火: `src/scripts/bookmarkEvents.ts`

```ts
export type BookmarksChangedAction =
  | 'edit' | 'delete' | 'move' | 'bulk-delete' | 'bulk-move'
  | 'folder-create' | 'folder-rename' | 'folder-delete' | 'folder-move'
  | `undo-${string}`;
export function dispatchBookmarksChanged(action: BookmarksChangedAction): void;
```

- 7 クラスの private メソッドと `BookmarkDragAndDrop` 内のインライン 5 箇所を置換
- 既存の action 文字列はそのまま維持する（テストが `detail.action` を見ている可能性があるため）

### B-3. フォルダ一覧取得: `BookmarkService.getAllFolders()`

- `BookmarkEditor` / `FolderCreator` / `BookmarkSelection` の 3 実装を集約
- 仮想ルート `'0'` を除外する（`FolderCreator` / `BookmarkSelection` と同じ挙動）
- **バグ修正**: `BookmarkEditor` の版だけ `'0'` を除外しておらず、編集ダイアログのフォルダ選択に
  空ラベルの選択肢が出て、選ぶと `chrome.bookmarks.move` が必ず失敗していた。加えて `folder.id` を
  エスケープせずに埋め込んでいた。集約により両方直る
- `<option>` 生成も `BookmarkEditor` 側で `escapeHtml(folder.id)` を使うよう揃える

### B-4. Undo 用 move-back: `src/components/UndoManager/moveBack.ts`

```ts
export async function moveBackForUndo(
  id: string,
  parentId: string,
  index: number
): Promise<void>;
```

- Chrome の `move` は同一親内で前方へ戻すとき index が 1 ずれるため、現在位置を `get` して補正する
- `BookmarkDragAndDrop` の `reorderBookmark` / `reorderFolder` に verbatim で 2 回書かれている補正を集約

### B-5. 編集中要素の判定: `src/scripts/dom.ts`

```ts
export function isEditableElement(el: Element | null): boolean;
```

- `KeyboardShortcuts` / `UndoManager` / `BookmarkSelection` の 3 実装を集約

### B-6. 履歴系 3 パネルの描画統一: `src/components/HistoryList/`

3 パネル（最近の履歴 / 最近閉じたタブ / カレンダーのタイムライン）のアイテムを
1 つの描画関数と 1 つのマークアップに統一する。

```ts
export interface HistoryListItemView {
  /** クリック先 URL（title の data-url と favicon の data-favicon-url に使う） */
  url: string;
  title: string;
  /** URL 行に表示する文字列（URL 全体 or ドメイン） */
  subtitle: string;
  /** メタ行。空なら描画しない */
  meta: Array<{ className: string; text: string }>;
  /** ルート要素に付ける追加属性（例: data-session-id） */
  attributes?: Record<string, string>;
}
export function renderHistoryListItem(view: HistoryListItemView): string;
export function formatDateTime(epochMs: number): string;      // 'YYYY/M/D HH:MM'
export function formatTimeWithSeconds(epochMs: number): string; // 'HH:MM:SS'
export function matchesSearchTerm(item: { title: string; url: string }, term: string): boolean;
```

マークアップは `.history-item` 系に統一する。

```html
<div class="history-item" {attributes}>
  <div class="history-item-icon">
    <img class="history-favicon hidden" data-favicon-url="…" alt="favicon">
    <span class="favicon-placeholder">🌐</span>
  </div>
  <div class="history-item-content">
    <a href="#" class="history-item-title" data-url="…">…</a>
    <div class="history-item-url">…</div>
    <div class="history-item-meta">…</div>
  </div>
</div>
```

- カレンダーのタイムラインは `.timeline-item*` クラスを廃止し、`.history-item` を使う。
  コンパクトな見た目（小さめのフォント・`--surface-2` 背景・hover の浮き上がりなし）は
  `.history-timeline .history-item` のスコープ付き CSS で維持し、`.timeline-item*` の CSS ルールは削除する
- `.timeline-item-time` は `.history-item-date` に寄せる（意味は同じ「時刻表示」）
- 各パネルのクリック委譲（`chrome.tabs.create` / `sessions.restore`）と空表示・エラー表示は
  各パネルに残す。データ源と挙動が異なるため共通基底クラスは作らない（YAGNI）
- `test/calendar-history-panel.test.ts` の `.timeline-*` セレクタは `.history-item*` に書き換える

## C. ダイアログ基盤の統一: `src/components/Dialog/`

### API

```ts
export interface DialogButton {
  label: string;
  /** ボタンに付与するクラス。既存テストが参照するクラス名をここで維持する */
  className: string;
  /** クリック時。close を呼ばなければダイアログは開いたまま（バリデーション失敗時など） */
  onClick: (close: () => void) => void;
  /** 開いた直後にフォーカスするか */
  autofocus?: boolean;
}
export interface DialogOptions {
  /** overlay の id。既存テストが参照する id を維持する */
  id: string;
  title: string;
  bodyHtml: string;
  buttons: DialogButton[];
  /** 閉じられたとき（×・キャンセル・ESC・close() のどの経路でも 1 回だけ）呼ばれる */
  onClose?: () => void;
}
export interface DialogHandle {
  element: HTMLElement;
  close: () => void;
}
export function openDialog(options: DialogOptions): DialogHandle;

export function confirmDialog(options: {
  id: string;
  title: string;
  bodyHtml: string;
  confirmLabel: string;
  confirmClassName: string;
}): Promise<boolean>;

export function alertDialog(options: {
  id: string;
  title: string;
  bodyHtml: string;
}): Promise<void>;
```

### 振る舞い

- 開く前に `document` 上の `.edit-dialog-overlay` をすべて除去し、「同時に開くのは 1 つ」を保証する
- 生成するマークアップは既存と同じ骨格: `.edit-dialog-overlay > .edit-dialog[role=dialog][aria-modal=true] > header / content / actions`
- ヘッダの `×`（`.edit-dialog-close`）と `.edit-dialog-cancel` ボタン、ESC キーで閉じる
- `document` の `keydown` リスナーは `openDialog` が登録し、`close()` で必ず解除する（#100 のリーク防止を 1 箇所で担保）
- `close()` は冪等。2 回目以降は何もしない
- `confirmDialog` はキャンセル系で `false`、確定ボタンで `true` を解決する。開いた直後はキャンセルにフォーカスする（誤操作防止、既存踏襲）
- Enter キーの扱いは `openDialog` では持たない。入力フォームを持つ呼び出し側（`FolderCreator` / `FolderRenamer`）が従来どおり input に `keydown` を付ける

### 置換対象

| 呼び出し元 | 使う API | 維持する id / クラス |
|---|---|---|
| `BookmarkDeleter` 削除確認 | `confirmDialog` | `#delete-dialog`, `.delete-dialog-confirm` |
| `BookmarkDeleter` エラー表示 | `alertDialog` | `#error-dialog` |
| `FolderDeleter` | `confirmDialog` | `#folder-delete-dialog`, `.folder-delete-confirm` |
| `TabGroupOpener` | `confirmDialog` | `#tab-group-confirm-dialog`, `.tab-group-confirm` |
| `BookmarkSelection` 一括削除 | `confirmDialog` | `#bulk-confirm-dialog`, `.delete-dialog-confirm` |
| `BookmarkSelection` 一括移動 | `openDialog` | `#bulk-move-dialog`, `.bulk-move-confirm` |
| `BookmarkEditor` | `openDialog` | `#edit-dialog`, `.edit-dialog-save` |
| `FolderCreator` | `openDialog` | `#folder-create-dialog`, `.folder-create-confirm`, `.folder-create-error` |
| `FolderRenamer` | `openDialog` | `#folder-rename-dialog`, `.folder-rename-confirm`, `.folder-rename-error` |

各クラスが保持していた `keydownHandler` フィールドと `closeDialog()` メソッドは削除し、
`DialogHandle.close` に置き換える。`showError`（ダイアログ内エラー表示）は
`FolderCreator` / `FolderRenamer` で同一なので `Dialog` モジュールの `showDialogError(handle, message)` に寄せる。

## エラーハンドリング方針

今回は統一しない。`alert()` / `Toast` / エラーダイアログ / ダイアログ内表示の使い分けは
機能ごとの UX 判断を含むため、別の設計課題として切り出す。`ErrorHandler` の削除は
「使われていない」ことのみを根拠とし、代替を導入しない。

## テスト

- 新規モジュール（`favicon` / `bookmarkEvents` / `dom` / `moveBack` / `HistoryList` / `Dialog`）には単体テストを追加する
- 既存テストは、削除対象 API を使っている箇所と `.timeline-*` セレクタのみ書き換える
- `newtab.ts` から favicon 処理が抜けるため未テスト行が減る。カバレッジ閾値（statements 95% / branches 85%）は `npm run test:coverage` で確認する

## ドキュメント更新

`docs/internal-specification.md` の次の箇所を更新する。

- ディレクトリ構造: `ErrorHandler.ts` / `HtmlUtils.ts` / `types/events.ts` / `types/index.ts` を削除し、`Dialog/` `HistoryList/` `scripts/favicon.ts` `scripts/bookmarkEvents.ts` `scripts/dom.ts` `UndoManager/moveBack.ts` を追加
- 「サービス層」「ユーティリティ層」: `ErrorHandler` / `HtmlUtils` の節を削除
- 「レガシーユーティリティ (utils.ts)」「既存ユーティリティ関数（後方互換性維持）」: 「関数 API」として書き直す
- 「リファクタリング後のコア機能 (newtab-core.ts)」: deprecated 関数の記述を削除
- コンポーネント一覧: `Dialog` と `HistoryList` を追加
