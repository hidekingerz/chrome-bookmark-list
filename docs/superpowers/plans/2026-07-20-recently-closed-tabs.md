# 「最近閉じたタブ」タブ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New Tab のタブナビゲーションに「最近閉じたタブ」タブ（履歴とカレンダーの間）を追加し、`chrome.sessions` API で一覧表示・クリック復元できるようにする。

**Architecture:** `HistoryPanel` と同型の独立コンポーネント `RecentlyClosedPanel` を新規作成。`chrome.sessions.getRecentlyClosed()` から `session.tab` を持つエントリのみ抽出して描画し、行クリックで `chrome.sessions.restore(sessionId)` → 一覧再読み込み。既存の `history-*` CSS クラスを再利用し CSS 追加ゼロ。`TabController` は `.tab-button[data-tab]` + `#tab-panel-<id>` を自動検出するため HTML 追加のみで組み込める。

**Tech Stack:** TypeScript 5 / Chrome 拡張 MV3 / Vitest 4（happy-dom）/ Biome 2 / npm

## Global Constraints

- パッケージ追加・更新をしない。
- 毎周の VERIFY: `npm run lint && npm run format && npm run build && npm run test` を緑に保つ。
- 完了ゲート: `npm run test:coverage`（Statements 95% / Branches 85% 維持）+ `npm run build:extension` 成功。
- Biome: lineWidth 80 / space 2 / single quote / semicolons always。整形漏れは `npm run format:write`。
- テストは `test/` 配下にフラット配置。`test/setup.ts` の既存 Chrome API モックを壊さない。
- ★`test/setup.ts` は `globalThis.document` を最小スタブで上書きしている。実 DOM が要るテストは
  `import { Window } from 'happy-dom'` で `new Window()` を作り beforeEach で差し替え、afterEach で復元。
- XSS: タイトル・URL・sessionId は `escapeHtml` を通す。
- 検索フィルタ・ウィンドウ復元・件数設定・visibilitychange 再読込・version bump はスコープ外（YAGNI）。
- グリル確定事項: 自拡張 New Tab（`chrome-extension://<chrome.runtime.id>/` 始まり）は除外 /
  同一 URL は最新のみ（dedupe） / 閉じた時刻（`lastModified` 秒→ms）をメタ行に表示。

---

### Task 1: RecentlyClosedPanel コンポーネント（TDD）

**Files:**
- Modify: `test/setup.ts`（`mockChrome` に `sessions` モック追加）
- Test: `test/recently-closed-panel.test.ts`（新規）
- Create: `src/components/RecentlyClosedPanel/RecentlyClosedPanel.ts`
- Create: `src/components/RecentlyClosedPanel/index.ts`

**Interfaces:**
- Consumes: `escapeHtml(text: string): string` / `getFavicon(url: string): Promise<string>`（`src/scripts/utils.ts`）
- Produces: `RecentlyClosedPanel` クラス — `constructor(container: HTMLElement)` / `activate(): Promise<void>`。Task 2 の `newtab.ts` がこの2つだけを使う。

- [ ] **Step 1: `test/setup.ts` の `mockChrome` に `sessions` を追加**

`runtime:` ブロックの後（`mockChrome` オブジェクト内）に追加:

```typescript
  sessions: {
    getRecentlyClosed: vi.fn(),
    restore: vi.fn(),
  },
```

さらに `runtime:` ブロックに `id` を追加（自拡張 New Tab 除外の判定に使用）:

```typescript
  runtime: {
    id: 'test-id',
    getURL: vi.fn((path: string) => `chrome-extension://test-id${path}`),
  },
```

- [ ] **Step 2: `test/recently-closed-panel.test.ts` を作成**

```typescript
import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecentlyClosedPanel } from '../src/components/RecentlyClosedPanel/index.js';

