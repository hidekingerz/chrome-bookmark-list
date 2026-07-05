# favicon を Chrome `_favicon` API 方式へ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** favicon 取得を Chrome の `_favicon` API（ローカル・外部通信ゼロ）に切り替え、キャッシュ機構を撤去して簡素化する（issue #111）。

**Architecture:** `FaviconService.getFavicon(url)` を `chrome.runtime.getURL('/_favicon/?pageUrl=<url>&size=32')` を返すだけの同期メソッドにする。fetch 戦略・Image 検証・`chrome.storage` キャッシュ・in-flight 集約はすべて撤去。manifest は `storage` 権限を撤去し `favicon` 権限を追加。

**Tech Stack:** TypeScript 5 / Chrome 拡張 MV3 / Vitest 4（happy-dom）/ Biome 2 / npm

## Global Constraints

- パッケージ追加・更新をしない。
- 毎周の VERIFY: `npm run lint && npm run format && npm run build && npm run test` を緑に保つ。
- 完了ゲート: `npm run test:coverage`（Statements 95% / Branches 85% を維持）+ `npm run build:extension` 成功。
- Biome 設定: lineWidth 80 / space 2 / single quote / semicolons always。
- テストは `test/` 配下にフラットに配置。`test/setup.ts` の既存 Chrome API モックを壊さない。
- 既存の公開挙動は issue #111 の範囲でのみ変更する。

---

### Task 1: FaviconService を `_favicon` API 方式へ（TDD）

**Files:**
- Modify: `test/setup.ts`（`chrome.runtime.getURL` モック追加）
- Test: `test/favicon-service.test.ts`（全面作り替え）
- Modify: `src/services/FaviconService.ts`（全面簡素化）

**Interfaces:**
- Produces: `FaviconService.getFavicon(url: string): string` … `_favicon` URL 文字列を返す（同期）。`chrome.runtime.getURL` 不在/例外時は `data:image/svg+xml;base64,...`（既存 SVG）を返す。

- [ ] **Step 1: `test/setup.ts` に `chrome.runtime.getURL` モックを追加**

`const mockChrome = { ... }` オブジェクト内（`storage` ブロックの隣など）に以下を追加する:

```typescript
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test-id${path}`),
  },
