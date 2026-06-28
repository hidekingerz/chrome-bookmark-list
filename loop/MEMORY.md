# MEMORY — ループの記憶（背骨）

> エージェントは毎周このファイルを読み、末尾に追記する。会話履歴ではなく**このファイルが記憶**。
> 人間が消さない限り、後の周でも過去の試行を踏まえて動ける。
>
> オペレータ（人間）は、方向修正したいとき Open の**最上部に `[operator/...]` 注記**を差し込む。
> エージェントはそれを最優先の現状認識として扱う。

## Done（達成済み）

<!-- 例:
- [task-x] 〜を実装。〜の理由でこう設計した。落とし穴: 〜。VERIFY グリーン。
-->

## Open（未解決 / 次周への申し送り）

- [next] ゴールはカバレッジ向上（DoD: Statements 95% / Branches 85%）。ベースラインは
  Statements 78.77% / Branches 64.26%。伸びしろの大きい低カバレッジ・ファイルから攻める:
  `src/utils/HtmlUtils.ts`(15%) → `src/services/ErrorHandler.ts`(0%) →
  `src/services/FaviconService.ts`(47%) → `src/services/BookmarkService.ts`(58%) →
  `src/scripts/newtab-core.ts`(41%) → `src/components/ContextMenu`(branch 52%) →
  `src/components/UndoManager`(77%) の順が目安。
- [next] 1周 = 1テストファイル追加（or 1モジュールのカバレッジ向上）。`npm run test:coverage` の
  "Uncovered Line #s" を見て未到達行を狙い撃つ。

## Notes（学び / 落とし穴）

- テストは `test/` 配下にフラットに `機能名.test.ts` で置く（src と同階層ではない）。
- Chrome API は `test/setup.ts` でモック済み。新 API を使う箇所は setup を拡張（既存を壊さない）。
- 毎周の VERIFY = `npm run lint && npm run format && npm run test`。整形漏れは `npm run format:write`。
  （`npm run check` は既存の import 並び順まで赤にするので使わない。）
- 完了ゲート = 上記 + `npm run test:coverage`(95/85 しきい値) + `npm run build:extension` 成功。
- coverage しきい値は `vitest.config.ts` の `coverage.thresholds` に設定済み（触らない）。
