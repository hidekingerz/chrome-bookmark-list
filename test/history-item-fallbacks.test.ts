import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarHistoryPanel } from '../src/components/CalendarHistoryPanel/index';
import { RecentlyClosedPanel } from '../src/components/RecentlyClosedPanel/index';
import { getRecentHistory } from '../src/scripts/history';

/**
 * Chrome が返す履歴・セッションの項目に、id / url / title が欠けていたり、
 * ホスト名を取り出せない URL が入っていたりする場合の表示。
 *
 * chrome.* はモックし、確かめるのは関数の戻り値と、パネルが描画した DOM。
 */
describe('項目の欠けた履歴・最近閉じたタブの扱い', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let historySearch: ReturnType<typeof vi.fn>;
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    win = new Window({ url: 'chrome-extension://test-id/newtab.html' });
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.window = win as unknown as typeof globalThis.window;

    // test/setup.ts の chrome モックには history が無いので、このファイルで足す
    historySearch = vi.fn().mockResolvedValue([]);
    (chrome as any).history = { search: historySearch };

    container = document.createElement('section');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (chrome as any).history;
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  describe('getRecentHistory', () => {
    it('id も url も title も無い項目は、それぞれ空文字と 0 に揃えて返す', async () => {
      historySearch.mockResolvedValue([{ lastVisitTime: 1_700_000_000_000 }]);

      const items = await getRecentHistory();

      expect(items).toEqual([
        {
          id: '',
          url: '',
          title: '',
          lastVisitTime: 1_700_000_000_000,
          visitCount: 0,
          typedCount: 0,
        },
      ]);
    });

    it('id が無く url がある項目は、url を id と title の代わりに使う', async () => {
      historySearch.mockResolvedValue([
        { url: 'https://example.com/', lastVisitTime: 5, visitCount: 2 },
      ]);

      const items = await getRecentHistory();

      expect(items).toEqual([
        {
          id: 'https://example.com/',
          url: 'https://example.com/',
          title: 'https://example.com/',
          lastVisitTime: 5,
          visitCount: 2,
          typedCount: 0,
        },
      ]);
    });
  });

  describe('最近閉じたタブ', () => {
    it('URL として解釈できない文字列のタブは、ドメインの代わりにその文字列をそのまま表示する', async () => {
      (
        chrome.sessions.getRecentlyClosed as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { tab: { sessionId: 's1', title: 'メモ', url: '壊れた URL' } },
      ]);

      const panel = new RecentlyClosedPanel(container);
      await panel.activate();

      const rows = Array.from(container.querySelectorAll('.history-item'));
      expect(rows).toHaveLength(1);
      expect(rows[0].getAttribute('data-session-id')).toBe('s1');
      expect(
        rows[0].querySelector('.history-item-title')?.textContent?.trim()
      ).toBe('メモ');
      expect(
        rows[0].querySelector('.history-item-url')?.textContent?.trim()
      ).toBe('壊れた URL');
      expect(container.textContent).not.toContain('読み込みに失敗しました');
    });
  });

  describe('カレンダーのタイムライン', () => {
    /** 2026-03-15 を「今日」に固定し、その日の 10 時台の時刻を返す。 */
    function fixToday(): number {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
      return new Date(2026, 2, 15, 10, 15, 30).getTime();
    }

    async function openDay(dateKey: string): Promise<void> {
      const panel = new CalendarHistoryPanel(container);
      await panel.activate();
      const day = container.querySelector(
        `.calendar-day[data-date="${dateKey}"]`
      ) as HTMLElement;
      day.dispatchEvent(
        new win.MouseEvent('click', {
          bubbles: true,
          cancelable: true,
        }) as unknown as Event
      );
    }

    it('url も title も無い履歴は、空のタイトルと空のリンク先で 1 行として表示する', async () => {
      const visitedAt = fixToday();
      historySearch.mockResolvedValue([{ lastVisitTime: visitedAt }]);

      await openDay('2026-03-15');

      const rows = Array.from(container.querySelectorAll('.history-item'));
      expect(rows).toHaveLength(1);
      const title = rows[0].querySelector('.history-item-title');
      expect(title?.textContent).toBe('');
      expect(title?.getAttribute('data-url')).toBe('');
      expect(rows[0].querySelector('.history-item-url')?.textContent).toBe('');
      expect(container.querySelector('.timeline-hour-count')?.textContent).toBe(
        '1件'
      );
    });

    it('title が無く url がある履歴は、url をタイトルとして表示する', async () => {
      const visitedAt = fixToday();
      historySearch.mockResolvedValue([
        { url: 'https://example.com/page', lastVisitTime: visitedAt },
      ]);

      await openDay('2026-03-15');

      const title = container.querySelector('.history-item-title');
      expect(title?.textContent).toBe('https://example.com/page');
      expect(title?.getAttribute('data-url')).toBe('https://example.com/page');
    });

    it('ホスト名の無い URL (file://) は、ドメイン別の集計で favicon の取得先を空にする', async () => {
      const visitedAt = fixToday();
      historySearch.mockResolvedValue([
        {
          id: '1',
          url: 'file:///Users/me/notes.html',
          title: 'メモ',
          lastVisitTime: visitedAt,
        },
      ]);

      await openDay('2026-03-15');

      const stats = Array.from(container.querySelectorAll('.domain-stat'));
      expect(stats).toHaveLength(1);
      expect(stats[0].querySelector('.domain-name')?.textContent).toBe('');
      expect(stats[0].querySelector('.domain-count')?.textContent).toBe('1');
      expect(
        stats[0]
          .querySelector('.domain-favicon')
          ?.getAttribute('data-favicon-url')
      ).toBe('');
    });

    it('ホスト名のある URL は、ドメイン別の集計で https://<ホスト名> を favicon の取得先にする', async () => {
      const visitedAt = fixToday();
      historySearch.mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com/page',
          title: 'Example',
          lastVisitTime: visitedAt,
        },
      ]);

      await openDay('2026-03-15');

      const stat = container.querySelector('.domain-stat');
      expect(stat?.querySelector('.domain-name')?.textContent).toBe(
        'example.com'
      );
      expect(
        stat?.querySelector('.domain-favicon')?.getAttribute('data-favicon-url')
      ).toBe('https://example.com');
    });
  });
});