/** microtask/timer を flush する（クリック後の非同期 restore→再読込を待つ） */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('RecentlyClosedPanel', () => {
  let dom: Window;
  let originalDocument: typeof globalThis.document;
  let container: HTMLElement;

  const getRecentlyClosed = () =>
    chrome.sessions.getRecentlyClosed as unknown as ReturnType<typeof vi.fn>;
  const restore = () =>
    chrome.sessions.restore as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    dom = new Window();
    originalDocument = globalThis.document;
    globalThis.document = dom.document as unknown as typeof globalThis.document;
    container = dom.document.createElement('div') as unknown as HTMLElement;
    dom.document.body.appendChild(container as unknown as Node);
  });

  afterEach(() => {
    globalThis.document = originalDocument;
  });

  it('タブエントリを一覧描画する（sessionId 属性つき）', async () => {
    getRecentlyClosed().mockResolvedValue([
      { tab: { sessionId: 's1', title: 'Example', url: 'https://example.com/' } },
      { tab: { sessionId: 's2', title: 'Other', url: 'https://other.example/' } },
    ]);

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    const items = container.querySelectorAll('.history-item');
    expect(items.length).toBe(2);
    expect(items[0].getAttribute('data-session-id')).toBe('s1');
    expect(container.textContent).toContain('Example');
    expect(container.textContent).toContain('other.example');
  });

  it('window エントリと sessionId/url 欠落タブを除外する', async () => {
    getRecentlyClosed().mockResolvedValue([
      { window: { sessionId: 'w1', tabs: [] } },
      { tab: { sessionId: 's1', title: 'Kept', url: 'https://kept.example/' } },
      { tab: { title: 'No sessionId', url: 'https://no-id.example/' } },
    ]);

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    const items = container.querySelectorAll('.history-item');
    expect(items.length).toBe(1);
    expect(items[0].getAttribute('data-session-id')).toBe('s1');
  });

  it('自拡張の New Tab ページを除外する', async () => {
    getRecentlyClosed().mockResolvedValue([
      {
        tab: {
          sessionId: 's1',
          title: 'Bookmarks',
          url: 'chrome-extension://test-id/newtab.html',
        },
      },
      { tab: { sessionId: 's2', title: 'Kept', url: 'https://kept.example/' } },
    ]);

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    const items = container.querySelectorAll('.history-item');
    expect(items.length).toBe(1);
    expect(items[0].getAttribute('data-session-id')).toBe('s2');
  });

  it('同一 URL は最新のみ表示する（dedupe）', async () => {
    getRecentlyClosed().mockResolvedValue([
      { tab: { sessionId: 's1', title: 'Newest', url: 'https://dup.example/' } },
      { tab: { sessionId: 's2', title: 'Older', url: 'https://dup.example/' } },
      { tab: { sessionId: 's3', title: 'Other', url: 'https://other.example/' } },
    ]);

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    const items = container.querySelectorAll('.history-item');
    expect(items.length).toBe(2);
    expect(items[0].getAttribute('data-session-id')).toBe('s1');
    expect(items[1].getAttribute('data-session-id')).toBe('s3');
  });

  it('閉じた時刻（lastModified）をメタ行に表示する', async () => {
    getRecentlyClosed().mockResolvedValue([
      {
        lastModified: 1752989400, // epoch 秒
        tab: { sessionId: 's1', title: 'Timed', url: 'https://t.example/' },
      },
    ]);

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    const date = container.querySelector('.history-item-date');
    expect(date).not.toBeNull();
    expect(date?.textContent?.trim()).not.toBe('');
  });

  it('0件時に空メッセージを表示する', async () => {
    getRecentlyClosed().mockResolvedValue([]);

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    expect(container.textContent).toContain('最近閉じたタブはありません');
  });

  it('行クリックで restore が呼ばれ一覧を再読み込みする', async () => {
    getRecentlyClosed()
      .mockResolvedValueOnce([
        { tab: { sessionId: 's1', title: 'Restore me', url: 'https://r.example/' } },
      ])
      .mockResolvedValueOnce([]);
    restore().mockResolvedValue(undefined);

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    const item = container.querySelector(
      '.history-item[data-session-id="s1"]'
    ) as HTMLElement;
    expect(item).not.toBeNull();
    item.click();
    await flush();

    expect(restore()).toHaveBeenCalledWith('s1');
    expect(getRecentlyClosed()).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('最近閉じたタブはありません');
  });

  it('getRecentlyClosed 失敗時にエラーメッセージを表示する', async () => {
    getRecentlyClosed().mockRejectedValue(new Error('boom'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    expect(container.textContent).toContain(
      '最近閉じたタブの読み込みに失敗しました'
    );
    consoleError.mockRestore();
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `npx vitest run test/recently-closed-panel.test.ts`
Expected: FAIL（`RecentlyClosedPanel` モジュールが存在しない）

- [ ] **Step 4: `src/components/RecentlyClosedPanel/RecentlyClosedPanel.ts` を作成**

```typescript
import { escapeHtml, getFavicon } from '../../scripts/utils.js';

/** 最近閉じたタブの表示用データ */
interface RecentlyClosedTab {
  sessionId: string;
  title: string;
  url: string;
  /** 閉じた時刻（ms）。lastModified が無ければ null */
  closedAt: number | null;
}

/**
 * 「最近閉じたタブ」タブパネル
 *
 * chrome.sessions.getRecentlyClosed() から単体タブ（window エントリは除外）を
 * 一覧表示し、クリックで chrome.sessions.restore() により復元する。
 * 復元後は一覧を再読み込みする（復元した項目は一覧から消える）。
 * 与えられたコンテナ要素の中にUIを構築する。
 */
export class RecentlyClosedPanel {
  private container: HTMLElement;
  private contentElement: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.init();
  }

  private init(): void {
    this.container.classList.add('recently-closed-panel');
    this.container.innerHTML = `
      <div class="recently-closed-content">
        <div class="history-loading">最近閉じたタブを読み込み中...</div>
      </div>
    `;

    this.contentElement = this.container.querySelector(
      '.recently-closed-content'
    );

    // 行クリックで復元（イベント委譲）
    this.contentElement?.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest(
        '.history-item[data-session-id]'
      ) as HTMLElement | null;
      if (!item) return;

      e.preventDefault();
      const sessionId = item.getAttribute('data-session-id');
      if (sessionId) {
        void this.restoreTab(sessionId);
      }
    });
  }

  /**
   * タブがアクティブになったときに一覧を読み込んで表示する。
   * restore で内容が変わるため毎回再取得する。
   */
  public async activate(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const sessions = await chrome.sessions.getRecentlyClosed();
      // 自拡張の New Tab ページはノイズなので除外する
      const ownPagePrefix = `chrome-extension://${chrome.runtime.id}/`;
      const seenUrls = new Set<string>();
      const tabs: RecentlyClosedTab[] = [];
      for (const session of sessions) {
        const tab = session.tab;
        // window エントリ、および sessionId/url の無いタブは表示しない
        if (!tab?.sessionId || !tab.url) continue;
        if (tab.url.startsWith(ownPagePrefix)) continue;
        // 同一 URL は最新（先頭側）のみ表示
        if (seenUrls.has(tab.url)) continue;
        seenUrls.add(tab.url);
        tabs.push({
          sessionId: tab.sessionId,
          title: tab.title || tab.url,
          url: tab.url,
          closedAt: session.lastModified ? session.lastModified * 1000 : null,
        });
      }
      this.render(tabs);
    } catch (error) {
      console.error('最近閉じたタブの読み込みに失敗しました:', error);
      this.renderError();
    }
  }

  private async restoreTab(sessionId: string): Promise<void> {
    try {
      await chrome.sessions.restore(sessionId);
    } catch (error) {
      console.error('タブの復元に失敗しました:', error);
    }
    // 復元後（失敗時も実状態に合わせるため）一覧を再読み込み
    await this.load();
  }

  private render(tabs: RecentlyClosedTab[]): void {
    if (!this.contentElement) return;

    if (tabs.length === 0) {
      this.contentElement.innerHTML =
        '<div class="history-empty">最近閉じたタブはありません</div>';
      return;
    }

    const html = tabs.map((tab) => this.renderItem(tab)).join('');
    this.contentElement.innerHTML = `<div class="history-list">${html}</div>`;

    // Favicon の非同期読み込み
    void this.loadFavicons();
  }

  private renderItem(tab: RecentlyClosedTab): string {
    const safeUrl = escapeHtml(tab.url);
    const safeTitle = escapeHtml(tab.title);
    const safeSessionId = escapeHtml(tab.sessionId);

    let domain: string;
    try {
      domain = new URL(tab.url).hostname;
    } catch {
      domain = tab.url;
    }

    // 閉じた時刻（履歴パネルと同じ体裁）
    let metaHtml = '';
    if (tab.closedAt) {
      const date = new Date(tab.closedAt).toLocaleDateString('ja-JP');
      const time = new Date(tab.closedAt).toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
      });
      metaHtml = `
          <div class="history-item-meta">
            <span class="history-item-date">${date} ${time}</span>
          </div>`;
    }

    return `
      <div class="history-item" data-session-id="${safeSessionId}">
        <div class="history-item-icon">
          <img class="recently-closed-favicon hidden" data-tab-url="${safeUrl}" alt="favicon">
          <span class="favicon-placeholder">🌐</span>
        </div>
        <div class="history-item-content">
          <a href="#" class="history-item-title">${safeTitle}</a>
          <div class="history-item-url">${escapeHtml(domain)}</div>${metaHtml}
        </div>
      </div>
    `;
  }

  private renderError(): void {
    if (!this.contentElement) return;
    this.contentElement.innerHTML =
      '<div class="history-error">最近閉じたタブの読み込みに失敗しました</div>';
  }

  private async loadFavicons(): Promise<void> {
    const faviconImages = this.container.querySelectorAll(
      '.recently-closed-favicon'
    ) as NodeListOf<HTMLImageElement>;
    const faviconPlaceholders = this.container.querySelectorAll(
      '.favicon-placeholder'
    ) as NodeListOf<HTMLElement>;

    const faviconPromises = Array.from(faviconImages).map(
      async (img, index) => {
        const url = img.getAttribute('data-tab-url');
        const placeholder = faviconPlaceholders[index];
        if (!url) return;

        try {
          const faviconUrl = await getFavicon(url);
          img.src = faviconUrl;
          img.onload = () => {
            img.classList.remove('hidden');
            if (placeholder) placeholder.style.display = 'none';
          };
          img.onerror = () => {
            if (placeholder) {
              placeholder.textContent = '🌐';
              placeholder.style.display = 'block';
            }
          };
        } catch (error) {
          console.warn('Favicon 読み込みエラー:', url, error);
        }
      }
    );

    await Promise.allSettled(faviconPromises);
  }
}
```

- [ ] **Step 5: `src/components/RecentlyClosedPanel/index.ts` を作成**

```typescript
export { RecentlyClosedPanel } from './RecentlyClosedPanel.js';
```

- [ ] **Step 6: テストを実行して成功を確認**

Run: `npx vitest run test/recently-closed-panel.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 7: VERIFY**

