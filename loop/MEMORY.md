# MEMORY — ループの記憶（背骨）

> エージェントは毎周このファイルを読み、末尾に追記する。会話履歴ではなく**このファイルが記憶**。
> 人間が消さない限り、後の周でも過去の試行を踏まえて動ける。
>
> オペレータ（人間）は、方向修正したいとき Open の**最上部に `[operator/...]` 注記**を差し込む。
> エージェントはそれを最優先の現状認識として扱う。

## Done（達成済み）

- [html-utils] `test/html-utils.test.ts` を新規追加し `src/utils/HtmlUtils.ts` を
  15% → **100% Stmts / 92.3% Branch** に。全 static メソッド（escapeHtml / getDomain /
  createSafeHtml 成功・例外 / toggleVisibility 両分岐 / addEventListenerSafely null・成功・例外 /
  addEventListenerToAll 一致あり・なし / getDataAttribute null・値・空文字・欠落 / truncateText /
  isValidUrl）を実 assert で検証。全体は Stmts 78.77→80.12% / Branch 64.26→65.27%。VERIFY 緑。
  落とし穴は下記 Notes の「setup.ts が global document をスタブ上書き」を参照。

- [error-handler] `test/error-handler.test.ts` を新規追加し `src/services/ErrorHandler.ts` を
  0% → **87.5% Stmts / 85.71% Branch / 100% Funcs** に。`handleBookmarkOperation`(汎用/
  見つかりません/permissions/権限/network/fetch の全メッセージ分岐) / `handleFaviconError`
  (warn のみ・通知しない) / `handleGenericError`(context あり/なし) / `debug` `startTimer`
  `endTimer`(NODE_ENV=development とそれ以外の両分岐) を実 assert で検証。alert は
  `vi.stubGlobal`、console は `vi.spyOn` でモック。全体 Stmts 80.12→80.96% / Branch
  65.27→66.77%。VERIFY 緑。71-74 行は到達不可（下記 Open 参照）。

- [favicon-service] `test/favicon-service.test.ts` を新規追加し `src/services/FaviconService.ts`
  を 47% から大幅向上。`initCache`(storage欠如/有効キャッシュ読込/期限切れ再保存/get例外)、
  `getFavicon`(標準パス成功・不正URL→localhostフォールバック・キャッシュヒット・内部例外→
  デフォルト)、フォールバック戦略(標準失敗→HTML解析成功・相対href絶対化2種・権限無→Google・
  全戦略タイムアウト→デフォルト)、`clearCache`(storage有/無)、`saveCacheToStorage` storage欠如を
  実 assert で検証。16 ケース全 pass。全体 Stmts 80.96→82.71% / Branch 66.77→68.28%。VERIFY 緑。
  落とし穴は下記 Notes の「Image モック差し替え」を参照。

## Open（未解決 / 次周への申し送り）

- [next] ゴールはカバレッジ向上（DoD: Statements 95% / Branches 85%）。現状（favicon-service 後）は
  Statements 82.71% / Branches 68.28%。次に攻める低カバレッジ・ファイル:
  `src/services/BookmarkService.ts`(58%) → `src/scripts/newtab-core.ts`(41%) →
  `src/components/ContextMenu`(branch 52%) → `src/components/UndoManager`(77%) の順が目安。
- [error-handler/dead-branch] `ErrorHandler.ts` の 71-74 行（private `showNotification` の
  'warning'/'info' 分岐）は未到達のまま。`handleBookmarkOperation`/`handleGenericError` が
  常に 'error' を渡すため、src の挙動を変えずには到達できない（dead branch）。水増しせず放置。
- [next] 1周 = 1テストファイル追加（or 1モジュールのカバレッジ向上）。`npm run test:coverage` の
  "Uncovered Line #s" を見て未到達行を狙い撃つ。

## Notes（学び / 落とし穴）

- ★重要な落とし穴: `test/setup.ts` は `globalThis.document` を**最小スタブ**で上書きしている
  （`createElement('div')` のみ対応で innerHTML はクォートまでエスケープ。getAttribute / classList /
  style / querySelectorAll / body 等は無い。`window.document` も同じスタブ）。本物の DOM API に
  依存するコードをテストするときは `import { Window } from 'happy-dom'` で `new Window()` を作り、
  `beforeEach` で `globalThis.document = realWindow.document` に差し替え、`afterEach` で復元する
  （vitest はファイル単位で隔離されるため他ファイルに影響しない）。setup.ts は触らない（既存モック
  を壊さない）。実 DOM の innerHTML は `& < >` のみエスケープしクォートはしない点に注意。
- ★Image モック差し替え: `test/setup.ts` の `Image` モックは常に `onload` を発火するため、
  FaviconService の戦略分岐（標準パス失敗→HTML→Google）や `validateFaviconUrl` のタイムアウトを
  検証できない。テスト内で `vi.stubGlobal('Image', StubImage)` し、`src` セッタで src 値に応じて
  `onload`/`onerror` を切替えるスタブ（module 変数 `imageLoadPredicate` で制御）に差し替える。
  タイムアウト分岐は `imageNeverResolves=true` + `vi.useFakeTimers()` +
  `vi.advanceTimersByTimeAsync(2500)`（標準パス+Google の 2 回分 1000ms）で到達。
  `chrome.permissions` は setup 未定義なので必要なテストで一時付与し afterEach で除去。
  `fetch` は `vi.stubGlobal` でモック。`vi.unstubAllGlobals()` で復元。
- テストは `test/` 配下にフラットに `機能名.test.ts` で置く（src と同階層ではない）。
- Chrome API は `test/setup.ts` でモック済み。新 API を使う箇所は setup を拡張（既存を壊さない）。
- 毎周の VERIFY = `npm run lint && npm run format && npm run test`。整形漏れは `npm run format:write`。
  （`npm run check` は既存の import 並び順まで赤にするので使わない。）
- 完了ゲート = 上記 + `npm run test:coverage`(95/85 しきい値) + `npm run build:extension` 成功。
- coverage しきい値は `vitest.config.ts` の `coverage.thresholds` に設定済み（触らない）。
