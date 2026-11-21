import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8'
);

interface AxeNode {
  target: string[];
}
interface AxeViolation {
  id: string;
  impact: string;
  nodes: AxeNode[];
}
interface AxeWindow {
  eval(source: string): unknown;
  document: unknown;
  axe?: {
    run(
      context: unknown,
      options: unknown
    ): Promise<{ violations: AxeViolation[] }>;
  };
}

/**
 * テスト用の window（JSDOM）に axe-core を読み込んで実行し、違反を
 * 「ルール名 (impact): セレクタ」の一覧で返す。違反がなければ空の配列。
 *
 * 文字のコントラスト（color-contrast）は、テスト用の DOM では配色を計算できないので
 * 検査しない。コントラストは実ブラウザで確かめる（docs/TESTING_GUIDE.md）。
 */
export async function axeViolations(win: unknown): Promise<string[]> {
  const w = win as AxeWindow;
  if (!w.axe) w.eval(axeSource);
  const results = await (w.axe as NonNullable<AxeWindow['axe']>).run(
    w.document,
    {
      resultTypes: ['violations'],
      rules: { 'color-contrast': { enabled: false } },
    }
  );
  return results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) =>
        `${violation.id} (${violation.impact}): ${node.target.join(' ')}`
    )
  );
}