Run: `npm run lint && npm run format && npm run build && npm run test`
Expected: すべて緑。

- [ ] **Step 8: コミット**

```bash
git add test/setup.ts test/recently-closed-panel.test.ts src/components/RecentlyClosedPanel/
git commit -m "Add RecentlyClosedPanel component with sessions API"
```

---

### Task 2: タブUIへの組み込みと sessions 権限

**Files:**
- Modify: `src/newtab.html`（タブボタン + パネル section 追加）
- Modify: `src/scripts/newtab.ts`（パネル初期化 + onActivate 登録）
- Modify: `src/manifest.json`（`sessions` 権限追加）

**Interfaces:**
- Consumes: `RecentlyClosedPanel`（Task 1）— `new RecentlyClosedPanel(container)` / `activate(): Promise<void>`。

- [ ] **Step 1: `src/newtab.html` にタブボタンを追加**

「最近の履歴」ボタン（`data-tab="history"` の `</button>`）と「カレンダー」ボタン（`data-tab="calendar"`）の**間**に挿入:

```html
                <button class="tab-button" data-tab="recently-closed" role="tab"
                        id="tab-recently-closed" aria-selected="false" aria-controls="tab-panel-recently-closed">
                    <span class="tab-icon">🗂</span><span class="tab-label">最近閉じたタブ</span>
                </button>
```

