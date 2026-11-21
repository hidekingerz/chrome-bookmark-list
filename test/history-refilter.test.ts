// 検索語を入れたままタブを切り替えて戻る（TabController が activate() を再実行する）と、
// 検索バーの文字と一覧の内容が一致していることを確かめる。
import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('最近の履歴: 検索語を残したままタブを開き直す', () => {
  let dom: JSDOM;

  beforeEach(() => {
    vi.resetModules();
    dom = new JSDOM(
      '<!DOCTYPE html><html><body><section id="tab-panel-history"></section></body></html>',
      { url: 'http://localhost', pretendToBeVisual: true }
    );
    for (const key of ['document', 'window', 'HTMLElement', 'Event'] as const) {
      Object.defineProperty(globalThis, key, {
        value: (dom.window as unknown as Record<string, unknown>)[key],
        writable: true,
        configurable: true,
      });
    }
    const now = Date.now();
    (globalThis as unknown as { chrome: unknown }).chrome = {
      tabs: { create: vi.fn() },
      runtime: { id: 'x', getURL: (p: string) => `chrome-extension://x${p}` },
      history: {
        search: vi.fn().mockResolvedValue([
          {
            id: '1',
            url: 'https://github.com/',
            title: 'GitHub',
            lastVisitTime: now,
            visitCount: 3,
          },
          {
            id: '2',
            url: 'https://example.com/',
            title: 'Example',
            lastVisitTime: now - 1000,
            visitCount: 1,
          },
        ]),
      },
    };
  });

  it('再度 activate() した後も、検索バーに残っている語で一覧が絞り込まれている', async () => {
    const { HistoryPanel } = await import(
      '../src/components/HistoryPanel/HistoryPanel'
    );
    const container = dom.window.document.getElementById(
      'tab-panel-history'
    ) as HTMLElement;
    const panel = new HistoryPanel(container);
    await panel.activate();

    const input = container.querySelector(
      '.history-search-input'
    ) as HTMLInputElement;
    input.value = 'GITHUB';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    const titles = () =>
      Array.from(container.querySelectorAll('.history-item-title')).map(
        (el) => el.textContent
      );
    // 大文字小文字を区別しない検索
    expect(titles()).toEqual(['GitHub']);

    // 他のタブへ移って戻る = TabController.activate('history') → HistoryPanel.activate()
    await panel.activate();

    expect({ searchBox: input.value, list: titles() }).toEqual({
      searchBox: 'GITHUB',
      list: ['GitHub'],
    });
  });
});
