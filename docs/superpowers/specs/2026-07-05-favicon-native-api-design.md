# favicon を Chrome `_favicon` API 方式へ（issue #111）

- 日付: 2026-07-05
- 対象 issue: #111
- ブランチ: `feat/favicon-native-api`

## 背景

#98（Google Favicon API 削除・ホスト名流出防止）と #99（HTML 解析戦略・過剰権限削除）により、
favicon 取得戦略が `/favicon.ico` 直取得のみになった。その結果、直接読めないサイトはデフォルト
アイコンにフォールバックする（動作確認時の実測: `bookmark_favicon_cache` は 総数59 / 実favicon 35 /
デフォルト24）。またリロード時に `<img src=".../favicon.ico">` の描画でネットワーク取得が発生する。

## ゴール

プライバシー（外部通信ゼロ・ホスト名流出なし）を保ったまま favicon の網羅率を上げ、リロード時の
ネットワーク取得も無くす。実装も簡素化する。

## 方針（採用: Approach A — `_favicon` 優先/ローカル）

`FaviconService.getFavicon(url)` を、Chrome の `_favicon` API の URL を返すだけに変更する:

```
chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${size}`)
```

- Chrome がローカルに保持する favicon を返す（外部通信ゼロ）。Chrome が知らないサイトは Chrome の
  デフォルトアイコン（地球儀）を返す（常に何らかの画像を返す）。
- 同期・確定的なので、取得戦略・Image 検証・in-flight 集約・`chrome.storage` キャッシュはすべて不要。
- `size` は表示 16px に対し retina を考慮して **32** を要求する。

### 検討したが不採用の案

- **Approach B（`/favicon.ico` 優先 + `_favicon` フォールバック）**: 実 favicon 網羅は最大だが、
  各サイトへの `/favicon.ico` 通信が残り、リロード時のクエリも残る。実装も複雑。#111 の主目的
  （プライバシー + リロードクエリ解消 + 簡素化）に対して A が優れるため不採用。

### A の既知トレードオフ

- Chrome がローカルに favicon を持たないサイト（未訪問・インポートしたブックマーク等）は、
  Chrome のデフォルト地球儀アイコンになる（`/favicon.ico` は試さない）。ブックマーク管理という
  性質上、対象はほぼ訪問済みで実用上十分と判断。

## 変更内容

### 1. `src/services/FaviconService.ts`（大幅簡素化）

- 撤去: `cache` / `inFlight` / `saveInFlight` / `saveQueued` / `cacheKey` / `cacheExpiryDays`、
  および `initCache` / `getFavicon` の旧ロジック / `fetchAndCache` / `persistCache` /
  `fetchFavicon` / `tryStandardPath` / `validateFaviconUrl` / `isCacheValid` /
  `saveCacheToStorage` / `clearCache` / `getDomain`（未使用化するもの）。
- 残す/新規:
  - `getFavicon(url: string): string` … `chrome.runtime.getURL` で `_favicon` URL を返す。
    `chrome?.runtime?.getURL` が使えない環境（拡張外・テストでモック無し）や例外時は
    `getDefaultFavicon()` にフォールバックする。
  - `getDefaultFavicon()` … 既存の SVG data URL を安全網として残す。
- `src/types/bookmark.ts` の `FaviconCacheData` 型は未使用化するため撤去する（他参照が無いことを
  確認してから）。

### 2. `src/scripts/utils.ts`

- `getFavicon(url)` ラッパは維持（`getFaviconService().getFavicon(url)` を返す）。
- deprecated な `initFaviconCache()` を撤去する（初期化不要になるため）。

### 3. `src/scripts/newtab.ts`

- `await initFaviconCache()`（初期化呼び出し）と関連 import を撤去する。
- `loadFavicons` は現状維持（`img.src` に即時 URL をセットするだけになる）。

### 4. `src/manifest.json`（権限）

- `permissions` に **`"favicon"` を追加**。
- `"storage"` を**撤去**（キャッシュ撤去後、`chrome.storage` の利用は src 全体で FaviconService の
  favicon キャッシュのみ = grep で確認済み。favicon 撤去で未使用化するため）。
- 結果: `["bookmarks", "history", "tabGroups", "favicon"]`。host 権限は追加しない（#99 の方針維持）。

### 5. docs

- `docs/external-specification.md` §5: favicon 記述を「Chrome の `_favicon` API（ローカル取得・
  外部通信なし）」へ更新。「外部APIサービスを使用せず、ホスト名の流出を防止」は維持（真のまま）。
- `docs/internal-specification.md`: favicon キャッシュ機構を説明している箇所があれば、`_favicon`
  方式へ更新する。
- 権限一覧の記述があれば `storage` 削除・`favicon` 追加を反映する。

## テスト

- `test/favicon-service.test.ts` を作り替える:
  - `getFavicon(url)` が `chrome.runtime.getURL` を正しい `pageUrl`（URL エンコード）と `size`
    で呼び、その戻り値を返すこと。
  - `chrome.runtime.getURL` 不在/例外時に `getDefaultFavicon()`（既存 SVG）へフォールバックすること。
- `test/setup.ts` に `chrome.runtime.getURL` のモックを追加する（既存の Chrome API モックを壊さない）。
- 撤去したメソッドのテストは削除する。
- **coverage しきい値（Statements 95% / Branches 85%）を維持**する（`vitest.config.ts` の
  thresholds gate で担保）。

## 検証（完了条件）

- `npm run lint && npm run format && npm run build && npm run test` が緑。
- `npm run test:coverage` が exit 0（95/85 維持）。
- `npm run build:extension` 成功。
- docs/ 仕様と整合（spec-compliance-reviewer）。
- manifest 権限の整合（manifest-permissions-reviewer）: `favicon` 追加・`storage` 撤去が実装と一致。

## スコープ外

- Approach B（`/favicon.ico` 併用）。
- favicon サイズのユーザー設定化。
- 履歴パネル等、favicon 表示側 UI の変更（`getFavicon` の戻り値を使うだけで変更不要）。