- [ ] **Step 2: `src/newtab.html` にパネル section を追加**

`#tab-panel-history` の section と `#tab-panel-calendar` の section の**間**に挿入:

```html
            <section class="tab-panel" id="tab-panel-recently-closed" role="tabpanel" aria-labelledby="tab-recently-closed" hidden></section>
```

- [ ] **Step 3: `src/scripts/newtab.ts` に組み込み**

1. import 追加（`HistoryPanel` の import の近く、Biome の並び順に注意）:

```typescript
import { RecentlyClosedPanel } from '../components/RecentlyClosedPanel/index.js';
```

2. グローバル変数（`let _calendarHistoryPanel: CalendarHistoryPanel;` の隣）:

```typescript
let _recentlyClosedPanel: RecentlyClosedPanel;
```

3. パネル初期化（`calendarPanelContainer` の初期化ブロックの後）:

```typescript
  const recentlyClosedPanelContainer = document.querySelector(
    '#tab-panel-recently-closed'
  ) as HTMLElement | null;

  if (recentlyClosedPanelContainer) {
    _recentlyClosedPanel = new RecentlyClosedPanel(recentlyClosedPanelContainer);
  }
```

4. onActivate 登録（`_tabController.onActivate('calendar', ...)` の前後どちらでも可）:

