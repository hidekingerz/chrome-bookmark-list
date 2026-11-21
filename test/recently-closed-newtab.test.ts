// 別のページを表示していたタブを New Tab ページへ移してから閉じると、Chrome は
// `chrome://newtab/` として記録する。自拡張の New Tab ページとして一覧から除外されることを確かめる。
import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecentlyClosedPanel } from '../src/components/RecentlyClosedPanel/index.js';

describe('最近閉じたタブ: chrome://newtab/ の除外', () => {
  let dom: Window;
  let originalDocument: typeof globalThis.document;
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    dom = new Window();
    originalDocument = globalThis.document;
    globalThis.document = dom.document as unknown as typeof globalThis.document;
    container = dom.document.createElement('div') as unknown as HTMLElement;
    dom.document.body.appendChild(container as unknown as Node);
  });

  afterEach(() => {
    globalThis.document = originalDocument;
  });

  it('chrome://newtab/ として記録されたタブは一覧に出ない', async () => {
    (
      chrome.sessions.getRecentlyClosed as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        tab: { sessionId: 's1', title: '新しいタブ', url: 'chrome://newtab/' },
      },
      { tab: { sessionId: 's2', title: 'Kept', url: 'https://kept.example/' } },
    ]);

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    const items = Array.from(container.querySelectorAll('.history-item'));
    expect(items.map((el) => el.getAttribute('data-session-id'))).toEqual([
      's2',
    ]);
  });
});
