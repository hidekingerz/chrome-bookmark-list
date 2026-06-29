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

- [undo-manager] `test/undo-manager.test.ts` に 4 ケース追加し
  `src/components/UndoManager/index.ts` を 76.74% Stmts / 65.51% Branch →
  **93.02% Stmts / 82.75% Branch / 100% Lines / 100% Funcs** に。追加検証: (1)`triggerUndo()`の
  フォールバック経路 — register 後に `Toast.dismissCurrent()` だけ呼ぶと `currentUndo` は
  UndoManager に残り、`Toast.triggerCurrentAction()`が false を返すため src 80-83 行
  (currentUndo を直接実行 → return true)が走る（実行後 hasUndo()=false も検証）。
  (2)`isEditableElement`の INPUT 分岐(106)と contentEditable 分岐(109)。落とし穴: UndoManager は
  シングルトンで `initialize()` はハンドラを一度しか束縛しないため、最初に initialize した
  テストの document にのみ束縛される（既存「入力欄」テストは古い document に束縛されたハンドラの
  ため空振りでパスしていた）。新規 describe の beforeEach で
  `(UndoManager as unknown as {instance}).instance = null` してシングルトンをリセットし、現在の
  document にハンドラを束縛してから検証。対照テスト(tabindex 付き通常要素で Cmd+Z→undo 実行)を
  置き、ハンドラが現 document で生きていることを担保した上で INPUT/contentEditable で抑止される
  ことを検証。jsdom はネイティブ isContentEditable=false なので `Object.defineProperty`で true を
  明示。全体 Stmts 85.25→85.53% / Branch 70.62→71.04%。VERIFY 緑。

- [bookmark-editor] `test/bookmark-editor.test.ts` を新規追加し
  `src/components/BookmarkActions/BookmarkEditor.ts` を 79.77% Stmts / 59.61% Branch →
  **98.87% Stmts / 84.61% Branch / 100% Lines / 94.11% Funcs** に。既存 `bookmark-edit.test.ts` は
  newtab-core 経由でダイアログ表示までしか通っていなかったため、`BookmarkEditor` クラスを直接 import
  して未到達パスを補完: 成功保存（タイトル+URL 変更 & フォルダ移動）→ update/move 実行
  (266-276 行)・Undo 登録 → 捕捉した undo コールバックを実行して元値へ復元(229-244 行)、変更無し保存
  (update/move/register 呼ばず)、入力要素欠落で早期 return(186 行: edit-url を remove)、既存ダイアログ
  置換(78 行: 2 回開く)、ESC キーで close(158-160 行)、search 例外で alert+console.error(42-43 行)を実
  assert で検証。7 ケース全 pass。落とし穴: dispatchBookmarksChanged の `new CustomEvent` と ESC の
  `new KeyboardEvent` は src がグローバル参照するため、JSDOM document にリスナーを張ると
  **別レルムの happy-dom Event では発火しない**。`globalThis.CustomEvent`/`KeyboardEvent` を
  `dom.window.*` に差し替えて解消。UndoManager はシングルトンなので
  `vi.spyOn(UndoManager.getInstance(),'register')` で登録コールバックを捕捉。全体 Stmts 85.53→86.2% /
  Branch 71.04→72.13%。VERIFY 緑。

- [folder-dnd] `test/folder-drag-and-drop.test.ts` を新規追加し `BookmarkDragAndDrop/index.ts` の
  フォルダ DnD ブロック(#54, 712-1081 行)を補完。検証: `handleFolderDragStart`(正常→draggedFolder
  セット+dragging/dragging-folder/drag-source-folder クラス+setData、data-folder-id 無し→723 早期
  return)、`handleFolderDragOver` の 3 ゾーン(detectFolderDropZone: before/into/after を rect 高さ
  100 固定+clientY で制御)→ 各クラス付与、`isInvalidFolderDropTarget`(自分自身への into)と
  `isInvalidFolderReorder`(隣接 before no-op)→ drop-target-invalid+dropEffect none、`handleFolderDrop`
  (into→moveFolder→Undo Toast→Undo で元親 root/index 0 へ復元、after→reorderFolder newIndex=idx+1、
  before→reorderFolder→Undo、invalid→move 呼ばず)、`moveFolder`/`reorderFolder` の例外
  (get 空配列→対象不在 throw、target に parentId 無し→throw)→ handleFolderDrop の catch で
  console.error+alert。13 ケース全 pass。DragAndDrop ディレクトリ 82.97/72.9→**84.91/74.5**。全体
  Stmts 86.2→86.56% / Branch 72.13→72.46%。VERIFY 緑。落とし穴: JSDOM の getBoundingClientRect は
  全 0 を返すため zone 判定に rect スタブ必須。alert は globalThis に vi.fn() を defineProperty。
  chrome.bookmarks.get は id→{parentId,index} を返す mockImplementation で制御。

