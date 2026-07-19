import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecentlyClosedPanel } from '../src/components/RecentlyClosedPanel/index.js';

/** microtask/timer を flush する（クリック後の非同期 restore→再読込を待つ） */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('RecentlyClosedPanel', () => {
  let dom: Window;
  let originalDocument: typeof globalThis.document;
  let container: HTMLElement;

  const getRecentlyClosed = () =>
    chrome.sessions.getRecentlyClosed as unknown as ReturnType<typeof vi.fn>;
  const restore = () =>
    chrome.sessions.restore as unknown as ReturnType<typeof vi.fn>;

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

  it('タブエントリを一覧描画する（sessionId 属性つき）', async () => {
    getRecentlyClosed().mockResolvedValue([
      {
        tab: { sessionId: 's1', title: 'Example', url: 'https://example.com/' },
      },
      {
        tab: { sessionId: 's2', title: 'Other', url: 'https://other.example/' },
      },
    ]);

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    const items = container.querySelectorAll('.history-item');
    expect(items.length).toBe(2);
    expect(items[0].getAttribute('data-session-id')).toBe('s1');
    expect(container.textContent).toContain('Example');
    expect(container.textContent).toContain('other.example');
  });

  it('window エントリと sessionId/url 欠落タブを除外する', async () => {
    getRecentlyClosed().mockResolvedValue([
      { window: { sessionId: 'w1', tabs: [] } },
      { tab: { sessionId: 's1', title: 'Kept', url: 'https://kept.example/' } },
      { tab: { title: 'No sessionId', url: 'https://no-id.example/' } },
    ]);

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    const items = container.querySelectorAll('.history-item');
    expect(items.length).toBe(1);
    expect(items[0].getAttribute('data-session-id')).toBe('s1');
  });

  it('自拡張の New Tab ページを除外する', async () => {
    getRecentlyClosed().mockResolvedValue([
      {
        tab: {
          sessionId: 's1',
          title: 'Bookmarks',
          url: 'chrome-extension://test-id/newtab.html',
        },
      },
      { tab: { sessionId: 's2', title: 'Kept', url: 'https://kept.example/' } },
    ]);

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    const items = container.querySelectorAll('.history-item');
    expect(items.length).toBe(1);
    expect(items[0].getAttribute('data-session-id')).toBe('s2');
  });

  it('同一 URL は最新のみ表示する（dedupe）', async () => {
    getRecentlyClosed().mockResolvedValue([
      {
        tab: { sessionId: 's1', title: 'Newest', url: 'https://dup.example/' },
      },
      { tab: { sessionId: 's2', title: 'Older', url: 'https://dup.example/' } },
      {
        tab: { sessionId: 's3', title: 'Other', url: 'https://other.example/' },
      },
    ]);

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    const items = container.querySelectorAll('.history-item');
    expect(items.length).toBe(2);
    expect(items[0].getAttribute('data-session-id')).toBe('s1');
    expect(items[1].getAttribute('data-session-id')).toBe('s3');
  });

  it('閉じた時刻（lastModified）をメタ行に表示する', async () => {
    getRecentlyClosed().mockResolvedValue([
      {
        lastModified: 1752989400, // epoch 秒
        tab: { sessionId: 's1', title: 'Timed', url: 'https://t.example/' },
      },
    ]);

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    const date = container.querySelector('.history-item-date');
    expect(date).not.toBeNull();
    expect(date?.textContent?.trim()).not.toBe('');
  });

  it('0件時に空メッセージを表示する', async () => {
    getRecentlyClosed().mockResolvedValue([]);

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    expect(container.textContent).toContain('最近閉じたタブはありません');
  });

  it('行クリックで restore が呼ばれ一覧を再読み込みする', async () => {
    getRecentlyClosed()
      .mockResolvedValueOnce([
        {
          tab: {
            sessionId: 's1',
            title: 'Restore me',
            url: 'https://r.example/',
          },
        },
      ])
      .mockResolvedValueOnce([]);
    restore().mockResolvedValue(undefined);

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    const item = container.querySelector(
      '.history-item[data-session-id="s1"]'
    ) as HTMLElement;
    expect(item).not.toBeNull();
    item.click();
    await flush();

    expect(restore()).toHaveBeenCalledWith('s1');
    expect(getRecentlyClosed()).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('最近閉じたタブはありません');
  });

  it('getRecentlyClosed 失敗時にエラーメッセージを表示する', async () => {
    getRecentlyClosed().mockRejectedValue(new Error('boom'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const panel = new RecentlyClosedPanel(container);
    await panel.activate();

    expect(container.textContent).toContain(
      '最近閉じたタブの読み込みに失敗しました'
    );
    consoleError.mockRestore();
  });
});
