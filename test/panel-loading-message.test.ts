// 「最近の履歴」と「最近閉じたタブ」のパネルは、データが届くまで「読み込み中...」を表示し、
// 届いたら一覧に置き換えることを確かめる。
import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryPanel } from '../src/components/HistoryPanel/index';
import { RecentlyClosedPanel } from '../src/components/RecentlyClosedPanel/index';

describe('パネルの「読み込み中...」の表示', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    win = new Window({ url: 'chrome-extension://test-id/newtab.html' });
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.window = win as unknown as typeof globalThis.window;

    container = document.createElement('section');
    document.body.appendChild(container);
  });

  afterEach(() => {
    delete (chrome as unknown as { history?: unknown }).history;
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  /** 後から結果を渡せる、まだ終わっていない非同期の読み込み。 */
  function pending<T>(): { promise: Promise<T>; deliver: (value: T) => void } {
    let deliver: (value: T) => void = () => {};
    const promise = new Promise<T>((resolve) => {
      deliver = resolve;
    });
    return { promise, deliver };
  }

  /** パネルの中で、ユーザーに見えている文言（検索欄などの入力要素は文字を持たない）。 */
  function shownText(): string {
    return (container.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  describe('最近の履歴', () => {
    const visited = {
      id: '1',
      url: 'https://visited.example.com/',
      title: 'Visited Page',
      lastVisitTime: Date.UTC(2026, 0, 15, 3, 0, 0),
      visitCount: 2,
    };

    it('開いた直後は「履歴を読み込み中...」を表示する', () => {
      new HistoryPanel(container);

      expect(shownText()).toBe('履歴を読み込み中...');
    });

    it('履歴が届くまで「履歴を読み込み中...」のままで、届いたら一覧に置き換わる', async () => {
      const search = pending<unknown[]>();
      (chrome as unknown as { history: unknown }).history = {
        search: vi.fn(() => search.promise),
      };
      const panel = new HistoryPanel(container);

      const activating = panel.activate();
      await Promise.resolve();
      expect(shownText()).toBe('履歴を読み込み中...');

      search.deliver([visited]);
      await activating;

      expect(shownText()).not.toContain('読み込み中');
      expect(
        Array.from(container.querySelectorAll('.history-item-title')).map(
          (el) => el.textContent?.trim()
        )
      ).toEqual(['Visited Page']);
    });

    it('履歴が 1 件も無ければ、「読み込み中...」は消えて、無い旨の表示になる', async () => {
      (chrome as unknown as { history: unknown }).history = {
        search: vi.fn().mockResolvedValue([]),
      };
      const panel = new HistoryPanel(container);

      await panel.activate();

      expect(shownText()).toBe('履歴が見つかりませんでした');
    });
  });

  describe('最近閉じたタブ', () => {
    const getRecentlyClosed = () =>
      chrome.sessions.getRecentlyClosed as unknown as ReturnType<typeof vi.fn>;
    const closed = {
      tab: {
        sessionId: 's1',
        title: 'Closed Page',
        url: 'https://closed.example.com/',
      },
    };

    it('開いた直後は「最近閉じたタブを読み込み中...」を表示する', () => {
      new RecentlyClosedPanel(container);

      expect(shownText()).toBe('最近閉じたタブを読み込み中...');
    });

    it('一覧が届くまで「最近閉じたタブを読み込み中...」のままで、届いたら一覧に置き換わる', async () => {
      const sessions = pending<unknown[]>();
      getRecentlyClosed().mockReturnValue(sessions.promise);
      const panel = new RecentlyClosedPanel(container);

      const activating = panel.activate();
      await Promise.resolve();
      expect(shownText()).toBe('最近閉じたタブを読み込み中...');

      sessions.deliver([closed]);
      await activating;

      expect(shownText()).not.toContain('読み込み中');
      expect(
        Array.from(container.querySelectorAll('.history-item-title')).map(
          (el) => el.textContent?.trim()
        )
      ).toEqual(['Closed Page']);
    });

    it('閉じたタブが 1 件も無ければ、「読み込み中...」は消えて、無い旨の表示になる', async () => {
      getRecentlyClosed().mockResolvedValue([]);
      const panel = new RecentlyClosedPanel(container);

      await panel.activate();

      expect(shownText()).toBe('最近閉じたタブはありません');
    });
  });
});