- [folder-events] `test/folder-events-coverage.test.ts` を新規追加し
  `src/components/BookmarkFolder/BookmarkFolderEvents.ts`(実ファイル名は `BookmarkFolderEvents.ts`。
  VISION のベースライン表記 `FolderEvents.ts` は別名) を 76.54% Stmts / 62.34% Branch →
  **98.14% Stmts / 83.95% Branch / 100% Funcs / 100% Lines** に。既存テスト
  (bookmark-context-menu / bookmark-click-behaviors / a11y-touch) はマウス操作の主要パスのみ通っていた
  ため、未到達を補完: `getSelection()`、クリックでの編集/削除ボタン (handleEditClick/handleDeleteClick)、
  中クリック mousedown の抑制 3 分岐 (button≠1 / リンク外 / リンク上 preventDefault)、auxclick の URL 欠落、
  キーボード (ContextMenu キー / Shift+F10) でのメニュー表示と非メニューキー・対象外要素の return、
  タッチ長押し (単一指→bookmark/folder メニュー・複数指キャンセル・対象外・touchmove 閾値超えキャンセル・
  touchend キャンセル)、ブックマークメニュー全 onSelect (開く=tabs.update / バックグラウンド=create active:false /
  URLコピー=clipboard / 編集 / 削除) と URL 欠落で非表示、clipboard フォールバック (execCommand) と
  writeText 失敗で console.error、フォルダメニュー全 onSelect (折りたたむ/展開 toggle・グループ=openAsGroup・
  新規サブフォルダ=openCreateDialog・リネーム=openRenameDialog・削除=openDeleteDialog) と
  .bookmark-folder 外/未登録 folderId の return、ブックマーククリックの URL 欠落・選択消費・folderId 欠落。
  36 ケース全 pass。副作用のあるダイアログ系は prototype を spyOn。全体 Stmts 86.56→**89.38%** /
  Branch 72.46→**75.89%**。VERIFY 緑。落とし穴は下記 Notes の「タッチ長押しタイマー」を参照。

- [calendar-history] `test/calendar-history-panel.test.ts` に 9 ケース追加し
  `src/components/CalendarHistoryPanel/CalendarHistoryPanel.ts` を 80.32% Stmts / 57.57% Branch →
  **97.13% Stmts / 73.73% Branch / 100% Funcs / 100% Lines** に。既存テストはマウス操作の主要パスのみ
  通っていたため未到達を補完: 日付未選択での検索入力→renderEmptyTimeline(98,293-298)、タイトル外の
  タイムラインクリックで tabs.create 呼ばず(109)、lastVisitTime 欠落アイテムを無視(154)、
  chrome.history.search 失敗で console.error しカレンダーは描画(181)、検索無一致で
  「検索結果が見つかりませんでした」(327-330)、時間ナビリンクのクリックで preventDefault+scrollTop 計算
  (559-581: offsetTop を defineProperty で 100 注入し scrollTop=90 を検証)、loadTimelineFavicons /
  loadDomainFavicons の onload(hidden 解除+placeholder display:none)・onerror(🌐 表示)・getFavicon reject
  時の catch(console.warn+placeholder)。9 ケース全 pass。落とし穴: favicon は renderTimeline が
  await せず発火するため `await new Promise(r=>setTimeout(r,0))` で flush してから img.onload()/onerror() を
  手動呼び出し（JSDOM は src 代入で load を発火しない）。全体 Stmts 89.38→**91.01%** /
  Branch 75.89→**77.23%**。VERIFY 緑。

