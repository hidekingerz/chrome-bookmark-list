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

## Open（未解決 / 次周への申し送り）

- [next] ゴールはカバレッジ向上（DoD: Statements 95% / Branches 85%）。現状（html-utils 後）は
  Statements 80.12% / Branches 65.27%。次に攻める低カバレッジ・ファイル:
  `src/services/ErrorHandler.ts`(0%) → `src/services/FaviconService.ts`(47%) →
  `src/services/BookmarkService.ts`(58%) → `src/scripts/newtab-core.ts`(41%) →
  `src/components/ContextMenu`(branch 52%) → `src/components/UndoManager`(77%) の順が目安。
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
- テストは `test/` 配下にフラットに `機能名.test.ts` で置く（src と同階層ではない）。
- Chrome API は `test/setup.ts` でモック済み。新 API を使う箇所は setup を拡張（既存を壊さない）。
- 毎周の VERIFY = `npm run lint && npm run format && npm run test`。整形漏れは `npm run format:write`。
  （`npm run check` は既存の import 並び順まで赤にするので使わない。）
- 完了ゲート = 上記 + `npm run test:coverage`(95/85 しきい値) + `npm run build:extension` 成功。
- coverage しきい値は `vitest.config.ts` の `coverage.thresholds` に設定済み（触らない）。
