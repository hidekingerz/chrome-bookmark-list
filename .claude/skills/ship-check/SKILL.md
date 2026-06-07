---
name: ship-check
description: 作業完了前の通しチェック。CLAUDE.md が定める完了条件（テスト通過・lint・format・build:extension 成功・docs 仕様の充足）を一括で検証する。コミットやPR作成の直前に実行する。
disable-model-invocation: true
---

# ship-check

CLAUDE.md に定められた「作業完了の条件」を一括検証するスキル。各ステップを順に実行し、**すべて成功して初めて完了**と判定する。途中で失敗したら、そこで止めて原因を報告する（成功を偽らない）。

## 実行手順

以下を順番に実行し、各コマンドの結果を確認する。

1. **テスト**
   ```bash
   npm test
   ```
   全テストが通ることを確認。失敗があれば内容を報告して停止。

2. **Lint（Biome）**
   ```bash
   npm run lint
   ```
   lint エラーがないことを確認。

3. **Format チェック（Biome）**
   ```bash
   npm run format
   ```
   未フォーマットの差分が出たら `npm run format:write` を案内する。

4. **型チェック**
   ```bash
   npx tsc --noEmit
   ```
   型エラーがないことを確認（CI の type-check ジョブと同等）。

5. **拡張機能ビルド**
   ```bash
   npm run build:extension
   ```
   ビルドが成功し `dist/` が生成されることを確認。CLAUDE.md の必須条件。

6. **docs 仕様の充足確認**
   - 今回の変更が `docs/internal-specification.md` / `docs/external-specification.md` の内容と整合しているか確認する。
   - 仕様変更を伴う場合は docs も更新されているか確認する。
   - 深い照合が必要なら `spec-compliance-reviewer` サブエージェントの利用を提案する。

## 出力

各ステップを ✅ / ❌ で示したチェックリストと、検証に使った実際のコマンド出力を提示する。1つでも ❌ があれば「未完了」とし、修正すべき点を明示する。すべて ✅ なら「完了条件を満たしています」と報告する。

エビデンス（実際のコマンド出力）なしに成功と主張しないこと。