## Done（達成済み）追記

- [bookmark-selection] `test/bookmark-selection.test.ts` に 21 ケース追加し
  `src/components/BookmarkSelection/BookmarkSelection.ts` を 80.81% Stmts / 64.58% Branch →
  **95.51% Stmts / 82.29% Branch / 95.55% Funcs / 96.95% Lines** に。既存テストはクリック/トグル/
  範囲選択の主要パスと bulkDelete/Move の成功・キャンセルのみ通っていたため未到達を補完:
  selectRange の (1)container 未設定→toggle フォールバック (2)アンカー未確立→単一選択
  (3)アンカーが表示順に不在→単一選択 (4)anchorIdx>targetIdx の逆順範囲選択、clear() の
  blurFocusedBookmarkItem(focus 中リンクを blur)、clearInternal の map 管理外 `.selected` 除去、
  refresh の reapplySelectionToDom(新 DOM へ再適用 / 選択 URL 不在で付与せず)、ESC ハンドラの
  input フォーカス分岐・モーダル(.edit-dialog-overlay)分岐、ツールバー移動/削除/解除ボタン、
  bulkDelete の Undo(create で復元)・空ヒット skip・例外 catch・未選択 no-op、bulkMove の
  Undo(親あり戻す/親 undefined skip)・ダイアログキャンセル・空ヒット skip・例外 catch・未選択
  no-op・タイトル無しフォルダの「(ルート: id)」ラベル、確認ダイアログの Escape クローズ。
  34 ケース全 pass。UndoManager.getInstance().register を spyOn して登録 op を捕捉し undo を
  手動実行。全体 Stmts 91.01→**92.44%** / Branch 77.23→**78.66%**。VERIFY 緑。

- [tab-group-opener] `test/tab-group-opener.test.ts` に 4 ケース追加し
  `src/components/BookmarkActions/TabGroupOpener.ts` を 79.62% Stmts / 71.42% Branch →
  **96.29% Stmts / 85.71% Branch / 100% Lines** に。既存テストは成功パス/空/決定的色/確認ダイアログの
  キャンセル・開くのみ通っていたため未到達を補完: (1)tabGroups API 非対応(59-67 行) — `chrome.tabs.group`
  と `chrome.tabGroups.update` を undefined にして `tabGroupApiAvailable=false` を成立させ、console.warn
  出力＋グループ化スキップ＋個別タブ作成へフォールバックすることを検証。(2)グループ作成失敗(87-88 行) —
  `chrome.tabs.group` を mockRejectedValue にして catch の console.error + alert を検証(alert は
  globalThis に defineProperty で vi.fn 注入)。(3)確認ダイアログの Escape キー(134-136 行) — 21 件で
  ダイアログ表示後 `new dom.window.KeyboardEvent('keydown',{key:'Escape'})` を document に dispatch →
  close(false) でダイアログ消滅＋タブ未作成を検証。4 ケース全 pass。全体 Stmts 92.44→**92.8%** /
  Branch 78.66→**78.82%**。VERIFY 緑。残 77-134 は tabIds 空ガード等の防御 branch。

- [bookmark-deleter] `test/bookmark-delete.test.ts` に 6 ケース追加し
  `src/components/BookmarkActions/BookmarkDeleter.ts` を 84.5% Stmts / 62.5% Branch →
  **100% Stmts / 87.5% Branch / 100% Funcs / 100% Lines** に。既存テスト(newtab-core 経由)は
  cancel/confirm/各エラーパスの主要経路のみ通っていたため、未到達のダイアログ閉じ経路を補完:
  削除確認ダイアログの ×(close)ボタン→closeDialog(false)(140 行)、ESC キー→closeDialog(false)(151-154)、
  開いた状態で再度開くと既存ダイアログ remove で差し替え(82 行)、エラーダイアログの OK ボタン→
  closeDialog(214-215)、ESC→closeDialog(224-227)、エラーダイアログ表示中に再エラーで既存 remove
  差し替え(167 行)。同 describe 内に追加し既存 beforeEach(JSDOM document/CustomEvent 差し替え)を流用、
  ESC は `new dom.window.KeyboardEvent('keydown',{key:'Escape'})` を document に dispatch、差し替え系は
  `querySelectorAll('#delete-dialog').length===1` で 1 つだけを検証。6 ケース全 pass。全体
  Stmts 92.8→**93.24%** / Branch 78.82→**79.16%**。VERIFY 緑。残 151,224 は ESC 判定 if の Escape 以外
  キーの false 側 branch（本質的でないため放置可）。

