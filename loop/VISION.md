# VISION — このループのゴール

> エージェントは毎周これを読み、「完了の定義（DoD）」を満たしたかで停止を判断する。
> 全項目が検証可能でグリーンになるまで `LOOP_DONE` を出力しない。曖昧だとループは終わらない。

## ゴール（1〜2文）

Chrome 拡張（chrome-bookmark-list）の**テストカバレッジを向上**させる。既存の挙動を一切
変えずに（リグレッション無し）、未テストのコードパスへ意味のあるユニット/結合テストを追加し、
プロジェクト全体のカバレッジを目標値まで引き上げる。

## ベースライン（このループ開始時点）

- Statements: 78.77% / Branches: 64.26% / Functions: 83.25% / Lines: 81.71%
- 特にカバレッジが低い（着手優先候補）:
  - `src/utils/HtmlUtils.ts` … 15%
  - `src/services/ErrorHandler.ts` … 0%
  - `src/services/FaviconService.ts` … 47%
  - `src/services/BookmarkService.ts` … 58%
  - `src/scripts/newtab-core.ts` … 41%
  - `src/components/ContextMenu/index.ts` … 78%（branch 52%）
  - `src/components/UndoManager/index.ts` … 77%

## 完了の定義（Definition of Done）— 上から順に進める・検証可能な箇条書きで

> ★最重要: DoD は「**本当に完成した状態**」を書く。本ループは挙動を変えずテストを足すのが目的。

- [ ] `npm run test:coverage` が **Statements ≥ 95% かつ Branches ≥ 85%** を満たす
      （`vitest.config.ts` の coverage thresholds で機械判定。未達なら非0終了）。
- [ ] 追加した各テストが**実際に挙動を検証**している（カバレッジ水増しの空テスト・assert 無し
      テストは不可。`loop/RULES.md` 参照）。
- [ ] 既存の挙動と等価（リグレッション無し）。`src/` の公開挙動・シグネチャを変えていない。
- [ ] docs/ の internal-specification.md / external-specification.md と矛盾しない
      （挙動非変更なので維持されているはず。テストが仕様と食い違う場合は仕様を正とする）。

## 完了ゲート（LOOP_DONE を出してよい条件）

DoD を満たし、かつ次がすべてグリーンであること（このプロジェクトは静的ゲートのみ）:

- [ ] 毎周の VERIFY が緑: `npm run lint && npm run format && npm run test`
      （Biome lint / Biome format チェック / 全テスト pass）
- [ ] `npm run test:coverage` が exit 0（= Statements 95% / Branches 85% しきい値クリア）
- [ ] `npm run build:extension` が成功（CLAUDE.md の作業完了条件）

> ★毎周の VERIFY は速い静的検査（check/build/test）に留め、重いゲート（coverage しきい値・
> build:extension）は**完了判定にのみ**使う。カバレッジは下がらない方向にしか動かないので、
> 途中状態でも毎周の VERIFY は緑にできる。

## スコープ外（やらないこと）

- `src/` の挙動・公開 API のシグネチャ変更（テスタビリティのための最小リファクタは
  `loop/RULES.md` の条件下でのみ可）。
- 無関係なリファクタ・依存追加・設定変更（`vitest.config.ts` の thresholds は設定済み。触らない）。
- UI/スタイル/manifest の変更。
- 既存テストの削除・スキップ・無効化。

## 進行上の注意

- 「テストが緑」≠「完了」。完了ゲート（coverage しきい値 + build:extension）が全緑になって
  初めて `LOOP_DONE`。
- カバレッジが伸び悩む箇所（DOM/Chrome API 依存で happy-dom では再現困難など）は、無理に
  水増しせず Open にその旨を残す。最終的にしきい値へ届かない技術的障壁があれば人間に委ねる。