```

- [ ] **Step 2: `test/favicon-service.test.ts` を新しい内容で全面上書き**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FaviconService } from '../src/services/FaviconService.js';

describe('FaviconService (_favicon API)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('encodes pageUrl and requests size=32 via chrome.runtime.getURL', () => {
    const service = new FaviconService();
    const url = 'https://example.com/path?q=1&a=2';

    const result = service.getFavicon(url);

    const expectedPath = `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
    expect(chrome.runtime.getURL).toHaveBeenCalledWith(expectedPath);
    expect(result).toBe(`chrome-extension://test-id${expectedPath}`);
  });

  it('returns a distinct URL per page URL', () => {
    const service = new FaviconService();
    const a = service.getFavicon('https://a.example/');
    const b = service.getFavicon('https://b.example/');
    expect(a).not.toBe(b);
  });

  it('falls back to the default SVG when chrome.runtime is unavailable', () => {
    const service = new FaviconService();
    const original = globalThis.chrome.runtime;
    // @ts-expect-error 実行時に runtime 不在の環境を再現
    globalThis.chrome.runtime = undefined;

    const result = service.getFavicon('https://example.com');

    expect(result.startsWith('data:image/svg+xml')).toBe(true);
    globalThis.chrome.runtime = original;
  });

  it('falls back to the default SVG when getURL throws', () => {
    const service = new FaviconService();
    (chrome.runtime.getURL as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => {
        throw new Error('boom');
      }
    );

    const result = service.getFavicon('https://example.com');

    expect(result.startsWith('data:image/svg+xml')).toBe(true);
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `npx vitest run test/favicon-service.test.ts`
Expected: FAIL（現行 `FaviconService` は `getFavicon` が async でキャッシュ/戦略ロジックを持ち、`chrome.runtime.getURL` を呼ばないため）

- [ ] **Step 4: `src/services/FaviconService.ts` を全面上書き**

```typescript
/**
 * Faviconの取得を担当するサービス。
 * Chrome の _favicon API（chrome.runtime.getURL('/_favicon/...')）を用いて
 * ローカル保有の favicon を返す。外部通信・ホスト名流出は発生しない（#98/#111）。
 */
export class FaviconService {
  private readonly size = 32;

  /**
   * ページ URL に対応する favicon の URL を返す。
   * Chrome がローカルに favicon を持っていれば実 favicon、無ければ Chrome の
   * デフォルトアイコンを返す。chrome.runtime が使えない場合は既存の SVG を返す。
   */
  getFavicon(url: string): string {
    try {
      if (chrome?.runtime?.getURL) {
        return chrome.runtime.getURL(
          `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${this.size}`
        );
      }
    } catch {
      // フォールバックへ
    }
    return this.getDefaultFavicon();
  }

  /**
   * デフォルトファビコン（安全網）
   */
  private getDefaultFavicon(): string {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTggMUMxMS44NjYgMSAxNSA0LjEzNCAxNSA4QzE1IDExLjg2NiAxMS44NjYgMTUgOCAxNUM0LjEzNCAxNSAxIDExLjg2NiAxIDhDMSA0LjEzNCA0LjEzNCAxIDggMVoiIGZpbGw9IiM2NjdFRUEiLz4KPHA7dGggZD0iTTUuNSA2SDEwLjVWMTBINS41VjZaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K';
  }
}
```

> 注: `import type { FaviconCacheData }` は削除する（この上書きで import 行ごと消える）。

- [ ] **Step 5: テストを実行して成功を確認**

Run: `npx vitest run test/favicon-service.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 6: lint/format/build を確認**

Run: `npm run lint && npm run format && npm run build`
Expected: すべて成功。整形漏れがあれば `npm run format:write` で修正。

- [ ] **Step 7: コミット**

```bash
git add test/setup.ts test/favicon-service.test.ts src/services/FaviconService.ts
git commit -m "Switch FaviconService to Chrome _favicon API (#111)"
```

---

### Task 2: favicon キャッシュ初期化の呼び出しを撤去

**Files:**
- Modify: `src/scripts/utils.ts`（`initFaviconCache` 撤去）
- Modify: `src/scripts/newtab.ts`（import と呼び出し撤去）

**Interfaces:**
- Consumes: `FaviconService.getFavicon`（Task 1）。
- Produces: `getFavicon(url)` ラッパ（`utils.ts`）は維持（`async` シグネチャのまま `getFaviconService().getFavicon(url)` を返す）。`initFaviconCache` は存在しなくなる。

- [ ] **Step 1: `src/scripts/utils.ts` から `initFaviconCache` を削除**

以下の関数定義（deprecated）を丸ごと削除する:

```typescript
/**
 * @deprecated FaviconService.initCache() を使用してください
 */
export async function initFaviconCache(): Promise<void> {
  await getFaviconService().initCache();
}
```

`getFavicon` ラッパ（その下）は**そのまま残す**:

```typescript
/**
 * @deprecated FaviconService.getFavicon() を使用してください
 */
export async function getFavicon(url: string): Promise<string> {
  return getFaviconService().getFavicon(url);
}
```

- [ ] **Step 2: `src/scripts/newtab.ts` の import から `initFaviconCache` を削除**

`./utils.js` の import 文（`applyExpandedState, filterBookmarks, getFavicon, initFaviconCache, processBookmarkTree`）から `initFaviconCache,` の行を削除する。

- [ ] **Step 3: `src/scripts/newtab.ts` の初期化呼び出しを削除**

以下の2行（コメント + 呼び出し）を削除する:

```typescript
  // Favicon キャッシュの初期化
  await initFaviconCache();
```

- [ ] **Step 4: build と全テストを実行**

Run: `npm run build && npm run test`
Expected: PASS（`initFaviconCache` への未解決参照が無い・全テスト緑）

- [ ] **Step 5: コミット**

```bash
git add src/scripts/utils.ts src/scripts/newtab.ts
git commit -m "Remove favicon cache initialization (#111)"
```

---

### Task 3: `FaviconCacheData` 型の撤去と manifest 権限の更新

**Files:**
- Modify: `src/types/bookmark.ts`（`FaviconCacheData` 削除）
- Modify: `src/types/index.ts`（re-export 削除）
- Modify: `src/manifest.json`（`storage` 撤去・`favicon` 追加）

**Interfaces:**
- Consumes: Task 1 で `FaviconCacheData` の唯一の利用者（FaviconService）が消えていること。

- [ ] **Step 1: `src/types/bookmark.ts` から `FaviconCacheData` を削除**

以下の interface 定義（と直上の JSDoc）を丸ごと削除する:

```typescript
/**
 * Faviconキャッシュのデータ型
 */
export interface FaviconCacheData {
  /** ドメインとファビコンURLのマップ */
  data: Record<string, string>;
  /** キャッシュのタイムスタンプ */
  timestamp: number;
}
```

- [ ] **Step 2: `src/types/index.ts` の re-export から `FaviconCacheData` を削除**

`export type { ... }` のリストから `FaviconCacheData,` の行を削除する。

- [ ] **Step 3: `src/manifest.json` の `permissions` を更新**

`permissions` 配列を次のように変更する（`storage` を削除、`favicon` を追加）:

```json
  "permissions": [
    "bookmarks",
    "history",
    "tabGroups",
    "favicon"
  ],
```

- [ ] **Step 4: build と全テストを実行**

Run: `npm run build && npm run test`
Expected: PASS（`FaviconCacheData` への未解決参照が無い・全テスト緑）

- [ ] **Step 5: manifest が dist へ反映されることを確認**

Run: `npm run build:extension && grep -A6 '"permissions"' dist/manifest.json`
Expected: `favicon` を含み `storage` を含まない permissions が出力される。

- [ ] **Step 6: コミット**

```bash
git add src/types/bookmark.ts src/types/index.ts src/manifest.json
git commit -m "Drop FaviconCacheData type; add favicon, remove storage permission (#111)"
```

---

### Task 4: docs を `_favicon` 方式へ更新

**Files:**
- Modify: `docs/external-specification.md`
- Modify: `docs/internal-specification.md`

- [ ] **Step 1: `docs/external-specification.md` の favicon 記述を更新**

§5「Favicon表示機能」の「標準パス（/favicon.ico等）による検出」を、次の趣旨に書き換える:

> - Chrome の `_favicon` API（`chrome.runtime.getURL('/_favicon/...')`）によるローカル取得

「外部APIサービスを使用せず、ホスト名の流出を防止」の行は**そのまま維持**する（真のまま）。
権限一覧の記述があれば `storage` を削除し `favicon` を追加する。

- [ ] **Step 2: `docs/internal-specification.md` の favicon 記述を更新**

favicon キャッシュ機構（`chrome.storage.local` / 取得戦略 / 有効期限）を説明している箇所があれば、
「Chrome の `_favicon` API を用いた同期取得（キャッシュは Chrome 内部が担当・拡張側キャッシュ無し）」
へ更新する。該当記述が無ければ変更不要。

- [ ] **Step 3: コミット**

```bash
git add docs/external-specification.md docs/internal-specification.md
git commit -m "Update specs for _favicon API favicon strategy (#111)"
```

---

### Task 5: 完了ゲートとレビュー

**Files:** なし（検証のみ）

- [ ] **Step 1: 完了ゲートを実行**

Run: `npm run lint && npm run format && npm run build && npm run test && npm run test:coverage && npm run build:extension`
Expected: すべて成功。`test:coverage` は Statements 95% / Branches 85% を満たし exit 0。
（もし coverage がしきい値を下回ったら、`FaviconService` の新規挙動に対する不足テストを Task 1 の
テストファイルに追加してから再実行する。）

- [ ] **Step 2: 仕様整合レビュー**

`spec-compliance-reviewer` エージェントを起動し、変更が `docs/` の internal/external 仕様を満たすか
確認する。指摘があれば対応する。

- [ ] **Step 3: manifest 権限レビュー**

`manifest-permissions-reviewer` エージェントを起動し、`favicon` 追加・`storage` 撤去が実装（`_favicon`
API 使用・`chrome.storage` 不使用）と整合し、過剰/不足が無いか確認する。指摘があれば対応する。

- [ ] **Step 4: 人間による動作確認（節目）**

拡張を再読み込みし、New Tab で favicon が表示されること・DevTools Network に外部 favicon 取得
リクエストが出ないこと（`chrome-extension://.../_favicon/...` のみ）を目視確認する。

## Self-Review（作成者チェック済み）

- Spec coverage: 設計書の各節（FaviconService 簡素化 / utils・newtab / 型・manifest / docs / テスト /
  完了条件）に対応する Task 1〜5 がある。
- Placeholder: なし（各ステップに実コード・実コマンドを記載）。
- Type consistency: `getFavicon(url: string): string`（Task 1 定義）を Task 2 のラッパが利用。
  `FaviconCacheData` は Task 1 で利用者が消えた後に Task 3 で型定義を撤去する順序で整合。