## Done（達成済み）追記2

- [bookmark-reorder-dnd] `test/bookmark-reorder-dnd.test.ts` を新規追加し
  `src/components/BookmarkDragAndDrop/index.ts` を 84.14% Stmts / 73.64% Branch →
  **94.4% Stmts / 82% Branch / 97.82% Funcs / 97.71% Lines** に。既存テスト
  (bookmark-multi-drag / drag-preview / folder-drag-and-drop) はフォルダ DnD と複数選択移動の
  主要パスのみ通っていたため、ブックマーク(非フォルダ)reorder(#80)と単一/一括移動の未到達を補完:
  handleDragStart のガード(リンク外要素・title 欠落・dataTransfer 無し→setCustomDragImage 早期 return)、
  handleBookmarkReorderOver(上半分 before/下半分 after・自分自身 invalid・隣接 no-op before/after
  invalid・data-bookmark-url 欠落 return)、handleDragLeave の bookmark-item 分岐、
  handleBookmarkReorderDrop+reorderBookmark(A→C after の move・同 URL drop で no-op・Undo の現在位置
  前方なら+1 補正・get 失敗時フォールバック・source 不在で alert・target 親欠落で alert・source
  parentId 無しで Undo 登録せず)、handleDrop のガード(ヘッダ/アイテム外 drop・元と同フォルダ drop)、
  moveSingleBookmark(不在で alert・parentId 無しで Undo 登録せず)、moveMultipleBookmarks(一部 URL 空
  ヒット skip・Undo の previousParentId 無し skip・move 失敗で alert)、makeBookmarksDraggable、
  destroy(dropIndicator 除去)。26 ケース全 pass。zone 判定は対象 item の getBoundingClientRect を
  top0/height100 にスタブし clientY 10/90 で制御。Undo は UndoManager.getInstance().register を spyOn
  して op を捕捉し手動実行。全体 Stmts 93.24→**94.99%** / Branch 79.16→**80.83%**。VERIFY 緑。
  残 615-668 等は単一/一括 move の undo 内 dispatchEvent や reorder undo の一部分岐。

## Done（達成済み）追記3

- [keyboard-shortcuts] `test/keyboard-shortcuts.test.ts` に 11 ケース追加し
  `src/components/KeyboardShortcuts/index.ts` を 85.93% Stmts / 70% Branch →
  **90.62% Stmts / 81.81% Branch / 100% Funcs / 99.13% Lines** に。既存テストは主要パス
  (矢印/Enter/Delete/F2/Cmd+F/?/入力欄抑制)のみ通っていたため未到達分岐を補完: Shift+/ でヘルプ表示
  (handleKeydown 87 行の `||` 第2項)、Cmd+Shift+F は検索発火せず(71 行 `!e.shiftKey` false)、
  `.tab-panel.active` 無しで #searchInput へフォールバック(getActiveSearchInput 252 行)、
  contentEditable 要素フォーカスで抑制(isEditableElement 261-262: `Object.defineProperty`で
  isContentEditable=true 注入)、フォルダヘッダ/ボタン無しブックマーク項目での Delete・F2 は
  defaultPrevented=false(handleDelete 209/213 false → 219、handleEdit 227/229 false → 235)、
  data-url 無しブックマークの Enter で tabs.create 呼ばず(handleEnter 188 false → 192)、ブックマーク
  でもフォルダでもない要素の Enter で何もしない(202)。assert は event.defaultPrevented と
  chrome.tabs.create 呼び出し有無・activeElement・ダイアログ DOM 有無で実検証。11 ケース全 pass。
  **これで Statements が 94.99→95.23% でしきい値 95% を突破**。Branch は 80.83→**81.92%**(目標 85% まで
  あと約 3.1%)。VERIFY 緑。

## Done（達成済み）追記4

- [tab-controller] `test/tab-controller.test.ts` に 4 ケース追加し
  `src/components/TabController/TabController.ts` を 94.87% Stmts / 69.23% Branch →
  **100%（skipFull でテーブルから非表示）** に。既存テストは初期 active 認識・クリック切替・
  activate ハンドラ呼び出しの主要パスのみ通っていたため未到達分岐を補完: (1)存在しないタブIDを
  `activate()` → `if(!this.buttons.has(tab))return`(60 行)の早期 return で activeTab/パネル状態
  維持。(2)`data-tab` 属性無しボタンは `init` の `if(!tab)continue`(26 行)で無視され click しても
  切替わらない(buttons 未登録)。(3)対応パネルが無いタブは `init` の `if(panel)`(31 行)false 側で
  panels 未登録だが activate でボタンのみ active 化。(4)active クラスを持つボタンが無い DOM では
  初期化時 `getActiveTab()` が null(41-46 ループで break せず)。各 it は専用 JSDOM を作り
  `new TabController(localDoc)`(constructor は root 引数を取るためグローバル document 差し替え不要・
  activate/init は root のみ参照)で構築し `localDom.window.close()` で後始末。assert は activeTab・
  classList.active・aria-selected で実検証。4 ケース全 pass。全体 Stmts 95.23→**95.31%** /
  Branch 81.92→**82.25%**(979→983, +4 branch)。VERIFY 緑。

## Done（達成済み）追記5

- [folder-renamer] `test/folder-rename.test.ts` に 8 ケース追加し
  `src/components/BookmarkActions/FolderRenamer.ts` を 86.76% Stmts / 76.19% Branch →
  **97.05% Stmts / 90.47% Branch / 100% Funcs / 100% Lines** に。既存テストは正常系
  (表示/保存/空文字/同名/変更なし/Undo/Enter/ESC)のみ通っていたため未到達分岐を補完:
  (1)対象不在(get→[])で console.error+ダイアログ非表示(16-19 行)、(2)get reject の catch で
  console.error(25-27 行)、(3)parentId 無しフォルダ → getChildren 呼ばず siblings=[] の三項 false 側
  (21 行)+保存成功、(4)update reject の catch で showError「フォルダ名の変更に失敗しました」
  +ダイアログ閉じない(153-156 行)、(5)×ボタン click で closeDialog(84 行)、(6)キャンセルボタン
  click で closeDialog(85 行)、(7)入力欄で Enter 以外キー → handleConfirm 呼ばず(91 行 false)、
  (8)document で Escape 以外キー → ダイアログ閉じない(98 行 false)。8 ケース全 pass。console.error は
  spyOn、beforeEach の mockChrome.bookmarks.get/update を各テストで mockResolved/Rejected 上書き。
  全体 Stmts 95.31→**95.58%** / Branch 82.25→**82.51%**(983→986, +3 branch)。VERIFY 緑。残 116,160 は
  `if(!input)return`/`if(!el)return` の防御ガード false 側(input/errorEl 常存)で dead、放置可。

## Open（未解決 / 次周への申し送り）

- [next] ゴールはカバレッジ向上（DoD: Statements 95% / Branches 85%）。現状（folder-renamer 後）は
  **Statements 95.58%（しきい値クリア済み）/ Branches 82.51%（あと約 2.49%, 約 30 branch）**。残るは
  Branch のみ。次に攻める低 branch ファイル:
  `src/components/HistoryPanel`(90.9/64.28, 残 157-159 = img.onerror ハンドラ本体未到達)・
  `FolderDeleter`(92.3/66.66, 残 17-18,47 = getSubTree→[] 不在 17-18・catch 47。folder-rename と
  同パターンで getSubTree を mockResolved([])/mockRejected すれば到達可)・
  `ShortcutHelp`(97.72/66.66, 残: Esc 以外キーの 124 行 false 側・背景クリックの内側要素=
  e.target≠dialogElement の false 側の 2 分岐は src 非変更で到達可。closeBtn?.optional の null 側は dead)・
  `Toast`(91.52/77.77, 残 69/90/96/103 = getCurrentInstance/hasAction 未呼び出し・activateAction の
  `if(!action)` true 側・onActivate reject の catch 103。各メソッド直接呼び出しで到達可)・
  `FolderRenamer` は完了・`CalendarHistoryPanel`(97.13/73.73, ただし dead-branch 多数注意)の順。
  HistoryPanel は img.onerror を手動発火(favicon success→`favicon.onerror?.()`)すれば 157-159 を拾える
  (既存テストは onload と getFavicon reject のみ)。Branch 85% が遠いので分岐の多い低 branch を優先。
- [bookmark-selection/残] `BookmarkSelection.ts` 残り未到達(`...33,358,495,559`)は container=null 時の
  防御ガード(refreshOrderedUrls 332-333 / findItemByUrl)、reapply の el null 分岐(358)、ダイアログ
  close ハンドラの一部で、src を変えずには到達困難。水増しせず放置。
- [calendar-history/dead-branch] `CalendarHistoryPanel.ts` の防御的早期 return は src を変えずには到達不可:
  `renderCalendar` 195 行(monthYear/days 要素は init で必ず生成)、`renderEmptyTimeline` 296 行・
  `renderTimeline` 305 行・`loadTimelineFavicons` 477 行・`loadDomainFavicons` 520 行・
  `setupHourNavigation` 559 行(いずれも querySelector(All) 結果の null/空ガード、対象要素は常に存在)。
  水増しせず放置（残 branch 73.73% の主因）。
- [folder-events/dead-branch] `BookmarkFolderEvents.ts` の `findFolder`(902-911 行の deepSearch
  フォールバック, 904/906 行)は未到達のまま。`findFolderById`(= BookmarkService.findFolderById)が既に
  subfolders を再帰探索するため、それが null を返したら deepSearch も必ず null。src を変えずには到達不可
  （dead branch）。また `updateExpandIcon` の `if(!expandIcon)return`(768 行)は、サブフォルダ/ブックマーク
  ありフォルダのヘッダは renderer が必ず `.expand-icon` を出すため到達困難。いずれも水増しせず放置。
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
- ★タッチ長押しタイマー: `BookmarkFolderEvents` の長押しは `window.setTimeout` を使う。テストで
  `globalThis.window = dom.window` の場合、vi のフェイクタイマーは dom.window 側に届かない。
  `dom.window.setTimeout`/`clearTimeout` を vi.fn() に差し替え、コールバックを module 変数に退避して
  手動発火 (`pending?.()`) すると、発火/キャンセル両経路を確実に制御できる。TouchEvent は JSDOM に
  あるが `touches` を渡しにくいので `new dom.window.Event('touchstart')` に
  `Object.defineProperty(ev,'touches',{value:[{target,clientX,clientY}]})` で付与する。
  副作用のあるダイアログ系 (FolderCreator/Renamer/Deleter.openXDialog, TabGroupOpener.openAsGroup,
  BookmarkActions.handleEdit/Delete) は `vi.spyOn(Klass.prototype,'method').mockResolvedValue()` で抑止。
- テストは `test/` 配下にフラットに `機能名.test.ts` で置く（src と同階層ではない）。
- Chrome API は `test/setup.ts` でモック済み。新 API を使う箇所は setup を拡張（既存を壊さない）。
- 毎周の VERIFY = `npm run lint && npm run format && npm run test`。整形漏れは `npm run format:write`。
  （`npm run check` は既存の import 並び順まで赤にするので使わない。）
- 完了ゲート = 上記 + `npm run test:coverage`(95/85 しきい値) + `npm run build:extension` 成功。
- coverage しきい値は `vitest.config.ts` の `coverage.thresholds` に設定済み（触らない）。
