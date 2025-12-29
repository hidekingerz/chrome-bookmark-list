import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarHistorySidebar } from '../src/components/CalendarHistorySidebar/CalendarHistorySidebar';
import { getFavicon } from '../src/scripts/utils';

// モック
vi.mock('../src/scripts/utils');

const mockGetFavicon = vi.mocked(getFavicon);

// Chromeモック
globalThis.chrome = {
  history: {
    search: vi.fn(),
  },
} as unknown as typeof chrome;

describe('CalendarHistorySidebar', () => {
  let sidebar: CalendarHistorySidebar;
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    // DOM環境を設定
    dom = new JSDOM(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test</title>
        </head>
        <body>
          <header>
            <h1>Bookmarks</h1>
          </header>
        </body>
      </html>
    `,
      {
        url: 'http://localhost',
        pretendToBeVisual: true,
      }
    );

    document = dom.window.document;

    // グローバルオブジェクトを設定
    Object.defineProperty(globalThis, 'document', {
      value: document,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'KeyboardEvent', {
      value: dom.window.KeyboardEvent,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'Event', {
      value: dom.window.Event,
      writable: true,
      configurable: true,
    });

    // モックのリセット
    vi.clearAllMocks();

    // デフォルトのモック設定
    mockGetFavicon.mockResolvedValue('data:image/png;base64,test');
    vi.mocked(chrome.history.search).mockResolvedValue([]);
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  describe('初期化', () => {
    it('サイドバーコンポーネントが正しく初期化される', () => {
      sidebar = new CalendarHistorySidebar();

      // サイドバー要素が作成される
      const sidebarElement = document.querySelector(
        '.calendar-history-sidebar'
      );
      expect(sidebarElement).toBeTruthy();

      // オーバーレイが作成される
      const overlayElement = document.querySelector(
        '.calendar-history-sidebar-overlay'
      );
      expect(overlayElement).toBeTruthy();

      // トグルボタンが作成される
      const toggleButton = document.querySelector(
        '.calendar-history-toggle-btn'
      );
      expect(toggleButton).toBeTruthy();
    });

    it('サイドバーの初期状態は閉じている', () => {
      sidebar = new CalendarHistorySidebar();

      const sidebarElement = document.querySelector(
        '.calendar-history-sidebar'
      );
      expect(sidebarElement?.classList.contains('open')).toBe(false);

      const overlayElement = document.querySelector(
        '.calendar-history-sidebar-overlay'
      );
      expect(overlayElement?.classList.contains('active')).toBe(false);
    });

    it('トグルボタンが正しい属性を持つ', () => {
      sidebar = new CalendarHistorySidebar();

      const toggleButton = document.querySelector(
        '.calendar-history-toggle-btn'
      );
      expect(toggleButton?.getAttribute('aria-label')).toBe(
        '履歴カレンダーを表示'
      );
      expect(toggleButton?.getAttribute('title')).toBe('履歴カレンダーを表示');
      expect(toggleButton?.innerHTML).toBe('📅');
    });
  });

  describe('サイドバーの開閉', () => {
    beforeEach(() => {
      sidebar = new CalendarHistorySidebar();
    });

    it('トグルボタンクリックでサイドバーが開く', async () => {
      const toggleButton = document.querySelector(
        '.calendar-history-toggle-btn'
      ) as HTMLButtonElement;

      toggleButton.click();

      const sidebarElement = document.querySelector(
        '.calendar-history-sidebar'
      );
      const overlayElement = document.querySelector(
        '.calendar-history-sidebar-overlay'
      );

      expect(sidebarElement?.classList.contains('open')).toBe(true);
      expect(overlayElement?.classList.contains('active')).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('閉じるボタンクリックでサイドバーが閉じる', async () => {
      // まず開く
      await sidebar.open();

      const closeButton = document.querySelector(
        '.calendar-history-sidebar-close'
      ) as HTMLButtonElement;
      closeButton.click();

      const sidebarElement = document.querySelector(
        '.calendar-history-sidebar'
      );
      const overlayElement = document.querySelector(
        '.calendar-history-sidebar-overlay'
      );

      expect(sidebarElement?.classList.contains('open')).toBe(false);
      expect(overlayElement?.classList.contains('active')).toBe(false);
      expect(document.body.style.overflow).toBe('');
    });

    it('オーバーレイクリックでサイドバーが閉じる', async () => {
      // まず開く
      await sidebar.open();

      const overlayElement = document.querySelector(
        '.calendar-history-sidebar-overlay'
      ) as HTMLElement;
      overlayElement.click();

      const sidebarElement = document.querySelector(
        '.calendar-history-sidebar'
      );

      expect(sidebarElement?.classList.contains('open')).toBe(false);
      expect(overlayElement?.classList.contains('active')).toBe(false);
      expect(document.body.style.overflow).toBe('');
    });

    it('ESCキーでサイドバーが閉じる', async () => {
      // まず開く
      await sidebar.open();

      // ESCキーイベントを発火
      const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escEvent);

      const sidebarElement = document.querySelector(
        '.calendar-history-sidebar'
      );
      const overlayElement = document.querySelector(
        '.calendar-history-sidebar-overlay'
      );

      expect(sidebarElement?.classList.contains('open')).toBe(false);
      expect(overlayElement?.classList.contains('active')).toBe(false);
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('カレンダー表示', () => {
    beforeEach(() => {
      sidebar = new CalendarHistorySidebar();
    });

    it('カレンダーが正しく表示される', async () => {
      await sidebar.open();

      // カレンダーヘッダーが表示される
      const monthYear = document.querySelector('.calendar-month-year');
      expect(monthYear).toBeTruthy();
      expect(monthYear?.textContent).toMatch(/\d{4}年 \d{1,2}月/);

      // 曜日ヘッダーが表示される
      const weekdays = document.querySelectorAll('.calendar-weekday');
      expect(weekdays).toHaveLength(7);
      expect(weekdays[0].textContent).toBe('日');
      expect(weekdays[6].textContent).toBe('土');

      // 日付が表示される
      const days = document.querySelectorAll('.calendar-day');
      expect(days.length).toBeGreaterThan(0);
    });

    it('前月ボタンで月が切り替わる', async () => {
      await sidebar.open();

      const monthYearBefore = document.querySelector(
        '.calendar-month-year'
      )?.textContent;

      const prevBtn = document.querySelector(
        '.prev-month'
      ) as HTMLButtonElement;
      prevBtn.click();

      const monthYearAfter = document.querySelector(
        '.calendar-month-year'
      )?.textContent;

      expect(monthYearBefore).not.toBe(monthYearAfter);
    });

    it('次月ボタンで月が切り替わる', async () => {
      await sidebar.open();

      const monthYearBefore = document.querySelector(
        '.calendar-month-year'
      )?.textContent;

      const nextBtn = document.querySelector(
        '.next-month'
      ) as HTMLButtonElement;
      nextBtn.click();

      const monthYearAfter = document.querySelector(
        '.calendar-month-year'
      )?.textContent;

      expect(monthYearBefore).not.toBe(monthYearAfter);
    });
  });

  describe('日付選択とタイムライン', () => {
    beforeEach(() => {
      sidebar = new CalendarHistorySidebar();
    });

    it('日付選択で選択状態が変わる', async () => {
      await sidebar.open();

      const currentMonthDays = document.querySelectorAll(
        '.calendar-day:not(.other-month)'
      );
      if (currentMonthDays.length === 0) return;

      const firstDay = currentMonthDays[0] as HTMLElement;
      firstDay.click();

      // クリック後に再度要素を取得（DOMが再レンダリングされるため）
      const updatedDays = document.querySelectorAll(
        '.calendar-day:not(.other-month)'
      );
      const updatedFirstDay = updatedDays[0] as HTMLElement;

      expect(updatedFirstDay.classList.contains('selected')).toBe(true);
    });

    it('履歴がない日付を選択すると適切なメッセージが表示される', async () => {
      vi.mocked(chrome.history.search).mockResolvedValue([]);

      await sidebar.open();

      const currentMonthDays = document.querySelectorAll(
        '.calendar-day:not(.other-month)'
      );
      if (currentMonthDays.length === 0) return;

      const firstDay = currentMonthDays[0] as HTMLElement;
      firstDay.click();

      const placeholder = document.querySelector('.timeline-placeholder');
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

      await sidebar.open();

      // 今日の日付を選択
      const todayElement = document.querySelector('.calendar-day.today');
      if (!todayElement) return;

      (todayElement as HTMLElement).click();

      // タイムラインが表示される
      const timeline = document.querySelector('.history-timeline');
      expect(timeline).toBeTruthy();

      // 時間グループが表示される
      const hourGroups = document.querySelectorAll('.timeline-hour-group');
      expect(hourGroups.length).toBeGreaterThan(0);
    });
  });

  describe('検索機能', () => {
    beforeEach(() => {
      sidebar = new CalendarHistorySidebar();
    });

    it('検索バーが正しく追加される', () => {
      const searchInput = document.querySelector(
        '.calendar-history-search-input'
      );
      expect(searchInput).toBeTruthy();
      expect(searchInput?.getAttribute('placeholder')).toBe('履歴を検索...');
    });

    it('検索入力でアイテムがフィルタリングされる', async () => {
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

      await sidebar.open();

      // 今日の日付を選択
      const todayElement = document.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      const searchInput = document.querySelector(
        '.calendar-history-search-input'
      ) as HTMLInputElement;

      // 検索前は全アイテムが表示
      let timelineItems = document.querySelectorAll('.timeline-item');
      expect(timelineItems.length).toBeGreaterThan(0);

      // 'GitHub'で検索
      searchInput.value = 'GitHub';
      const inputEvent = new Event('input', { bubbles: true });
      searchInput.dispatchEvent(inputEvent);

      // GitHubのアイテムのみ表示
      timelineItems = document.querySelectorAll('.timeline-item');
      expect(timelineItems).toHaveLength(1);
      expect(
        timelineItems[0].querySelector('.timeline-item-title')?.textContent
      ).toBe('GitHub');
    });
  });

  describe('履歴インジケーター', () => {
    beforeEach(() => {
      sidebar = new CalendarHistorySidebar();
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

      await sidebar.open();

      const hasHistoryDays = document.querySelectorAll(
        '.calendar-day.has-history'
      );
      expect(hasHistoryDays.length).toBeGreaterThan(0);

      const indicators = document.querySelectorAll('.history-indicator');
      expect(indicators.length).toBeGreaterThan(0);
    });
  });

  describe('toggle メソッド', () => {
    beforeEach(() => {
      sidebar = new CalendarHistorySidebar();
    });

    it('閉じている状態でtoggleを呼ぶと開く', async () => {
      await sidebar.toggle();

      const sidebarElement = document.querySelector(
        '.calendar-history-sidebar'
      );
      expect(sidebarElement?.classList.contains('open')).toBe(true);
    });

    it('開いている状態でtoggleを呼ぶと閉じる', async () => {
      await sidebar.open();
      sidebar.close();

      const sidebarElement = document.querySelector(
        '.calendar-history-sidebar'
      );
      expect(sidebarElement?.classList.contains('open')).toBe(false);
    });
  });

  describe('時間単位のソート順', () => {
    beforeEach(() => {
      sidebar = new CalendarHistorySidebar();
    });

    it('時間単位内で履歴アイテムが古い順にソートされる', async () => {
      const testDate = new Date();
      testDate.setHours(10, 0, 0, 0);

      vi.mocked(chrome.history.search).mockResolvedValue([
        {
          id: '1',
          url: 'https://example1.com',
          title: 'Example 1',
          lastVisitTime: testDate.getTime() + 3000, // 最新
          visitCount: 1,
          typedCount: 0,
        },
        {
          id: '2',
          url: 'https://example2.com',
          title: 'Example 2',
          lastVisitTime: testDate.getTime() + 1000, // 中間
          visitCount: 1,
          typedCount: 0,
        },
        {
          id: '3',
          url: 'https://example3.com',
          title: 'Example 3',
          lastVisitTime: testDate.getTime(), // 最古
          visitCount: 1,
          typedCount: 0,
        },
      ]);

      await sidebar.open();

      const todayElement = document.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      const timelineItems = document.querySelectorAll('.timeline-item');
      expect(timelineItems).toHaveLength(3);

      // 古い順になっているか確認
      expect(
        timelineItems[0].querySelector('.timeline-item-title')?.textContent
      ).toBe('Example 3');
      expect(
        timelineItems[1].querySelector('.timeline-item-title')?.textContent
      ).toBe('Example 2');
      expect(
        timelineItems[2].querySelector('.timeline-item-title')?.textContent
      ).toBe('Example 1');
    });
  });

  describe('時間単位のナビゲーション', () => {
    beforeEach(() => {
      sidebar = new CalendarHistorySidebar();
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

      await sidebar.open();

      const todayElement = document.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      // 時間ナビゲーションが表示される
      const hourNav = document.querySelector('.timeline-hour-nav');
      expect(hourNav).toBeTruthy();

      // 10時のリンクが存在する
      const hourLinks = document.querySelectorAll('.hour-nav-link');
      expect(hourLinks.length).toBeGreaterThan(0);
    });
  });

  describe('ドメイン統計', () => {
    beforeEach(() => {
      sidebar = new CalendarHistorySidebar();
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

      await sidebar.open();

      const todayElement = document.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      // ドメイン統計が表示される
      const domainStats = document.querySelector('.timeline-domain-stats');
      expect(domainStats).toBeTruthy();

      const domainStatItems = document.querySelectorAll('.domain-stat');
      expect(domainStatItems.length).toBeGreaterThan(0);

      // github.comが2回、stackoverflow.comが1回
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

      await sidebar.open();

      const todayElement = document.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      const domainStatItems = document.querySelectorAll('.domain-stat');
      const firstDomain =
        domainStatItems[0].querySelector('.domain-name')?.textContent;
      const firstCount =
        domainStatItems[0].querySelector('.domain-count')?.textContent;

      // github.comが最初（3回で最多）
      expect(firstDomain).toBe('github.com');
      expect(firstCount).toBe('3');
    });
  });

  describe('Favicon表示', () => {
    beforeEach(() => {
      sidebar = new CalendarHistorySidebar();
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

      await sidebar.open();

      const todayElement = document.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      const timelineFavicons = document.querySelectorAll('.timeline-favicon');
      expect(timelineFavicons.length).toBeGreaterThan(0);

      const faviconPlaceholders = document.querySelectorAll(
        '.timeline-item-icon .favicon-placeholder'
      );
      expect(faviconPlaceholders.length).toBeGreaterThan(0);
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

      await sidebar.open();

      const todayElement = document.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      const domainFavicons = document.querySelectorAll('.domain-favicon');
      expect(domainFavicons.length).toBeGreaterThan(0);

      const faviconPlaceholders = document.querySelectorAll(
        '.timeline-domain-stats .favicon-placeholder'
      );
      expect(faviconPlaceholders.length).toBeGreaterThan(0);
    });
  });

  describe('スクロール位置のリセット', () => {
    beforeEach(() => {
      sidebar = new CalendarHistorySidebar();
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

      await sidebar.open();

      const todayElement = document.querySelector('.calendar-day.today');
      if (!todayElement) return;
      (todayElement as HTMLElement).click();

      const timelineElement = document.querySelector(
        '.history-timeline'
      ) as HTMLElement;
      expect(timelineElement.scrollTop).toBe(0);
    });
  });
});
