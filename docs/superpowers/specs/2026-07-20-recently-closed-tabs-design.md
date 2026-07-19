# 「最近閉じたタブ」タブの追加

- 日付: 2026-07-20
- ブランチ: `feat/recently-closed-tabs`
- リリース想定: v4.2.0（`sessions` 権限追加のため Chrome ウェブストア再審査対象）

## 背景 / ゴール

New Tab のタブナビゲーション（ブックマーク / 最近の履歴 / カレンダー）に、
**「最近閉じたタブ」タブを「最近の履歴」と「カレンダー」の間**に追加する。
Chrome の `chrome.sessions` API で最近閉じたタブを一覧表示し、クリックで復元できるようにする。

## 確定した要件

- **クリック挙動**: `chrome.sessions.restore(sessionId)` で復元（Chrome の Cmd+Shift+T と同じ体験）。
  復元後は一覧を再読み込みする（復元した項目は一覧から消える）。
- **ウィンドウの扱い**: `getRecentlyClosed()` が返す `window` エントリは**除外**し、
  `session.tab` を持つ単体タブのみ表示する。
- **検索フィルタ**: 付けない（最大約25件 = `sessions.MAX_SESSION_RESULTS` のため不要。YAGNI）。

## アプローチ（採用: A — 独立コンポーネント）

- **A（採用）**: `HistoryPanel` と同型の独立コンポーネント `RecentlyClosedPanel` を新規作成。
  データ源（sessions API）もクリック挙動（restore）も履歴と異なるため、共通化せず独立させる。
- **B（不採用）**: `HistoryPanel` の汎用化・共用。データ型・クリック挙動・検索有無が異なり、
  抽象化のコストが利益を上回る。

## 変更内容

### 1. `src/newtab.html`

- タブボタンを「最近の履歴」と「カレンダー」の**間**に追加:
  - `data-tab="recently-closed"`、`id="tab-recently-closed"`、
    `aria-controls="tab-panel-recently-closed"`、`aria-selected="false"`
  - アイコン 🗂、ラベル「最近閉じたタブ」
- `<main>` 内の history パネルと calendar パネルの間に
  `<section class="tab-panel" id="tab-panel-recently-closed" role="tabpanel"
  aria-labelledby="tab-recently-closed" hidden></section>` を追加。
- `TabController` は `.tab-button[data-tab]` と `#tab-panel-<id>` を自動検出するため変更不要。

### 2. 新規コンポーネント `src/components/RecentlyClosedPanel/`

- `RecentlyClosedPanel.ts`（+ `index.ts` で re-export）。`HistoryPanel` と同構造:
  - `constructor(container: HTMLElement)` … `recently-closed-panel` クラスを付与し、
    コンテンツ領域（`recently-closed-content`）とローディング表示を構築。クリックは
    イベント委譲で扱う。
  - `activate(): Promise<void>` … タブがアクティブになるたびに
    `chrome.sessions.getRecentlyClosed()` を呼び、`session.tab` を持つエントリのみ抽出して描画
    （`window` エントリは除外）。restore で一覧が変わるため毎回再取得する。
  - 各行の描画: favicon（既存 `getFavicon(url)` = `_favicon` API を再利用）+ タイトル
    （`escapeHtml`）+ ドメイン表示。`data-session-id` 属性に `tab.sessionId` を保持。
  - クリック: `chrome.sessions.restore(sessionId)` → 成功後に一覧を再読み込み。
  - 0件時: 「最近閉じたタブはありません」。
  - エラー時: エラーメッセージ表示 + `console.error`（HistoryPanel と同様）。
- XSS: タイトル・URL は `escapeHtml` を通す（#96 の方針を踏襲）。

### 3. `src/scripts/newtab.ts`

- `RecentlyClosedPanel` を import し、`#tab-panel-recently-closed` コンテナで初期化。
- `_tabController.onActivate('recently-closed', () => panel.activate())` を登録（既存パターン）。

### 4. `src/manifest.json`

- `permissions` に `"sessions"` を追加:
  `["bookmarks", "history", "tabGroups", "favicon", "sessions"]`。
- host 権限は追加しない。

### 5. docs

- `docs/external-specification.md`: タブ構成（4タブ）・「最近閉じたタブ」機能の節・権限一覧に
  `sessions` を追記。
- `docs/internal-specification.md`: コンポーネント一覧・タブ構成・Chrome API 依存
  （Sessions API）を追記。

## テスト

- `test/setup.ts` の `mockChrome` に `sessions: { getRecentlyClosed: vi.fn(), restore: vi.fn() }`
  を追加（既存モックを壊さない）。
- 新規 `test/recently-closed-panel.test.ts`:
  - タブエントリが一覧描画される（タイトル・sessionId 属性）。
  - `window` エントリが除外される。
  - 0件時に「最近閉じたタブはありません」が表示される。
  - 行クリックで `chrome.sessions.restore` が正しい `sessionId` で呼ばれ、その後
    `getRecentlyClosed` が再呼び出しされる（一覧再読み込み）。
  - `getRecentlyClosed` 失敗時にエラーメッセージが表示される。
- 既存テストの回帰なし。coverage しきい値（Statements 95% / Branches 85%）維持。

## 完了条件

- `npm run lint && npm run format && npm run build && npm run test` 緑。
- `npm run test:coverage` exit 0（95/85 維持）。
- `npm run build:extension` 成功（dist の manifest に `sessions` 反映）。
- spec-compliance-reviewer / manifest-permissions-reviewer で整合確認。
- 人間による目視: 新タブで「最近閉じたタブ」が一覧表示され、クリックで復元されること。

## スコープ外

- 閉じたウィンドウの表示・復元。
- 検索フィルタ。
- 件数設定・表示件数のカスタマイズ。
- デバイス間同期タブ（`chrome.sessions.getDevices`）。
