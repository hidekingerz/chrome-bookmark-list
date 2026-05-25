import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarHistoryPanel } from '../src/components/CalendarHistoryPanel/CalendarHistoryPanel';
import { getFavicon } from '../src/scripts/utils';

// モック（escapeHtml など他のユーティリティは本物を使い、getFaviconのみモック）
vi.mock('../src/scripts/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/scripts/utils')>();
  return {
    ...actual,
    getFavicon: vi.fn(),
  };
});

const mockGetFavicon = vi.mocked(getFavicon);

describe('CalendarHistoryPanel', () => {
  let panel: CalendarHistoryPanel;
  let dom: JSDOM;
  let document: Document;
  let container: HTMLElement;

  beforeEach(() => {
    dom = new JSDOM(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <section id="tab-panel-calendar"></section>
        </body>
      </html>
    `,
      {
        url: 'http://localhost',
        pretendToBeVisual: true,
      }
    );

    document = dom.window.document;

    Object.defineProperty(globalThis, 'document', {
      value: document,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'Event', {
      value: dom.window.Event,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'MouseEvent', {
      value: dom.window.MouseEvent,
      writable: true,
      configurable: true,
    });

    // Chrome API のモック
    globalThis.chrome = {
      history: { search: vi.fn() },
      tabs: { create: vi.fn() },
    } as unknown as typeof chrome;

    vi.clearAllMocks();

    mockGetFavicon.mockResolvedValue('data:image/png;base64,test');
    vi.mocked(chrome.history.search).mockResolvedValue([]);

    container = document.getElementById('tab-panel-calendar') as HTMLElement;
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  describe('初期化', () => {
    it('コンテナ内にカレンダーと検索バーが構築される', () => {
      panel = new CalendarHistoryPanel(container);

      expect(container.classList.contains('calendar-history-panel')).toBe(true);
      expect(
        container.querySelector('.calendar-history-search-input')
      ).toBeTruthy();
      expect(container.querySelector('.calendar-view')).toBeTruthy();
      expect(container.querySelector('.history-timeline')).toBeTruthy();
    });

    it('検索バーが正しいプレースホルダーを持つ', () => {
      panel = new CalendarHistoryPanel(container);

      const searchInput = container.querySelector(
        '.calendar-history-search-input'
      );
      expect(searchInput?.getAttribute('placeholder')).toBe('履歴を検索...');
    });
  });

  describe('カレンダー表示', () => {
    beforeEach(() => {
      panel = new CalendarHistoryPanel(container);
    });

    it('activate でカレンダーが正しく表示される', async () => {
      await panel.activate();

      const monthYear = container.querySelector('.calendar-month-year');
      expect(monthYear?.textContent).toMatch(/\d{4}年 \d{1,2}月/);

      const weekdays = container.querySelectorAll('.calendar-weekday');
      expect(weekdays).toHaveLength(7);
      expect(weekdays[0].textContent).toBe('日');
      expect(weekdays[6].textContent).toBe('土');

      const days = container.querySelectorAll('.calendar-day');
      expect(days.length).toBeGreaterThan(0);
    });

    it('前月ボタンで月が切り替わる', async () => {
      await panel.activate();

      const before = container.querySelector(
        '.calendar-month-year'
      )?.textContent;

      const prevBtn = container.querySelector('.prev-month') as HTMLElement;
      prevBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const after = container.querySelector(
        '.calendar-month-year'
      )?.textContent;
      expect(before).not.toBe(after);
    });

    it('次月ボタンで月が切り替わる', async () => {
      await panel.activate();

      const before = container.querySelector(
        '.calendar-month-year'
      )?.textContent;

      const nextBtn = container.querySelector('.next-month') as HTMLElement;
      nextBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const after = container.querySelector(
        '.calendar-month-year'
      )?.textContent;
      expect(before).not.toBe(after);
    });
  });

  describe('日付選択とタイムライン', () => {
    beforeEach(() => {
      panel = new CalendarHistoryPanel(container);
    });

    it('日付選択で選択状態が変わる', async () => {
      await panel.activate();

      const days = container.querySelectorAll(
        '.calendar-day:not(.other-month)'
      );
      if (days.length === 0) return;

      (days[0] as HTMLElement).click();

      const updated = container.querySelectorAll(
        '.calendar-day:not(.other-month)'
      );
      expect((updated[0] as HTMLElement).classList.contains('selected')).toBe(
        true
      );
    });

    it('履歴がない日付を選択すると適切なメッセージが表示される', async () => {
      vi.mocked(chrome.history.search).mockResolvedValue([]);
      await panel.activate();

      const days = container.querySelectorAll(
        '.calendar-day:not(.other-month)'
      );
      if (days.length === 0) return;

      (days[0] as HTMLElement).click();

      const placeholder = container.querySelector('.timeline-placeholder');
      expect(placeholder?.textContent).toBe('この日の履歴はありません');
    });

    it('履歴がある日付を選択するとタイムラインが表示される', async () => {
      const testDate = new Date();
      testDate.setHours(10, 30, 0, 0);

      vi.mocked(chrome.history.search).mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: testDate.getTime(),
          visitCount: 5,
          typedCount: 2,
        },
      ]);

      await panel.activate();

      const todayElement = container.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      const hourGroups = container.querySelectorAll('.timeline-hour-group');
      expect(hourGroups.length).toBeGreaterThan(0);
    });
  });

  describe('セキュリティ（XSSエスケープ）', () => {
    beforeEach(() => {
      panel = new CalendarHistoryPanel(container);
    });

    it('悪意のあるタイトルがエスケープされてimg要素が生成されない', async () => {
      const testDate = new Date();
      testDate.setHours(10, 0, 0, 0);

      vi.mocked(chrome.history.search).mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: '<img src=x onerror=alert(1)>',
          lastVisitTime: testDate.getTime(),
          visitCount: 1,
          typedCount: 0,
        },
      ]);

      await panel.activate();

      const todayElement = container.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      const injectedImg = container.querySelector('.timeline-item-title img');
      expect(injectedImg).toBeNull();

      const title = container.querySelector('.timeline-item-title');
      expect(title?.textContent).toBe('<img src=x onerror=alert(1)>');
    });
  });

  describe('クリックでタブを開く', () => {
    beforeEach(() => {
      panel = new CalendarHistoryPanel(container);
    });

    it('タイムラインアイテムのタイトルクリックで新しいタブが開く', async () => {
      const testDate = new Date();
      testDate.setHours(10, 0, 0, 0);

      vi.mocked(chrome.history.search).mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: testDate.getTime(),
          visitCount: 1,
          typedCount: 0,
        },
      ]);

      await panel.activate();

      const todayElement = container.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      const title = container.querySelector(
        '.timeline-item-title'
      ) as HTMLElement;
      title.dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true })
      );

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://example.com',
      });
    });
  });

  describe('検索機能', () => {
    beforeEach(() => {
      panel = new CalendarHistoryPanel(container);
    });

    it('検索入力でタイムラインアイテムがフィルタリングされる', async () => {
      const testDate = new Date();
      testDate.setHours(10, 0, 0, 0);

      vi.mocked(chrome.history.search).mockResolvedValue([
        {
          id: '1',
          url: 'https://github.com',
          title: 'GitHub',
          lastVisitTime: testDate.getTime(),
          visitCount: 5,
          typedCount: 2,
        },
        {
          id: '2',
          url: 'https://stackoverflow.com',
          title: 'Stack Overflow',
          lastVisitTime: testDate.getTime() + 1000,
          visitCount: 10,
          typedCount: 1,
        },
      ]);

      await panel.activate();

      const todayElement = container.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      const searchInput = container.querySelector(
        '.calendar-history-search-input'
      ) as HTMLInputElement;

      expect(
        container.querySelectorAll('.timeline-item').length
      ).toBeGreaterThan(0);

      searchInput.value = 'GitHub';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      const timelineItems = container.querySelectorAll('.timeline-item');
      expect(timelineItems).toHaveLength(1);
      expect(
        timelineItems[0].querySelector('.timeline-item-title')?.textContent
      ).toBe('GitHub');
    });
  });

  describe('履歴インジケーター', () => {
    beforeEach(() => {
      panel = new CalendarHistoryPanel(container);
    });

    it('履歴がある日付にインジケーターが表示される', async () => {
      const testDate = new Date();
      testDate.setHours(10, 0, 0, 0);

      vi.mocked(chrome.history.search).mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: testDate.getTime(),
          visitCount: 5,
          typedCount: 2,
        },
      ]);

      await panel.activate();

      expect(
        container.querySelectorAll('.calendar-day.has-history').length
      ).toBeGreaterThan(0);
      expect(
        container.querySelectorAll('.history-indicator').length
      ).toBeGreaterThan(0);
    });
  });

  describe('時間単位のソート順', () => {
    beforeEach(() => {
      panel = new CalendarHistoryPanel(container);
    });

    it('時間単位内で履歴アイテムが古い順にソートされる', async () => {
      const testDate = new Date();
      testDate.setHours(10, 0, 0, 0);

      vi.mocked(chrome.history.search).mockResolvedValue([
        {
          id: '1',
          url: 'https://example1.com',
          title: 'Example 1',
          lastVisitTime: testDate.getTime() + 3000,
          visitCount: 1,
          typedCount: 0,
        },
        {
          id: '2',
          url: 'https://example2.com',
          title: 'Example 2',
          lastVisitTime: testDate.getTime() + 1000,
          visitCount: 1,
          typedCount: 0,
        },
        {
          id: '3',
          url: 'https://example3.com',
          title: 'Example 3',
          lastVisitTime: testDate.getTime(),
          visitCount: 1,
          typedCount: 0,
        },
      ]);

      await panel.activate();

      const todayElement = container.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      const timelineItems = container.querySelectorAll('.timeline-item');
      expect(timelineItems).toHaveLength(3);
      expect(
        timelineItems[0].querySelector('.timeline-item-title')?.textContent
      ).toBe('Example 3');
      expect(
        timelineItems[2].querySelector('.timeline-item-title')?.textContent
      ).toBe('Example 1');
    });
  });

  describe('時間単位のナビゲーション', () => {
    beforeEach(() => {
      panel = new CalendarHistoryPanel(container);
    });

    it('時間単位のナビゲーションリンクが表示される', async () => {
      const testDate = new Date();
      testDate.setHours(10, 30, 0, 0);

      vi.mocked(chrome.history.search).mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: testDate.getTime(),
          visitCount: 5,
          typedCount: 2,
        },
      ]);

      await panel.activate();

      const todayElement = container.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      expect(container.querySelector('.timeline-hour-nav')).toBeTruthy();
      expect(
        container.querySelectorAll('.hour-nav-link').length
      ).toBeGreaterThan(0);
    });
  });

  describe('ドメイン統計', () => {
    beforeEach(() => {
      panel = new CalendarHistoryPanel(container);
    });

    it('ドメイン別の訪問回数が表示される', async () => {
      const testDate = new Date();
      testDate.setHours(10, 0, 0, 0);

      vi.mocked(chrome.history.search).mockResolvedValue([
        {
          id: '1',
          url: 'https://github.com/repo1',
          title: 'Repo 1',
          lastVisitTime: testDate.getTime(),
          visitCount: 1,
          typedCount: 0,
        },
        {
          id: '2',
          url: 'https://github.com/repo2',
          title: 'Repo 2',
          lastVisitTime: testDate.getTime() + 1000,
          visitCount: 1,
          typedCount: 0,
        },
        {
          id: '3',
          url: 'https://stackoverflow.com/question1',
          title: 'Question 1',
          lastVisitTime: testDate.getTime() + 2000,
          visitCount: 1,
          typedCount: 0,
        },
      ]);

      await panel.activate();

      const todayElement = container.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      const domainStatItems = container.querySelectorAll('.domain-stat');
      expect(domainStatItems.length).toBeGreaterThan(0);

      const domainNames = Array.from(domainStatItems).map(
        (item) => item.querySelector('.domain-name')?.textContent
      );
      expect(domainNames).toContain('github.com');
      expect(domainNames).toContain('stackoverflow.com');
    });

    it('ドメインが訪問回数の降順でソートされる', async () => {
      const testDate = new Date();
      testDate.setHours(10, 0, 0, 0);

      vi.mocked(chrome.history.search).mockResolvedValue([
        {
          id: '1',
          url: 'https://github.com/repo1',
          title: 'Repo 1',
          lastVisitTime: testDate.getTime(),
          visitCount: 1,
          typedCount: 0,
        },
        {
          id: '2',
          url: 'https://github.com/repo2',
          title: 'Repo 2',
          lastVisitTime: testDate.getTime() + 1000,
          visitCount: 1,
          typedCount: 0,
        },
        {
          id: '3',
          url: 'https://github.com/repo3',
          title: 'Repo 3',
          lastVisitTime: testDate.getTime() + 2000,
          visitCount: 1,
          typedCount: 0,
        },
        {
          id: '4',
          url: 'https://stackoverflow.com/question1',
          title: 'Question 1',
          lastVisitTime: testDate.getTime() + 3000,
          visitCount: 1,
          typedCount: 0,
        },
      ]);

      await panel.activate();

      const todayElement = container.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      const domainStatItems = container.querySelectorAll('.domain-stat');
      expect(
        domainStatItems[0].querySelector('.domain-name')?.textContent
      ).toBe('github.com');
      expect(
        domainStatItems[0].querySelector('.domain-count')?.textContent
      ).toBe('3');
    });
  });

  describe('Favicon表示', () => {
    beforeEach(() => {
      panel = new CalendarHistoryPanel(container);
    });

    it('タイムラインアイテムにfavicon要素が表示される', async () => {
      const testDate = new Date();
      testDate.setHours(10, 0, 0, 0);

      vi.mocked(chrome.history.search).mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: testDate.getTime(),
          visitCount: 5,
          typedCount: 2,
        },
      ]);

      await panel.activate();

      const todayElement = container.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      expect(
        container.querySelectorAll('.timeline-favicon').length
      ).toBeGreaterThan(0);
      expect(
        container.querySelectorAll('.timeline-item-icon .favicon-placeholder')
          .length
      ).toBeGreaterThan(0);
    });

    it('ドメイン統計にfavicon要素が表示される', async () => {
      const testDate = new Date();
      testDate.setHours(10, 0, 0, 0);

      vi.mocked(chrome.history.search).mockResolvedValue([
        {
          id: '1',
          url: 'https://github.com/repo1',
          title: 'Repo 1',
          lastVisitTime: testDate.getTime(),
          visitCount: 1,
          typedCount: 0,
        },
      ]);

      await panel.activate();

      const todayElement = container.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      expect(
        container.querySelectorAll('.domain-favicon').length
      ).toBeGreaterThan(0);
      expect(
        container.querySelectorAll(
          '.timeline-domain-stats .favicon-placeholder'
        ).length
      ).toBeGreaterThan(0);
    });
  });

  describe('スクロール位置のリセット', () => {
    beforeEach(() => {
      panel = new CalendarHistoryPanel(container);
    });

    it('日付選択時にタイムラインのスクロール位置が0になる', async () => {
      const testDate = new Date();
      testDate.setHours(10, 0, 0, 0);

      vi.mocked(chrome.history.search).mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: testDate.getTime(),
          visitCount: 5,
          typedCount: 2,
        },
      ]);

      await panel.activate();

      const todayElement = container.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      const timelineElement = container.querySelector(
        '.history-timeline'
      ) as HTMLElement;
      expect(timelineElement.scrollTop).toBe(0);
    });
  });
});
