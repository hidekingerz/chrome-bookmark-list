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

- [bookmark-service] `test/bookmark-service.test.ts` を新規追加し `src/services/BookmarkService.ts`
  を 58.13% → **98.83% Stmts / 88.67% Branch / 100% Funcs** に。`getBookmarkTree`(成功変換・取得失敗→
  専用エラー)、`processBookmarkTree`(ブックマークバー直下のルート→専用フォルダ先頭追加＋サブフォルダ展開・
  ルート無しは専用フォルダ作らない・Mobile bookmarks 無視＋他フォルダ直接追加・children 無しルート無視・
  title 無し→Untitled)、`findFolderById`(再帰ヒット・不在 null)、`getTotalBookmarks`(再帰合計)、
  `filterBookmarks`(空語そのまま・タイトル一致＋expanded 化・サブフォルダ URL 一致で親含む・不一致除外)、
  `moveBookmark`/`updateBookmark`/`deleteBookmark`(各: 成功・対象不在→throw かつ副作用呼ばず・API 失敗→
  再スロー) を実 assert で検証。23 ケース全 pass。chrome.bookmarks.* は setup の vi.fn() を mockResolved/
  Rejected で制御、console は spyOn でモック。全体 Stmts 82.71→84.1% / Branch 68.28→69.2%。VERIFY 緑。
  落とし穴は下記 Open の dead-branch（95 行）を参照。

- [newtab-core] `test/newtab-core.test.ts` を新規追加し `src/scripts/newtab-core.ts` を
  41.17% → **100%**（scripts ディレクトリ全体 97.43% Stmts / 95.45% Branch）に。未到達だった
  `displayBookmarksTestable`(空フォルダ→no-results メッセージ / 非空→フォルダ・リンク描画 +
  クリックハンドラー経由で chrome.tabs.create 発火) と deprecated 関数
  `updateFolderUI` / `updateBookmarkListUI`(各 console.warn 出力) を実 assert で検証。5 ケース全
  pass。happy-dom の `new Window()` 実 DOM に差し替え（setup.ts の最小スタブでは innerHTML 代入・
  querySelectorAll・addEventListener が機能しないため。html-utils.test.ts と同パターン）。
  全体 Stmts 84.1→84.49% / Branch 69.2→69.37%。VERIFY 緑。

- [context-menu] `test/context-menu.test.ts` に 8 ケース追加し `src/components/ContextMenu/index.ts`
  を 77.57% Stmts / 52% Branch → **95.32% Stmts / 82% Branch / 100% Funcs**（lines 100%）に。
  追加検証: moveFocus（ArrowDown/Up でフォーカス循環・全 disabled は 0 件 return）、scroll で
  close、メニュー外 contextmenu で close、disabled 項目への click イベント直接 dispatch
  （`.click()` は disabled で no-op になるため dispatchEvent 必須）→ onSelect 呼ばず閉じない、
  onSelect の reject を catch して console.error（`setTimeout(0)` でマイクロタスク待ち）、
  画面端超え座標で positionMenu の位置補正（rAF は即時実行スタブ・rect=0 で `x>vw` 成立）、
  icon 付き項目のアイコン描画。全体 Stmts 84.49→85.25% / Branch 69.37→70.62%。VERIFY 緑。

## Open（未解決 / 次周への申し送り）

- [next] ゴールはカバレッジ向上（DoD: Statements 95% / Branches 85%）。現状（context-menu 後）は
  Statements 85.25% / Branches 70.62%。次に攻める低カバレッジ・ファイル:
  `src/components/UndoManager`(76.74% Stmts/65.51% Branch, 未到達 80-83,106,109) →
  `src/components/BookmarkActions/BookmarkEditor.ts`(79.77%) → `src/scripts` の残り
  （history.ts/utils.ts）→ `src/components/HistoryPanel` の順が目安。Branch 85% が遠いので
  分岐の多いファイルを優先。
- [context-menu/dead-branch] `ContextMenu.ts` の早期 return 147,162,168,180,204 行と
  212 行の `active ? : -1` 三項の false 側は src を変えずには到達不可。理由: グローバル
  ハンドラ（mousedown/keydown/contextmenu/scroll）は `close()` 時に同期で removeEventListener
  されるため、ハンドラ実行中は `this.currentMenu` が常に非 null（`if(!this.currentMenu)return`
  は死枝）。147 は data-index を必ず付与するので indexAttr===null も死枝。212 は JSDOM の
  `document.activeElement` が常に body（非 null）で `:-1` 側に入らない。水増しせず放置。
- [bookmark-service/dead-branch] `BookmarkService.ts` の 95 行（private `convertNodeToFolder` の
  `if (!node.children) return null;`）は未到達のまま。convertNodeToFolder は呼び出し側
  (processBookmarkTree 48/77 行) が必ず `child.children` ありを確認してから呼ぶため、src の挙動を
  変えずには到達できない（dead branch）。水増しせず放置。
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