```typescript
  _tabController.onActivate('recently-closed', async () => {
    await _recentlyClosedPanel?.activate();
  });
```

- [ ] **Step 4: `src/manifest.json` の `permissions` に `sessions` を追加**

```json
  "permissions": [
    "bookmarks",
    "history",
    "tabGroups",
    "favicon",
    "sessions"
  ],
```

- [ ] **Step 5: ビルドと dist 反映確認**

Run: `npm run build:extension && grep -A7 '"permissions"' dist/manifest.json && grep -c "recently-closed" dist/newtab.html`
Expected: permissions に `sessions` を含む・`dist/newtab.html` に `recently-closed` が2箇所以上。

- [ ] **Step 6: VERIFY**

Run: `npm run lint && npm run format && npm run build && npm run test`
Expected: すべて緑。

- [ ] **Step 7: コミット**

```bash
git add src/newtab.html src/scripts/newtab.ts src/manifest.json
git commit -m "Wire recently-closed tab into UI; add sessions permission"
```

---

### Task 3: docs 更新

**Files:**
- Modify: `docs/external-specification.md`
- Modify: `docs/internal-specification.md`

- [ ] **Step 1: `docs/external-specification.md` を更新**

- タブ構成の記述（ブックマーク/最近の履歴/カレンダー）に「最近閉じたタブ」を**履歴とカレンダーの間**として追記。
- 機能節を追加: 「最近閉じたタブ表示機能 — `chrome.sessions.getRecentlyClosed()` による最大約25件の一覧表示（単体タブのみ・ウィンドウは対象外）。クリックで `chrome.sessions.restore()` により元の位置へ復元し、一覧を再読み込みする。検索フィルタは無し」。
- 権限一覧に `sessions` を追記。

- [ ] **Step 2: `docs/internal-specification.md` を更新**

- コンポーネント一覧・ディレクトリ構造に `RecentlyClosedPanel/` を追記。
- タブ/パネルの記述（TabController・DOMContentLoaded フロー）に recently-closed を追記。
- Chrome API 依存一覧に Sessions API を追記。
- 自分で `grep -n "HistoryPanel\|タブ\|Chrome API" docs/internal-specification.md` して該当箇所を洗い出してから編集する。

- [ ] **Step 3: コミット**

```bash
git add docs/external-specification.md docs/internal-specification.md
git commit -m "Document recently-closed tab feature and sessions permission"
```

---

### Task 4: 完了ゲートとレビュー

**Files:** なし（検証のみ）

- [ ] **Step 1: 完了ゲートを実行**

Run: `npm run lint && npm run format && npm run build && npm run test && npm run test:coverage && npm run build:extension`
Expected: すべて成功。coverage は Statements ≥95% / Branches ≥85% で exit 0。
（不足時は `RecentlyClosedPanel` の未到達分岐に意味のあるテストを追加して回復。）

- [ ] **Step 2: 仕様整合レビュー** — `spec-compliance-reviewer` エージェントで docs と実装の整合を確認。

- [ ] **Step 3: manifest 権限レビュー** — `manifest-permissions-reviewer` エージェントで `sessions` 追加の必要十分性を確認。

- [ ] **Step 4: 人間による動作確認（節目）** — 拡張を再読み込みし、「最近閉じたタブ」タブが表示され、一覧が出て、クリックで復元されることを目視確認。

## Self-Review（作成者チェック済み）

- Spec coverage: HTML/コンポーネント/newtab 組込/manifest/docs/テスト/完了条件 → Task 1〜4 で網羅。
- Placeholder: なし（全ステップに実コード・実コマンド）。
- Type consistency: `RecentlyClosedPanel(container: HTMLElement)` / `activate(): Promise<void>` を Task 2 が使用。テストの `data-session-id` / `.history-item` / 文言はコンポーネント実装と一致。
